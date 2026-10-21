const BASE_URL = "https://mapple.fun";
const DSKTP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const MBILE_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const SERVERS = [
    { name: "Zeus", source: "mapple" },
    { name: "Prometheus", source: "s10" },
    { name: "Persephone", source: "s12" },
    { name: "Poseidon", source: "s25" }
];

const SHA256_K = new Int32Array([
    1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221,
    3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580,
    3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986,
    2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895,
    666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037,
    2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344,
    430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779,
    1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298
]);

const SHA256_IS = new Int32Array([
    1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225
]);

function sha256Compress(state, schedule, data, offset) {
    let i, pos, a, b, c, d, e, f, g, h, temp1, sum0, sum1, choice, majority, w15, w2;
    for (i = 0; i < 16; i++) {
        pos = offset + i * 4;
        schedule[i] = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
    }
    for (i = 16; i < 64; i++) {
        w15 = schedule[i - 15];
        w2 = schedule[i - 2];
        schedule[i] = (schedule[i - 16] + (((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3)) +
            schedule[i - 7] + (((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10))) | 0;
    }
    a = state[0]; b = state[1]; c = state[2]; d = state[3];
    e = state[4]; f = state[5]; g = state[6]; h = state[7];
    for (i = 0; i < 64; i += 8) {
        sum1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)));
        choice = (e & f) ^ (~e & g);
        temp1 = (h + sum1 + choice + SHA256_K[i + 0] + schedule[i + 0]) | 0;
        sum0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)));
        majority = (a & b) ^ (a & c) ^ (b & c);
        d = (d + temp1) | 0;
        h = (temp1 + sum0 + majority) | 0;

        sum1 = (((d >>> 6) | (d << 26)) ^ ((d >>> 11) | (d << 21)) ^ ((d >>> 25) | (d << 7)));
        choice = (d & e) ^ (~d & f);
        temp1 = (g + sum1 + choice + SHA256_K[i + 1] + schedule[i + 1]) | 0;
        sum0 = (((h >>> 2) | (h << 30)) ^ ((h >>> 13) | (h << 19)) ^ ((h >>> 22) | (h << 10)));
        majority = (h & a) ^ (h & b) ^ (a & b);
        c = (c + temp1) | 0;
        g = (temp1 + sum0 + majority) | 0;

        sum1 = (((c >>> 6) | (c << 26)) ^ ((c >>> 11) | (c << 21)) ^ ((c >>> 25) | (c << 7)));
        choice = (c & d) ^ (~c & e);
        temp1 = (f + sum1 + choice + SHA256_K[i + 2] + schedule[i + 2]) | 0;
        sum0 = (((g >>> 2) | (g << 30)) ^ ((g >>> 13) | (g << 19)) ^ ((g >>> 22) | (g << 10)));
        majority = (g & h) ^ (g & a) ^ (h & a);
        b = (b + temp1) | 0;
        f = (temp1 + sum0 + majority) | 0;

        sum1 = (((b >>> 6) | (b << 26)) ^ ((b >>> 11) | (b << 21)) ^ ((b >>> 25) | (b << 7)));
        choice = (b & c) ^ (~b & d);
        temp1 = (e + sum1 + choice + SHA256_K[i + 3] + schedule[i + 3]) | 0;
        sum0 = (((f >>> 2) | (f << 30)) ^ ((f >>> 13) | (f << 19)) ^ ((f >>> 22) | (f << 10)));
        majority = (f & g) ^ (f & h) ^ (g & h);
        a = (a + temp1) | 0;
        e = (temp1 + sum0 + majority) | 0;

        sum1 = (((a >>> 6) | (a << 26)) ^ ((a >>> 11) | (a << 21)) ^ ((a >>> 25) | (a << 7)));
        choice = (a & b) ^ (~a & c);
        temp1 = (d + sum1 + choice + SHA256_K[i + 4] + schedule[i + 4]) | 0;
        sum0 = (((e >>> 2) | (e << 30)) ^ ((e >>> 13) | (e << 19)) ^ ((e >>> 22) | (e << 10)));
        majority = (e & f) ^ (e & g) ^ (f & g);
        h = (h + temp1) | 0;
        d = (temp1 + sum0 + majority) | 0;

        sum1 = (((h >>> 6) | (h << 26)) ^ ((h >>> 11) | (h << 21)) ^ ((h >>> 25) | (h << 7)));
        choice = (h & a) ^ (~h & b);
        temp1 = (c + sum1 + choice + SHA256_K[i + 5] + schedule[i + 5]) | 0;
        sum0 = (((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10)));
        majority = (d & e) ^ (d & f) ^ (e & f);
        g = (g + temp1) | 0;
        c = (temp1 + sum0 + majority) | 0;

        sum1 = (((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7)));
        choice = (g & h) ^ (~g & a);
        temp1 = (b + sum1 + choice + SHA256_K[i + 6] + schedule[i + 6]) | 0;
        sum0 = (((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10)));
        majority = (c & d) ^ (c & e) ^ (d & e);
        f = (f + temp1) | 0;
        b = (temp1 + sum0 + majority) | 0;

        sum1 = (((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7)));
        choice = (f & g) ^ (~f & h);
        temp1 = (a + sum1 + choice + SHA256_K[i + 7] + schedule[i + 7]) | 0;
        sum0 = (((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10)));
        majority = (b & c) ^ (b & d) ^ (c & d);
        e = (e + temp1) | 0;
        a = (temp1 + sum0 + majority) | 0;
    }
    state[0] = (state[0] + a) | 0; state[1] = (state[1] + b) | 0;
    state[2] = (state[2] + c) | 0; state[3] = (state[3] + d) | 0;
    state[4] = (state[4] + e) | 0; state[5] = (state[5] + f) | 0;
    state[6] = (state[6] + g) | 0; state[7] = (state[7] + h) | 0;
}

