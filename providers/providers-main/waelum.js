const BASE_URL = 'https://bingebang.st';
const TMDB_API = 'https://api.themoviedb.org/3';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const pageHeaders = () => ({
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    Referer: `${BASE_URL}/`
});
const apiHeaders = () => ({
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    Referer: `${BASE_URL}/`
});
const playerHeaders = (playUrl, ticket) => ({
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    Referer: playUrl,
    Origin: BASE_URL,
    'X-BB-Player': '1',
    'X-BB-Ticket': ticket
});
const getText = async (url, headers) => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return res.text();
};
const getJson = async (url, headers) => JSON.parse(await getText(url, headers));
const absUrl = (p) => {
    if (!p || /^https?:/i.test(p)) return p;
    return p[0] === '/' ? BASE_URL + p : `${BASE_URL}/${p}`;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const K256 = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

const sha256 = (bytes) => {
    const len = bytes.length;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor((len * 8) / 4294967296));
    view.setUint32(padded.length - 4, (len * 8) >>> 0);

    const H = new Int32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Int32Array(64);

    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getInt32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let i = 0; i < 64; i++) {
            const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
            const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }

    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) outView.setInt32(i * 4, H[i]);
    return out;
};

const base64UrlDecode = (v) => {
    let s = v.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    s += '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

const parseNumList = (s) => s.split(',').map((x) => parseInt(x, 10)).filter((x) => !isNaN(x));

const decryptXorBlock = (html) => {
    if (!html) return null;
    const km = /k\s*=\s*\[([0-9,\s]+)\]/.exec(html);
    const dm = /d\s*=\s*\[([0-9,\s]+)\]/.exec(html);
    if (!km || !dm) return null;
    const key = parseNumList(km[1]);
    const data = parseNumList(dm[1]);
    if (!key.length || !data.length) return null;
    return decoder.decode(Uint8Array.from(data, (x, i) => (x ^ key[i % key.length]) & 255));
};

const decryptPayload = (body, ticket) => {
    const m = /"enc":"([^"]+)"/.exec(body);
    if (!m) return body;
    const raw = base64UrlDecode(m[1]);
    if (raw.length <= 48) return body;

    const payload = raw.subarray(16);
    const k = [199, 71, 13, 231, 255, 68, 237];
    const v = [254, 34, 63, 133, 200, 39, 217, 246, 38, 61, 129, 201, 32, 213, 242, 37, 62, 132, 206, 33, 218, 166, 126, 57, 129, 205, 113, 137, 247, 37, 53, 209];
    const seed = String.fromCharCode(...v.map((x, i) => x ^ k[i % k.length]));
    const block = new Uint8Array(52);
    block.set(sha256(encoder.encode(seed + ticket)));
    block.set(raw.subarray(0, 16), 32);
    const counterView = new DataView(block.buffer, 48, 4);
    const out = new Uint8Array(payload.length);

    for (let pos = 0, counter = 0; pos < payload.length; pos += 32, counter++) {
        counterView.setUint32(0, counter);
        const stream = sha256(block);
        const n = Math.min(32, payload.length - pos);
        for (let i = 0; i < n; i++) out[pos + i] = payload[pos + i] ^ stream[i];
    }
    return decoder.decode(out);
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const normalizeQuality = (raw) => {
    const s = String(raw || '').toLowerCase();
    if (s.includes('2160') || s.includes('4k')) return { label: '2160p', rank: 4 };
    if (s.includes('1080')) return { label: '1080p', rank: 3 };
    if (s.includes('720')) return { label: '720p', rank: 2 };
    if (s.includes('480')) return { label: '480p', rank: 1 };
    return { label: 'Auto', rank: 0 };
};

const sortTag = (rank) =>
    (5 - rank)
        .toString(2)
        .padStart(20, '0')
        .split('')
        .map((b) => (b === '1' ? '\uFEFF' : '\u200B'))
        .join('');

