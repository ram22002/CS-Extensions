const PROVIDER = "Toonstream";
const BASE_URL = "https://toonstream.us";
const TMDB_API = "https://api.themoviedb.org/3";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": `${BASE_URL}/`,
};

function createSortTag(rank) {
    return Math.max(0, 23 - rank)
        .toString(2)
        .padStart(20, "0")
        .split("")
        .map(b => b === "1" ? "\uFEFF" : "\u200B")
        .join("");
}

function slugify(text) {
    return (text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
}

async function httpText(url, headers = HEADERS) {
    try {
        const res = await fetch(url, { headers });
        if (!res.ok) return "";
        return await res.text();
    } catch {
        return "";
    }
}

async function httpJson(url) {
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function getTmdbTitle(tmdbId, mediaType) {
    try {
        const endpoint = mediaType === "tv" ? "tv" : "movie";
        const data = await httpJson(`${TMDB_API}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`);
        if (!data) return "";
        return (data.name || data.title || data.original_name || data.original_title || "").trim();
    } catch {
        return "";
    }
}

async function extractEmbedStreams(embedUrl, serverLabel) {
    const streams = [];
    if (!embedUrl) return streams;

    const tag = createSortTag(19);
    const title = `${tag}${PROVIDER} • ${serverLabel}`;

    // 1. Direct or cloudy embed
    if (embedUrl.includes("cloudy.") || embedUrl.includes("upns.one") || embedUrl.includes("rubystm.") || embedUrl.includes("vidmoly.")) {
        try {
            const html = await httpText(embedUrl, {
                "User-Agent": USER_AGENT,
                "Referer": `${BASE_URL}/`
            });

            // Check for direct m3u8 source in html
            const m3u8Match = html.match(/(https?:\/\/[^"']+\.m3u8[^"']*)/i);
            if (m3u8Match) {
                streams.push({
                    name: title,
                    title: title,
                    url: m3u8Match[1],
                    quality: "1080p",
                    type: "hls",
                    headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }
                });
                return streams;
            }

            // Check for direct mp4 source
            const mp4Match = html.match(/(https?:\/\/[^"']+\.mp4[^"']*)/i);
            if (mp4Match) {
                streams.push({
                    name: title,
                    title: title,
                    url: mp4Match[1],
                    quality: "1080p",
                    type: "mp4",
                    headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }
                });
                return streams;
            }
        } catch { }
    }

    // Fallback: embed link
    streams.push({
        name: title,
        title: title,
        url: embedUrl,
        quality: "1080p",
        headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }
    });

    return streams;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const isTv = mediaType === "tv";
        const title = await getTmdbTitle(tmdbId, mediaType);
        if (!title) return [];

        const slug = slugify(title);
        const epSlug = isTv ? `${slug}-${season || 1}x${episode || 1}` : slug;
        const pageUrl = isTv ? `${BASE_URL}/episode/${epSlug}/` : `${BASE_URL}/movies/${slug}/`;

        const html = await httpText(pageUrl);
        if (!html) return [];

        // Parse iframes & data-src
        const iframeRegex = /<iframe[^>]+(?:data-src|src)=["']([^"']+)["']/gi;
        const embedUrls = [];
        let match;
        while ((match = iframeRegex.exec(html)) !== null) {
            const u = match[1];
            if (u && !u.includes("google") && !u.includes("facebook") && !embedUrls.includes(u)) {
                embedUrls.push(u);
            }
        }

        const streams = [];
        const seenUrls = new Set();

        const extractionTasks = embedUrls.slice(0, 5).map(async (u, idx) => {
            const serverLabel = u.includes("cloudy") ? "Cloudy" :
                u.includes("vidmoly") ? "VidMoly" :
                u.includes("ruby") ? "RubyStream" :
                u.includes("abyss") ? "Abyss" : `Server ${idx + 1}`;

            const res = await extractEmbedStreams(u, serverLabel);
            for (const s of res) {
                if (!seenUrls.has(s.url)) {
                    seenUrls.add(s.url);
                    streams.push(s);
                }
            }
        });

        await Promise.allSettled(extractionTasks);
        return streams;
    } catch {
        return [];
    }
}

module.exports = { getStreams };
