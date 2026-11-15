/* Stahování dat: Koios (blockchain Cardano), Binance (cena ADA/USD), ČNB (kurz USD/CZK, EUR/CZK). */
const Sync = (() => {
  const C = window.AdaCore;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const KOIOS = 'https://api.koios.rest/api/v1/';

  async function koios(path, body, token, query) {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    let last = '';
    for (let a = 0; a < 5; a++) {
      const r = await Platform.http(body ? 'POST' : 'GET', KOIOS + path + (query || ''), body ? JSON.stringify(body) : null, headers);
      if (r.ok && r.status < 300) return JSON.parse(r.body || '[]');
      last = `HTTP ${r.status} ${String(r.body || '').slice(0, 200)}`;
      if (r.status === 400 || r.status === 404 || r.status === 401 || r.status === 403) { const e = new Error(`Koios ${path}: ${last}`); e.status = r.status; throw e; }
      await sleep(1500 * (a + 1));
    }
    throw new Error(`Koios ${path}: ${last}`);
  }
  async function koiosAll(path, body, token) {
    let off = 0, all = [];
    for (;;) {
      const page = await koios(path, body, token, `?offset=${off}&limit=1000`);
      all = all.concat(page);
      if (page.length < 1000) break;
      off += 1000; await sleep(250);
    }
    return all;
  }

  /** adresa addr1… -> její stake adresa (stake1…) */
  async function resolveInputs(state, log) {
    const S = state.settings, token = S.koiosToken || '';
    const addrs = (S.stakeAddresses || []).filter(a => /^addr1/.test(a));
    if (!addrs.length) return;
    log(`Koios: hledám stake adresu pro ${addrs.length} addr1… adres`);
    const info = await koios('address_info', { _addresses: addrs }, token);
    const map = {};
    for (const i of info) if (i.stake_address) map[i.address] = i.stake_address;
    for (const a of addrs) log(map[a] ? `${a.slice(0, 16)}… → ${map[a]}` : `${a.slice(0, 16)}… nemá stake část nebo zatím nebyla použita – vynechávám`);
    S.stakeAddresses = [...new Set(S.stakeAddresses.map(a => map[a] || a).filter(a => !/^addr1/.test(a)))];
  }

  async function syncChain(state, log) {
    await resolveInputs(state, log);
    const S = state.settings;
    const stakes = (S.stakeAddresses || []).filter(a => C.bech32Valid(a));
    if (!stakes.length) { log('Není zadaná platná stake adresa – blockchain přeskočen.'); return; }
    const key = stakes.slice().sort().join(',');
    // v:2 – starší data (blok uložený bez detailů transakcí) se stáhnou znovu
    // v:3 – transakce i s tokeny (kvůli swapům na DEX) -> starší data se stáhnou znovu
    if (!state.chain || state.chain.key !== key || state.chain.v !== 3) state.chain = { v: 3, key, txs: {}, rewards: [], stakeSync: {}, info: null };
    const ch = state.chain, own = new Set(stakes), token = S.koiosToken || '';
    // všechny adresy pod stake klíčem
    log('Koios: adresy pod stake klíčem…');
    let aa;
    try { aa = await koiosAll('account_addresses', { _stake_addresses: stakes, _first_only: false, _empty: true }, token); }
    catch (e) { if (e.status === 400 || e.status === 404) aa = await koiosAll('account_addresses', { _stake_addresses: stakes }, token); else throw e; }
    ch.addresses = {};
    for (const r of aa) { const l = ch.addresses[r.stake_address] = ch.addresses[r.stake_address] || []; for (const a of r.addresses || []) if (!l.includes(a)) l.push(a); }
    for (const st of stakes) log(`${st.slice(0, 14)}…: ${(ch.addresses[st] || []).length} adres`);
    // transakce (inkrementálně) – poslední blok se uloží až po stažení detailů
    const newTx = new Map(), lastBlocks = {};
    for (const st of stakes) {
      const after = (ch.stakeSync[st] && ch.stakeSync[st].lastBlock) || 0;
      log(`Koios: transakce ${st.slice(0, 14)}… od bloku ${after}`);
      const list = await koiosAll('account_txs', { _stake_address: st, _after_block_height: after }, token);
      let maxB = after;
      for (const t of list) { if (!ch.txs[t.tx_hash]) newTx.set(t.tx_hash, t.block_time); if (t.block_height > maxB) maxB = t.block_height; }
      lastBlocks[st] = maxB;
    }
    const hashes = [...newTx.keys()];
    log(`Nových transakcí: ${hashes.length}`);
    // varianty dotazu tx_info: s parametry vstupů/výběrů, nebo jen hashe (podle verze Koios)
    const bodies = [b => ({ _tx_hashes: b, _inputs: true, _withdrawals: true, _assets: true }), b => ({ _tx_hashes: b, _inputs: true, _withdrawals: true }), b => ({ _tx_hashes: b })];
    let mode = ch.txInfoMode != null ? ch.txInfoMode : 0;
    for (let i = 0; i < hashes.length; i += 25) {
      const batch = hashes.slice(i, i + 25);
      let res = null;
      while (res === null) {
        try { res = await koios('tx_info', bodies[mode](batch), token); }
        catch (e) {
          if ((e.status === 400 || e.status === 404) && mode < bodies.length - 1) { mode++; log('tx_info: zkouším jiný formát dotazu'); continue; }
          throw e;
        }
      }
      if (res.length && !Array.isArray(res[0].inputs)) {
        throw new Error('Koios tx_info nevrací vstupy transakcí (inputs) – nelze spočítat pohyby. Pošli mi tuto chybu.');
      }
      ch.txInfoMode = mode;
      for (const tx of res) ch.txs[tx.tx_hash] = C.reduceTx(tx, own, newTx.get(tx.tx_hash));
      log(`Detaily transakcí ${Math.min(i + 25, hashes.length)}/${hashes.length}`);
      await sleep(250);
    }
    for (const st of stakes) ch.stakeSync[st] = { lastBlock: lastBlocks[st], at: Date.now() };
    // odměny
    log('Koios: staking odměny…');
    const rw = await koiosAll('account_rewards', { _stake_addresses: stakes }, token);
    ch.rewards = C.normRewards(rw, own);
    log(`Odměn celkem: ${ch.rewards.length}`);
    // aktuální zůstatek
    const info = await koios('account_info', { _stake_addresses: stakes }, token);
    let total = 0, rew = 0, utxo = 0; const pools = [], perStake = {};
    for (const a of info) {
      total += +(a.total_balance || 0); rew += +(a.rewards_available || 0); utxo += +(a.utxo || 0); if (a.delegated_pool) pools.push(a.delegated_pool);
      perStake[a.stake_address] = { total: +(a.total_balance || 0) / 1e6, rewards: +(a.rewards_available || 0) / 1e6, pool: a.delegated_pool || '', status: a.status || '' };
    }
    ch.info = { total: total / 1e6, rewardsAvail: rew / 1e6, utxo: utxo / 1e6, pools, perStake, at: Date.now() };
    // tokeny, které aktuálně držíš
    try {
      const as = await koiosAll('account_assets', { _stake_addresses: stakes }, token);
      const rows = [];
      for (const it of as) {
        const list = Array.isArray(it.asset_list) ? it.asset_list.map(a => Object.assign({ stake_address: it.stake_address }, a)) : [it];
        for (const a of list) rows.push({ stake: a.stake_address, policy: a.policy_id, name: a.asset_name || '', fp: a.fingerprint || '', dec: +(a.decimals || 0), qty: +(a.quantity || 0) });
      }
      ch.assets = rows; log(`Tokenů v peněženkách: ${rows.length}`);
    } catch (e) { log('Tokeny se nepodařilo načíst: ' + e.message); }
    log(`Zůstatek na blockchainu: ${C.fmtN(total / 1e6, 2)} ADA`);
  }

  /** výběry z burz s hashem, které nedorazily na zadané stake adresy -> najdi cílovou peněženku */
  async function discover(state, items, log) {
    const S = state.settings, token = S.koiosToken || '', own = new Set(S.stakeAddresses || []);
    state.discoveredNet = state.discoveredNet || {}; state.discoverDone = state.discoverDone || {};
    const todo = items.filter(i => !state.discoverDone[i.hash]);
    if (!todo.length) return;
    log(`Hledám cílové peněženky ${todo.length} výběrů z burz…`);
    const map = new Map(todo.map(i => [i.hash, i]));
    const hashes = [...map.keys()];
    for (let i = 0; i < hashes.length; i += 25) {
      const batch = hashes.slice(i, i + 25);
      let res;
      try { res = await koios('tx_info', { _tx_hashes: batch }, token); } catch (e) { log('Hledání peněženek: ' + e.message); return; }
      for (const tx of res) {
        const it = map.get(tx.tx_hash); if (!it) continue;
        let best = null, bd = Infinity;
        for (const o of tx.outputs || []) { const d = Math.abs(+(o.value || 0) / 1e6 - it.net); if (d < bd) { bd = d; best = o; } }
        const st = best && best.stake_addr;
        if (st && !own.has(st) && bd < 3) {
          const d = state.discoveredNet[st] = state.discoveredNet[st] || { count: 0, ada: 0, sources: [] };
          d.count++; d.ada += it.net; if (!d.sources.includes(it.source)) d.sources.push(it.source);
          log(`Výběr ${it.source} ${C.fmtN(it.net, 2)} ADA šel na jinou peněženku: ${st}`);
        }
        state.discoverDone[tx.tx_hash] = 1;
      }
      await sleep(250);
    }
  }

  /** příjemci nespárovaných odchozích transakcí (cizí výstupy tx) */
  async function destinations(state, hashes, log) {
    const S = state.settings, token = S.koiosToken || '', own = new Set(S.stakeAddresses || []);
    state.outDest = state.outDest || {};
    const todo = hashes.filter(h => !state.outDest[h]);
    if (!todo.length) return;
    log(`Zjišťuji příjemce ${todo.length} odchozích transakcí…`);
    for (let i = 0; i < todo.length; i += 25) {
      const batch = todo.slice(i, i + 25);
      let res;
      try { res = await koios('tx_info', { _tx_hashes: batch }, token); } catch (e) { log('Příjemci: ' + e.message); return; }
      for (const tx of res) {
        const m = {};
        for (const o of tx.outputs || []) {
          if (o.stake_addr && own.has(o.stake_addr)) continue;
          const addr = (o.payment_addr && o.payment_addr.bech32) || o.address || '';
          const k = o.stake_addr || addr; if (!k) continue;
          const x = m[k] = m[k] || { stake: o.stake_addr || null, addr, ada: 0 }; x.ada += +(o.value || 0) / 1e6;
        }
        state.outDest[tx.tx_hash] = Object.values(m);
      }
      await sleep(250);
    }
  }

  /** tokeny: logo/ticker z registru (Koios asset_info), cena v USD z CoinGecko */
  async function syncTokens(state, log) {
    const ch = state.chain || {}, S = state.settings, token = S.koiosToken || '';
    const fung = [...new Set((ch.assets || []).filter(a => !(a.qty === 1 && !a.dec)).map(a => a.policy + '.' + a.name))];
    if (!fung.length) return;
    state.tokenMeta = state.tokenMeta || {};
    const need = fung.filter(k => !state.tokenMeta[k]);
    for (let i = 0; i < need.length; i += 50) {
      const batch = need.slice(i, i + 50);
      try {
        const res = await koios('asset_info', { _asset_list: batch.map(k => k.split('.')) }, token);
        for (const a of res) {
          const m = a.token_registry_metadata || {};
          state.tokenMeta[a.policy_id + '.' + (a.asset_name || '')] = { ticker: m.ticker || '', name: m.name || '', decimals: m.decimals != null ? +m.decimals : null, logo: m.logo || '', fp: a.fingerprint || '' };
        }
      } catch (e) { log('Info o tokenech: ' + e.message); break; }
      await sleep(250);
    }
    for (const k of need) if (!state.tokenMeta[k]) state.tokenMeta[k] = { ticker: '', name: '', decimals: null, logo: '' };
    // CoinGecko: mapa Cardano tokenů (1× týdně) + aktuální ceny
    const H = S.cgKey ? { 'x-cg-demo-api-key': S.cgKey } : {};
    const cg = async url => {
      const r = await Platform.http('GET', 'https://api.coingecko.com/api/v3/' + url, null, H);
      if (!r.ok || r.status >= 300) { const e = new Error('CoinGecko HTTP ' + r.status); e.status = r.status; throw e; }
      return JSON.parse(r.body);
    };
    try {
      if (!state.cgMap || Date.now() - state.cgMap.at > 7 * 86400000) {
        log('CoinGecko: seznam Cardano tokenů…');
        const list = await cg('coins/list?include_platform=true');
        const map = {};
        for (const c of list) { const ca = c.platforms && c.platforms.cardano; if (ca) map[String(ca).toLowerCase().replace(/[^0-9a-f]/g, '')] = c.id; }
        state.cgMap = { at: Date.now(), map };
      }
      const ids = {};
      for (const k of fung) { const id = state.cgMap.map[k.replace('.', '').toLowerCase()]; if (id) ids[id] = k; }
      const idl = Object.keys(ids);
      state.tokenPrices = state.tokenPrices || {};
      for (let i = 0; i < idl.length; i += 100) {
        const mk = await cg('coins/markets?vs_currency=usd&ids=' + idl.slice(i, i + 100).join(','));
        for (const c of mk) state.tokenPrices[ids[c.id]] = { usd: c.current_price, image: c.image || '', id: c.id, symbol: (c.symbol || '').toUpperCase(), at: Date.now() };
      }
      log(`Ceny tokenů: ${idl.length} z ${fung.length} (zbytek CoinGecko nezná)`);
    } catch (e) {
      log(e.status === 401 || e.status === 403 || e.status === 429 ? 'CoinGecko odmítl dotaz (' + e.status + ') – v Nastavení zadej bezplatný CoinGecko demo API klíč.' : 'Ceny tokenů: ' + e.message);
    }
  }

  async function syncPrices(state, log, minYear) {
    const P = state.prices = state.prices || { ada_usd: {}, cnb: { USD: {}, EUR: {} }, cnbYears: {} };
    P.cnb = P.cnb || { USD: {}, EUR: {} }; P.cnbYears = P.cnbYears || {};
    // Binance klines ADAUSDT
    const days = Object.keys(P.ada_usd).sort();
    let start = days.length ? Date.parse(days[days.length - 1]) - 2 * 86400000 : Date.UTC(2018, 3, 17);
    log('Binance: ceny ADA/USD…');
    for (let guard = 0; guard < 20; guard++) {
      let r = null;
      for (const host of ['https://data-api.binance.vision', 'https://api.binance.com']) {
        r = await Platform.http('GET', `${host}/api/v3/klines?symbol=ADAUSDT&interval=1d&startTime=${start}&limit=1000`, null, {});
        if (r.ok && r.status < 300) break;
      }
      if (!r.ok || r.status >= 300) throw new Error('Binance klines: HTTP ' + r.status + ' ' + String(r.body).slice(0, 150));
      const arr = JSON.parse(r.body);
      Object.assign(P.ada_usd, C.parseKlines(arr));
      if (arr.length < 1000) break;
      start = arr[arr.length - 1][0] + 86400000;
    }
    // ČNB
    const cy = new Date().getFullYear();
    for (let y = Math.max(2015, minYear || 2018); y <= cy; y++) {
      if (P.cnbYears[y] === 'complete') continue;
      log(`ČNB: kurzy ${y}…`);
      const r = await Platform.http('GET', `https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/rok.txt?rok=${y}`, null, {});
      if (!r.ok || r.status >= 300) throw new Error('ČNB ' + y + ': HTTP ' + r.status);
      const res = C.parseCnbYear(r.body);
      Object.assign(P.cnb.USD, res.USD); Object.assign(P.cnb.EUR, res.EUR);
      if (y < cy && Object.keys(res.USD).length > 200) P.cnbYears[y] = 'complete';
      await sleep(150);
    }
    P.updated = Date.now();
  }

  return { syncChain, syncPrices, discover, destinations, syncTokens };
})();
