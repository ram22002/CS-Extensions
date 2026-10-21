const BASE_URL = "https://vixsrc.to";
const TMDB_API = "https://api.themoviedb.org/3";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";

function commonHeaders() {
    return {
        "User-Agent": USER_AGENT,
        "Referer": `${BASE_URL}/`,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    };
}

function playlistHeaders(embedUrl) {
    return {
        "User-Agent": USER_AGENT,
        "Referer": embedUrl,
        "Origin": BASE_URL,
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
    };
}

function extractEmbedUrl(payload) {
    const raw = payload && typeof payload === "object" ? payload.src : null;
    if (!raw) return null;
    try { return new URL(raw, BASE_URL).toString(); } catch { return null; }
}

function extractPlaylistData(html) {
    if (!html) return null;
    const token = (html.match(/'token'\s*:\s*'([^']+)'/i) || [])[1];
    const expires = (html.match(/'expires'\s*:\s*'([^']+)'/i) || [])[1];
    const url = (html.match(/url\s*:\s*'([^']+\/playlist\/\d+[^']*)'/i) || [])[1];
    if (!token || !expires || !url) return null;
    return { token, expires, url };
}

function detectQuality(playlistText) {
    if (!playlistText) return null;
    if (/RESOLUTION=\d+x2160/i.test(playlistText)) return "2160p";
    if (/RESOLUTION=\d+x1440/i.test(playlistText)) return "1440p";
    if (/RESOLUTION=\d+x1080/i.test(playlistText)) return "1080p";
    if (/RESOLUTION=\d+x720/i.test(playlistText)) return "720p";
    if (/RESOLUTION=\d+x480/i.test(playlistText)) return "480p";
    return null;
}

async function fetchDuration(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv") {
            const [showRes, epRes] = await Promise.all([
                fetch(`${TMDB_API}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`),
                fetch(`${TMDB_API}/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${TMDB_API_KEY}&language=en-US`),
            ]);
            const [show, ep] = await Promise.all([
                showRes.ok ? showRes.json() : null,
                epRes.ok ? epRes.json() : null,
            ]);
            if (ep && ep.runtime) return String(ep.runtime);
            if (show && show.episode_run_time && show.episode_run_time.length) return String(show.episode_run_time[0]);
            return "Variable";
        }
        const res = await fetch(`${TMDB_API}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`);
        const data = res.ok ? await res.json() : null;
        return data && data.runtime ? String(data.runtime) : "Variable";
    } catch {
        return "Variable";
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const duration = await fetchDuration(tmdbId, mediaType, season, episode);

        const apiUrl = mediaType === "tv"
            ? `${BASE_URL}/api/tv/${tmdbId}/${season}/${episode}`
            : `${BASE_URL}/api/movie/${tmdbId}`;

        const apiRes = await fetch(apiUrl, { headers: commonHeaders() });
        if (!apiRes.ok) return [];

        const embedUrl = extractEmbedUrl(await apiRes.json());
        if (!embedUrl) return [];

        const embedRes = await fetch(embedUrl, { headers: commonHeaders() });
        if (!embedRes.ok) return [];

        const master = extractPlaylistData(await embedRes.text());
        if (!master) return [];

        const [basePath, existingQuery] = master.url.split("?");
        const m3u8Path = basePath.endsWith(".m3u8") ? basePath : `${basePath}.m3u8`;
        const streamUrl = `${m3u8Path}${existingQuery ? "?" + existingQuery + "&" : "?"}token=${encodeURIComponent(master.token)}&expires=${encodeURIComponent(master.expires)}&h=1&lang=it`;
        const hdrs = playlistHeaders(embedUrl);

        let quality = "1080p";
        try {
            const plRes = await fetch(streamUrl, { headers: hdrs });
            if (plRes.ok) {
                const detected = detectQuality(await plRes.text());
                if (detected) quality = detected;
            }
        } catch { }

        const isHq = quality === "2160p" || streamUrl.includes("hevc");
        const codec = isHq ? "HEVC" : "H.264";
        const audio = isHq ? "DD5.1" : "Stereo";

        return [{
            name: "VixSrc \u2022 English \u2022 Italian",
            title: "VixSrc \u2022 English \u2022 Italian",
            url: streamUrl,
            quality: `${quality} \u2022 ${duration} min\n${codec} \u2022 ${audio}`,
            headers: hdrs,
        }];
    } catch {
        return [];
    }
}

module.exports = { getStreams };