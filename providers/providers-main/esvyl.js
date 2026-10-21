const BASE_URL = "https://vidbolt.xyz";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const P_HEADERS = {
    "Referer": `${BASE_URL}/`,
    "User-Agent": USER_AGENT,
};
const HEADERS = { ...P_HEADERS, "Accept": "application/json" };
const SERVERS = ["quantum", "vega", "callisto", "orion", "fastva"];
const SERVER_LABELS = {
    quantum: "Quantum",
    vega: "Vega",
    callisto: "Callisto",
    orion: "Orion",
    fastva: "FastVA",
};
const Q_2160 = { label: "2160p", prefix: "\u200B".repeat(20) };
const Q_1080 = { label: "1080p", prefix: "\u200B".repeat(17) + "\uFEFF\u200B\u200B" };

async function fetchResolverPayload(queryString) {
    try {
        const response = await fetch(`${BASE_URL}/api/resolve?${queryString}`, { headers: HEADERS });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

function parseQuality(rawQuality) {
    const normalized = String(rawQuality || "").trim().toLowerCase();
    if (/2160|4k|uhd/.test(normalized)) return Q_2160;
    if (/1080|fhd/.test(normalized)) return Q_1080;
    return null;
}

function parseSources(payload) {
    const stream = payload && payload.stream;
    const rawSources = stream && Array.isArray(stream.sources) ? stream.sources : [];
    const seenUrls = new Set();
    const candidates = [];

    for (const source of rawSources) {
        if (!source || typeof source.url !== "string" || !source.url || seenUrls.has(source.url)) continue;
        const quality = parseQuality(source.quality || source.name);
        if (!quality) continue;
        seenUrls.add(source.url);
        candidates.push({ url: source.url, quality });
    }

    return {
        candidates,
        serverName: stream && typeof stream.server === "string" ? stream.server : "",
    };
}

async function locateSources(queryString) {
    const primary = parseSources(await fetchResolverPayload(queryString));
    if (primary.candidates.length) return primary;

    const fallbacks = await Promise.all(
        SERVERS.map(async (server) => {
            const parsed = parseSources(await fetchResolverPayload(`${queryString}&prefer=${server}`));
            return { candidates: parsed.candidates, serverName: parsed.serverName || server };
        })
    );

    return fallbacks.find((result) => result.candidates.length) || { candidates: [], serverName: "" };
}

function formatServer(serverName) {
    if (!serverName) return "";
    const label = SERVER_LABELS[serverName.toLowerCase()] || `${serverName.charAt(0).toUpperCase()}${serverName.slice(1)}`;
    return ` \u2022 ${label}`;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    if (!/^\d+$/.test(String(tmdbId))) return [];

    const isSeries = mediaType === "tv";
    if (!isSeries && mediaType !== "movie") return [];
    if (isSeries && (season == null || episode == null)) return [];

    const queryString = isSeries
        ? `type=tv&id=${tmdbId}&season=${season}&episode=${episode}`
        : `type=movie&id=${tmdbId}`;

    const { candidates, serverName } = await locateSources(queryString);
    const serverLabel = formatServer(serverName);

    return candidates.slice(0, 3).map(({ url, quality }) => {
        const label = `${quality.prefix}VidBolt${serverLabel} \u2022 ${quality.label}`;
        return {
            name: label,
            title: label,
            url,
            quality: quality.label,
            headers: P_HEADERS,
        };
    });
}

module.exports = { getStreams };