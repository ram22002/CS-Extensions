const CryptoJS = require('crypto-js');
const BASE_URL = 'https://nxsha.space';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    'Referer': `${BASE_URL}/`,
    'Accept-Language': 'en-US,en;q=0.9'
};
const SERVERS = new Map([
    ['nitro', 'Nitro'],
    ['streamflix', 'StremFx'],
    ['watchout', 'WatchOut'],
    ['mhbox', 'MhPly']
]);
const LANGUAGES = [
    'english', 'hindi', 'tamil', 'telugu', 'malayalam', 'kannada', 'bengali', 'bangla', 'punjabi',
    'marathi', 'gujarati', 'urdu', 'korean', 'japanese', 'chinese', 'spanish', 'french', 'german',
    'russian', 'arabic', 'turkish', 'thai', 'indonesian', 'portuguese', 'italian'
];

const toBase64Url = base64 => base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromBase64Url(token) {
    let base64 = String(token).replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return base64;
}

function encryptPayload(payload) {
    const plaintext = JSON.stringify({
        ...payload,
        _req_ts: Date.now(),
        _req_salt: Math.random().toString(36).slice(2, 10)
    });
    return toBase64Url(CryptoJS.AES.encrypt(plaintext, PASSPHRASE).toString());
}

function decryptPayload(token) {
    try {
        const decrypted = CryptoJS.AES.decrypt(fromBase64Url(token), PASSPHRASE);
        return JSON.parse(CryptoJS.enc.Utf8.stringify(decrypted));
    } catch {
        return {};
    }
}

function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            error => { clearTimeout(timer); reject(error); }
        );
    });
}

async function fetchJson(url) {
    try {
        const response = await withTimeout(fetch(url, { headers: HEADERS }), 8000);
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
}

async function callApi(endpoint, payload) {
    const response = await fetchJson(`${BASE_URL}/api/${endpoint}?q=${encryptPayload(payload)}`);
    return response ? decryptPayload(response._hash) : {};
}

function normalizeEpisode(episode) {
    const number = parseInt(episode, 10);
    return number >= 800 ? (number % 100) + 1 + (Math.floor(number / 100) - 8) * 2 : number;
}

function buildRequestParams(tmdbId, mediaType, season, episode) {
    const isTv = mediaType === 'tv';
    return {
        tmdbId: String(tmdbId),
        imdb_id: '',
        type: isTv ? 'tv' : 'movie',
        season: isTv ? Number(season) : 0,
        episode: isTv ? normalizeEpisode(episode) : 0
    };
}

const capitalize = word => word[0].toUpperCase() + word.slice(1);

function detectLanguages(label) {
    return LANGUAGES.filter(language => new RegExp(`\\b${language}\\b`, 'i').test(label));
}

function isLanguageOrNoiseWord(word) {
    return LANGUAGES.includes(word.toLowerCase())
        || /^(nitro|multi|dual|audio|org|original|dubbed|subbed|subs?|hin|eng|web-?dl|web-?rip|blu-?ray|brrip|hdrip|hdtv|dvdrip|hdcam|cam|hq|hd|uhd)$/i.test(word);
}

function extractNitroTag(label) {
    const isQualityOnly = token => /^(?:\d{3,4}p?|4k|auto|[,\s])+$/i.test(token);
    const isLanguagesOnly = token => token.split(/[\s,&+/]+/).filter(Boolean).every(isLanguageOrNoiseWord);

    const tag = label
        .replace(/^\[[^\]]+\]\s*-?\s*/, '')
        .split(/[|:]/)
        .map(token => token.trim())
        .filter(Boolean)
        .find(token => !isQualityOnly(token) && !isLanguagesOnly(token));

    if (!tag) return '';
    const canonical = new Map([['hguider', 'hGuider'], ['hevc', 'HEVC'], ['atmos', 'Atmos']]);
    return canonical.get(tag.toLowerCase()) || tag;
}

function detectQuality(text) {
    if (/2160|4k/i.test(text)) return '2160p';
    if (/1080/i.test(text)) return '1080p';
    return null;
}

function buildStreamName(serverLabel, nitroTag = '', languages = []) {
    const languageSuffix = languages.map(capitalize).join(' \u2022 ');
    return ['Nxsha', serverLabel, nitroTag || languageSuffix].filter(Boolean).join(' \u2022 ');
}

function buildStreams(candidates, nameSuffix = '') {
    const streams = [];

    candidates.forEach(candidate => {
        const label = candidate.name + nameSuffix;
        streams.push({
            name: label,
            title: label,
            quality: candidate.quality,
            url: candidate.url,
            headers: candidate.headers
        });
    });

    return streams;
}

