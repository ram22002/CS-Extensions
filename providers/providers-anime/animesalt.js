const PROVIDER = "AnimeSalt";
const BASE_URL = "https://animesalt.cx";
const ALT_URL = "https://animesalt.ac";

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

async function httpText(url, headers = HEADERS, timeoutMs = 5000) {
    try {
        const signal = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
        const res = await fetch(url, { headers, signal });
        if (!res.ok) return "";
        return await res.text();
    } catch {
        return "";
    }
}

async function httpJson(url, options = {}, timeoutMs = 5000) {
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

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const isTv = mediaType === "tv";
        const title = await getAnimeTitle(tmdbId, mediaType);
        if (!title) return [];

        const s = season || 1;
        const ep = episode || 1;

        const cleanTitle = title.split(/[:\-]/)[0].trim();
        const fullSlug = slugify(title);
        const shortSlug = slugify(cleanTitle);

        const candidateUrls = [
            isTv ? `${BASE_URL}/episode/${shortSlug}-${s}x${ep}/` : `${BASE_URL}/movies/${shortSlug}/`,
            isTv ? `${BASE_URL}/episode/${fullSlug}-${s}x${ep}/` : `${BASE_URL}/movies/${fullSlug}/`,
            isTv ? `${ALT_URL}/episode/${shortSlug}-${s}x${ep}/` : `${ALT_URL}/movies/${shortSlug}/`,
            isTv ? `${ALT_URL}/episode/${fullSlug}-${s}x${ep}/` : `${ALT_URL}/movies/${fullSlug}/`
        ];

        let html = "";
        let usedBase = BASE_URL;

        for (const u of candidateUrls) {
            html = await httpText(u);
            if (html && (html.includes("ravok.buzz") || html.includes("as-cdn"))) {
                usedBase = u.startsWith(ALT_URL) ? ALT_URL : BASE_URL;
                break;
            }
        }

        // If direct candidate failed, search by title
        if (!html || (!html.includes("ravok.buzz") && !html.includes("as-cdn"))) {
            const searchHtml = await httpText(`${BASE_URL}/?s=${encodeURIComponent(cleanTitle || title)}`);
            if (searchHtml) {
                if (isTv) {
                    const seriesMatches = [...searchHtml.matchAll(/href=["'](https?:\/\/animesalt\.(?:cx|ac)\/series\/[^"'\/]+\/)["']/gi)];
                    if (seriesMatches.length > 0) {
                        const seriesHtml = await httpText(seriesMatches[0][1]);
                        const epRegex = new RegExp(`href=["'](https?:\\/\\/animesalt\\.(?:cx|ac)\\/episode\\/[^"']*${s}x${ep}\\/?)["']`, "i");
                        const epMatch = seriesHtml.match(epRegex);
                        if (epMatch) {
                            html = await httpText(epMatch[1]);
                        }
                    }
                } else {
                    const movieMatch = searchHtml.match(/href=["'](https?:\/\/animesalt\.(?:cx|ac)\/movies\/[^"'\/]+\/)["']/i);
                    if (movieMatch) {
                        html = await httpText(movieMatch[1]);
                    }
                }
            }
        }

        if (!html) return [];

        // Match ravok.buzz or as-cdn player
        const iframeMatch = html.match(/(https?:\/\/(?:ravok\.buzz|as-cdn\d+\.top)\/video\/([a-f0-9]+))/i);
        if (!iframeMatch) return [];

        const playerUrl = iframeMatch[1];
        const hash = iframeMatch[2];
        const playerCdn = playerUrl.split("/video/")[0];

        const formData = new URLSearchParams();
        formData.append("hash", hash);
        formData.append("r", `${usedBase}/`);

        const videoData = await httpJson(`${playerCdn}/player/index.php?data=${hash}&do=getVideo`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": `${usedBase}/`,
                "Origin": playerCdn,
                "X-Requested-With": "XMLHttpRequest"
            },
            body: formData.toString()
        });

        const streamUrl = videoData?.videoSource || videoData?.securedLink;
        if (!streamUrl || !streamUrl.includes(".m3u8")) return [];

        const tag = createSortTag(21);
        const name = `${tag}${PROVIDER} • Fast [Multi]`;

        return [{
            name,
            title: name,
            url: streamUrl,
            quality: "1080p",
            type: "hls",
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": `${usedBase}/`
            }
        }];
    } catch {
        return [];
    }
}

module.exports = { getStreams };
