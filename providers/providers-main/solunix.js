const cheerio = require("cheerio-without-node-native");
const BASE_URL = "https://vegamovies.gallery";
const API_BASE = "https://api.hicine.sbs";
const TMDB_API = "https://api.themoviedb.org/3";
const HBC_BASE = "https://hubcloud.ist";
const VCD_BASE = "https://vcloud.beer";
const MOBILE_UAS = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36"
];
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

function getSortTag(rank) {
    const inv = 4 - Math.max(0, Math.min(4, rank));
    let bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    return bin.split("").map(b => b === "1" ? "\uFEFF" : "\u200B").join("");
}

async function fetchSafe(url, opts = {}) {
    try {
        return await fetch(url, {
            ...opts,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                ...(opts.headers || {})
            }
        });
    } catch (e) {
        return null;
    }
}

const fetchJson = async (url, opts = {}) => {
    try {
        const r = await fetchSafe(url, opts);
        if (!r || !r.ok) return null;
        return await r.json();
    } catch (e) {
        return null;
    }
};

const fetchHtml = async (url, opts = {}) => {
    try {
        const r = await fetchSafe(url, opts);
        if (!r || !r.ok) return null;
        return cheerio.load(await r.text());
    } catch (e) {
        return null;
    }
};

let count1080p = 0;

function makeStream(_, title, url, quality, headers, mediaInfo, fallbackQ = "HD") {
    if (!url || !url.startsWith("https://")) return null;
    const nq = [quality, fallbackQ].find(q => ["2160p", "1440p", "1080p"].includes(q));
    if (!nq || (nq === "1080p" && count1080p >= 4)) return null;

    const t = (title || "").replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-").replace(/&#038;|&amp;/g, "&").replace(/&#8217;/g, "'").replace(/&quot;/g, "\"").replace(/[\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const sizeM = t.match(/\[\s*(\d+(?:\.\d+)?\s*[MG]B)\s*\]/i);
    const sizeStr = sizeM ? sizeM[1].trim() : null;
    const src = /bluray|blu\-ray|bdrip/i.test(t) ? "Blu-ray" : /hdrip|webrip/i.test(t) ? "WEBRip" : "WEB-DL";
    const imax = /imax/i.test(t) ? " • IMAX" : "";
    const range = /dolby\s*vision|dovi/i.test(t) ? "Dolby Vision" : /hdr10/i.test(t) ? "HDR10" : /hdr/i.test(t) ? "HDR" : /10bit|10\-bit/i.test(t) ? "10-Bit" : /sdr/i.test(t) ? "SDR" : "";
    const codec = /hevc|x265|h265/i.test(t) ? "H.265" : "H.264";

    let audio = "AAC";
    const am = t.match(/(TrueHD\s*7\.1|DDP\s*7\.1|DDP\s*5\.1|DD\s*5\.1|5\.1|AAC)/i);
    if (am) {
        audio = am[1].toUpperCase().replace(/\s+/g, "");
        if (audio === "5.1") audio = "DDP5.1";
        if (audio.includes("TRUEHD")) audio = "TrueHD 7.1";
    } else if (/dolby\s*digital|dd/i.test(t)) audio = "Dolby Digital";
    if (/atmos/i.test(t)) audio += " • Atmos";

    const langs = /dual|hindi\-eng|eng\-hin/i.test(t) ? "English • Hindi" : ([/english|eng/i.test(t) && "English", /hindi|hin/i.test(t) && "Hindi"].filter(Boolean).join(" • ") || "English");
    const lUrl = url.toLowerCase();
    const host = (lUrl.includes("hubcloud") || lUrl.includes("/hub2/") || lUrl.includes("homelander.buzz") || lUrl.includes("whistle.lat") || lUrl.includes("mandalorian.buzz")) ? "HubCloud" : (lUrl.includes(".r2.dev") || lUrl.includes("vcloud")) ? "vCloud" : lUrl.includes("pixeldrain") ? "PixelDrain" : "";

    if (nq === "1080p") count1080p++;

    const sortTag = getSortTag({ "2160p": 4, "1440p": 3, "1080p": 2 }[nq]);
    const shortLabel = `VegaMovies • ${nq.toUpperCase()}${imax}${host ? " • " + host : ""}`;
    const detailLine1 = `${langs}${sizeStr ? " • " + sizeStr : ""}`;
    const detailLine2 = `${src} • ${audio}${range ? " • " + range : ""} • ${codec}`;

    const stream = {
        name: sortTag + shortLabel,
        title: sortTag + shortLabel,
        quality: nq + " \u2022 " + detailLine1 + "\n" + detailLine2,
        language: langs,
        url,
        headers: headers || { "Referer": BASE_URL + "/" }
    };
    streamMeta.set(stream, { host: host || shortLabel, size: sizeStr ? sizeStr.replace(/\s+/g, "").toUpperCase() : "" });
    return stream;
}

