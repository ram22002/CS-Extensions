const cheerio = require("cheerio");
const BASE_URL = "https://flixhub.net";
const TMDB_API = "https://api.themoviedb.org/3";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": BASE_URL + "/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};
const QUALITY_RANK = { '2160p': 5, '1440p': 4, '1080p': 3, '720p': 2, '480p': 0, '360p': -1, 'auto': -2 };
const MAX_RANK = 5;

async function fetchHtml(url) {
    try {
        const res = await fetch(url, { headers: HEADERS });
        return res.ok ? await res.text() : null;
    } catch {
        return null;
    }
}

async function getTmdbMeta(tmdbId, mediaType) {
    if (!TMDB_API_KEY) return null;
    try {
        const res = await fetch(
            `${TMDB_API}/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`,
            { headers: { Accept: "application/json" } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (!data) return null;
        return { title: (mediaType === "tv" ? data.name : data.title) || "" };
    } catch {
        return null;
    }
}

function toSlug(title) {
    return title.toLowerCase()
        .replace(/'/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function resolveQuality(url) {
    const s = String(url || "").toLowerCase();
    if (s.includes("4k") || s.includes("2160")) return "2160p";
    if (s.includes("1440")) return "1440p";
    if (s.includes("1080")) return "1080p";
    if (s.includes("720")) return "720p";
    if (s.includes("480")) return "480p";
    if (s.includes("360")) return "360p";
    return "auto";
}

function getSortTag(rank) {
    const inv = Math.max(0, MAX_RANK - rank);
    let bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    return bin.split("").map(b => b === "1" ? "\uFEFF" : "\u200B").join("");
}

async function resolveWatchPage(slug, mediaType) {
    const segment = mediaType === "tv" ? "series" : "movie";
    for (const candidate of [slug, slug + "-1"]) {
        const url = `${BASE_URL}/watch/${segment}/${candidate}`;
        const html = await fetchHtml(url);
        if (html?.includes("theaterPlayer")) return { html, url };
    }
    return null;
}

function extractStreamUrls(html) {
    const $ = cheerio.load(html);
    const visited = new Set();
    const results = [];

    const collect = rawUrl => {
        const url = (rawUrl || "").trim();
        if (url && url.startsWith("http") && !visited.has(url)) {
            visited.add(url);
            results.push(url);
        }
    };

    collect($("#theaterPlayer").attr("data-stream-url"));
    collect($("[data-download-url]").first().attr("data-download-url"));
    $("video source[src], source[src]").each((_, el) => collect($(el).attr("src")));
    $("a[href*='/stream/']").each((_, el) => {
        const href = $(el).attr("href") || "";
        collect(href.startsWith("http") ? href : BASE_URL + href);
    });

    const pattern = /https?:\/\/[^\s"'<>\\]+\.(?:mp4|mkv|m3u8|webm|m4v)(?:\?[^\s"'<>\\]*)?/gi;
    let m;
    while ((m = pattern.exec(html)) !== null) collect(m[0]);

    return results;
}

function parseEpisodeList(html) {
    const $ = cheerio.load(html);
    const episodes = [];
    const visited = new Set();

    $("article.player-sidebar-card[data-season-number]").each((_, card) => {
        const seasonNumber = parseInt($(card).attr("data-season-number"), 10);
        if (!seasonNumber) return;

        const anchor = $(card).find("a.player-sidebar-card-link, a[href*='/watch/episode/']").first();
        const href = anchor.attr("href") || "";
        if (!href) return;

        const slug = href.split("/episode/")[1]?.split("?")[0]?.split("#")[0] || "";
        if (!slug || visited.has(slug)) return;
        visited.add(slug);

        const absoluteUrl = href.startsWith("http") ? href : BASE_URL + href;
        const titleText = $(card).find(".player-sidebar-card-title").text().trim();
        const episodeMatch = titleText.match(/^E(\d+)/i) || titleText.match(/(\d+)/);
        const episodeNumber = episodeMatch
            ? parseInt(episodeMatch[1], 10)
            : episodes.filter(e => e.season === seasonNumber).length + 1;

        episodes.push({ season: seasonNumber, episode: episodeNumber, watchUrl: absoluteUrl });
    });

    if (episodes.length === 0) {
        $("a[href*='/watch/episode/']").each((index, el) => {
            const href = $(el).attr("href") || "";
            const slug = href.split("/episode/")[1]?.split("?")[0] || "";
            if (!slug || visited.has(slug)) return;
            visited.add(slug);

            const absoluteUrl = href.startsWith("http") ? href : BASE_URL + href;
            const episodeMatch = $(el).text().match(/(\d+)/);
            const episodeNumber = episodeMatch ? parseInt(episodeMatch[1], 10) : index + 1;

            episodes.push({ season: 1, episode: episodeNumber, watchUrl: absoluteUrl });
        });
    }

    return episodes;
}

function buildStreamEntries(urls) {
    const seen = new Set();
    return urls
        .filter(url => url && !seen.has(url) && seen.add(url))
        .slice(0, 2)
        .map(url => {
            const quality = resolveQuality(url);
            const rank = QUALITY_RANK[quality] ?? -2;
            const tag = getSortTag(rank);
            return {
                name: tag + "FlixHub FTP",
                title: tag + "FlixHub FTP \u2022 " + quality,
                url,
                quality,
                headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" },
            };
        });
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const meta = await getTmdbMeta(tmdbId, mediaType);
        if (!meta?.title) return [];

        const slug = toSlug(meta.title);
        if (!slug) return [];

        const watchPage = await resolveWatchPage(slug, mediaType);
        if (!watchPage) return [];

        if (mediaType === "movie") {
            return buildStreamEntries(extractStreamUrls(watchPage.html));
        }

        const episodeList = parseEpisodeList(watchPage.html);
        const target = episodeList.find(e => e.season === season && e.episode === episode);
        if (!target) return [];

        const episodeHtml = await fetchHtml(target.watchUrl);
        if (!episodeHtml) return [];

        return buildStreamEntries(extractStreamUrls(episodeHtml));
    } catch {
        return [];
    }
}

module.exports = { getStreams };