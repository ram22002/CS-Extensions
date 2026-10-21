const PROVIDER = "HdHub4u";
const BASE_URL = "https://new3.hdhub4u.free";
const TMDB_API = "https://api.themoviedb.org/3";
const SEARCH_URL = "https://search.pingora.fyi";
const HUBCLOUD_BASE = "https://hubcloud.ist";
const BASE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
};
const RE_ORIGIN = /^(https?:\/\/[^/]+)/;
const RE_RESOLUTION = /(\d{3,4})[pP]/;
const RE_YEAR = /\b(19|20)\d{2}\b/;
const RE_SIZE_STR = /([\d.]+)\s*(GB|MB|KB)/i;
const RE_10BIT = /\b10[\s-]?bit\b/i;
const RE_ATMOS = /\batmos\b/i;
const RE_IMAX = /\bimax\b/i;
const RE_REMUX = /\bremux\b/i;
const RE_BLURAY = /\bblu[-\s]?ray\b/i;
const RE_WEBRIP = /\b(?:webrip|hdrip)\b/i;
const RE_HEVC = /\b(?:hevc|x265|h\.?265)\b/i;
const RE_HDR10P = /\b(?:hdr10\+|hdr10p)\b/i;
const RE_HDR10 = /\bhdr10\b/i;
const RE_HDR = /\bhdr\b/i;
const RE_SDR = /\bsdr\b/i;
const RE_DV = /\b(?:dv|dolby[\s-]?vision)\b/i;
const RE_EPISODE = /Episode\s*0?(\d+)/i;
const R51 = "5[.\\s]?1";
const R71 = "7[.\\s]?1";
const AUDIO_TABLE = [
    [new RegExp(`ddp.?${R51}.*truehd.*${R71}|truehd.*${R71}.*ddp.?${R51}`, "i"), "DDP 5.1 + TrueHD 7.1"],
    [new RegExp(`ddp.?${R51}.*ddp.?${R71}|ddp.?${R71}.*ddp.?${R51}`, "i"), "DDP 5.1 + DDP 7.1"],
    [new RegExp(`ddp.?${R51}.*aac.?${R71}|aac.?${R71}.*ddp.?${R51}`, "i"), "DDP 5.1 + AAC 7.1"],
    [new RegExp(`ddp.?${R51}`, "i"), "DDP 5.1"],
    [/truehd/i, "TrueHD 7.1"],
    [new RegExp(`aac.*${R71}|${R71}.*aac`, "i"), "AAC 7.1"],
    [/aac/i, "AAC 5.1"],
];
const LANGUAGE_PATTERNS = [
    [/\b(?:english|eng)\b/i, "English"],
    [/\bhindi\b/i, "Hindi"],
    [/\btamil\b/i, "Tamil"],
    [/\btelugu\b/i, "Telugu"],
    [/\bmalayalam\b/i, "Malayalam"],
    [/\bkannada\b/i, "Kannada"],
    [/\b(?:bengali|bangla)\b/i, "Bengali"],
    [/\bpunjabi\b/i, "Punjabi"],
    [/\bmarathi\b/i, "Marathi"],
];
const COUNT_OPTIONS = [
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
    { value: "unlimited", label: "Unlimited" },
];

function onSettings() {
    return [
        { type: "header", label: "Resolution" },
        { type: "toggle", key: "enable4K", label: "4K / 2160p", defaultValue: true },
        { type: "toggle", key: "enable1080p", label: "FHD / 1080p", defaultValue: true },

        { type: "header", label: "Limit Streams by Resolution" },
        { type: "info", label: "Max streams shown per resolution\nDefault: Unlimited" },
        { type: "select", key: "max4K", label: "4K / 2160p", defaultValue: "unlimited", options: COUNT_OPTIONS },
        { type: "select", key: "max1080p", label: "FHD / 1080p", defaultValue: "unlimited", options: COUNT_OPTIONS },
    ];
}

function resolveSettings() {
    const s = (typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS) || {};

    function cap(key, def) {
        const raw = s[key];
        if (raw === undefined || raw === null || raw === "") return def;
        if (raw === "unlimited") return Infinity;
        const n = parseInt(raw, 10);
        return (isNaN(n) || n <= 0) ? def : n;
    }

    return {
        enable4K: s.enable4K !== false,
        enable1080p: s.enable1080p !== false,
        max4K: cap("max4K", Infinity),
        max1080p: cap("max1080p", Infinity),
    };
}

