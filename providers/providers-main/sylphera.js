const BASE_URL = "https://dexter.pw";
const HEADERS = {
    "Referer": BASE_URL + "/",
    "Origin": BASE_URL,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
};

function getSortTag(rank) {
    let bin = Math.max(0, 5 - rank).toString(2);
    while (bin.length < 20) bin = "0" + bin;
    return bin.split("").map(b => (b === "1" ? "\uFEFF" : "\u200B")).join("");
}

function toQuality(width, height) {
    if (width >= 3840 || height >= 2160) return { label: "2160p", rank: 5 };
    if (width >= 1920 || height >= 1080) return { label: "1080p", rank: 4 };
    return null;
}

function resolveUrl(path, baseUrl) {
    try {
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        const base = new URL(baseUrl.startsWith("http") ? baseUrl : BASE_URL);
        return new URL(path, base.origin).href;
    } catch {
        return null;
    }
}

function parseMasterPlaylist(text, baseUrl) {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const streams = [];

    for (let i = 0; i < lines.length - 1; i++) {
        const info = lines[i];
        if (!info.startsWith("#EXT-X-STREAM-INF")) continue;

        const next = lines[i + 1];
        if (next.startsWith("#")) continue;

        const res = info.match(/RESOLUTION=(\d+)x(\d+)/);
        if (!res) continue;

        const quality = toQuality(parseInt(res[1], 10), parseInt(res[2], 10));
        if (!quality) continue;

        const absolute = resolveUrl(next, baseUrl);
        if (!absolute) continue;

        streams.push({ url: absolute, quality: quality.label, rank: quality.rank });
    }

    return streams;
}

async function fetchFromServer(serverId, tmdbId, mediaType, season, episode) {
    try {
        let url = `${BASE_URL}/api/s/${serverId}/${mediaType}/${tmdbId}`;
        if (mediaType === "tv") url += `/${season}/${episode}`;
        url += "?v=3";

        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) return [];

        const text = await res.text();
        if (!text || !text.includes("#EXTM3U")) return [];

        const effectiveBase = (res.url && res.url.startsWith("http")) ? res.url : url;

        return parseMasterPlaylist(text, effectiveBase);
    } catch {
        return [];
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType !== "movie" && mediaType !== "tv") return [];
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const pending = [21, 1, 2, 3, 4, 5].map(id => fetchFromServer(id, tmdbId, mediaType, season, episode));

        let found = [];
        for (const request of pending) {
            found = await request;
            if (found.length > 0) break;
        }

        const seen = new Set();
        return found
            .filter(s => !seen.has(s.url) && seen.add(s.url))
            .sort((a, b) => b.rank - a.rank)
            .map(s => {
                const tag = getSortTag(s.rank);
                const label = `Dexter \u2022 ${s.quality} \u2022 HLS`;
                return {
                    url: s.url,
                    name: tag + label,
                    title: tag + label,
                    quality: s.quality,
                    headers: HEADERS,
                };
            });
    } catch {
        return [];
    }
}

module.exports = { getStreams };