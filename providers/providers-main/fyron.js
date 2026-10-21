const BASE_URL = "https://kisskh.ovh";
const ENC_API = "https://enc-dec.app/api/enc-kisskh";

async function request(url, options) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function resolveTmdbTitle(tmdbId, mediaType) {
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const data = await request(
        `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`
    );
    return data?.title ?? data?.name ?? data?.original_title ?? null;
}

async function resolveEpisode(title, mediaType, episode) {
    const results = await request(
        `${BASE_URL}/api/DramaList/Search?q=${encodeURIComponent(title)}&type=0`
    );
    if (!results?.length) return null;

    const matched = results.find(item => item.title.toLowerCase() === title.toLowerCase()) ?? results[0];
    if (!matched) return null;

    const detail = await request(`${BASE_URL}/api/DramaList/Drama/${matched.id}?isq=false`);
    if (!detail?.episodes?.length) return null;

    const { episodes } = detail;
    return mediaType === "movie"
        ? episodes[episodes.length - 1]
        : episodes.find(ep => parseInt(ep.number) === parseInt(episode)) ?? null;
}

async function fetchSubtitles(episodeId) {
    const enc = await request(`${ENC_API}?text=${episodeId}&type=sub`);
    if (!enc?.result) return [];

    const subs = await request(`${BASE_URL}/api/Sub/${episodeId}?kkey=${enc.result}`);
    if (!Array.isArray(subs) || !subs.length) return [];

    return subs
        .filter(s => s.src)
        .map(s => ({
            url: s.src,
            language: s.label ?? s.land ?? "Unknown",
            name: s.label ?? undefined,
        }));
}

function normalizeUrl(url) {
    return url.startsWith("//") ? "https:" + url : url;
}

function buildStreams(sources, subtitles) {
    const referer = { "Referer": BASE_URL + "/" };
    const streams = [];
    const links = [sources.Video, sources.ThirdParty].filter(Boolean).map(normalizeUrl);

    for (const link of links) {
        if (link.includes(".m3u8")) {
            streams.push({
                name: "Kisskh",
                title: "Kisskh \u2022 HLS",
                url: link,
                quality: "Auto",
                headers: referer,
                subtitles,
            });
        } else if (link.includes(".mp4")) {
            streams.push({
                name: "Kisskh",
                title: "Kisskh \u2022 MP4",
                url: link,
                quality: "Auto",
                headers: referer,
                subtitles,
            });
        }
    }

    const seen = new Set();
    return streams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const title = await resolveTmdbTitle(tmdbId, mediaType);
        if (!title) return [];

        const targetEp = await resolveEpisode(title, mediaType, episode);
        if (!targetEp) return [];

        const enc = await request(`${ENC_API}?text=${targetEp.id}&type=vid`);
        if (!enc?.result) return [];

        const [sources, subtitles] = await Promise.all([
            request(`${BASE_URL}/api/DramaList/Episode/${targetEp.id}.png?err=false&ts=&time=&kkey=${enc.result}`),
            fetchSubtitles(targetEp.id),
        ]);
        if (!sources) return [];

        return buildStreams(sources, subtitles);
    } catch {
        return [];
    }
}

module.exports = { getStreams };