function resWeight(quality) {
    const q = (quality || "").toUpperCase();
    if (q === "4K" || q === "2160P") return 5;
    if (q === "1440P") return 4;
    if (q === "1080P") return 3;
    if (q === "720P") return 2;
    if (q === "480P") return 1;
    return 0;
}

function getInvertedSortTag(score, maxScore) {
    maxScore = maxScore || 999999;
    let val = Math.max(0, parseInt(score, 10) || 0);
    let inv = Math.max(0, maxScore - val);
    let bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    const chars = [];
    for (let i = 0; i < bin.length; i++) {
        chars.push(bin.charAt(i) === "1" ? "\uFEFF" : "\u200B");
    }
    return chars.join("");
}

function applySettings(streams, settings) {
    streams = streams.filter(s => {
        if (s._resolution === "2160p" && !settings.enable4K) return false;
        if (s._resolution === "1080p" && !settings.enable1080p) return false;
        return true;
    });

    streams.sort((a, b) => resWeight(b._resolution) - resWeight(a._resolution));

    const resCounts = {};
    streams = streams.filter(s => {
        const res = s._resolution || "";
        const limit = res === "2160p" ? settings.max4K : res === "1080p" ? settings.max1080p : Infinity;
        if (limit === Infinity) return true;
        resCounts[res] = (resCounts[res] || 0) + 1;
        return resCounts[res] <= limit;
    });

    const seen = new Set();
    streams = streams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));

    const total = streams.length;
    streams = streams.map((s, i) => {
        const tag = getInvertedSortTag(total - i, total + 1);
        return { ...s, name: tag + s.name, title: tag + s.title };
    });

    return streams;
}

function originOf(url) {
    const m = RE_ORIGIN.exec(url || "");
    return m ? m[1] : "";
}

function parseResolutionValue(str) {
    const m = RE_RESOLUTION.exec(str || "");
    return m ? parseInt(m[1], 10) : 2160;
}

function resolutionLabel(pixels) {
    if (pixels >= 2160) return "2160p";
    if (pixels >= 1080) return "1080p";
    return "1080p";
}

function parseSizeToBytes(sizeStr) {
    const m = RE_SIZE_STR.exec(sizeStr || "");
    if (!m) return 0;
    const val = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    if (unit === "GB") return val * 1024 ** 3;
    if (unit === "MB") return val * 1024 ** 2;
    return val * 1024;
}