const streamMeta = new WeakMap();
const dedupeBySize = streams => {
    const seen = new Set();
    return (streams || []).filter(x => {
        const m = x && streamMeta.get(x);
        if (!m || !m.size) return true;
        const k = m.host + "|" + m.size;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
};

const dedupe = streams => { const s = new Set(); return (streams || []).filter(x => x && x.url && !s.has(x.url) && s.add(x.url)); };
const isHubVc = s => { if (!s || !s.url) return false; const l = s.url.toLowerCase(); return l.includes("hubcloud") || l.includes("vcloud") || l.includes("/hub2/") || l.includes("homelander.buzz") || l.includes("whistle.lat") || l.includes("mandalorian.buzz") || l.includes(".r2.dev") || (s.name && (s.name.includes("HubCloud") || s.name.includes("vCloud"))); };

function isStrictMatch(reqTitle, reqYear, scrTitle, scrYear, alts = []) {
    if (!scrTitle) return false;
    const sc = scrTitle.toLowerCase().replace(/download\s*/gi, "").replace(/[^a-z0-9\s]/g, " ").trim().replace(/\s+/g, " ");
    if (![reqTitle, ...alts].filter(Boolean).some(t => { const c = t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().replace(/\s+/g, " "); return c && (sc.includes(c) || sc.startsWith(c)); })) return false;
    if (reqYear && scrYear && !isNaN(parseInt(reqYear)) && !isNaN(parseInt(scrYear)) && Math.abs(parseInt(reqYear) - parseInt(scrYear)) > 1) return false;
    return true;
}

async function getTMDBInfo(tmdbId, mediaType) {
    const t = mediaType === "tv" ? "tv" : "movie";
    try {
        const d = await fetchJson(`${TMDB_API}/${t}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids,alternative_titles`);
        if (d) {
            const alts = ((d.alternative_titles && (d.alternative_titles.titles || d.alternative_titles.results)) || []).map(x => String(x.title || ""));
            return {
                title: t === "tv" ? d.name : d.title,
                year: (d.first_air_date || d.release_date || "").split("-")[0],
                imdbId: d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || null,
                altTitles: alts
            };
        }
    } catch (e) { }
    return { title: String(tmdbId), year: null, imdbId: null, altTitles: [] };
}

async function searchByTitle(query, year) {
    if (!query) return [];
    const d = await fetchJson(`${BASE_URL}/search.php?q=${encodeURIComponent(query + (year ? " " + year : ""))}&page=1&per_page=15`, { headers: { "User-Agent": MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)], "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Referer": BASE_URL + "/" } });
    if (!d || !d.hits || !d.hits.length) return [];
    return d.hits.map(h => {
        const doc = h.document || {}, title = (doc.post_title || "").replace(/Download\s*/gi, "").trim();
        return { postId: String(doc.id || ""), title, permalink: doc.permalink || "", imdbId: doc.imdb_id || "", year: (Array.isArray(doc.category) ? doc.category.find(c => /^(19|20)\d{2}$/.test(String(c).trim())) : null) || (title.match(/\b(19|20)\d{2}\b/) || [null])[0] };
    });
}

async function fetchPostContent(postId, link) {
    if (!postId) return null;
    try {
        const r = await fetchSafe(`${BASE_URL}/wp-json/wp/v2/posts/${postId}`, { headers: { "User-Agent": MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)], "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Referer": BASE_URL + "/" } });
        if (r && r.ok) {
            const json = await r.json();
            if (json && json.content && json.content.rendered && /nexdrive|vcloud|hubcloud|fastdl|genxfm/i.test(json.content.rendered))
                return { title: (json.title && json.title.rendered || "").replace(/Download\s*/gi, "").trim(), html: json.content.rendered };
        }
    } catch (e) { }
    try {
        const $ = await fetchHtml(link ? (link.startsWith("https://") ? link : link.startsWith("http://") ? "https://" + link.slice(7) : link.startsWith("//") ? "https:" + link : BASE_URL + (link.startsWith("/") ? "" : "/") + link) : `${BASE_URL}/?p=${postId}`, { headers: { "User-Agent": MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)], "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Referer": BASE_URL + "/" } });
        if ($) { const html = $(".entry-content").html() || $(".post-content").html(); if (html) return { title: $("title").text().replace(/Download\s*/gi, "").trim(), html }; }
    } catch (e) { }
    return null;
}

