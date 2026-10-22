const PROVIDER = "Animekizz";
const BASE_URL = "https://animekizz.live";
const TMDB_API = "https://api.themoviedb.org/3";
const ANIZIP_API = "https://api.ani.zip/mappings";
const API_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) ? TMDB_API_KEY : (typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY) ? globalThis.TMDB_API_KEY : "307b7b8ef035c6aa336900aef4e203bd";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": `${BASE_URL}/`,
    "Origin": BASE_URL,
    "Accept": "application/json, text/plain, */*",
};

function createSortTag(rank) {
    return Math.max(0, 23 - rank)
        .toString(2)
        .padStart(20, "0")
        .split("")
        .map(b => b === "1" ? "\uFEFF" : "\u200B")
        .join("");
}

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
    let title = "";
    let anilistId = null;

    // 1. Check AniZip first for direct anilist_id and anime title
    try {
        const aniData = await httpJson(`${ANIZIP_API}?themoviedb_id=${tmdbId}`);
        if (aniData?.mappings) {
            anilistId = aniData.mappings.anilist_id;
        }
        if (aniData?.titles) {
            title = (aniData.titles.en || aniData.titles['x-jat'] || aniData.titles.ja || "").trim();
        }
    } catch { }

    // 2. Query TMDb for anime title if still missing
    if (!title) {
        try {
            const endpoint = mediaType === "tv" ? "tv" : "movie";
            const tmdbData = await httpJson(`${TMDB_API}/${endpoint}/${tmdbId}?api_key=${API_KEY}`);
            if (tmdbData) {
                title = (tmdbData.name || tmdbData.title || tmdbData.original_name || tmdbData.original_title || "").trim();
            }
        } catch { }
    }

    // 3. Fallback: query AniList directly by title if anilistId missing
    if (!anilistId && title) {
        try {
            const anilistQuery = `
                query ($search: String) {
                    Media (search: $search, type: ANIME) {
                        id
                        title { english romaji }
                    }
                }
            `;
            const alData = await httpJson("https://graphql.anilist.co", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: anilistQuery, variables: { search: title } })
            });
            anilistId = alData?.data?.Media?.id || null;
            if (alData?.data?.Media?.title) {
                title = alData.data.Media.title.english || alData.data.Media.title.romaji || title;
            }
        } catch { }
    }

    return { title, anilistId };
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const isTv = mediaType === "tv";
        const ep = isTv ? (episode || 1) : 1;

        const { title, anilistId } = await resolveMetadata(tmdbId, mediaType, season);
        if (!anilistId || !title) return [];

        const cleanTitle = title.replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
        const queryId = `${cleanTitle}-${anilistId}:${ep}`;

        const serversData = await httpJson(`${BASE_URL}/api/v1/video/servers/${encodeURIComponent(queryId)}`);
        const serverList = serversData?.servers || [];
        if (!serverList.length) return [];

        const streamResults = [];
        const seenUrls = new Set();

        const resolvePromises = serverList.slice(0, 6).map(async (srv, idx) => {
            const srvId = srv.id;
            const srvName = (srv.name || "HD").toUpperCase();
            const srvType = (srv.server_type || "sub").toUpperCase();

            const resolveData = await httpJson(`${BASE_URL}/api/v1/video/resolve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    episode_id: queryId,
                    server_id: srvId
                })
            });

            const sources = resolveData?.sources || [];
            for (const src of sources) {
                let streamUrl = src.url;
                if (!streamUrl) continue;

                if (streamUrl.startsWith("/")) {
                    streamUrl = `${BASE_URL}${streamUrl}`;
                }

                if (seenUrls.has(streamUrl)) continue;
                seenUrls.add(streamUrl);

                const isHls = src.format === "hls" || streamUrl.includes(".m3u8");
                const quality = src.quality === "auto" ? "1080p" : (src.quality ? `${src.quality}p` : "1080p");
                const rank = srvType === "DUB" ? 18 : 20;
                const tag = createSortTag(rank);
                const streamName = `${tag}${PROVIDER} • ${srvName} [${srvType}]`;

                const subs = (src.subtitles || src.tracks || []).map(t => ({
                    url: t.url || t.file,
                    language: t.label || t.language || "English",
                    name: t.label || "English",
                    headers: HEADERS
                })).filter(s => s.url);

                streamResults.push({
                    name: streamName,
                    title: streamName,
                    url: streamUrl,
                    quality,
                    type: isHls ? "hls" : "mp4",
                    headers: src.headers || HEADERS,
                    subtitles: subs
                });
            }
        });

        await Promise.allSettled(resolvePromises);
        return streamResults;
    } catch {
        return [];
    }
}

module.exports = { getStreams };
