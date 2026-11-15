/* Minimální kryptografie pro odvození BTC adres z xpub (bez knihoven):
   SHA-256, SHA-512, HMAC-SHA512, RIPEMD-160, secp256k1 (veřejné odvození), Base58Check, Bech32 (segwit v0). */
(function (root) {
  'use strict';
  const u8 = a => Uint8Array.from(a);
  const concat = (...arrs) => { const n = arrs.reduce((s, a) => s + a.length, 0), o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };

  /* ---- SHA-256 ---- */
  const K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(msg) {
    const l = msg.length, bl = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(bl);
    m.set(msg); m[l] = 0x80; const bits = l * 8; const dv = new DataView(m.buffer);
    dv.setUint32(bl - 4, bits >>> 0); dv.setUint32(bl - 8, Math.floor(bits / 0x100000000));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < bl; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + W[i]) >>> 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32), ov = new DataView(out.buffer); for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]); return out;
  }

  /* ---- SHA-512 (BigInt) ---- */
  const K512 = ['428a2f98d728ae22', '7137449123ef65cd', 'b5c0fbcfec4d3b2f', 'e9b5dba58189dbbc', '3956c25bf348b538', '59f111f1b605d019', '923f82a4af194f9b', 'ab1c5ed5da6d8118', 'd807aa98a3030242', '12835b0145706fbe', '243185be4ee4b28c', '550c7dc3d5ffb4e2', '72be5d74f27b896f', '80deb1fe3b1696b1', '9bdc06a725c71235', 'c19bf174cf692694', 'e49b69c19ef14ad2', 'efbe4786384f25e3', '0fc19dc68b8cd5b5', '240ca1cc77ac9c65', '2de92c6f592b0275', '4a7484aa6ea6e483', '5cb0a9dcbd41fbd4', '76f988da831153b5', '983e5152ee66dfab', 'a831c66d2db43210', 'b00327c898fb213f', 'bf597fc7beef0ee4', 'c6e00bf33da88fc2', 'd5a79147930aa725', '06ca6351e003826f', '142929670a0e6e70', '27b70a8546d22ffc', '2e1b21385c26c926', '4d2c6dfc5ac42aed', '53380d139d95b3df', '650a73548baf63de', '766a0abb3c77b2a8', '81c2c92e47edaee6', '92722c851482353b', 'a2bfe8a14cf10364', 'a81a664bbc423001', 'c24b8b70d0f89791', 'c76c51a30654be30', 'd192e819d6ef5218', 'd69906245565a910', 'f40e35855771202a', '106aa07032bbd1b8', '19a4c116b8d2d0c8', '1e376c085141ab53', '2748774cdf8eeb99', '34b0bcb5e19b48a8', '391c0cb3c5c95a63', '4ed8aa4ae3418acb', '5b9cca4f7763e373', '682e6ff3d6b2b8a3', '748f82ee5defb2fc', '78a5636f43172f60', '84c87814a1f0ab72', '8cc702081a6439ec', '90befffa23631e28', 'a4506cebde82bde9', 'bef9a3f7b2c67915', 'c67178f2e372532b', 'ca273eceea26619c', 'd186b8c721c0c207', 'eada7dd6cde0eb1e', 'f57d4f7fee6ed178', '06f067aa72176fba', '0a637dc5a2c898a6', '113f9804bef90dae', '1b710b35131c471b', '28db77f523047d84', '32caab7b40c72493', '3c9ebe0a15c9bebc', '431d67c49c100d4c', '4cc5d4becb3e42b6', '597f299cfc657e2a', '5fcb6fab3ad6faec', '6c44198c4a475817'].map(h => BigInt('0x' + h));
  const M64 = (1n << 64n) - 1n;
  function sha512(msg) {
    const l = msg.length, bl = ((l + 17 + 127) >> 7) << 7, m = new Uint8Array(bl);
    m.set(msg); m[l] = 0x80; const dv = new DataView(m.buffer); dv.setUint32(bl - 4, (l * 8) >>> 0); dv.setUint32(bl - 8, Math.floor(l * 8 / 0x100000000));
    const H = ['6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1', '510e527fade682d1', '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179'].map(h => BigInt('0x' + h));
    const r = (x, n) => ((x >> BigInt(n)) | (x << BigInt(64 - n))) & M64;
    const W = new Array(80);
    for (let o = 0; o < bl; o += 128) {
      for (let i = 0; i < 16; i++) W[i] = dv.getBigUint64(o + i * 8);
      for (let i = 16; i < 80; i++) { const s0 = r(W[i - 15], 1) ^ r(W[i - 15], 8) ^ (W[i - 15] >> 7n), s1 = r(W[i - 2], 19) ^ r(W[i - 2], 61) ^ (W[i - 2] >> 6n); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) & M64; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 80; i++) {
        const t1 = (h + (r(e, 14) ^ r(e, 18) ^ r(e, 41)) + ((e & f) ^ (~e & M64 & g)) + K512[i] + W[i]) & M64;
        const t2 = ((r(a, 28) ^ r(a, 34) ^ r(a, 39)) + ((a & b) ^ (a & c) ^ (b & c))) & M64;
        h = g; g = f; f = e; e = (d + t1) & M64; d = c; c = b; b = a; a = (t1 + t2) & M64;
      }
      H[0] = (H[0] + a) & M64; H[1] = (H[1] + b) & M64; H[2] = (H[2] + c) & M64; H[3] = (H[3] + d) & M64; H[4] = (H[4] + e) & M64; H[5] = (H[5] + f) & M64; H[6] = (H[6] + g) & M64; H[7] = (H[7] + h) & M64;
    }
    const out = new Uint8Array(64), ov = new DataView(out.buffer); for (let i = 0; i < 8; i++) ov.setBigUint64(i * 8, H[i]); return out;
  }
  function hmacSha512(key, msg) {
    if (key.length > 128) key = sha512(key);
    const k = new Uint8Array(128); k.set(key);
    const ip = k.map(b => b ^ 0x36), op = k.map(b => b ^ 0x5c);
    return sha512(concat(op, sha512(concat(ip, msg))));
  }

  /* ---- RIPEMD-160 ---- */
  function ripemd160(msg) {
    const l = msg.length, bl = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(bl);
    m.set(msg); m[l] = 0x80; const dv = new DataView(m.buffer); dv.setUint32(bl - 8, (l * 8) >>> 0, true); dv.setUint32(bl - 4, Math.floor(l * 8 / 0x100000000), true);
    const zl = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13];
    const zr = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11];
    const sl = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6];
    const sr = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11];
    const KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e], KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];
    const f = (j, x, y, z) => j < 16 ? x ^ y ^ z : j < 32 ? (x & y) | (~x & z) : j < 48 ? (x | ~y) ^ z : j < 64 ? (x & z) | (y & ~z) : x ^ (y | ~z);
    const rl = (x, n) => (x << n) | (x >>> (32 - n));
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    for (let o = 0; o < bl; o += 64) {
      const X = []; for (let i = 0; i < 16; i++) X[i] = dv.getUint32(o + i * 4, true);
      let al = h0, bl_ = h1, cl = h2, dl = h3, el = h4, ar = h0, br = h1, cr = h2, dr = h3, er = h4;
      for (let j = 0; j < 80; j++) {
        let t = (rl((al + f(j, bl_, cl, dl) + X[zl[j]] + KL[j >> 4]) | 0, sl[j]) + el) | 0;
        al = el; el = dl; dl = rl(cl, 10); cl = bl_; bl_ = t;
        t = (rl((ar + f(79 - j, br, cr, dr) + X[zr[j]] + KR[j >> 4]) | 0, sr[j]) + er) | 0;
        ar = er; er = dr; dr = rl(cr, 10); cr = br; br = t;
      }
      const t = (h1 + cl + dr) | 0; h1 = (h2 + dl + er) | 0; h2 = (h3 + el + ar) | 0; h3 = (h4 + al + br) | 0; h4 = (h0 + bl_ + cr) | 0; h0 = t;
    }
    const out = new Uint8Array(20), ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h >>> 0, true)); return out;
  }
  const hash160 = b => ripemd160(sha256(b));

  /* ---- secp256k1 (Jacobian) ---- */
  const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
  const mod = (a, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };
  const powm = (b, e, m = P) => { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
  const inv = a => powm(a, P - 2n);
  function jDouble([X, Y, Z]) {
    if (Y === 0n) return [0n, 1n, 0n];
    const S = mod(4n * X * Y * Y), M = mod(3n * X * X), X3 = mod(M * M - 2n * S);
    return [X3, mod(M * (S - X3) - 8n * Y * Y * Y * Y), mod(2n * Y * Z)];
  }
  function jAdd(p1, p2) {
    if (p1[2] === 0n) return p2; if (p2[2] === 0n) return p1;
    const [X1, Y1, Z1] = p1, [X2, Y2, Z2] = p2;
    const Z1Z1 = mod(Z1 * Z1), Z2Z2 = mod(Z2 * Z2), U1 = mod(X1 * Z2Z2), U2 = mod(X2 * Z1Z1), S1 = mod(Y1 * Z2 * Z2Z2), S2 = mod(Y2 * Z1 * Z1Z1);
    if (U1 === U2) return S1 === S2 ? jDouble(p1) : [0n, 1n, 0n];
    const H = mod(U2 - U1), R = mod(S2 - S1), H2 = mod(H * H), H3 = mod(H * H2), U1H2 = mod(U1 * H2);
    const X3 = mod(R * R - H3 - 2n * U1H2);
    return [X3, mod(R * (U1H2 - X3) - S1 * H3), mod(H * Z1 * Z2)];
  }
  const toJ = ([x, y]) => [x, y, 1n];
  const fromJ = ([X, Y, Z]) => { const zi = inv(Z), zi2 = mod(zi * zi); return [mod(X * zi2), mod(Y * zi2 * zi)]; };
  function mulG(k) { let R = [0n, 1n, 0n], A = toJ(G); while (k > 0n) { if (k & 1n) R = jAdd(R, A); A = jDouble(A); k >>= 1n; } return fromJ(R); }
  const big = b => BigInt('0x' + (Array.from(b, x => x.toString(16).padStart(2, '0')).join('') || '0'));
  const bytes32 = n => { const h = n.toString(16).padStart(64, '0'); return u8(h.match(/../g).map(x => parseInt(x, 16))); };
  function decompress(pk) {
    const x = big(pk.slice(1)), y2 = mod(x * x * x + 7n); let y = powm(y2, (P + 1n) / 4n);
    if ((y & 1n) !== BigInt(pk[0] & 1)) y = P - y; return [x, y];
  }
  const compress = ([x, y]) => concat(u8([(y & 1n) ? 3 : 2]), bytes32(x));

  /* ---- Base58Check ---- */
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58decode(s) {
    let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error('neplatný znak base58'); n = n * 58n + BigInt(i); }
    let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex;
    const body = hex === '00' ? [] : hex.match(/../g).map(x => parseInt(x, 16));
    let z = 0; while (s[z] === '1') z++;
    return concat(new Uint8Array(z), u8(body));
  }
  function b58encode(b) {
    let n = big(b), s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
    for (const x of b) { if (x !== 0) break; s = '1' + s; } return s;
  }
  function b58checkDecode(s) {
    const b = b58decode(s), d = b.slice(0, -4), c = b.slice(-4), h = sha256(sha256(d));
    for (let i = 0; i < 4; i++) if (h[i] !== c[i]) throw new Error('špatný kontrolní součet'); return d;
  }
  const b58checkEncode = d => b58encode(concat(d, sha256(sha256(d)).slice(0, 4)));

  /* ---- Bech32 segwit v0 ---- */
  const BC = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function polymod(v) { const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let c = 1; for (const x of v) { const b = c >> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= G[i]; } return c; }
  function segwitV0(hrp, prog) {
    const d = [0]; let acc = 0, bits = 0;
    for (const b of prog) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; d.push((acc >> bits) & 31); } }
    if (bits) d.push((acc << (5 - bits)) & 31);
    const ex = [...hrp].map(c => c.charCodeAt(0) >> 5).concat([0], [...hrp].map(c => c.charCodeAt(0) & 31));
    const pm = polymod(ex.concat(d, [0, 0, 0, 0, 0, 0])) ^ 1;
    for (let i = 0; i < 6; i++) d.push((pm >> (5 * (5 - i))) & 31);
    return hrp + '1' + d.map(x => BC[x]).join('');
  }

  /* ---- BIP32 (jen veřejné odvození) ---- */
  function parseXpub(x) {
    const d = b58checkDecode(String(x).trim());
    if (d.length !== 78) throw new Error('neplatný xpub');
    const ver = Array.from(d.slice(0, 4), b => b.toString(16).padStart(2, '0')).join('');
    // zpub/vpub = nativní segwit, ypub = segwit v P2SH, xpub = nejasné (Ledger exportuje xpub i u segwit) -> zkusit vše
    const kind = { '04b24746': 'p2wpkh', '045f1cf6': 'p2wpkh', '049d7cb2': 'p2sh', '044a5262': 'p2sh' }[ver] || 'any';
    return { chain: d.slice(13, 45), key: d.slice(45, 78), kind, depth: d[4] };
  }
  function ckdPub(node, i) {
    const data = concat(node.key, u8([(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255]));
    const I = hmacSha512(node.chain, data), IL = big(I.slice(0, 32));
    if (IL >= N) throw new Error('neplatný klíč');
    const pt = fromJ(jAdd(toJ(mulG(IL)), toJ(decompress(node.key))));
    return { chain: I.slice(32), key: compress(pt) };
  }
  function addressFromPub(pub, type) {
    const h = hash160(pub);
    if (type === 'p2wpkh') return segwitV0('bc', h);
    if (type === 'p2pkh') return b58checkEncode(concat(u8([0x00]), h));
    if (type === 'p2sh') return b58checkEncode(concat(u8([0x05]), hash160(concat(u8([0x00, 0x14]), h))));
    throw new Error('typ adresy');
  }
  /** adresy z xpub: řetězec 0 (příjem) / 1 (vrácení), indexy od..do */
  function deriveAddresses(xpub, type, chainIdx, from, count) {
    const root0 = parseXpub(xpub), branch = ckdPub(root0, chainIdx), out = [];
    for (let i = from; i < from + count; i++) out.push(addressFromPub(ckdPub(branch, i).key, type));
    return out;
  }

  const API = { sha256, sha512, hmacSha512, ripemd160, hash160, b58checkDecode, b58checkEncode, segwitV0, parseXpub, ckdPub, addressFromPub, deriveAddresses };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.Crypto2 = API;
})(typeof window !== 'undefined' ? window : globalThis);