function hasLeadingZeroBits(state, requiredBits) {
    let remaining = requiredBits;
    for (let i = 0; i < 8; i++) {
        if (remaining <= 0) return true;
        if (state[i] === 0) {
            remaining -= 32;
            continue;
        }
        return Math.clz32(state[i]) >= remaining;
    }
    return true;
}

function solveProofOfWork(challenge, difficulty) {
    const prefix = new TextEncoder().encode(String(challenge));
    const prefixLength = prefix.length;
    const state = new Int32Array(8);
    const midState = new Int32Array(8);
    const schedule = new Int32Array(64);
    const firstDynamicBlock = Math.floor(prefixLength / 64);

    for (let digits = 1; digits <= 8; digits++) {
        const rangeStart = digits === 1 ? 0 : Math.pow(10, digits - 1);
        const rangeEnd = Math.min(Math.pow(10, digits), 20000000);
        const messageLength = prefixLength + digits;
        const paddedLength = Math.ceil((messageLength + 9) / 64) * 64;
        const buffer = new Uint8Array(paddedLength);
        buffer.set(prefix, 0);
        buffer[messageLength] = 128;
        const bitLength = messageLength * 8;
        buffer[paddedLength - 4] = (bitLength >>> 24) & 255;
        buffer[paddedLength - 3] = (bitLength >>> 16) & 255;
        buffer[paddedLength - 2] = (bitLength >>> 8) & 255;
        buffer[paddedLength - 1] = bitLength & 255;

        midState.set(SHA256_IS);
        for (let block = 0; block < firstDynamicBlock; block++) {
            sha256Compress(midState, schedule, buffer, block * 64);
        }

        for (let nonce = rangeStart; nonce < rangeEnd; nonce++) {
            let remainder = nonce;
            for (let pos = messageLength - 1; pos >= prefixLength; pos--) {
                buffer[pos] = 48 + (remainder % 10);
                remainder = (remainder / 10) | 0;
            }
            state.set(midState);
            for (let offset = firstDynamicBlock * 64; offset < paddedLength; offset += 64) {
                sha256Compress(state, schedule, buffer, offset);
            }
            if (hasLeadingZeroBits(state, difficulty)) return String(nonce);
        }
    }
    return null;
}

function buildApiHeaders(referer, isJson, cookie) {
    const headers = { "User-Agent": MBILE_UA, Accept: "*/*", Origin: BASE_URL, Referer: referer };
    if (isJson) headers["Content-Type"] = "application/json";
    if (cookie) headers.Cookie = cookie;
    return headers;
}

