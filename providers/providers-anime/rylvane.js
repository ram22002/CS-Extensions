const PROVIDER = "WcoFlix";
const BASE_URL = "https://www.wcoflix.tv";
const EMBD_URL = "https://embed.wcostream.com";
const TMDB_API = "https://api.themoviedb.org/3";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36";

async function fetchText(url, referer, extraHeaders) {
    const headers = { "User-Agent": USER_AGENT, "Referer": referer || `${BASE_URL}/`, ...extraHeaders };
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
}

function decodeHtmlEntities(text) {
    return String(text || "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
        .replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function normalizeTitle(title) {
    return decodeHtmlEntities(title).toLowerCase()
        .replace(/\(.*?\)/g, " ")
        .replace(/\b(english\s+)?(subbed|dubbed)\b/g, " ")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ").trim();
}

async function fetchTmdbTitles(tmdbId, mediaType) {
    const endpoint = mediaType === "movie" ? "movie" : "tv";
    const query = `api_key=${TMDB_API_KEY}&append_to_response=alternative_titles`;
    const response = await fetch(`${TMDB_API}/${endpoint}/${tmdbId}?${query}`);
    const details = await response.json();
    if (!details) return [];
    const alternatives = details.alternative_titles || {};
    const alternativeTitles = (alternatives.titles || alternatives.results || [])
        .slice(0, 15)
        .map((alternative) => alternative.title);
    const candidates = [
        details.title, details.name, details.original_title, details.original_name,
        ...alternativeTitles
    ];
    return [...new Set(candidates.map(normalizeTitle).filter(Boolean))];
}

function parseCatalogPage(html) {
    const source = String(html || "").replace(/\\n/g, " ");
    const linkPattern = /<li[^>]*>\s*<a\s+href="(\/anime\/[^"]+)"(?:[^>]*?\btitle="([^"]*)")?[^>]*>([^<]{0,120})<\/a>/gi;
    const entries = [];
    const seenPaths = new Set();
    let match;
    while ((match = linkPattern.exec(source)) !== null) {
        const title = decodeHtmlEntities(match[2] || match[3] || "").trim();
        if (!title || seenPaths.has(match[1])) continue;
        seenPaths.add(match[1]);
        entries.push({ normalizedTitle: normalizeTitle(title), url: `${BASE_URL}${match[1]}` });
    }
    return entries;
}

async function loadCatalog() {
    const paths = ["/subbed-anime-list", "/dubbed-anime-list", "/cartoon-list"];
    const pages = await Promise.all(paths.map(async (path) => {
        try { return parseCatalogPage(await fetchText(`${BASE_URL}${path}`)); }
        catch (error) { return []; }
    }));
    return pages.flat();
}

function findCatalogMatches(catalog, titles) {
    const scored = [];
    for (const entry of catalog) {
        let score = 0;
        for (const title of titles) {
            const name = entry.normalizedTitle;
            if (name === title) { score = 100; break; }
            const isPrefixMatch = title.length >= 5 && name.length >= 5
                && (name.startsWith(title) || title.startsWith(name));
            if (isPrefixMatch) {
                const lengthRatio = Math.min(name.length, title.length) / Math.max(name.length, title.length);
                score = Math.max(score, 50 + Math.round(lengthRatio * 40));
            }
        }
        if (score >= 60) scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.filter((item) => item.score === scored[0].score).slice(0, 4).map((item) => item.entry);
}

function parseEpisodeLinks(html) {
    const linkPattern = /<a\s+href="(\/[^"]*?-episode-(\d+)[^"]*)"[^>]*class="dark-episode-item"[^>]*>/gi;
    const episodes = [];
    const seenPaths = new Set();
    let match;
    while ((match = linkPattern.exec(String(html || ""))) !== null) {
        const [tag, path, number] = match;
        if (seenPaths.has(path) || !parseInt(number, 10)) continue;
        seenPaths.add(path);
        const dataLang = tag.match(/data-lang="(sub|dub)"/i);
        const season = path.match(/-season-(\d+)-episode-/i);
        episodes.push({
            url: `${BASE_URL}${path}`,
            number: parseInt(number, 10),
            season: season ? parseInt(season[1], 10) : null,
            language: dataLang ? dataLang[1].toLowerCase()
                : /english-dubbed/i.test(path) ? "dub"
                    : /english-subbed/i.test(path) ? "sub" : null
        });
    }
    return episodes;
}

function selectEpisodes(episodes, mediaType, season, episode) {
    if (mediaType === "movie") {
        const firstNumber = Math.min(...episodes.map((item) => item.number));
        return episodes.filter((item) => item.number === firstNumber);
    }
    const hasSeasons = episodes.some((item) => item.season !== null);
    return episodes.filter((item) =>
        item.number === (parseInt(episode, 10) || 1)
        && (!hasSeasons || (item.season || 1) === (parseInt(season, 10) || 1)));
}

async function resolveStreams(episode) {
    const episodePage = await fetchText(episode.url, `${BASE_URL}/`);
    const iframe = episodePage.match(/<iframe[^>]+src="(https?:\/\/embed\.wcostream\.com\/inc\/embed\/index\.php\?[^"]+)"/i);
    const embedQuery = iframe && decodeHtmlEntities(iframe[1]).split("?")[1];
    if (!embedQuery) return [];

    const playerUrl = `${EMBD_URL}/inc/embed/video-js.php?${embedQuery}`;
    const playerPage = await fetchText(playerUrl, episode.url);
    const resolver = playerPage.match(/"(\/inc\/embed\/getvidlink\.php\?[^"]+)"/);
    if (!resolver) return [];

    const resolverUrl = `${EMBD_URL}${decodeHtmlEntities(resolver[1])}`;
    const resolverBody = await fetchText(resolverUrl, playerUrl, { "X-Requested-With": "XMLHttpRequest" });
    const links = JSON.parse(resolverBody);
    const token = links && links.server && (links.fhd || links.hd);
    if (!token) return [];

    const language = { dub: " • English", sub: " • Japanese" }[episode.language] || "";
    return [{
        name: `${PROVIDER}${language}`,
        title: `${PROVIDER}${language}`,
        url: `${String(links.server).replace(/\/$/, "")}/getvid?evid=${token}`,
        quality: links.fhd ? "1080p" : "720p",
        headers: { "User-Agent": USER_AGENT, "Referer": playerUrl }
    }];
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (!/^\d+$/.test(String(tmdbId))) return [];
        if (mediaType !== "movie" && mediaType !== "tv") return [];
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const [titles, catalog] = await Promise.all([fetchTmdbTitles(tmdbId, mediaType), loadCatalog()]);
        const episodeGroups = await Promise.all(findCatalogMatches(catalog, titles).map(async (match) => {
            try {
                const html = await fetchText(match.url);
                return selectEpisodes(parseEpisodeLinks(html), mediaType, season, episode);
            } catch (error) {
                return [];
            }
        }));

        const uniqueEpisodes = [...new Map(episodeGroups.flat().map((item) => [item.url, item])).values()];
        const streamGroups = await Promise.all(uniqueEpisodes.map(async (item) => {
            try { return await resolveStreams(item); }
            catch (error) { return []; }
        }));

        return [...new Map(streamGroups.flat().map((stream) => [stream.url, stream])).values()];
    } catch (error) {
        return [];
    }
}

module.exports = { getStreams };