const tmdbInfo = async (tmdbId, isTv) => {
    const d = await getJson(`${TMDB_API}/${isTv ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`, { Accept: 'application/json' });
    const date = d.release_date || d.first_air_date || '';
    const names = [...new Set([d.title || d.name, d.original_title || d.original_name].filter(Boolean))];
    return { names, year: parseInt(date.slice(0, 4), 10) || null };
};

const searchWatchUrl = async (name, info, tmdbId, isTv) => {
    try {
        const d = await getJson(`${BASE_URL}/api/search/multi?query=${encodeURIComponent(name)}`, apiHeaders());
        const res = (d.results || []).filter((r) => r && r.url && (r.media_type === 'tv') === isTv);

        const byId = res.find((r) => String(r.id) === String(tmdbId) || String(r.tmdb_id) === String(tmdbId));
        if (byId) return byId.url;

        const wanted = norm(name);
        let best = null;
        let bestScore = 0;
        for (const r of res) {
            const t = norm(r.title || r.name);
            let score = 0;
            if (t === wanted) score = 100;
            else if (t.startsWith(wanted) || wanted.startsWith(t)) score = 60;
            if (score && info.year && r.year && Math.abs(r.year - info.year) <= 1) score += 20;
            if (score > bestScore) {
                bestScore = score;
                best = r;
            }
        }
        return bestScore >= 60 ? best.url : null;
    } catch {
        return null;
    }
};

const findWatchUrl = async (info, tmdbId, isTv) => {
    const results = await Promise.all(info.names.map((n) => searchWatchUrl(n, info, tmdbId, isTv)));
    return results.find(Boolean) || null;
};

const resolveServer = async (server, headers, ticket) => {
    const src = server && server.source_url;
    if (!src) return null;
    try {
        const body = await getText(`${BASE_URL}/api/player/resolve?src=${encodeURIComponent(src)}`, headers);
        const r = JSON.parse(decryptPayload(body, ticket));
        if (!r || !r.url) return null;

        const subtitles = [];
        for (const s of r.subtitles || []) {
            if (!s || !s.url) continue;
            const name = String(s.label || s.lang || 'Unknown');
            subtitles.push({ url: s.url, language: name, name });
        }

        const quality = normalizeQuality(server.quality);
        const tag = sortTag(quality.rank);
        return {
            name: `${tag}BingeBang \u2022 ${[server.label]}`,
            title: `${tag}BingeBang \u2022 ${[server.label]}`,
            url: r.url,
            quality: quality.label,
            headers: { Referer: `${BASE_URL}/`, 'User-Agent': USER_AGENT },
            subtitles
        };
    } catch {
        return null;
    }
};

const getStreams = async (tmdbId, mediaType, season, episode) => {
    try {
        const isTv = mediaType === 'tv';
        if (isTv && (season == null || episode == null)) return [];

        const info = await tmdbInfo(tmdbId, isTv);
        const watch = await findWatchUrl(info, tmdbId, isTv);
        if (!watch) return [];

        const playBase = absUrl(watch).replace('/watch/', '/play/');
        const playUrl = isTv ? `${playBase}/${season}/${episode}` : playBase;

        const html = await getText(playUrl, pageHeaders());
        const cfg = decryptXorBlock(html);
        const tm = cfg && /ticket:\s*"([^"]+)"/.exec(cfg);
        if (!tm) return [];

        const ticket = tm[1];
        const headers = playerHeaders(playUrl, ticket);
        const body = await getText(`${BASE_URL}/api/player/sources`, headers);
        const servers = JSON.parse(decryptPayload(body, ticket)).servers || [];
        const list = await Promise.all(servers.map((sv) => resolveServer(sv, headers, ticket)));

        const seen = new Set();
        return list.filter((v) => v && !seen.has(v.url) && seen.add(v.url));
    } catch {
        return [];
    }
};

module.exports = { getStreams };