function extractNexdriveLinks(html) {
    if (!html) return [];
    const $ = cheerio.load(html), seen = new Set(), links = [];
    $("a[href*=\"nexdrive\"], a[href*=\"genxfm\"], a[href*=\"fastdl\"], a[href*=\"vcloud\"], a[href*=\"hubcloud\"]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href || !href.startsWith("https://") || seen.has(href)) return;
        const text = ($(el).text() || "").trim();
        if (["filepress", "gdtot", "dropgalaxy", "gdflix", "gdlink"].some(e => text.toLowerCase().includes(e))) return;
        seen.add(href);
        let quality = "HD", label = text || "Download";
        const pos = html.indexOf(href);
        if (pos > 0) {
            const before = html.substring(Math.max(0, pos - 3000), pos);
            const hms = before.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi);
            if (hms && hms.length) { const hctx = hms[hms.length - 1].replace(/<[^>]*>/g, "").trim().replace(/Download/ig, ""); if (hctx.length > 5) label = hctx; }
            let last = null, li = -1, m, qp = /(?:^|>|\s)(\d{3,4}p|4K|UHD|HDR)(?:<|\s|$)/gi;
            while ((m = qp.exec(before)) !== null) { if (m.index > li) { li = m.index; last = m[1]; } }
            if (last) { const pm = last.match(/(2160|1080|720|480|1440)\s*P/i); quality = pm ? pm[1] + "p" : /4K|UHD/i.test(last) ? "2160p" : /1440|2K/i.test(last) ? "1440p" : "HD"; }
            if (!quality || quality === "HD") { const hq = before.match(/<(?:h[1-6]|strong|b)[^>]*>[^<]*?(\d{3,4}p|4K|UHD)[^<]*?<\//i); if (hq) { const pm = hq[1].match(/(2160|1080|720|480|1440)\s*P/i); quality = pm ? pm[1] + "p" : /4K|UHD/i.test(hq[1]) ? "2160p" : /1440|2K/i.test(hq[1]) ? "1440p" : "HD"; } }
        }
        if (["2160p", "1440p", "1080p"].includes(quality)) links.push({ href, quality, label });
    });
    return links;
}

