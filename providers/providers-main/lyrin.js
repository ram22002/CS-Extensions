const PROVIDER = "BanglaPlex";
const BASE_URL = "https://banglaplex.biz";
const TMDB_API = "https://api.themoviedb.org/3";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36";

const flatten = (arrays) => arrays.reduce((all, items) => all.concat(items), []);

async function httpRequest(url, { method = "GET", headers = {}, body } = {}) {
    try {
        const response = await fetch(url, {
            method,
            headers: { "User-Agent": USER_AGENT, ...headers },
            body,
        });
        return response && response.ok ? response : null;
    } catch (error) {
        return null;
    }
}

async function fetchText(url, headers) {
    const response = await httpRequest(url, { headers });
    if (!response) return null;
    try {
        return await response.text();
    } catch (error) {
        return null;
    }
}

async function fetchJson(url, headers) {
    const response = await httpRequest(url, { headers });
    if (!response) return null;
    try {
        return await response.json();
    } catch (error) {
        return null;
    }
}

function resolveUrl(href, base = BASE_URL) {
    try {
        return new URL(href, base).href;
    } catch (error) {
        return null;
    }
}

function hostnameOf(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch (error) {
        return "";
    }
}

function originOf(url) {
    try {
        return new URL(url).origin;
    } catch (error) {
        return BASE_URL;
    }
}

function normalizeTitle(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/&amp;/g, "and")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

function tokenize(value) {
    return normalizeTitle(value).split(" ").filter(Boolean);
}

function normalizeQuality(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("2160") || text.includes("4k")) return "2160p";
    if (text.includes("1080")) return "1080p";
    if (text.includes("720")) return "720p";
    if (text.includes("480")) return "480p";
    if (text.includes("360")) return "360p";
    return "Unknown";
}

function qualityRank(quality) {
    return ({ "2160p": 5, "1080p": 4, "720p": 3, "480p": 2, "360p": 1, Unknown: 1 })[quality] || 1;
}

function buildSortPrefix(rank) {
    const bits = Math.max(0, 5 - rank).toString(2).padStart(20, "0");
    return bits.replace(/1/g, "\uFEFF").replace(/0/g, "\u200B");
}

function formatFileSize(bytes) {
    const value = Number(bytes);
    if (!value || value <= 0) return "";
    const gigabytes = value / 1073741824;
    return gigabytes >= 1 ? `${gigabytes.toFixed(2)} GB` : `${Math.round(value / 1048576)} MB`;
}

async function fetchTmdbMetadata(tmdbId, mediaType) {
    const apiKey = typeof TMDB_API_KEY !== "undefined" ? TMDB_API_KEY : "";
    if (!apiKey) return null;

    const isSeries = mediaType === "tv";
    const data = await fetchJson(`${TMDB_API}/${isSeries ? "tv" : "movie"}/${tmdbId}?api_key=${apiKey}`);
    if (!data) return null;

    const releaseDate = data.release_date || data.first_air_date || "";
    return {
        title: (isSeries ? data.name : data.title) || "",
        originalTitle: (isSeries ? data.original_name : data.original_title) || "",
        year: parseInt(releaseDate.slice(0, 4), 10) || null,
    };
}

function parseSearchResults(html) {
    const $ = cheerio.load(html);
    const results = [];
    const seenUrls = new Set();

    const addResult = (href, title) => {
        const url = resolveUrl(href);
        if (!url || !title || seenUrls.has(url)) return;
        seenUrls.add(url);
        results.push({ url, title });
    };

    $(".latest-movie-img-container, .movie-img, div.movie, article, div.latest-movie, div[class*='col']").each((index, element) => {
        const anchor = $(element).find("a[href*='/watch/']").first();
        const href = anchor.attr("href");
        if (!href) return;

        const title =
            ($(element).find(".movie-title, h3, h2, h1").first().text() || "").trim() ||
            (anchor.attr("title") || "").trim() ||
            (anchor.text() || "").trim() ||
            ($(element).find("img").first().attr("alt") || "").trim();
        addResult(href, title);
    });

    if (results.length === 0) {
        $("a[href*='/watch/']").each((index, element) => {
            const anchor = $(element);
            const title =
                (anchor.attr("title") || "").trim() ||
                (anchor.text() || "").trim() ||
                (anchor.find("img").first().attr("alt") || "").trim();
            addResult(anchor.attr("href"), title);
        });
    }

    return results;
}

