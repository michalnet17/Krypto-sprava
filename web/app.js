/* Krypto správa – UI */
(() => {
  const C = window.AdaCore;
  const $ = s => document.querySelector(s);
  /* mince: ADA má plnou podporu (Koios), BTC/ETH/SOL blockchain podle adres, ostatní jen z exportů burz */
  const COINS = {
    ADA: { name: 'Cardano', sy: '₳', dp: 2, minAmt: 1, gapTol: 1, chain: 'ada', ex: { tx: 'https://cardanoscan.io/transaction/', addr: 'https://cardanoscan.io/address/' } },
    BTC: { name: 'Bitcoin', sy: 'BTC', dp: 8, minAmt: 0.00001, gapTol: 0.00002, chain: 'btc', ex: { tx: 'https://mempool.space/tx/', addr: 'https://mempool.space/address/' } },
    ETH: { name: 'Ethereum', sy: 'ETH', dp: 6, minAmt: 0.0001, gapTol: 0.0005, chain: 'eth', ex: { tx: 'https://etherscan.io/tx/', addr: 'https://etherscan.io/address/' } },
    SOL: { name: 'Solana', sy: 'SOL', dp: 4, minAmt: 0.001, gapTol: 0.005, chain: 'sol', ex: { tx: 'https://solscan.io/tx/', addr: 'https://solscan.io/account/' } },
    XRP: { name: 'XRP', sy: 'XRP', dp: 2, minAmt: 0.1, gapTol: 0.5 }, BNB: { name: 'BNB', sy: 'BNB', dp: 4, minAmt: 0.001, gapTol: 0.005 },
    DOGE: { name: 'Dogecoin', sy: 'DOGE', dp: 2, minAmt: 1, gapTol: 2 }, TRX: { name: 'TRON', sy: 'TRX', dp: 2, minAmt: 1, gapTol: 2 },
    LINK: { name: 'Chainlink', sy: 'LINK', dp: 4, minAmt: 0.01, gapTol: 0.05 }, XLM: { name: 'Stellar', sy: 'XLM', dp: 2, minAmt: 1, gapTol: 2 },
    LTC: { name: 'Litecoin', sy: 'LTC', dp: 4, minAmt: 0.001, gapTol: 0.005 }
  };
  const ICON = { ADA: '₳', BTC: '₿', ETH: 'Ξ', SOL: '◎', XRP: '✕', BNB: '◆', DOGE: 'Ð', TRX: '◈', LINK: '⬡', XLM: '✦', LTC: 'Ł' };
  let SYM = 'ADA', SY = '₳', DP = 2;
  const isADA = () => SYM === 'ADA';
  const COIN = () => COINS[SYM] || { sy: SYM, dp: 4, minAmt: 0, gapTol: 0.001 };
  /** data jiné mince než ADA (ADA má data v kořeni stavu kvůli zpětné kompatibilitě) */
  const CD = (sym = SYM) => { state.coinData = state.coinData || {}; return state.coinData[sym] = state.coinData[sym] || { settings: { sources: [] }, overrides: {}, chain: null, lastSync: null }; };
  const OVR = () => isADA() ? state.overrides : CD().overrides;
  const N = (x, d) => C.fmtN(x, d == null ? DP : d);
  const K = x => x == null ? '–' : C.fmtN(x, 0) + ' Kč';
  const U = x => x == null ? '–' : '$' + C.fmtN(x, 2);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CUR = () => (state && state.settings.currency) || 'CZK';
  /** částka v USD -> zobrazení ve zvolené měně */
  const MU = usd => { if (usd == null || !isFinite(usd)) return '–'; if (CUR() === 'USD') return U(usd); const r = R && R.summary.usdCzk; return r ? K(usd * r) : '–'; };
  /** množství ADA -> hodnota ve zvolené měně */
  /** jednotková cena (může být i zlomek haléře/centu) */
  const PU = usd => {
    if (usd == null || !isFinite(usd)) return '–';
    const usdMode = CUR() === 'USD', r = R && R.summary.usdCzk;
    const v = usdMode ? usd : (r ? usd * r : null); if (v == null) return '–';
    const d = v >= 100 ? 2 : v >= 1 ? 3 : v >= 0.01 ? 4 : 6;
    return usdMode ? '$' + C.fmtN(v, d) : C.fmtN(v, d) + ' Kč';
  };
  const MA = ada => (R && R.summary.priceUsd != null) ? MU(ada * R.summary.priceUsd) : '–';
  const D = ms => C.dayKey(ms).split('-').reverse().join('.');
  const DK = dk => dk ? dk.split('-').reverse().join('.') : '–';

  const KIND = { incoming: 'příchozí (původ neznámý)', buy: 'nákup', sell: 'prodej', fee: 'poplatek', income: 'příjem', reward: 'staking', refund: 'vratka', transfer: 'převod', gift: 'ztráta/dar', gone: 'odešlo (nevrátilo se)' };
  const FLOW = { withdraw: 'výběr z burzy', deposit: 'vklad na burzu', chain_in: 'příchozí', chain_out: 'odchozí' };

  let state = null, R = null, tab = 'prehled', busy = false, PR = null;
  const ui = { year: 'all', onlyTodo: false, q: '' };

  function defState() {
    return { v: 1, settings: { stakeAddresses: [], koiosToken: '', stakingTaxedOnReceipt: true, includeExemptInLimit: true, limitCzk: 100000, otherCryptoIncome: {} }, imports: [], overrides: {}, chain: null, prices: null, lastSync: null, coin: 'ADA', coinData: {} };
  }
  async function save() { try { await Platform.saveState(state); if (PR) PR.onSaved().catch(e => log('Synchronizace: ' + e.message)); } catch (e) { status('Uložení selhalo: ' + e.message, true); } }
  const logBuf = []; let lastError = null;
  function status(t, bad) {
    const s = $('#status'); s.textContent = t; s.classList.toggle('hidden', !t); s.style.color = bad ? '#fca5a5' : '';
    if (bad && t) {
      lastError = { t, at: new Date().toISOString() };
      if (REPO) { const b = document.createElement('button'); b.className = 'btn sec small'; b.id = 'reportBug'; b.textContent = 'Nahlásit chybu'; b.style.marginLeft = '10px'; s.appendChild(b); }
    }
  }
  function log(t) {
    const line = new Date().toLocaleTimeString('cs-CZ') + '  ' + t;
    logBuf.push(line); if (logBuf.length > 60) logBuf.shift();
    const l = $('#log'); l.classList.remove('hidden'); l.textContent += line + '\n'; l.scrollTop = 1e9;
  }
  window.addEventListener('error', e => { lastError = { t: 'JS: ' + (e.message || e) + (e.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno})` : ''), at: new Date().toISOString() }; });
  window.addEventListener('unhandledrejection', e => { lastError = { t: 'JS: ' + ((e.reason && e.reason.message) || e.reason), at: new Date().toISOString() }; });
  /** zamaskuje adresy, xpub, hashe a klíče – do veřejného hlášení nesmí nic osobního */
  function scrub(txt) {
    return String(txt || '')
      .replace(/\b(addr1|stake1|addr_test1|stake_test1)[0-9a-z]{20,}/g, '$1…')
      .replace(/\b([xyzt]pub)[1-9A-HJ-NP-Za-km-z]{60,}/g, '$1…')
      .replace(/\b(bc1|tb1)[0-9a-z]{20,}/gi, '$1…')
      .replace(/\b0x[0-9a-fA-F]{40,64}\b/g, '0x…')
      .replace(/\b[0-9a-fA-F]{40,}\b/g, '[hash]')
      .replace(/\b[1-9A-HJ-NP-Za-km-z]{25,}\b/g, m => /\d/.test(m) && /[a-z]/.test(m) && /[A-Z]/.test(m) ? m.slice(0, 4) + '…' : m)
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[e-mail]');
  }
  function bugReportUrl() {
    const ua = navigator.userAgent;
    const os = Platform.isAndroid ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'jiný';
    const coins = ALL ? ALL.syms.join(', ') : SYM;
    const err = lastError ? `${lastError.t}  (${lastError.at.slice(0, 16).replace('T', ' ')} UTC)` : '';
    let lg = logBuf.slice(-25).join('\n');
    const q = p => encodeURIComponent(scrub(p));
    let url = `https://github.com/${REPO}/issues/new?template=chyba.yml&title=${encodeURIComponent('[chyba] ')}&verze=${q(C.VERSION)}&system=${q(os + (Platform.isAndroid ? '' : ' · ' + (ua.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/) || [''])[0]))}&mince=${q(coins)}&chyba=${q(err)}`;
    while (lg && (url + '&log=' + q(lg)).length > 7500) lg = lg.split('\n').slice(1).join('\n');
    return url + (lg ? '&log=' + q(lg) : '');
  }
  function openExternal(url) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }

  /** události z exportů burz pro danou minci (ADA uložené rovnou, ostatní z uloženého textu exportu) */
  const _impCache = {};
  function importEventsFor(sym) {
    if (sym === 'ADA') return C.mergeImports(state.imports || []);
    const key = sym + '|' + (state.imports || []).map(i => i.hash).join(',');
    if (_impCache[sym] && _impCache[sym].key === key) return _impCache[sym].res;
    const imps = (state.imports || []).filter(i => i.text).map(i => C.importFile(i.fileName, i.text, sym));
    const res = C.mergeImports(imps);
    _impCache[sym] = { key, res };
    return res;
  }
  const _fileCache = {};
  /** výsledek importu jednoho souboru pro danou minci (ADA uložené, ostatní z textu) */
  function impFor(im, sym) {
    if (sym === 'ADA') return im;
    if (!im.text) return null;
    const k = im.hash + '|' + sym;
    return _fileCache[k] || (_fileCache[k] = C.importFile(im.fileName, im.text, sym));
  }
  /** účty z exportu Ledger Live (sloupec Account xpub = xpub u BTC, adresa u ETH/SOL) */
  function ledgerAccounts(sym) {
    const out = {};
    for (const im of state.imports || []) {
      if (im.format !== 'ledgerlive' || !im.text) continue;
      const P = C.parseCSV(im.text), H = P.header.map(h => h.toLowerCase());
      const iT = H.indexOf('currency ticker'), iX = H.indexOf('account xpub'), iN = H.indexOf('account name');
      if (iT < 0 || iX < 0) continue;
      for (const r of P.rows) if ((r[iT] || '').toUpperCase() === sym && r[iX]) out[r[iX].trim()] = { key: r[iX].trim(), name: r[iN] || sym };
    }
    return Object.values(out).filter(x => sym !== 'ETH' || /^0x[0-9a-fA-F]{40}$/.test(x.key));
  }
  function chainFor(sym) {
    if (sym === 'ADA') return { chain: state.chain || {}, outDest: state.outDest || {}, bal: state.chain && state.chain.info ? state.chain.info.total : null };
    const cd = CD(sym), red = cd.chain && Chains.REDUCE[sym] ? Chains.REDUCE[sym](cd.chain) : { chain: { txs: {}, rewards: [] }, outDest: {} };
    return { chain: red.chain, outDest: red.outDest, custodial: red.custodial || [], bal: cd.chain && cd.chain.balance != null ? cd.chain.balance + (red.balAdj || 0) : null };
  }
  function computeCoin(sym, otherIncome) {
    const c = COINS[sym] || {}, merged = importEventsFor(sym), chn = chainFor(sym);
    const prices = sym === 'ADA' ? (state.prices || {}) : { ada_usd: (state.prices && state.prices.coins && state.prices.coins[sym]) || {}, cnb: (state.prices || {}).cnb || {} };
    const settings = Object.assign({}, state.settings, { otherCryptoIncome: otherIncome || state.settings.otherCryptoIncome || {} });
    const res = C.compute({
      importEvents: merged.events, chain: chn.chain, prices, settings, overrides: sym === 'ADA' ? state.overrides : CD(sym).overrides,
      discoveredNet: sym === 'ADA' ? (state.discoveredNet || {}) : {}, outDest: chn.outDest,
      balances: { chainTotal: chn.bal }, sym, dp: c.dp != null ? c.dp : 4, minAmt: c.minAmt != null ? c.minAmt : 0, gapTol: c.gapTol != null ? c.gapTol : 0.001
    });
    res.duplicates = merged.duplicates;
    res.custodial = chn.custodial || [];
    if (res.custodial.length) res.warnings.unshift({ type: 'custodial', text: `Adresa ${res.custodial.map(a => a.slice(0, 10) + '…').join(', ')} vypadá jako vkladová adresa burzy (burza z ní prostředky hned přesouvá spolu s cizími) – nepočítá se jako tvoje peněženka. Odeber ji v Nastavení.` });
    return res;
  }
  /** mince, které mají nějaká data (exporty, adresy) */
  function coinsWithData() {
    return Object.keys(COINS).filter(sym => {
      if (sym === 'ADA') return true;
      const cd = (state.coinData || {})[sym];
      if (cd && ((cd.settings.sources || []).length || cd.chain)) return true;
      return importEventsFor(sym).events.length > 0;
    });
  }
  let ALL = null;
  function recompute() {
    // 1) každá mince zvlášť, 2) limit 100 000 Kč je společný -> příjmy ostatních mincí se přičtou
    const syms = coinsWithData(), own = {};
    for (const sym of syms) own[sym] = computeCoin(sym, state.settings.otherCryptoIncome || {});
    const manual = state.settings.otherCryptoIncome || {};
    const withOthers = sym => {
      const o = Object.assign({}, manual);
      for (const x of syms) if (x !== sym) for (const y of Object.values(own[x].years)) { const base = state.settings.includeExemptInLimit ? y.income : y.incomeNon; if (base) o[y.year] = (+(o[y.year] || 0)) + base; }
      return o;
    };
    ALL = { syms, R: {} };
    for (const sym of syms) ALL.R[sym] = computeCoin(sym, withOthers(sym));
    R = ALL.R[SYM === 'ALL' ? 'ADA' : SYM] || computeCoin(SYM === 'ALL' ? 'ADA' : SYM, withOthers(SYM));
  }

  /* ---------- Přehled ---------- */
  function vPrehled() {
    const s = R.summary, y = R.years[s.year] || {};
    const rewTot = Object.values(R.years).reduce((a, o) => ({ n: a.n + o.rewardsCount, ada: a.ada + o.rewardsAda, czk: a.czk + o.rewardsCzk, usd: a.usd + o.rewardsUsd }), { n: 0, ada: 0, czk: 0, usd: 0 });
    const usedPct = Math.min(100, s.usedLimit / R.settings.limitCzk * 100);
    let h = '';
    if (isADA() && !state.settings.stakeAddresses.length && !state.imports.length) h += `<div class="warnbox">Začni v <b>Nastavení</b>: zadej stake adresu (stake1…) a nahraj exporty z burz. Pak klikni <b>Aktualizovat</b>.</div>`;
    h += vPortfolio(s);
    h += chartsCard([SYM]);
    h += R.warnings.map(w => `<div class="warnbox">⚠ ${esc(w.text)}</div>`).join('');
    h += `<div class="grid">
      <div class="card kpi"><h3>Celkem ${SYM}</h3><div class="v">${N(s.total)} ${SY}</div><div class="s">${MA(s.total)}</div><div class="s">cena ${U(s.priceUsd)} / ${s.priceCzk != null ? N(s.priceCzk, 2) + ' Kč' : '–'} (${DK(s.lastPriceDay)})</div></div>
      <div class="card kpi"><h3>Drženo déle než 3 roky</h3><div class="v ok">${N(s.oldAda)} ${SY}</div><div class="s">osvobozeno časovým testem · ${MA(s.oldAda)}</div></div>
      <div class="card kpi"><h3>Drženo kratší dobu</h3><div class="v warn">${N(s.youngAda)} ${SY}</div><div class="s">${MA(s.youngAda)} · průměrná doba držení všeho ${N(s.avgHeldDays / 365.25, 1)} roku</div></div>
      ${rewTot.n ? '' : '<!--'}<div class="card kpi"><h3>Staking celkem</h3><div class="v">${N(rewTot.ada)} ${SY}</div><div class="s">${rewTot.n} odměn · ${CUR() === 'USD' ? U(rewTot.usd) : K(rewTot.czk)} (v den připsání)</div></div>${rewTot.n ? '' : '-->'}
    </div>`;
    h += `<div class="card"><h3>Rok ${s.year}: kolik můžeš prodat bez daně</h3>
      <div class="row2">Příjmy z prodejů krypta letos (pro limit): <b>${K(s.usedLimit)}</b> z ${K(R.settings.limitCzk)}</div>
      <div class="bar"><div style="width:${usedPct}%;background:${usedPct >= 100 ? 'var(--bad)' : 'var(--acc)'}"></div></div>
      <table><tr><td>${SYM} starší 3 let (osvobozeno vždy)</td><td class="n ok">${N(s.oldAda)} ${SY}</td><td class="n">${K(s.oldValue)}</td></tr>
      <tr><td>Mladší ${SYM}, které se ještě vejdou do limitu ${K(R.settings.limitCzk)}</td><td class="n warn">${N(s.youngSellable)} ${SY}</td><td class="n">${K(s.priceCzk != null ? s.youngSellable * s.priceCzk : null)}</td></tr>
      <tr><td>Zbývá do limitu (hodnotový test, bez ohledu na stáří)</td><td class="n">${N(s.limitAda)} ${SY}</td><td class="n">${K(s.remaining)}</td></tr>
      <tr><td><b>Celkem letos bez daně</b></td><td class="n"><b>${N(s.freeTotal)} ${SY}</b></td><td class="n"><b>${K(s.priceCzk != null ? s.freeTotal * s.priceCzk : null)}</b></td></tr></table>
      <p class="small mut">Prodej jde metodou FIFO – nejdřív se prodávají nejstarší ${SYM}. ${R.settings.includeExemptInLimit ? 'Do limitu 100 000 Kč se započítávají i prodeje starších ADA (opatrnější varianta, lze změnit v Nastavení).' : 'Prodeje starších ADA se do limitu nezapočítávají (lze změnit v Nastavení).'} Limit je hrubý příjem ze všech kryptoměn za rok – prodeje jiných mincí zadej v záložce Daně. Při překročení limitu se daní celý příjem z mladších ADA, ne jen část nad limit.</p>
    </div>`;
    const um = Object.entries(s.unlock).sort();
    let cum = s.oldAda;
    h += `<div class="card"><h3>Kdy se další ${SYM} dostanou přes 3 roky</h3>${um.length ? `<div class="tw" style="max-height:320px"><table><tr><th>Měsíc</th><th class="n">Uvolní se</th><th class="n">Osvobozeno celkem</th></tr>` +
      um.map(([m, a]) => { cum += a; return `<tr><td>${m.split('-').reverse().join('/')}</td><td class="n">${N(a)} ${SY}</td><td class="n">${N(cum)} ${SY}</td></tr>`; }).join('') + '</table></div>' : '<span class="mut">Vše je už starší 3 let.</span>'}</div>`;
    const ex = Object.entries(s.exchanges).filter(([, v]) => Math.abs(v) > Math.max(COIN().minAmt, 1e-8));
    h += `<div class="card"><h3>Kontrola zůstatku</h3><table>
      <tr><td>Evidence (nákupy + odměny − prodeje − poplatky)</td><td class="n">${N(s.total)} ${SY}</td></tr>
      ${Object.entries((isADA() && state.chain && state.chain.info && state.chain.info.perStake) || {}).map(([st, b]) => `<tr><td>Peněženka ${esc(st.slice(0, 12))}…${esc(st.slice(-6))} (vč. odměn)</td><td class="n">${N(b.total)} ${SY}</td></tr>`).join('')}
      <tr><td>Blockchain celkem</td><td class="n">${s.chainBalance != null ? N(s.chainBalance)+ ' ' + SY : '–'}</td></tr>
      ${ex.map(([k, v]) => `<tr><td>Zůstatek na burze ${esc(k)} podle exportu</td><td class="n">${N(v)} ${SY}</td></tr>`).join('')}
      <tr><td><b>Rozdíl</b></td><td class="n"><b class="${s.gap != null && Math.abs(s.gap) > COIN().gapTol ? 'warn' : 'ok'}">${s.gap != null ? N(Math.abs(s.gap) < Math.pow(10, -DP) / 2 ? 0 : s.gap) + ' ' + SY : '–'}</b></td></tr></table>
      <p class="small mut">Kladný rozdíl = evidence má víc (asi nezapsaný prodej/platba nebo ${SYM} v jiné peněžence). Záporný = chybí nákup. Malý rozdíl dělají poplatky za výběr z burz. Burzy bez exportu výběrů (např. CoinBank Obchody) se do zůstatku nepočítají.</p></div>`;
    const dst = (R.destinations || []).filter(d => d.ada >= COIN().minAmt);
    if (dst.length || (s.gap != null && s.gap > COIN().gapTol)) {
      const nScript = dst.filter(d => d.script).length;
      const nOpen = dst.filter(d => d.ids.some(id => !(OVR()[id] && OVR()[id].kind))).length;
      h += `<div class="card"><h3>Kam odešly ${SYM}, které se nevrátily</h3>
        ${nScript ? `<div class="row2"><button class="btn small" data-destall="sell">Všechny chytré kontrakty (${nScript}) = swap/prodej</button><span class="small mut">swap ADA za token na DEX je směna = prodej za tržní cenu</span></div>` : ''}
        ${nOpen ? `<div class="row2"><button class="btn bad small" data-destrest="gift">Vše zbývající (${nOpen}) = ztraceno / scam</button><span class="small mut">neoznačené příjemce odepíše jako ztrátu bez příjmu – už označené nemění</span></div>` : ''}${dst.length ? `<div class="tw" style="max-height:420px"><table><tr><th>Příjemce</th><th class="n">Transakcí</th><th class="n">${SYM}</th><th>Období</th><th>Označit</th></tr>
        ${dst.slice(0, 40).map(d => {
          const link = d.stake ? `https://cardanoscan.io/stakekey/${d.stake}` : `${COIN().ex ? COIN().ex.addr : '#'}${d.addr}`;
          const short = x => esc(x.slice(0, 14) + '…' + x.slice(-6));
          const lbl = d.script ? short(d.addr) + ' <span class="pill warn">chytrý kontrakt – DEX/DeFi</span>'
            : d.stake ? short(d.stake) : short(d.addr || '') + (isADA() ? ' <span class="mut small">(adresa bez stake – často burza)</span>' : '');
          const kd = Object.entries(d.kinds).map(([k, n]) => `${KIND[k] || k} ${n}×`).join(', ');
          const done = d.ids.every(id => OVR()[id] && OVR()[id].kind);
          return `<tr style="${done ? 'opacity:.55' : ''}"><td><a href="${esc(link)}" target="_blank" rel="noopener" class="small">${lbl}</a><div class="small mut">${esc(kd)}</div></td><td class="n">${d.count}</td><td class="n">${N(d.ada)}</td><td class="small">${DK(d.first)}${d.first !== d.last ? ' – ' + DK(d.last) : ''}</td>
          <td>${d.stake && !d.script ? `<button class="btn small" data-addstake="${esc(d.stake)}">Moje peněženka</button> ` : ''}${!isADA() && COIN().chain && d.addr && !d.script ? `<button class="btn small" data-addsrc="${esc(d.addr)}">Moje peněženka</button> ` : ''}<button class="btn sec small" data-destkind="sell" data-dest="${esc(d.key)}">Burza/prodej</button> <button class="btn sec small" data-destkind="gift" data-dest="${esc(d.key)}">Ztráta/dar</button> <button class="btn sec small" data-destkind="" data-dest="${esc(d.key)}">Zrušit</button></td></tr>`;
        }).join('')}</table></div>` : '<span class="mut">Příjemci se zjistí při Aktualizovat.</span>'}
        <p class="small mut">Dokud příjemce neoznačíš, bere se to jako úbytek bez příjmu (evidence pak sedí se zůstatkem). ${isADA() ? 'Odkaz otevře příjemce na Cardanoscanu. „Moje peněženka“ přidá stake adresu (převody se pak vyruší).' : `Odkaz otevře příjemce v exploreru. „Moje peněženka“ přidá adresu mezi zdroje ${SYM} (převody se pak vyruší).`} „Burza/prodej“ označí všechny transakce tomuto příjemci jako prodej za tržní cenu v den odeslání – patří sem i směna za jinou kryptoměnu (úplatný převod). „Ztráta/dar“ jako úbytek bez příjmu (scam, ztracené ${SYM}, dar).</p></div>`;
    }
    h += `<p class="small mut">Poslední aktualizace: ${state.lastSync ? new Date(state.lastSync).toLocaleString('cs-CZ') : 'zatím ne'} · ${Platform.name} · v${C.VERSION}${R.duplicates ? ` · vyřazeno ${R.duplicates} duplicitních řádků z exportů` : ''}</p>`;
    return h;
  }

  const DONATE_BUILTIN = 'addr1q9fwf8s2mp3tea20l0p483staa2f9x4qk7l9zjqm8ka40gyweffndrftjdln9tk9nmmgwx0rys2svjfeen36xjkxhgjqp6nlxa';
  /* GitHub repozitář appky (účet/název) – kontrola nové verze a aktuální donate adresy. Prázdné = vypnuto. */
  const REPO = 'michalnet17/krypto-sprava';
  const vnum = v => String(v || '0').replace(/^v/i, '').split('.').slice(0, 3).map(x => parseInt(x, 10) || 0).reduce((a, x) => a * 1000 + x, 0);
  /** donate adresa: z GitHubu (jen platná ADA adresa), jinak zabudovaná */
  const donateAddr = () => { const d = state.update && state.update.donate; return d && C.bech32Valid(d, 'addr') ? d : DONATE_BUILTIN; };
  async function checkUpdate(force) {
    if (!REPO || state.settings.updateCheck === false) return;
    const u = state.update = state.update || {};
    if (!force && u.at && Date.now() - u.at < 20 * 3600000) return showUpdate();
    try {
      const r = await Platform.http('GET', `https://api.github.com/repos/${REPO}/releases/latest`, null, { 'Accept': 'application/vnd.github+json' });
      if (r.ok && r.status === 200) {
        const j = JSON.parse(r.body || '{}');
        if (j.tag_name && !j.draft && !j.prerelease) Object.assign(u, { latest: String(j.tag_name).replace(/^v/i, ''), url: /^https:\/\/github\.com\//.test(j.html_url || '') ? j.html_url : `https://github.com/${REPO}/releases/latest`, notes: String(j.body || '').slice(0, 600), name: String(j.name || '') });
      }
      const d = await Platform.http('GET', `https://raw.githubusercontent.com/${REPO}/main/donate.json`, null, {});
      if (d.ok && d.status === 200) { try { const a = String((JSON.parse(d.body || '{}').ada) || '').trim(); u.donate = C.bech32Valid(a, 'addr') ? a : null; } catch (e) { /* ponech poslední */ } }
      u.at = Date.now(); await save();
      if (force) status(u.latest && vnum(u.latest) > vnum(C.VERSION) ? `Je dostupná nová verze ${u.latest}.` : `Máš aktuální verzi (${C.VERSION}).`);
    } catch (e) { if (force) status('Kontrola verze selhala: ' + e.message, true); }
    showUpdate();
  }
  function showUpdate() {
    const bar = document.getElementById('updBar'), u = state.update || {};
    const on = REPO && state.settings.updateCheck !== false && u.latest && vnum(u.latest) > vnum(C.VERSION) && u.dismissed !== u.latest;
    bar.classList.toggle('hidden', !on); if (!on) return;
    const first = (u.notes || '').split(/\r?\n/).map(x => x.replace(/^[#*\-\s]+/, '').trim()).filter(Boolean).slice(0, 3);
    bar.innerHTML = `<b>Je dostupná nová verze ${esc(u.latest)}</b> (máš ${esc(C.VERSION)})${first.length ? ` – ${esc(first.join(' · '))}` : ''}
      <a class="btn small" href="${esc(u.url)}" target="_blank" rel="noopener">Stáhnout</a> <button class="btn sec small" id="updLater">Později</button>`;
  }
  /** tokeny na ADA peněženkách (bez NFT) s cenou z CoinGecko */
  function adaTokens() {
    const ch = state.chain || {}, meta = state.tokenMeta || {}, tp = state.tokenPrices || {};
    const fung = {}, nft = {};
    for (const a of ch.assets || []) {
      const key = a.policy + '.' + a.name;
      if (a.qty === 1 && !a.dec) { nft[a.policy] = (nft[a.policy] || 0) + 1; continue; }
      const f = fung[key] = fung[key] || { key, fp: a.fp, dec: a.dec, qty: 0 }; f.qty += a.qty;
    }
    const list = Object.values(fung).map(f => {
      const m = meta[f.key] || {}, p = tp[f.key] || {};
      const dec = m.decimals != null ? m.decimals : f.dec;
      const amount = f.qty / Math.pow(10, dec || 0);
      const parts = C.tokenParts(f.key, f.qty, { [f.key]: dec || 0 });
      const name = m.ticker || p.symbol || parts.name;
      const usd = p.usd != null ? amount * p.usd : null;
      return { f, m, p, dec, amount, amountTxt: parts.amount, name, full: m.name || '', usd };
    }).sort((a, b) => (b.usd || 0) - (a.usd || 0) || b.amount - a.amount);
    const tokUsd = list.reduce((a, t) => a + (t.usd || 0), 0);
    const nftCount = Object.values(nft).reduce((a, n) => a + n, 0);
    return { list, tokUsd, nftCount, nft };
  }
  /** kde mince leží: peněženky, staking, burzy (množství) */
  function locations(sym) {
    const r = ALL && ALL.R[sym]; if (!r) return [];
    const s = r.summary, c = COINS[sym] || {}, out = [];
    if (sym === 'ADA') {
      const per = (state.chain && state.chain.info && state.chain.info.perStake) || {};
      for (const [st, b] of Object.entries(per)) out.push({ label: 'Peněženka', addr: st, qty: b.total, kind: 'wallet' });
    } else {
      const cd = (state.coinData || {})[sym], chn = chainFor(sym);
      if (cd && cd.chain && chn.bal != null) {
        const stk = cd.chain.stakeBal ? Object.values(cd.chain.stakeBal).reduce((a, v) => a + v, 0) / Math.pow(10, cd.chain.dec || 9) : 0;
        if (chn.bal - stk > 1e-12) out.push({ label: 'Peněženka', qty: chn.bal - stk, kind: 'wallet' });
        if (stk > 0) out.push({ label: 'Staking', qty: stk, kind: 'stake' });
      }
    }
    for (const [k, v] of Object.entries(s.exchanges || {})) if (v > Math.max(c.minAmt || 0, 1e-8)) out.push({ label: k, qty: v, kind: 'exchange' });
    return out;
  }
  /** moje adresy pro export: zdroje, stake adresy, použité adresy se zůstatkem (detail = jen do CSV) */
  function myAddresses(sym) {
    const out = [];
    if (sym === 'ADA') {
      const ch = state.chain || {}, per = (ch.info && ch.info.perStake) || {};
      for (const st of state.settings.stakeAddresses || []) out.push({ type: 'stake adresa', addr: st, bal: per[st] ? per[st].total : null, note: per[st] && per[st].pool ? 'pool ' + per[st].pool.slice(0, 12) + '…' : '' });
      for (const [st, list] of Object.entries(ch.addresses || {})) for (const a of list) out.push({ type: 'platební adresa', addr: a, bal: null, note: 'pod ' + st.slice(0, 10) + '…', detail: true });
      return out;
    }
    const cd = (state.coinData || {})[sym]; if (!cd) return out;
    const ch = cd.chain || {}, dec = Math.pow(10, ch.dec || 8);
    for (const src of cd.settings.sources || []) out.push({ type: /^[xyz]pub/i.test(src) ? 'xpub (celý účet)' : 'adresa', addr: src, bal: ch.addrs && !Array.isArray(ch.addrs) && ch.addrs[src] && ch.addrs[src].bal != null ? ch.addrs[src].bal / dec : (sym !== 'BTC' && (cd.settings.sources || []).length === 1 ? ch.walletBal != null ? ch.walletBal : ch.balance : null) });
    if (sym === 'BTC' && ch.addrs) for (const [a, v] of Object.entries(ch.addrs)) if (v.src === 'xpub' && v.used) out.push({ type: v.chain ? 'adresa (drobné)' : 'adresa (příjem)', addr: a, bal: (v.bal || 0) / dec, note: `#${v.idx}`, detail: !v.bal });
    for (const a of ch.stakeAccts || []) out.push({ type: 'stake účet', addr: a, bal: ch.stakeBal && ch.stakeBal[a] != null ? ch.stakeBal[a] / 1e9 : null });
    return out;
  }
  function exportCtx() {
    return { state, ALL, COINS, KIND, FLOW, locations, adaTokens, addresses: myAddresses,
      overrides: sym => sym === 'ADA' ? state.overrides : CD(sym).overrides,
      save, status, saveFile: (n, m, c) => Platform.saveFile(n, m, c), printHtml: (h, t) => Platform.printHtml(h, t) };
  }
  /** grafy (koláče) – složení portfolia */
  function chartsCard(syms) {
    if (!window.Report) return '';
    const usdCzk = (ALL.R.ADA || R).summary.usdCzk;
    const byCoin = [], byPlace = {}, age = { old: 0, young: 0 };
    for (const sym of syms) {
      const r = ALL.R[sym]; if (!r) continue;
      const p = r.summary.priceCzk; if (p == null) continue;
      const loc = locations(sym), q = loc.reduce((a, l) => a + l.qty, 0);
      if (q * p > 0.5) byCoin.push({ label: sym, value: q * p, key: sym });
      for (const l of loc) { const k = l.kind === 'exchange' ? l.label : l.kind === 'stake' ? 'Staking' : 'Peněženky'; byPlace[k] = (byPlace[k] || 0) + l.qty * p; }
      age.old += r.summary.oldAda * p; age.young += r.summary.youngAda * p;
    }
    if (syms.includes('ADA')) { const t = adaTokens(); if (t.tokUsd && usdCzk) { byCoin.push({ label: 'Tokeny (ADA)', value: t.tokUsd * usdCzk, key: 'TOK' }); byPlace['Peněženky'] = (byPlace['Peněženky'] || 0) + t.tokUsd * usdCzk; } }
    const fmt = v => K(v);
    const parts = [];
    if (syms.length > 1 && byCoin.length) parts.push(Report.donut(byCoin, { title: 'Podle mincí', fmt }));
    const pl = Object.entries(byPlace).filter(([, v]) => v > 0.5).map(([label, value]) => ({ label, value }));
    if (pl.length) parts.push(Report.donut(pl, { title: 'Kde to je', fmt }));
    if (age.old + age.young > 0.5) parts.push(Report.donut([{ label: 'Drženo > 3 roky', value: age.old, color: '#22c55e' }, { label: 'Drženo ≤ 3 roky', value: age.young, color: '#f59e0b' }], { title: 'Časový test', fmt }));
    return parts.length ? `<div class="card"><h3>Grafy portfolia</h3><div class="charts">${parts.join('')}</div><div class="small mut">Hodnoty v Kč podle aktuální ceny. Tokeny ADA jen ty, u kterých je známá cena.</div></div>` : '';
  }

  /* ---------- Portfolio (vždy nahoře na Přehledu) ---------- */
  function vPortfolio(s) {
    if (!isADA()) {
      const cd = CD(), rows = [];
      if (cd.chain && cd.chain.balance != null) {
        const stk = cd.chain.stakeBal ? Object.values(cd.chain.stakeBal).reduce((a, v) => a + v, 0) / Math.pow(10, cd.chain.dec || 9) : 0;
        if (stk > 0) { rows.push([`Peněženka (blockchain)`, cd.chain.balance - stk]); rows.push([`Stakováno <span class="small mut">(${cd.chain.stakeAccts.length} stake účtů, vč. odměn)</span>`, stk]); }
        else rows.push([`Peněženka (blockchain)`, cd.chain.balance]);
      }
      for (const [k, v] of Object.entries(s.exchanges || {})) if (v > Math.max(COIN().minAmt, 1e-8)) rows.push([`Burza ${esc(k)} <span class="small mut">(podle exportu)</span>`, v]);
      const tot = rows.reduce((a, r) => a + r[1], 0);
      return `<div class="card"><h3>Portfolio ${esc(SYM)}</h3><table>${rows.map(r => `<tr><td>${r[0]}</td><td class="n">${N(r[1])} ${SY}</td><td class="n">${MA(r[1])}</td></tr>`).join('') || `<tr><td class="mut">Zadej v Nastavení adresy/xpub nebo nahraj exporty z burz a klikni Aktualizovat.</td></tr>`}
        ${rows.length ? `<tr><td><b>Celkem ${esc(SYM)}</b></td><td class="n"><b>${N(tot)} ${SY}</b></td><td class="n"><b>${MA(tot)}</b></td></tr>` : ''}</table>
        <div class="small mut" style="margin-top:6px">Cena ${esc(SYM)} ${PU(s.priceUsd)} (${DK(s.lastPriceDay)})</div></div>`;
    }
    const ch = state.chain || {}, per = (ch.info && ch.info.perStake) || {};
    const short = x => esc(x.slice(0, 12) + '…' + x.slice(-6));
    const rows = [];
    for (const [st, b] of Object.entries(per)) rows.push([`Peněženka <a href="https://cardanoscan.io/stakekey/${esc(st)}" target="_blank" rel="noopener">${short(st)}</a>${b.rewards > 0.01 ? ` <span class="small mut">(z toho nevybrané odměny ${N(b.rewards)} ${SY})</span>` : ''}`, b.total]);
    for (const [k, v] of Object.entries(s.exchanges || {})) if (v > 0.01) rows.push([`Burza ${esc(k)} <span class="small mut">(podle exportu)</span>`, v]);
    const tot = rows.reduce((a, r) => a + r[1], 0);
    // tokeny
    const { list, tokUsd, nftCount } = adaTokens();
    const adaUsd = s.priceUsd;
    const logo = t => {
      const srcs = [t.p.image, t.m.logo ? 'data:image/png;base64,' + t.m.logo : ''].filter(Boolean);
      if (!srcs.length) return `<span class="tlogo">${esc(t.name.slice(0, 2))}</span>`;
      return `<img class="tlogo" src="${esc(srcs[0])}" data-alt="${esc(srcs[1] || '')}" data-txt="${esc(t.name.slice(0, 2))}" alt="" loading="lazy" onerror="logoFail(this)">`;
    };
    const TL = C.tokenLots(ch, Date.now());
    const testCell = t => {
      const r = TL[t.f.key]; if (!r || !r.lots.length) return '<span class="mut small">–</span>';
      const amt = q => C.fmtN(q / Math.pow(10, t.dec || 0), t.dec ? 2 : 0);
      if (!r.allFree) return '<span class="pill ok">vše osvobozeno</span>' + (r.migratedFrom ? `<div class="small mut">výměna z ${esc(C.tokenParts(r.migratedFrom, 1, {}).name)} ${DK(r.migratedOn)}</div>` : '');
      const part = r.exemptQty > 0 ? `<span class="ok">${amt(r.exemptQty)} ✓</span> · ` : '';
      const mig = r.migratedFrom ? `<div class="small mut">výměna z ${esc(C.tokenParts(r.migratedFrom, 1, {}).name)} ${DK(r.migratedOn)} – původní data nabytí zachována</div>` : '';
      return `${part}<span class="warn">${r.exemptQty > 0 ? 'zbytek' : 'od'} ${r.exemptQty > 0 ? 'od ' : ''}${DK(r.nextFree)}</span>${r.nextFree !== r.allFree ? `<div class="small mut">vše od ${DK(r.allFree)} · nabyto ${DK(r.firstDay)} – ${DK(r.lastDay)}</div>` : `<div class="small mut">nabyto ${DK(r.firstDay)}</div>`}${mig}`;
    };
    const tokRows = list.map(t => `<tr><td>${logo(t)}<b>${esc(t.name)}</b>${t.full && t.full !== t.name ? ` <span class="small mut">${esc(t.full)}</span>` : ''}</td>
      <td class="n">${esc(t.amountTxt)}</td>
      <td class="n">${t.p.usd != null ? `${PU(t.p.usd)}${adaUsd ? `<div class="small mut">${N(t.p.usd / adaUsd, 6)} ${SY}</div>` : ''}` : '<span class="mut">–</span>'}</td>
      <td class="n">${t.usd != null ? `<b>${MU(t.usd)}</b>${adaUsd ? `<div class="small mut">${N(t.usd / adaUsd, 2)} ${SY}</div>` : ''}` : '<span class="mut">–</span>'}</td>
      <td class="small">${testCell(t)}</td>
      <td class="small hide-m">${t.f.fp ? `<a href="https://cardanoscan.io/token/${esc(t.f.fp)}" target="_blank" rel="noopener">detail</a>` : ''}</td></tr>`).join('');
    const adaTotUsd = adaUsd != null ? tot * adaUsd : null;
    return `<div class="card"><h3>Portfolio</h3>
      <table>${rows.map(r => `<tr><td>${r[0]}</td><td class="n">${N(r[1])} ${SY}</td><td class="n">${MA(r[1])}</td></tr>`).join('') || '<tr><td class="mut">Zadej stake adresu v Nastavení a klikni Aktualizovat.</td></tr>'}
      ${rows.length ? `<tr><td><b>Celkem ${SYM}</b></td><td class="n"><b>${N(tot)} ${SY}</b></td><td class="n"><b>${MA(tot)}</b></td></tr>` : ''}
      ${list.length ? `<tr><td>Tokeny (${list.length}${nftCount ? `, + ${nftCount} NFT` : ''})</td><td class="n">${adaUsd ? N(tokUsd / adaUsd, 2)+ ' ' + SY : ''}</td><td class="n">${MU(tokUsd)}</td></tr>
      <tr><td><b>Portfolio celkem</b></td><td class="n"><b>${adaUsd ? N(tot + tokUsd / adaUsd, 2)+ ' ' + SY : ''}</b></td><td class="n"><b>${adaTotUsd != null ? MU(adaTotUsd + tokUsd) : '–'}</b></td></tr>` : ''}</table>
      ${ch.assets ? `<details style="margin-top:8px" ${list.length && list.length <= 10 ? 'open' : ''}><summary><b>Tokeny: ${list.length}</b>${nftCount ? ` · NFT: ${nftCount}` : ''}</summary>
        ${list.length ? `<div class="tw" style="max-height:360px"><table><tr><th>Token</th><th class="n">Množství</th><th class="n">Cena</th><th class="n">Hodnota</th><th>3 roky (bez daně)</th><th class="hide-m"></th></tr>${tokRows}</table></div>
        <div class="small mut">Ceny tokenů: CoinGecko (USD, přepočet na Kč kurzem ČNB). Token bez ceny CoinGecko nezná. Časový test u tokenů: FIFO podle data, kdy token přišel (swap, airdrop). Výměnu tokenu vydavatelem (např. WMT → WMTX, stejné množství v jedné transakci) appka pozná a ponechá původní data nabytí.${state.tokenPrices ? '' : ' Ceny se načtou po Aktualizovat.'}</div>` : '<span class="mut small">Žádné tokeny.</span>'}</details>` : '<div class="small mut" style="margin-top:6px">Tokeny se načtou po Aktualizovat.</div>'}
      <div class="small mut" style="margin-top:6px">Cena ${SYM} ${U(s.priceUsd)} / ${s.priceCzk != null ? N(s.priceCzk, 2) + ' Kč' : '–'} (${DK(s.lastPriceDay)}) · zobrazeno v ${CUR() === 'USD' ? 'USD' : 'Kč'}</div></div>`;
  }

  // logo se nenačetlo -> další zdroj, nakonec písmena
  window.logoFail = img => {
    if (img.dataset.alt) { const a = img.dataset.alt; img.dataset.alt = ''; img.src = a; return; }
    const sp = document.createElement('span'); sp.className = 'tlogo'; sp.textContent = img.dataset.txt || '?'; img.replaceWith(sp);
  };

  /* ---------- Odměny ---------- */
  function yearsSelect(list) {
    return `<select id="ySel"><option value="all">všechny roky</option>${list.map(y => `<option ${String(ui.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
  }
  function vOdmeny() {
    const rw = R.events.filter(e => e.rk === 'reward');
    const ys = [...new Set(rw.map(e => e.day.slice(0, 4)))].sort().reverse();
    const list = rw.filter(e => ui.year === 'all' || e.day.startsWith(ui.year));
    const t = list.reduce((a, e) => ({ ada: a.ada + e.ada, czk: a.czk + (e.valueCzk || 0), usd: a.usd + (e.usdPrice || 0) * e.ada }), { ada: 0, czk: 0, usd: 0 });
    return `<div class="card"><div class="filters">${yearsSelect(ys)} <button class="btn sec small" data-exp="rewards">Export CSV</button>
      <span class="mut">${list.length} odměn · <b>${N(t.ada)} ${SY}</b> · ${K(t.czk)} · ${U(t.usd)}</span></div>
      <div class="tw"><table><tr><th>Připsáno</th><th>Epocha</th><th class="n">${SYM}</th><th class="n">Cena $</th><th class="n">Cena Kč</th><th class="n">Hodnota $</th><th class="n">Hodnota Kč</th><th class="hide-m">Osvobozeno od</th></tr>
      ${list.map(e => `<tr><td>${D(e.date)}</td><td>${e.epoch}</td><td class="n">${N(e.ada, 6)}</td><td class="n">${e.usdPrice != null ? N(e.usdPrice, 4) : '–'}</td><td class="n">${e.czkPrice != null ? N(e.czkPrice, 3) : '–'}</td><td class="n">${e.usdPrice != null ? N(e.usdPrice * e.ada, 2) : '–'}</td><td class="n">${e.valueCzk != null ? N(e.valueCzk, 2) : '–'}</td><td class="hide-m">${DK(C.exemptFrom(e.day))}</td></tr>`).join('')}
      </table></div></div>`;
  }

  /* ---------- Loty ---------- */
  function vLoty() {
    const L = R.lots.slice().sort((a, b) => a.day < b.day ? -1 : 1);
    return `<div class="card"><div class="filters"><button class="btn sec small" data-exp="lots">Export CSV</button><span class="mut">${L.length} otevřených lotů (FIFO) · ${N(R.summary.total)} ${SY}</span></div>
      <div class="tw"><table><tr><th>Nabyto</th><th>Zdroj</th><th class="n">Zbývá ${SYM}</th><th class="n hide-m">Původně</th><th class="n">Drženo</th><th>3 roky</th><th class="n hide-m">Pořizovací cena</th></tr>
      ${L.map(l => `<tr><td>${DK(l.day)}</td><td>${esc(KIND[l.kind] || l.kind)} · ${esc(l.source)}</td><td class="n">${N(l.ada, 6)}</td><td class="n hide-m">${N(l.ada0, 6)}</td><td class="n">${N(l.heldDays / 365.25, 2)} r</td>
      <td>${l.exempt ? '<span class="pill ok">osvobozeno</span>' : `<span class="pill warn">od ${DK(l.exemptFrom)} (${l.daysToExempt} d)</span>`}</td><td class="n hide-m">${K(l.ada * l.costPer)}</td></tr>`).join('')}
      </table></div></div>`;
  }

  /* ---------- Pohyby ---------- */
  function vPohyby() {
    let list = R.events.filter(e => e.rk !== 'reward');
    const isTodo = e => !e.overridden && e.ada >= COIN().minAmt && (e.rk === 'incoming' || ((e.flow === 'withdraw' || e.flow === 'deposit') && e.unmatched));
    if (ui.onlyTodo) list = list.filter(isTodo);
    if (ui.q) { const q = ui.q.toLowerCase(); list = list.filter(e => (e.source + ' ' + e.note + ' ' + (e.hash || '')).toLowerCase().includes(q)); }
    const todo = R.events.filter(isTodo).length;
    const opts = e => {
      const base = e.flow === 'chain_in' || e.flow === 'deposit'
        ? [['', 'automaticky'], ['transfer', 'vlastní převod'], ['buy', 'nákup (zadej datum/cenu)'], ['income', 'příjem od třetí strany']]
        : e.flow ? [['', 'automaticky'], ['transfer', 'vlastní převod'], ['sell', 'prodej / swap / platba'], ['gift', 'ztráta / scam / dar (bez příjmu)']]
          : [['', 'automaticky'], ['transfer', 'ignorovat'], ['buy', 'nákup'], ['sell', 'prodej'], ['fee', 'poplatek']];
      const cur = (OVR()[e.id] || {}).kind || '';
      return `<select data-ov="${esc(e.id)}">${base.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    };
    return `<div class="card"><div class="filters">
      <label><input type="checkbox" id="onlyTodo" ${ui.onlyTodo ? 'checked' : ''}> jen k vyřešení (${todo}: příchozí bez dokladu, nespárované výběry/vklady burz)</label>
      <input type="text" id="q" placeholder="hledat (burza, hash…)" value="${esc(ui.q)}">
      <button class="btn sec small" data-exp="events">Export CSV</button></div>
      <p class="small mut">Výběry z burz a vklady se automaticky párují s transakcemi na blockchainu. Nespárované pohyby se berou jako převod mezi tvými peněženkami. Pokud šlo o prodej, platbu nebo příjem od někoho jiného, změň to tady.</p>
      <div class="tw"><table><tr><th>Datum</th><th>Zdroj</th><th>Typ</th><th class="n">${SYM}</th><th class="n">Hodnota Kč</th><th>Poznámka</th><th>Zařazení</th></tr>
      ${list.slice(0, 1500).map(e => {
        const ov = OVR()[e.id] || {};
        const typ = e.flow ? FLOW[e.flow] + (e.match ? ' ✓' : '') : (KIND[e.rk] || e.rk);
        const swapTxt = e.swap ? `<div class="small ok">swap: ${e.swap.dir === 'ada2tok' ? `${N(e.swap.ada, 2)} ADA → ${esc(Object.entries(e.swap.tokens).map(([k, q]) => C.tokenLabel(k, q, e.swap.dec)).join(', ') || 'token')}` : `${esc(Object.entries(e.swap.tokens).map(([k, q]) => C.tokenLabel(k, q, e.swap.dec)).join(', ') || 'token')} → ${N(e.swap.ada, 2)} ADA`}</div>` : '';
        const destTxt = e.flow === 'chain_out' && e.dest && e.dest.length ? `<div class="small mut">→ ${e.dest.slice().sort((a, b) => b.ada - a.ada).slice(0, 2).map(x => esc((x.stake || x.addr || '').slice(0, 12) + '…')).join(', ')}</div>` : '';
        const auto = e.flow && !e.overridden ? (e.rk === 'incoming' ? `<div class="small warn">nabyto v den příchodu: ${N(e.qty, 2)} ${SY}${e.coveredAda > 1e-6 ? ` (+ ${N(e.coveredAda, 2)} ${SY} návrat vlastních)` : ''}</div>` : (!e.match ? '<div class="small mut">vlastní převod</div>' : '')) : '';
        const extra = (e.rk === 'buy' || e.rk === 'income' || e.rk === 'incoming') && e.flow ? `<div class="row2 small">nabyto <input type="text" size="10" placeholder="RRRR-MM-DD" data-acq="${esc(e.id)}" value="${esc(ov.acqDate || '')}"> cena Kč <input type="number" style="width:90px" data-czk="${esc(e.id)}" value="${ov.czk != null ? ov.czk : ''}"></div>` : '';
        const sellCzk = e.rk === 'sell' && e.flow ? `<div class="row2 small">příjem Kč <input type="number" style="width:90px" data-czk="${esc(e.id)}" value="${ov.czk != null ? ov.czk : ''}" placeholder="tržní"></div>` : '';
        return `<tr class="${isTodo(e) ? 'unm' : ''}"><td>${D(e.date)}</td><td>${esc(e.source)}</td><td>${esc(typ)}${swapTxt}${auto}${destTxt}${e.match ? `<div class="small mut">↔ ${esc(e.matchSrc || (e.match.startsWith('c:') ? 'peněženka' : ''))}</div>` : ''}</td>
        <td class="n">${N(e.ada, 6)}</td><td class="n">${e.valueCzk != null && e.rk !== 'transfer' ? N(e.valueCzk, 2) : ''}</td>
        <td class="small">${esc(e.note || '')}${e.hash ? `<div><a class="mut" href="${COIN().ex ? COIN().ex.tx : '#'}${esc(e.hash)}" target="_blank" rel="noopener">${esc(e.hash.slice(0, 12))}…</a></div>` : ''}</td>
        <td>${e.flow || e.source !== 'Peněženka' ? opts(e) : ''}${extra}${sellCzk}</td></tr>`;
      }).join('')}</table></div></div>`;
  }

  /* ---------- Daně ---------- */
  function vDane() {
    const Y = Object.values(R.years).sort((a, b) => b.year - a.year);
    const S = R.settings;
    let h = `<div class="card"><h3>Souhrn po letech</h3><div class="tw"><table><tr><th>Rok</th><th class="n">Prodáno ${SYM}</th><th class="n">Příjem z prodejů</th><th class="n">z toho > 3 roky</th><th class="n">Krypto mimo appku (Kč)</th><th class="n">Základ pro limit</th><th>Limit 100k</th><th class="n">Zdanitelný zisk</th><th class="n">Staking (Kč)</th></tr>
    ${Y.map(y => `<tr><td><b>${y.year}</b></td><td class="n">${N(y.salesAda)}</td><td class="n">${K(y.income)}</td><td class="n">${K(y.incomeExempt)}</td>
      <td class="n"><input type="number" style="width:100px" data-other="${y.year}" value="${(state.settings.otherCryptoIncome || {})[y.year] || ''}" placeholder="0">${(y.otherCrypto || 0) - (+((state.settings.otherCryptoIncome || {})[y.year] || 0)) > 0.5 ? `<div class="small mut">+ jiné mince v appce ${K((y.otherCrypto || 0) - (+((state.settings.otherCryptoIncome || {})[y.year] || 0)))}</div>` : ''}</td>
      <td class="n">${y.oldRegime ? '–' : K(y.limitBase)}</td><td>${y.oldRegime ? (y.salesAda > 0 ? '<span class="pill">před 2025</span>' : '') : (y.salesAda > 0 || y.otherCrypto ? (y.withinLimit ? '<span class="pill ok">v limitu</span>' : '<span class="pill bad">překročen</span>') : '')}</td>
      <td class="n">${y.salesAda > 0 && (y.oldRegime || y.taxableSales) ? K(y.taxableSales) + (y.oldRegime ? '<div class="small mut">zisk, starý režim</div>' : '') : '–'}</td><td class="n">${K(y.rewardsCzk)}${S.stakingTaxedOnReceipt ? '' : ' <span class="mut small">(jen evidence)</span>'}</td></tr>`).join('')}
    </table></div>
    <p class="small mut">Časový test a limit 100 000 Kč platí pro krypto od roku 2025. U starších let je jen informativní zisk (příjem − pořizovací cena FIFO). Zdanitelný zisk od 2025 = příjem z ADA držených ≤ 3 roky − jejich pořizovací cena (FIFO), jen když roční příjmy překročí limit. Staking: ${S.stakingTaxedOnReceipt ? 'odměny se berou jako příjem v den připsání (§ 10) a jejich hodnota je zároveň pořizovací cenou.' : 'odměny se jen evidují, pořizovací cena = 0.'} Nejsem daňový poradce, výsledky si nech zkontrolovat.</p>
    <button class="btn sec small" data-exp="years">Export souhrnu</button> <button class="btn sec small" data-exp="sales">Export prodejů</button></div>`;
    const sales = R.sales.slice().sort((a, b) => b.day < a.day ? -1 : 1);
    h += `<div class="card"><h3>Prodeje (FIFO)</h3>${sales.length ? `<div class="tw"><table><tr><th>Datum</th><th>Burza</th><th class="n">${SYM}</th><th class="n">Příjem</th><th class="n">Osvobozeno ADA</th><th class="n">Mladší ADA</th><th class="n">Náklady mladších</th><th>Ocenění</th></tr>
      ${sales.map(s => `<tr><td>${DK(s.day)}</td><td>${esc(s.source)}</td><td class="n">${N(s.ada)}</td><td class="n">${K(s.income)}</td><td class="n ok">${N(s.adaExempt)}</td><td class="n warn">${N(s.adaNon)}</td><td class="n">${K(s.costNon)}</td><td class="small mut">${esc(s.valueSrc)}${s.swap ? '<div class="ok">swap ADA → ' + esc(Object.entries(s.swap.tokens).map(([k, q]) => C.tokenLabel(k, q, s.swap.dec)).join(', ')) + '</div>' : ''}</td></tr>`).join('')}</table></div>` : '<span class="mut">Žádné prodeje.</span>'}</div>`;
    return h;
  }

  /* ---------- Nastavení ---------- */
  function vNastaveni() {
    const S = state.settings;
    if (!isADA()) return vCoinSettings() + vSharedSettings();
    const bad = S.stakeAddresses.filter(a => !C.bech32Valid(a) && !C.bech32Valid(a, 'addr'));
    const ch = state.chain || {}, adr = ch.addresses || {}, per = (ch.info && ch.info.perStake) || {};
    const stakeList = S.stakeAddresses.filter(a => C.bech32Valid(a)).map(st => {
      const list = adr[st], b = per[st];
      return `<details class="card" style="margin:6px 0;padding:8px 10px"><summary><span class="small">${esc(st)}</span><br>
        <b>${list ? list.length + ' adres' : 'adresy se načtou po Aktualizovat'}</b>${b ? ` · zůstatek ${N(b.total)} ${SY} (z toho odměny ${N(b.rewards)} ${SY})${b.pool ? ' · pool ' + esc(b.pool.slice(0, 14)) + '…' : ''}` : ''}</summary>
        ${list ? `<div class="small mut" style="word-break:break-all;margin-top:6px">${list.map(esc).join('<br>')}</div>` : ''}</details>`;
    }).join('');
    return `<div class="card"><h3>Stake adresy</h3>
      <textarea id="stakes" placeholder="stake1u…  nebo  addr1…  (jedna na řádek)">${esc(S.stakeAddresses.join('\n'))}</textarea>
      ${bad.length ? `<div class="bad small">Neplatná adresa: ${esc(bad.join(', '))}</div>` : ''}
      <div class="small mut">Zadej stake adresu (stake1…) nebo libovolnou adresu peněženky (addr1…) – stake adresa se dohledá. Všechny adresy pod stake klíčem se načtou automaticky. Máš-li víc peněženek/účtů Ledgeru, zadej každou.</div>
      <div class="row2">Koios API token (nepovinné, zvýší limity): <input type="text" id="token" value="${esc(S.koiosToken || '')}" style="flex:1;min-width:160px"></div>
      <div class="row2">CoinGecko demo API klíč (nepovinné, pro ceny tokenů – zdarma na coingecko.com): <input type="text" id="cgKey" value="${esc(S.cgKey || '')}" style="flex:1;min-width:160px"></div>
      <button class="btn" id="saveStakes">Uložit a načíst</button>
      ${stakeList}
      ${(R.discovered || []).length ? `<div class="warnbox" style="margin-top:10px"><b>Nalezené další peněženky</b> (šly na ně výběry z burz):${R.discovered.map(d => `<div class="row2"><span class="small" style="word-break:break-all">${esc(d.stake)}</span><span class="small mut">${d.count}× výběr, ${N(d.ada)} ${SY} (${esc(d.sources.join(', '))})</span><button class="btn small" data-addstake="${esc(d.stake)}">Přidat</button></div>`).join('')}</div>` : ''}</div>
    ` + vSharedSettings();
  }
  function vCoinSettings() {
    const c = COIN(), cd = CD(), ch = cd.chain || {};
    const hint = { btc: 'xpub / ypub / zpub z Ledgeru (Ledger Live → účet → Upravit účet → Rozšířený veřejný klíč) nebo jednotlivé adresy bc1…/1…/3…', eth: 'adresa 0x… (Ethereum)', sol: 'adresa peněženky Solana' }[c.chain];
    const noText = (state.imports || []).filter(i => !i.text).length;
    let h = `<div class="card"><h3>${esc(c.name || SYM)} (${esc(SYM)})</h3>`;
    if (hint) {
      h += `<textarea id="coinSrc" placeholder="${esc(hint)} – jedna na řádek">${esc((cd.settings.sources || []).join('\n'))}</textarea>
        <div class="small mut">${esc(hint)}. Data z blockchainu: ${{ btc: 'mempool.space (záloha blockstream.info)', eth: 'Blockscout', sol: 'Solana RPC' }[c.chain]}.</div>
        <button class="btn" id="saveCoinSrc">Uložit a načíst</button>`;
      const led = ledgerAccounts(SYM).filter(x => !(cd.settings.sources || []).includes(x.key));
      if (led.length) h += `<div class="warnbox" style="margin-top:8px"><b>V exportu z Ledger Live je účet ${esc(SYM)}</b>, který tu chybí:${led.map(x => `<div class="row2"><span class="small" style="word-break:break-all">${esc(x.name)}: ${esc(x.key)}</span> <button class="btn small" data-addsrc="${esc(x.key)}">Přidat a načíst</button></div>`).join('')}<div class="small mut">${SYM === 'BTC' ? 'xpub pokryje všechny adresy účtu (Ledger dává na každý příjem novou adresu) – jednotlivé adresy pak můžeš smazat.' : ''}</div></div>`;
      if (ch.at) {
        const used = c.chain === 'btc' ? Object.values(ch.addrs || {}).filter(a => a.used).length : (ch.addrs || []).length;
        h += `<div class="small mut" style="margin-top:6px">Načteno ${new Date(ch.at).toLocaleString('cs-CZ')} · ${c.chain === 'btc' ? `použitých adres ${used} (prověřeno ${Object.keys(ch.addrs || {}).length})` : `adres ${used}`} · transakcí ${Object.keys(ch.raw || {}).length} · zůstatek ${N(ch.balance)} ${SY}</div>`;
        if (c.chain === 'btc') h += `<details><summary class="small">Použité adresy</summary><div class="small mut" style="word-break:break-all">${Object.entries(ch.addrs || {}).filter(([, a]) => a.used).map(([a, v]) => `${esc(a)} <span class="mut">(${esc(v.type || 'adresa')}${v.chain ? ', vracení' : ''})</span>`).join('<br>')}</div></details>`;
      }
    } else h += `<div class="small mut">Peněženky pro ${esc(SYM)} appka zatím nenačítá z blockchainu – data jsou jen z exportů burz (Nastavení níže). Zůstatek na burze se počítá z exportu.</div>`;
    if (noText) h += `<div class="warnbox" style="margin-top:8px">${noText} dříve nahraných exportů nemá uložený obsah – pro ostatní mince je nahraj znovu (stačí vybrat stejné soubory).</div>`;
    return h + '</div>';
  }
  /** skutečně držené množství: blockchain + kladné zůstatky na burzách (u ADA evidence, ta je odsouhlasená) */
  function holdings(sym, s) {
    if (sym === 'ADA') return s.total;
    const cd = (state.coinData || {})[sym], c = COINS[sym] || {};
    let q = cd && cd.chain && cd.chain.balance != null ? cd.chain.balance : 0;
    for (const v of Object.values(s.exchanges || {})) if (v > Math.max(c.minAmt || 0, 1e-8)) q += v;
    return q;
  }
  function vAll() {
    const rows = ALL.syms.map(sym => {
      const r = ALL.R[sym], s = r.summary, c = COINS[sym] || {};
      const qty = holdings(sym, s);
      const val = s.priceUsd != null ? qty * s.priceUsd : null;
      const y = r.years[s.year] || {};
      return { sym, c, r, s, qty, val, ownIncome: state.settings.includeExemptInLimit ? (y.income || 0) : (y.incomeNon || 0) };
    }).filter(x => x.qty > 1e-9 || x.ownIncome > 0 || x.sym === 'ADA');
    const totUsd = rows.reduce((a, x) => a + (x.val || 0), 0);
    const cy = new Date().getFullYear();
    const manual = +((state.settings.otherCryptoIncome || {})[cy] || 0);
    const used = rows.reduce((a, x) => a + x.ownIncome, 0) + manual;
    const lim = state.settings.limitCzk, pct = Math.min(100, used / lim * 100);
    // roky
    const ys = {};
    for (const x of rows) for (const y of Object.values(x.r.years)) { const o = ys[y.year] = ys[y.year] || { year: y.year, by: {}, tot: 0, rewards: 0 }; const inc = state.settings.includeExemptInLimit ? y.income : y.incomeNon; if (inc) { o.by[x.sym] = inc; o.tot += inc; } o.rewards += y.rewardsCzk || 0; }
    const yl = Object.values(ys).filter(o => o.tot > 0 || o.rewards > 0).sort((a, b) => b.year - a.year);
    return `<div class="card"><h3>Všechny mince – portfolio</h3><div class="tw"><table><tr><th>Mince</th><th class="n">Množství</th><th class="n">Cena</th><th class="n">Hodnota</th><th class="n">> 3 roky</th><th class="n">≤ 3 roky</th><th></th></tr>
      ${rows.map(x => `<tr><td><b>${esc(x.sym)}</b> <span class="small mut">${esc(x.c.name || '')}</span></td><td class="n">${C.fmtN(x.qty, x.c.dp || 4)}</td><td class="n">${PU(x.s.priceUsd)}</td><td class="n"><b>${MU(x.val)}</b></td>
        <td class="n ok">${C.fmtN(x.s.oldAda, x.c.dp || 4)}</td><td class="n warn">${C.fmtN(x.s.youngAda, x.c.dp || 4)}</td><td><button class="btn sec small" data-coin="${esc(x.sym)}">otevřít</button></td></tr>`).join('')}
      <tr><td><b>Celkem</b></td><td></td><td></td><td class="n"><b>${MU(totUsd)}</b></td><td></td><td></td><td></td></tr></table></div>
      <p class="small mut">Množství = blockchain + zůstatky na burzách. Sloupce 3 roky jsou z evidence (loty) – pokud se liší od množství, otevři minci a dořeš upozornění. ADA bez tokenů (tokeny viz Portfolio u ADA). Mince bez dat se nezobrazují.</p></div>
      ${chartsCard(rows.map(x => x.sym))}
      <div class="card"><h3>Rok ${cy}: společný limit 100 000 Kč (všechny kryptoměny)</h3>
        <div class="row2">Příjmy z prodejů/směn letos: <b>${K(used)}</b> z ${K(lim)}${manual ? ` <span class="small mut">(vč. ${K(manual)} mimo appku)</span>` : ''}</div>
        <div class="bar"><div style="width:${pct}%;background:${pct >= 100 ? 'var(--bad)' : 'var(--acc)'}"></div></div>
        <table>${rows.filter(x => x.ownIncome > 0).map(x => `<tr><td>${esc(x.sym)}</td><td class="n">${K(x.ownIncome)}</td></tr>`).join('') || '<tr><td class="mut">Letos zatím žádné prodeje.</td></tr>'}
        <tr><td><b>Zbývá do limitu</b></td><td class="n"><b class="${used > lim ? 'bad' : 'ok'}">${K(Math.max(0, lim - used))}</b></td></tr></table>
        <p class="small mut">Limit je ze zákona společný pro všechny kryptoaktiva – appka ho u každé mince počítá včetně prodejů ostatních mincí. Prodeje krypta, které appka nevidí, zadej u ADA v záložce Daně (sloupec „Krypto mimo appku“).</p></div>
      <div class="card"><h3>Příjmy z prodejů po letech (všechny mince)</h3><div class="tw"><table><tr><th>Rok</th>${rows.map(x => `<th class="n">${esc(x.sym)}</th>`).join('')}<th class="n">Celkem</th><th>Limit</th><th class="n">Staking (Kč)</th></tr>
        ${yl.map(o => `<tr><td><b>${o.year}</b></td>${rows.map(x => `<td class="n">${o.by[x.sym] ? K(o.by[x.sym]) : ''}</td>`).join('')}<td class="n"><b>${K(o.tot)}</b></td><td>${o.year < 2025 ? (o.tot ? '<span class="pill">před 2025</span>' : '') : (o.tot ? (o.tot + (+((state.settings.otherCryptoIncome || {})[o.year] || 0)) <= lim ? '<span class="pill ok">v limitu</span>' : '<span class="pill bad">překročen</span>') : '')}</td><td class="n">${o.rewards ? K(o.rewards) : ''}</td></tr>`).join('')}</table></div></div>`;
  }

  function vSharedSettings() {
    const S = state.settings, ALLM = SYM === 'ALL';
    return `<div class="card"><h3>Pravidla</h3>
      <label class="row"><input type="checkbox" id="stTax" ${S.stakingTaxedOnReceipt ? 'checked' : ''}> Staking odměny = příjem v den připsání (jejich hodnota je pořizovací cena)</label>
      <label class="row"><input type="checkbox" id="inclEx" ${S.includeExemptInLimit ? 'checked' : ''}> Do limitu 100 000 Kč započítávat i prodeje mincí starších 3 let (opatrnější)</label>
      <div class="row2">Roční limit: <input type="number" id="limit" value="${S.limitCzk}" style="width:120px"> Kč</div></div>
    <div class="card"><h3>Exporty z burz</h3>
      <div class="row2"><input type="file" id="files" multiple accept=".csv,.txt,text/csv,text/plain"> <span class="small mut">Binance (Transaction History), Coinmate, Anycoin (objednávky i transakce), CoinBank (Obchody), WhaleBooks (vč. Coinbase). Exporty jsou společné pro všechny mince – ${ALLM ? 'každá mince si z nich bere jen svoje řádky' : `tady jsou vidět jen řádky ${SYM}`}. Duplicity mezi soubory se vyřadí.</span></div>
      <table><tr><th>Soubor</th><th>Formát</th><th>Burza</th><th class="n">${ALLM ? 'Řádky podle mincí' : SYM + ' řádků'}</th><th>Pozn.</th><th></th></tr>
      ${state.imports.map((im, i) => {
        let cnt, note;
        if (ALLM) {
          const parts = Object.keys(COINS).map(c => { const r = impFor(im, c); return r && r.events.length ? `${c} ${r.events.length}` : null; }).filter(Boolean);
          cnt = parts.join(' · ') || (im.text ? '0' : '–'); note = im.text ? (im.notes || []).join(' ') : 'Nahraj znovu – starý import má uložené jen ADA.';
        } else {
          const r = impFor(im, SYM);
          cnt = r ? r.events.length : '–'; note = r ? (r.notes || []).join(' ') : 'Nahraj znovu – starý import má uložené jen ADA.';
        }
        return `<tr><td class="small">${esc(im.fileName)}</td><td>${esc(im.format)}</td><td>${esc(im.source)}</td><td class="n">${cnt}</td><td class="small mut">${esc(note)}</td><td><button class="btn bad small" data-del="${i}">×</button></td></tr>`;
      }).join('') || '<tr><td colspan="6" class="mut">Zatím nic.</td></tr>'}
      </table></div>
    ${pairCard()}
    <div class="card"><h3>Záloha</h3><button class="btn sec" id="backup">Uložit zálohu (JSON)</button> <label class="btn sec">Obnovit ze zálohy<input type="file" id="restore" accept=".json" class="hidden"></label>
      <button class="btn bad" id="resetChain">Znovu stáhnout blockchain</button></div>
    <div class="card"><h3>O aplikaci</h3>
      <p>Krypto správa <b>${C.VERSION}</b>${REPO ? ` · <a href="https://github.com/${esc(REPO)}" target="_blank" rel="noopener">github.com/${esc(REPO)}</a>` : ''}</p>
      ${REPO ? `<label class="row"><input type="checkbox" id="updChk" ${state.settings.updateCheck !== false ? 'checked' : ''}> Upozornit na novou verzi (1× denně se zeptá GitHubu na číslo poslední verze – nic se neodesílá)</label>
      <div class="row2"><button class="btn sec small" id="reportBug">Nahlásit chybu / nápad</button> <span class="small mut">otevře hlášení na GitHubu s verzí a logem – adresy se automaticky zamaskují</span></div>
      <div class="row2"><button class="btn sec small" id="updNow">Zkontrolovat teď</button> <span class="small mut">${state.update && state.update.at ? 'naposledy ' + new Date(state.update.at).toLocaleString('cs-CZ') + (state.update.latest ? ' · poslední verze ' + esc(state.update.latest) : '') : ''}</span></div>` : '<p class="small mut">Kontrola nových verzí není v této kopii nastavená.</p>'}</div>
    <div class="card" id="donateCard"><h3>Podpořit vývoj</h3>
      <div class="donate">${donateAddr() === DONATE_BUILTIN ? '<img src="donate.svg" alt="QR kód adresy pro dar" width="132" height="132">' : ''}
      <div><p class="small">Appka je zdarma. Pokud ti pomáhá, můžeš autorovi poslat libovolnou částku <b>ADA</b> (Cardano) na adresu:</p>
      <div class="mono small" style="word-break:break-all">${donateAddr()}</div>
      <div class="row2"><button class="btn sec small" id="copyDonate">Kopírovat adresu</button></div></div></div></div>`;
  }

  /* ---------- exporty CSV ---------- */
  function csv(rows) { return '﻿' + rows.map(r => r.map(v => { if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6).replace('.', ','); const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n'); }
  async function exportCsv(kind) {
    let rows, name = `ada_${kind}_${C.dayKey(Date.now())}.csv`;
    if (kind === 'rewards') rows = [['datum_pripsani', 'epocha', 'ada', 'cena_usd', 'cena_czk', 'hodnota_usd', 'hodnota_czk', 'pool', 'osvobozeno_od']].concat(R.events.filter(e => e.rk === 'reward').reverse().map(e => [e.day, e.epoch, e.ada, e.usdPrice, e.czkPrice, e.usdPrice != null ? e.usdPrice * e.ada : '', e.valueCzk, e.pool, C.exemptFrom(e.day)]));
    if (kind === 'lots') rows = [['nabyto', 'typ', 'zdroj', 'zbyva_ada', 'puvodne_ada', 'drzeno_dni', 'osvobozeno_od', 'osvobozeno', 'porizovaci_cena_czk']].concat(R.lots.map(l => [l.day, KIND[l.kind] || l.kind, l.source, l.ada, l.ada0, l.heldDays, l.exemptFrom, l.exempt ? 'ano' : 'ne', l.ada * l.costPer]));
    if (kind === 'events') rows = [['datum', 'zdroj', 'typ', 'zarazeni', 'ada', 'hodnota_czk', 'ocenění', 'parovano', 'hash', 'poznamka']].concat(R.events.slice().reverse().map(e => [new Date(e.date).toISOString(), e.source, e.flow || e.kind, KIND[e.rk] || e.rk, e.ada, e.valueCzk, e.valueSrc, e.match ? 'ano' : '', e.hash || '', e.note || '']));
    if (kind === 'years') rows = [['rok', 'prodano_ada', 'prijem_czk', 'prijem_osvobozeny_3roky', 'prijem_mladsi', 'naklady_mladsi', 'ostatni_krypto', 'zaklad_limit', 'v_limitu', 'zdanitelny_zisk', 'staking_ada', 'staking_czk', 'staking_usd', 'nakoupeno_ada', 'nakoupeno_czk']].concat(Object.values(R.years).sort((a, b) => a.year - b.year).map(y => [y.year, y.salesAda, y.income, y.incomeExempt, y.incomeNon, y.costNon, y.otherCrypto, y.limitBase, y.withinLimit ? 'ano' : 'ne', y.taxableSales, y.rewardsAda, y.rewardsCzk, y.rewardsUsd, y.buysAda, y.buysCzk]));
    if (kind === 'sales') { rows = [['datum_prodeje', 'burza', 'ada_dil', 'lot_nabyt', 'drzeno_dni', 'osvobozeno', 'prijem_czk', 'naklad_czk']]; R.sales.forEach(s => s.parts.forEach(p => rows.push([s.day, s.source, p.ada, p.lotDay || 'chybí', p.heldDays, p.exempt ? 'ano' : 'ne', p.income, p.cost]))); }
    const content = csv(rows);
    try { const p = await Platform.saveFile(name, 'text/csv', content); status('Uloženo: ' + (p || name)); }
    catch (e) { status('Export selhal: ' + e.message, true); }
  }

  /* ---------- render + události ---------- */
  /* ---------- synchronizace PC ↔ mobil ---------- */
  const ui2 = { scanning: false };
  function pairCard() {
    const p = state.pair;
    if (!Platform.isAndroid) {
      if (!p) return `<div class="card"><h3>Synchronizace s mobilem</h3>
        <p class="small">Mobil s appkou si přes <b>domácí Wi-Fi</b> převezme a průběžně vyměňuje nastavení s PC – adresy, xpub, exporty z burz a ruční úpravy. Data z blockchainu si mobil stahuje sám, takže funguje i mimo domov; synchronizovat je potřeba jen změny. Nic nejde přes cizí server, přenos je šifrovaný.</p>
        <button class="btn" id="pairOn">Zapnout a spárovat mobil</button></div>`;
      return `<div class="card"><h3>Synchronizace s mobilem</h3>
        <div class="pairbox"><div id="pairQr" class="pairqr"><span class="small mut">načítám…</span></div>
        <div style="flex:1;min-width:220px">
          <p class="small">V mobilu otevři <b>Krypto správa → Nastavení → Synchronizace s PC</b> a naskenuj QR kód. Mobil musí být na stejné Wi-Fi jako tohle PC.</p>
          <div id="pairStat" class="small mut"></div>
          <details class="small"><summary>Párovací kód jako text</summary><div id="pairCode" class="mono small" style="word-break:break-all;margin:6px 0"></div><button class="btn sec small" id="pairCopy">Kopírovat kód</button></details>
          <div class="row2"><button class="btn sec small" id="pairNew">Nový párovací kód</button> <button class="btn bad small" id="pairOff">Vypnout synchronizaci</button></div>
          <p class="small mut">Kód je tajný – kdo ho má, vidí tvoje adresy. Nový kód odpojí dříve spárovaný mobil.</p>
        </div></div></div>`;
    }
    if (!p) return `<div class="card"><h3>Synchronizace s PC</h3>
      <p class="small">Na PC otevři <b>Nastavení → Synchronizace s mobilem → Zapnout</b> a naskenuj zobrazený QR kód. Mobil musí být na stejné Wi-Fi.</p>
      ${ui2.scanning ? `<video id="pairVideo" class="pairvideo" muted></video><div class="row2"><button class="btn sec" id="pairScanStop">Zrušit skenování</button></div>`
        : `<div class="row2"><button class="btn" id="pairScan">Naskenovat QR z PC</button></div>`}
      <details class="small"><summary>Nebo vlož párovací kód</summary><textarea id="pairCodeIn" rows="3" style="width:100%" placeholder="KS1:…"></textarea><button class="btn sec small" id="pairGo">Spárovat</button></details></div>`;
    return `<div class="card"><h3>Synchronizace s PC</h3>
      <p class="small">Spárováno s PC (${esc((p.lastHost || p.hosts[0]) + ':' + p.port)}). Synchronizuje se při otevření appky, když jsi na stejné Wi-Fi jako PC; mimo domov appka normálně funguje dál.</p>
      <p class="small mut">${p.lastAt ? 'Naposledy ' + new Date(p.lastAt).toLocaleString('cs-CZ') + ' · ' + ({ same: 'beze změn', pull: 'převzato z PC', push: 'odesláno do PC' }[p.lastAct] || '') : 'Zatím nesynchronizováno.'}</p>
      <div class="row2"><button class="btn" id="pairSync">Synchronizovat teď</button> <button class="btn bad small" id="pairUnpair">Zrušit spárování</button></div></div>`;
  }
  async function fillPair() {
    const p = state.pair, box = $('#pairQr'); if (!box || !p || p.role !== 'pc') return;
    const info = await PR.pcInfo();
    if (!info) return;
    const st = $('#pairStat');
    if (!info.enabled || !info.running) {
      box.innerHTML = ''; if (st) st.innerHTML = `<span style="color:#fca5a5">Server pro mobil neběží${info.error ? ' (' + esc(info.error) + ')' : ''}. Dej „Nový párovací kód“, případně restartuj appku.</span>`; return;
    }
    if (!info.ips.length) { box.innerHTML = ''; if (st) st.innerHTML = '<span style="color:#fca5a5">PC není připojené k žádné domácí síti.</span>'; return; }
    const code = Pair.code(info.ips, info.port, p.k);
    if (box.dataset.code !== code) { box.innerHTML = Pair.qrSvg(code); box.dataset.code = code; }
    const c = $('#pairCode'); if (c && c.textContent !== code) c.textContent = code;
    if (st) st.textContent = `Adresa PC: ${info.ips.join(', ')} · port ${info.port}` + (info.lastPhone ? ' · mobil naposledy ' + new Date(info.lastPhone).toLocaleString('cs-CZ') : ' · mobil se zatím nepřipojil');
  }
  async function pairHandle(id) {
    try {
      if (id === 'pairOn' || id === 'pairNew') {
        if (id === 'pairNew' && !confirm('Vytvořit nový párovací kód? Dosud spárovaný mobil se odpojí a bude potřeba ho spárovat znovu.')) return true;
        await PR.pcEnable(); render(); return true;
      }
      if (id === 'pairOff') { if (!confirm('Vypnout synchronizaci s mobilem?')) return true; await PR.pcDisable(); render(); return true; }
      if (id === 'pairCopy') { const c = $('#pairCode'); if (c) { await navigator.clipboard.writeText(c.textContent); status('Párovací kód zkopírován.'); } return true; }
      if (id === 'pairScan') {
        ui2.scanning = true; render();
        const v = $('#pairVideo');
        try {
          await PR.scan(v, async code => { ui2.scanning = false; render(); await PR.phonePair(code); render(); });
        } catch (e) { ui2.scanning = false; render(); status('Kamera nejde spustit (' + (e.name || e.message) + '). Povol appce kameru, nebo vlož párovací kód ručně.', true); }
        return true;
      }
      if (id === 'pairScanStop') { PR.stopScan(); ui2.scanning = false; render(); return true; }
      if (id === 'pairGo') { const t = $('#pairCodeIn'); await PR.phonePair(t ? t.value : ''); render(); return true; }
      if (id === 'pairSync') { await PR.phoneSync({ manual: true }); return true; }
      if (id === 'pairUnpair') { if (!confirm('Zrušit spárování s PC? Data v mobilu zůstanou.')) return true; await PR.phoneUnpair(); render(); return true; }
    } catch (e) { status('Synchronizace: ' + e.message, true); return true; }
    return false;
  }

  function render() {
    SYM = state.coin || 'ADA';
    if (SYM !== 'ALL' && !COINS[SYM]) SYM = 'ADA';
    SY = SYM === 'ALL' ? '' : COIN().sy; DP = SYM === 'ALL' ? 2 : COIN().dp;
    recompute();
    const sel = $('#coinSel');
    if (sel) {
      const opts = ['ALL', ...Object.keys(COINS)];
      const have = new Set(ALL.syms);
      sel.innerHTML = opts.map(o => `<option value="${o}" ${o === SYM ? 'selected' : ''}>${o === 'ALL' ? 'Všechny mince' : o + (have.has(o) ? '' : ' (bez dat)')}</option>`).join('');
    }
    const allMode = SYM === 'ALL';
    const hasRw = isADA() || (!allMode && R && R.events.some(e => e.rk === 'reward'));
    document.querySelectorAll('#tabs button').forEach(b => {
      const hide = allMode ? b.dataset.tab !== 'prehled' && b.dataset.tab !== 'nastaveni' : (b.dataset.tab === 'odmeny' && !hasRw);
      b.classList.toggle('hidden', hide);
    });
    if ((allMode && tab !== 'prehled' && tab !== 'nastaveni') || (tab === 'odmeny' && !hasRw)) tab = 'prehled';
    const v = allMode ? (tab === 'nastaveni' ? vSharedSettings : vAll) : { prehled: vPrehled, odmeny: vOdmeny, loty: vLoty, pohyby: vPohyby, dane: vDane, nastaveni: vNastaveni }[tab];
    $('#view').innerHTML = v();
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab && !b.dataset.goto));
    $('#btnCur').textContent = CUR() === 'USD' ? '$ → Kč' : 'Kč → $';
    const bt = allMode ? 'Krypto správa' : `${ICON[SYM] || ''} ${SYM}`.trim();
    $('#brandTxt').textContent = bt; document.title = bt;
    if (tab === 'nastaveni') fillPair();
  }

  async function handleFiles(files) {
    let n = 0;
    for (const f of files) {
      const text = await readText(f);
      const imp = C.importFile(f.name, text);
      const hash = simpleHash(text);
      state.imports = state.imports.filter(x => x.hash !== hash);
      imp.hash = hash; imp.importedAt = Date.now(); imp.text = text;
      state.imports.push(imp); n++;
      const per = Object.keys(COINS).map(c => { const r = impFor(imp, c); return r && r.events.length ? `${c} ${r.events.length}` : null; }).filter(Boolean);
      log(`${f.name}: ${imp.format} / ${imp.source} → ${per.join(', ') || 'žádné řádky sledovaných mincí'}${imp.notes.length ? ' · ' + imp.notes.join(' ') : ''}`);
    }
    await save(); render(); status(`Načteno souborů: ${n}`);
    setTimeout(() => $('#log').classList.add('hidden'), 6000);
  }
  function readText(f) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => { const buf = new Uint8Array(r.result); let t = new TextDecoder('utf-8').decode(buf); if (t.includes('�')) { try { t = new TextDecoder('windows-1250').decode(buf); } catch (e) { } } res(t); };
      r.onerror = rej; r.readAsArrayBuffer(f);
    });
  }
  function simpleHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + s.length; }

  async function syncOther(sym) {
    const c = COINS[sym] || {}, cd = CD(sym);
    log(`${sym}: aktualizuji…`);
    let chainErr = null;
    if (Chains.SYNC[sym] && (cd.settings.sources || []).length) { try { await Chains.SYNC[sym](cd, log, { save }); cd.lastSync = Date.now(); } catch (e) { chainErr = e; } await save(); }
    if (!chainErr && sym === 'BTC' && cd.chain) { // kam šly nespárované výběry z burz
      try {
        const r = computeCoin(sym, 0);
        const items = r.events.filter(e => e.kind === 'withdraw' && e.unmatched && e.hash).map(e => ({ hash: e.hash, net: e.net != null ? e.net : e.ada }));
        if (await Chains.btcWithdrawDest(cd, items, log)) await save();
      } catch (e) { log('BTC výběry: ' + e.message); }
    }
    await Chains.syncPrice(state, sym, log); await save();
    if (chainErr) throw chainErr;
  }
  let syncQueued = false;
  async function doSync() {
    if (busy) { syncQueued = true; status('Ještě běží předchozí aktualizace – po jejím dokončení se spustí znovu pro ' + SYM + '.'); return; }
    busy = true; $('#btnSync').disabled = true; $('#log').textContent = '';
    try {
      status('Aktualizuji…');
      const fails = [];
      if (SYM !== 'ADA') {
        const list = SYM === 'ALL' ? coinsWithData().filter(x => x !== 'ADA') : [SYM];
        for (const sym of list) { try { await syncOther(sym); } catch (e) { fails.push(`${sym}: ${e.message}`); log(`CHYBA ${sym}: ${e.message}`); } }
        const years = [];
        for (const sym of list) {
          importEventsFor(sym).events.forEach(e => years.push(new Date(e.date).getUTCFullYear()));
          const ch = chainFor(sym).chain; Object.values(ch.txs || {}).forEach(t => years.push(new Date(t.time).getUTCFullYear()));
          (ch.rewards || []).forEach(r => r.date && years.push(new Date(r.date).getUTCFullYear()));
        }
        await Sync.syncPrices(state, log, years.length ? Math.min(...years) : 2018);
        if (fails.length) { await save(); status('Aktualizace selhala – ' + fails.join(' · '), true); if (SYM !== 'ALL') return; }
        else if (SYM !== 'ALL') { CD().lastSync = Date.now(); await save(); status('Hotovo – ' + SYM + ' aktualizováno ' + new Date().toLocaleString('cs-CZ')); setTimeout(() => $('#log').classList.add('hidden'), 4000); return; }
      }
      await Sync.syncChain(state, log);
      await save();
      try {
        recompute();
        const items = R.events.filter(e => e.flow === 'withdraw' && e.unmatched && e.hash).map(e => ({ hash: e.hash, net: e.net != null ? e.net : e.ada, source: e.source }));
        await Sync.discover(state, items, log); await save();
        recompute();
        const outs = R.events.filter(e => e.flow === 'chain_out' && (!e.match || e.matchSrc === 'DEX swap') && e.ada >= 1).map(e => e.hash);
        await Sync.destinations(state, outs, log); await save();
        await Sync.syncTokens(state, log); await save();
      } catch (e) { log('Hledání dalších peněženek selhalo: ' + e.message); }
      const years = [];
      (state.imports || []).forEach(im => im.events.forEach(e => years.push(new Date(e.date).getUTCFullYear())));
      (state.chain && state.chain.rewards || []).forEach(r => years.push(new Date(C.epochStart(r.spendable)).getUTCFullYear()));
      await Sync.syncPrices(state, log, years.length ? Math.min(...years) : 2018);
      state.lastSync = Date.now();
      await save();
      if (!fails.length) { status('Hotovo – data aktualizována ' + new Date().toLocaleString('cs-CZ')); setTimeout(() => $('#log').classList.add('hidden'), 4000); }
    } catch (e) {
      log('CHYBA: ' + e.message); status('Aktualizace selhala: ' + e.message, true);
      await save();
    } finally { busy = false; $('#btnSync').disabled = false; render(); if (syncQueued) { syncQueued = false; setTimeout(doSync, 300); } }
  }

  document.addEventListener('click', async ev => {
    if (ev.target && ev.target.id && /^pair/.test(ev.target.id) && await pairHandle(ev.target.id)) return;
    const t = ev.target;
    if (t.closest('#tabs button')) {
      const b = t.closest('#tabs button'); tab = b.dataset.tab; if (!busy) $('#log').classList.add('hidden'); render();
      if (b.dataset.goto === 'donate') { const c = document.getElementById('donateCard'); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1600); } }
      return;
    }
    if (t.id === 'log' && !busy) { t.classList.add('hidden'); return; }
    if (t.id === 'btnSync') return doSync();
    if (t.id === 'reportBug') return openExternal(bugReportUrl());
    if (t.id === 'updNow') { await checkUpdate(true); return render(); }
    if (t.id === 'updLater') { (state.update = state.update || {}).dismissed = state.update.latest; await save(); return showUpdate(); }
    if (t.id === 'copyDonate') {
      let ok = false;
      try { await navigator.clipboard.writeText(donateAddr()); ok = true; } catch (e) {
        const ta = document.createElement('textarea'); ta.value = donateAddr(); document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch (e2) { /* nic */ } ta.remove();
      }
      return status(ok ? 'Adresa zkopírována – díky!' : 'Kopírování nejde, označ adresu ručně.', !ok);
    }
    if (t.id === 'btnExport') { if (!ALL) recompute(); return Report.open(exportCtx()); }
    if (t.dataset.coin) { state.coin = t.dataset.coin; tab = 'prehled'; await save(); return render(); }
    if (t.id === 'saveCoinSrc') {
      const v = $('#coinSrc'); CD().settings.sources = [...new Set(v.value.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean))];
      await save(); render(); status('Uloženo, načítám…'); return doSync(); // stažená data se nemažou – přidané adresy se jen doplní
    }
    if (t.id === 'btnCur') { state.settings.currency = CUR() === 'USD' ? 'CZK' : 'USD'; await save(); return render(); }
    if (t.dataset.exp) return exportCsv(t.dataset.exp);
    if (t.dataset.del != null) { state.imports.splice(+t.dataset.del, 1); await save(); return render(); }
    if (t.dataset.destrest) {
      let n = 0;
      for (const d of R.destinations || []) for (const id of d.ids) { if (OVR()[id] && OVR()[id].kind) continue; const o = OVR()[id] || {}; o.kind = t.dataset.destrest; setOv(id, o); n++; }
      await save(); render(); status(`Označeno ${n} transakcí jako ztráta.`); return;
    }
    if (t.dataset.destall) {
      let n = 0;
      for (const d of (R.destinations || []).filter(x => x.script)) for (const id of d.ids) { const o = OVR()[id] || {}; o.kind = t.dataset.destall; setOv(id, o); n++; }
      await save(); render(); status(`Označeno ${n} transakcí do chytrých kontraktů jako prodej.`); return;
    }
    if (t.dataset.dest != null && t.dataset.destkind != null) {
      const d = (R.destinations || []).find(x => x.key === t.dataset.dest);
      if (d) { for (const id of d.ids) { const o = OVR()[id] || {}; if (t.dataset.destkind) o.kind = t.dataset.destkind; else delete o.kind; setOv(id, o); } await save(); render(); status(t.dataset.destkind ? `Označeno ${d.ids.length} transakcí.` : `Označení zrušeno (${d.ids.length} transakcí) – zase se berou jako převod do neznámé peněženky.`); }
      return;
    }
    if (t.dataset.addsrc) {
      const src = CD().settings.sources; if (!src.includes(t.dataset.addsrc)) src.push(t.dataset.addsrc);
      await save(); render(); status('Adresa přidána, načítám…'); return doSync();
    }
    if (t.dataset.addstake) {
      if (!state.settings.stakeAddresses.includes(t.dataset.addstake)) state.settings.stakeAddresses.push(t.dataset.addstake);
      await save(); render(); status('Peněženka přidána, načítám…'); return doSync();
    }
    if (t.id === 'saveStakes') {
      readStakeInputs();
      await save(); render();
      if (!state.settings.stakeAddresses.length) { status('Zadej stake adresu (stake1…) nebo adresu peněženky (addr1…).', true); return; }
      status('Adresy uloženy, načítám…'); return doSync();
    }
    if (t.id === 'backup') { const p = await Platform.saveFile(`ada_dane_zaloha_${C.dayKey(Date.now())}.json`, 'application/json', JSON.stringify(Object.assign({}, state, { pair: undefined }))); status('Záloha: ' + p); return; }
    if (t.id === 'resetChain') { if (confirm('Smazat stažená data z blockchainu a stáhnout znovu?')) { state.chain = null; await save(); doSync(); } return; }
  });
  document.addEventListener('change', async ev => {
    const t = ev.target;
    if (t.id === 'files') return handleFiles([...t.files]);
    if (t.id === 'coinSel') { state.coin = t.value; await save(); return render(); }
    if (t.id === 'restore' && t.files[0]) { const s = JSON.parse(await readText(t.files[0])); if (s && s.settings) { const keep = state.pair; state = Object.assign(defState(), s); delete state.pair; if (keep) state.pair = keep; await save(); render(); status('Obnoveno ze zálohy.'); } return; }
    if (t.id === 'ySel') { ui.year = t.value; return render(); }
    if (t.id === 'onlyTodo') { ui.onlyTodo = t.checked; return render(); }
    // pole adres: jen uložit, NEpřekreslovat (jinak by zmizelo tlačítko, na které se právě kliká)
    if (t.id === 'stakes' || t.id === 'token' || t.id === 'cgKey') { readStakeInputs(); await save(); return; }
    if (t.id === 'updChk') { state.settings.updateCheck = t.checked; await save(); showUpdate(); if (t.checked) checkUpdate(true); return; }
    const handled = ['stTax', 'inclEx', 'limit'].includes(t.id) || t.dataset.other != null || t.dataset.ov != null || t.dataset.acq != null || t.dataset.czk != null;
    if (!handled) return;
    if (t.id === 'stTax') state.settings.stakingTaxedOnReceipt = t.checked;
    if (t.id === 'inclEx') state.settings.includeExemptInLimit = t.checked;
    if (t.id === 'limit') state.settings.limitCzk = +t.value || 100000;
    if (t.dataset.other) { const v = t.value.trim(); if (v === '') delete state.settings.otherCryptoIncome[t.dataset.other]; else state.settings.otherCryptoIncome[t.dataset.other] = +v; }
    if (t.dataset.ov) { const o = OVR()[t.dataset.ov] || {}; if (t.value) o.kind = t.value; else delete o.kind; setOv(t.dataset.ov, o); }
    if (t.dataset.acq) { const o = OVR()[t.dataset.acq] || {}; const v = t.value.trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) o.acqDate = v; else delete o.acqDate; setOv(t.dataset.acq, o); }
    if (t.dataset.czk) { const o = OVR()[t.dataset.czk] || {}; const v = t.value.trim(); if (v !== '') o.czk = +v; else delete o.czk; setOv(t.dataset.czk, o); }
    await save(); render();
  });
  document.addEventListener('input', ev => { if (ev.target.id === 'q') { ui.q = ev.target.value; clearTimeout(ui._t); ui._t = setTimeout(() => { render(); const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300); } });
  function readStakeInputs() {
    const a = $('#stakes'), k = $('#token');
    if (a) state.settings.stakeAddresses = [...new Set(a.value.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean))];
    if (k) state.settings.koiosToken = k.value.trim();
    const g = $('#cgKey'); if (g) state.settings.cgKey = g.value.trim();
  }
  function setOv(id, o) { if (Object.keys(o).length) OVR()[id] = o; else delete OVR()[id]; }

  (async () => {
    $('#ver').textContent = 'v' + C.VERSION;
    try { state = Object.assign(defState(), await Platform.loadState() || {}); }
    catch (e) { $('#view').innerHTML = `<div class="warnbox">Appka neběží přes server. Na PC ji spouštěj přes <b>START-PC.bat</b>.<br>${esc(e.message)}</div>`; return; }
    state.settings = Object.assign(defState().settings, state.settings);
    PR = Pair.create({ state: () => state, persist: () => Platform.saveState(state), refresh: render, status, log, isBusy: () => busy, http: Platform.http });
    render();
    const pg = await Platform.ping();
    // server se mění jen občas – varovat, jen když je starší než potřebná verze
    const SERVER_MIN = '0.4.0';
    if (pg && pg.version !== null && vnum(pg.version) < vnum(SERVER_MIN)) status(`Běží stará verze serveru (${pg.version || 'starší'}), potřeba je ${SERVER_MIN}+. Zavři všechna okna konzole Krypto správa a spusť START-PC.bat znovu.`, true);
    checkUpdate(false);
    if (state.pair && state.pair.role === 'pc') { PR.pcPoll(true); PR.publish(true); PR.pcCheckInbox(); }
    if (!Platform.isAndroid) setInterval(() => { if (state.pair && tab === 'nastaveni' && $('#pairStat')) fillPair(); }, 5000);
    if (state.pair && state.pair.role === 'phone') await PR.phoneSync({ auto: true });
    // automatická aktualizace, pokud jsou data starší než 12 h
    if (state.settings.stakeAddresses.length && (!state.lastSync || Date.now() - state.lastSync > 12 * 3600000)) doSync();
  })();
})();