function extractSeasonFromContent(html, season) {
    if (!html || season == null) return html;
    let clean = html.split("id=\"comments\"")[0];
    if (clean.length === html.length) clean = html.split("class=\"comments-area\"")[0];
    const re = /(?:Season|Saison|Staffel)\s+0*(\d+)\b(?!\s*(?:-|–|to|and|&|&#))/gi;
    let m, blocks = [];
    while ((m = re.exec(clean)) !== null) {
        const ts = Math.max(clean.lastIndexOf("<h", m.index), clean.lastIndexOf("<strong", m.index));
        const start = (ts < 0 || m.index - ts > 500) ? m.index : ts;
        const ctx = clean.substring(start, m.index + 50).toLowerCase();
        if (!ctx.includes("download") && !ctx.includes("episode")) blocks.push({ season: parseInt(m[1]), index: start });
    }
    if (!blocks.length) return clean;
    const tb = blocks.find(b => b.season === season);
    if (!tb) return clean;
    const nb = blocks.find(b => b.index > tb.index && b.season !== season);
    return clean.substring(tb.index, nb ? nb.index : clean.length);
}

async function extractSingleVc(vcUrl, referer, targetSeason, targetEp, label, fallbackQ, mediaInfo) {
    const streams = [], lower = vcUrl.toLowerCase();
    if (!vcUrl.startsWith("https://") || (!lower.includes("vcloud") && !lower.includes("hubcloud") && !lower.includes("nexdrive") && !lower.includes("fastdl"))) return streams;

    const isHub = lower.includes("hubcloud"), latestBase = isHub ? HBC_BASE : VCD_BASE, cur = vcUrl.split("/").slice(0, 3).join("/");
    const newUrl = (cur !== latestBase && (vcUrl.includes("vcloud") || vcUrl.includes("hubcloud"))) ? vcUrl.replace(cur, latestBase) : vcUrl;

    const $ = await fetchHtml(newUrl, { headers: { "User-Agent": MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)], "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Referer": referer || BASE_URL + "/", "Cookie": "xla=s4t" }, redirect: "manual" });
    if (!$) return streams;

    const raw = $.html(), pageTitle = $("title").text() || "";
    if (targetSeason != null || targetEp != null) {
        const sem = pageTitle.match(/[.\s_\-](?:S|Season)\s*0*(\d{1,2})[.\s_\-]*(?:E|Ep|Episode)\s*0*(\d{1,2})[.\s_\-]/i);
        if (sem) { if (targetSeason != null && parseInt(sem[1]) !== targetSeason) return streams; if (targetEp != null && parseInt(sem[2]) !== targetEp) return streams; }
        else { const sm = pageTitle.match(/[.\s_\-](?:S|Season)\s*0*(\d{1,2})[.\s_\-]/i); if (sm && targetSeason != null && parseInt(sm[1]) !== targetSeason) return streams; }
    }

    const headerText = $("div.card-header").text() || "";
    const qm = headerText.match(/(2160|1080|720|480|1440)\s*P/i);
    const quality = qm ? qm[1] + "p" : /4K|UHD/i.test(headerText) ? "2160p" : /1440|2K/i.test(headerText) ? "1440p" : "HD";
    const tasks = [];
    const synced = href => href.includes("?") ? href + "&s=" + (1 + new Date().getMinutes()) : href + "?s=" + (1 + new Date().getMinutes());

    const varAtob = raw.match(/var\s+url\s*=\s*atob\(atob\('([^']+)'\)\)/);
    const varUrl = raw.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
    let bridgeUrl = varAtob ? (function () { try { return atob(atob(varAtob[1])); } catch (e) { return varAtob[1]; } })() : varUrl ? varUrl[1] : "";

    if (bridgeUrl && bridgeUrl.includes(".workers.dev") && bridgeUrl.startsWith("https://")) {
        tasks.push(() => streams.push(makeStream("Worker", (label || "Worker") + " [" + headerText + "]", synced(bridgeUrl), quality, { "Referer": newUrl }, mediaInfo, fallbackQ)));
        bridgeUrl = "";
    }

    const skipBtn = lt => lt.includes("10gbps") || lt.includes("gdflix") || lt.includes("dropgalaxy") || lt.includes("telegram");
    $("a.btn, a").each((_, el) => {
        const href = $(el).attr("href") || "", text = ($(el).text() || "").trim(), lt = text.toLowerCase();
        if (!href || href === "#" || !href.startsWith("https://") || href.toLowerCase().includes(".zip") || skipBtn(lt)) return;
        if (lt.includes("fslv2")) tasks.push(() => streams.push(makeStream("FSLv2", (label || text) + " [" + headerText + "]", href, quality, { "Referer": newUrl }, mediaInfo, fallbackQ)));
        else if (lt.includes("fsl")) tasks.push(() => streams.push(makeStream("FSL", (label || text) + " [" + headerText + "]", synced(href), quality, { "Referer": newUrl }, mediaInfo, fallbackQ)));
        else if (lt.includes("worker")) tasks.push(() => streams.push(makeStream("Worker", (label || text) + " [" + headerText + "]", synced(href), quality, { "Referer": newUrl }, mediaInfo, fallbackQ)));
    });

    if (tasks.length) { tasks.forEach(fn => fn()); return streams; }

    if (!bridgeUrl) {
        const dlHref = $("#download").attr("href") || $("a").filter((_, el) => { const h = $(el).attr("href") || ""; return h.includes("hubcloud.php") || h.includes("token") || h.includes("dl"); }).first().attr("href");
        if (dlHref && dlHref.startsWith("http")) bridgeUrl = dlHref;
    }
    if (!bridgeUrl) {
        const redir = $("a[href*=\"vcloud.zip\"]").filter((_, el) => { const h = $(el).attr("href") || ""; return !h.includes("/api/") && h !== newUrl && h.startsWith("https://"); }).first().attr("href");
        if (redir) return extractSingleVc(redir, referer, targetSeason, targetEp, label, fallbackQ, mediaInfo);
    }
    if (!bridgeUrl) return streams;
    if (!bridgeUrl.startsWith("http")) bridgeUrl = newUrl.split("/").slice(0, 3).join("/") + bridgeUrl;
    if (!bridgeUrl.startsWith("https://")) return streams;

    const $b = await fetchHtml(bridgeUrl, { headers: { "User-Agent": MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)], "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Referer": newUrl, "Cookie": "xla=s4t" } });
    if (!$b) return streams;
    const bHeader = $b("div.card-header").text() || "", bm = bHeader.match(/(2160|1080|720|480|1440)\s*P/i), bQ = bm ? bm[1] + "p" : /4K|UHD/i.test(bHeader) ? "2160p" : /1440|2K/i.test(bHeader) ? "1440p" : "HD";
    const bVar = $b.html().match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
    if (bVar && bVar[1] && bVar[1].includes(".workers.dev") && bVar[1].startsWith("https://"))
        tasks.push(() => streams.push(makeStream("Worker", (label || "Worker") + " [" + bHeader + "]", synced(bVar[1]), bQ, { "Referer": bridgeUrl }, mediaInfo, fallbackQ)));

    $b("a.btn, a").each((_, el) => {
        const href = $b(el).attr("href") || "", text = ($b(el).text() || "").trim(), lt = text.toLowerCase();
        if (!href || href === "#" || !href.startsWith("https://") || href.toLowerCase().includes(".zip") || skipBtn(lt)) return;
        if (lt.includes("fslv2")) tasks.push(() => streams.push(makeStream("FSLv2", (label || text) + " [" + bHeader + "]", href, bQ, { "Referer": bridgeUrl }, mediaInfo, fallbackQ)));
        else if (lt.includes("fsl")) tasks.push(() => streams.push(makeStream("FSL", (label || text) + " [" + bHeader + "]", synced(href), quality, { "Referer": bridgeUrl }, mediaInfo, fallbackQ)));
    });

    if (!tasks.length) {
        const fsl = $b("#fsl").attr("href");
        if (fsl && fsl.startsWith("https://")) tasks.push(() => streams.push(makeStream("FSL", (label || "FSL") + " [" + headerText + "]", synced(fsl), quality, { "Referer": bridgeUrl }, mediaInfo, fallbackQ)));
    }
    tasks.forEach(fn => fn());
    return streams;
}

