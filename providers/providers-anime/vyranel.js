const BASE_URL = "https://animecube.live";
const TMDB_API = "https://api.themoviedb.org/3";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36";

async function fetchText(url, referer) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Referer": referer || BASE_URL + "/" },
        });
        return res.ok ? await res.text() : "";
    } catch {
        return "";
    }
}

async function fetchJson(url, referer) {
    const text = await fetchText(url, referer);
    try { return JSON.parse(text); } catch { return null; }
}

async function resolveTmdbTitle(tmdbId, mediaType) {
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const data = await fetchJson(
        `${TMDB_API}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`,
        TMDB_API
    );
    if (!data) return null;
    return (mediaType === "tv" ? data.name : data.title) || null;
}

function extractRscPayload(html) {
    const chunks = [];
    const chunkRe = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
    let m;
    while ((m = chunkRe.exec(html)) !== null) chunks.push(m[1]);
    return chunks.join("")
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\\//g, "/")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
}

async function resolveAnimeSlug(title) {
    const xml = await fetchText(BASE_URL + "/sitemap.xml");
    const seen = {};
    const slugs = [];
    const slugRe = /\/anime\/([a-z0-9\-]+)/g;
    let m;
    while ((m = slugRe.exec(xml)) !== null) {
        if (!seen[m[1]]) { seen[m[1]] = 1; slugs.push(m[1]); }
    }
    const tokens = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ");
    return slugs.find(slug => tokens.every(token => slug.replace(/-/g, " ").includes(token))) || null;
}

async function resolveEpisodeSlug(animeSlug, season, episode) {
    const html = await fetchText(BASE_URL + "/anime/" + encodeURIComponent(animeSlug));
    const rsc = extractRscPayload(html);
    const seen = {};
    const eps = [];
    const epRe = new RegExp(
        '"(' + animeSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '-tab-(\\d+)-ep-(\\d+))"', "g"
    );
    let m;
    while ((m = epRe.exec(rsc)) !== null) {
        if (seen[m[1]]) continue;
        seen[m[1]] = 1;
        eps.push({ epSlug: m[1], tab: parseInt(m[2], 10), ep: parseInt(m[3], 10) });
    }
    eps.sort((a, b) => a.tab - b.tab || a.ep - b.ep);

    const direct = eps.find(e => e.tab === season && e.ep === episode);
    if (direct) return direct.epSlug;
    return episode <= eps.length ? eps[episode - 1].epSlug : null;
}

async function resolveSourceVersion(animeSlug, epSlug) {
    const tabMatch = epSlug.match(/-tab-(\d+)-ep-(\d+)/);
    if (!tabMatch) return null;
    const seasonId = "tab-" + tabMatch[1];
    const registry = await fetchJson(
        BASE_URL + "/api/anime-sources-versions",
        BASE_URL + "/anime/" + animeSlug
    );
    const bySeason = (registry && registry.bySeason && registry.bySeason[animeSlug]) || {};
    for (const primaryId in bySeason) {
        if (bySeason[primaryId] && bySeason[primaryId][seasonId]) {
            return { primaryId, token: bySeason[primaryId][seasonId], seasonId };
        }
    }
    return null;
}

async function resolveDailymotionStreams(videoId, animeSlug) {
    const referer = "https://geo.dailymotion.com/";
    const data = await fetchJson(
        `https://geo.dailymotion.com/video/${encodeURIComponent(videoId)}.json?legacy=true&embedder=${encodeURIComponent(BASE_URL + "/anime/" + animeSlug)}`,
        referer
    );
    const masterUrl = data && !data.error
        && data.qualities && data.qualities.auto
        && data.qualities.auto[0] && data.qualities.auto[0].url;
    if (!masterUrl) return [];
    return [{
        name: "AnimeCube \u2022 Dailymotion",
        title: "AnimeCube \u2022 Dailymotion",
        url: masterUrl,
        quality: "Auto",
        headers: { "User-Agent": USER_AGENT, "Referer": referer },
    }];
}

async function resolveRumbleStreams(videoId) {
    const referer = "https://rumble.com/";
    const data = await fetchJson(
        `https://rumble.com/embedJS/u3/?request=video&ver=2&v=${encodeURIComponent(videoId)}`,
        BASE_URL + "/"
    );
    if (!data) return [];

    const streams = [];
    const headers = { "User-Agent": USER_AGENT, "Referer": referer };
    const ua = data.ua || {};

    const hlsUrl = ua.hls && ua.hls.auto && ua.hls.auto.url;
    if (hlsUrl) {
        streams.push({
            name: "AnimeCube \u2022 Rumblee",
            title: "AnimeCube \u2022 Rumble",
            url: hlsUrl,
            quality: "Auto",
            headers,
        });
    }

    const mp4 = ua.mp4 || {};
    for (const q in mp4) {
        const src = mp4[q] && mp4[q].url;
        if (!src) continue;
        streams.push({
            name: `AnimeCube \u2022 Rumble`,
            title: `AnimeCube \u2022 Rumble`,
            url: src,
            quality: "Auto",
            headers,
        });
    }

    return streams;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const title = await resolveTmdbTitle(tmdbId, mediaType);
        if (!title) return [];

        const animeSlug = await resolveAnimeSlug(title);
        if (!animeSlug) return [];

        const effectiveSeason = mediaType === "movie" ? 1 : season;
        const effectiveEpisode = mediaType === "movie" ? 1 : episode;

        const epSlug = await resolveEpisodeSlug(animeSlug, effectiveSeason, effectiveEpisode);
        if (!epSlug) return [];

        const version = await resolveSourceVersion(animeSlug, epSlug);
        if (!version) return [];

        const sourcesUrl = `${BASE_URL}/api/anime/${animeSlug}/episode/${epSlug}/sources`
            + `?v=${encodeURIComponent(version.token)}`
            + `&primaryTabId=${encodeURIComponent(version.primaryId)}`
            + `&seasonId=${encodeURIComponent(version.seasonId)}`;

        const payload = await fetchJson(sourcesUrl, BASE_URL + "/anime/" + animeSlug);
        const sources = (payload && payload.sources) || [];

        const resolved = await Promise.all(
            sources
                .filter(s => s && s.platform)
                .map(s => {
                    if (s.platform === "dailymotion" && (s.privateId || s.videoId))
                        return resolveDailymotionStreams(s.privateId || s.videoId, animeSlug);
                    if (s.platform === "rumble" && s.videoId)
                        return resolveRumbleStreams(s.videoId);
                    return Promise.resolve([]);
                })
        );

        const seen = new Set();
        return resolved.flat().filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
    } catch {
        return [];
    }
}

module.exports = { getStreams };