function formatFileSize(bytes) {
    if (!bytes) return "";
    const k = 1024;
    const units = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

function passesMinSizeCheck(bytes) {
    if (!bytes) return true;
    return bytes >= 1024 * 1024 * 1024;
}

function composeStreamMeta(displayTitle, qualityStr, headerText, serverLabel, sizeStr) {
    const src = `${headerText} ${displayTitle || ""}`.toLowerCase();

    const langParts = LANGUAGE_PATTERNS.filter(([re]) => re.test(src)).map(([, name]) => name);
    const audioChannels =
        langParts.length > 2 ? "Multi Audio" :
            langParts.length === 2 ? "Dual Audio" : "";

    let source = "WEB-DL";
    let isRemux = false;
    if (RE_REMUX.test(src)) { source = "Blu-ray"; isRemux = true; }
    else if (RE_BLURAY.test(src)) { source = "Blu-ray"; }
    else if (RE_WEBRIP.test(src)) { source = "WEB-Rip"; }

    const isImax = RE_IMAX.test(src);
    const bit10Tag = RE_10BIT.test(src) ? "10Bit" : "";
    const dvTag = RE_DV.test(src) ? "DV" : "";

    let hdrTag = "";
    if (RE_HDR10P.test(src)) hdrTag = "HDR10+";
    else if (RE_HDR10.test(src)) hdrTag = "HDR10";
    else if (RE_HDR.test(src)) hdrTag = "HDR";
    else if (RE_SDR.test(src)) hdrTag = "SDR";

    const codec = RE_HEVC.test(src) ? "H.265" : "H.264";

    let audio = "";
    for (const [re, label] of AUDIO_TABLE) {
        if (re.test(src)) { audio = label; break; }
    }
    if (RE_ATMOS.test(src)) audio = audio ? `${audio} Atmos` : "Atmos";

    const title = [PROVIDER, qualityStr, sizeStr, serverLabel].filter(Boolean).join(" \u2022 ");

    const line1 = langParts.join(" \u2022 ");
    const line2 = [source, isRemux && "REMUX", isImax && "IMAX", codec].filter(Boolean).join(" \u2022 ");
    const line3 = [bit10Tag, dvTag, hdrTag, audio, audioChannels].filter(Boolean).join(" \u2022 ");
    const quality = [line1, line2, line3].filter(Boolean).join("\n");

    return { title, quality };
}

function decodeBase64(value) {
    return atob((value || "").replace(/[^A-Za-z0-9+/=]/g, ""));
}

function applyRot13(value) {
    return (value || "").replace(
        /[a-zA-Z]/g,
        c => String.fromCharCode(
            (c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26
        )
    );
}

async function resolveRedirectTarget(url) {
    try {
        const html = await (await fetch(url, { headers: BASE_HEADERS, skipSizeCheck: true, redirect: "follow" })).text();
        const regex = /s\('o','([A-Za-z0-9+/=]+)'|ck\('_wp_http_\d+','([^']+)'/g;
        let combined = "";
        let m;
        while ((m = regex.exec(html)) !== null) combined += m[1] || m[2] || "";

        const payload = JSON.parse(decodeBase64(applyRot13(decodeBase64(decodeBase64(combined)))));
        const encodedUrl = decodeBase64(payload.o || "").trim();
        const data = (payload.data || "").trim();
        const wpHttp = (payload.blog_url || payload.l || "").trim();

        if (!wpHttp || !data) return encodedUrl || url;

        try {
            const resp = await fetch(`${wpHttp}?re=${data}`, { skipSizeCheck: true, redirect: "follow" });
            const $ = cheerio.load(await resp.text());
            const directLink = $("body").text().trim();
            return encodedUrl.length ? encodedUrl : directLink;
        } catch (_) {
            return encodedUrl || url;
        }
    } catch (_) {
        return url;
    }
}

async function extractHubCloud(url, displayTitle) {
    try {
        let currentUrl = url.includes("hubcloud.ink")
            ? url.replace("hubcloud.ink", new URL(HUBCLOUD_BASE).hostname)
            : url;

        const baseUrl = originOf(currentUrl);
        if (!baseUrl) return [];

        let href;
        if (currentUrl.includes("hubcloud.php")) {
            href = currentUrl;
        } else {
            const html = await (await fetch(currentUrl, { headers: BASE_HEADERS, skipSizeCheck: true, redirect: "follow" })).text();
            const $first = cheerio.load(html);
            const raw = $first("#download").attr("href") || "";
            if (!raw) return [];
            href = raw.toLowerCase().startsWith("http")
                ? raw
                : `${baseUrl.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
        }

        if (!href.trim()) return [];

        const pageHtml = await (await fetch(href, { headers: BASE_HEADERS, skipSizeCheck: true, redirect: "follow" })).text();
        const $ = cheerio.load(pageHtml);
        const rawSize = $("i#size").first().text() || "";
        const headerTxt = $("div.card-header").first().text() || "";
        const qualityStr = resolutionLabel(parseResolutionValue(headerTxt));
        const sizeBytes = parseSizeToBytes(rawSize);
        const sizeStr = formatFileSize(sizeBytes);

        if (qualityStr !== "2160p" && qualityStr !== "1080p") return [];

        const buttons = $("a.btn").toArray().map(el => ({
            link: $(el).attr("href") || "",
            label: ($(el).text() || "").toLowerCase(),
        }));

        const results = await Promise.all(buttons.map(async ({ link, label }) => {
            if (!link) return null;

            if (
                label.includes("fsl server") ||
                label.includes("fslv2") ||
                label.includes("s3 server") ||
                label.includes("mega server") ||
                label.includes("download file")
            ) {
                const { title, quality } = composeStreamMeta(displayTitle, qualityStr, headerTxt, "FSL", sizeStr);
                return {
                    url: link,
                    quality,
                    title,
                    name: title,
                    _bytes: sizeBytes,
                    _resolution: qualityStr,
                    _host: "FSL",
                    headers: { Referer: href, "User-Agent": BASE_HEADERS["User-Agent"] },
                };
            }

            return null;
        }));

        return results.filter(Boolean);
    } catch (_) {
        return [];
    }
}

async function extractHubDrive(url, displayTitle) {
    try {
        const html = await (await fetch(url, { headers: BASE_HEADERS, skipSizeCheck: true, redirect: "follow" })).text();
        const $ = cheerio.load(html);
        const href = $(".btn.btn-primary.btn-user.btn-success1.m-1").attr("href");
        if (!href || !href.toLowerCase().includes("hubcloud")) return [];
        return extractHubCloud(href, displayTitle);
    } catch (_) {
        return [];
    }
}

async function extractHbLinks(url, displayTitle) {
    try {
        const html = await (await fetch(url, { headers: BASE_HEADERS, skipSizeCheck: true, redirect: "follow" })).text();
        const $ = cheerio.load(html);
        const anchors = $("h3 a, h5 a, div.entry-content p a").toArray();

        const results = await Promise.all(anchors.map(async el => {
            const href = $(el).attr("href") || "";
            if (!href) return [];
            const lower = href.toLowerCase();
            try {
                if (lower.includes("hubdrive")) return extractHubDrive(href, displayTitle);
                if (lower.includes("hubcloud")) return extractHubCloud(href, displayTitle);
                return [];
            } catch (_) {
                return [];
            }
        }));

        return results.flat();
    } catch (_) {
        return [];
    }
}

async function dispatchExtractor(url, displayTitle) {
    if (!url || !url.startsWith("http")) return [];
    const host = (originOf(url) || "").toLowerCase();
    try {
        if (host.includes("hubdrive")) return extractHubDrive(url, displayTitle);
        if (host.includes("hubcloud")) return extractHubCloud(url, displayTitle);
        if (host.includes("hblinks")) return extractHbLinks(url, displayTitle);
        return [];
    } catch (_) {
        return [];
    }
}

async function resolveAndDispatch(link, displayTitle) {
    try {
        let finalLink = link;
        if (link.includes("?id=")) finalLink = await resolveRedirectTarget(link);
        if (!finalLink) return [];
        if (finalLink.toLowerCase().includes("hubdrive")) return extractHubDrive(finalLink, displayTitle);
        return dispatchExtractor(finalLink, displayTitle);
    } catch (_) {
        return [];
    }
}

async function fetchPostByImdbId(imdbId) {
    try {
        const resp = await fetch(
            `${BASE_URL}/wp-json/wp/v2/posts?search=${encodeURIComponent(imdbId)}`,
            { headers: BASE_HEADERS, skipSizeCheck: true, redirect: "follow" }
        );
        if (!resp.ok) return null;
        const posts = await resp.json().catch(() => null);
        if (!Array.isArray(posts) || !posts.length) return null;
        const post = posts[0];
        const link = post.link || "";
        if (!link) return null;
        return { url: link, title: (post.title && post.title.rendered) || "" };
    } catch (_) {
        return null;
    }
}

function normalizeSearchTitle(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\b(the|a|an)\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function computeTitleScore(expected, candidate, expectedYear, candidateYear) {
    const expTokens = normalizeSearchTitle(expected).split(" ").filter(Boolean);
    const canTokens = normalizeSearchTitle(candidate).split(" ").filter(Boolean);
    if (!expTokens.length || !canTokens.length) return 0;

    const canSet = new Set(canTokens);
    const hits = expTokens.filter(t => canSet.has(t)).length;
    let score = hits / expTokens.length;

    if (expTokens.every(t => canSet.has(t))) score += 0.25;
    if (expectedYear && candidateYear === expectedYear) score += 0.25;
    else if (expectedYear && candidateYear && Math.abs(candidateYear - expectedYear) > 1) score -= 0.5;

    return score;
}

function selectBestMatch(expectedTitle, expectedYear, candidates, mediaType, season) {
    let best = null;
    for (const candidate of candidates) {
        const ym = RE_YEAR.exec(candidate.title);
        const cYear = ym ? Number(ym[0]) : null;
        let score = computeTitleScore(expectedTitle, candidate.title, expectedYear, cYear);

        if (mediaType === "tv" && season) {
            const sm = candidate.title.match(/(?:season\s*|s)0?(\d+)/i);
            if (sm && Number(sm[1]) === Number(season)) score += 0.5;
            else if (sm) score -= 0.75;
        }

        if (!best || score > best.score) best = Object.assign({}, candidate, { score });
    }
    return best && best.score >= 0.6 ? best : null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const endpoint = mediaType === "tv" ? "tv" : "movie";
        const mediaInfo = await fetch(
            `${TMDB_API}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`,
            { skipSizeCheck: true, redirect: "follow" }
        ).then(r => r.json()).catch(() => null);

        if (!mediaInfo) return [];
        const title = mediaInfo.title || mediaInfo.name;
        if (!title) return [];

        const imdbId = (mediaInfo.external_ids && mediaInfo.external_ids.imdb_id) || mediaInfo.imdb_id || null;
        const releaseDate = mediaType === "tv" ? mediaInfo.first_air_date : mediaInfo.release_date;
        const year = releaseDate ? Number(String(releaseDate).slice(0, 4)) : null;

        let match = null;
        if (imdbId && mediaType === "movie") match = await fetchPostByImdbId(imdbId);

        if (!match) {
            const searchJson = await fetch(
                `${SEARCH_URL}/collections/post/documents/search`
                + `?q=${encodeURIComponent(title)}`
                + `&query_by=post_title,category&query_by_weights=4,2`
                + `&sort_by=sort_by_date:desc&limit=15&highlight_fields=none&use_cache=true&page=1`,
                { headers: { ...BASE_HEADERS, Accept: "application/json, text/plain, */*", Referer: `${BASE_URL}/`, Origin: BASE_URL }, skipSizeCheck: true, redirect: "follow" }
            ).then(r => r.json()).catch(() => null);

            const hits = (searchJson && searchJson.hits) ? searchJson.hits : [];
            if (!hits.length) return [];

            const results = hits.map(h => ({ title: h.document.post_title, url: h.document.permalink }));
            match = selectBestMatch(title, year, results, mediaType, season) || results[0];
        }

        if (!match) return [];

        const matchPath = match.url.startsWith("http")
            ? match.url.replace(/^https?:\/\/[^/]+/, "")
            : match.url;
        const pageUrl = `${BASE_URL}${matchPath.startsWith("/") ? "" : "/"}${matchPath}`;
        const pageHtml = await (await fetch(pageUrl, { headers: BASE_HEADERS, skipSizeCheck: true, redirect: "follow" })).text();
        const $ = cheerio.load(pageHtml);
        const rawLinks = [];

        if (mediaType === "tv") {
            const epPattern = new RegExp(`Episode\\s*0?${episode}\\b`, "i");
            $("h5 a").each((_, el) => {
                if (epPattern.test($(el).text())) {
                    const href = $(el).attr("href");
                    if (href) rawLinks.push(href);
                }
            });

            if (!rawLinks.length) {
                $("h5 a").each((_, el) => {
                    const m = RE_EPISODE.exec($(el).text());
                    if (m && parseInt(m[1], 10) === parseInt(episode, 10)) {
                        const href = $(el).attr("href");
                        if (href) rawLinks.push(href);
                    }
                });
            }

            if (!rawLinks.length) {
                const epNumPattern = new RegExp(`^E0*${episode}\\b`, "i");
                $("h4").each((_, el) => {
                    if (epNumPattern.test($(el).text().trim())) {
                        $(el).find("a").each((__, a) => {
                            const href = $(a).attr("href");
                            if (href) rawLinks.push(href);
                        });
                    }
                });
            }
        } else {
            $("h3 a, h4 a").each((_, el) => {
                if (/480|720|1080|2160|4K/i.test($(el).text())) {
                    const href = $(el).attr("href");
                    if (href) rawLinks.push(href);
                }
            });

            $(".page-body > div a").each((_, el) => {
                const href = $(el).attr("href") || "";
                if (/https?:\/\/.*?(hdstream4u|hubstream)\./i.test(href)) rawLinks.push(href);
            });
        }

        const uniqueLinks = [...new Set(rawLinks.filter(Boolean))];
        if (!uniqueLinks.length) return [];

        const displayTitle = mediaType === "tv" ? `S${season}E${episode}` : title;
        const perLink = await Promise.all(uniqueLinks.map(link => resolveAndDispatch(link, displayTitle)));
        const streams = perLink.flat().filter(s => s && s.url && passesMinSizeCheck(s._bytes));

        return applySettings(streams, resolveSettings());
    } catch (_) {
        return [];
    }
}

module.exports = { getStreams, onSettings };