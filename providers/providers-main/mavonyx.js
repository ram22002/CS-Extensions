const PROVIDER = "MovieBox";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const WEB_USER_AGENT =
    "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36";
const MOBILE_USER_AGENT =
    "com.community.mbox.in/50020130 (Linux; B; Android 16; en_IN; Pixel 9; Build/UD1A.230803.041; Cronet/145.0.7582.0)";
const AUDIO_TRACK_LABELS = [
    "Original",
    "Arabic Dub", "Bengali Dub", "English Dub", "Español [Latino]", "French Dub",
    "German Dub", "Hindi Dub", "Indonesian Dub", "Italian Dub", "Japanese Dub",
    "Kannada Dub", "Korean Dub", "Malay Dub", "Malayalam Dub", "Português",
    "Português [Brasil]", "Punjabi Dub", "Russian Dub", "Español", "Tagalog Dub",
    "Tamil Dub", "Telugu Dub", "Thai Dub", "Turkish Dub", "Urdu Dub",
];
const ALWAYS_ENABLED_TRACKS = ["Original", "English Dub"];
const DEFAULT_ENABLED_TRACKS = ["Hindi Dub"];
const REGIONAL_AUDIO_LABELS = {
    esla: "Español [Latino]",
    ptbr: "Português [Brasil]",
    es: "Español",
    spanish: "Español",
    pt: "Português",
    portuguese: "Português",
};
const LANGUAGE_NAMES = {
    en: "English", hi: "Hindi", ta: "Tamil", te: "Telugu", ml: "Malayalam",
    kn: "Kannada", bn: "Bengali", pa: "Punjabi", mr: "Marathi", gu: "Gujarati",
    ur: "Urdu", ar: "Arabic", es: "Spanish", pt: "Portuguese", fr: "French",
    de: "German", it: "Italian", ru: "Russian", ja: "Japanese", ko: "Korean",
    zh: "Chinese", th: "Thai", id: "Indonesian", in: "Indonesian", ms: "Malay",
    tl: "Tagalog", fil: "Filipino", tr: "Turkish", vi: "Vietnamese", nl: "Dutch",
    pl: "Polish", sv: "Swedish", fa: "Persian", he: "Hebrew", el: "Greek",
    ro: "Romanian", hu: "Hungarian", cs: "Czech", uk: "Ukrainian", da: "Danish",
    fi: "Finnish", no: "Norwegian", bg: "Bulgarian", hr: "Croatian", sr: "Serbian",
    sk: "Slovak", si: "Sinhala", ne: "Nepali", my: "Burmese", km: "Khmer",
};

const RESOLUTION_OPTIONS = [
    { settingKey: "res_2160p", resolution: "2160p", enabledByDefault: true },
    { settingKey: "res_1080p", resolution: "1080p", enabledByDefault: true },
    { settingKey: "res_720p", resolution: "720p", enabledByDefault: false },
];
const KNOWN_RESOLUTIONS = ["2160", "1440", "1080", "720", "480", "360", "240"];
const RESOLUTION_RANK = { "2160p": 5, "1440p": 4, "1080p": 3, "720p": 2, "480p": 1 };

const DEVICE_ID = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0")
).join("");

const CLIENT_INFO = JSON.stringify({
    package_name: "com.community.mbox.in",
    version_name: "4.0.03.0920.03",
    version_code: 50020130,
    os: "android",
    os_version: "14",
    device_id: DEVICE_ID,
    install_store: "official",
    brand: "Google",
    model: "Pixel 8",
    system_language: "en",
    net: "NETWORK_WIFI",
    region: "IN",
    timezone: "Asia/Calcutta",
    sp_code: "",
});

function readToggle(key, fallback) {
    const value = SCRAPER_SETTINGS[key];
    if (value == null || value === "") return fallback;
    return !(value === false || value === "false");
}

function isResolutionEnabled(resolution) {
    if (resolution === "Unknown") return true;
    const option = RESOLUTION_OPTIONS.find((entry) => entry.resolution === resolution);
    return option ? readToggle(option.settingKey, option.enabledByDefault) : false;
}

function audioTrackSettingKey(label) {
    return "dub_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function extractLanguageBase(rawName) {
    return String(rawName || "").split(/\sdub/i)[0].split(/\ssub/i)[0].trim();
}

