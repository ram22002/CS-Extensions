const BASE_URL = "https://vidrock.net";
const CONCURRENCY = 4;
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "Referer": BASE_URL + "/",
    "Origin": BASE_URL,
};
const STREAM_KEY = "7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f";
const AES_RCON = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]);
const AES_SBOX = new Uint8Array([
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
]);

function gfMul(a, b) {
    let p = 0;
    for (let i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        const carry = a & 0x80;
        a = (a << 1) & 0xff;
        if (carry) a ^= 0x1b;
        b >>= 1;
    }
    return p;
}

function aesSubWord(w) {
    return (AES_SBOX[(w >>> 24) & 0xff] << 24) |
        (AES_SBOX[(w >>> 16) & 0xff] << 16) |
        (AES_SBOX[(w >>> 8) & 0xff] << 8) |
        AES_SBOX[w & 0xff];
}

function aesKeyExpand(key) {
    const Nk = key.length >> 2;
    const Nr = Nk + 6;
    const w = new Int32Array((Nr + 1) << 2);
    for (let i = 0; i < Nk; i++)
        w[i] = (key[i * 4] << 24) | (key[i * 4 + 1] << 16) | (key[i * 4 + 2] << 8) | key[i * 4 + 3];
    for (let i = Nk; i < w.length; i++) {
        let t = w[i - 1];
        if (i % Nk === 0)
            t = aesSubWord(((t << 8) | (t >>> 24))) ^ (AES_RCON[(i / Nk | 0) - 1] << 24);
        else if (Nk > 6 && i % Nk === 4)
            t = aesSubWord(t);
        w[i] = w[i - Nk] ^ t;
    }
    return w;
}

function aesEncryptBlock(block, w) {
    const Nr = (w.length >> 2) - 1;
    const s = [
        new Uint8Array([block[0], block[4], block[8], block[12]]),
        new Uint8Array([block[1], block[5], block[9], block[13]]),
        new Uint8Array([block[2], block[6], block[10], block[14]]),
        new Uint8Array([block[3], block[7], block[11], block[15]])
    ];
    for (let c = 0; c < 4; c++) {
        const k = w[c];
        s[0][c] ^= (k >>> 24) & 0xff;
        s[1][c] ^= (k >>> 16) & 0xff;
        s[2][c] ^= (k >>> 8) & 0xff;
        s[3][c] ^= k & 0xff;
    }
    for (let round = 1; round <= Nr; round++) {
        for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++)
                s[r][c] = AES_SBOX[s[r][c]];
        for (let r = 1; r < 4; r++) {
            const tmp = s[r].slice();
            for (let c = 0; c < 4; c++) s[r][c] = tmp[(c + r) & 3];
        }
        if (round < Nr) {
            for (let c = 0; c < 4; c++) {
                const a = s[0][c], b = s[1][c], cc = s[2][c], d = s[3][c];
                s[0][c] = gfMul(2, a) ^ gfMul(3, b) ^ cc ^ d;
                s[1][c] = a ^ gfMul(2, b) ^ gfMul(3, cc) ^ d;
                s[2][c] = a ^ b ^ gfMul(2, cc) ^ gfMul(3, d);
                s[3][c] = gfMul(3, a) ^ b ^ cc ^ gfMul(2, d);
            }
        }
        for (let c = 0; c < 4; c++) {
            const k = w[round * 4 + c];
            s[0][c] ^= (k >>> 24) & 0xff;
            s[1][c] ^= (k >>> 16) & 0xff;
            s[2][c] ^= (k >>> 8) & 0xff;
            s[3][c] ^= k & 0xff;
        }
    }
    const out = new Uint8Array(16);
    for (let c = 0; c < 4; c++) {
        out[c * 4] = s[0][c];
        out[c * 4 + 1] = s[1][c];
        out[c * 4 + 2] = s[2][c];
        out[c * 4 + 3] = s[3][c];
    }
    return out;
}

