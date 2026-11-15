/* Rozhraní na platformu: PC (lokální server.py) nebo Android (nativní most). */
const Platform = (() => {
  const isAndroid = typeof window.AndroidBridge !== 'undefined';
  let seq = 0; const cbs = {};
  function b64utf8(b) { const bin = atob(b || ''); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder('utf-8').decode(u); }
  window.__nativeCb = (id, ok, status, b64) => { const f = cbs[id]; delete cbs[id]; if (f) f({ ok: !!ok, status: +status, body: b64utf8(b64) }); };

  async function http(method, url, body, headers) {
    if (isAndroid) return new Promise(res => { const id = String(++seq); cbs[id] = res; window.AndroidBridge.http(id, method, url, body == null ? '' : body, JSON.stringify(headers || {})); });
    const r = await fetch('/api/http', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, url, body, headers }) });
    return r.json();
  }
  async function loadState() {
    if (isAndroid) { const s = window.AndroidBridge.loadState(); return s ? JSON.parse(s) : null; }
    const r = await fetch('/api/state'); if (!r.ok) throw new Error('server neodpovídá'); return r.json();
  }
  async function saveState(st) {
    const s = JSON.stringify(st);
    if (isAndroid) { window.AndroidBridge.saveState(s); return; }
    await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: s });
  }
  async function saveFile(name, mime, content) {
    if (isAndroid) return window.AndroidBridge.saveFile(name, mime, content);
    const r = await fetch('/api/save?name=' + encodeURIComponent(name), { method: 'POST', body: content });
    const j = await r.json();
    return j.path;
  }
  async function ping() {
    if (isAndroid) return { version: null };
    try { const r = await fetch('/api/ping'); return await r.json(); } catch (e) { return null; }
  }
  /** PDF zpráva: PC = nové okno s tiskem („Uložit jako PDF“), Android = systémový tisk */
  function printHtml(html, title) {
    if (isAndroid) {
      if (typeof window.AndroidBridge.printHtml === 'function') { window.AndroidBridge.printHtml(html, title || 'zprava'); return true; }
      window.AndroidBridge.saveFile((title || 'zprava') + '.html', 'text/html', html); return true; // starší APK: aspoň uložit
    }
    const w = window.open('', '_blank'); if (!w) return false;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* uživatel vytiskne tlačítkem */ } }, 500);
    return true;
  }
  return { isAndroid, name: isAndroid ? 'Android' : 'PC', http, loadState, saveState, saveFile, ping, printHtml };
})();