function toAudioTrackLabel(rawName) {
    const raw = String(rawName || "");
    if (/original/i.test(raw)) return "Original";
    const isHardsub = /\ssub/i.test(raw);
    const base = extractLanguageBase(raw);
    if (!base) return capitalize(raw.trim());
    const regionalLabel = REGIONAL_AUDIO_LABELS[base.toLowerCase()];
    if (regionalLabel) return isHardsub ? `${regionalLabel} Hardsub` : regionalLabel;
    return `${capitalize(base)}${isHardsub ? " Hardsub" : " Dub"}`;
}

function toAudioDisplayName(rawName) {
    return REGIONAL_AUDIO_LABELS[extractLanguageBase(rawName).toLowerCase()] || String(rawName).replace(/dub/g, "Audio");
}

function toLanguageName(rawLanguage) {
    const raw = String(rawLanguage || "").trim();
    const code = raw.toLowerCase();
    return LANGUAGE_NAMES[code] || LANGUAGE_NAMES[code.split("-")[0]] || raw;
}

function isArabicLanguage(rawLanguage, languageName) {
    return /^(ar|ara|arabic)\b/i.test(String(rawLanguage || "").trim()) || languageName === "Arabic";
}

function isTrackEnabled(track) {
    const label = toAudioTrackLabel(track.language);
    if (label === "Arabic Hardsub") return false;
    return ALWAYS_ENABLED_TRACKS.includes(label) || readToggle(audioTrackSettingKey(label), DEFAULT_ENABLED_TRACKS.includes(label));
}

function md5Hex(text) {
    return CryptoJS.MD5(text).toString();
}

function buildClientToken(timestamp) {
    const value = String(timestamp);
    return `${value},${md5Hex(value.split("").reverse().join(""))}`;
}

function buildCanonicalString({ method, accept, contentType, url, body, timestamp }) {
    const match = /^[a-z][a-z0-9+.-]*:\/\/[^\/?#]*([^?#]*)(?:\?([^#]*))?/i.exec(url);
    const path = match ? match[1] || "" : "";
    const rawQuery = match && match[2] ? match[2] : "";
    let canonicalUrl = path;
    if (rawQuery) {
        const sortedQuery = rawQuery
            .split("&")
            .map((part, index) => {
                const [key, value = ""] = part.split("=");
                return { key, value, index };
            })
            .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index))
            .map(({ key, value }) => `${key}=${value}`)
            .join("&");
        canonicalUrl = `${path}?${sortedQuery}`;
    }
    const bodyHash = body != null ? md5Hex(body) : "";
    const bodyLength = body != null ? String(new TextEncoder().encode(body).length) : "";
    return `${method.toUpperCase()}\n${accept}\n${contentType}\n${bodyLength}\n${timestamp}\n${bodyHash}\n${canonicalUrl}`;
}

function buildRequestSignature(request) {
    const signingKey = CryptoJS.enc.Base64.parse(atob("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw=="));
    const signature = CryptoJS.HmacMD5(buildCanonicalString(request), signingKey).toString(CryptoJS.enc.Base64);
    return `${request.timestamp}|2|${signature}`;
}

let authToken = "";
let pendingTokenRequest = null;

function parseTokenHeader(headerValue) {
    if (!headerValue) return "";
    try {
        const token = JSON.parse(headerValue).token;
        return typeof token === "string" && token.split(".").length === 3 ? token : "";
    } catch (error) {
        return "";
    }
}

