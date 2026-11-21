/* Krypto správa – jádro (čistá logika, bez UI). Běží v prohlížeči i v Node (testy). */
(function (root) {
  'use strict';
  const VERSION = '0.4.11';
  const SHELLEY_EPOCH = 208, SHELLEY_START = 1596059091000, EPOCH_MS = 432000000;
  const DAY = 86400000, HOUR = 3600000;
  const STABLE_USD = new Set(['USD', 'USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI', 'TUSD']);
  const EPS = 1e-7;

  /* ---------------- čas ---------------- */
  function epochStart(e) { return SHELLEY_START + (e - SHELLEY_EPOCH) * EPOCH_MS; }
  function lastSunday(y, m) { const d = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, d.getUTCDate() - d.getUTCDay(), 1, 0, 0); }
  function pragueOffset(u) { const y = new Date(u).getUTCFullYear(); return (u >= lastSunday(y, 2) && u < lastSunday(y, 9)) ? 2 * HOUR : HOUR; }
  function fromPrague(y, mo, d, h, mi, s) {
    const naive = Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0);
    let u = naive - HOUR; if (pragueOffset(u) === 2 * HOUR) u = naive - 2 * HOUR; return u;
  }
  function dayKey(ms) { return new Date(ms + pragueOffset(ms)).toISOString().slice(0, 10); }
  function dayToMs(dk) { const [y, m, d] = dk.split('-').map(Number); return fromPrague(y, m, d, 12, 0, 0); }
  function addDays(dk, n) { return new Date(Date.UTC(+dk.slice(0, 4), +dk.slice(5, 7) - 1, +dk.slice(8, 10)) + n * DAY).toISOString().slice(0, 10); }
  function addYears(dk, n) {
    const y = +dk.slice(0, 4) + n, m = +dk.slice(5, 7); let d = +dk.slice(8, 10);
    if (m === 2 && d === 29 && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) d = 28;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  /** den, od kterého je lot osvobozen časovým testem (doba držení > 3 roky) */
  function exemptFrom(lotDay) { return addDays(addYears(lotDay, 3), 1); }
  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / DAY); }

  function parseDate(s, tz) {
    if (s == null) return NaN; s = String(s).trim().replace(/^"|"$/g, '');
    if (!s) return NaN;
    if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s) && /\d{4}-\d{2}-\d{2}/.test(s)) return Date.parse(s.replace(' ', 'T'));
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return tz === 'utc' ? Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : fromPrague(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return tz === 'utc' ? Date.UTC(y, m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : fromPrague(y, +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
    const t = Date.parse(s); return t;
  }

  function parseNum(v) {
    if (v == null) return NaN; let s = String(v).trim().replace(/[\s "]/g, '');
    if (!s) return NaN;
    if (s.includes(',') && s.includes('.')) { s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); }
    else if (s.includes(',')) s = s.replace(',', '.');
    return parseFloat(s);
  }

  /* ---------------- CSV ---------------- */
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const cnt = c => first.split(c).length - 1;
    const delim = [';', ',', '\t'].sort((a, b) => cnt(b) - cnt(a))[0];
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    const header = (rows[0] || []).map(h => h.trim());
    const norm = header.map(normKey);
    const body = rows.slice(1).filter(r => r.some(x => String(x).trim() !== ''));
    const col = (...names) => { for (const n of names) { const k = normKey(n); const i = norm.indexOf(k); if (i >= 0) return i; } return -1; };
    return { delim, header, norm, rows: body, col, get: (r, i) => (i >= 0 && r[i] != null ? String(r[i]).trim() : '') };
  }
  function normKey(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(optional\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

  /* ---------------- importy burz ----------------
     Normalizovaný řádek:
     { source, date(ms), kind: buy|sell|fee|income|withdraw|deposit, ada, net?, quoteCur?, quoteAmt?, feeQuote?, hash?, addr?, orderId?, note }
  */
  const B58RE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
  const isHash = s => /^(0x)?[0-9a-f]{64}$/i.test(s || '') || B58RE.test(s || '');
  const normHash = h => B58RE.test(h) ? h : String(h).toLowerCase();

  function detectFormat(P, fileName) {
    const n = new Set(P.norm);
    const has = (...k) => k.every(x => n.has(x));
    if (has('utc_time', 'operation', 'coin', 'change')) return 'binance';
    if (has('typ', 'castka', 'castka_meny') || has('type', 'amount', 'amount_currency', 'price_currency')) return 'coinmate';
    if (has('uid', 'date', 'symbol', 'action', 'quanty')) return 'anycoin_orders';
    if (has('date', 'type', 'amount', 'currency', 'order_id')) return 'anycoin_tx';
    if (has('symbol', 'datum', 'smer', 'zaplaceno', 'ziskano')) return 'coinbank';
    if (has('symbol', 'datum', 'smer', 'typ', 'mnozstvi')) return 'coinbank_orders';
    if (has('uid', 'date', 'symbol', 'action', 'quantity')) return 'whalebooks';
    if (has('timestamp', 'transaction_type', 'asset', 'quantity_transacted')) return 'coinbase';
    if (has('operation_date', 'currency_ticker', 'operation_type')) return 'ledgerlive';
    if (has('sent_amount', 'received_amount', 'txhash')) return 'eternl';
    if (has('epoch', 'stake', 'pool', 'total_rewards')) return 'rewards_csv';
    return 'unknown';
  }

  function sourceFromName(fileName, fmt) {
    const m = /TRANSACTION-EXPORT_([^_]+)_([^_.]+)/i.exec(fileName || '');
    if (m) { let a = m[1], b = m[2]; if (/^whalebooks$/i.test(a)) a = /^any/i.test(b) ? 'Anycoin' : b; return canonSource(a); }
    return { binance: 'Binance', coinmate: 'Coinmate', anycoin_orders: 'Anycoin', anycoin_tx: 'Anycoin', coinbank: 'CoinBank', coinbase: 'Coinbase' }[fmt] || 'Jiná burza';
  }
  function canonSource(s) {
    const k = String(s).toLowerCase();
    for (const n of ['Binance', 'Coinmate', 'Anycoin', 'CoinBank', 'Coinbase', 'Bybit', 'Kraken']) if (k.startsWith(n.toLowerCase())) return n;
    return s;
  }

  function splitPair(sym) {
    sym = String(sym || '').toUpperCase().trim();
    const p = sym.split(/[\/\-_ ]/).filter(Boolean);
    if (p.length === 2) return { base: p[0], quote: p[1] };
    return { base: sym, quote: '' };
  }

  function importFile(fileName, text, coin) {
    coin = (coin || 'ADA').toUpperCase();
    // Coinbase: před hlavičkou jsou řádky „Transactions“, „User,…“ (příp. úvodní text) – začni od hlavičky
    const hm = /^(?:"?ID"?,)?"?Timestamp"?,"?Transaction Type"?,/m.exec(text);
    if (hm && hm.index > 0) text = text.slice(hm.index);
    const P = parseCSV(text);
    const fmt = detectFormat(P, fileName);
    const out = { fileName, format: fmt, source: sourceFromName(fileName, fmt), events: [], skipped: 0, notes: [] };
    const fn = IMPORTERS[fmt];
    if (!fn) {
      const why = {
        ledgerlive: 'Export z Ledger Live – pohyby peněženky se berou přímo z blockchainu podle adres v Nastavení dané mince, není potřeba.',
        eternl: 'Export z Eternl – on-chain pohyby se berou přímo z blockchainu podle stake adresy, není potřeba.',
        rewards_csv: 'Export odměn – odměny se berou přímo z blockchainu, není potřeba.',
        coinbank_orders: 'CoinBank-Objednávky – použij raději CoinBank-Obchody.csv (skutečně provedené obchody).',
        unknown: 'Neznámý formát. Hlavička: ' + P.header.slice(0, 12).join(' | ')
      }[fmt] || 'Nepodporovaný formát.';
      out.notes.push(why); out.ignored = true; return out;
    }
    fn(P, out, coin); out.coin = coin;
    out.events.forEach((e, i) => { e.source = e.source || out.source; e.file = fileName; e.row = i; });
    return out;
  }

  const IMPORTERS = {
    binance(P, out, COIN) {
      const iT = P.col('utc_time'), iOp = P.col('operation'), iC = P.col('coin'), iCh = P.col('change'), iR = P.col('remark');
      const all = P.rows.map(r => ({ t: parseDate(P.get(r, iT), 'utc'), op: P.get(r, iOp), coin: P.get(r, iC).toUpperCase(), ch: parseNum(P.get(r, iCh)), rem: P.get(r, iR) }));
      const byT = new Map();
      all.forEach(x => { if (!byT.has(x.t)) byT.set(x.t, []); byT.get(x.t).push(x); });
      const kindOf = x => {
        const op = x.op.toLowerCase();
        if (/withdraw/.test(op)) return 'withdraw';
        if (/deposit/.test(op)) return 'deposit';
        if (/fee/.test(op)) return 'fee';
        if (/(subscription|redemption|purchase|transfer between|transfer funds|savings|main and funding|to funding|to spot|isolated|margin transfer|futures transfer)/.test(op) && !/(interest|reward)/.test(op)) return 'internal';
        if (/(interest|reward|distribution|airdrop|commission|cashback|bonus|rebate|mission|referral)/.test(op)) return x.ch > 0 ? 'income' : 'fee';
        if (/(buy|sell|spend|sold|convert|small assets|transaction related|exchange|revenue)/.test(op)) return x.ch > 0 ? 'buy' : 'sell';
        return x.ch > 0 ? 'buy?' : 'sell?';
      };
      for (const x of all) {
        if (x.coin !== COIN || !isFinite(x.ch) || Math.abs(x.ch) < EPS || !isFinite(x.t)) continue;
        let k = kindOf(x);
        if (k === 'internal') { out.skipped++; continue; }
        let note = x.op;
        if (k.endsWith('?')) { k = k.slice(0, -1); note += ' (neznámá operace – odhad podle znaménka)'; }
        const e = { date: x.t, kind: k, ada: Math.abs(x.ch), note };
        if (k === 'withdraw') e.net = e.ada;
        if (k === 'buy' || k === 'sell') {
          // protistrana ve stejném čase (USDT/BUSD/EUR…)
          const grp = byT.get(x.t) || [];
          const sameSide = grp.filter(y => y.coin === COIN && kindOf(y) === k);
          const totAda = sameSide.reduce((s, y) => s + Math.abs(y.ch), 0);
          const cps = grp.filter(y => y.coin !== COIN && (k === 'buy' ? y.ch < 0 : y.ch > 0) && !/fee/i.test(y.op));
          const curs = [...new Set(cps.map(y => y.coin))];
          if (curs.length === 1 && (STABLE_USD.has(curs[0]) || curs[0] === 'EUR' || curs[0] === 'CZK')) {
            const q = cps.reduce((s, y) => s + Math.abs(y.ch), 0);
            e.quoteCur = curs[0]; e.quoteAmt = q * (e.ada / totAda);
          } else if (curs.length) e.note += ' za ' + curs.join('+');
        }
        out.events.push(e);
      }
    },

    coinmate(P, out, COIN) {
      const c = {
        d: P.col('datum', 'date'), t: P.col('typ', 'type'), a: P.col('castka', 'amount'), ac: P.col('castka_meny', 'amount_currency'),
        p: P.col('cena', 'price'), pc: P.col('cena_meny', 'price_currency'), f: P.col('poplatek', 'fee'), fc: P.col('poplatek_meny', 'fee_currency'),
        tot: P.col('celkem', 'total'), tc: P.col('celkem_meny', 'total_currency'), desc: P.col('popisek', 'description'), st: P.col('status')
      };
      for (const r of P.rows) {
        const g = i => P.get(r, i);
        if (/(cancel|fail|reject)/i.test(g(c.st))) { out.skipped++; continue; }
        if (g(c.ac).toUpperCase() !== COIN) continue;
        const typ = g(c.t).toUpperCase(), amt = Math.abs(parseNum(g(c.a))), price = parseNum(g(c.p)), pcur = g(c.pc).toUpperCase();
        const fee = parseNum(g(c.f)), fcur = g(c.fc).toUpperCase();
        const date = parseDate(g(c.d), 'prague');
        if (!isFinite(amt) || amt < EPS || !isFinite(date)) { out.skipped++; continue; }
        if (/BUY/.test(typ) || /SELL/.test(typ)) {
          const e = { date, kind: /BUY/.test(typ) ? 'buy' : 'sell', ada: amt, note: typ };
          if (isFinite(price) && pcur) { e.quoteCur = pcur; e.quoteAmt = amt * price; }
          if (isFinite(fee) && fee > 0) { if (fcur === pcur) e.feeQuote = fee; else if (fcur === COIN) out.events.push({ date, kind: 'fee', ada: fee, note: 'poplatek ' + typ }); }
          out.events.push(e);
        } else if (/WITHDRAW/.test(typ)) {
          const fa = (isFinite(fee) && fcur === COIN) ? fee : 0;
          out.events.push({ date, kind: 'withdraw', ada: amt + fa, net: amt, hash: isHash(g(c.desc)) ? normHash(g(c.desc)) : undefined, note: 'výběr' });
        } else if (/DEPOSIT/.test(typ)) {
          out.events.push({ date, kind: 'deposit', ada: amt, hash: isHash(g(c.desc)) ? normHash(g(c.desc)) : undefined, note: 'vklad' });
        } else { out.skipped++; out.notes.push('Neznámý typ Coinmate: ' + typ); }
      }
    },

    anycoin_orders(P, out, COIN) {
      const c = { d: P.col('date'), s: P.col('symbol'), a: P.col('action'), q: P.col('quanty', 'quantity'), p: P.col('price'), f: P.col('fee'), fc: P.col('fee_currency'), u: P.col('uid') };
      for (const r of P.rows) {
        const g = i => P.get(r, i);
        const { base, quote } = splitPair(g(c.s)); const act = g(c.a).toUpperCase();
        const q = parseNum(g(c.q)), p = parseNum(g(c.p)), date = parseDate(g(c.d), 'prague');
        if (!isFinite(q) || !isFinite(date)) continue;
        if (base === COIN) {
          const e = { date, kind: act === 'SELL' ? 'sell' : 'buy', ada: q, quoteCur: quote, quoteAmt: q * p, orderId: g(c.u), note: 'objednávka ' + g(c.u) };
          const fee = parseNum(g(c.f)); if (isFinite(fee) && fee > 0 && g(c.fc).toUpperCase() === quote) e.feeQuote = fee;
          out.events.push(e);
        } else if (quote === COIN) {
          out.events.push({ date, kind: act === 'SELL' ? 'buy' : 'sell', ada: q * p, orderId: g(c.u), note: `${act} ${base} za ${COIN}` });
        }
      }
    },

    anycoin_tx(P, out, COIN) {
      const c = { d: P.col('date'), t: P.col('type'), a: P.col('amount'), cur: P.col('currency'), o: P.col('order_id'), desc: P.col('description') };
      for (const r of P.rows) {
        const g = i => P.get(r, i);
        if (g(c.cur).toUpperCase() !== COIN) continue;
        const t = g(c.t).toLowerCase(), a = parseNum(g(c.a)), date = parseDate(g(c.d), 'utc');
        if (!isFinite(a) || Math.abs(a) < EPS || !isFinite(date)) continue;
        const ada = Math.abs(a), oid = g(c.o) || undefined;
        if (/trade/.test(t)) out.events.push({ date, kind: a > 0 ? 'buy' : 'sell', ada, orderId: oid, fromTx: true, note: t + (oid ? ' #' + oid : '') });
        else if (/withdraw/.test(t)) out.events.push({ date, kind: 'withdraw', ada, net: ada, note: 'výběr' });
        else if (/deposit/.test(t)) out.events.push({ date, kind: 'deposit', ada, note: 'vklad' });
        else if (/fee/.test(t)) out.events.push({ date, kind: 'fee', ada, note: t });
        else { out.events.push({ date, kind: a > 0 ? 'buy' : 'sell', ada, note: t + ' (odhad)' }); }
      }
    },

    coinbank(P, out, COIN) {
      const c = { s: P.col('symbol'), d: P.col('datum'), dir: P.col('smer'), paid: P.col('zaplaceno'), got: P.col('ziskano'), fee: P.col('poplatek'), src: P.col('zdrojova_mena'), dst: P.col('cilova_mena') };
      for (const r of P.rows) {
        const g = i => P.get(r, i);
        const src = g(c.src).toUpperCase(), dst = g(c.dst).toUpperCase();
        if (src !== COIN && dst !== COIN) continue;
        const paid = parseNum(g(c.paid)), got = parseNum(g(c.got)), date = parseDate(g(c.d), 'prague');
        const fee = parseNum(g(c.fee)) || 0; // poplatek je v cílové měně
        if (!isFinite(date)) continue;
        if (dst === COIN) out.events.push({ date, kind: 'buy', ada: got - fee, quoteCur: src, quoteAmt: paid, note: 'nákup (po poplatku)' });
        else out.events.push({ date, kind: 'sell', ada: paid, quoteCur: dst, quoteAmt: got, feeQuote: fee || undefined, note: 'prodej' });
      }
    },

    /** Coinbase – výpis „Statements“ (CSV): Buy/Sell/Convert/Send/Receive/Rewards… v USD (EUR) */
    coinbase(P, out, COIN) {
      const c = { id: P.col('id'), d: P.col('timestamp'), t: P.col('transaction_type'), a: P.col('asset'), q: P.col('quantity_transacted'),
        pc: P.col('price_currency', 'spot_price_currency'), sub: P.col('subtotal'), tot: P.col('total_inclusive_of_fees_and_or_spread'),
        f: P.col('fees_and_or_spread'), n: P.col('notes'), snd: P.col('sender_address'), rcp: P.col('recipient_address') };
      const money = v => { const x = String(v || '').replace(/[$€£\s"]/g, '').replace(/,/g, ''); return x === '' ? NaN : parseFloat(x); };
      for (const r of P.rows) {
        const g = i => P.get(r, i);
        if (g(c.a).toUpperCase() !== COIN) continue;
        const typ = g(c.t), T = typ.toLowerCase(), qty = money(g(c.q)), date = parseDate(g(c.d), 'utc');
        if (!isFinite(qty) || !(Math.abs(qty) > 0) || !isFinite(date)) { out.skipped++; continue; }
        const ada = Math.abs(qty), cur = (g(c.pc) || 'USD').toUpperCase(), sub = Math.abs(money(g(c.sub))), fee = Math.abs(money(g(c.f)));
        const note = (g(c.n) || typ).slice(0, 120), oid = g(c.id) || undefined;
        const trade = kind => { const e = { date, kind, ada, orderId: oid, note }; if (isFinite(sub)) { e.quoteCur = cur; e.quoteAmt = sub; if (isFinite(fee) && fee > 0) e.feeQuote = fee; } out.events.push(e); };
        if (/^send$|withdraw/.test(T)) {
          const to = g(c.rcp);
          out.events.push({ date, kind: 'withdraw', ada, hash: isHash(to) ? normHash(to) : undefined, addr: /^addr1/.test(to) ? to : undefined, orderId: oid, note: 'výběr' + (to ? ' na ' + to.slice(0, 10) + '…' : '') });
        } else if (/^receive$|^deposit$/.test(T)) {
          const from = g(c.snd);
          // příjem z adresy = vklad; od služby (např. „Bling Financial“) = odměna
          if (!from || /^(addr1|bc1|[13][a-km-zA-HJ-NP-Z1-9]{25,}|0x[0-9a-f]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}$)/i.test(from)) out.events.push({ date, kind: 'deposit', ada, orderId: oid, note: 'vklad' });
          else out.events.push({ date, kind: 'income', ada, orderId: oid, note: 'odměna od ' + from.slice(0, 40) });
        } else if (/reward|income|earn|learning|interest|airdrop|inflation|staking/.test(T)) {
          if (/staking|inflation/.test(T)) out.events.push({ date, kind: 'income', ada, orderId: oid, note: typ + ' (staking na Coinbase)' });
          else out.events.push({ date, kind: 'income', ada, orderId: oid, note: typ });
        } else if (/buy|sell|convert|trade/.test(T)) trade(qty > 0 ? 'buy' : 'sell');
        else { out.skipped++; out.notes.push('Neznámý typ Coinbase: ' + typ); }
      }
    },

    whalebooks(P, out, COIN) {
      const c = { d: P.col('date'), s: P.col('symbol'), a: P.col('action'), q: P.col('quantity'), up: P.col('unit_price'), vq: P.col('volume_quote'), f: P.col('fee'), fc: P.col('fee_currency'), to: P.col('address_to'), note: P.col('note'), u: P.col('uid') };
      const tz = out.source === 'Binance' ? 'utc' : 'prague';
      for (const r of P.rows) {
        const g = i => P.get(r, i);
        const { base, quote } = splitPair(g(c.s)); const act = g(c.a).toUpperCase();
        if (base !== COIN && quote !== COIN) continue;
        const q = parseNum(g(c.q)), vq = parseNum(g(c.vq)), up = parseNum(g(c.up)), date = parseDate(g(c.d), tz);
        if (!isFinite(q) || !isFinite(date)) { out.skipped++; continue; }
        const fee = parseNum(g(c.f)), fcur = g(c.fc).toUpperCase();
        const to = g(c.to);
        if (/REWARD|STAK|INTEREST|AIRDROP/.test(act)) {
          if (/STAK/.test(act)) { out.skipped++; if (!out._stakeNote) { out.notes.push('Řádky STAKE REWARD přeskočeny – odměny se berou z blockchainu.'); out._stakeNote = 1; } continue; }
          out.events.push({ date, kind: 'income', ada: q, note: act }); continue;
        }
        if (base === COIN && quote && (act === 'BUY' || act === 'SELL')) {
          const e = { date, kind: act === 'BUY' ? 'buy' : 'sell', ada: q, quoteCur: quote, quoteAmt: isFinite(vq) ? vq : q * up, note: g(c.note) || act };
          if (isFinite(fee) && fee > 0) {
            if (fcur === COIN) out.events.push({ date, kind: 'fee', ada: fee, note: 'poplatek' });
            else if (fcur === quote) e.feeQuote = fee;
            else { e.feeOther = fee; e.feeOtherCur = fcur; }
          }
          out.events.push(e);
        } else if (quote === COIN && (act === 'BUY' || act === 'SELL')) {
          out.events.push({ date, kind: act === 'BUY' ? 'sell' : 'buy', ada: isFinite(vq) ? vq : q * up, note: `${act} ${base} za ${COIN}` });
        } else if (/WITHDRAW/.test(act)) {
          const fa = (isFinite(fee) && fcur === COIN) ? fee : 0;
          out.events.push({ date, kind: 'withdraw', ada: q + fa, net: q, hash: isHash(to) ? normHash(to) : undefined, addr: /^addr1/.test(to) ? to : undefined, note: 'výběr' });
        } else if (/DEPOSIT/.test(act)) {
          out.events.push({ date, kind: 'deposit', ada: q, hash: isHash(to) ? normHash(to) : undefined, note: 'vklad' });
        } else { out.skipped++; out.notes.push('Neznámá akce: ' + act); }
      }
    }
  };

  /* ---------------- sloučení importů + deduplikace ---------------- */
  function mergeImports(imports) {
    const evs = [];
    imports.forEach((imp, fi) => imp.events.forEach(e => evs.push(Object.assign({}, e, { _fi: fi }))));
    // Anycoin: řádky obchodů z transakčního exportu nahradit objednávkami (mají cenu)
    const orderIds = new Set(evs.filter(e => e.source === 'Anycoin' && e.orderId && !e.fromTx).map(e => e.orderId));
    let list = evs.filter(e => !(e.fromTx && e.orderId && orderIds.has(e.orderId)));
    // křížové duplicity mezi různými soubory (stejná burza, typ, množství, čas ±3 h)
    const groups = new Map();
    for (const e of list) { const k = `${e.source}|${e.kind}|${e.ada.toFixed(6)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    const drop = new Set(); let dups = 0;
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      g.sort((a, b) => a.date - b.date);
      for (let i = 0; i < g.length; i++) {
        if (drop.has(g[i])) continue;
        for (let j = i + 1; j < g.length && g[j].date - g[i].date <= 3 * HOUR + 60000; j++) {
          if (!drop.has(g[j]) && g[j]._fi !== g[i]._fi) { drop.add(g[j]); dups++; if (!g[i].quoteCur && g[j].quoteCur) { g[i].quoteCur = g[j].quoteCur; g[i].quoteAmt = g[j].quoteAmt; } if (!g[i].hash && g[j].hash) g[i].hash = g[j].hash; }
        }
      }
    }
    list = list.filter(e => !drop.has(e));
    // stabilní ID
    const seen = new Map();
    list.sort((a, b) => a.date - b.date || a.kind.localeCompare(b.kind));
    for (const e of list) {
      const base = `${e.source}|${e.date}|${e.kind}|${e.ada.toFixed(6)}`;
      const n = seen.get(base) || 0; seen.set(base, n + 1);
      e.id = 'x:' + base + (n ? '#' + n : '');
      delete e._fi;
    }
    return { events: list, duplicates: dups };
  }

  /* ---------------- on-chain (Koios) -> události ---------------- */
  /** chain: { txs: {hash: {time, ownIn, ownOut, wd, fee, dep}}, rewards: [{stake, earned, spendable, amount, type, pool}] } (lovelace jako čísla) */
  function chainEvents(chain) {
    const L = Math.pow(10, chain.dec != null ? chain.dec : 6), evs = [];
    for (const r of chain.rewards || []) {
      const amt = r.amount / L; if (amt <= 0) continue;
      const refund = /refund/i.test(r.type || '');
      evs.push({ id: `r:${r.stake}:${r.earned}:${r.type}`, source: 'Staking', kind: refund ? 'refund' : 'reward', date: r.date || epochStart(r.spendable || r.earned + 2), ada: amt, epoch: r.earned, pool: r.pool, note: r.note || (refund ? 'vrácená záloha' : `epocha ${r.earned}` + (r.type && r.type !== 'member' ? ` (${r.type})` : '')) });
    }
    for (const [hash, t] of Object.entries(chain.txs || {})) {
      const payer = t.ownIn > 0;
      const fee = payer ? t.fee : 0, dep = payer ? (t.dep || 0) : 0;
      const E = t.ownOut - t.ownIn - t.wd + fee + dep; // čistý tok z/do cizích adres
      if (E > 0) evs.push({ id: 'c:' + hash, source: 'Peněženka', kind: 'chain_in', date: t.time, ada: E / L, hash, payer, tok: t.tok, dec: t.dec, note: 'příchozí' });
      else if (E < 0) evs.push({ id: 'c:' + hash, source: 'Peněženka', kind: 'chain_out', date: t.time, ada: -E / L, hash, payer, tok: t.tok, dec: t.dec, note: 'odchozí' });
      if (fee > 0) evs.push({ id: 'f:' + hash, source: 'Peněženka', kind: 'fee', date: t.time, ada: fee / L, hash, note: 'poplatek sítě' });
      if (dep > 0) evs.push({ id: 'd:' + hash, source: 'Peněženka', kind: 'fee', date: t.time, ada: dep / L, hash, note: 'záloha registrace stake klíče' });
      if (dep < 0) evs.push({ id: 'd:' + hash, source: 'Peněženka', kind: 'refund', date: t.time, ada: -dep / L, hash, note: 'vrácená záloha' });
    }
    return evs;
  }

  /* ---------------- ceny ---------------- */
  function priceApi(prices) {
    const usd = prices.ada_usd || {}, fx = prices.cnb || {};
    const back = (map, dk, max) => { for (let i = 0; i <= max; i++) { const k = addDays(dk, -i); if (map[k] != null) return map[k]; } return null; };
    const fxRate = (cur, dk) => { if (cur === 'CZK') return 1; const m = fx[cur]; return m ? back(m, dk, 12) : null; };
    const adaUsd = dk => back(usd, dk, 3);
    const adaCzk = dk => { const u = adaUsd(dk), r = fxRate('USD', dk); return u != null && r != null ? u * r : null; };
    const quoteCzk = (cur, amt, dk) => {
      if (!cur || !isFinite(amt)) return null;
      if (cur === 'CZK') return amt;
      if (STABLE_USD.has(cur)) { const r = fxRate('USD', dk); return r != null ? amt * r : null; }
      if (cur === 'EUR') { const r = fxRate('EUR', dk); return r != null ? amt * r : null; }
      return null;
    };
    const lastDay = () => Object.keys(usd).sort().pop();
    return { adaUsd, adaCzk, fxRate, quoteCzk, lastDay };
  }

  /* ---------------- hlavní výpočet ---------------- */
  function compute(input) {
    const { importEvents = [], chain = {}, prices = {}, settings = {}, overrides = {}, balances = {} } = input;
    const now = input.now || Date.now();
    const SYM = input.sym || 'ADA', DP = input.dp != null ? input.dp : 2, MINAMT = input.minAmt != null ? input.minAmt : 1, GAPTOL = input.gapTol != null ? input.gapTol : 1;
    const today = dayKey(now);
    const S = Object.assign({ stakingTaxedOnReceipt: true, includeExemptInLimit: true, limitCzk: 100000, otherCryptoIncome: {} }, settings);
    const PA = priceApi(prices);
    const warnings = [];

    const evs = importEvents.map(e => Object.assign({}, e)).concat(chainEvents(chain));
    const outDest = input.outDest || {};
    evs.forEach(e => { e.day = dayKey(e.date); if ((e.kind === 'chain_out' || (e.kind === 'withdraw' && SYM !== 'ADA')) && e.hash && outDest[e.hash]) e.dest = outDest[e.hash]; });

    /* párování převodů burza <-> peněženka */
    const ins = evs.filter(e => e.kind === 'chain_in').sort((a, b) => a.date - b.date);
    const outs = evs.filter(e => e.kind === 'chain_out').sort((a, b) => a.date - b.date);
    const used = new Set();
    const pair = (x, cands, amountOf, lo, hi, tol) => {
      if (x.hash) { const h = cands.find(c => c.hash === x.hash && !used.has(c)); if (h) return h; }
      let best = null, bs = Infinity;
      for (const c of cands) {
        if (used.has(c)) continue;
        const dt = c.date - x.date; if (dt < lo || dt > hi) continue;
        const da = amountOf(x) - c.ada; if (da < -0.000002 || da > tol(x)) continue;
        const s = Math.abs(da) * 10 + Math.abs(dt) / HOUR; if (s < bs) { bs = s; best = c; }
      }
      return best;
    };
    const extra = [];
    for (const w of evs.filter(e => e.kind === 'withdraw').sort((a, b) => a.date - b.date)) {
      const m = pair(w, ins, x => x.net != null ? x.net : x.ada, -2 * HOUR, 5 * DAY, x => Math.max(3, (x.net || x.ada) * 0.002));
      if (m) {
        used.add(m); w.match = m.id; m.match = w.id; m.matchSrc = w.source;
        const diff = w.ada - m.ada;
        if (diff > 0.000001) extra.push({ id: 'wf:' + w.id, source: w.source, kind: 'fee', date: w.date, day: w.day, ada: diff, note: 'poplatek za výběr' });
      }
    }
    for (const d of evs.filter(e => e.kind === 'deposit').sort((a, b) => a.date - b.date)) {
      const m = pair(d, outs, x => x.ada, -5 * DAY, 2 * HOUR, () => 0.000002);
      // vklad: na burzu dorazí stejně nebo méně než odešlo -> hledej chain_out >= vklad
      const m2 = m || (() => { let best = null, bs = Infinity; for (const c of outs) { if (used.has(c)) continue; const dt = d.date - c.date; if (dt < -2 * HOUR || dt > 5 * DAY) continue; const da = c.ada - d.ada; if (da < -0.000002 || da > 3) continue; const s = Math.abs(da) * 10 + Math.abs(dt) / HOUR; if (s < bs) { bs = s; best = c; } } return best; })();
      if (m2) {
        used.add(m2); d.match = m2.id; m2.match = d.id; m2.matchSrc = d.source;
        const diff = m2.ada - d.ada;
        if (diff > 0.000001) extra.push({ id: 'df:' + d.id, source: d.source, kind: 'fee', date: d.date, day: d.day, ada: diff, note: 'rozdíl při vkladu' });
      }
    }
    // nákupy na burze bez exportu výběrů (CoinBank): spáruj s příchodem do peněženky (≤ 10 dní, rozdíl ≤ 3 ADA = poplatek)
    const movesSrc0 = new Set(evs.filter(x => x.kind === 'withdraw' || x.kind === 'deposit').map(x => x.source));
    for (const b of evs.filter(x => x.kind === 'buy' && x.source !== 'Peněženka' && x.source !== 'Staking' && !movesSrc0.has(x.source)).sort((a, b) => a.date - b.date)) {
      let best = null, bs = Infinity;
      for (const c of ins) {
        if (used.has(c)) continue;
        const dt = c.date - b.date; if (dt < -HOUR || dt > 10 * DAY) continue;
        const da = b.ada - c.ada; if (da < -0.000002 || da > 3) continue;
        const sc = da * 10 + dt / HOUR; if (sc < bs) { bs = sc; best = c; }
      }
      if (best) {
        used.add(best); best.match = b.id; best.matchSrc = b.source; b.wMatched = best.id;
        const diff = b.ada - best.ada;
        if (diff > 1e-6) extra.push({ id: 'bf:' + b.id, source: b.source, kind: 'fee', date: best.date, day: best.day, ada: diff, note: 'poplatek za výběr (dopočteno)' });
      }
    }
    /* operace na DEX (swap, likvidita, okamžitý nákup tokenu):
       odešlo ADA na kontrakt -> do 7 dnů přišel výstup batcheru s tokeny (nebo víc ADA za odeslaný token).
       Čistá změna ADA: úbytek = prodej ADA (směna), přírůstek = nabytí ADA. */
    const hasTok = (e, sign) => !!e.tok && Object.values(e.tok).some(q => sign > 0 ? q > 0 : q < 0);
    const tokSide = (e, sign) => e.tok ? Object.fromEntries(Object.entries(e.tok).filter(([, q]) => sign > 0 ? q > 0 : q < 0).map(([k, q]) => [k, Math.abs(q)])) : {};
    const isScriptDest = e => !e.dest || e.dest.some(d => /^addr1[zxw]/.test(d.addr || ''));
    const swapIns = evs.filter(e => e.kind === 'chain_in' && !e.match && !e.payer).sort((a, b) => a.date - b.date);
    const usedSw = new Set();
    for (const o of evs.filter(e => e.kind === 'chain_out' && !e.match && isScriptDest(e)).sort((a, b) => a.date - b.date)) {
      const tokOut = hasTok(o, -1);
      // a) token přišel už ve stejné transakci (přímý swap / nákup tokenu či NFT)
      if (hasTok(o, +1) && !tokOut) {
        o.match = 'self:' + o.id; o.matchSrc = 'DEX swap'; o.autoKind = 'sell'; o.autoQty = o.ada;
        o.swap = { dir: 'ada2tok', ada: o.ada, tokens: tokSide(o, +1), dec: o.dec || {} };
        continue;
      }
      // b) výstup batcheru do 7 dnů
      const cand = swapIns.find(i => !usedSw.has(i) && i.date > o.date && i.date - o.date <= 7 * DAY && (hasTok(i, +1) || (tokOut && i.ada > o.ada)));
      if (cand) {
        usedSw.add(cand);
        o.match = cand.id; cand.match = o.id; o.matchSrc = cand.matchSrc = 'DEX swap';
        const net = cand.ada - o.ada;
        const sw = { gave: tokSide(o, -1), got: tokSide(cand, +1), dec: Object.assign({}, o.dec || {}, cand.dec || {}) };
        if (net < -1e-6) { o.autoKind = 'sell'; o.autoQty = -net; sw.dir = 'ada2tok'; sw.ada = -net; sw.tokens = sw.got; }
        else if (net > 1e-6) { cand.autoKind = 'incoming'; cand.autoQty = net; sw.dir = 'tok2ada'; sw.ada = net; sw.tokens = sw.gave; }
        else { sw.dir = 'tok2tok'; sw.ada = 0; sw.tokens = sw.got; }
        o.swap = cand.swap = sw;
        continue;
      }
      // c) zrušená objednávka / vratka: vrátí se skoro stejně ADA bez tokenů -> rozdíl = poplatek
      if (!tokOut && o.dest) {
        const back = swapIns.find(i => !usedSw.has(i) && !hasTok(i, +1) && i.date > o.date && i.date - o.date <= 7 * DAY && i.ada <= o.ada && o.ada - i.ada <= 5);
        if (back) {
          usedSw.add(back); o.match = back.id; back.match = o.id; o.matchSrc = back.matchSrc = 'DEX vratka';
          const diff = o.ada - back.ada;
          if (diff > 1e-6) extra.push({ id: 'xf:' + o.id, source: 'Peněženka', kind: 'fee', date: back.date, day: back.day, ada: diff, note: 'poplatek DEX (zrušená objednávka)' });
        }
      }
    }

    evs.push(...extra);

    /* nespárované pohyby: ADA, které odešly do neznámé vlastní peněženky (výběr z burzy, odchozí tx),
       „plují“ a příchozí ADA je nejdřív pokryjí (vlastní převod). Zbytek příchozích = nabytí
       v den příchodu (původ neznámý) – portfolio pak sedí se skutečným zůstatkem. */
    /* burza se dostala do minusu = přišel na ni vklad, který v exportu není (starší historie, jiný účet).
       Dopočítá se jako vklad – pokryje dřívější odchozí (jsou to ty samé mince), zbytek je nabytí neznámého původu.
       Jen pro ostatní mince – u ADA je evidence už ručně odsouhlasená a tohle by ji změnilo. */
    if (SYM !== 'ADA') {
      const exIds = new Set(extra.map(x => x.id)), bySrc = {};
      for (const e of evs) { if (e.source === 'Peněženka' || e.source === 'Staking' || exIds.has(e.id)) continue; (bySrc[e.source] = bySrc[e.source] || []).push(e); }
      const sgn = e => e.kind === 'buy' || e.kind === 'income' || e.kind === 'deposit' ? 1 : (e.kind === 'sell' || e.kind === 'fee' || e.kind === 'withdraw' ? -1 : 0);
      const tol = Math.max(Math.min(0.01, MINAMT), 1e-8);
      for (const [src, list] of Object.entries(bySrc)) {
        if (!list.some(e => e.kind === 'withdraw' || e.kind === 'deposit')) continue; // burza bez exportu převodů – zůstatek se nepočítá
        list.sort((a, b) => a.date - b.date || sgn(b) - sgn(a));
        let bal = 0, n = 0;
        for (const e of list) {
          bal += sgn(e) * e.ada;
          if (bal < -tol) { evs.push({ id: `pd:${src}:${n++}`, source: src, kind: 'deposit', date: e.date - 1, day: dayKey(e.date - 1), ada: -bal, note: 'vklad mimo export (dopočteno)', phantom: true }); bal = 0; }
        }
      }
    }
    let floating = 0; const fAll = []; const fq = []; // fronta odchozích, které čekají na návrat (FIFO) – kvůli „Kam odešly“
    const FLOWK = new Set(['withdraw', 'deposit', 'chain_in', 'chain_out']);
    // burzy bez exportu výběrů (např. CoinBank Obchody): nákup = ADA poslané do vlastní peněženky
    const movesSrc = new Set(evs.filter(x => x.kind === 'withdraw' || x.kind === 'deposit').map(x => x.source));
    const implicitBuy = x => x.kind === 'buy' && x.source !== 'Peněženka' && x.source !== 'Staking' && !movesSrc.has(x.source) && !x.wMatched;
    // prodej na takové burze se nejdřív pokryje z toho, co se tam koupilo (nikam to neodešlo)
    const implicitSell = x => x.kind === 'sell' && x.source !== 'Peněženka' && x.source !== 'Staking' && !movesSrc.has(x.source);
    for (const e of evs.filter(x => (FLOWK.has(x.kind) && !x.match) || implicitBuy(x) || implicitSell(x)).sort((a, b) => a.date - b.date)) {
      if (implicitSell(e)) {
        let c = e.ada;
        for (const f of fq) { if (c <= 1e-12) break; if (!f.implicit || f.e.source !== e.source) continue; const t = Math.min(f.rem, c); f.rem -= t; c -= t; floating -= t; }
        for (let k = fq.length - 1; k >= 0; k--) if (fq[k].rem <= 1e-12) fq.splice(k, 1);
        continue;
      }
      if (implicitBuy(e)) { floating += e.ada; const f = { e, rem: e.ada, implicit: true }; fq.push(f); fAll.push(f); continue; }
      const ov = overrides[e.id]; if (ov && ov.kind) continue;
      if (e.kind === 'withdraw' || e.kind === 'chain_out') { const q = (e.kind === 'withdraw' && e.net != null) ? e.net : e.ada; floating += q; const f = { e, rem: q }; fq.push(f); fAll.push(f); }
      else {
        const cov = Math.min(floating, e.ada); floating -= cov; e.coveredAda = cov;
        let c = cov;
        // nejdřív odchozí se stejnou částkou (±2 %, nejbližší dřívější) – typicky poslal a vrátil se mu, jen bez poplatku
        for (let k = fq.length - 1; k >= 0 && c > 1e-12; k--) { const f = fq[k]; if (Math.abs(f.rem - e.ada) <= f.rem * 0.02) { const t = Math.min(f.rem, c); f.rem -= t; c -= t; f.e.returnedAda = (f.e.returnedAda || 0) + t; if (f.rem <= 1e-12) fq.splice(k, 1); break; } }
        while (c > 1e-12 && fq.length) { const f = fq[0], t = Math.min(f.rem, c); f.rem -= t; c -= t; f.e.returnedAda = (f.e.returnedAda || 0) + t; if (f.rem <= 1e-12) fq.shift(); }
        if (e.ada - cov > 1e-6) { e.autoIncoming = true; e.acqAda = e.ada - cov; }
      }
    }

    /* co odešlo a nevrátilo se: ve výchozím stavu úbytek bez příjmu, aby evidence seděla se skutečným zůstatkem.
       Uživatel to může upřesnit (prodej / ztráta / vlastní peněženka) – pak platí jeho volba. */
    for (const f of fAll) {
      const e = f.e;
      if (f.implicit) { // koupeno na burze bez exportu výběrů a do peněženky to nedorazilo
        if (f.rem > 1e-9) evs.push({ id: 'g:' + e.id, source: e.source, kind: 'gone', date: e.date, day: e.day, ada: f.rem, note: 'koupeno, ale do peněženky nedorazilo' });
        continue;
      }
      if (e.autoKind) continue;
      if (f.rem > 1e-9) { e.autoKind = 'gone'; e.autoQty = f.rem; }
      // poplatek za nespárovaný výběr z burzy (rozdíl mezi odepsanou a odeslanou částkou) je pryč vždy
      if (e.kind === 'withdraw' && e.net != null && e.ada - e.net > 1e-9) { const x = { id: 'wf:' + e.id, source: e.source, kind: 'fee', date: e.date, day: e.day, ada: e.ada - e.net, note: 'poplatek za výběr' }; evs.push(x); extra.push(x); }
    }

    /* rozlišení typů */
    for (const e of evs) {
      let k = e.kind;
      if (FLOWK.has(k)) { e.flow = k; k = e.autoKind || (e.autoIncoming ? 'incoming' : 'transfer'); e.unmatched = !e.match; }
      const ov = overrides[e.id];
      if (ov && ov.kind) { e.overridden = true; k = ov.kind; }
      e.qty = (!e.overridden && e.autoKind && k === e.autoKind) ? e.autoQty : (k === 'incoming' ? (e.acqAda != null ? e.acqAda : e.ada) : e.ada);
      e.rk = k;
      e.acqDay = (ov && ov.acqDate) || e.day;
      if (ov && isFinite(ov.czk) && ov.czk !== null && ov.czk !== '') e.manualCzk = +ov.czk;
    }

    /* ocenění */
    const missingPrice = new Set();
    for (const e of evs) {
      const pDay = (e.rk === 'buy' || e.rk === 'income' || e.rk === 'incoming') ? e.acqDay : e.day;
      const u = PA.adaUsd(pDay), czkRate = PA.fxRate('USD', pDay);
      e.usdPrice = u; e.czkPrice = (u != null && czkRate != null) ? u * czkRate : null;
      e.marketCzk = e.czkPrice != null ? e.czkPrice * e.qty : null;
      let q = null;
      if (e.quoteCur) {
        q = PA.quoteCzk(e.quoteCur, e.quoteAmt, e.day);
        if (q != null && e.feeQuote) { const f = PA.quoteCzk(e.quoteCur, e.feeQuote, e.day); if (f != null) e.feeCzk = f; }
      }
      if (e.feeOther && e.feeOtherCur) { const f = PA.quoteCzk(e.feeOtherCur, e.feeOther, e.day); if (f != null) e.feeCzk = (e.feeCzk || 0) + f; }
      e.tradeCzk = q;
      e.valueCzk = e.manualCzk != null ? e.manualCzk : (q != null ? q : e.marketCzk);
      e.valueSrc = e.manualCzk != null ? 'ručně' : (q != null ? 'z exportu' : 'tržní cena');
      if (e.valueCzk == null && (e.rk === 'buy' || e.rk === 'sell' || e.rk === 'reward' || e.rk === 'income' || e.rk === 'incoming')) missingPrice.add(pDay);
    }
    const gone = evs.filter(e => e.rk === 'gone' && !e.overridden && e.qty >= MINAMT);
    if (gone.length) {
      const g25 = gone.filter(e => e.day >= '2025-01-01');
      warnings.push({ type: 'gone', text: `${gone.length} odchozích pohybů (${fmtN(gone.reduce((a, e) => a + e.qty, 0), DP)} ${SYM}) odešlo na cizí adresy a nevrátilo se – evidence je odepisuje bez příjmu, aby seděla se skutečným zůstatkem. Pokud šlo o prodej nebo směnu, označ je v „Kam odešly ${SYM}“ jako Burza/prodej; pokud o tvoji jinou peněženku, přidej ji.` + (g25.length ? ` Pozor: ${g25.length} z nich (${fmtN(g25.reduce((a, e) => a + e.qty, 0), DP)} ${SYM}) je z roku 2025 nebo novější – případný prodej by se počítal do limitu 100 000 Kč.` : '') });
    }
    const inc = evs.filter(e => e.rk === 'incoming' && !e.overridden);
    if (inc.length) warnings.push({ type: 'incoming', text: `${inc.length} příchozích transakcí (${fmtN(inc.reduce((a, e) => a + e.qty, 0), DP)} ${SYM}) nemá doložený nákup – berou se jako nabyté v den příchodu za tržní cenu. Pro skutečné datum a cenu nákupu (časový test!) nahraj v Nastavení exporty z burz.` });
    if (missingPrice.size) warnings.push({ type: 'price', text: `Chybí cena ${SYM}/kurz pro ${missingPrice.size} dní (např. ${[...missingPrice].sort()[0]}). Spusť Aktualizovat.` });

    /* FIFO */
    const ACQK = new Set(['buy', 'reward', 'income', 'refund', 'incoming']);
    const DISK = new Set(['sell', 'fee', 'gift', 'gone']);
    const order = e => (ACQK.has(e.rk) ? 0 : 1);
    // nabytí se řadí na poledne dne nabytí; poplatek ze stejného dne až po něm (jinak by poplatek ráno po ranním nákupu „neměl z čeho“ ubrat)
    const key = e => ACQK.has(e.rk) ? dayToMs(e.acqDay) : (e.rk === 'fee' ? Math.max(e.date, dayToMs(e.day)) : e.date);
    const flow = evs.filter(e => ACQK.has(e.rk) || DISK.has(e.rk)).sort((a, b) => {
      const da = key(a), db = key(b);
      return da - db || order(a) - order(b);
    });
    const lots = [], sales = [];
    let shortfall = 0;
    for (const e of flow) {
      if (ACQK.has(e.rk)) {
        let cost;
        if (e.rk === 'reward') cost = S.stakingTaxedOnReceipt ? (e.valueCzk || 0) : 0;
        else if (e.rk === 'refund') cost = 0;
        else cost = (e.valueCzk || 0) + (e.feeCzk || 0);
        lots.push({ id: e.id, day: e.acqDay, kind: e.rk, source: e.source, ada0: e.qty, ada: e.qty, costPer: e.qty > 0 ? cost / e.qty : 0, note: e.note });
      } else {
        const Q = e.qty != null ? e.qty : e.ada;
        let need = Q; const parts = [];
        for (const l of lots) {
          if (need <= EPS) break; if (l.ada <= EPS) continue;
          const take = Math.min(l.ada, need); l.ada -= take; need -= take;
          parts.push({ lotId: l.id, lotDay: l.day, lotKind: l.kind, ada: take, cost: take * l.costPer });
        }
        if (need > 1e-6) { shortfall += need; parts.push({ lotId: null, lotDay: null, lotKind: 'chybí', ada: need, cost: 0 }); }
        if (e.rk === 'sell') {
          const price = e.valueCzk != null && Q > 0 ? e.valueCzk / Q : null;
          let incEx = 0, incNon = 0, costNon = 0, adaEx = 0, adaNon = 0;
          for (const p of parts) {
            const inc = price != null ? p.ada * price : 0; p.income = inc;
            p.exempt = p.lotDay != null && e.day >= exemptFrom(p.lotDay);
            p.heldDays = p.lotDay ? daysBetween(p.lotDay, e.day) : null;
            if (p.exempt) { incEx += inc; adaEx += p.ada; } else { incNon += inc; costNon += p.cost; adaNon += p.ada; }
          }
          const feeAlloc = e.feeCzk ? e.feeCzk * (adaNon / Q) : 0;
          const costAll = parts.reduce((s, p) => s + p.cost, 0) + (e.feeCzk || 0);
          sales.push({ id: e.id, day: e.day, year: +e.day.slice(0, 4), source: e.source, ada: Q, income: e.valueCzk || 0, valueSrc: e.valueSrc, swap: e.swap, incomeExempt: incEx, incomeNon: incNon, costNon: costNon + feeAlloc, costAll, adaExempt: adaEx, adaNon, parts, note: e.note });
        }
        e.parts = parts;
      }
    }
    if (shortfall > 1e-6) warnings.push({ type: 'shortfall', text: `Prodeje/poplatky převyšují evidované nákupy o ${fmtN(shortfall, DP)} ${SYM} – chybí nějaký nákup (import burzy) nebo příchozí transakce označená jako nákup/příjem.` });

    /* roky */
    const years = {};
    const Y = y => (years[y] = years[y] || { year: y, salesAda: 0, income: 0, incomeExempt: 0, incomeNon: 0, costNon: 0, costAll: 0, adaExempt: 0, adaNon: 0, rewardsAda: 0, rewardsCzk: 0, rewardsUsd: 0, rewardsEur: 0, rewardsCount: 0, fees: 0, buysAda: 0, buysCzk: 0 });
    for (const s of sales) { const y = Y(s.year); y.salesAda += s.ada; y.income += s.income; y.incomeExempt += s.incomeExempt; y.incomeNon += s.incomeNon; y.costNon += s.costNon; y.costAll += s.costAll; y.adaExempt += s.adaExempt; y.adaNon += s.adaNon; }
    for (const e of evs) {
      const y = +e.day.slice(0, 4);
      if (e.rk === 'reward') { const o = Y(y); o.rewardsAda += e.ada; o.rewardsCzk += e.valueCzk || 0; o.rewardsUsd += (e.usdPrice || 0) * e.ada; const er = PA.fxRate('EUR', e.day); if (er && e.valueCzk) o.rewardsEur += e.valueCzk / er; o.rewardsCount++; }
      if (e.rk === 'fee') Y(y).fees += e.ada;
      if (e.rk === 'buy') { const o = Y(+e.acqDay.slice(0, 4)); o.buysAda += e.ada; o.buysCzk += e.valueCzk || 0; }
    }
    Y(+today.slice(0, 4));
    for (const y of Object.values(years)) {
      const other = +(S.otherCryptoIncome[y.year] || 0);
      y.otherCrypto = other;
      y.limitBase = (S.includeExemptInLimit ? y.income : y.incomeNon) + other;
      // osvobození (časový test, limit 100 000 Kč) platí pro krypto od roku 2025; dříve jiný režim
      y.oldRegime = y.year < 2025;
      y.withinLimit = y.limitBase <= S.limitCzk;
      y.taxableSales = y.oldRegime ? (y.income - y.costAll) : (y.withinLimit ? 0 : (y.incomeNon - y.costNon));
      y.stakingIncome = S.stakingTaxedOnReceipt ? y.rewardsCzk : 0;
    }

    /* aktuální stav */
    const open = lots.filter(l => l.ada > 1e-6).map(l => {
      const ex = exemptFrom(l.day);
      return Object.assign({}, l, { exemptFrom: ex, exempt: today >= ex, heldDays: daysBetween(l.day, today), daysToExempt: Math.max(0, daysBetween(today, ex)) });
    });
    const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
    const total = sum(open, l => l.ada), oldAda = sum(open.filter(l => l.exempt), l => l.ada), youngAda = total - oldAda;
    const lastPriceDay = PA.lastDay();
    const priceUsd = lastPriceDay ? PA.adaUsd(lastPriceDay) : null;
    const usdCzk = PA.fxRate('USD', today), eurCzk = PA.fxRate('EUR', today);
    const priceCzk = priceUsd != null && usdCzk != null ? priceUsd * usdCzk : null;
    const cy = +today.slice(0, 4), yNow = years[cy];
    const used100 = yNow.limitBase;
    const remaining = Math.max(0, S.limitCzk - used100);
    let youngSellable = 0, oldValue = priceCzk != null ? oldAda * priceCzk : null;
    if (priceCzk) {
      if (S.includeExemptInLimit) youngSellable = oldValue >= remaining ? 0 : Math.min(youngAda, (remaining - oldValue) / priceCzk);
      else youngSellable = Math.min(youngAda, remaining / priceCzk);
    }
    // uvolňování po měsících (další 3 roky)
    const unlock = {};
    for (const l of open.filter(l => !l.exempt)) { const m = l.exemptFrom.slice(0, 7); unlock[m] = (unlock[m] || 0) + l.ada; }
    const avgHeld = total > 0 ? sum(open, l => l.ada * l.heldDays) / total : 0;

    // kontrola zůstatků
    const exch = {}, hasMoves = new Set(evs.filter(e => e.kind === 'withdraw' || e.kind === 'deposit').map(e => e.source));
    for (const e of evs) {
      if (e.source === 'Peněženka' || e.source === 'Staking') continue;
      if (!hasMoves.has(e.source)) continue; // burza bez exportu výběrů (např. CoinBank Obchody) – zůstatek neznámý
      const s = e.kind === 'buy' || e.kind === 'income' || e.kind === 'deposit' ? 1 : (e.kind === 'sell' || e.kind === 'fee' || e.kind === 'withdraw' ? -1 : 0);
      exch[e.source] = (exch[e.source] || 0) + s * e.ada;
    }
    // poplatky za výběr jsou už v částce výběru – odečíst duplicitu
    for (const x of extra) if (exch[x.source] != null) exch[x.source] += x.ada;
    const chainBal = balances.chainTotal != null ? balances.chainTotal : null;
    const actual = chainBal != null ? chainBal + sum(Object.values(exch).filter(v => v > Math.min(0.01, MINAMT)), v => v) : null;
    const gap = actual != null ? total - actual : null;
    if (gap != null && Math.abs(gap) > GAPTOL) warnings.push({ type: 'gap', text: gap > 0 ? `Evidence má o ${fmtN(gap, DP)} ${SYM} víc než skutečný zůstatek – nejspíš chybí prodej nebo výběr v exportech burz, nebo se nenačetla některá peněženka.` : `Skutečný zůstatek je o ${fmtN(-gap, DP)} ${SYM} vyšší než evidence – chybí nákup/příjem (import burzy nebo označ příchozí transakci jako nákup/příjem).` });

    const unmatched = evs.filter(e => e.unmatched && !e.overridden && e.ada >= MINAMT);
    // další vlastní peněženky: stake adresy z cílových adres výběrů z burz
    const own = new Set(S.stakeAddresses || []), discovered = {};
    for (const e of evs) {
      if (SYM !== 'ADA' || e.kind !== 'withdraw' || !e.addr) continue;
      const st = stakeFromAddress(e.addr);
      if (st && !own.has(st)) { const d = discovered[st] = discovered[st] || { stake: st, count: 0, ada: 0, sources: [] }; d.count++; d.ada += e.net != null ? e.net : e.ada; if (!d.sources.includes(e.source)) d.sources.push(e.source); }
    }
    for (const [st, d] of Object.entries(input.discoveredNet || {})) if (!own.has(st)) { const x = discovered[st] = discovered[st] || { stake: st, count: 0, ada: 0, sources: [] }; x.count += d.count || 1; x.ada += d.ada || 0; for (const s of d.sources || []) if (!x.sources.includes(s)) x.sources.push(s); }
    const disc = Object.values(discovered);
    // kam odešly nespárované odchozí ADA (podle příjemce)
    const dests = {};
    for (const e of evs) {
      if ((e.flow !== 'chain_out' && e.flow !== 'withdraw') || e.match || !e.dest || !e.dest.length) continue;
      // vrátilo se (skoro) celé – rozdíl do 1 % je jen poplatek (např. za výběr z burzy) → není to „neodvrácený“ odchod
      const amt = e.flow === 'withdraw' && e.net != null ? e.net : e.ada;
      const back = e.overridden ? 0 : (e.returnedAda || 0);
      if (!e.overridden && amt - back <= Math.max(amt * 0.01, MINAMT)) continue;
      const main = e.dest.slice().sort((a, b) => b.ada - a.ada)[0];
      // platební část = skript (addr1z…, addr1x…, addr1w…) -> chytrý kontrakt (DEX/DeFi), ne peněženka
      const script = /^addr1[zxw]/.test(main.addr || '');
      const key = script ? main.addr : (main.stake || main.addr);
      const d = dests[key] = dests[key] || { key, script, stake: script ? null : (main.stake || null), addr: main.stake && !script ? null : main.addr, count: 0, ada: 0, first: e.day, last: e.day, ids: [], kinds: {} };
      d.count++; d.ada += amt - back; if (e.day < d.first) d.first = e.day; if (e.day > d.last) d.last = e.day; d.ids.push(e.id); d.kinds[e.rk] = (d.kinds[e.rk] || 0) + 1;
    }
    const destinations = Object.values(dests).sort((a, b) => b.ada - a.ada);
    if (disc.length && SYM === 'ADA') warnings.push({ type: 'wallet', text: `Nalezeno ${disc.length} dalších peněženek, kam šly výběry z burz – přidej je v Nastavení, ať je portfolio kompletní.` });
    return {
      version: VERSION, today, settings: S, events: evs.sort((a, b) => b.date - a.date), lots: open, allLots: lots, sales, years, warnings, unmatched, discovered: disc, destinations, sym: SYM, dp: DP, minAmt: MINAMT,
      summary: { total, oldAda, youngAda, priceUsd, priceCzk, usdCzk, eurCzk, lastPriceDay, valueCzk: priceCzk != null ? total * priceCzk : null, oldValue, youngValue: priceCzk != null ? youngAda * priceCzk : null, year: cy, usedLimit: used100, remaining, limitAda: priceCzk ? remaining / priceCzk : null, youngSellable, freeTotal: oldAda + youngSellable, unlock, avgHeldDays: avgHeld, exchanges: exch, chainBalance: chainBal, actual, gap, shortfall }
    };
  }

  function fmtN(x, d = 2) { return x == null || !isFinite(x) ? '–' : Number(x).toLocaleString('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d }); }

  /* ---------------- parsování odpovědí API ---------------- */
  function parseKlines(json) { const out = {}; for (const k of json) { out[new Date(k[0]).toISOString().slice(0, 10)] = parseFloat(k[4]); } return out; }
  function parseCnbYear(text, want = ['USD', 'EUR']) {
    const res = {}; want.forEach(w => res[w] = {});
    let idx = null;
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim()) continue;
      const p = line.split('|');
      if (/^(datum|date)/i.test(p[0])) { idx = {}; p.forEach((h, i) => { const m = h.trim().match(/^(\d+)\s+([A-Z]{3})$/); if (m && want.includes(m[2])) idx[m[2]] = { i, amt: +m[1] }; }); continue; }
      if (!idx) continue;
      const m = p[0].match(/^(\d{2})\.(\d{2})\.(\d{4})$/); if (!m) continue;
      const dk = `${m[3]}-${m[2]}-${m[1]}`;
      for (const [cur, o] of Object.entries(idx)) { const v = parseNum(p[o.i]); if (isFinite(v)) res[cur][dk] = v / o.amt; }
    }
    return res;
  }
  /** Koios tx_info -> zjednodušený záznam vlastních toků (lovelace) */
  function reduceTx(tx, ownStakes, blockTime) {
    const own = s => s && ownStakes.has(s);
    const val = o => +(o.value || 0);
    let ownIn = 0, ownOut = 0, wd = 0;
    const tok = {}, meta = {};
    const addTok = (list, sign) => { for (const a of list || []) { const k = a.policy_id + '.' + (a.asset_name || ''); tok[k] = (tok[k] || 0) + sign * +(a.quantity || 0); if (a.decimals != null && !meta[k]) meta[k] = +a.decimals; } };
    for (const i of tx.inputs || []) if (own(i.stake_addr)) { ownIn += val(i); addTok(i.asset_list, -1); }
    for (const o of tx.outputs || []) if (own(o.stake_addr)) { ownOut += val(o); addTok(o.asset_list, +1); }
    for (const w of tx.withdrawals || []) if (own(w.stake_addr)) wd += +(w.amount || 0);
    for (const k of Object.keys(tok)) if (!tok[k]) delete tok[k];
    const time = (tx.tx_timestamp || tx.block_time || blockTime) * 1000;
    const r = { time, ownIn, ownOut, wd, fee: +(tx.fee || 0), dep: +(tx.deposit || 0), bh: tx.block_height };
    if (Object.keys(tok).length) { r.tok = tok; r.dec = meta; }
    return r;
  }
  function normRewards(json, stakesFilter) {
    const out = [];
    for (const item of json || []) {
      const rows = Array.isArray(item.rewards) ? item.rewards.map(r => Object.assign({ stake_address: item.stake_address }, r)) : [item];
      for (const r of rows) {
        if (stakesFilter && !stakesFilter.has(r.stake_address)) continue;
        out.push({ stake: r.stake_address, earned: +r.earned_epoch, spendable: +(r.spendable_epoch || (+r.earned_epoch + 2)), amount: +r.amount, type: r.type, pool: r.pool_id_bech32 || r.pool_id || '' });
      }
    }
    return out;
  }

  /* bech32 – dekódování/kódování adres */
  const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function b32poly(v) { const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let c = 1; for (const x of v) { const b = c >> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= G[i]; } return c; }
  function b32hrpExp(h) { return [...h].map(c => c.charCodeAt(0) >> 5).concat([0], [...h].map(c => c.charCodeAt(0) & 31)); }
  function b32decode(s) {
    s = String(s || '').trim().toLowerCase(); const p = s.lastIndexOf('1'); if (p < 1) return null;
    const hrp = s.slice(0, p), d = [];
    for (const ch of s.slice(p + 1)) { const v = B32.indexOf(ch); if (v < 0) return null; d.push(v); }
    if (d.length < 7 || b32poly(b32hrpExp(hrp).concat(d)) !== 1) return null;
    let acc = 0, bits = 0; const out = [];
    for (const v of d.slice(0, -6)) { acc = ((acc << 5) | v) & 0xffff; bits += 5; while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); } }
    return { hrp, bytes: out };
  }
  function b32encode(hrp, bytes) {
    const d = []; let acc = 0, bits = 0;
    for (const b of bytes) { acc = ((acc << 8) | b) & 0xffff; bits += 8; while (bits >= 5) { bits -= 5; d.push((acc >> bits) & 31); } }
    if (bits) d.push((acc << (5 - bits)) & 31);
    const pm = b32poly(b32hrpExp(hrp).concat(d, [0, 0, 0, 0, 0, 0])) ^ 1;
    for (let i = 0; i < 6; i++) d.push((pm >> (5 * (5 - i))) & 31);
    return hrp + '1' + d.map(x => B32[x]).join('');
  }
  /** addr1… (base adresa) -> stake1… ; jinak null */
  function stakeFromAddress(a) {
    const r = b32decode(a); if (!r || r.hrp !== 'addr' || r.bytes.length !== 57) return null;
    const type = r.bytes[0] >> 4; if (type > 3) return null;
    const head = (type === 2 || type === 3) ? 0xf1 : 0xe1;
    return b32encode('stake', [head].concat(r.bytes.slice(29)));
  }

  /* bech32 – kontrola stake adresy */
  function bech32Valid(s, want) {
    if (typeof want !== 'string') want = 'stake';
    const C = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    s = String(s || '').trim(); if (s !== s.toLowerCase()) return false;
    const p = s.lastIndexOf('1'); if (p < 1 || p + 7 > s.length) return false;
    const hrp = s.slice(0, p), data = [];
    for (const ch of s.slice(p + 1)) { const v = C.indexOf(ch); if (v < 0) return false; data.push(v); }
    const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    const pm = v => { let c = 1; for (const x of v) { const b = c >> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= G[i]; } return c; };
    const ex = [...hrp].map(c => c.charCodeAt(0) >> 5).concat([0], [...hrp].map(c => c.charCodeAt(0) & 31));
    return pm(ex.concat(data)) === 1 && hrp === want;
  }

  /** FIFO loty tokenů z historie transakcí (časový test 3 roky i pro tokeny) */
  function tokenLots(chain, now) {
    const today = dayKey(now || Date.now());
    const txs = Object.values((chain && chain.txs) || {}).filter(t => t.tok).sort((a, b) => a.time - b.time);
    const res = {};
    const consume = (r, need) => { const out = []; for (const l of r.lots) { if (need <= 0) break; const take = Math.min(l.qty, need); l.qty -= take; need -= take; out.push({ day: l.day, qty: take }); } r.lots = r.lots.filter(l => l.qty > 0); return out; };
    for (const t of txs) {
      const day = dayKey(t.time);
      const ent = Object.entries(t.tok);
      // migrace tokenu vydavatelem: v jedné transakci odejde token A a přijde token B ve stejném množství (±0,1 %)
      // -> B přebírá data nabytí A (časový test se nepřerušuje)
      const mig = {};
      for (const [kb, qb] of ent) {
        if (qb <= 0) continue;
        const src = ent.find(([ka, qa]) => qa < 0 && ka !== kb && !Object.values(mig).some(m => m.from === ka) && Math.abs(qb + qa) <= Math.abs(qa) * 0.001);
        if (src) mig[kb] = { from: src[0], qty: -src[1] };
      }
      const migFrom = new Set(Object.values(mig).map(m => m.from));
      const carried = {};
      for (const [k, q] of ent) if (q < 0 && migFrom.has(k)) { const r = res[k] = res[k] || { lots: [] }; carried[k] = consume(r, -q); }
      for (const [k, q] of ent) {
        if (q < 0 && migFrom.has(k)) continue;
        const r = res[k] = res[k] || { lots: [] };
        if (q > 0) {
          if (mig[k]) {
            const src = carried[mig[k].from] || [], tot = src.reduce((a, l) => a + l.qty, 0), ratio = tot > 0 ? q / tot : 1;
            for (const l of src) r.lots.push({ day: l.day, qty: l.qty * ratio, migrated: true });
            if (q - tot * ratio > 0) r.lots.push({ day, qty: q - tot * ratio });
            r.migratedFrom = mig[k].from; r.migratedOn = day;
            r.lots.sort((a, b) => a.day < b.day ? -1 : 1);
          } else r.lots.push({ day, qty: q });
        } else consume(r, -q);
      }
    }
    for (const r of Object.values(res)) {
      let ex = 0, held = 0, next = null, all = null;
      const tot = r.lots.reduce((a, l) => a + l.qty, 0);
      for (const l of r.lots) {
        l.exemptFrom = exemptFrom(l.day); held += l.qty;
        if (today >= l.exemptFrom) ex += l.qty;
        else if (l.qty >= tot * 0.0005) { if (!next || l.exemptFrom < next) next = l.exemptFrom; if (!all || l.exemptFrom > all) all = l.exemptFrom; } // prachové zbytky ignorovat
      }
      Object.assign(r, { held, exemptQty: ex, nextFree: next, allFree: all, firstDay: r.lots.length ? r.lots[0].day : null, lastDay: r.lots.length ? r.lots[r.lots.length - 1].day : null });
    }
    return res;
  }

  /** čitelný název tokenu + množství s desetinnými místy */
  function tokenLabel(key, qty, dec) { const t = tokenParts(key, qty, dec); return t.amount + ' ' + t.name; }
  function tokenParts(key, qty, dec) {
    const [policy, hex] = String(key).split('.');
    let name = '';
    try { if (hex) { const b = hex.match(/../g).map(h => parseInt(h, 16)); const t = String.fromCharCode(...b); name = /^[\x20-\x7e]+$/.test(t) ? t : ''; } } catch (e) { }
    if (!name) name = (hex ? hex.slice(0, 8) : policy.slice(0, 8)) + '…';
    const d = dec && dec[key] != null ? dec[key] : 0;
    return { name, amount: fmtN(qty / Math.pow(10, d), d ? Math.min(d, 4) : 0) };
  }

  const API = { VERSION, tokenLabel, tokenParts, tokenLots, epochStart, dayKey, dayToMs, addDays, addYears, exemptFrom, daysBetween, parseDate, parseNum, parseCSV, importFile, mergeImports, chainEvents, priceApi, compute, parseKlines, parseCnbYear, reduceTx, normRewards, bech32Valid, stakeFromAddress, fmtN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.AdaCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