async function loadStreamsFromUrl(url, label, quality, referer, targetSeason, targetEp, mediaInfo) {
    if (!url || !url.startsWith("https://")) return [];
    const lower = url.toLowerCase();
    if (lower.includes("vcloud") || lower.includes("hubcloud")) return extractSingleVc(url, referer || url, targetSeason, targetEp, label, quality, mediaInfo);
    if (!lower.includes("nexdrive") && !lower.includes("genxfm") && !lower.includes("fastdl")) return [];

    const $ = await fetchHtml(url, { headers: { "User-Agent": MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)], "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Referer": referer || BASE_URL + "/" }, redirect: "manual" });
    if (!$) return [];
    const streams = [], tasks = [];

    $("a[href*=\"vcloud\"], a[href*=\"hubcloud\"]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href || !href.startsWith("https://")) return;
        if (href.includes("/api/index.php?link=")) {
            tasks.push(async () => {
                const $a = await fetchHtml(href, { headers: { "User-Agent": MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)], "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Referer": url }, redirect: "manual" });
                if (!$a) return [];
                const rv = $a("a.btn-success, a.btn").attr("href");
                return (rv && rv.startsWith("https://")) ? extractSingleVc(rv, href, targetSeason, targetEp, label, quality, mediaInfo) : [];
            });
        } else tasks.push(() => extractSingleVc(href, url, targetSeason, targetEp, label, quality, mediaInfo));
    });

    if (targetEp != null) {
        const pi = targetEp - 1;
        if (pi >= 0 && pi < tasks.length) { try { const r = await tasks[pi](); if (r && r.length) { r.forEach(s => s && s.url && streams.push(s)); return streams; } } catch (e) { } }
        for (let i = 0; i < tasks.length; i += 5) {
            if (i === Math.floor(pi / 5) * 5) continue;
            const res = await Promise.all(tasks.slice(i, i + 5).map(fn => fn().catch(() => [])));
            let found = false;
            res.forEach(r => { if (r && r.length) { r.forEach(s => s && s.url && streams.push(s)); found = true; } });
            if (found) break;
        }
    } else {
        for (let i = 0; i < tasks.length; i += 5) {
            const res = await Promise.all(tasks.slice(i, i + 5).map(fn => fn().catch(() => [])));
            res.forEach(r => Array.isArray(r) && r.forEach(s => s && s.url && streams.push(s)));
        }
    }
    return streams;
}