async function probeStream(stream) {
    try {
        const response = await withTimeout(
            fetch(stream.url, { headers: { ...stream.headers, Range: 'bytes=0-2047' } }),
            5000
        );

        if (response.status !== 200 && response.status !== 206) {
            return [0, 401, 403, 429].includes(response.status) ? 'unknown' : 'dead';
        }
        if (/html/i.test(response.headers.get('content-type') || '')) return 'dead';
        if (!/\.(m3u8|mpd)/i.test(stream.url)) return 'ok';

        const body = String(await response.text()).replace(/^\uFEFF/, '').trim().slice(0, 600);
        return /^<(!doctype|html|head|body)/i.test(body) ? 'dead' : 'ok';
    } catch {
        return 'unknown';
    }
}

async function verifyStreams(streams) {
    const verdicts = await Promise.all(streams.map(probeStream));
    const withVerdict = verdict => streams.filter((_, index) => verdicts[index] === verdict);

    const playable = withVerdict('ok');
    const uncertain = withVerdict('unknown')
        .slice(0, 6 - Math.min(playable.length, 2))
        .map(stream => ({ ...stream, name: `${stream.name} (may not play)` }));

    return playable.concat(uncertain);
}

function keepOneStremFx(streams) {
    const firstStremFx = streams.find(stream => stream.server === 'streamflix');
    return streams.filter(stream => stream.server !== 'streamflix' || stream === firstStremFx);
}

const PASSPHRASE = [5, 2, 7, 0, 3, 6, 1, 4]
    .map(index => ['9fc54615', '76826d0c', 'da401203', '38981625', '867ccaa3', 'f4488ab4', '24635d67', 'd23baa12'][index])
    .join('');

async function fetchServerSources(server, requestParams) {
    const { sources } = await callApi('sources', { ex_lang: true, provider: server.scraper, ...requestParams });
    return (sources || []).map(source => ({ server, source }));
}

async function discoverSources(requestParams) {
    const { servers } = await callApi('servers', requestParams);
    const supportedServers = (servers || []).filter(server => server && SERVERS.has(server.scraper));

    const sourcesPerServer = await Promise.all(
        supportedServers.map(server => fetchServerSources(server, requestParams))
    );
    return sourcesPerServer.flat();
}

const isHindi = source => /hindi/i.test(source.label || '');

function isUsableSource(source) {
    return Boolean(source && source.url)
        && !/embed/i.test(source.type || '')
        && !/\bsub\b/i.test(source.label || '');
}

function dedupeByPath(discovered) {
    const byPath = new Map();

    discovered.forEach(entry => {
        if (!isUsableSource(entry.source)) return;

        const path = String(entry.source.url).split('?')[0];
        const current = byPath.get(path);
        if (!current || (!isHindi(current.source) && isHindi(entry.source))) {
            byPath.set(path, entry);
        }
    });

    return [...byPath.values()];
}

function buildCandidates(entries) {
    const regular = [];
    const bestNitro = new Map();

    entries.forEach(({ server, source }) => {
        const label = String(source.label || source.quality || '');
        const quality = detectQuality(`${label} ${source.quality || ''}`);
        if (!quality) return;

        const serverKey = SERVERS.has(source.provider) ? source.provider : server.scraper;
        const serverLabel = SERVERS.get(serverKey);
        const base = { server: serverKey, url: source.url, quality, headers: HEADERS };

        if (serverKey !== 'nitro') {
            regular.push({ ...base, name: buildStreamName(serverLabel) });
            return;
        }

        const tag = extractNitroTag(label);
        const languages = detectLanguages(label);
        const stream = { ...base, name: buildStreamName(serverLabel, tag, languages) };

        const groupKey = tag ? tag.toLowerCase() : `~${languages.join('+')}`;
        const rank = parseInt(quality, 10) * 10 + Math.min(languages.length, 9);
        const best = bestNitro.get(groupKey);
        if (!best || rank > best.rank) bestNitro.set(groupKey, { stream, rank });
    });

    return regular.concat([...bestNitro.values()].map(({ stream }) => stream));
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === 'tv' && (season == null || episode == null)) return [];

        const requestParams = buildRequestParams(tmdbId, mediaType, season, episode);
        if (Number.isNaN(requestParams.season) || Number.isNaN(requestParams.episode)) return [];

        const candidates = buildCandidates(dedupeByPath(await discoverSources(requestParams)));
        if (!candidates.length) return [];

        const verified = keepOneStremFx(await verifyStreams(candidates));
        if (verified.length) return buildStreams(verified);

        return buildStreams(keepOneStremFx(candidates).slice(0, 12), ' (unverified)');
    } catch {
        return [];
    }
}

module.exports = { getStreams };