function parseDownloadPage(html) {
    const $ = cheerio.load(html);

    let year = null;
    $("a[href*='/year/']").each((index, element) => {
        if (year) return;
        year = parseInt(($(element).text() || "").trim(), 10) || null;
    });

    const section = $("#download, .download, div[id*='download']");
    const anchors = section.length > 0 ? section.find("a[href]") : $("a[href]");
    const pasteLinks = [];
    const seenUrls = new Set();

    anchors.each((index, element) => {
        const url = resolveUrl($(element).attr("href") || "");
        if (!url || seenUrls.has(url) || !/pasteurl|pastetot|\/view\//.test(url)) return;
        seenUrls.add(url);
        pasteLinks.push({ url, label: ($(element).text() || "").trim() });
    });

    return { year, pasteLinks };
}

function collectAnchors(html, selector) {
    const $ = cheerio.load(html);
    const anchors = [];
    $(selector).each((index, element) => {
        const href = ($(element).attr("href") || "").trim();
        if (href) anchors.push({ href, text: ($(element).text() || "").trim() });
    });
    return anchors;
}

function collectFormFields(html) {
    const $ = cheerio.load(html);
    const fields = {};
    let count = 0;
    $("form input[name]").each((index, element) => {
        fields[$(element).attr("name")] = $(element).attr("value") || "";
        count += 1;
    });
    return count > 0 ? fields : null;
}

function findDirectDownloadHref(html) {
    const $ = cheerio.load(html);
    return ($("a.btn-success, a.btn-primary, a[href*='download'], a.btn").first().attr("href") || "").trim();
}

async function searchCatalog(query) {
    const html = await fetchText(`${BASE_URL}/search?q=${encodeURIComponent(query)}`, { Referer: `${BASE_URL}/` });
    return html ? parseSearchResults(html) : [];
}

function scoreTitleMatch(candidate, queries, year) {
    const candidateTitle = normalizeTitle(candidate.title);
    const candidateTokens = tokenize(candidate.title);

    let bestScore = 0;
    for (const query of queries) {
        const queryTitle = normalizeTitle(query);
        const queryTokens = tokenize(query);
        if (queryTokens.length === 0) continue;

        const matched = queryTokens.filter((token) => candidateTokens.includes(token)).length;
        let score = matched / queryTokens.length;
        if (score < 0.8) continue;

        if (candidateTitle.startsWith(queryTitle)) score += 0.3;
        score -= Math.min(0.3, Math.max(0, candidateTokens.length - queryTokens.length) * 0.01);
        bestScore = Math.max(bestScore, score);
    }

    if (bestScore === 0) return 0;
    return year && candidateTitle.includes(String(year)) ? bestScore + 0.5 : bestScore;
}

function isYearCompatible(pageYear, expectedYear) {
    return !pageYear || !expectedYear || Math.abs(pageYear - expectedYear) <= 1;
}

async function locateDownloadPage(metadata, mediaType) {
    const queries = [metadata.title];
    if (metadata.originalTitle && normalizeTitle(metadata.originalTitle) !== normalizeTitle(metadata.title)) {
        queries.push(metadata.originalTitle);
    }

    const resultLists = await Promise.all(queries.map(searchCatalog));
    const candidatesByUrl = new Map();
    for (const candidate of flatten(resultLists)) {
        if (!candidatesByUrl.has(candidate.url)) candidatesByUrl.set(candidate.url, candidate);
    }

    const rankedCandidates = [...candidatesByUrl.values()]
        .map((candidate) => ({ candidate, score: scoreTitleMatch(candidate, queries, metadata.year) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    const pages = await Promise.all(
        rankedCandidates.map(async ({ candidate }) => {
            const html = await fetchText(candidate.url, { Referer: `${BASE_URL}/` });
            return html ? parseDownloadPage(html) : null;
        })
    );

    return (
        pages.find((page) => {
            if (!page || page.pasteLinks.length === 0) return false;
            return mediaType === "tv" || isYearCompatible(page.year, metadata.year);
        }) || null
    );
}

function parseSeasonEpisode(label) {
    const season = /(?:^|[^a-z])s(?:eason)?[\s._-]*0*(\d+)/i.exec(label);
    const episode = /(?:^|[^a-z])e(?:p(?:isode)?)?[\s._-]*0*(\d+)/i.exec(label);
    return {
        season: season ? parseInt(season[1], 10) : null,
        episode: episode ? parseInt(episode[1], 10) : null,
    };
}

function filterEpisodeLinks(pasteLinks, season, episode) {
    return pasteLinks.filter((link, index) => {
        const parsed = parseSeasonEpisode(link.label);
        if (parsed.season == null && parsed.episode == null) return season === 1 && episode === index + 1;
        if (parsed.episode !== episode) return false;
        return parsed.season == null || parsed.season === season;
    });
}

function unpackPackedScripts(source) {
    const pattern = /\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/g;
    let unpacked = "";
    let match;

    while ((match = pattern.exec(source)) !== null) {
        try {
            const payload = match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
            const radix = parseInt(match[2], 10);
            const symbols = match[4].split("|");

            const encode = (value) => {
                const prefix = value < radix ? "" : encode(Math.floor(value / radix));
                const digit = value % radix;
                return prefix + (digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36));
            };

            const dictionary = {};
            for (let index = parseInt(match[3], 10) - 1; index >= 0; index -= 1) {
                dictionary[encode(index)] = symbols[index] || encode(index);
            }
            unpacked += `\n${payload.replace(/\b\w+\b/g, (word) => dictionary[word] || word)}`;
        } catch (error) {
            continue;
        }
    }

    return unpacked;
}

function buildStream(label, url, quality, { size = "", headers, subtitles } = {}) {
    const stream = {
        name: `${PROVIDER} \u2022 ${label}`,
        title: `${PROVIDER} \u2022 ${label}`,
        url,
        size,
        quality,
    };
    if (headers) stream.headers = headers;
    if (subtitles && subtitles.length > 0) stream.subtitles = subtitles;
    return stream;
}

function extractPixeldrainId(url) {
    const match = /\/(?:u|api\/file)\/([A-Za-z0-9_-]+)/.exec(url);
    return match ? match[1] : null;
}

async function resolvePixeldrain(url, fallbackQuality) {
    const fileId = extractPixeldrainId(url);
    if (!fileId) return [];

    const info = await fetchJson(`https://pixeldrain.com/api/file/${fileId}/info`);
    const fileName = info && info.name ? String(info.name) : "";
    const fileQuality = normalizeQuality(fileName);
    const quality = fileQuality !== "Unknown" ? fileQuality : fallbackQuality;

    return [
        buildStream("Pixeldrain", `https://pixeldrain.com/api/file/${fileId}?download`, quality, {
            size: info ? formatFileSize(info.size) : "",
        }),
    ];
}

async function resolveGdflixButton(button, pageUrl, fallbackQuality) {
    const targetUrl = resolveUrl(button.href, pageUrl);
    if (!targetUrl) return [];

    const isPixeldrainButton = /pixeldra(?:in\.com|\.in)/i.test(button.href) || /pixel/i.test(button.text);
    const isCloudR2Button = /cloud/i.test(button.text) && /r2/i.test(button.text);

    if (isPixeldrainButton) {
        if (/pixeldra(?:in\.com|\.in)/i.test(hostnameOf(targetUrl)) && extractPixeldrainId(targetUrl)) {
            return resolvePixeldrain(targetUrl, fallbackQuality);
        }
        const response = await httpRequest(targetUrl, { headers: { Referer: pageUrl } });
        if (!response) return [];
        const linkedPage = await response.text();
        const pixeldrainLink = collectAnchors(linkedPage, "a[href]")
            .map((anchor) => anchor.href)
            .find((href) => /pixeldra(?:in\.com|\.in)/i.test(href));
        return resolvePixeldrain(pixeldrainLink || response.url || "", fallbackQuality);
    }

    if (isCloudR2Button) {
        const response = await httpRequest(targetUrl, { headers: { Referer: pageUrl } });
        if (!response) return [];
        const linkedPage = await response.text();
        const href = findDirectDownloadHref(linkedPage);
        const directUrl = href ? resolveUrl(href, targetUrl) : response.url || "";
        if (!directUrl || !directUrl.startsWith("http")) return [];
        if (/pixeldra(?:in\.com|\.in)/i.test(directUrl)) return resolvePixeldrain(directUrl, fallbackQuality);
        return [buildStream("GDFlix [Cloud R2]", directUrl, fallbackQuality)];
    }

    return [];
}

async function resolveGdflix(url, referer, fallbackQuality) {
    const html = await fetchText(url, { Referer: referer || url });
    if (!html) return [];

    const buttons = collectAnchors(html, "div.text-center a[href]");
    const streamGroups = await Promise.all(
        buttons.map((button) => resolveGdflixButton(button, url, fallbackQuality).catch(() => []))
    );
    return flatten(streamGroups);
}

function collectSubtitles(text) {
    const subtitles = [];
    const seenUrls = new Set();
    for (const [url] of text.matchAll(/https?:\/\/[^\s"'<>]+\.vtt[^\s"'<>]*/g)) {
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        const language = /_eng/i.test(url) ? "English" : "Subtitle";
        subtitles.push({ url, language, name: language });
    }
    return subtitles;
}

function collectMediaUrls(text, origin) {
    const urls = [...text.matchAll(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*/g)].map((match) => match[0]);
    if (urls.length === 0) {
        for (const match of text.matchAll(/["'](\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)["']/g)) {
            const url = resolveUrl(match[1], origin);
            if (url) urls.push(url);
        }
    }
    return [...new Set(urls)];
}

async function resolveStreamHost(url, fallbackQuality) {
    const pageUrl = url.replace(/hgcloud\.to|streamhg\.(?:com|to)/i, "vibuxer.com");
    const origin = originOf(pageUrl);
    const html = await fetchText(pageUrl, { Referer: `${origin}/` });
    if (!html) return [];

    const searchableText = `${unpackPackedScripts(html)}\n${html}`.replace(/\\\//g, "/");
    const subtitles = collectSubtitles(searchableText);
    const headers = { Referer: `${origin}/`, Origin: origin, "User-Agent": USER_AGENT };

    return collectMediaUrls(searchableText, origin).map((mediaUrl) =>
        buildStream("StreamHG", mediaUrl, fallbackQuality, { headers, subtitles })
    );
}

async function resolveXcloud(url, referer, fallbackQuality) {
    const html = await fetchText(url, { Referer: referer || url });
    if (!html) return [];

    const $ = cheerio.load(html);
    let directHref = null;
    $("div.vd a.btn-primary").each((index, element) => {
        if (directHref) return;
        if (/Generate Direct/i.test($(element).text())) directHref = $(element).attr("href");
    });
    if (!directHref) return [];

    const directUrl = resolveUrl(directHref, url);
    if (!directUrl) return [];

    const linksHtml = await fetchText(directUrl, { Referer: url });
    if (!linksHtml) return [];

    const $links = cheerio.load(linksHtml);
    const headers = { Referer: directUrl };
    const streams = [];

    const iframeSrc = $links("iframe").attr("src");
    const iframeUrl = iframeSrc ? resolveUrl(iframeSrc, directUrl) : null;
    if (iframeUrl) {
        const iframeQuality = normalizeQuality(iframeUrl);
        streams.push(
            buildStream("xCloud", iframeUrl, iframeQuality !== "Unknown" ? iframeQuality : fallbackQuality, { headers })
        );
    }

    $links("h2 a.btn").each((index, element) => {
        const href = $links(element).attr("href");
        const buttonUrl = href ? resolveUrl(href, directUrl) : null;
        if (buttonUrl) streams.push(buildStream("xCloud", buttonUrl, fallbackQuality, { headers }));
    });

    return streams;
}

async function resolveHostLink(url, referer, fallbackQuality) {
    const hostname = hostnameOf(url);
    try {
        if (hostname.includes("gdflix")) return await resolveGdflix(url, referer, fallbackQuality);
        if (hostname.includes("xcloud")) return await resolveXcloud(url, referer, fallbackQuality);
        if (/(?:^|\.)(?:hgcloud|streamhg|vibuxer)\./.test(hostname)) return await resolveStreamHost(url, fallbackQuality);
        if (/pixeldra(?:in\.com|\.in)/i.test(hostname)) return await resolvePixeldrain(url, fallbackQuality);
    } catch (error) {
        return [];
    }
    return [];
}

async function resolvePasteLinks(pasteUrl, label) {
    const fallbackQuality = normalizeQuality(label);
    const html = await fetchText(pasteUrl, { Referer: `${BASE_URL}/` });
    if (!html) return [];

    let pageHtml = html;
    const formFields = collectFormFields(html);
    if (formFields) {
        const response = await httpRequest(pasteUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: pasteUrl },
            body: new URLSearchParams(formFields).toString(),
        });
        if (response) {
            try {
                pageHtml = await response.text();
            } catch (error) {
                pageHtml = html;
            }
        }
    }

    const hostLinks = [
        ...new Set(
            collectAnchors(pageHtml, "a[href]")
                .map((anchor) => anchor.href)
                .filter((href) => href.startsWith("http") && !/pasteurl|pastetot/.test(href))
        ),
    ];

    const streamGroups = await Promise.all(hostLinks.map((link) => resolveHostLink(link, pasteUrl, fallbackQuality)));
    return flatten(streamGroups);
}

function dedupeStreams(streams) {
    const seenUrls = new Set();
    return streams.filter((stream) => {
        if (!stream.url || seenUrls.has(stream.url)) return false;
        seenUrls.add(stream.url);
        return true;
    });
}

function pickSecondXcloud(streams) {
    const isXcloud = (stream) => stream.name.endsWith("\u2022 xCloud");
    const xcloudStreams = streams.filter(isXcloud);
    if (xcloudStreams.length < 2) return streams;
    const second = xcloudStreams[1];
    return streams.filter((stream) => !isXcloud(stream) || stream === second);
}

function sortByQuality(streams) {
    return streams
        .slice()
        .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality))
        .map((stream) => {
            const prefix = buildSortPrefix(qualityRank(stream.quality));
            return { ...stream, name: prefix + stream.name, title: prefix + stream.title };
        });
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType !== "movie" && mediaType !== "tv") return [];
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const metadata = await fetchTmdbMetadata(tmdbId, mediaType);
        if (!metadata || !metadata.title) return [];

        const page = await locateDownloadPage(metadata, mediaType);
        if (!page) return [];

        const pasteLinks = (mediaType === "tv" ? filterEpisodeLinks(page.pasteLinks, season, episode) : page.pasteLinks)
            .slice(0, 8);
        if (pasteLinks.length === 0) return [];

        const outcomes = await Promise.allSettled(pasteLinks.map((link) => resolvePasteLinks(link.url, link.label)));
        const streams = flatten(outcomes.filter((outcome) => outcome.status === "fulfilled").map((outcome) => outcome.value));

        return sortByQuality(pickSecondXcloud(dedupeStreams(streams)));
    } catch (error) {
        return [];
    }
}

module.exports = { getStreams }; 