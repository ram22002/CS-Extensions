const PROVIDER = "Toonstream";
const BASE_URL = "https://toonstream.us";

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

async function httpText(url, headers = HEADERS, timeoutMs = 4000) {
    try {
        const signal = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
        const res = await fetch(url, { headers, signal });
        if (!res.ok) return "";
        return await res.text();
    } catch {
        return "";
    }
}

async function httpJson(url, options = {}, timeoutMs = 4000) {
    try {
        const signal = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
        const res = await fetch(url, {
            ...options,
            signal,
            headers: { ...HEADERS, ...(options.headers || {}) }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

const ANIZIP_API = "https://api.ani.zip/mappings";

async function getAnimeTitle(id, mediaType) {
    const bridge = (typeof globalThis !== "undefined" && (globalThis.NextGenNative || globalThis.EclipsiaNative)) || null;
    const callArgs = bridge ? JSON.parse(bridge.getCallArgs() || "{}") : {};
    if (callArgs.title) return callArgs.title.trim();
    if (callArgs.romajiTitle) return callArgs.romajiTitle.trim();

    try {
        const aniData = await httpJson(`${ANIZIP_API}?anilist_id=${id}`);
        const aniTitle = aniData?.titles?.en || aniData?.titles?.['x-jat'] || aniData?.titles?.ja;
        if (aniTitle) return aniTitle.trim();
    } catch { }

    try {
        const query = `query ($id: Int) { Media (id: $id, type: ANIME) { title { english romaji } } }`;
        const alData = await httpJson("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables: { id: parseInt(id, 10) } })
        });
        const m = alData?.data?.Media?.title;
        if (m) return (m.english || m.romaji || "").trim();
    } catch { }
    return "";
}

async function extractEmbedStreams(embedUrl, serverLabel) {
    const streams = [];
    if (!embedUrl) return streams;

    const tag = createSortTag(19);

    // 1. Ravok buzz / as-cdn player
    if (embedUrl.includes("ravok.buzz") || embedUrl.includes("as-cdn")) {
        try {
            const hashMatch = embedUrl.match(/\/video\/([a-f0-9]+)/i);
            if (hashMatch) {
                const hash = hashMatch[1];
                const baseCdn = embedUrl.split("/video/")[0];
                const formData = new URLSearchParams();
                formData.append("hash", hash);
                formData.append("r", `${BASE_URL}/`);

                const videoData = await httpJson(`${baseCdn}/player/index.php?data=${hash}&do=getVideo`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Referer": `${BASE_URL}/`,
                        "Origin": baseCdn,
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    body: formData.toString()
                });

                const streamUrl = videoData?.videoSource || videoData?.securedLink;
                if (streamUrl && streamUrl.includes(".m3u8")) {
                    const title = `${tag}${PROVIDER} • Ravok [Multi]`;
                    streams.push({
                        name: title,
                        title: title,
                        url: streamUrl,
                        quality: "1080p",
                        type: "hls",
                        headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }
                    });
                    return streams;
                }
            }
        } catch {}
    }

    // 2. VidMoly
    if (embedUrl.includes("vidmoly.")) {
        try {
            const html = await httpText(embedUrl, {
                "User-Agent": USER_AGENT,
                "Referer": `${BASE_URL}/`
            });
            const m3u8Match = html.match(/(https?:\/\/[^"']+\.m3u8[^"']*)/i);
            if (m3u8Match) {
                const title = `${tag}${PROVIDER} • VidMoly`;
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
        } catch {}
    }

    // 3. Generic media extraction (only accept real m3u8 or mp4)
    try {
        const html = await httpText(embedUrl, {
            "User-Agent": USER_AGENT,
            "Referer": `${BASE_URL}/`
        });
        const m3u8Match = html.match(/(https?:\/\/[^"']+\.m3u8[^"']*)/i);
        if (m3u8Match) {
            const title = `${tag}${PROVIDER} • ${serverLabel}`;
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

        const mp4Match = html.match(/(https?:\/\/[^"']+\.mp4[^"']*)/i);
        if (mp4Match) {
            const title = `${tag}${PROVIDER} • ${serverLabel}`;
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
    } catch {}

    // Never return raw webpage embed URLs to avoid ExoPlayer playback crash
    return streams;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const bridge = (typeof globalThis !== "undefined" && (globalThis.NextGenNative || globalThis.EclipsiaNative)) || null;
        const callArgs = bridge ? JSON.parse(bridge.getCallArgs() || "{}") : {};
        const isTv = mediaType === "tv";
        const title = await getAnimeTitle(tmdbId, mediaType);
        if (!title) return [];

        const s = callArgs.season || season || 1;
        const ep = callArgs.episode || episode || 1;

        const baseTitle = (callArgs.baseTitle || "").trim();
        const baseSlug = slugify(baseTitle || title.replace(/\b(?:season\s*\d+|\d+(?:nd|rd|th|st)\s*season|s\d+)\b.*$/gi, "").trim());
        const cleanTitle = title.split(/[:\-]/)[0].trim();
        const fullSlug = slugify(title);
        const shortSlug = slugify(cleanTitle);

        const candidates = [
            isTv && baseSlug ? `${BASE_URL}/episode/${baseSlug}-${s}x${ep}/` : null,
            isTv ? `${BASE_URL}/episode/${shortSlug}-${s}x${ep}/` : `${BASE_URL}/movies/${shortSlug}/`,
            isTv ? `${BASE_URL}/episode/${fullSlug}-${s}x${ep}/` : `${BASE_URL}/movies/${fullSlug}/`
        ].filter(Boolean);

        let html = "";
        let usedUrl = "";

        for (const u of candidates) {
            html = await httpText(u);
            if (html && (html.includes("<iframe") || html.includes("data-src="))) {
                usedUrl = u;
                break;
            }
        }

        // Search fallback if direct candidate is not found
        if (!html || (!html.includes("<iframe") && !html.includes("data-src="))) {
            const searchTerms = [baseTitle, cleanTitle, title].filter(Boolean);
            for (const st of searchTerms) {
                const searchHtml = await httpText(`${BASE_URL}/s?q=${encodeURIComponent(st)}`);
                if (searchHtml) {
                    if (isTv) {
                        const seriesMatches = [...searchHtml.matchAll(/href=["'](\/series\/[^"'\/]+)\/?["']/gi)].map(m => m[1]);
                        if (seriesMatches.length > 0) {
                            const targetSlug = baseSlug || shortSlug || fullSlug;
                            const matchedSeries = seriesMatches.find(s => s.includes(targetSlug) || s.includes(shortSlug)) || seriesMatches[0];
                            const seriesHtml = await httpText(`${BASE_URL}${matchedSeries}/`);
                            const epRegex = new RegExp(`href=["'](\\/episode\\/[^"']*${s}x${ep}\\/?)["']`, "i");
                            const epMatch = seriesHtml.match(epRegex);
                            if (epMatch) {
                                usedUrl = `${BASE_URL}${epMatch[1]}`;
                                html = await httpText(usedUrl);
                                if (html) break;
                            }
                        }
                    } else {
                        const movieMatch = searchHtml.match(/href=["'](\/movies\/[^"'\/]+)\/?["']/i);
                        if (movieMatch) {
                            usedUrl = `${BASE_URL}${movieMatch[1]}`;
                            html = await httpText(usedUrl);
                            if (html) break;
                        }
                    }
                }
            }
        }

        if (!html) return [];

        // Parse iframes & data-src
        const iframeRegex = /<iframe[^>]+(?:data-src|src)=["']([^"']+)["']/gi;
        const embedUrls = [];
        let match;
        while ((match = iframeRegex.exec(html)) !== null) {
            const u = match[1];
            if (u && !u.includes("google") && !u.includes("facebook") && !u.includes("youtube") && !embedUrls.includes(u)) {
                embedUrls.push(u);
            }
        }

        const streams = [];
        const seenUrls = new Set();

        const extractionTasks = embedUrls.map(async (u, idx) => {
            const serverLabel = u.includes("ravok") ? "Ravok" :
                u.includes("vidmoly") ? "VidMoly" :
                u.includes("ruby") ? "RubyStream" :
                u.includes("cloudy") ? "Cloudy" : `Server ${idx + 1}`;

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