async function extractFromPost(post, label, isTv, targetSeason, targetEp, mediaYear) {
    try {
        let html = post.html, seasonLabel = "";
        if (isTv && targetSeason != null) { html = extractSeasonFromContent(html, targetSeason) || html; seasonLabel = " S" + targetSeason + (targetEp ? "E" + targetEp : ""); }
        const mediaInfo = (seasonLabel.trim() || mediaYear || "").trim();
        const links = extractNexdriveLinks(html).slice(0, 15);
        if (!links.length) return [];
        const results = await Promise.all(links.map(l => loadStreamsFromUrl(l.href, l.label || (seasonLabel + "[" + l.quality + "]"), l.quality, BASE_URL + "/", targetSeason, targetEp, mediaInfo).catch(() => [])));
        return results.flat();
    } catch (e) { return []; }
}

const useHicine = () => {
    try {
        const v = (typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS) ? SCRAPER_SETTINGS.use_hicine : false;
        return v === true || v === "true";
    } catch (e) { return false; }
};

const hiFetchJson = url => fetchJson(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json, text/plain, */*" } });

const hiQuality = text => {
    const m = String(text || "").match(/\b(2160p|1440p|1080p|720p|480p|360p)\b/i) || String(text || "").match(/\b4k\b/i);
    if (!m) return "";
    const q = m[1] ? m[1].toLowerCase() : "4k";
    return q === "4k" ? "2160p" : q;
};
const hiAllowedQ = q => q === "2160p" || q === "1080p";
const hiSize = text => { const m = String(text || "").match(/([\d.]+)\s*(GB|MB)/i); return m ? m[1] + m[2].toUpperCase() : ""; };
const hiLang = text => {
    const s = String(text || "").toLowerCase();
    return ["hindi", "punjabi", "urdu", "tamil", "telugu", "marathi", "kannada", "malayalam", "bengali", "gujarati", "english", "korean", "japanese", "chinese", "spanish", "arabic"].filter(l => s.includes(l)).join("-");
};
const hiLangLabel = lang => lang ? lang.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("-") : "";
const hiLangTier = lang => !lang ? 3 : lang.includes("hindi") ? 0 : (lang.includes("punjabi") || lang.includes("urdu")) ? 1 : lang.includes("english") ? 4 : 2;

function hiQueryParam(url, key) {
    const qi = url.indexOf("?");
    if (qi < 0) return null;
    for (const pair of url.slice(qi + 1).split("&")) {
        const kv = pair.split("=");
        if (decodeURIComponent(kv[0]) === key) return decodeURIComponent(kv.slice(1).join("="));
    }
    return null;
}

async function hiSearch(query) {
    const norm = t => String(t || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
    const words = query.toLowerCase().split(/[^a-z0-9]+/i).filter(w => w.length > 1);
    const fetchQ = async t => {
        const d = await hiFetchJson(`${API_BASE}/api/search/${encodeURIComponent(t)}`);
        return (d && Array.isArray(d.data)) ? d.data : (Array.isArray(d) ? d : []);
    };
    const items = await fetchQ(query);
    if (items.length < 3 && words.length > 1) {
        const variants = [words.join("-"), words.join(" ")];
        words.slice().sort((a, b) => b.length - a.length).slice(0, 2).forEach(w => { if (w.length > 2) variants.push(w); });
        const unique = variants.filter((v, i, a) => v !== query && a.indexOf(v) === i);
        const extra = await Promise.all(unique.map(fetchQ));
        for (const list of extra) for (const rec of list) {
            const t = norm(rec && (rec.title || rec.name));
            if (words.every(w => t.includes(norm(w)))) items.push(rec);
        }
    }
    return items;
}

async function hiFindId(title, year, mediaType) {
    if (!title) return null;
    const results = await hiSearch(title);
    const wantSeries = mediaType === "tv";
    const normalize = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const normTitle = normalize(title);
    for (const rec of results) {
        if (!rec || !rec.record_id) continue;
        const recTitle = normalize(rec.title || rec.name || "");
        if (recTitle !== normTitle && !recTitle.includes(normTitle) && !normTitle.includes(recTitle)) continue;
        const cats = String(rec.categories || "").toLowerCase();
        const recIsMovie = !cats.includes("series") && !cats.includes("anime");
        if (!wantSeries && !recIsMovie) continue;
        if (wantSeries && recIsMovie) continue;
        const recYear = (String(rec.title || "").match(/\((19\d{2}|20\d{2})\)/) || [])[1] || String(rec.date || "").slice(0, 4);
        if (year && recYear && Math.abs(parseInt(recYear) - parseInt(year)) > 1) continue;
        return { id: rec.record_id, categories: rec.categories || "" };
    }
    return null;
}

function hiCollection(categories, mediaType) {
    const cats = String(categories || "").toLowerCase();
    if (cats.includes("bollywood") && cats.includes("series")) return "bollywood_series";
    if (cats.includes("bollywood")) return "bollywood_movies";
    if (cats.includes("anime")) return "anime";
    return mediaType === "tv" ? "hollywood_series" : "hollywood_movies";
}

async function hiPixelDirect(goUrl) {
    try {
        const r = await fetch(goUrl, { headers: { "User-Agent": USER_AGENT, "Range": "bytes=0-0" } });
        const m = (r.url || "").match(/^https?:\/\/(pixeldrain\.[a-z]+)\/(?:u|api\/file)\/([A-Za-z0-9]+)/);
        return m ? `https://${m[1]}/api/file/${m[2]}` : null;
    } catch (e) { return null; }
}

async function hiResolveWorker(workerUrl, quality, size, lang) {
    const qi = workerUrl.indexOf("?");
    if (qi < 0) return [];
    const base = workerUrl.slice(0, qi).replace(/\/+$/, "");
    const vcloud = hiQueryParam(workerUrl, "vcloud");
    if (!vcloud) return [];
    const data = await hiFetchJson(`${base}/api/links?vcloud=${encodeURIComponent(vcloud)}`);
    const tokens = data && data.tokens;
    if (!tokens || !Object.keys(tokens).length) return [];

    const order = ["fsl", "server1", "fsl2", "pixel"];
    const keys = Object.keys(tokens).filter(k => order.includes(k)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const out = [];
    for (const k of keys) {
        const tk = tokens[k] || {};
        if (!tk.ts || !tk.sig) continue;
        let finalUrl = `${base}/go?type=${encodeURIComponent(k)}&vcloud=${encodeURIComponent(vcloud)}&ts=${encodeURIComponent(tk.ts)}&sig=${encodeURIComponent(tk.sig)}`;
        if (k === "pixel") {
            const direct = await hiPixelDirect(finalUrl);
            if (!direct) continue;
            finalUrl = direct;
        }
        out.push({ url: finalUrl, quality, size, lang });
    }
    return out;
}

const hiResolveSafe = (u, q, s, l) => hiResolveWorker(u, q, s, l).catch(() => []);

function hiParseMovieLinks(field) {
    const out = [];
    String(field || "").split(/\r?\n/).forEach(line => {
        const m = line.match(/https?:\/\/[^\s,]+/);
        if (!m) return;
        const q = hiQuality(line) || "auto";
        if (q !== "auto" && !hiAllowedQ(q)) return;
        out.push({ workerUrl: m[0], quality: q, size: hiSize(line), lang: hiLang(line) });
    });
    return out;
}

function hiParseEpisodes(seasonText) {
    const out = [];
    const decoded = String(seasonText || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ");
    decoded.split(/\r?\n/).forEach(line => {
        const m = line.match(/episode\s*(\d+)\s*[:\-]?\s*(.*)/i);
        if (!m) return;
        const rest = m[2] || "", variants = [];
        const re = /(https?:\/\/[^\s,]+?)\s*,\s*,?\s*([^:]*?)(?=\s*:|$)/g;
        let hit;
        while ((hit = re.exec(rest)) !== null) {
            const label = hit[2].trim(), q = hiQuality(label) || label || "auto";
            if (q !== "auto" && !hiAllowedQ(q)) continue;
            variants.push({ url: hit[1], quality: q });
        }
        if (!variants.length) (rest.match(/https?:\/\/[^\s,]+/g) || []).forEach(u => variants.push({ url: u, quality: "auto" }));
        if (variants.length) out.push({ num: parseInt(m[1], 10), variants });
    });
    return out;
}

async function getHicineStreams(title, year, mediaType, season, episode, mediaInfo) {
    const match = await hiFindId(title, year, mediaType);
    if (!match) return [];
    const det = await hiFetchJson(`${API_BASE}/api/${hiCollection(match.categories, mediaType)}/${match.id}`);
    if (!det || det.error) return [];

    let targets = [];
    if (mediaType === "tv") {
        const seasonText = det["season_" + season] || "";
        const ep = hiParseEpisodes(seasonText).find(e => e.num === Number(episode));
        if (!ep) return [];
        const seasonLang = hiLang((seasonText.split(/\r?\n/)[0]) || "");
        ep.variants.forEach(v => targets.push({ workerUrl: v.url, quality: v.quality, size: "", lang: seasonLang }));
    } else {
        hiParseMovieLinks(det.links).forEach(l => targets.push(l));
    }
    if (!targets.length) return [];

    const qRank = { "2160p": 5, "1080p": 3 };
    targets.sort((a, b) => (hiLangTier(a.lang || "") - hiLangTier(b.lang || "")) || ((qRank[b.quality] || 0) - (qRank[a.quality] || 0)));

    const results = new Array(targets.length);
    let cursor = 0;
    const runner = async () => {
        while (cursor < targets.length) {
            const idx = cursor++, t = targets[idx];
            results[idx] = await hiResolveSafe(t.workerUrl, t.quality, t.size, t.lang);
        }
    };
    await Promise.all(Array.from({ length: Math.min(2, targets.length) }, runner));

    const raws = dedupe(results.flat().filter(Boolean));
    return dedupeBySize(raws.map(r => {
        const t = [hiLangLabel(r.lang), r.quality, r.size ? "[" + r.size + "]" : ""].filter(Boolean).join(" ");
        return makeStream("HiCine", t, r.url, r.quality, { "User-Agent": USER_AGENT }, mediaInfo, "HD");
    }).filter(Boolean));
}

async function onSettings() {
    return [
        { type: "header", label: "Optional" },
        { type: "toggle", key: "use_hicine", label: "Use HiCine", defaultValue: false, description: "Disabled [Default]: resolve from VegaMovies.\nEnabled: Resolve though HiCine instead" }
    ];
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];
        const isTv = mediaType === "tv";
        const media = await getTMDBInfo(tmdbId, mediaType);
        const { title: mediaTitle, year: mediaYear, imdbId, altTitles = [] } = media;

        if (useHicine()) {
            const info = isTv ? ("S" + Number(season) + "E" + Number(episode)) : (mediaYear || "");
            return await getHicineStreams(mediaTitle, mediaYear, mediaType, isTv ? Number(season) : null, isTv ? Number(episode) : null, info);
        }

        let results = [];
        if (imdbId && imdbId.startsWith("tt")) results = await searchByTitle(imdbId, null);
        if (!results.length || !results.some(r => r.imdbId === imdbId)) {
            let q = mediaTitle + (isTv && season != null ? " season " + Number(season) : mediaYear ? " " + mediaYear : "");
            results = await searchByTitle(q, mediaYear);
            if (!results.length && isTv && season != null) results = await searchByTitle(mediaTitle, mediaYear);
        }
        if (!results.length) return [];

        let best = null;
        const targetImdb = imdbId && imdbId.startsWith("tt") ? imdbId : null;
        for (const r of results) {
            if (targetImdb && r.imdbId === targetImdb) {
                if (!isTv || season == null) { best = r; break; }
                const range = /(?:s|season|staffel|saison)\s*0*(\d+)\s*(?:-|–|to|and|&|&#)\s*0*(\d+)\b/i.exec(r.title);
                const inRange = range && parseInt(season) >= parseInt(range[1]) && parseInt(season) <= parseInt(range[2]);
                if (inRange || new RegExp("(?:s|season|staffel|saison)\\s*0*" + Number(season) + "\\b", "i").test(r.title)) { best = r; break; }
            }
            if (!best && isStrictMatch(mediaTitle, mediaYear, r.title, r.year, altTitles)) best = r;
        }
        if (!best || !best.postId) return [];

        const post = await fetchPostContent(best.postId, best.permalink);
        if (!post) return [];

        const streams = await extractFromPost(post, post.title || best.title, isTv, season != null ? Number(season) : null, episode != null ? Number(episode) : null, mediaYear);
        const seen = new Set();
        return dedupeBySize(streams.filter(s => s && s.url && !seen.has(s.url) && seen.add(s.url)).filter(isHubVc));
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams, onSettings };