function aesIncCtr(ctr) {
    let v = ((ctr[12] << 24) | (ctr[13] << 16) | (ctr[14] << 8) | ctr[15]) >>> 0;
    v = (v + 1) >>> 0;
    ctr[12] = (v >>> 24) & 0xff;
    ctr[13] = (v >>> 16) & 0xff;
    ctr[14] = (v >>> 8) & 0xff;
    ctr[15] = v & 0xff;
}

function gctr(w, initialCtr, data) {
    const out = new Uint8Array(data.length);
    const ctr = new Uint8Array(initialCtr);
    for (let i = 0; i < data.length; i += 16) {
        const ks = aesEncryptBlock(ctr, w);
        const end = Math.min(16, data.length - i);
        for (let j = 0; j < end; j++) out[i + j] = data[i + j] ^ ks[j];
        aesIncCtr(ctr);
    }
    return out;
}

function gcmMul(X, Y) {
    const Z = new Uint8Array(16);
    const V = new Uint8Array(Y);
    for (let i = 0; i < 128; i++) {
        if ((X[i >> 3] >> (7 - (i & 7))) & 1)
            for (let j = 0; j < 16; j++) Z[j] ^= V[j];
        const lsb = V[15] & 1;
        for (let j = 15; j > 0; j--) V[j] = (V[j] >>> 1) | ((V[j - 1] & 1) << 7);
        V[0] >>>= 1;
        if (lsb) V[0] ^= 0xe1;
    }
    return Z;
}

function ghash(H, ciphertext) {
    function pad16(arr) {
        if (arr.length % 16 === 0) return arr;
        const out = new Uint8Array(arr.length + 16 - (arr.length % 16));
        out.set(arr);
        return out;
    }
    function write64be(buf, off, n) {
        const hi = Math.floor(n / 0x100000000) >>> 0;
        const lo = n >>> 0;
        buf[off] = (hi >>> 24) & 0xff; buf[off + 1] = (hi >>> 16) & 0xff;
        buf[off + 2] = (hi >>> 8) & 0xff; buf[off + 3] = hi & 0xff;
        buf[off + 4] = (lo >>> 24) & 0xff; buf[off + 5] = (lo >>> 16) & 0xff;
        buf[off + 6] = (lo >>> 8) & 0xff; buf[off + 7] = lo & 0xff;
    }
    const ctPad = pad16(ciphertext);
    const lenBlk = new Uint8Array(16);
    write64be(lenBlk, 0, 0);
    write64be(lenBlk, 8, ciphertext.length * 8);
    const input = new Uint8Array(ctPad.length + 16);
    input.set(ctPad, 0);
    input.set(lenBlk, ctPad.length);
    let Y = new Uint8Array(16);
    for (let i = 0; i < input.length; i += 16) {
        for (let j = 0; j < 16; j++) Y[j] ^= input[i + j];
        Y = gcmMul(Y, H);
    }
    return Y;
}

function parseHex(hex) {
    const out = new Uint8Array(hex.length >> 1);
    for (let i = 0; i < out.length; i++)
        out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}

function decryptStreamUrl(encoded) {
    const raw = Uint8Array.from(
        atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
        c => c.charCodeAt(0)
    );
    const keyBytes = parseHex(STREAM_KEY);
    const iv = raw.subarray(0, 12);
    const data = raw.subarray(12);

    if (data.length < 16) throw new Error("input too short");
    const w = aesKeyExpand(keyBytes);
    const H = aesEncryptBlock(new Uint8Array(16), w);

    const J0 = new Uint8Array(16);
    J0.set(iv);
    J0[15] = 0x01;

    const ciphertext = data.subarray(0, data.length - 16);
    const rxTag = data.subarray(data.length - 16);

    const J1 = new Uint8Array(J0);
    aesIncCtr(J1);
    const plaintext = gctr(w, J1, ciphertext);

    const S = ghash(H, ciphertext);
    const E0 = aesEncryptBlock(J0, w);

    let mismatch = 0;
    for (let i = 0; i < 16; i++) mismatch |= (E0[i] ^ S[i]) ^ rxTag[i];
    if (mismatch !== 0) throw new Error("auth tag mismatch");

    return new TextDecoder().decode(plaintext);
}

