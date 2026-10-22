const PROVIDER = "AnimeSalt";
const BASE_URL = "https://animesalt.cx";
const ALT_URL = "https://animesalt.ac";
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

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const isTv = mediaType === "tv";
        const title = await getTmdbTitle(tmdbId, mediaType);
        if (!title) return [];

        const slug = slugify(title);
        const s = season || 1;
        const ep = episode || 1;

        const candidateUrls = [
            isTv ? `${BASE_URL}/episode/${slug}-${s}x${ep}/` : `${BASE_URL}/movies/${slug}/`,
            isTv ? `${ALT_URL}/episode/${slug}-${s}x${ep}/` : `${ALT_URL}/movies/${slug}/`
        ];

        let html = "";
        let usedBase = BASE_URL;

        for (const u of candidateUrls) {
            html = await httpText(u);
            if (html && html.includes("as-cdn")) {
                usedBase = u.startsWith(ALT_URL) ? ALT_URL : BASE_URL;
                break;
            }
        }

        // If direct slug failed, search by title
        if (!html || !html.includes("as-cdn")) {
            const searchHtml = await httpText(`${BASE_URL}/?s=${encodeURIComponent(title)}`);
            if (searchHtml) {
                const epMatch = searchHtml.match(new RegExp(`href=["'](https?://[^"']*(?:episode|movies)/[^"']*)["']`, "i"));
                if (epMatch) {
                    html = await httpText(epMatch[1]);
                }
            }
        }

        if (!html) return [];

        const iframeMatch = html.match(/src=["'](https?:\/\/as-cdn\d+\.top\/video\/([a-f0-9]+))["']/i);
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
        if (!streamUrl) return [];

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
