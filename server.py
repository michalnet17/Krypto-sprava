# -*- coding: utf-8 -*-
"""Krypto sprava - lokalni server pro PC (jen standardni knihovna Pythonu).
Obsluhuje web/ , uklada stav do data/state.json a predava HTTP dotazy na povolene API (Koios, Binance, CNB).
"""
import json, os, sys, shutil, subprocess, tempfile, threading, time, webbrowser, urllib.request, urllib.error, ssl
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

VERSION = '0.3.2'
PORT = int(os.environ.get('ADA_DANE_PORT', '8765'))
BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, 'web')
DATA = os.path.join(BASE, 'data')
STATE = os.path.join(DATA, 'state.json')
ALLOWED = {'api.koios.rest', 'data-api.binance.vision', 'api.binance.com', 'www.cnb.cz', 'api.coingecko.com', 'mempool.space', 'eth.blockscout.com', 'api.mainnet-beta.solana.com', 'blockstream.info', 'api.github.com', 'raw.githubusercontent.com'}
os.makedirs(DATA, exist_ok=True)


def _ssl_context():
    """Aktualni sada certifikatu z certifi (pokud je), jinak systemova."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where()), 'certifi'
    except Exception:
        return ssl.create_default_context(), 'system'


SSL_CTX, SSL_SRC = _ssl_context()


def _is_ssl_error(e):
    return isinstance(e, ssl.SSLError) or isinstance(getattr(e, 'reason', None), ssl.SSLError)


def fetch_urllib(method, url, body, headers):
    r = urllib.request.Request(url, data=body.encode('utf-8') if body is not None else None,
                               headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30, context=SSL_CTX) as resp:
            return resp.status, resp.read(), resp.headers.get('Content-Type', '') or '', 'python-' + SSL_SRC
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers.get('Content-Type', '') or '', 'python-' + SSL_SRC


def fetch_curl(method, url, body, headers):
    """Zalozni cesta pres curl (ve Windows curl.exe se systemovym overenim certifikatu)."""
    exe = shutil.which('curl.exe') or shutil.which('curl')
    if not exe:
        raise RuntimeError('curl neni k dispozici')
    fd, tmp = tempfile.mkstemp(prefix='adadane_')
    os.close(fd)
    try:
        cmd = [exe, '-sS', '--max-time', '60', '-X', method, '-o', tmp, '-w', '%{http_code}']
        for k, v in headers.items():
            cmd += ['-H', '%s: %s' % (k, v)]
        if body is not None:
            cmd += ['--data-binary', '@-']
        cmd.append(url)
        flags = 0x08000000 if os.name == 'nt' else 0  # CREATE_NO_WINDOW
        p = subprocess.run(cmd, input=body.encode('utf-8') if body is not None else None,
                           capture_output=True, timeout=90, creationflags=flags)
        code = int((p.stdout or b'0').decode('ascii', 'ignore').strip() or 0)
        if code == 0:
            raise RuntimeError('curl: ' + p.stderr.decode('utf-8', 'replace').strip()[:300])
        with open(tmp, 'rb') as f:
            raw = f.read()
        return code, raw, '', 'curl'
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def fetch(method, url, body, headers):
    try:
        return fetch_urllib(method, url, body, headers)
    except Exception as e:
        if not _is_ssl_error(e):
            raise
        try:
            return fetch_curl(method, url, body, headers)
        except Exception as e2:
            raise RuntimeError('%s | zalozne curl: %s' % (e, e2))


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=WEB, **kw)

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n) if n else b''

    def do_GET(self):
        if self.path == '/api/state':
            if os.path.exists(STATE):
                with open(STATE, 'r', encoding='utf-8') as f:
                    txt = f.read()
            else:
                txt = 'null'
            b = txt.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        if self.path == '/api/ping':
            return self._json(200, {'ok': True, 'platform': 'pc', 'version': VERSION, 'ssl': SSL_SRC, 'python': sys.version.split()[0]})
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/state':
            data = self._body()
            json.loads(data.decode('utf-8'))  # validace
            if os.path.exists(STATE):
                shutil.copyfile(STATE, STATE + '.bak')
            tmp = STATE + '.tmp'
            with open(tmp, 'wb') as f:
                f.write(data)
            os.replace(tmp, STATE)
            return self._json(200, {'ok': True})
        if self.path == '/api/http':
            req = json.loads(self._body().decode('utf-8'))
            url = req.get('url', '')
            host = urlparse(url).hostname or ''
            if host not in ALLOWED:
                return self._json(403, {'ok': False, 'status': 403, 'body': 'host neni povolen: ' + host})
            body = req.get('body')
            headers = {'User-Agent': 'ada-dane/' + VERSION, 'Accept': 'application/json, text/plain, */*'}
            headers.update(req.get('headers') or {})
            try:
                code, raw, ctype, via = fetch(req.get('method', 'GET'), url, body, headers)
            except Exception as e:
                return self._json(200, {'ok': False, 'status': 0, 'body': str(e)})
            enc = 'windows-1250' if 'cnb.cz' in host and 'utf' not in ctype.lower() else 'utf-8'
            try:
                txt = raw.decode(enc)
            except UnicodeDecodeError:
                txt = raw.decode('latin-1')
            if code >= 400:
                txt = txt[:2000]
            return self._json(200, {'ok': 200 <= code < 400, 'status': code, 'body': txt, 'via': via})
        if self.path.startswith('/api/save?name='):
            name = os.path.basename(urllib.request.unquote(self.path.split('=', 1)[1]))
            out = os.path.join(BASE, 'exporty')
            os.makedirs(out, exist_ok=True)
            p = os.path.join(out, name)
            with open(p, 'wb') as f:
                f.write(self._body())
            return self._json(200, {'ok': True, 'path': p})
        self._json(404, {'ok': False})


def _old_server_version():
    try:
        with urllib.request.urlopen('http://127.0.0.1:%d/api/ping' % PORT, timeout=3) as r:
            return json.loads(r.read().decode('utf-8')).get('version') or 'stara'
    except Exception:
        return None


def _kill_old_server():
    """Na portu bezi starsi verze teto appky - ukonci ji (Windows: netstat + taskkill, Linux/Mac: lsof/fuser/ss + kill)."""
    if os.name != 'nt':
        return _kill_old_server_posix()
    try:
        out = subprocess.run(['netstat', '-ano', '-p', 'TCP'], capture_output=True, text=True, timeout=10,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout
        # naslouchajici socket: lokalni 127.0.0.1:PORT, vzdalena 0.0.0.0:0 (stav je v ceskych Windows "NASLOUCHÁNÍ")
        pids = set()
        for ln in out.splitlines():
            p = ln.split()
            if len(p) >= 5 and p[1] == '127.0.0.1:%d' % PORT and p[2] == '0.0.0.0:0':
                pids.add(p[-1])
        for pid in pids:
            if pid.isdigit() and int(pid) != os.getpid():
                subprocess.run(['taskkill', '/PID', pid, '/F'], capture_output=True, timeout=10,
                               creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        time.sleep(1)
        return bool(pids)
    except Exception:
        return False


def _kill_old_server_posix():
    import signal
    pids = set()
    cmds = [['lsof', '-t', '-iTCP:%d' % PORT, '-sTCP:LISTEN'], ['fuser', '%d/tcp' % PORT], ['ss', '-ltnpH', 'sport = :%d' % PORT]]
    for c in cmds:
        if not shutil.which(c[0]):
            continue
        try:
            p = subprocess.run(c, capture_output=True, text=True, timeout=10)
            txt = p.stdout + ' ' + (p.stderr if c[0] == 'fuser' else '')
            if c[0] == 'ss':
                import re
                pids |= set(re.findall(r'pid=(\d+)', txt))
            else:
                pids |= {w for w in txt.replace(str(PORT) + '/tcp:', ' ').split() if w.isdigit()}
        except Exception:
            pass
        if pids:
            break
    pids.discard(str(os.getpid()))
    for pid in pids:
        try:
            os.kill(int(pid), signal.SIGTERM)
        except Exception:
            pass
    if pids:
        time.sleep(1)
    return bool(pids)


def main():
    try:
        srv = ThreadingHTTPServer(('127.0.0.1', PORT), H)
    except OSError:
        old = _old_server_version()
        if old and old != VERSION and _kill_old_server():
            print('Ukoncena stara verze serveru (%s), spoustim %s.' % (old, VERSION))
            try:
                srv = ThreadingHTTPServer(('127.0.0.1', PORT), H)
            except OSError:
                srv = None
        else:
            srv = None
        if srv is None:
            if old and old != VERSION:
                print('Na portu %d bezi STARA verze appky (%s). Zavri jeji okno (terminal) a spust appku znovu.' % (PORT, old))
            else:
                print('Port %d je obsazeny - appka asi uz bezi. Oteviram prohlizec.' % PORT)
            webbrowser.open('http://127.0.0.1:%d/' % PORT)
            return
    url = 'http://127.0.0.1:%d/' % PORT
    print('Krypto sprava bezi na ' + url)
    print('Data: ' + STATE)
    print('Okno nezaviraj, dokud appku pouzivas. Ukonceni: Ctrl+C nebo zavri okno.')
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