function toAbsoluteUrl(line, base) {
    try { return new URL(line, base).toString(); }
    catch { return null; }
}

function extractTopVariant(text, base) {
    const lines = text.split("\n").map(l => l.trim());
    let best = null;
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
        const segLine = lines[i + 1];
        if (!segLine || segLine.startsWith("#")) continue;
        const url = toAbsoluteUrl(segLine, base);
        if (!url) continue;
        const bw = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1] || "0", 10);
        const res = lines[i].match(/RESOLUTION=(\d+)x(\d+)/);
        const w = res ? parseInt(res[1], 10) : 0;
        const h = res ? parseInt(res[2], 10) : 0;
        if (!resolutionLabel(w, h)) continue;
        if (!best || bw > best.bandwidth)
            best = { url, bandwidth: bw, width: w, height: h };
    }
    return best;
}

function resolutionLabel(w, h) {
    if (w >= 3840 || h >= 2160) return "2160p";
    if (w >= 1920 || h >= 1080) return "1080p";
    return null;
}

function resWeight(quality) {
    if (quality === "2160p") return 2;
    if (quality === "1080p") return 1;
    return 0;
}

function invertedSortTag(rank, total) {
    let inv = Math.max(0, total - rank);
    let bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    return bin.split("").map(c => c === "1" ? "\uFEFF" : "\u200B").join("");
}

async function safeFetch(url, options) {
    try {
        const res = await fetch(url, { headers: HEADERS, ...options });
        if (!res.ok) return null;
        return res;
    } catch {
        return null;
    }
}

async function resolveServer(serverName, entry) {
    try {
        const masterUrl = decryptStreamUrl(entry.url);
        if (!masterUrl || !/^https?:\/\//i.test(masterUrl)) return null;

        const res = await safeFetch(masterUrl);
        if (!res) return null;

        const variant = extractTopVariant(await res.text(), masterUrl);
        if (!variant) return null;

        const quality = resolutionLabel(variant.width, variant.height);
        if (!quality) return null;

        const label = String(serverName).replace(/\s*(1080p\s+)?server\s*2\s*$/gi, "").trim();
        const displayName = `Vidrock \u2022 ${label}`;

        return {
            name: displayName,
            title: displayName,
            url: masterUrl,
            quality,
            headers: HEADERS,
        };
    } catch {
        return null;
    }
}

async function withConcurrency(fns, limit) {
    const results = new Array(fns.length);
    let cursor = 0;
    async function worker() {
        while (cursor < fns.length) {
            const i = cursor++;
            results[i] = await fns[i]();
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, fns.length) }, worker));
    return results;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const id = parseInt(tmdbId, 10);
        if (!id) return [];

        const path = mediaType === "tv"
            ? `tv/${id}/${season}/${episode}`
            : `movie/${id}`;

        const res = await safeFetch(`${BASE_URL}/api/${path}`);
        if (!res) return [];

        let data;
        try { data = await res.json(); }
        catch { return []; }
        if (!data || typeof data !== "object" || data.error) return [];

        const entries = Object.keys(data)
            .map(name => ({ name, entry: data[name] }))
            .filter(e => e.entry && typeof e.entry === "object" && e.entry.url);
        if (!entries.length) return [];

        const resolved = await withConcurrency(
            entries.map(e => () => resolveServer(e.name, e.entry)),
            CONCURRENCY
        );

        const seen = new Set();
        let streams = resolved.filter(s => {
            if (!s || !s.url || seen.has(s.url)) return false;
            seen.add(s.url);
            return true;
        });

        streams.sort((a, b) => resWeight(b.quality) - resWeight(a.quality));

        const total = streams.length;
        streams = streams.map((s, i) => {
            const tag = invertedSortTag(total - i, total + 1);
            return Object.assign({}, s, { name: tag + s.name });
        });

        return streams;
    } catch {
        return [];
    }
}

module.exports = { getStreams };