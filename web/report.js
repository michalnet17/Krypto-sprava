/* Krypto správa – export (CSV / PDF zpráva) a grafy. Vše offline, data nikam neodcházejí. */
const Report = (() => {
  const PAL = { ADA: '#3b82f6', BTC: '#f59e0b', ETH: '#8b5cf6', SOL: '#14b8a6', XRP: '#64748b', BNB: '#eab308', DOGE: '#c2a633', TRX: '#ef4444', LINK: '#2563eb', XLM: '#94a3b8', LTC: '#a3a3a3', TOK: '#ec4899' };
  const MORE = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6', '#ef4444', '#eab308', '#ec4899', '#64748b', '#06b6d4', '#84cc16', '#f97316'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtN = (x, d = 2) => window.AdaCore.fmtN(x, d);
  const K = x => x == null || !isFinite(x) ? '–' : fmtN(x, 0) + ' Kč';
  const DK = dk => dk ? String(dk).split('-').reverse().join('.') : '–';

  /* ---------------- grafy (SVG) ---------------- */
  function donut(items, opt = {}) {
    const list = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
    const tot = list.reduce((a, i) => a + i.value, 0);
    if (!tot) return '';
    let used = 0, k = 0;
    list.forEach(i => { if (!i.color) i.color = PAL[i.key || i.label] || MORE[(k++) % MORE.length]; });
    const R0 = 52, R1 = 32, C = 60;
    const pt = (a, r) => [C + r * Math.sin(a), C - r * Math.cos(a)];
    const arcs = list.map(i => {
      const a0 = used / tot * 2 * Math.PI; used += i.value; const a1 = used / tot * 2 * Math.PI;
      if (a1 - a0 >= 2 * Math.PI - 1e-6) return `<circle cx="${C}" cy="${C}" r="${(R0 + R1) / 2}" fill="none" stroke="${i.color}" stroke-width="${R0 - R1}"/>`;
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const [x0, y0] = pt(a0, R0), [x1, y1] = pt(a1, R0), [x2, y2] = pt(a1, R1), [x3, y3] = pt(a0, R1);
      return `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${R0} ${R0} 0 ${big} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${R1} ${R1} 0 ${big} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z" fill="${i.color}"><title>${esc(i.label)}</title></path>`;
    }).join('');
    const fmt = opt.fmt || (v => fmtN(v, 0));
    return `<div class="rchart"><div class="rchart-t">${esc(opt.title || '')}</div><div class="rchart-b">
      <svg viewBox="0 0 120 120" width="${opt.size || 120}" height="${opt.size || 120}" role="img" aria-label="${esc(opt.title || 'graf')}">${arcs}
        <text x="60" y="58" text-anchor="middle" font-size="9" fill="currentColor" opacity=".7">celkem</text>
        <text x="60" y="71" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">${esc(opt.center || fmt(tot))}</text></svg>
      <ul class="rleg">${list.map(i => `<li><span class="sw" style="background:${i.color}"></span><span class="lb">${esc(i.label)}</span><span class="vl">${esc(fmt(i.value))} <span class="pc">${fmtN(i.value / tot * 100, 1)} %</span></span></li>`).join('')}</ul></div></div>`;
  }
  /** sloupce: groups [{label, values:[...]}], series [{name, color}], opt.limit = vodorovná čára */
  function bars(groups, series, opt = {}) {
    if (!groups.length) return '';
    const W = 640, H = 220, L = 64, B = 26, T = 14, plotW = W - L - 10, plotH = H - B - T;
    let mx = Math.max(1, ...groups.map(g => opt.stack ? g.values.reduce((a, v) => a + (v || 0), 0) : Math.max(...g.values.map(v => v || 0))));
    if (opt.limit && opt.limitShow) mx = Math.max(mx, opt.limit * 1.08);
    const mag = Math.pow(10, Math.floor(Math.log10(mx))), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => mx / s <= 5) || mag * 10;
    const top = Math.ceil(mx / step) * step, y = v => T + plotH - v / top * plotH;
    const gw = plotW / groups.length, bw = opt.stack ? Math.min(46, gw * 0.6) : Math.min(28, gw * 0.8 / series.length);
    let svg = '';
    for (let v = 0; v <= top + 1e-9; v += step) svg += `<line x1="${L}" x2="${W - 10}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="currentColor" opacity=".12"/><text x="${L - 6}" y="${(y(v) + 3).toFixed(1)}" font-size="10" text-anchor="end" fill="currentColor" opacity=".7">${esc(opt.axis ? opt.axis(v) : fmtN(v, 0))}</text>`;
    groups.forEach((g, gi) => {
      const cx = L + gw * gi + gw / 2;
      if (opt.stack) {
        let acc = 0;
        g.values.forEach((v, si) => { if (!v) return; const y0 = y(acc), y1 = y(acc + v); acc += v; svg += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, y0 - y1).toFixed(1)}" fill="${series[si].color}"><title>${esc(g.label)} · ${esc(series[si].name)}: ${esc(opt.fmt ? opt.fmt(v) : fmtN(v, 0))}</title></rect>`; });
      } else {
        g.values.forEach((v, si) => { if (!v) return; const x = cx - bw * series.length / 2 + bw * si; svg += `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${Math.max(0.5, y(0) - y(v)).toFixed(1)}" fill="${series[si].color}"><title>${esc(g.label)} · ${esc(series[si].name)}: ${esc(opt.fmt ? opt.fmt(v) : fmtN(v, 0))}</title></rect>`; });
      }
      svg += `<text x="${cx.toFixed(1)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="currentColor">${esc(g.label)}</text>`;
    });
    if (opt.limit && opt.limitShow) svg += `<line x1="${L}" x2="${W - 10}" y1="${y(opt.limit).toFixed(1)}" y2="${y(opt.limit).toFixed(1)}" stroke="#ef4444" stroke-dasharray="5 4"/><text x="${W - 12}" y="${(y(opt.limit) - 4).toFixed(1)}" font-size="10" text-anchor="end" fill="#ef4444">${esc(opt.limitLabel || 'limit')}</text>`;
    return `<div class="rchart wide"><div class="rchart-t">${esc(opt.title || '')}</div><svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="${esc(opt.title || 'graf')}">${svg}</svg>
      <ul class="rleg row">${series.map(s => `<li><span class="sw" style="background:${s.color}"></span>${esc(s.name)}</li>`).join('')}</ul></div>`;
  }

  /* ---------------- nastavení exportu ---------------- */
  const SECTIONS = [
    ['summary', 'Souhrn a klíčová čísla', 'pdf'],
    ['charts', 'Grafy', 'pdf'],
    ['portfolio', 'Portfolio podle mincí', ''],
    ['avg', 'Průměrná nákupní cena a nerealizovaný zisk/ztráta', ''],
    ['locations', 'Kde co je (peněženky, staking, burzy)', ''],
    ['taxes', 'Daně po rocích a limit 100 000 Kč', ''],
    ['sales', 'Prodeje a směny (FIFO, náklady, zisk)', ''],
    ['lots', 'Otevřené loty – co kdy nabyto, kdy osvobozeno', ''],
    ['rewardsSum', 'Staking odměny – souhrn po měsících', ''],
    ['rewards', 'Staking odměny – každá zvlášť', ''],
    ['exchanges', 'Burzy a směnárny (nákupy, prodeje, vklady, výběry, zůstatky)', ''],
    ['events', 'Všechny pohyby', ''],
    ['addresses', 'Moje adresy a peněženky', ''],
    ['destinations', 'Kam odešly (cizí adresy a tvoje označení)', ''],
    ['tokens', 'Tokeny (ADA)', ''],
    ['method', 'Metodika a poznámky', 'pdf']
  ];
  const CHARTS = [['coins', 'Složení podle mincí'], ['places', 'Kde to je (peněženky / burzy)'], ['age', 'Drženo nad / pod 3 roky'], ['income', 'Příjmy z prodejů po rocích vs. limit'], ['buys', 'Nákupy a staking odměny po rocích']];
  function defaults() {
    return { period: 'all', year: new Date().getFullYear(), years: [], coins: {}, sections: {}, charts: {}, csv: true, pdf: true, addr: 'short', forWhom: '' };
  }
  function opts(ctx) {
    const st = ctx.state.settings; st.export = Object.assign(defaults(), st.export || {});
    const o = st.export;
    for (const [k] of SECTIONS) if (o.sections[k] == null) o.sections[k] = true;
    for (const [k] of CHARTS) if (o.charts[k] == null) o.charts[k] = true;
    return o;
  }
  const ADDR = { full: 'celé (pro mě)', short: 'zkrácené (účetní, úřad)', hide: 'skrýt (pro cizí)' };
  function mask(a, mode) {
    if (!a) return '';
    if (mode === 'full') return a;
    if (mode === 'hide') return '(skryto)';
    return a.length > 18 ? a.slice(0, 8) + '…' + a.slice(-6) : a;
  }

  /* ---------------- sběr dat ---------------- */
  function collect(ctx, o) {
    const C = window.AdaCore, ALL = ctx.ALL;
    const avail = availableYears(ctx);
    const ys = o.period === 'all' ? null : new Set((o.period === 'year' ? [String(o.year)] : o.years.map(String)));
    const inY = day => !ys || ys.has(String(day).slice(0, 4));
    const coins = ALL.syms.filter(s => o.coins[s] !== false);
    const usdCzk = (ALL.R.ADA || ALL.R[ALL.syms[0]]).summary.usdCzk;
    const D = { opt: o, today: C.dayKey(Date.now()), coins, years: ys ? [...ys].sort() : avail, usdCzk, version: C.VERSION };
    D.periodText = !ys ? 'celé období' + (avail.length ? ` (${avail[0]}–${avail[avail.length - 1]})` : '') : (ys.size === 1 ? 'rok ' + [...ys][0] : 'roky ' + [...ys].sort().join(', '));
    D.coinRows = []; D.locations = []; D.sales = []; D.lots = []; D.rewards = []; D.events = []; D.exchanges = []; D.addresses = []; D.destinations = []; D.yearRows = [];
    for (const sym of coins) {
      const r = ALL.R[sym], s = r.summary, c = ctx.COINS[sym] || {}, dp = c.dp != null ? c.dp : 4;
      const loc = ctx.locations(sym), qty = loc.reduce((a, l) => a + l.qty, 0);
      const pC = s.priceCzk;
      const lotQty = r.lots.reduce((a, l) => a + l.ada, 0), cost = r.lots.reduce((a, l) => a + l.ada * l.costPer, 0);
      const sales = r.sales.filter(x => inY(x.day));
      const realized = sales.reduce((a, x) => a + (x.income - x.costAll), 0);
      D.coinRows.push({ sym, name: c.name || sym, dp, qty, priceCzk: pC, priceUsd: s.priceUsd, valueCzk: pC != null ? qty * pC : null, oldQty: s.oldAda, youngQty: s.youngAda, oldValue: pC != null ? s.oldAda * pC : null, youngValue: pC != null ? s.youngAda * pC : null, lotQty, cost, avgCzk: lotQty > 0 ? cost / lotQty : null, lotValue: pC != null ? lotQty * pC : null, unreal: pC != null ? lotQty * pC - cost : null, realized, gap: s.gap });
      for (const l of loc) D.locations.push({ sym, dp, label: l.label, kind: l.kind, addr: l.addr, qty: l.qty, valueCzk: pC != null ? l.qty * pC : null });
      for (const x of sales) D.sales.push({ sym, dp, day: x.day, source: x.source, qty: x.ada, income: x.income, cost: x.costAll, gain: x.income - x.costAll, exemptQty: x.adaExempt || 0, swap: x.swap ? 'směna' : 'prodej', parts: x.parts || [] });
      for (const l of r.lots) if (inY(l.day)) D.lots.push({ sym, dp, day: l.day, kind: ctx.KIND[l.kind] || l.kind, source: l.source, qty: l.ada, qty0: l.ada0, heldDays: l.heldDays, exemptFrom: l.exemptFrom, exempt: l.exempt, cost: l.ada * l.costPer, valueCzk: pC != null ? l.ada * pC : null });
      for (const e of r.events) {
        if (!inY(e.day)) continue;
        if (e.rk === 'reward') D.rewards.push({ sym, dp, day: e.day, epoch: e.epoch, qty: e.ada, usd: e.usdPrice, czk: e.czkPrice, valueCzk: e.valueCzk, pool: e.pool || '', exemptFrom: C.exemptFrom(e.day) });
        D.events.push({ sym, dp, date: e.date, day: e.day, source: e.source, type: ctx.FLOW[e.flow] || ctx.KIND[e.kind] || e.kind, rk: ctx.KIND[e.rk] || e.rk || '', qty: e.ada, valueCzk: e.valueCzk, matched: !!e.match, hash: e.hash || '', note: e.note || '' });
      }
      // burzy
      const ex = {};
      for (const e of r.events) {
        if (e.source === 'Peněženka' || e.source === 'Staking') continue;
        const x = ex[e.source] = ex[e.source] || { sym, dp, source: e.source, buyQty: 0, buyCzk: 0, sellQty: 0, sellCzk: 0, depQty: 0, wdQty: 0, feeQty: 0, n: 0, first: e.day, last: e.day, balance: (s.exchanges || {})[e.source] };
        if (!inY(e.day)) continue;
        x.n++; if (e.day < x.first) x.first = e.day; if (e.day > x.last) x.last = e.day;
        if (e.kind === 'buy' || e.kind === 'income') { x.buyQty += e.ada; x.buyCzk += e.valueCzk || 0; }
        else if (e.kind === 'sell') { x.sellQty += e.ada; x.sellCzk += e.valueCzk || 0; }
        else if (e.kind === 'deposit') x.depQty += e.ada;
        else if (e.kind === 'withdraw') x.wdQty += e.ada;
        else if (e.kind === 'fee') x.feeQty += e.ada;
      }
      for (const x of Object.values(ex)) if (x.n || (x.balance || 0) > 1e-9) D.exchanges.push(x);
      for (const a of ctx.addresses(sym)) D.addresses.push(Object.assign({ sym, dp }, a));
      const ov = ctx.overrides(sym);
      for (const d of r.destinations) {
        if (ys && ![...ys].some(y => y >= d.first.slice(0, 4) && y <= d.last.slice(0, 4))) continue;
        const kinds = {}; for (const id of d.ids) { const k = (ov[id] && ov[id].kind) || 'neoznačeno'; kinds[k] = (kinds[k] || 0) + 1; }
        D.destinations.push({ sym, dp, addr: d.stake || d.addr || d.key, script: d.script, count: d.count, qty: d.ada, first: d.first, last: d.last, label: Object.entries(kinds).map(([k, n]) => `${ctx.KIND[k] || k} ${n}×`).join(', ') });
      }
    }
    // roky – limit je společný pro všechny mince (bere se ze všech, i nevybraných)
    const allYears = {};
    for (const sym of ALL.syms) for (const y of Object.values(ALL.R[sym].years)) {
      const o2 = allYears[y.year] = allYears[y.year] || { year: y.year, by: {}, limitBase: 0, taxable: 0, rewardsCzk: 0, buysCzk: 0, income: 0, exempt: 0, gain: 0 };
      const base = ctx.state.settings.includeExemptInLimit ? y.income : y.incomeNon;
      o2.limitBase += base || 0;
      if (!coins.includes(sym)) continue;
      o2.by[sym] = { income: y.income, exempt: y.incomeExempt, non: y.incomeNon, costNon: y.costNon, taxable: y.taxableSales, rewardsQty: y.rewardsAda, rewardsCzk: y.rewardsCzk, buysQty: y.buysAda, buysCzk: y.buysCzk, salesQty: y.salesAda, gain: (y.income || 0) - (y.costAll || 0) };
      o2.taxable += y.taxableSales || 0; o2.rewardsCzk += y.rewardsCzk || 0; o2.buysCzk += y.buysCzk || 0; o2.income += y.income || 0; o2.exempt += y.incomeExempt || 0; o2.gain += (y.income || 0) - (y.costAll || 0);
    }
    const manual = ctx.state.settings.otherCryptoIncome || {};
    D.limit = ctx.state.settings.limitCzk;
    D.yearRows = Object.values(allYears).filter(y => (!ys || ys.has(String(y.year))) && (y.income || y.rewardsCzk || y.buysCzk || y.limitBase))
      .map(y => Object.assign(y, { manual: +(manual[y.year] || 0), limitTotal: y.limitBase + (+(manual[y.year] || 0)), oldRegime: y.year < 2025 }))
      .sort((a, b) => a.year - b.year);
    // tokeny
    D.tokens = [];
    if (coins.includes('ADA')) { const t = ctx.adaTokens(); D.tokens = t.list.map(x => ({ name: x.name, full: x.full, amount: x.amount, amountTxt: x.amountTxt, usd: x.p.usd, valueUsd: x.usd, valueCzk: x.usd != null && usdCzk ? x.usd * usdCzk : null, policy: x.f.key.split('.')[0] })); D.nftCount = t.nftCount; }
    D.tokensCzk = D.tokens.reduce((a, t) => a + (t.valueCzk || 0), 0);
    D.totalCzk = D.coinRows.reduce((a, c) => a + (c.valueCzk || 0), 0) + D.tokensCzk;
    D.oldCzk = D.coinRows.reduce((a, c) => a + (c.oldValue || 0), 0);
    D.youngCzk = D.coinRows.reduce((a, c) => a + (c.youngValue || 0), 0);
    D.costCzk = D.coinRows.reduce((a, c) => a + (c.cost || 0), 0);
    D.unrealCzk = D.coinRows.reduce((a, c) => a + (c.unreal || 0), 0);
    D.realizedCzk = D.coinRows.reduce((a, c) => a + (c.realized || 0), 0);
    D.rewardsCzk = D.rewards.reduce((a, r) => a + (r.valueCzk || 0), 0);
    D.events.sort((a, b) => a.date - b.date); D.sales.sort((a, b) => a.day < b.day ? -1 : 1); D.lots.sort((a, b) => a.day < b.day ? -1 : 1); D.rewards.sort((a, b) => a.day < b.day ? -1 : 1);
    return D;
  }
  function availableYears(ctx) {
    const set = new Set();
    for (const sym of ctx.ALL.syms) for (const e of ctx.ALL.R[sym].events) set.add(e.day.slice(0, 4));
    return [...set].sort();
  }

  /* ---------------- CSV ---------------- */
  function csv(rows) {
    return '﻿' + rows.map(r => r.map(v => {
      if (typeof v === 'number') return isFinite(v) ? String(Math.round(v * 1e8) / 1e8).replace('.', ',') : '';
      if (typeof v === 'boolean') return v ? 'ano' : 'ne';
      const s = String(v == null ? '' : v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
  }
  function csvFiles(D) {
    const o = D.opt, S = o.sections, m = a => mask(a, o.addr), f = [];
    const add = (key, name, rows) => { if (S[key] && rows.length > 1) f.push({ name, rows }); };
    add('portfolio', 'portfolio', [['mince', 'mnozstvi', 'cena_czk', 'cena_usd', 'hodnota_czk', 'drzeno_nad_3_roky', 'hodnota_nad_3_roky_czk', 'drzeno_do_3_let', 'hodnota_do_3_let_czk']]
      .concat(D.coinRows.map(c => [c.sym, c.qty, c.priceCzk, c.priceUsd, c.valueCzk, c.oldQty, c.oldValue, c.youngQty, c.youngValue])).concat(D.tokensCzk ? [['Tokeny (ADA)', '', '', '', D.tokensCzk, '', '', '', '']] : []));
    add('avg', 'nakupni_cena_a_zisk', [['mince', 'mnozstvi_v_evidenci', 'porizovaci_cena_czk', 'prumerna_nakupni_cena_czk', 'aktualni_hodnota_czk', 'nerealizovany_zisk_czk', 'realizovany_zisk_v_obdobi_czk']]
      .concat(D.coinRows.map(c => [c.sym, c.lotQty, c.cost, c.avgCzk, c.lotValue, c.unreal, c.realized])));
    add('locations', 'umisteni', [['mince', 'kde', 'typ', 'adresa', 'mnozstvi', 'hodnota_czk']].concat(D.locations.map(l => [l.sym, l.label, l.kind === 'exchange' ? 'burza' : l.kind === 'stake' ? 'staking' : 'peněženka', m(l.addr), l.qty, l.valueCzk])));
    add('taxes', 'dane_po_rocich', [['rok', 'mince', 'prijem_z_prodeju_czk', 'z_toho_osvobozeno_3_roky', 'z_toho_mladsi', 'naklady_mladsi', 'zdanitelny_zisk', 'zisk_celkem', 'staking_mnozstvi', 'staking_czk', 'nakoupeno_mnozstvi', 'nakoupeno_czk', 'limit_zaklad_vsechny_mince', 'limit_czk', 'v_limitu', 'rezim']]
      .concat(D.yearRows.flatMap(y => Object.entries(y.by).map(([sym, b]) => [y.year, sym, b.income, b.exempt, b.non, b.costNon, b.taxable, b.gain, b.rewardsQty, b.rewardsCzk, b.buysQty, b.buysCzk, y.limitTotal, D.limit, y.oldRegime ? '' : (y.limitTotal <= D.limit ? 'ano' : 'ne'), y.oldRegime ? 'před 2025' : 'od 2025']))));
    add('sales', 'prodeje', [['datum', 'mince', 'burza', 'typ', 'mnozstvi', 'z_toho_osvobozeno', 'prijem_czk', 'naklad_czk', 'zisk_czk']].concat(D.sales.map(s => [s.day, s.sym, s.source, s.swap, s.qty, s.exemptQty, s.income, s.cost, s.gain])));
    add('lots', 'loty', [['nabyto', 'mince', 'typ', 'zdroj', 'zbyva', 'puvodne', 'drzeno_dni', 'osvobozeno_od', 'osvobozeno', 'porizovaci_cena_czk', 'hodnota_czk']].concat(D.lots.map(l => [l.day, l.sym, l.kind, l.source, l.qty, l.qty0, l.heldDays, l.exemptFrom, l.exempt, l.cost, l.valueCzk])));
    add('rewardsSum', 'odmeny_po_mesicich', [['mesic', 'mince', 'pocet', 'mnozstvi', 'hodnota_czk']].concat(monthly(D)));
    add('rewards', 'odmeny', [['pripsano', 'mince', 'epocha', 'mnozstvi', 'cena_usd', 'cena_czk', 'hodnota_czk', 'pool', 'osvobozeno_od']].concat(D.rewards.map(r => [r.day, r.sym, r.epoch, r.qty, r.usd, r.czk, r.valueCzk, m(r.pool), r.exemptFrom])));
    add('exchanges', 'burzy', [['burza', 'mince', 'nakoupeno', 'nakoupeno_czk', 'prodano', 'prodano_czk', 'vklady', 'vybery', 'poplatky', 'zustatek_dnes', 'pohybu', 'od', 'do']].concat(D.exchanges.map(x => [x.source, x.sym, x.buyQty, x.buyCzk, x.sellQty, x.sellCzk, x.depQty, x.wdQty, x.feeQty, x.balance, x.n, x.first, x.last])));
    add('events', 'pohyby', [['datum', 'mince', 'zdroj', 'typ', 'zarazeni', 'mnozstvi', 'hodnota_czk', 'sparovano', 'hash', 'poznamka']].concat(D.events.map(e => [new Date(e.date).toISOString().replace('T', ' ').slice(0, 19), e.sym, e.source, e.type, e.rk, e.qty, e.valueCzk, e.matched, o.addr === 'full' ? e.hash : (e.hash ? mask(e.hash, o.addr) : ''), e.note])));
    if (o.addr !== 'hide') add('addresses', 'adresy', [['mince', 'typ', 'adresa', 'zustatek', 'poznamka']].concat(D.addresses.map(a => [a.sym, a.type, m(a.addr), a.bal, a.note || ''])));
    add('destinations', 'kam_odeslo', [['mince', 'prijemce', 'kontrakt', 'transakci', 'mnozstvi', 'od', 'do', 'oznaceni']].concat(D.destinations.map(d => [d.sym, m(d.addr), d.script ? 'ano' : '', d.count, d.qty, d.first, d.last, d.label])));
    add('tokens', 'tokeny', [['token', 'nazev', 'mnozstvi', 'cena_usd', 'hodnota_usd', 'hodnota_czk', 'policy']].concat(D.tokens.map(t => [t.name, t.full, t.amount, t.usd, t.valueUsd, t.valueCzk, m(t.policy)])));
    return f;
  }
  function monthly(D) {
    const m = {};
    for (const r of D.rewards) { const k = r.day.slice(0, 7) + '|' + r.sym; const x = m[k] = m[k] || [r.day.slice(0, 7), r.sym, 0, 0, 0]; x[2]++; x[3] += r.qty; x[4] += r.valueCzk || 0; }
    return Object.values(m).sort((a, b) => a[0] < b[0] ? -1 : 1);
  }

  /* ---------------- PDF zpráva (HTML k tisku) ---------------- */
  function pdfHtml(D) {
    const o = D.opt, S = o.sections, m = a => esc(mask(a, o.addr));
    const Q = (x, dp) => x == null || !isFinite(x) ? '–' : fmtN(x, Math.min(dp, 8));
    const sgn = x => x == null ? '–' : `<span class="${x >= 0 ? 'pos' : 'neg'}">${x >= 0 ? '+' : ''}${K(x)}</span>`;
    const tbl = (head, rows, foot) => rows.length ? `<table><thead><tr>${head.map(h => `<th${h.n ? ' class="n"' : ''}>${esc(h.t || h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table>` : '<p class="mut">Žádná data pro zvolené období.</p>';
    const H = (t) => ({ t, n: true });
    const sec = (key, title, body) => S[key] ? `<section><h2>${esc(title)}</h2>${body}</section>` : '';
    let h = '';
    // souhrn
    h += sec('summary', 'Souhrn', `<div class="kpis">
      <div><b>${K(D.totalCzk)}</b><span>hodnota portfolia dnes</span></div>
      <div><b class="pos">${K(D.oldCzk)}</b><span>drženo > 3 roky (osvobozeno)</span></div>
      <div><b class="warn">${K(D.youngCzk)}</b><span>drženo ≤ 3 roky</span></div>
      ${S.avg ? `<div><b>${sgn(D.unrealCzk)}</b><span>nerealizovaný zisk/ztráta</span></div>` : ''}
      <div><b>${sgn(D.realizedCzk)}</b><span>realizovaný zisk v období</span></div>
      ${D.rewards.length ? `<div><b>${K(D.rewardsCzk)}</b><span>staking odměny v období</span></div>` : ''}</div>
      ${(() => { const cy = new Date().getFullYear(), y = D.yearRows.find(x => x.year === cy); return y && !y.oldRegime ? `<p>Rok ${cy}: příjmy z prodejů všech kryptoměn pro limit <b>${K(y.limitTotal)}</b> z ${K(D.limit)} – zbývá <b>${K(Math.max(0, D.limit - y.limitTotal))}</b>.</p>` : ''; })()}`);
    // grafy
    if (S.charts) {
      const g = [];
      if (o.charts.coins && D.coinRows.length + (D.tokensCzk ? 1 : 0) > 1) g.push(donut(D.coinRows.filter(c => c.valueCzk > 0.5).map(c => ({ label: c.sym, key: c.sym, value: c.valueCzk })).concat(D.tokensCzk > 0.5 ? [{ label: 'Tokeny (ADA)', key: 'TOK', value: D.tokensCzk }] : []), { title: 'Podle mincí', fmt: K, size: 150 }));
      if (o.charts.places) { const p = {}; for (const l of D.locations) { const k = l.kind === 'exchange' ? l.label : l.kind === 'stake' ? 'Staking' : 'Peněženky'; p[k] = (p[k] || 0) + (l.valueCzk || 0); } if (D.tokensCzk) p['Peněženky'] = (p['Peněženky'] || 0) + D.tokensCzk; g.push(donut(Object.entries(p).filter(([, v]) => v > 0.5).map(([label, value]) => ({ label, value })), { title: 'Kde to je', fmt: K, size: 150 })); }
      if (o.charts.age && D.oldCzk + D.youngCzk > 0.5) g.push(donut([{ label: 'Drženo > 3 roky', value: D.oldCzk, color: '#16a34a' }, { label: 'Drženo ≤ 3 roky', value: D.youngCzk, color: '#f59e0b' }], { title: 'Časový test', fmt: K, size: 150 }));
      const yr = D.yearRows;
      if (o.charts.income && yr.some(y => y.income > 0)) g.push(bars(yr.map(y => ({ label: String(y.year), values: D.coins.map(s => (y.by[s] || {}).income || 0) })), D.coins.map(s => ({ name: s, color: PAL[s] || '#64748b' })), { title: 'Příjmy z prodejů po rocích (Kč) – limit platí od 2025', stack: true, fmt: K, axis: v => fmtN(v / 1000, 0) + ' tis.', limit: D.limit, limitShow: yr.some(y => y.year >= 2025 && y.limitTotal > D.limit * 0.3), limitLabel: 'limit 100 000 Kč' }));
      if (o.charts.buys && yr.some(y => y.buysCzk > 0 || y.rewardsCzk > 0)) g.push(bars(yr.map(y => ({ label: String(y.year), values: [y.buysCzk, y.rewardsCzk] })), [{ name: 'Nákupy (Kč)', color: '#3b82f6' }, { name: 'Staking odměny (Kč)', color: '#22c55e' }], { title: 'Nákupy a staking odměny po rocích', fmt: K, axis: v => fmtN(v / 1000, 0) + ' tis.' }));
      if (g.length) h += `<section><h2>Grafy</h2><div class="charts">${g.join('')}</div></section>`;
    }
    h += sec('portfolio', 'Portfolio podle mincí', tbl(['Mince', H('Množství'), H('Cena'), H('Hodnota'), H('> 3 roky'), H('≤ 3 roky')],
      D.coinRows.filter(c => c.qty > 1e-9 || c.lotQty > 1e-9).map(c => `<tr><td><b>${esc(c.sym)}</b> <span class="mut">${esc(c.name)}</span></td><td class="n">${Q(c.qty, c.dp)}</td><td class="n">${c.priceCzk != null ? fmtN(c.priceCzk, c.priceCzk >= 100 ? 2 : 4) + ' Kč' : '–'}</td><td class="n"><b>${K(c.valueCzk)}</b></td><td class="n pos">${Q(c.oldQty, c.dp)}</td><td class="n warn">${Q(c.youngQty, c.dp)}</td></tr>`)
        .concat(D.tokensCzk ? [`<tr><td>Tokeny (ADA)</td><td></td><td></td><td class="n">${K(D.tokensCzk)}</td><td></td><td></td></tr>`] : []),
      `<tr><td><b>Celkem</b></td><td></td><td></td><td class="n"><b>${K(D.totalCzk)}</b></td><td class="n">${K(D.oldCzk)}</td><td class="n">${K(D.youngCzk)}</td></tr>`));
    h += sec('avg', 'Průměrná nákupní cena a nerealizovaný zisk/ztráta', tbl(['Mince', H('V evidenci'), H('Pořizovací cena'), H('Průměr / ks'), H('Hodnota dnes'), H('Nerealizovaný'), H('Realizovaný v období')],
      D.coinRows.filter(c => c.qty > 1e-9 || c.lotQty > 1e-9 || Math.abs(c.realized) > 0.5).map(c => `<tr><td><b>${esc(c.sym)}</b></td><td class="n">${Q(c.lotQty, c.dp)}</td><td class="n">${K(c.cost)}</td><td class="n">${c.avgCzk != null ? fmtN(c.avgCzk, c.avgCzk >= 100 ? 2 : 4) + ' Kč' : '–'}</td><td class="n">${K(c.lotValue)}</td><td class="n">${sgn(c.unreal)}</td><td class="n">${sgn(c.realized)}</td></tr>`),
      `<tr><td><b>Celkem</b></td><td></td><td class="n">${K(D.costCzk)}</td><td></td><td></td><td class="n">${sgn(D.unrealCzk)}</td><td class="n">${sgn(D.realizedCzk)}</td></tr>`) + `<p class="note">Pořizovací cena = nákupní cena (FIFO, otevřené loty). Staking odměny a příchozí bez doloženého nákupu jsou oceněny tržní cenou v den připsání.</p>`);
    h += sec('locations', 'Kde co je', tbl(['Mince', 'Kde', 'Adresa', H('Množství'), H('Hodnota')],
      D.locations.map(l => `<tr><td>${esc(l.sym)}</td><td>${esc(l.kind === 'exchange' ? 'Burza ' + l.label : l.label)}</td><td class="mono">${l.addr ? m(l.addr) : ''}</td><td class="n">${Q(l.qty, l.dp)}</td><td class="n">${K(l.valueCzk)}</td></tr>`)));
    h += sec('taxes', 'Daně po rocích a limit 100 000 Kč', tbl(['Rok', 'Mince', H('Příjem z prodejů'), H('Osvobozeno (3 roky)'), H('Zdanitelný zisk'), H('Staking (Kč)'), H('Nakoupeno (Kč)')],
      D.yearRows.flatMap(y => { const e = Object.entries(y.by).filter(([, b]) => b.income || b.rewardsCzk || b.buysCzk || b.taxable); if (!e.length) return []; return e.map(([sym, b], i) => `<tr${i === 0 ? ' class="ytop"' : ''}><td>${i === 0 ? `<b>${y.year}</b>` : ''}</td><td>${esc(sym)}</td><td class="n">${b.income ? K(b.income) : ''}</td><td class="n">${b.exempt ? K(b.exempt) : ''}</td><td class="n">${b.taxable ? K(b.taxable) : ''}</td><td class="n">${b.rewardsCzk ? K(b.rewardsCzk) : ''}</td><td class="n">${b.buysCzk ? K(b.buysCzk) : ''}</td></tr>`)
        .concat([`<tr class="ysum"><td></td><td>${y.oldRegime ? '<span class="tag">před 2025 – bez limitu 100 tis.</span>' : `limit: <b>${K(y.limitTotal)}</b> z ${K(D.limit)} ${y.limitTotal <= D.limit ? '<span class="tag ok">v limitu</span>' : '<span class="tag bad">nad limit</span>'}`}${y.manual ? ` <span class="mut">(vč. ${K(y.manual)} mimo appku)</span>` : ''}</td><td class="n"><b>${K(y.income)}</b></td><td class="n">${K(y.exempt)}</td><td class="n"><b>${K(y.taxable)}</b></td><td class="n">${K(y.rewardsCzk)}</td><td class="n">${K(y.buysCzk)}</td></tr>`]); }))
      + `<p class="note">Limit 100 000 Kč za rok (od 2025) je společný pro všechny kryptoaktiva – počítá se ze všech mincí v appce, i když v exportu nejsou vybrané.</p>`);
    h += sec('sales', 'Prodeje a směny', tbl(['Datum', 'Mince', 'Burza', 'Typ', H('Množství'), H('Osvobozeno'), H('Příjem'), H('Náklad'), H('Zisk')],
      D.sales.map(s => `<tr><td>${DK(s.day)}</td><td>${esc(s.sym)}</td><td>${esc(s.source)}</td><td>${esc(s.swap)}</td><td class="n">${Q(s.qty, s.dp)}</td><td class="n">${s.exemptQty ? Q(s.exemptQty, s.dp) : ''}</td><td class="n">${K(s.income)}</td><td class="n">${K(s.cost)}</td><td class="n">${sgn(s.gain)}</td></tr>`),
      D.sales.length ? `<tr><td colspan="6"><b>Celkem</b></td><td class="n"><b>${K(D.sales.reduce((a, s) => a + s.income, 0))}</b></td><td class="n">${K(D.sales.reduce((a, s) => a + s.cost, 0))}</td><td class="n">${sgn(D.sales.reduce((a, s) => a + s.gain, 0))}</td></tr>` : ''));
    h += sec('lots', 'Otevřené loty', tbl(['Nabyto', 'Mince', 'Typ', 'Zdroj', H('Zbývá'), H('Drženo'), 'Osvobozeno', H('Pořizovací cena')],
      D.lots.map(l => `<tr><td>${DK(l.day)}</td><td>${esc(l.sym)}</td><td>${esc(l.kind)}</td><td>${esc(l.source)}</td><td class="n">${Q(l.qty, l.dp)}</td><td class="n">${fmtN(l.heldDays / 365.25, 1)} r</td><td>${l.exempt ? '<span class="tag ok">ano</span>' : 'od ' + DK(l.exemptFrom)}</td><td class="n">${K(l.cost)}</td></tr>`)));
    if (S.rewardsSum) { const mm = monthly(D); h += sec('rewardsSum', 'Staking odměny – souhrn po měsících', tbl(['Měsíc', 'Mince', H('Počet'), H('Množství'), H('Hodnota')], mm.map(x => `<tr><td>${x[0].split('-').reverse().join('/')}</td><td>${esc(x[1])}</td><td class="n">${x[2]}</td><td class="n">${fmtN(x[3], 4)}</td><td class="n">${K(x[4])}</td></tr>`), mm.length ? `<tr><td colspan="2"><b>Celkem</b></td><td class="n">${D.rewards.length}</td><td></td><td class="n"><b>${K(D.rewardsCzk)}</b></td></tr>` : '')); }
    h += sec('rewards', 'Staking odměny – každá zvlášť', tbl(['Připsáno', 'Mince', 'Epocha', H('Množství'), H('Cena Kč'), H('Hodnota'), 'Osvobozeno od'],
      D.rewards.map(r => `<tr><td>${DK(r.day)}</td><td>${esc(r.sym)}</td><td>${r.epoch != null ? r.epoch : ''}</td><td class="n">${fmtN(r.qty, 6)}</td><td class="n">${r.czk != null ? fmtN(r.czk, 3) : '–'}</td><td class="n">${K(r.valueCzk)}</td><td>${DK(r.exemptFrom)}</td></tr>`)));
    h += sec('exchanges', 'Burzy a směnárny', tbl(['Burza', 'Mince', H('Nakoupeno'), H('za'), H('Prodáno'), H('za'), H('Vklady'), H('Výběry'), H('Zůstatek dnes')],
      D.exchanges.map(x => `<tr><td><b>${esc(x.source)}</b><div class="mut sm">${DK(x.first)} – ${DK(x.last)} · ${x.n} pohybů</div></td><td>${esc(x.sym)}</td><td class="n">${x.buyQty ? Q(x.buyQty, x.dp) : ''}</td><td class="n">${x.buyCzk ? K(x.buyCzk) : ''}</td><td class="n">${x.sellQty ? Q(x.sellQty, x.dp) : ''}</td><td class="n">${x.sellCzk ? K(x.sellCzk) : ''}</td><td class="n">${x.depQty ? Q(x.depQty, x.dp) : ''}</td><td class="n">${x.wdQty ? Q(x.wdQty, x.dp) : ''}</td><td class="n">${x.balance > 1e-9 ? Q(x.balance, x.dp) : '0'}</td></tr>`)));
    h += sec('events', 'Všechny pohyby', tbl(['Datum', 'Mince', 'Zdroj', 'Typ', 'Zařazení', H('Množství'), H('Hodnota'), 'Pozn.'],
      D.events.map(e => `<tr><td>${DK(e.day)}</td><td>${esc(e.sym)}</td><td>${esc(e.source)}</td><td>${esc(e.type)}</td><td>${esc(e.rk)}</td><td class="n">${Q(e.qty, e.dp)}</td><td class="n">${e.valueCzk != null ? K(e.valueCzk) : ''}</td><td class="sm">${esc(e.note)}</td></tr>`)));
    h += sec('addresses', 'Moje adresy a peněženky', o.addr === 'hide' ? '<p class="mut">Adresy jsou v tomto exportu skryté.</p>' : tbl(['Mince', 'Typ', 'Adresa', H('Zůstatek'), 'Pozn.'],
      D.addresses.filter(a => !a.detail).map(a => `<tr><td>${esc(a.sym)}</td><td>${esc(a.type)}</td><td class="mono">${m(a.addr)}</td><td class="n">${a.bal != null ? Q(a.bal, a.dp) : ''}</td><td class="sm">${esc(a.note || '')}</td></tr>`))
      + (D.addresses.some(a => a.detail) ? `<p class="note">+ ${D.addresses.filter(a => a.detail).length} dalších (použitých) adres bez zůstatku – celý seznam je v CSV.</p>` : ''));
    h += sec('destinations', 'Kam odešly', tbl(['Mince', 'Příjemce', H('Transakcí'), H('Množství'), 'Období', 'Označení'],
      D.destinations.map(d => `<tr><td>${esc(d.sym)}</td><td class="mono">${m(d.addr)}${d.script ? ' <span class="tag">kontrakt</span>' : ''}</td><td class="n">${d.count}</td><td class="n">${Q(d.qty, d.dp)}</td><td>${DK(d.first)}${d.last !== d.first ? ' – ' + DK(d.last) : ''}</td><td class="sm">${esc(d.label)}</td></tr>`)));
    if (D.coins.includes('ADA')) h += sec('tokens', 'Tokeny (ADA)', tbl(['Token', H('Množství'), H('Cena $'), H('Hodnota')],
      D.tokens.map(t => `<tr><td><b>${esc(t.name)}</b> <span class="mut">${esc(t.full && t.full !== t.name ? t.full : '')}</span></td><td class="n">${esc(t.amountTxt)}</td><td class="n">${t.usd != null ? fmtN(t.usd, t.usd >= 1 ? 2 : 6) : '–'}</td><td class="n">${K(t.valueCzk)}</td></tr>`)) + (D.nftCount ? `<p class="note">+ ${D.nftCount} NFT (bez ocenění).</p>` : ''));
    h += sec('method', 'Metodika a poznámky', `<ul class="note">
      <li>Nabytí a prodeje párovány metodou FIFO; každá mince zvlášť.</li>
      <li>Časový test: příjem z prodeje mincí držených déle než 3 roky je osvobozen (§ 4 odst. 1 písm. w ZDP), počítá se den nabytí + 3 roky.</li>
      <li>Od roku 2025 jsou osvobozeny příjmy z prodeje krypta do 100 000 Kč ročně (společně za všechna kryptoaktiva).</li>
      <li>Ceny: Binance (USD), přepočet na Kč kurzem ČNB daného dne. Tokeny: CoinGecko.</li>
      <li>Směna kryptoměny za jinou kryptoměnu je úplatný převod (počítá se jako prodej).</li>
      <li>Odchody na cizí adresy bez označení jsou odepsány bez příjmu. Pokud šlo o prodej, je třeba je označit v appce.</li>
      <li>Zpráva je pomůcka pro přehled, nenahrazuje daňové poradenství.</li></ul>`);
    const title = 'Krypto správa – přehled portfolia';
    return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} ${esc(D.today)}</title><style>${PDF_CSS}</style></head><body>
      <div class="bar noprint"><button onclick="window.print()">Uložit jako PDF / Tisk</button><span>V okně tisku zvol cíl „Uložit jako PDF“.</span></div>
      <header><h1>${esc(title)}</h1><div class="meta">Vytvořeno ${DK(D.today)} · období: <b>${esc(D.periodText)}</b> · mince: <b>${esc(D.coins.join(', '))}</b>${o.forWhom ? ` · připraveno pro: <b>${esc(o.forWhom)}</b>` : ''}<br>Hodnoty v Kč podle ceny ke dni ${DK(D.today)}${D.usdCzk ? ` (1 USD = ${fmtN(D.usdCzk, 3)} Kč)` : ''} · adresy: ${esc(ADDR[o.addr] || '')} · Krypto správa v${esc(D.version)}</div></header>
      ${h}</body></html>`;
  }
  const PDF_CSS = `
    @page { size: A4; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body { font: 10.5px/1.4 "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif; color: #111827; margin: 0; padding: 18px; background: #fff; }
    h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 14px; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #3b82f6; break-after: avoid; }
    header { border-bottom: 1px solid #d1d5db; padding-bottom: 8px; margin-bottom: 6px; } .meta { color: #4b5563; }
    section { break-inside: auto; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    th, td { padding: 3px 5px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 600; } thead { display: table-header-group; } tr { break-inside: avoid; }
    td.n, th.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    tfoot td { border-top: 2px solid #9ca3af; background: #f9fafb; }
    tr.ytop td { border-top: 2px solid #d1d5db; } tr.ysum td { background: #f9fafb; }
    .mut { color: #6b7280; } .sm { font-size: 9.5px; } .mono { font-family: Consolas, ui-monospace, monospace; font-size: 9.5px; word-break: break-all; }
    .pos { color: #15803d; } .neg { color: #b91c1c; } .warn { color: #b45309; }
    .tag { display: inline-block; padding: 0 6px; border-radius: 8px; background: #e5e7eb; font-size: 9px; } .tag.ok { background: #dcfce7; color: #166534; } .tag.bad { background: #fee2e2; color: #991b1b; }
    .note { color: #4b5563; font-size: 9.5px; margin: 4px 0; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 6px 0; }
    .kpis div { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; } .kpis b { display: block; font-size: 15px; } .kpis span { color: #6b7280; font-size: 9.5px; }
    .charts { display: flex; flex-wrap: wrap; gap: 14px; }
    .rchart { break-inside: avoid; min-width: 260px; flex: 1 1 300px; } .rchart.wide { flex-basis: 100%; }
    .rchart-t { font-weight: 600; margin-bottom: 4px; } .rchart-b { display: flex; gap: 10px; align-items: center; }
    .rleg { list-style: none; margin: 0; padding: 0; font-size: 10px; } .rleg li { display: flex; gap: 6px; align-items: center; margin: 2px 0; }
    .rleg.row { display: flex; gap: 14px; } .rleg .vl { margin-left: auto; padding-left: 8px; white-space: nowrap; } .rleg .pc { color: #6b7280; }
    .sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; flex: none; }
    .bar { position: sticky; top: 0; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; display: flex; gap: 10px; align-items: center; }
    .bar button { background: #2563eb; color: #fff; border: 0; border-radius: 6px; padding: 7px 14px; font: inherit; font-weight: 600; cursor: pointer; }
    @media print { .noprint { display: none; } body { padding: 0; } }`;

  /* ---------------- dialog ---------------- */
  function open(ctx) {
    const o = opts(ctx), years = availableYears(ctx), syms = ctx.ALL.syms;
    if (!o.years.length) o.years = years.slice(-1);
    let el = document.getElementById('expModal'); if (el) el.remove();
    el = document.createElement('div'); el.id = 'expModal'; el.className = 'modal';
    const ck = (id, on, label, extra = '') => `<label class="row"><input type="checkbox" data-x="${id}" ${on ? 'checked' : ''}> <span>${label}${extra}</span></label>`;
    el.innerHTML = `<div class="mbox">
      <div class="mhead"><b>Export dat</b><button class="btn sec small" data-x="close">✕</button></div>
      <div class="mbody">
        <div class="mgrid">
          <div><h4>Období</h4>
            <label class="row"><input type="radio" name="per" value="all" ${o.period === 'all' ? 'checked' : ''}> celé období</label>
            <label class="row"><input type="radio" name="per" value="year" ${o.period === 'year' ? 'checked' : ''}> jeden rok <select data-x="year">${years.slice().reverse().map(y => `<option ${String(o.year) === y ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
            <label class="row"><input type="radio" name="per" value="years" ${o.period === 'years' ? 'checked' : ''}> vybrané roky:</label>
            <div class="chips">${years.map(y => `<label><input type="checkbox" data-x="ys:${y}" ${o.years.map(String).includes(y) ? 'checked' : ''}> ${y}</label>`).join('')}</div>
            <h4>Mince</h4>
            <div class="chips">${syms.map(s => `<label><input type="checkbox" data-x="coin:${s}" ${o.coins[s] !== false ? 'checked' : ''}> ${s}</label>`).join('')}</div>
            <h4>Formát</h4>
            ${ck('csv', o.csv, 'CSV (Excel) – každá část jako samostatný soubor')}
            ${ck('pdf', o.pdf, 'PDF – přehledná zpráva s grafy')}
            <h4>Adresy</h4>
            <select data-x="addr">${Object.entries(ADDR).map(([k, v]) => `<option value="${k}" ${o.addr === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <div class="row2"><input type="text" data-x="forWhom" placeholder="Pro koho (nepovinné, např. účetní)" value="${esc(o.forWhom)}" style="width:100%"></div>
          </div>
          <div><h4>Co v exportu bude <span class="small mut">(<a href="#" data-x="all1">vše</a> · <a href="#" data-x="all0">nic</a>)</span></h4>
            ${SECTIONS.map(([k, l, only]) => ck('sec:' + k, o.sections[k], esc(l), only ? ' <span class="small mut">(jen PDF)</span>' : '') + (k === 'charts' ? `<div class="sub">${CHARTS.map(([c, cl]) => ck('ch:' + c, o.charts[c], esc(cl))).join('')}</div>` : '')).join('')}
          </div>
        </div>
      </div>
      <div class="mfoot"><span class="small mut" id="expInfo"></span><button class="btn" data-x="go">Vytvořit export</button></div></div>`;
    document.body.appendChild(el);
    const info = () => { const n = SECTIONS.filter(([k]) => o.sections[k]).length; el.querySelector('#expInfo').textContent = `${n} částí · ${syms.filter(s => o.coins[s] !== false).length} mincí · ${o.csv && o.pdf ? 'CSV + PDF' : o.csv ? 'CSV' : o.pdf ? 'PDF' : 'zvol formát'}`; };
    info();
    const persist = () => { info(); ctx.save(); };
    el.addEventListener('change', e => {
      const t = e.target, x = t.dataset.x;
      if (t.name === 'per') o.period = t.value;
      else if (x === 'year') { o.year = +t.value; o.period = 'year'; el.querySelector('input[name=per][value=year]').checked = true; }
      else if (x && x.startsWith('ys:')) { const y = x.slice(3); o.years = o.years.map(String).filter(v => v !== y); if (t.checked) o.years.push(y); o.years.sort(); o.period = 'years'; el.querySelector('input[name=per][value=years]').checked = true; }
      else if (x && x.startsWith('coin:')) o.coins[x.slice(5)] = t.checked;
      else if (x && x.startsWith('sec:')) o.sections[x.slice(4)] = t.checked;
      else if (x && x.startsWith('ch:')) o.charts[x.slice(3)] = t.checked;
      else if (x === 'csv' || x === 'pdf') o[x] = t.checked;
      else if (x === 'addr') o.addr = t.value;
      else if (x === 'forWhom') o.forWhom = t.value;
      persist();
    });
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-x]'); if (!t) { if (e.target === el) el.remove(); return; }
      const x = t.dataset.x;
      if (x === 'close') { el.remove(); return; }
      if (x === 'all1' || x === 'all0') { e.preventDefault(); for (const [k] of SECTIONS) o.sections[k] = x === 'all1'; el.querySelectorAll('[data-x^="sec:"]').forEach(c => c.checked = x === 'all1'); persist(); return; }
      if (x === 'go') run(ctx, o, el);
    });
  }

  function run(ctx, o, el) {
    if (!o.csv && !o.pdf) { ctx.status('Zvol formát (CSV nebo PDF).', true); return; }
    if (o.period === 'years' && !o.years.length) { ctx.status('Vyber aspoň jeden rok.', true); return; }
    if (!ctx.ALL.syms.some(s => o.coins[s] !== false)) { ctx.status('Vyber aspoň jednu minci.', true); return; }
    const D = collect(ctx, o);
    const tag = o.period === 'all' ? 'vse' : o.period === 'year' ? String(o.year) : o.years.join('-');
    // PDF hned (okno se musí otevřít přímo z kliknutí, jinak ho prohlížeč zablokuje)
    if (o.pdf) {
      const html = pdfHtml(D);
      const ok = ctx.printHtml(html, `krypto_zprava_${tag}_${D.today}`);
      if (!ok) ctx.status('Okno se zprávou se neotevřelo – povol v prohlížeči vyskakovací okna pro tuto stránku.', true);
    }
    if (el) el.remove();
    if (o.csv) (async () => {
      const files = csvFiles(D); let last = '';
      for (const f of files) last = await ctx.saveFile(`krypto_${f.name}_${tag}_${D.today}.csv`, 'text/csv', csv(f.rows));
      ctx.status(files.length ? `Uloženo ${files.length} CSV souborů${last ? ' → ' + String(last).replace(/[\\/][^\\/]*$/, '') : ''}${o.pdf ? ' · PDF zpráva otevřena' : ''}` : 'Pro zvolené období a části nejsou žádná data do CSV.');
    })().catch(e => ctx.status('Export selhal: ' + e.message, true));
    else ctx.status('PDF zpráva otevřena – ulož ji přes „Uložit jako PDF“.');
  }

  return { donut, bars, open, collect, csvFiles, pdfHtml, csv, mask, SECTIONS };
})();
window.Report = Report;