function buildPlaybackHeaders() {
    return { Referer: `${BASE_URL}/`, Origin: BASE_URL, "User-Agent": DSKTP_UA };
}

function createCookieJar() {
    const cookies = {};
    return {
        update(response) {
            let rawCookies = [];
            try {
                if (response && response.headers && typeof response.headers.getSetCookie === "function") {
                    rawCookies = response.headers.getSetCookie() || [];
                } else if (response && response.headers) {
                    const header = response.headers.get("set-cookie");
                    if (header) rawCookies = [header];
                }
            } catch (e) { }
            rawCookies.forEach(function (cookie) {
                const pair = cookie.split(";")[0].split("=");
                if (pair.length >= 2) cookies[pair[0].trim()] = pair.slice(1).join("=").trim();
            });
        },
        serialize() {
            return Object.keys(cookies).map(function (name) {
                return `${name}=${cookies[name]}`;
            }).join("; ");
        }
    };
}

async function createSession(tmdbId, mediaType, tvSlug, referer) {
    try {
        const jar = createCookieJar();
        const homeResponse = await fetch(`${BASE_URL}/`, {
            headers: { "User-Agent": MBILE_UA, Accept: "text/html" }
        });
        jar.update(homeResponse);
        await homeResponse.text();

        const tokenResponse = await fetch(`${BASE_URL}/api/request-token`, {
            method: "POST",
            headers: buildApiHeaders(referer, true, jar.serialize()),
            body: ""
        });
        jar.update(tokenResponse);
        if (!tokenResponse.ok) return null;
        const tokenData = await tokenResponse.json();
        const requestToken = tokenData && tokenData.token;
        if (!requestToken) return null;

        const payload = {
            mediaId: Number(tmdbId),
            mediaType: mediaType,
            tv_slug: tvSlug,
            requestToken: requestToken
        };

        const initPlayback = async function (body) {
            const response = await fetch(`${BASE_URL}/api/playback-init`, {
                method: "POST",
                headers: buildApiHeaders(referer, true, jar.serialize()),
                body: JSON.stringify(body)
            });
            jar.update(response);
            return response.json();
        };

        let result = await initPlayback(payload);
        if (result && result.success && result.token) {
            return { requestToken: requestToken, playbackToken: result.token, jar: jar, referer: referer };
        }
        if (result && result.requiresPow && result.pow) {
            const nonce = solveProofOfWork(result.pow.challenge, result.pow.difficulty || 18);
            if (nonce === null) return null;
            result = await initPlayback(Object.assign({}, payload, {
                pow: { challengeId: result.pow.challengeId, nonce: nonce }
            }));
            if (result && result.token) {
                return { requestToken: requestToken, playbackToken: result.token, jar: jar, referer: referer };
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

function resolvePlaylistUrl(entry, playlistUrl) {
    if (/^https?:\/\//i.test(entry)) return entry;
    const cleanUrl = playlistUrl.split("#")[0].split("?")[0];
    if (entry.charAt(0) === "/") {
        const origin = cleanUrl.match(/^(https?:\/\/[^\/]+)/i);
        return `${origin ? origin[1] : ""}${entry}`;
    }
    return `${cleanUrl.slice(0, cleanUrl.lastIndexOf("/") + 1)}${entry}`;
}

function buildStream(url, serverName, quality) {
    return {
        name: `Mapple \u2022 ${serverName}`,
        title: `Mapple \u2022 ${serverName}`,
        url: url,
        quality: quality,
        headers: buildPlaybackHeaders()
    };
}

function getResolutionLabel(width, height) {
    if (width >= 3200 || height >= 2000) return "2160p";
    if (width >= 1800 || height >= 1000) return "1080p";
    if (width >= 1200 || height >= 700) return "720p";
    return `${height}p`;
}

async function parseMasterPlaylist(playlistUrl, serverName) {
    try {
        const response = await fetch(playlistUrl, { headers: buildPlaybackHeaders() });
        if (!response.ok) return null;
        const content = await response.text();
        if (content.indexOf("#EXT-X-STREAM-INF") === -1) return null;
        const lines = content.split("\n");
        const streams = [];
        let quality = "Unknown";
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.indexOf("#EXT-X-STREAM-INF") === 0) {
                const resolution = line.match(/RESOLUTION=(\d+)x(\d+)/);
                quality = resolution ? getResolutionLabel(Number(resolution[1]), Number(resolution[2])) : "Unknown";
            } else if (line && line.charAt(0) !== "#") {
                streams.push(buildStream(resolvePlaylistUrl(line, playlistUrl), serverName, quality));
                quality = "Unknown";
            }
        }
        return streams;
    } catch (e) {
        return null;
    }
}

async function fetchServerStreams(server, tmdbId, mediaType, tvSlug, session) {
    try {
        const encryptResponse = await fetch(`${BASE_URL}/api/encrypt`, {
            method: "POST",
            headers: buildApiHeaders(session.referer, true, session.jar.serialize()),
            body: JSON.stringify({
                data: { mediaId: Number(tmdbId), mediaType: mediaType, tv_slug: tvSlug, source: server.source },
                endpoint: "stream-encrypted",
                requestToken: session.requestToken
            })
        });
        if (!encryptResponse.ok) return [];
        const encrypted = await encryptResponse.json();
        if (!encrypted || !encrypted.url) return [];

        const streamEndpoint = `${BASE_URL}${encrypted.url}&requestToken=${encodeURIComponent(session.requestToken)}&token=${encodeURIComponent(session.playbackToken)}`;
        const streamResponse = await fetch(streamEndpoint, {
            headers: buildApiHeaders(session.referer, false, session.jar.serialize())
        });
        if (!streamResponse.ok) return [];
        const streamData = await streamResponse.json();
        const streamUrl = streamData && streamData.success && streamData.data && streamData.data.stream_url;
        if (!streamUrl || String(streamUrl).indexOf("playback-unavailable") !== -1) return [];

        const variants = await parseMasterPlaylist(streamUrl, server.name);
        if (variants && variants.length) return variants;
        return [buildStream(streamUrl, server.name, "Auto")];
    } catch (e) {
        return [];
    }
}

function getQualityRank(quality) {
    const value = String(quality || "").toLowerCase();
    if (value === "auto") return 5;
    if (/2160|4k|uhd/.test(value)) return 10;
    if (/1440|2k/.test(value)) return 8;
    if (/1080|fhd/.test(value)) return 6;
    if (/720|hd/.test(value)) return 4;
    if (/480/.test(value)) return 2;
    return 0;
}

function buildSortPrefix(rank) {
    let binary = Math.max(0, 10 - rank).toString(2);
    while (binary.length < 20) binary = `0${binary}`;
    return binary.split("").map(function (bit) {
        return bit === "1" ? "\uFEFF" : "\u200B";
    }).join("");
}

function selectStreams(streams) {
    const seenUrls = new Set();
    const candidates = streams.filter(function (stream) {
        if (!stream || !stream.url || seenUrls.has(stream.url)) return false;
        seenUrls.add(stream.url);
        const rank = getQualityRank(stream.quality);
        return rank === 10 || rank === 6;
    });
    candidates.sort(function (a, b) {
        return getQualityRank(b.quality) - getQualityRank(a.quality);
    });
    return candidates.slice(0, 20).map(function (stream) {
        const prefix = buildSortPrefix(getQualityRank(stream.quality));
        stream.name = `${prefix}${stream.name}`;
        stream.title = `${prefix}${stream.title}`;
        return stream;
    });
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (!/^\d+$/.test(String(tmdbId))) return [];
        const type = mediaType === "tv" ? "tv" : "movie";
        if (type === "tv" && (season == null || episode == null)) return [];

        const tvSlug = type === "tv" ? `${Number(season)}-${Number(episode)}` : "";
        const referer = type === "tv"
            ? `${BASE_URL}/tv/${tmdbId}/${Number(season)}/${Number(episode)}`
            : `${BASE_URL}/movie/${tmdbId}`;

        const session = await createSession(tmdbId, type, tvSlug, referer);
        if (!session) return [];

        const results = await Promise.all(SERVERS.map(function (server) {
            return fetchServerStreams(server, tmdbId, type, tvSlug, session);
        }));
        return selectStreams([].concat.apply([], results));
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };