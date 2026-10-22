const PROVIDER = "AnimeTosho";
const BASE_URL = "https://animetosho.org";
const TMDB_API = "https://api.themoviedb.org/3";
const ANIZIP_API = "https://api.ani.zip/mappings";
const API_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) ? TMDB_API_KEY : (typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY) ? globalThis.TMDB_API_KEY : "307b7b8ef035c6aa336900aef4e203bd";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
};

async function httpJson(url, options = {}) {
    try {
        const res = await fetch(url, {
            ...options,
            headers: { ...HEADERS, ...(options.headers || {}) }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function resolveMetadata(tmdbId, mediaType, season) {
    let titles = [];

    // 1. AniZip first
    try {
        const aniData = await httpJson(`${ANIZIP_API}?themoviedb_id=${tmdbId}`);
        if (aniData?.titles) {
            if (aniData.titles.en) titles.push(aniData.titles.en);
            if (aniData.titles['x-jat']) titles.push(aniData.titles['x-jat']);
            if (aniData.titles.ja) titles.push(aniData.titles.ja);
        }
    } catch { }

    // 2. TMDb fallback
    if (!titles.length) {
        try {
            const endpoint = mediaType === "tv" ? "tv" : "movie";
            const tmdbData = await httpJson(`${TMDB_API}/${endpoint}/${tmdbId}?api_key=${API_KEY}`);
            if (tmdbData) {
                const mainTitle = tmdbData.name || tmdbData.title || tmdbData.original_name || tmdbData.original_title;
                if (mainTitle) titles.push(mainTitle);
            }
        } catch { }
    }

    return titles.filter(Boolean);
}

function cleanTitleForSearch(title) {
    return title.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const isTv = mediaType === "tv";
        const ep = isTv ? (episode || 1) : 1;
        const targetSeason = isTv ? (season || 1) : 1;
        const epPad = String(ep).padStart(2, "0");
        const seasonPad = String(targetSeason).padStart(2, "0");

        const titles = await resolveMetadata(tmdbId, mediaType, targetSeason);
        if (!titles.length) return [];

        const mainTitle = cleanTitleForSearch(titles[0]);

        // Build search query variations
        const queries = [];
        if (isTv) {
            if (targetSeason > 1) {
                queries.push(`${mainTitle} S${seasonPad}E${epPad}`);
                queries.push(`${mainTitle} Season ${targetSeason} ${epPad}`);
            }
            queries.push(`${mainTitle} E${epPad}`);
            queries.push(`${mainTitle} ${epPad}`);
        } else {
            queries.push(mainTitle);
            queries.push(`${mainTitle} Movie`);
        }

        let items = [];
        for (const q of queries) {
            const feedUrl = `${BASE_URL}/feed/json?q=${encodeURIComponent(q)}`;
            const res = await httpJson(feedUrl);
            if (Array.isArray(res) && res.length) {
                items = res;
                break;
            }
        }

        if (!items || !items.length) return [];

        const streams = [];
        const seenMagnets = new Set();

        for (const item of items) {
            if (!item.magnet_uri) continue;
            if (seenMagnets.has(item.magnet_uri)) continue;
            seenMagnets.add(item.magnet_uri);

            const title = item.title || "";
            const totalSize = item.total_size || 0;
            const sizeMb = Math.round(totalSize / (1024 * 1024));
            const seeders = item.seeders ?? 0;

            let quality = "auto";
            if (title.includes("2160p") || title.includes("4K") || title.includes("4k")) {
                quality = "4K";
            } else if (title.includes("1080p")) {
                quality = "1080p";
            } else if (title.includes("720p")) {
                quality = "720p";
            } else if (title.includes("480p")) {
                quality = "480p";
            }

            // Stream display label
            const displayTitle = `${title.length > 55 ? title.substring(0, 52) + "..." : title} [${sizeMb}MB • ${seeders} seeds]`;

            streams.push({
                name: PROVIDER,
                title: displayTitle,
                url: item.magnet_uri,
                quality: quality,
                isTorrent: true,
                headers: {}
            });

            if (streams.length >= 15) break;
        }

        return streams;
    } catch {
        return [];
    }
}

module.exports = { getStreams };