async function sendSignedRequest(method, url, body, withAuth) {
    const timestamp = Date.now();
    const accept = "application/json";
    const contentType = method === "POST" ? "application/json; charset=utf-8" : "application/json";
    const headers = {
        "User-Agent": MOBILE_USER_AGENT,
        "Accept": accept,
        "Content-Type": contentType,
        "x-client-token": buildClientToken(timestamp),
        "x-tr-signature": buildRequestSignature({ method, accept, contentType, url, body, timestamp }),
        "x-client-info": CLIENT_INFO,
        "x-client-status": "0",
    };
    if (withAuth) {
        const token = await ensureToken(false);
        if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    const options = { method, headers };
    if (body != null) options.body = body;
    const response = await fetch(url, options);
    const refreshedToken = parseTokenHeader(response.headers.get("x-user"));
    if (refreshedToken) {
        authToken = refreshedToken;
        pendingTokenRequest = Promise.resolve(refreshedToken);
    }
    return response;
}

async function requestToken() {
    try {
        const response = await sendSignedRequest(
            "GET",
            "https://apig.inmoviebox.com/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1",
            null,
            false
        );
        const token = parseTokenHeader(response.headers.get("x-user"));
        if (token) authToken = token;
    } catch (error) { }
    return authToken;
}

function ensureToken(forceRefresh) {
    if (forceRefresh || !pendingTokenRequest) pendingTokenRequest = requestToken();
    return pendingTokenRequest;
}

async function callMobileApi(method, pathAndQuery, body) {
    try {
        const url = `https://api3.aoneroom.com${pathAndQuery}`;
        const tokenBefore = authToken;
        let response = await sendSignedRequest(method, url, body, true);
        if ([401, 441].includes(response.status)) {
            if (!authToken || authToken === tokenBefore) await ensureToken(true);
            response = await sendSignedRequest(method, url, body, true);
        }
        return response.status > 0 && response.status < 500 ? response : null;
    } catch (error) {
        return null;
    }
}

async function fetchMobileJson(method, pathAndQuery, payload) {
    const response = await callMobileApi(method, pathAndQuery, payload ? JSON.stringify(payload) : null);
    if (!response || response.status !== 200) return null;
    return await response.json();
}

async function fetchSubjectDetail(subjectId) {
    const json = await fetchMobileJson("GET", `/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`, null);
    return json && json.data ? json.data : null;
}

async function fetchTmdbMetadata(tmdbId, mediaType) {
    if (!TMDB_API_KEY) return null;
    const isTv = mediaType === "tv";
    let details;
    try {
        const response = await fetch(`${TMDB_BASE_URL}/${isTv ? "tv" : "movie"}/${encodeURIComponent(tmdbId)}?api_key=${TMDB_API_KEY}`);
        if (!response.ok) return null;
        details = await response.json();
    } catch (error) {
        return null;
    }
    if (!details) return null;

    const titles = [];
    [details.title, details.name, details.original_title, details.original_name].forEach((candidate) => {
        const title = candidate ? String(candidate).trim() : "";
        if (title && !titles.includes(title)) titles.push(title);
    });
    if (!titles.length) return null;

    const year = parseInt(String(details.release_date || details.first_air_date || "").slice(0, 4), 10);
    return {
        titles,
        year: isNaN(year) ? null : year,
        rating: typeof details.vote_average === "number" && details.vote_average > 0 ? details.vote_average : null,
        isTv,
    };
}

function normalizeTitle(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[\u2018\u2019\u201b\u2032]/g, "'")
        .replace(/[^a-z0-9\u00c0-\uffff ]/g, " ")
        .replace(/[\u2000-\u206f\u3000-\u303f\uff00-\uff0f\uff1a-\uff20]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function stripTitleNoise(text) {
    return String(text || "")
        .replace(/\[.*?\]/g, " ")
        .replace(/\(.*?\)/g, " ")
        .replace(/\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi, " ");
}

function titlesOverlap(a, b) {
    const tokensA = new Set(a.split(" ").filter(Boolean));
    const tokensB = new Set(b.split(" ").filter(Boolean));
    if (!tokensA.size || !tokensB.size) return false;
    let shared = 0;
    tokensA.forEach((token) => {
        if (tokensB.has(token)) shared++;
    });
    return shared >= Math.max(1, Math.floor((Math.min(tokensA.size, tokensB.size) * 3) / 4));
}

function scoreTitleMatch(rawTitle, expectedTitles) {
    const variants = [
        normalizeTitle(rawTitle.split("[")[0].replace(/\(.*?\)/g, " ")),
        normalizeTitle(stripTitleNoise(rawTitle)),
    ];
    let score = 0;
    for (const expected of expectedTitles) {
        const normalizedExpected = normalizeTitle(expected);
        if (!normalizedExpected) continue;
        for (const variant of variants) {
            if (!variant) continue;
            if (titlesOverlap(normalizedExpected, variant)) return 50;
            if (normalizedExpected.includes(variant) || variant.includes(normalizedExpected)) score = Math.max(score, 20);
        }
    }
    return score;
}

function scoreYearMatch(expectedYear, releaseDate) {
    const foundYear = parseInt(String(releaseDate || "").slice(0, 4), 10);
    if (expectedYear == null || isNaN(foundYear)) return 0;
    const difference = Math.abs(foundYear - expectedYear);
    if (difference === 0) return 40;
    if (difference === 1) return 20;
    if (difference >= 4) return -40;
    if (difference >= 2) return -15;
    return 0;
}

function scoreRatingMatch(expectedRating, ratingValue) {
    const foundRating = parseFloat(ratingValue);
    if (expectedRating == null || isNaN(foundRating)) return 0;
    const difference = Math.abs(foundRating - expectedRating);
    if (difference <= 0.5) return 10;
    if (difference <= 1.0) return 5;
    return 0;
}

function scoreSearchResult(result, metadata) {
    const rawTitle = String(result.title || "");
    const subjectType = parseInt(result.subjectType, 10);
    const resultIsTv = subjectType === 2 || subjectType === 7;
    return (
        scoreTitleMatch(rawTitle, metadata.titles) +
        scoreYearMatch(metadata.year, result.releaseDate) +
        scoreRatingMatch(metadata.rating, result.imdbRatingValue) +
        (metadata.isTv === resultIsTv ? 15 : -30) +
        (rawTitle.includes("[") ? 0 : 2)
    );
}

async function searchCatalog(keyword) {
    const json = await fetchMobileJson("POST", "/wefeed-mobile-bff/subject-api/search/v2", {
        page: 1,
        perPage: 20,
        keyword,
        restrictKid: 0,
    });
    const groups = json && json.data && json.data.results;
    if (!Array.isArray(groups)) return [];
    const subjects = [];
    groups.forEach((group) => {
        if (!group || !Array.isArray(group.subjects)) return;
        group.subjects.forEach((subject) => {
            if (subject && subject.subjectId != null && subject.title) subjects.push(subject);
        });
    });
    return subjects;
}

async function findMatchingSubjectId(metadata) {
    const queries = [metadata.titles[0]];
    if (metadata.titles[1] && normalizeTitle(metadata.titles[1]) !== normalizeTitle(metadata.titles[0])) {
        queries.push(metadata.titles[1]);
    }
    for (const query of queries) {
        const results = await searchCatalog(query);
        let bestResult = null;
        let bestScore = -Infinity;
        for (const result of results) {
            const score = scoreSearchResult(result, metadata);
            if (score > bestScore) {
                bestScore = score;
                bestResult = result;
            }
        }
        if (bestResult && bestScore >= 40) return String(bestResult.subjectId);
    }
    return null;
}

function parseResolution(text) {
    const haystack = String(text || "").toLowerCase();
    const match = KNOWN_RESOLUTIONS.find((resolution) => haystack.includes(resolution));
    return match ? `${match}p` : "Unknown";
}

function resolutionRank(resolution) {
    return RESOLUTION_RANK[resolution] || 0;
}

function buildSortPrefix(position) {
    return position
        .toString(2)
        .padStart(20, "0")
        .replace(/1/g, "\uFEFF")
        .replace(/0/g, "\u200B");
}

function decodeBase64(value) {
    let padded = String(value).replace(/\s/g, "");
    const remainder = padded.length % 4;
    if (remainder > 0) padded += "=".repeat(4 - remainder);
    return atob(padded);
}

function extractManifestUrlFromCookie(signCookie) {
    if (!signCookie) return null;

    const edgeMatch = /Edge-Cache-Cookie=urlprefix=([^:;\s]+)/.exec(signCookie);
    if (edgeMatch) {
        try {
            const prefix = decodeBase64(edgeMatch[1].replace(/_/g, "/").replace(/-/g, "+"));
            return `${prefix.replace(/\/+$/, "")}/index.mpd`;
        } catch (error) {
            return null;
        }
    }

    const policyMatch = /CloudFront-Policy=([^;]+)/.exec(signCookie);
    if (!policyMatch) return null;
    const encodedPolicy = policyMatch[1];
    const decodingAttempts = [
        encodedPolicy.replace(/-/g, "+").replace(/~/g, "/").replace(/_/g, "="),
        encodedPolicy.replace(/-/g, "+").replace(/_/g, "/"),
    ];
    for (const attempt of decodingAttempts) {
        try {
            const policy = JSON.parse(decodeBase64(attempt));
            const resource = policy && policy.Statement && policy.Statement[0] && policy.Statement[0].Resource;
            if (resource) {
                const trimmed = String(resource).replace(/[*\/]+$/, "");
                return /\.mpd$/i.test(trimmed) ? trimmed : `${trimmed}/index.mpd`;
            }
        } catch (error) { }
    }
    return null;
}

function isPlaceholderStream(resolvedUrl, originalUrl) {
    return (
        resolvedUrl.includes("b164fbfb4347792950bdfbfb563d39d9") ||
        (resolvedUrl === originalUrl && originalUrl.includes("/other/2026/09/"))
    );
}

function detectStreamFormat(declaredFormat, url) {
    const format = String(declaredFormat || "").toUpperCase();
    if (format === "DASH" || url.includes(".mpd")) return "DASH";
    if (format === "HLS" || url.includes(".m3u8")) return "HLS";
    return "MP4";
}

function parseDetailUrl(detailUrl) {
    const match = /^(https?):\/\/([^\/?#:@]+)(?::\d+)?/i.exec(String(detailUrl || ""));
    if (!match) return null;
    const cleaned = String(detailUrl).replace(/\/+$/, "").split("?")[0];
    return { origin: `${match[1]}://${match[2]}`, path: cleaned.substring(cleaned.lastIndexOf("/") + 1) };
}

function buildSiteHeaders(origin, path, subjectId) {
    const siteOrigin = origin || "https://themoviebox.xyz";
    return {
        "Origin": siteOrigin,
        "Referer": path
            ? `${siteOrigin}/movies/${path}?id=${subjectId}&type=/movie/detail&detailSe=&detailEp=&lang=en`
            : `${siteOrigin}/`,
        "User-Agent": WEB_USER_AGENT,
        "Accept": "*/*",
    };
}

function buildStreamCandidate(stream, baseHeaders, declaredFormat, playback) {
    const originalUrl = stream && stream.url ? String(stream.url) : "";
    if (!originalUrl) return null;

    const signCookie = stream.signCookie ? String(stream.signCookie) : "";
    const resolvedUrl = extractManifestUrlFromCookie(signCookie) || originalUrl;
    if (isPlaceholderStream(resolvedUrl, originalUrl)) return null;

    const headers = { ...baseHeaders };
    if (signCookie) {
        headers[stream.signHeaderKey ? String(stream.signHeaderKey) : "X-MB-Token"] = signCookie;
        headers["Cookie"] = signCookie;
    }
    return {
        url: resolvedUrl,
        format: detectStreamFormat(declaredFormat, resolvedUrl),
        resolution: parseResolution(stream.resolutions),
        headers,
        streamId: stream.id != null ? String(stream.id) : `${playback.subjectId}|${playback.season}|${playback.episode}`,
    };
}

async function fetchSubtitles(streamId, trackLanguage, subjectId) {
    const encodedStreamId = encodeURIComponent(streamId);
    const endpoints = [
        `/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=${subjectId}&streamId=${encodedStreamId}`,
        `/wefeed-mobile-bff/subject-api/get-ext-captions?subjectId=${subjectId}&resourceId=${encodedStreamId}&episode=0`,
    ];
    const responses = await Promise.all(endpoints.map((endpoint) => fetchMobileJson("GET", endpoint, null).catch(() => null)));
    const audioName = toAudioDisplayName(trackLanguage);
    const seenUrls = new Set();
    const subtitles = [];
    responses.forEach((json) => {
        const captions = json && json.data && json.data.extCaptions;
        if (!Array.isArray(captions)) return;
        captions.forEach((caption) => {
            const url = caption && caption.url;
            if (!url || seenUrls.has(url)) return;
            seenUrls.add(url);
            const rawLanguage = caption.lanName || caption.language || caption.lan || "Unknown";
            const language = toLanguageName(rawLanguage);
            if (isArabicLanguage(rawLanguage, language)) return;
            subtitles.push({ url, language, name: `${language} (${audioName})` });
        });
    });
    return subtitles;
}

async function fetchMobileStreams(playback, site) {
    const json = await fetchMobileJson(
        "GET",
        `/wefeed-mobile-bff/subject-api/play-info?subjectId=${playback.subjectId}&se=${playback.season}&ep=${playback.episode}`,
        null
    );
    const streams = json && json.data && json.data.streams;
    if (!Array.isArray(streams)) return [];

    const baseHeaders = buildSiteHeaders(site.origin, site.path, playback.subjectId);
    const isDash = (stream) => String(stream.format || "").toUpperCase() === "DASH" || String(stream.url || "").includes(".mpd");
    const dashFirst = streams.filter(isDash).concat(streams.filter((stream) => !isDash(stream)));

    const candidates = [];
    for (const stream of dashFirst) {
        const candidate = buildStreamCandidate(stream, baseHeaders, stream.format, playback);
        if (candidate && candidate.format !== "MP4") candidates.push(candidate);
    }
    return candidates;
}

async function fetchWebStreamsFromOrigin(origin, path, playback) {
    try {
        const headers = {
            "User-Agent": WEB_USER_AGENT,
            "Referer": buildSiteHeaders(origin, path, playback.subjectId).Referer,
            "Accept": "application/json",
            "x-client-info": JSON.stringify({ timezone: "Asia/Calcutta" }),
            "x-request-lang": "en",
            "x-vip-restrict": "0",
            "x-no-high-risk-restrict": "0",
            "x-source": "",
        };
        const token = authToken || (await ensureToken(false));
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const response = await fetch(
            `${origin}/wefeed-h5api-bff/subject/play?subjectId=${playback.subjectId}&se=${playback.season}&ep=${playback.episode}&detailPath=${path}&streamSignType=1&supportCodecs%5Bhevc%5D=1&supportCodecs%5Bh264%5D=1`,
            { headers }
        );
        if (response.status !== 200) return null;
        const json = await response.json();
        const streams = json && json.data && json.data.streams;
        return Array.isArray(streams) && streams.length ? { origin, streams } : null;
    } catch (error) {
        return null;
    }
}

async function fetchWebStreams(origins, path, playback) {
    const responses = await Promise.all(origins.map((origin) => fetchWebStreamsFromOrigin(origin, path, playback)));
    const firstHit = responses.find(Boolean);
    if (!firstHit) return [];
    const baseHeaders = buildSiteHeaders(firstHit.origin, path, playback.subjectId);
    return firstHit.streams
        .map((stream) => buildStreamCandidate(stream, baseHeaders, "MP4", playback))
        .filter(Boolean);
}

function resolveMainSite(subject) {
    const parsed = subject.detailUrl ? parseDetailUrl(subject.detailUrl) : null;
    return {
        origin: parsed ? parsed.origin : null,
        path: (parsed && parsed.path) || subject.detailPath || null,
    };
}

async function resolveTrackSite(context, track) {
    if (track.subjectId === context.originalSubjectId) return context.mainSite;

    let detailUrl = track.detailUrl;
    let detailPath = null;
    if (!detailUrl) {
        const detail = await fetchSubjectDetail(track.subjectId);
        if (detail) {
            detailUrl = detail.detailUrl || null;
            if (!detailUrl) detailPath = detail.detailPath || null;
        }
    }
    const parsed = detailUrl ? parseDetailUrl(detailUrl) : null;
    if (parsed) return parsed;
    if (detailPath) return { origin: context.mainSite.origin, path: detailPath };
    return context.mainSite;
}

function extractAudioTracks(subject, subjectId) {
    let originalLanguage = "Original";
    const seenIds = new Set();
    const tracks = [];
    (Array.isArray(subject.dubs) ? subject.dubs : []).forEach((dub) => {
        const dubSubjectId = dub && dub.subjectId != null ? String(dub.subjectId) : "";
        const language = dub && dub.lanName ? String(dub.lanName) : "";
        if (!dubSubjectId || !language) return;
        if (dubSubjectId === subjectId) {
            originalLanguage = language;
            return;
        }
        if (seenIds.has(dubSubjectId)) return;
        seenIds.add(dubSubjectId);
        tracks.push({ subjectId: dubSubjectId, language, detailUrl: dub.detailUrl || null });
    });
    tracks.unshift({ subjectId, language: originalLanguage, detailUrl: null });
    return tracks;
}

async function resolveAudioTrack(context, track) {
    try {
        const site = await resolveTrackSite(context, track);
        const origins = [];
        if (site.origin) origins.push(String(site.origin).replace(/\/+$/, ""));
        if (!origins.includes("https://h5-api.aoneroom.com")) origins.push("https://h5-api.aoneroom.com");

        const playback = { subjectId: track.subjectId, season: context.season, episode: context.episode };
        const [mobileStreams, webStreams] = await Promise.all([
            fetchMobileStreams(playback, site).catch(() => []),
            fetchWebStreams(origins, site.path || "", playback).catch(() => []),
        ]);
        const candidates = mobileStreams.concat(webStreams).filter((candidate) => isResolutionEnabled(candidate.resolution));
        if (!candidates.length) return [];

        const subtitles = readToggle("subtitles", true)
            ? await fetchSubtitles(candidates[0].streamId, track.language, track.subjectId).catch(() => [])
            : [];
        return candidates.map((candidate) => ({ ...candidate, language: track.language, subtitles }));
    } catch (error) {
        return [];
    }
}

function dedupeByUrl(candidates) {
    const seenUrls = new Set();
    return candidates.filter((candidate) => {
        if (seenUrls.has(candidate.url)) return false;
        seenUrls.add(candidate.url);
        return true;
    });
}

function sortByResolution(candidates) {
    return [...candidates].sort((a, b) => resolutionRank(b.resolution) - resolutionRank(a.resolution));
}

function toStreamResult(candidate, position) {
    const audioName = toAudioDisplayName(candidate.language);
    const prefix = buildSortPrefix(position);
    const result = {
        name: `${prefix}${PROVIDER} • ${audioName} • ${candidate.resolution}`,
        title: `${prefix}${PROVIDER} • ${audioName} • ${candidate.resolution}`,
        url: candidate.url,
        quality: `${candidate.resolution} • ${candidate.format}`,
        headers: candidate.headers,
    };
    if (candidate.subtitles.length) result.subtitles = candidate.subtitles;
    return result;
}

async function onSettings() {
    const layout = [
        { type: "header", label: PROVIDER },
        {
            type: "toggle",
            key: "subtitles",
            label: "Subtitles",
            defaultValue: false,
            description: "Subtitles for each audio track [Default & Recommended: Disabled]",
        },
        { type: "header", label: "Resolutions" },
        { type: "info", label: "Only the enabled resolutions are returned. Anything below 720p is always removed." },
        { type: "toggle", key: "res_2160p", label: "2160p (4K)", defaultValue: true },
        { type: "toggle", key: "res_1080p", label: "1080p", defaultValue: true },
        { type: "toggle", key: "res_720p", label: "720p", defaultValue: false },
        { type: "header", label: "Audio tracks" },
        { type: "info", label: "Original and English Dub are always on. Turned-off tracks are skipped entirely and never requested." },
    ];
    AUDIO_TRACK_LABELS.filter((label) => !ALWAYS_ENABLED_TRACKS.includes(label)).forEach((label) => {
        layout.push({
            type: "toggle",
            key: audioTrackSettingKey(label),
            label,
            defaultValue: DEFAULT_ENABLED_TRACKS.includes(label),
        });
    });
    return layout;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const isTv = mediaType === "tv";
        if (!isTv && mediaType !== "movie") return [];
        if (isTv && (season == null || episode == null)) return [];

        const [metadata] = await Promise.all([fetchTmdbMetadata(tmdbId, mediaType), ensureToken(false)]);
        if (!metadata) return [];

        const subjectId = await findMatchingSubjectId(metadata);
        if (!subjectId) return [];

        const subject = await fetchSubjectDetail(subjectId);
        if (!subject) return [];

        const enabledTracks = extractAudioTracks(subject, subjectId).filter(isTrackEnabled);
        if (!enabledTracks.length) return [];

        const context = {
            originalSubjectId: subjectId,
            mainSite: resolveMainSite(subject),
            season: isTv ? Number(season) : 0,
            episode: isTv ? Number(episode) : 0,
        };
        const trackResults = await Promise.all(enabledTracks.map((track) => resolveAudioTrack(context, track)));

        return sortByResolution(dedupeByUrl(trackResults.flat())).map(toStreamResult);
    } catch (error) {
        return [];
    }
}

module.exports = { getStreams, onSettings };