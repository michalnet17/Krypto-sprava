/* Synchronizace nastavení PC ↔ mobil přes domácí Wi-Fi.
   Přenáší se jen to, co zadal uživatel (adresy, xpub, exporty z burz, ruční úpravy, nastavení) –
   data z blockchainu si každé zařízení stahuje samo. Obsah je šifrovaný AES-GCM klíčem z QR kódu;
   server na PC ho jen předává a klíč nezná (dostane jen odvozený přístupový token). */
const Pair = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const LOCAL_SETTINGS = ['currency', 'updateCheck', 'theme'];   // čistě vzhled/zvyk daného zařízení – nesynchronizuje se

  const b64u = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const hex = u8 => Array.from(u8, x => x.toString(16).padStart(2, '0')).join('');
  const cat = (a, b) => { const u = new Uint8Array(a.length + b.length); u.set(a); u.set(b, a.length); return u; };
  const sha = async u8 => new Uint8Array(await crypto.subtle.digest('SHA-256', u8));

  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }

  /** co se synchronizuje */
  function cfgOf(st) {
    const settings = {};
    for (const [k, v] of Object.entries(st.settings || {})) if (!LOCAL_SETTINGS.includes(k)) settings[k] = v;
    const coins = {};
    for (const [sym, cd] of Object.entries(st.coinData || {})) {
      const s = (cd && cd.settings) || {}, o = (cd && cd.overrides) || {};
      const empty = !(s.sources && s.sources.length) && !Object.keys(s).some(k => k !== 'sources') && !Object.keys(o).length;
      if (!empty) coins[sym] = { settings: s, overrides: o };
    }
    return { settings, imports: st.imports || [], overrides: st.overrides || {}, coins };
  }
  async function hashCfg(cfg) { return hex(await sha(enc.encode(stable(cfg)))).slice(0, 32); }
  /** převzetí nastavení z druhého zařízení (data z blockchainu zůstávají, při další aktualizaci se doplní) */
  function applyCfg(st, cfg) {
    const keep = {}; for (const k of LOCAL_SETTINGS) if (st.settings && k in st.settings) keep[k] = st.settings[k];
    st.settings = Object.assign({}, cfg.settings || {}, keep);
    st.imports = cfg.imports || [];
    st.overrides = cfg.overrides || {};
    st.coinData = st.coinData || {};
    for (const [sym, cd] of Object.entries(st.coinData)) if (!(cfg.coins || {})[sym]) { cd.settings = { sources: [] }; cd.overrides = {}; }
    for (const [sym, c] of Object.entries(cfg.coins || {})) {
      const cd = st.coinData[sym] = st.coinData[sym] || { chain: null, lastSync: null };
      cd.settings = c.settings || { sources: [] }; cd.overrides = c.overrides || {};
    }
  }
  function isEmptyCfg(cfg) {
    const s = cfg.settings || {};
    return !(s.stakeAddresses || []).length && !(cfg.imports || []).length && !Object.keys(cfg.coins || {}).length;
  }

  // ---------- klíče a šifrování ----------
  async function keys(kB64) {
    const k = unb64u(kB64);
    const token = hex(await sha(cat(enc.encode('ks-auth:'), k)));
    const raw = await sha(cat(enc.encode('ks-enc:'), k));
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return { token, key };
  }
  async function gzip(u8, back) {
    const S = back ? window.DecompressionStream : window.CompressionStream;
    const r = new Response(new Blob([u8]).stream().pipeThrough(new S('gzip')));
    return new Uint8Array(await r.arrayBuffer());
  }
  async function seal(kB64, obj) {
    const { key } = await keys(kB64);
    let data = enc.encode(JSON.stringify(obj)), z = 0;
    if (window.CompressionStream) { data = await gzip(data); z = 1; }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
    return JSON.stringify({ v: 1, z, iv: b64u(iv), ct: b64u(ct) });
  }
  async function open(kB64, txt) {
    const { key } = await keys(kB64);
    const b = JSON.parse(txt);
    let data;
    try { data = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(b.iv) }, key, unb64u(b.ct))); }
    catch (e) { throw new Error('data nejdou rozšifrovat – spáruj mobil znovu'); }
    if (b.z) data = await gzip(data, true);
    return JSON.parse(dec.decode(data));
  }

  // ---------- párovací kód ----------
  function newSecret() { return b64u(crypto.getRandomValues(new Uint8Array(32))); }
  function code(ips, port, k) { return 'KS1:' + b64u(enc.encode(JSON.stringify({ h: ips, p: port, k }))); }
  function parseCode(txt) {
    const m = /KS1:([A-Za-z0-9_-]{20,})/.exec(String(txt || '').replace(/\s+/g, ''));
    if (!m) throw new Error('Tohle není párovací kód Krypto správy (začíná KS1:).');
    const o = JSON.parse(dec.decode(unb64u(m[1])));
    if (!o.k || !Array.isArray(o.h) || !o.h.length || !o.p) throw new Error('Párovací kód je neúplný.');
    return { hosts: o.h, port: o.p, k: o.k };
  }
  function qrSvg(text) {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
  }

  /* ======================= kontext appky ======================= */
  function create(ctx) {
    // ctx: { state(), persist(), refresh(), status(t,bad), log(t), isBusy(), isAndroid, http(method,url,body,headers) }
    let pubBusy = false, pubAgain = false, pollT = null, lastPubHash = null;
    const P = () => ctx.state().pair || null;

    /** volá se po každém uložení: pozná změnu nastavení a na PC připraví šifrovanou kopii pro mobil */
    async function onSaved() {
      const st = ctx.state(); if (!st.pair) return;
      const h = await hashCfg(cfgOf(st));
      if (st.pair.hash !== h) { st.pair.hash = h; st.pair.modAt = Date.now(); await ctx.persist(); }
      if (st.pair.role === 'pc') publish();
    }
    async function publish(force) {
      if (pubBusy) { pubAgain = true; return; }
      const st = ctx.state(), p = st.pair; if (!p || p.role !== 'pc') return;
      if (!force && lastPubHash === p.hash) return;
      pubBusy = true;
      try {
        const blob = await seal(p.k, { v: 1, from: 'pc', hash: p.hash, modAt: p.modAt, cfg: cfgOf(st) });
        const r = await fetch('/api/sync/outbox', { method: 'POST', body: blob });
        if (r.ok) lastPubHash = p.hash;
      } catch (e) { ctx.log('Synchronizace: ' + e.message); }
      finally { pubBusy = false; if (pubAgain) { pubAgain = false; publish(); } }
    }

    // ---------- PC ----------
    async function pcEnable() {
      const st = ctx.state();
      const k = newSecret(), { token } = await keys(k);
      const info = await (await fetch('/api/sync/setup', { method: 'POST', body: JSON.stringify({ token }) })).json();
      if (!info.running) throw new Error('Nepodařilo se otevřít port pro mobil' + (info.error ? ': ' + info.error : '') + '. Restartuj appku (START-PC).');
      st.pair = { role: 'pc', k, at: Date.now(), hash: await hashCfg(cfgOf(st)), modAt: Date.now() };
      await ctx.persist(); lastPubHash = null; await publish(true); pcPoll(true);
      return info;
    }
    async function pcDisable() {
      const st = ctx.state();
      await fetch('/api/sync/setup', { method: 'POST', body: JSON.stringify({ token: '' }) });
      delete st.pair; await ctx.persist(); pcPoll(false);
    }
    async function pcInfo() { try { return await (await fetch('/api/sync/info')).json(); } catch (e) { return null; } }
    /** na PC: když mobil poslal změny, převezme je */
    async function pcCheckInbox() {
      const st = ctx.state(), p = st.pair; if (!p || p.role !== 'pc' || ctx.isBusy()) return;
      let j; try { j = await (await fetch('/api/sync/inbox')).json(); } catch (e) { return; }
      if (!j || !j.blob) return;
      try {
        const m = await open(p.k, j.blob);
        const mine = await hashCfg(cfgOf(st));
        if (m.hash !== mine) {
          // PC se od poslední synchronizace nezměnilo (nebo je mobil novější) → převzít
          if (mine === m.base || !(p.modAt > m.modAt)) {
            applyCfg(st, m.cfg); p.hash = await hashCfg(cfgOf(st)); p.modAt = m.modAt || Date.now();
            await ctx.persist(); ctx.refresh();
            ctx.status('Převzaty změny z mobilu (' + new Date().toLocaleTimeString('cs-CZ') + '). Pro nové adresy dej Aktualizovat.');
          } else ctx.log('Synchronizace: změny z mobilu jsou starší než změny na PC – ponechávám PC.');
        }
        await fetch('/api/sync/inbox/clear', { method: 'POST' });
        lastPubHash = null; publish();
      } catch (e) { ctx.log('Synchronizace: ' + e.message); await fetch('/api/sync/inbox/clear', { method: 'POST' }); }
    }
    function pcPoll(on) {
      clearInterval(pollT); pollT = null;
      if (on) pollT = setInterval(pcCheckInbox, 4000);
    }

    // ---------- mobil ----------
    async function phonePair(codeTxt) {
      const c = parseCode(codeTxt), st = ctx.state();
      st.pair = { role: 'phone', k: c.k, hosts: c.hosts, port: c.port, base: null, at: Date.now(), hash: await hashCfg(cfgOf(st)), modAt: Date.now() };
      await ctx.persist();
      return phoneSync({ manual: true });
    }
    async function phoneUnpair() { delete ctx.state().pair; await ctx.persist(); }
    async function req(method, path, body) {
      const p = P(), { token } = await keys(p.k);
      const hosts = [p.lastHost, ...p.hosts].filter((h, i, a) => h && a.indexOf(h) === i);
      let last = null;
      for (const h of hosts) {
        const r = await ctx.http(method, `http://${h}:${p.port}${path}`, body, { 'X-Sync-Token': token, 'Content-Type': 'application/json' });
        if (r.ok) { p.lastHost = h; return JSON.parse(r.body || '{}'); }
        last = r;
        if (r.status === 403) throw new Error('PC mobil nezná – na PC se asi vytvořil nový párovací kód. Spáruj znovu.');
      }
      const e = new Error('PC není dostupné' + (last && last.status ? ` (HTTP ${last.status})` : '') + ' – je zapnuté, běží na něm appka a jsi na stejné Wi-Fi?');
      e.offline = true; throw e;
    }
    /** mobil: porovná nastavení s PC a přenese novější stranu */
    async function phoneSync(opt = {}) {
      const st = ctx.state(), p = st.pair;
      if (!p || p.role !== 'phone') return { ok: false };
      if (ctx.isBusy()) { if (opt.manual) ctx.status('Počkej, až doběhne aktualizace.'); return { ok: false }; }
      try {
        const j = await req('GET', '/sync/blob');
        const L = await hashCfg(cfgOf(st)); p.hash = L;
        if (!j.blob) { if (opt.manual) ctx.status('PC zatím nic neposlalo – otevři na PC appku (Nastavení → Synchronizace).', true); return { ok: false }; }
        const m = await open(p.k, j.blob), R = m.hash, B = p.base;
        let act = 'same';
        if (R === L) act = 'same';
        else if (L === B || (!B && isEmptyCfg(cfgOf(st)))) act = 'pull';
        else if (R === B) act = 'push';
        else {
          const pcNewer = (m.modAt || 0) >= (p.modAt || 0);
          act = confirm('Nastavení se změnilo na PC i v mobilu.\n\nOK = převzít nastavení z PC' + (pcNewer ? ' (novější)' : '') + '\nZrušit = poslat nastavení z mobilu do PC' + (!pcNewer ? ' (novější)' : '')) ? 'pull' : 'push';
        }
        if (act === 'pull') {
          applyCfg(st, m.cfg); p.hash = await hashCfg(cfgOf(st)); p.modAt = m.modAt || Date.now(); p.base = p.hash;
          if (p.hash !== R) ctx.log('Synchronizace: otisk po převzetí nesedí (' + p.hash + ' ≠ ' + R + ')');
        } else if (act === 'push') {
          const blob = await seal(p.k, { v: 1, from: 'phone', hash: L, base: R, modAt: p.modAt, cfg: cfgOf(st) });
          await req('POST', '/sync/push', blob); p.base = L;
        } else p.base = L;
        p.lastAt = Date.now(); p.lastAct = act;
        await ctx.persist(); ctx.refresh();
        const msg = { same: 'Nastavení je stejné jako na PC.', pull: 'Nastavení převzato z PC.', push: 'Změny z mobilu odeslány do PC.' }[act];
        if (opt.manual || act !== 'same') ctx.status('Synchronizace: ' + msg);
        return { ok: true, act };
      } catch (e) {
        if (opt.manual) ctx.status('Synchronizace: ' + e.message, true); else ctx.log('Synchronizace: ' + e.message);
        return { ok: false, offline: !!e.offline };
      }
    }

    // ---------- skenování QR (mobil) ----------
    let scanStop = null;
    async function scan(videoEl, onCode) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      videoEl.srcObject = stream; videoEl.setAttribute('playsinline', ''); await videoEl.play();
      const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
      let alive = true;
      const stop = () => { alive = false; stream.getTracks().forEach(t => t.stop()); videoEl.srcObject = null; scanStop = null; };
      scanStop = stop;
      const tick = () => {
        if (!alive) return;
        if (videoEl.readyState >= 2 && videoEl.videoWidth) {
          const w = Math.min(800, videoEl.videoWidth), h = Math.round(videoEl.videoHeight * w / videoEl.videoWidth);
          cv.width = w; cv.height = h; g.drawImage(videoEl, 0, 0, w, h);
          const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
          if (r && /KS1:/.test(r.data)) { stop(); onCode(r.data); return; }
        }
        setTimeout(tick, 200);
      };
      tick();
      return stop;
    }
    function stopScan() { if (scanStop) scanStop(); }

    return { onSaved, publish, pcEnable, pcDisable, pcInfo, pcPoll, pcCheckInbox, phonePair, phoneUnpair, phoneSync, scan, stopScan, P };
  }

  return { create, cfgOf, applyCfg, hashCfg, stable, seal, open, code, parseCode, qrSvg, newSecret, keys };
})();
