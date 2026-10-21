const cheerio = require("cheerio");
const PROVIDER = "MoviesDrive";
const BASE_URL = "https://new1.moviesdrive.beer";
const QUALITY_FILTER = new Set(["1080p", "2160p"]);
const QUALITY_RANK_MAX = 2;
const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
};

function resolveQuality(raw) {
    if (!raw) return null;
    const match = raw.match(/(\d{3,4})[pP]/);
    if (match) return `${match[1]}p`;
    const upper = raw.toUpperCase();
    if (upper.includes("4K") || upper.includes("2160") || upper.includes("UHD")) return "2160p";
    return null;
}

function toGB(sizeStr) {
    if (!sizeStr) return 0;
    const match = sizeStr.match(/([\d.]+)\s*(GB|MB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    return match[2].toUpperCase() === "GB" ? value : value / 1024;
}

function qualityRank(quality) {
    const q = (quality || "").toUpperCase();
    if (q === "4K" || q === "2160P") return 2;
    if (q === "1080P") return 1;
    return 0;
}

function providerRank(name) {
    const n = (name || "").toLowerCase();
    if (n.includes("fsl")) return 2;
    if (n.includes("pixeldrain")) return 1;
    return 0;
}

function getSortTag(rank) {
    const inv = Math.max(0, QUALITY_RANK_MAX - rank);
    let bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    return bin.split("").map(b => b === "1" ? "\uFEFF" : "\u200B").join("");
}

function dedupe(streams) {
    const seen = new Set();
    return streams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
}

function rankAndTrim(streams) {
    streams.sort((a, b) => {
        const byQuality = qualityRank(b.quality) - qualityRank(a.quality);
        if (byQuality !== 0) return byQuality;
        const byProvider = providerRank(b.name) - providerRank(a.name);
        if (byProvider !== 0) return byProvider;
        return toGB(b.size) - toGB(a.size);
    });

    const tally = {};
    return streams
        .filter(s => {
            const bucket = `${s.name}|${s.quality}`;
            tally[bucket] = (tally[bucket] || 0) + 1;
            return tally[bucket] <= 3;
        })
        .map(s => {
            const tag = getSortTag(qualityRank(s.quality));
            return {
                name: tag + s.name,
                title: tag + s.name,
                url: s.url,
                quality: s.quality,
                size: s.size,
                headers: s.headers,
            };
        });
}

async function resolveHubCloudLinks(pageUrl, referer) {
    try {
        let resolvedUrl = pageUrl;
        const initialRes = await fetch(resolvedUrl, { headers: { ...DEFAULT_HEADERS, Referer: referer } });
        let html = await initialRes.text();

        if (!resolvedUrl.includes("hubcloud.php")) {
            let target = "";
            const $landing = cheerio.load(html);
            const phpAnchor = $landing('a[href*="hubcloud.php"]').attr("href");
            if (phpAnchor) {
                target = phpAnchor;
            } else {
                const dlButton = $landing("#download");
                if (dlButton.length) {
                    target = dlButton.attr("href") || "";
                } else {
                    const inlineUrl = html.match(/var url = ["']([^"']+)["']/);
                    if (inlineUrl) target = inlineUrl[1];
                }
            }
            if (target) {
                if (!target.startsWith("http")) {
                    const base = new URL(resolvedUrl);
                    target = `${base.protocol}//${base.hostname}/${target.replace(/^\//, "")}`;
                }
                resolvedUrl = target;
                const followRes = await fetch(resolvedUrl, { headers: { ...DEFAULT_HEADERS, Referer: pageUrl } });
                html = await followRes.text();
            }
        }

        const $ = cheerio.load(html);
        const size = $("i#size").text().trim();
        const quality = resolveQuality($("div.card-header").text().trim());

        if (!QUALITY_FILTER.has(quality) || toGB(size) < 1) return [];

        const pxlVar = html.match(/var\s+pxl\s*=\s*["']([^"']+)["']/);
        const blocked = ["tinyurl", "telegram", "hubcloud.cx/tg", "hubcloud.foo/tg"];
        const playbackHeaders = { Referer: resolvedUrl };
        const results = [];

        $("a[href]").each((_, el) => {
            let href = $(el).attr("href");
            const text = $(el).text().toLowerCase().trim();
            if (!href || blocked.some(b => href.includes(b))) return;
            if (href.includes("negn6f") && pxlVar) href = pxlVar[1];

            if (text.includes("fslv2") || text.includes("fsl v2")) {
                results.push({ name: `${PROVIDER} • FSLv2`, title: `${PROVIDER} • FSLv2`, quality, size, url: href, headers: playbackHeaders });
            } else if (text.includes("fsl server") || (text.includes("fsl") && !text.includes("v2"))) {
                results.push({ name: `${PROVIDER} • FSL`, title: `${PROVIDER} • FSL`, quality, size, url: href, headers: playbackHeaders });
            } else if (text.includes("pixeldra") || text.includes("pixelserver") || text.includes("pixeldrain") || href.includes("pixeldrain")) {
                let directUrl = href;
                if (directUrl.includes("/u/")) {
                    const fileId = directUrl.split("/u/")[1].split("?")[0].replace("/", "");
                    directUrl = `https://pixeldrain.dev/api/file/${fileId}?download`;
                }
                results.push({ name: `${PROVIDER} • Pixeldrain`, title: `${PROVIDER} • Pixeldrain`, quality, size, url: directUrl, headers: playbackHeaders });
            }
        });

        return results;
    } catch {
        return [];
    }
}

async function extractFromMdrive(url) {
    if (!url) return [];
    const hostPattern = /hubcloud|gdflix|gdlink/i;
    if (hostPattern.test(url) && (url.includes("/drive/") || url.includes("/file/"))) return [url];
    try {
        const res = await fetch(url, { headers: DEFAULT_HEADERS });
        const html = await res.text();
        if (url.includes("search-recover.php")) {
            const qParam = html.match(/const\s+Q_INITIAL\s*=\s*["']([^"']+)["']/);
            const tokenParam = html.match(/const\s+FROM_AC_TOKEN\s*=\s*["']([^"']+)["']/);
            if (qParam && tokenParam) {
                const apiBase = url.split("/drive/")[0];
                const params = new URLSearchParams({ api: "search", q: qParam[1], page: "1", from_ac: tokenParam[1] });
                const searchRes = await fetch(`${apiBase}/drive/search-recover.php?${params}`, {
                    headers: { ...DEFAULT_HEADERS, Accept: "application/json", Referer: url },
                });
                const payload = await searchRes.json();
                if (payload && payload.hits) return payload.hits.map(h => h.url).filter(Boolean);
            }
        }
        const $ = cheerio.load(html);
        return $("a[href]").map((_, el) => $(el).attr("href")).get().filter(href => hostPattern.test(href));
    } catch {
        return [];
    }
}

async function resolveStreams(links, referer) {
    const candidates = await Promise.all(links.map(l => extractFromMdrive(l)));
    const unique = [...new Set(candidates.flat())];
    const settled = await Promise.all(unique.map(async u => {
        try {
            const { hostname } = new URL(u);
            return hostname.includes("hubcloud") ? resolveHubCloudLinks(u, referer) : [];
        } catch {
            return [];
        }
    }));
    return settled.flat();
}

async function findPost(imdbId, title, mediaType, season) {
    const sSlug = season != null ? String(season).padStart(2, "0") : null;
    const seasonPatterns = mediaType === "tv" && season != null ? [
        new RegExp(`\\bseason\\s*0?${season}\\b`, "i"),
        new RegExp(`\\bs0?${season}\\b`, "i"),
        new RegExp(`\\bseason\\s*${sSlug}\\b`, "i"),
    ] : null;

    const matchesSeason = doc => {
        if (!seasonPatterns) return true;
        const postTitle = (doc.post_title || "").toLowerCase();
        const permalink = (doc.permalink || "").toLowerCase();
        return seasonPatterns.some(p => p.test(postTitle) || p.test(permalink));
    };

    const titleMatches = doc => {
        const postTitle = (doc.post_title || "").toLowerCase();
        const permalink = (doc.permalink || "").toLowerCase();
        const normPost = postTitle.replace(/[^a-z0-9]/g, "");
        const normQuery = title.toLowerCase().replace(/[^a-z0-9]/g, "");
        return normPost.includes(normQuery)
            || postTitle.includes(title.toLowerCase())
            || permalink.includes(title.toLowerCase().replace(/ /g, "-"));
    };

    if (imdbId) {
        try {
            const res = await fetch(`${BASE_URL}/search.php?q=${imdbId}&page=1`, { headers: DEFAULT_HEADERS });
            if (res.ok) {
                const payload = await res.json();
                const docs = (payload.hits || []).map(h => h.document);
                const hit = mediaType === "tv"
                    ? docs.find(d => d.imdb_id === imdbId && matchesSeason(d))
                    : docs.find(d => d.imdb_id === imdbId);
                if (hit) return hit;
            }
        } catch { }
    }

    try {
        const res = await fetch(`${BASE_URL}/search.php?q=${encodeURIComponent(title)}&page=1`, { headers: DEFAULT_HEADERS });
        if (!res.ok) return null;
        const payload = await res.json();
        const docs = (payload.hits || []).map(h => h.document);

        if (mediaType === "tv" && season != null) {
            return docs.find(doc => titleMatches(doc) && matchesSeason(doc)) || null;
        }

        return docs.find(titleMatches) || docs[0] || null;
    } catch {
        return null;
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const endpoint = mediaType === "tv" ? "tv" : "movie";
        const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`,
            { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } }
        );
        const tmdb = await tmdbRes.json();
        if (!tmdb) return [];

        const imdbId = tmdb.external_ids && tmdb.external_ids.imdb_id;
        const title = tmdb.title || tmdb.name || "";
        if (!title) return [];

        const post = await findPost(imdbId, title, mediaType, season);
        if (!post) return [];

        const postUrl = post.permalink.startsWith("http") ? post.permalink : `${BASE_URL}${post.permalink}`;
        const pageRes = await fetch(postUrl, { headers: DEFAULT_HEADERS });
        const pageHtml = await pageRes.text();
        const $ = cheerio.load(pageHtml);

        if (mediaType === "movie") {
            const links = [...new Set($("h5 a").map((_, el) => $(el).attr("href")).get().filter(Boolean))];
            const streams = await resolveStreams(links, postUrl);
            return rankAndTrim(dedupe(streams.map(s => ({
                name: s.name,
                title: s.name,
                url: s.url,
                quality: s.quality,
                size: s.size,
                headers: s.headers,
            }))));
        }

        const seasonPad = String(season).padStart(2, "0");
        const seasonRe = new RegExp(`Season ${season}|S${seasonPad}`, "i");
        const episodeRe = new RegExp(`\\b(?:ep|episode|e)\\s*0?${episode}\\b|s0?${season}\\s*e0?${episode}\\b`, "i");
        const sectionRe = /^\s*(EP\d+|Episode\s*\d+|S\d+E\d+)/i;
        const collected = [];

        const seasonBlocks = $("h5").filter((_, el) => seasonRe.test($(el).text())).get();

        for (const block of seasonBlocks) {
            const episodePageUrl = $(block).next().find("a").attr("href") || $(block).find("a").attr("href");
            if (!episodePageUrl) continue;
            try {
                const epRes = await fetch(episodePageUrl, { headers: DEFAULT_HEADERS });
                const epHtml = await epRes.text();
                const $ep = cheerio.load(epHtml);
                const epRows = $ep("h5").filter((_, el) => episodeRe.test($ep(el).text())).get();

                for (const row of epRows) {
                    const epLinks = [];
                    let sibling = $ep(row).next();
                    while (sibling.length && !sectionRe.test(sibling.text().trim())) {
                        sibling.find("a[href]").each((_, a) => {
                            const href = $ep(a).attr("href");
                            if (href) epLinks.push(href);
                        });
                        sibling = sibling.next();
                    }
                    if (epLinks.length === 0) {
                        const a1 = $ep(row).next().find("a").attr("href");
                        const a2 = $ep(row).next().next().find("a").attr("href");
                        [a1, a2].forEach(l => l && epLinks.push(l));
                    }
                    const streams = await resolveStreams([...new Set(epLinks)], episodePageUrl);
                    collected.push(...streams.map(s => ({
                        name: s.name,
                        title: s.name,
                        url: s.url,
                        quality: s.quality,
                        size: s.size,
                        headers: s.headers,
                    })));
                }
            } catch { }
        }

        return rankAndTrim(dedupe(collected));
    } catch {
        return [];
    }
}

module.exports = { getStreams };