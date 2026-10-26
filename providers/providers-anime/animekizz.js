const PROVIDER = "Animekizz";
const BASE_URL = "https://animekizz.live";
const ANIZIP_API = "https://api.ani.zip/mappings";

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

    const bridge = (typeof globalThis !== "undefined" && (globalThis.NextGenNative || globalThis.EclipsiaNative)) || null;
    const callArgs = bridge ? JSON.parse(bridge.getCallArgs() || "{}") : {};
    if (callArgs.anilistId) anilistId = callArgs.anilistId;
    if (callArgs.title) title = callArgs.title;
    if (!title && callArgs.romajiTitle) title = callArgs.romajiTitle;

    const targetId = anilistId || tmdbId;

    if (!anilistId || !title) {
        try {
            const aniData = await httpJson(`${ANIZIP_API}?anilist_id=${targetId}`);
            if (aniData?.mappings) {
                anilistId = aniData.mappings.anilist_id;
            }
            if (aniData?.titles) {
                title = (aniData.titles.en || aniData.titles['x-jat'] || aniData.titles.ja || "").trim();
            }
        } catch { }
    }

    if (!anilistId || !title) {
        try {
            const anilistQuery = `
                query ($id: Int) {
                    Media (id: $id, type: ANIME) {
                        id
                        title { english romaji }
                    }
                }
            `;
            const alData = await httpJson("https://graphql.anilist.co", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: anilistQuery, variables: { id: parseInt(targetId, 10) } })
            });
            anilistId = alData?.data?.Media?.id || anilistId || targetId;
            if (alData?.data?.Media?.title) {
                title = alData.data.Media.title.english || alData.data.Media.title.romaji || title;
            }
        } catch { }
    }

    return { title, anilistId: anilistId || targetId };
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
