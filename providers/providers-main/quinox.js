const API_BASE = "https://api.vidlove.cc";
const REFERER = "https://player.vidlove.cc/";
const MIN_QUALITY = 1080;
const PROVIDERS = ["moviebox2", "megaknight", "vidapi", "ipcloud", "tcloud"];
const HEADERS = {
    "accept": "application/json",
    "Referer": REFERER,
};

const parseQuality = (quality) => {
    const s = String(quality || "").toLowerCase();
    if (s.includes("4k") || s.includes("2160")) return 2160;
    const match = s.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
};

const normalizeQuality = (quality) => String(quality || "").trim() || "1080p";
const isQualityAcceptable = (quality) => !quality || parseQuality(quality) >= MIN_QUALITY;

const buildEndpointUrl = (mediaType, tmdbId, provider, season, episode) => {
    const params = new URLSearchParams({ id: tmdbId, mode: "json", sources: provider, hevc: "1" });
    if (season != null) params.set("season", season);
    if (episode != null) params.set("episode", episode);
    return `${API_BASE}/${mediaType}?${params}`;
};

async function fetchProviderStreams(provider, tmdbId, mediaType, season, episode) {
    try {
        const res = await fetch(buildEndpointUrl(mediaType, tmdbId, provider, season, episode), {
            headers: HEADERS,
        });
        if (!res.ok) return [];

        const { source } = await res.json();
        if (!source) return [];

        const label = source.label ?? provider;
        const toStream = (url, quality) => ({
            name: `Vidlove • ${label}`,
            title: `Vidlove • ${label}`,
            url,
            quality: normalizeQuality(quality),
            headers: { Referer: REFERER },
        });

        if (Array.isArray(source.qualities) && source.qualities.length > 0) {
            return source.qualities
                .filter(q => q?.url && isQualityAcceptable(q.quality))
                .map(q => toStream(q.url, q.quality));
        }

        if (source.url && isQualityAcceptable(source.quality)) {
            return [toStream(source.url, source.quality)];
        }

        return [];
    } catch {
        return [];
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const results = await Promise.all(
            PROVIDERS.map(p => fetchProviderStreams(p, tmdbId, mediaType, season, episode))
        );

        const seen = new Set();
        return results.flat().filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
    } catch {
        return [];
    }
}

module.exports = { getStreams };