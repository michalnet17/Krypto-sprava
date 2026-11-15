/* Blockchainy BTC (mempool.space), ETH (Blockscout), SOL (veřejné RPC) + ceny ostatních mincí.
   Ukládá se "surová" minimální podoba transakcí; vlastní toky se počítají až podle aktuální sady adres. */
const Chains = (() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let LOG = () => {};
  // automatické zpomalení: když server hlásí „moc dotazů“ (HTTP 429), přidá se pauza mezi dotazy na ten server
  const pace = {}, paceLogged = {};
  async function getJSON(url, opt = {}) {
    let last = '';
    const host = url.split('/')[2] || '';
    const tries = opt.tries || 5;
    let n429 = 0;
    for (let a = 0; a < tries; a++) {
      if (pace[host]) await sleep(pace[host]);
      const r = await Platform.http(opt.body ? 'POST' : 'GET', url, opt.body ? JSON.stringify(opt.body) : null, Object.assign({ 'Accept': 'application/json' }, opt.body ? { 'Content-Type': 'application/json' } : {}, opt.headers || {}));
      if (r.ok && r.status < 300) { if (pace[host]) pace[host] = Math.max(0, Math.round(pace[host] * 0.98) - 2); return JSON.parse(r.body || 'null'); }
      last = `HTTP ${r.status} ${String(r.body || '').slice(0, 160)}`;
      if (r.status === 400 || r.status === 404) { const e = new Error(last); e.status = r.status; throw e; }
      if (r.status === 429 && n429 < 8) { // omezení rychlosti – počkat a zpomalit, pokus se nepočítá
        n429++; a--;
        pace[host] = Math.min(2000, (pace[host] || 0) * 1.3 + 150);
        if (!paceLogged[host] || Date.now() - paceLogged[host] > 60000) { paceLogged[host] = Date.now(); LOG(`${host}: server omezuje rychlost – zpomaluji (pauza ${(pace[host] / 1000).toFixed(1)} s), pokračuje se`); }
        await sleep(2500 * n429);
        continue;
      }
      LOG(`${host}: ${last.slice(0, 120)}${a + 1 < tries ? ` – zkouším znovu (${a + 1}/${tries})` : ''}`);
      if (a + 1 < tries) await sleep(1200 * (a + 1));
    }
    throw new Error(last);
  }

  /* ---------------- BTC ---------------- */
  // dvě nezávislé služby se stejným API (Esplora) – když jedna nejde, použije se druhá
  const ESPLORA = ['https://mempool.space/api', 'https://blockstream.info/api'];
  let espIdx = 0;
  async function esplora(path) {
    let err;
    // rychlé přepnutí: každá služba 1 pokus, celé kolo max. 3× (nečeká se zbytečně na nefunkční mempool)
    for (let round = 0; round < 3; round++) {
      for (let k = 0; k < ESPLORA.length; k++) {
        const i = (espIdx + k) % ESPLORA.length;
        try { const j = await getJSON(ESPLORA[i] + path, { tries: 1 }); if (i !== espIdx) { espIdx = i; LOG(`BTC: používám ${ESPLORA[i].split('/')[2]}`); } return j; }
        catch (e) { err = e; if (e.status === 400 || e.status === 404) throw e; }
      }
      await sleep(1500 * (round + 1));
    }
    throw err;
  }
  async function btcAddrInfo(a) { const j = await esplora(`/address/${a}`); const c = j.chain_stats || {}, m = j.mempool_stats || {}; return { txs: (c.tx_count || 0) + (m.tx_count || 0), bal: (c.funded_txo_sum || 0) - (c.spent_txo_sum || 0) }; }
  async function syncBTC(cd, log) {
    LOG = log; log('BTC: dotazuji mempool.space / blockstream.info…');
    const K = window.Crypto2, ch = cd.chain = cd.chain || { raw: {}, addrs: {}, dec: 8 };
    ch.dec = 8; ch.raw = ch.raw || {}; ch.addrs = {};
    const srcs = (cd.settings.sources || []).map(s => s.trim()).filter(Boolean);
    const GAP = 20;
    for (const src of srcs) {
      if (/^[xyz]pub/i.test(src)) {
        let info; try { info = K.parseXpub(src); } catch (e) { log('Neplatný xpub: ' + e.message); continue; }
        const types = info.kind === 'any' ? ['p2wpkh', 'p2sh', 'p2pkh'] : [info.kind === 'p2sh' ? 'p2sh' : 'p2wpkh'];
        for (const type of types) {
          let typeUsed = false;
          for (const chainIdx of [0, 1]) {
            if (chainIdx === 1 && !typeUsed) break;
            let idx = 0, unused = 0;
            while (unused < GAP && idx < 1000) {
              const batch = K.deriveAddresses(src, type, chainIdx, idx, 10);
              for (const a of batch) {
                const st = await btcAddrInfo(a); await sleep(120);
                ch.addrs[a] = { src: 'xpub', type, chain: chainIdx, idx, used: st.txs > 0, bal: st.bal };
                if (st.txs > 0) { unused = 0; typeUsed = true; } else unused++;
                idx++;
                if (unused >= GAP) break;
              }
            }
            log(`BTC ${type} ${chainIdx ? 'vracení' : 'příjem'}: prověřeno ${idx} adres, použité: ${Object.values(ch.addrs).filter(x => x.type === type && x.chain === chainIdx && x.used).length}`);
          }
        }
      } else if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,}$/.test(src)) {
        const st = await btcAddrInfo(src); await sleep(120);
        ch.addrs[src] = { src: 'addr', used: st.txs > 0, bal: st.bal };
      } else log('Neznámý BTC zdroj: ' + src.slice(0, 20));
    }
    const used = Object.entries(ch.addrs).filter(([, v]) => v.used).map(([a]) => a);
    log(`BTC: použitých adres ${used.length}, stahuji transakce…`);
    for (const a of used) {
      let lastSeen = null;
      for (let guard = 0; guard < 200; guard++) {
        const list = await esplora(`/address/${a}/txs/chain${lastSeen ? '/' + lastSeen : ''}`); await sleep(150);
        let known = 0;
        for (const t of list) {
          if (!t.status || !t.status.confirmed) continue;
          if (ch.raw[t.txid]) { known++; continue; }
          ch.raw[t.txid] = { t: t.status.block_time, fee: t.fee || 0, i: (t.vin || []).map(v => [v.prevout ? v.prevout.scriptpubkey_address : null, v.prevout ? v.prevout.value : 0]), o: (t.vout || []).map(v => [v.scriptpubkey_address || null, v.value || 0]) };
        }
        if (list.length < 25 || known === list.length) break;
        lastSeen = list[list.length - 1].txid;
      }
    }
    ch.balance = Object.values(ch.addrs).reduce((s, v) => s + (v.bal || 0), 0) / 1e8;
    ch.at = Date.now();
    log(`BTC: transakcí ${Object.keys(ch.raw).length}, zůstatek ${AdaCore.fmtN(ch.balance, 8)} BTC`);
  }
  /** kam šly výběry z burz (tx hash z exportu) – najde výstup s částkou výběru; ukládá do ch.wdDest */
  async function btcWithdrawDest(cd, items, log) {
    const ch = cd.chain; if (!ch) return 0;
    ch.wdDest = ch.wdDest || {};
    const todo = items.filter(i => i.hash && /^[0-9a-f]{64}$/i.test(i.hash) && !ch.wdDest[i.hash]);
    if (!todo.length) return 0;
    LOG = log; log(`BTC: zjišťuji, kam šlo ${todo.length} výběrů z burz…`);
    let n = 0;
    for (const it of todo) {
      let tx; try { tx = await esplora('/tx/' + it.hash.toLowerCase()); } catch (e) { if (e.status === 404 || e.status === 400) { ch.wdDest[it.hash] = { none: 1 }; continue; } log('BTC výběr ' + it.hash.slice(0, 10) + ': ' + e.message); break; }
      await sleep(150);
      const outs = (tx.vout || []).filter(v => v.scriptpubkey_address).map(v => [v.scriptpubkey_address, v.value]);
      const want = Math.round(it.net * 1e8);
      const exact = outs.filter(([, v]) => Math.abs(v - want) <= 2);
      ch.wdDest[it.hash] = { o: exact.length ? exact : outs.length === 1 ? outs : [], t: tx.status && tx.status.block_time };
      n++;
    }
    return n;
  }
  function reduceBTC(ch) {
    const own = new Set(Object.keys(ch.addrs || {})), txs = {}, dest = {};
    const raw = Object.entries(ch.raw || {}).sort((a, b) => a[1].t - b[1].t);
    // vkladová adresa burzy zadaná omylem jako vlastní: utrácí se společně s mnoha cizími adresami
    // (burza si vklady „zametá“ do své peněženky) → nepočítat ji jako moji
    const custodial = new Set();
    for (const [, r] of raw) {
      const mine = r.i.filter(([a]) => own.has(a)); if (!mine.length) continue;
      const foreign = new Set(r.i.filter(([a]) => a && !own.has(a)).map(([a]) => a));
      const tot = r.i.reduce((x, [, v]) => x + v, 0), my = mine.reduce((x, [, v]) => x + v, 0);
      if (foreign.size >= 3 && my < tot * 0.2) for (const [a] of mine) if ((ch.addrs[a] || {}).src === 'addr') custodial.add(a);
    }
    for (const a of custodial) own.delete(a);
    // „odraz“: poslal jsem výstup na cizí adresu X a ten samý výstup (adresa + částka) se pak celý vrátil zpět
    // na moje adresy → X je moje jiná peněženka, oba pohyby jsou vlastní převod a rozdíl je jen poplatek
    const sent = new Map(), bounce = new Set(); // klíč adresa|částka → hash odchozí tx
    for (const [h, r] of raw) {
      const hasOwnIn = r.i.some(([a]) => own.has(a));
      if (hasOwnIn) { for (const [a, v] of r.o) if (a && !own.has(a)) sent.set(a + '|' + v, h); continue; }
      if (!r.o.some(([a]) => own.has(a)) || !r.i.length) continue;
      if (r.i.every(([a, v]) => sent.has(a + '|' + v))) for (const [a, v] of r.i) { bounce.add(a + '|' + v + '|' + sent.get(a + '|' + v)); bounce.add(a + '|' + v + '|' + h); }
    }
    const isB = (a, v, h) => bounce.has(a + '|' + v + '|' + h);
    for (const [h, r] of raw) {
      let ownIn = 0, ownOut = 0; const d = {};
      for (const [a, v] of r.i) if (own.has(a) || isB(a, v, h)) ownIn += v;
      for (const [a, v] of r.o) { if (own.has(a) || isB(a, v, h)) ownOut += v; else if (a) d[a] = (d[a] || 0) + v; }
      if (!ownIn && !ownOut) continue;
      txs[h] = { time: r.t * 1000, ownIn, ownOut, wd: 0, fee: ownIn > 0 ? r.fee : 0, dep: 0 };
      if (ownIn > 0) dest[h] = Object.entries(d).map(([addr, v]) => ({ stake: null, addr, ada: v / 1e8 }));
    }
    // cíle výběrů z burz (podle hashe) – pro „Kam odešly“
    for (const [h, w] of Object.entries(ch.wdDest || {})) if (w.o && w.o.length && !dest[h]) dest[h] = w.o.map(([addr, v]) => ({ stake: null, addr, ada: v / 1e8 }));
    const balAdj = -[...custodial].reduce((x, a) => x + ((ch.addrs[a] || {}).bal || 0), 0) / 1e8;
    return { chain: { txs, rewards: [], dec: 8 }, outDest: dest, custodial: [...custodial], balAdj };
  }

  /* ---------------- ETH (Blockscout, API kompatibilní s Etherscan) ---------------- */
  const BS = 'https://eth.blockscout.com/api';
  const gwei = wei => { try { return Number(BigInt(String(wei || '0')) / 1000000000n); } catch (e) { return 0; } };
  async function bsList(action, a, startblock) {
    const out = [];
    for (let page = 1; page < 50; page++) {
      const j = await getJSON(`${BS}?module=account&action=${action}&address=${a}&startblock=${startblock}&sort=asc&page=${page}&offset=1000`); await sleep(250);
      const res = Array.isArray(j && j.result) ? j.result : [];
      out.push(...res);
      if (res.length < 1000) break;
    }
    return out;
  }
  async function syncETH(cd, log) {
    LOG = log;
    const ch = cd.chain = cd.chain || { raw: {}, rawInt: {}, last: {}, dec: 9 };
    ch.dec = 9; ch.raw = ch.raw || {}; ch.rawInt = ch.rawInt || {}; ch.last = ch.last || {};
    const addrs = (cd.settings.sources || []).map(s => s.trim().toLowerCase()).filter(s => /^0x[0-9a-f]{40}$/.test(s));
    let bal = 0;
    for (const a of addrs) {
      const start = (ch.last[a] || 0) + 1;
      log(`ETH ${a.slice(0, 10)}…: transakce od bloku ${start}`);
      const normal = await bsList('txlist', a, start), internal = await bsList('txlistinternal', a, start);
      let maxB = ch.last[a] || 0;
      for (const t of normal) {
        ch.raw[t.hash.toLowerCase()] = { t: +t.timeStamp, from: String(t.from || '').toLowerCase(), to: String(t.to || '').toLowerCase(), v: gwei(t.value), fee: gwei((BigInt(t.gasUsed || 0) * BigInt(t.gasPrice || 0)).toString()), err: t.isError === '1' || t.txreceipt_status === '0' };
        maxB = Math.max(maxB, +t.blockNumber);
      }
      internal.forEach((t, i) => {
        if (t.isError === '1') return;
        ch.rawInt[(t.hash || t.transactionHash || '').toLowerCase() + ':' + (t.traceId || i)] = { h: (t.hash || t.transactionHash || '').toLowerCase(), t: +t.timeStamp, from: String(t.from || '').toLowerCase(), to: String(t.to || '').toLowerCase(), v: gwei(t.value) };
        maxB = Math.max(maxB, +t.blockNumber);
      });
      ch.last[a] = maxB;
      const b = await getJSON(`${BS}?module=account&action=balance&address=${a}`); await sleep(250);
      bal += gwei(b && b.result) / 1e9;
      log(`ETH ${a.slice(0, 10)}…: ${normal.length} transakcí, ${internal.length} interních`);
    }
    ch.addrs = addrs; ch.balance = bal; ch.at = Date.now();
    log(`ETH: zůstatek ${AdaCore.fmtN(bal, 6)} ETH`);
  }
  function reduceETH(ch) {
    const own = new Set(ch.addrs || []), txs = {}, dest = {};
    const rec = (h, t) => txs[h] = txs[h] || { time: t * 1000, ownIn: 0, ownOut: 0, wd: 0, fee: 0, dep: 0 };
    for (const [h, r] of Object.entries(ch.raw || {})) {
      const fromMe = own.has(r.from), toMe = own.has(r.to);
      if (!fromMe && !toMe) continue;
      const x = rec(h, r.t);
      if (fromMe) { x.fee += r.fee; x.ownIn += r.fee + (r.err ? 0 : r.v); if (!toMe && !r.err && r.v > 0) dest[h] = [{ stake: null, addr: r.to, ada: r.v / 1e9 }]; }
      if (toMe && !r.err) x.ownOut += r.v;
    }
    for (const r of Object.values(ch.rawInt || {})) {
      const fromMe = own.has(r.from), toMe = own.has(r.to);
      if (!fromMe && !toMe) continue;
      const x = rec(r.h, r.t);
      if (toMe) x.ownOut += r.v;
      if (fromMe) x.ownIn += r.v;
    }
    // ownIn > 0 bez poplatku (jen interní odchozí) – poplatek 0 je v pořádku
    return { chain: { txs, rewards: [], dec: 9 }, outDest: dest };
  }

  /* ---------------- SOL (veřejné RPC) ---------------- */
  const RPC = 'https://api.mainnet-beta.solana.com', STAKE_PROG = 'Stake11111111111111111111111111111111111111';
  let rpcId = 1;
  const rpc = (method, params) => getJSON(RPC, { body: { jsonrpc: '2.0', id: rpcId++, method, params } }).then(j => { if (j && j.error) throw new Error('Solana RPC: ' + (j.error.message || JSON.stringify(j.error))); return j.result; });
  async function syncSOL(cd, log, opt0) {
    LOG = log;
    opt0 = opt0 || {};
    const ch = cd.chain = cd.chain || { raw: {}, last: {}, dec: 9 };
    ch.dec = 9; ch.raw = ch.raw || {}; ch.last = ch.last || {};
    const addrs = (cd.settings.sources || []).map(s => s.trim()).filter(s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s));
    let bal = 0;
    for (const a of addrs) {
      const sigs = []; let before;
      for (let guard = 0; guard < 50; guard++) {
        const opt = { limit: 1000 }; if (before) opt.before = before; if (ch.last[a]) opt.until = ch.last[a];
        const res = await rpc('getSignaturesForAddress', [a, opt]); await sleep(300);
        sigs.push(...res);
        if (res.length < 1000) break;
        before = res[res.length - 1].signature;
      }
      log(`SOL ${a.slice(0, 8)}…: nových transakcí ${sigs.length}`);
      const todo = sigs.filter(s => !ch.raw[s.signature]).length;
      if (todo > 3000) {
        const hrs = Math.max(1, Math.round(todo * 1.2 / 3600));
        const msg = `Adresa ${a.slice(0, 8)}… má ${todo} nenačtených transakcí (osobní peněženka mívá desítky). Může to být burza, bot nebo adresa zasypaná spamem. Načítání by trvalo zhruba ${hrs} h (jde přerušit a příště pokračuje).\n\nOpravdu načíst?`;
        const ok = typeof window.confirm === 'function' ? window.confirm(msg) : false;
        if (!ok) throw new Error(`adresa ${a.slice(0, 8)}… má ${todo} transakcí – načítání přeskočeno. Pokud není tvoje, odeber ji v Nastavení.`);
      }
      let n = 0;
      for (const s of sigs) {
        if (ch.raw[s.signature]) continue;
        let tx = null;
        try { tx = await rpc('getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]); } catch (e) { log('SOL tx ' + s.signature.slice(0, 10) + ': ' + e.message); }
        await sleep(300);
        if (!tx || !tx.meta) continue;
        const keys = (tx.transaction.message.accountKeys || []).map(k => typeof k === 'string' ? k : k.pubkey)
          .concat((tx.meta.loadedAddresses && tx.meta.loadedAddresses.writable) || [], (tx.meta.loadedAddresses && tx.meta.loadedAddresses.readonly) || []);
        const d = {};
        keys.forEach((k, i) => { const dd = (tx.meta.postBalances[i] || 0) - (tx.meta.preBalances[i] || 0); if (dd) d[k] = (d[k] || 0) + dd; });
        ch.raw[s.signature] = { t: tx.blockTime || s.blockTime, fee: tx.meta.fee || 0, payer: keys[0], d, err: !!tx.meta.err };
        if (keys.includes(STAKE_PROG)) { ch.raw[s.signature].stk = 1; if (tx.slot) ch.raw[s.signature].slot = tx.slot; }
        if (++n % 20 === 0) log(`SOL: detaily ${n}/${todo}`);
        if (n % 100 === 0 && opt0.save) await opt0.save(); // průběžně ukládat – po přerušení se pokračuje
      }
      if (sigs.length) ch.last[a] = sigs[0].signature;
      const b = await rpc('getBalance', [a]); await sleep(300);
      bal += ((b && b.value) || 0) / 1e9;
    }
    ch.addrs = addrs;
    // staking: stake účty vytvořené z mé adresy jsou moje – jejich zůstatek + odměny po epochách
    const own = new Set(addrs), stakeAccts = new Set(ch.stakeAccts || []);
    for (const r of Object.values(ch.raw)) if (r.stk && !r.err && own.has(r.payer)) for (const [k, v] of Object.entries(r.d)) if (v && !own.has(k)) stakeAccts.add(k);
    ch.stakeAccts = [...stakeAccts]; ch.stakeBal = {}; let sbal = 0;
    for (const a of ch.stakeAccts) { const b = await rpc('getBalance', [a]); await sleep(300); ch.stakeBal[a] = (b && b.value) || 0; sbal += ch.stakeBal[a] / 1e9; }
    if (ch.stakeAccts.length) {
      ch.rewards = ch.rewards || [];
      const info = await rpc('getEpochInfo', []); await sleep(300);
      const cur = info.epoch;
      if (!ch.rwEpoch) { // první epocha = epocha nejstarší stake transakce (mainnet: slot / 432000), bez slotu odhad podle času
        const st = Object.values(ch.raw).filter(r => r.stk);
        const slots = st.filter(r => r.slot).map(r => r.slot);
        ch.rwEpoch = slots.length ? Math.floor(Math.min(...slots) / 432000)
          : Math.max(0, cur - Math.ceil((Date.now() - Math.min(...st.map(r => r.t * 1000))) / (2 * 86400000)) - 3);
      }
      const have = new Set(ch.rewards.map(r => r.stake + ':' + r.earned));
      for (let ep = ch.rwEpoch, n = 0; ep < cur && n < 500; ep++, n++) {
        let res; try { res = await rpc('getInflationReward', [ch.stakeAccts, { epoch: ep }]); } catch (e) { log(`SOL odměny epocha ${ep}: ${e.message}`); break; }
        await sleep(300);
        const hits = (res || []).map((r, i) => r && r.amount > 0 ? Object.assign({ acct: ch.stakeAccts[i] }, r) : null).filter(Boolean);
        if (hits.length) {
          let t = null; try { t = await rpc('getBlockTime', [hits[0].effectiveSlot]); await sleep(300); } catch (e) { /* bez času */ }
          if (!t) break; // bez data odměnu nezapisuj, zkusí se příště
          for (const h of hits) if (!have.has(h.acct + ':' + ep)) ch.rewards.push({ stake: h.acct, earned: ep, amount: h.amount, type: 'member', date: t * 1000, pool: '' });
        }
        ch.rwEpoch = ep + 1;
        if (n && n % 25 === 0) log(`SOL odměny: epocha ${ep}/${cur}`);
      }
      log(`SOL staking: stake účtů ${ch.stakeAccts.length}, ${AdaCore.fmtN(sbal, 6)} SOL, odměn ${ch.rewards.length}`);
    }
    ch.walletBal = bal; ch.balance = bal + sbal; ch.at = Date.now();
    log(`SOL: zůstatek ${AdaCore.fmtN(bal + sbal, 6)} SOL`);
  }
  function reduceSOL(ch) {
    const own = new Set([...(ch.addrs || []), ...(ch.stakeAccts || [])]), txs = {}, dest = {};
    for (const [h, r] of Object.entries(ch.raw || {})) {
      let d = 0; for (const a of own) d += r.d[a] || 0;
      const payer = own.has(r.payer), fee = payer ? r.fee : 0;
      if (!d && !fee) continue;
      const e = d + fee; // čistý tok bez poplatku
      txs[h] = payer ? { time: r.t * 1000, ownIn: fee + Math.max(0, -e), ownOut: Math.max(0, e), wd: 0, fee, dep: 0 } : { time: r.t * 1000, ownIn: Math.max(0, -d), ownOut: Math.max(0, d), wd: 0, fee: 0, dep: 0 };
      if (e < 0) dest[h] = Object.entries(r.d).filter(([a, v]) => v > 0 && !own.has(a)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([addr, v]) => ({ stake: null, addr, ada: v / 1e9 }));
    }
    const rewards = (ch.rewards || []).filter(r => r.date).map(r => Object.assign({}, r, { note: `epocha ${r.earned} (Solana staking)` }));
    return { chain: { txs, rewards, dec: 9 }, outDest: dest };
  }

  /* ---------------- ceny (Binance klines) ---------------- */
  async function syncPrice(state, sym, log) {
    const P = state.prices = state.prices || {};
    P.coins = P.coins || {};
    const map = P.coins[sym] = P.coins[sym] || {};
    const days = Object.keys(map).sort();
    let start = days.length ? Date.parse(days[days.length - 1]) - 2 * 86400000 : Date.UTC(2017, 7, 1);
    for (let guard = 0; guard < 20; guard++) {
      let r = null;
      for (const host of ['https://data-api.binance.vision', 'https://api.binance.com']) {
        r = await Platform.http('GET', `${host}/api/v3/klines?symbol=${sym}USDT&interval=1d&startTime=${start}&limit=1000`, null, {});
        if (r.ok && r.status < 300) break;
      }
      if (!r.ok || r.status >= 300) { log(`Cena ${sym}: Binance HTTP ${r.status}`); return; }
      const arr = JSON.parse(r.body);
      Object.assign(map, AdaCore.parseKlines(arr));
      if (arr.length < 1000) break;
      start = arr[arr.length - 1][0] + 86400000;
    }
    log(`Cena ${sym}: ${Object.keys(map).length} dní`);
  }

  const SYNC = { BTC: syncBTC, ETH: syncETH, SOL: syncSOL };
  const REDUCE = { BTC: reduceBTC, ETH: reduceETH, SOL: reduceSOL };
  return { SYNC, REDUCE, syncPrice, reduceBTC, reduceETH, reduceSOL, btcWithdrawDest };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Chains;
