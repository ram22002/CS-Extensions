const BASE_URL = "https://fibwatch.art";
const TMDB_API = "https://api.themoviedb.org/3";
const REFERER = "https://urlshortlink.top";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 16; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";
const Q_RANK = { "2160p": 3, "1080p": 2, "720p": 1 };
const HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": `${BASE_URL}/`,
};
const P_HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": `${REFERER}/`,
    "Origin": REFERER,
};

function parseQuality(raw) {
    const s = String(raw || "").toLowerCase();
    if (s.includes("2160") || s.includes("4k")) return "2160p";
    if (s.includes("1080")) return "1080p";
    if (s.includes("720")) return "720p";
    return null;
}

function toStreamResult(streamUrl, quality) {
    return {
        name: `FibWatch \u2022 ${quality}`,
        title: `FibWatch \u2022 ${quality}`,
        url: streamUrl,
        quality,
        headers: P_HEADERS,
        behaviorHints: { notWebReady: false },
    };
}

async function getText(url) {
    try {
        const res = await fetch(url, { headers: HEADERS });
        return res.ok ? await res.text() : null;
    } catch {
        return null;
    }
}

async function getJson(url) {
    try {
        const res = await fetch(url, { headers: HEADERS });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

function scrapeVideoId(markup) {
    if (!markup) return null;
    const $ = require("cheerio").load(markup);
    return $("input#video-id").attr("value") || null;
}

async function unwrapShortlink(shortlinkUrl) {
    const markup = await getText(shortlinkUrl);
    if (!markup) return null;
    const $ = require("cheerio").load(markup);
    let href = $("a.hidden-button.buttonDownloadnew").attr("href");
    if (!href) {
        $("a").each((_, el) => {
            const candidate = $(el).attr("href") || "";
            if (candidate.includes("url=http")) { href = candidate; return false; }
        });
    }
    if (!href) {
        const cdnMatch = markup.match(/https?:\/\/[^\s"'`<>]+?\.b-cdn\.net\/[^\s"'`<>]+\.(?:mkv|mp4|m3u8)/i);
        return cdnMatch ? cdnMatch[0] : null;
    }
    return decodeURIComponent(href.replace(/.*url=/, "").trim()) || null;
}

async function expandResolutionSet(entries) {
    const settled = await Promise.allSettled(
        entries.map(async entry => {
            let href = (entry.url || "").trim();
            if (!href) return null;
            if (!href.startsWith("http")) href = `${BASE_URL}${href}`;
            const hinted = parseQuality(entry.res || href);
            if (/\.(mp4|mkv|m3u8)/i.test(href)) return hinted ? { url: href, quality: hinted } : null;
            const direct = await unwrapShortlink(href);
            if (!direct?.startsWith("http")) return null;
            const detected = parseQuality(direct) ?? hinted;
            return detected ? { url: direct, quality: detected } : null;
        })
    );
    return settled.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
}

function pickBestSearchResult(hits, query) {
    const lc = query.toLowerCase();
    return hits.find(h => h.title.toLowerCase().includes(lc)) ?? hits[0];
}

async function extractMovieStreams(videoId) {
    const payload = await getJson(`${BASE_URL}/ajax/resolution_switcher.php?video_id=${videoId}`);
    if (!payload) return [];
    const entries = [...(payload.current || []), ...(payload.popup || [])];
    const resolved = await expandResolutionSet(entries);
    return resolved.map(s => toStreamResult(s.url, s.quality));
}

async function extractEpisodeStreams(videoId, season, episode) {
    const payload = await getJson(`${BASE_URL}/ajax/episodes.php?video_id=${videoId}`);
    const episodes = payload?.episodes || [];
    if (!episodes.length) return [];

    const abs = u => (u?.startsWith("http") ? u : `${BASE_URL}${u}`);
    let epUrl = "";
    for (const ep of episodes) {
        const m = (ep.title || "").toLowerCase().match(/s(\d{1,2})e(\d{1,3})/);
        if (m && parseInt(m[1]) === season && parseInt(m[2]) === episode) {
            epUrl = abs(ep.url); break;
        }
    }
    if (!epUrl) epUrl = abs(episodes[0]?.url);
    if (!epUrl) return [];

    const epMarkup = await getText(epUrl);
    const epVideoId = scrapeVideoId(epMarkup);
    if (!epVideoId) return [];

    const resPayload = await getJson(`${BASE_URL}/ajax/resolution_switcher.php?video_id=${epVideoId}`);
    if (!resPayload) return [];
    const entries = [...(resPayload.current || []), ...(resPayload.popup || [])];
    const resolved = await expandResolutionSet(entries);
    return resolved.map(s => toStreamResult(s.url, s.quality));
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const metaType = mediaType === "tv" ? "tv" : "movie";
        const meta = await (await fetch(`${TMDB_API}/${metaType}/${tmdbId}?api_key=${TMDB_API_KEY}`)).json();
        const title = meta?.title || meta?.name;
        if (!title) return [];

        const searchMarkup = await getText(`${BASE_URL}/search?keyword=${encodeURIComponent(title)}&page_id=1`);
        if (!searchMarkup) return [];

        const $ = require("cheerio").load(searchMarkup);
        const hits = [];
        $("div.video-thumb").each((_, el) => {
            const href = $("a", el).attr("href");
            const label = $("p.hptag", el).text().trim() || $("div.video-thumb img", el).attr("alt") || "";
            if (href) hits.push({ title: label, url: href });
        });
        if (!hits.length) return [];

        const best = pickBestSearchResult(hits, title);
        const contentUrl = best.url.startsWith("http") ? best.url : `${BASE_URL}${best.url}`;

        const contentMarkup = await getText(contentUrl);
        const videoId = scrapeVideoId(contentMarkup);
        if (!videoId) return [];
        const raw = mediaType === "tv" ? await extractEpisodeStreams(videoId, season, episode) : await extractMovieStreams(videoId);

        const seen = new Set();
        const deduped = raw.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
        return deduped.sort((a, b) => (Q_RANK[b.quality] ?? 0) - (Q_RANK[a.quality] ?? 0));
    } catch {
        return [];
    }
}

module.exports = { getStreams };