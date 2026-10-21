"use strict";

const BASE_URL = "https://www.cinecalidad.am";
const TMDB_API = "https://api.themoviedb.org/3";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

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
    let inv = Math.max(0, maxScore - (parseInt(score, 10) || 0));
    let bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    const chars = [];
    for (let i = 0; i < bin.length; i++) {
        chars.push(bin.charAt(i) === "1" ? "\uFEFF" : "\u200B");
    }
    return chars.join("");
}

function decodeZopass(encoded) {
    if (!encoded) return null;
    try { return atob(encoded); } catch { return null; }
}

function normalizeTitle(raw) {
    if (!raw) return "";
    return raw
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreSlugMatch(candidateUrl, titleVariants, releaseYear) {
    if (!candidateUrl) return 0;
    const slug = candidateUrl.replace(/\/$/, "").split("/").pop().toLowerCase().replace(/-/g, " ");
    let score = 0;

    for (let i = 0; i < titleVariants.length; i++) {
        const normalized = normalizeTitle(titleVariants[i]);
        if (!normalized) continue;

        if (slug === normalized) { score = Math.max(score, 100); continue; }

        const keywords = normalized.split(/\s+/).filter(w => w.length > 2);
        let hits = 0;
        for (let j = 0; j < keywords.length; j++) {
            if (slug.indexOf(keywords[j]) !== -1) hits++;
        }
        if (keywords.length > 0 && hits > 0) {
            score = Math.max(score, (hits / keywords.length) * 80);
        }
    }

    if (score > 0 && releaseYear && slug.indexOf(String(releaseYear)) !== -1) score += 15;
    return score;
}

function extractPackedScript(html) {
    try {
        const pat = /eval\(function\(p,a,c,k,e,[r|d]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        const m = html.match(pat);
        if (!m) return null;

        const payload = m[1].slice(1, -1);
        const radix = parseInt(m[2], 10);
        const dictionary = m[4].split("|");

        const fromBase = (val, base) => {
            const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            if (base <= 36) return parseInt(val, base);
            let n = 0;
            for (let i = 0; i < val.length; i++) n = n * base + chars.indexOf(val[i]);
            return n;
        };

        return payload.replace(/\b[0-9a-zA-Z]+\b/g, token => {
            const idx = fromBase(token, radix);
            return dictionary[idx] !== undefined && dictionary[idx] !== "" ? dictionary[idx] : token;
        });
    } catch {
        return null;
    }
}

function detectQualityFromUrl(url) {
    if (!url) return null;
    const u = url.toLowerCase();
    if (/4k|2160p?/i.test(u)) return "4K";
    if (/1080p?/i.test(u)) return "1080p";
    if (/720p?/i.test(u)) return "720p";
    if (/480p?/i.test(u)) return "480p";
    return null;
}

async function resolveM3u8Quality(m3u8Url, requestHeaders) {
    const fast = detectQualityFromUrl(m3u8Url);
    if (fast) return fast;
    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return "720p";

    try {
        const res = await fetch(m3u8Url, { headers: requestHeaders || { "User-Agent": USER_AGENT } });
        if (!res.ok) return "720p";
        const text = await res.text();

        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
            return /1080/i.test(m3u8Url) ? "1080p" : "720p";
        }

        let maxHeight = 0;
        const resRe = /RESOLUTION=\d+x(\d+)/gi;
        let rm;
        while ((rm = resRe.exec(text)) !== null) {
            const h = parseInt(rm[1], 10);
            if (h > maxHeight) maxHeight = h;
        }

        if (maxHeight >= 2160) return "4K";
        if (maxHeight >= 1080) return "1080p";
        if (maxHeight >= 720) return "720p";
        if (maxHeight >= 480) return "480p";
        return "720p";
    } catch {
        return "720p";
    }
}

function extractStreamLabel(streamUrl) {
    try {
        const host = (streamUrl.match(/^https?:\/\/([^/]+)/i) || [])[1] || "";
        if (/^cdn[-.]/.test(host)) return "CDN";
        const stripped = host.replace(/^www\./, "");
        const parts = stripped.split(".");
        const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
        return sld.charAt(0).toUpperCase() + sld.slice(1);
    } catch {
        return "Stream";
    }
}

function extractM3u8FromHtml(html, unpacked) {
    const directPatterns = [
        /(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
        /["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i,
    ];
    for (const pat of directPatterns) {
        const m = html.match(pat);
        if (m) return m[1].replace(/\\/g, "");
    }
    if (unpacked) {
        const m = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i)
            || unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (m) return (m[1] || m[0]).replace(/\\/g, "");
    }
    return null;
}

async function resolveVimeos(embedUrl) {
    try {
        const referer = "https://vimeos.net/";
        const res = await fetch(embedUrl, { headers: { "User-Agent": USER_AGENT, "Referer": referer } });
        const html = await res.text();
        const unpacked = extractPackedScript(html);
        const streamUrl = extractM3u8FromHtml(html, unpacked);
        if (!streamUrl) return null;

        const headers = { "User-Agent": USER_AGENT, "Referer": referer };
        const quality = await resolveM3u8Quality(streamUrl, headers);
        return { url: streamUrl, quality: quality || "720p", headers };
    } catch {
        return null;
    }
}

async function resolveStreamWish(embedUrl) {
    try {
        const id = embedUrl.replace(/\/$/, "").split("/").pop();
        const targetUrl = "https://hlswish.com/e/" + id;
        const res = await fetch(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } });
        const html = await res.text();
        const unpacked = extractPackedScript(html);
        const streamUrl = extractM3u8FromHtml(html, unpacked);
        if (!streamUrl) return null;

        const headers = { "User-Agent": USER_AGENT, "Referer": targetUrl };
        const quality = await resolveM3u8Quality(streamUrl, headers);
        return { url: streamUrl, quality: quality || "720p", headers };
    } catch {
        return null;
    }
}

async function resolveFilemoon(embedUrl) {
    try {
        const res = await fetch(embedUrl, { headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } });
        const html = await res.text();
        const unpacked = extractPackedScript(html);
        const streamUrl = extractM3u8FromHtml(html, unpacked);
        if (!streamUrl) return null;

        const headers = { "User-Agent": USER_AGENT, "Referer": embedUrl };
        const quality = await resolveM3u8Quality(streamUrl, headers);
        return { url: streamUrl, quality: quality || "720p", headers };
    } catch {
        return null;
    }
}

async function resolveVideoApp(embedUrl) {
    try {
        const res = await fetch(embedUrl, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" } });
        const html = await res.text();
        const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)
            || html.match(/src=["'](https?:\/\/[^"']+)["']/i);
        if (!iframeMatch || !iframeMatch[1]) return null;

        const inner = iframeMatch[1].toLowerCase();
        const rawInner = iframeMatch[1];
        if (inner.indexOf("goodstream") !== -1) return null;
        if (inner.indexOf("vimeos") !== -1) return resolveVimeos(rawInner);
        if (inner.indexOf("streamwish") !== -1 || inner.indexOf("hlswish") !== -1) return resolveStreamWish(rawInner);
        if (inner.indexOf("filemoon") !== -1) return resolveFilemoon(rawInner);
        return null;
    } catch {
        return null;
    }
}

async function resolveEmbed(embedUrl) {
    const u = embedUrl.toLowerCase();
    if (u.indexOf("goodstream") !== -1) return null;
    if (u.indexOf("vimeos") !== -1) return resolveVimeos(embedUrl);
    if (u.indexOf("streamwish") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("hlswish") !== -1) return resolveStreamWish(embedUrl);
    if (u.indexOf("videoapp") !== -1) return resolveVideoApp(embedUrl);
    if (u.indexOf("filemoon") !== -1) return resolveFilemoon(embedUrl);
    return null;
}

async function fetchTmdbMeta(tmdbId, mediaType) {
    try {
        const endpoint = mediaType === "tv" ? "tv" : "movie";
        const res = await fetch(`${TMDB_API}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX&append_to_response=alternative_titles`);
        if (!res.ok) return null;
        const data = await res.json();

        const seen = new Set();
        const raw = [data.title, data.name, data.original_title, data.original_name];
        const altArr = (data.alternative_titles && (data.alternative_titles.results || data.alternative_titles.titles)) || [];
        for (let i = 0; i < altArr.length; i++) { if (altArr[i].title) raw.push(altArr[i].title); }

        const titles = raw.filter(t => {
            if (!t || seen.has(t)) return false;
            seen.add(t);
            return true;
        });
        return {
            titles,
            year: (data.release_date || data.first_air_date || "").substring(0, 4),
        };
    } catch {
        return null;
    }
}

async function querySiteSearch(query, isTv) {
    if (!query) return [];
    try {
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
        const res = await fetch(searchUrl, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" } });
        if (!res.ok) return [];
        const html = await res.text();

        const pattern = isTv
            ? /href=["']((?:https?:\/\/[^"']*)?\/(?:ver-serie|serie)\/[^"']+)["']/gi
            : /href=["']((?:https?:\/\/[^"']*)?\/(?:ver-pelicula|pelicula)\/[^"']+)["']/gi;

        const seen = new Set();
        const results = [];
        let m;
        while ((m = pattern.exec(html)) !== null) {
            let url = m[1];
            if (!url.startsWith("http")) url = BASE_URL + (url.startsWith("/") ? url : "/" + url);
            if (!seen.has(url)) { seen.add(url); results.push(url); }
        }
        return results;
    } catch {
        return [];
    }
}

async function findFirstSearchResults(queries, isTv) {
    for (let i = 0; i < queries.length; i++) {
        const results = await querySiteSearch(queries[i], isTv);
        if (results.length > 0) return results;
    }
    return [];
}

async function extractEmbedUrls(pageUrl) {
    try {
        const res = await fetch(pageUrl, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" } });
        if (res.status !== 200) return [];
        const html = await res.text();
        if (!html) return [];

        const seen = new Set();
        const embeds = [];
        const optRe = /(?:data-option|data-url|data-src)=["']([^"']+)["']/gi;
        let m;

        while ((m = optRe.exec(html)) !== null) {
            const val = m[1];
            if (val.indexOf("zopass=") !== -1) {
                const encoded = val.split("zopass=")[1].split("&")[0];
                const decoded = decodeZopass(encoded);
                if (decoded && decoded.startsWith("http") && decoded.indexOf("goodstream") === -1 && !seen.has(decoded)) {
                    seen.add(decoded);
                    embeds.push(decoded);
                }
            } else if (val.startsWith("http") && val.indexOf("youtube.com") === -1 && val.indexOf("goodstream") === -1 && !seen.has(val)) {
                seen.add(val);
                embeds.push(val);
            }
        }

        const linkRe = /href=["'](https?:\/\/[^"']*(?:vimeos|hlswish|streamwish|filemoon|videoapp)[^"']*)["']/gi;
        while ((m = linkRe.exec(html)) !== null) {
            if (!seen.has(m[1])) { seen.add(m[1]); embeds.push(m[1]); }
        }

        return embeds;
    } catch {
        return [];
    }
}

async function resolveEpisodeUrl(seriesPageUrl, season, episode) {
    try {
        const res = await fetch(seriesPageUrl, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" } });
        const html = await res.text();
        const s = parseInt(season, 10);
        const e = parseInt(episode, 10);
        const ePadded = String(e).padStart(2, "0");

        const epPat = new RegExp(
            'href=["\']((?:https?:\\/\\/[^"\']*)?\\/(?:ver-el-episodio|episodio)\\/[^"\']*(?:-' + s + 'x' + e +
            '|-s' + s + 'e' + e + '|-s' + s + 'e' + ePadded + '|-' + s + 'x' + ePadded + ')[^"\']*)["\']',
            'i'
        );
        const match = html.match(epPat);
        if (match && match[1]) {
            const found = match[1];
            return found.startsWith("http") ? found : BASE_URL + (found.startsWith("/") ? found : "/" + found);
        }
    } catch {
    }
    const slug = seriesPageUrl.replace(/\/$/, "").split("/").pop();
    return `${BASE_URL}/ver-el-episodio/${slug}-${parseInt(season, 10)}x${parseInt(episode, 10)}/`;
}

function buildSearchQueries(titles) {
    const seen = new Set();
    const queries = [];

    for (let i = 0; i < titles.length; i++) {
        const raw = titles[i];
        const normalized = normalizeTitle(raw);
        if (normalized && !seen.has(normalized)) { seen.add(normalized); queries.push(normalized); }

        if (raw.indexOf("&") !== -1) {
            const withY = normalizeTitle(raw.replace(/&/g, " y "));
            if (withY && !seen.has(withY)) { seen.add(withY); queries.push(withY); }
        }

        const shortForm = normalizeTitle(raw.split(/[:\-\(]/)[0]);
        if (shortForm && !seen.has(shortForm)) { seen.add(shortForm); queries.push(shortForm); }
    }
    return queries;
}

async function resolveCandidate(candidateUrl, isTv, season, episode) {
    const targetPage = isTv
        ? await resolveEpisodeUrl(candidateUrl, season, episode)
        : candidateUrl;

    const embedUrls = await extractEmbedUrls(targetPage);
    if (!embedUrls.length) return [];

    const settled = await Promise.allSettled(embedUrls.map(url => resolveEmbed(url)));
    const streams = [];

    for (let i = 0; i < settled.length; i++) {
        if (settled[i].status !== "fulfilled") continue;
        const stream = settled[i].value;
        if (!stream || !stream.url) continue;

        const label = extractStreamLabel(stream.url);
        const quality = stream.quality || "720p";
        streams.push({
            name: `CineCalidad \u2022 ${label}`,
            title: `CineCalidad \u2022 ${label} \u2022 ${quality}`,
            url: stream.url,
            quality,
            headers: stream.headers || { "User-Agent": USER_AGENT, "Referer": embedUrls[i] },
        });
    }
    return streams;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    if (!tmdbId) return [];
    if (mediaType === "tv" && (season == null || episode == null)) return [];

    try {
        const isTv = mediaType === "tv";
        const meta = await fetchTmdbMeta(tmdbId, mediaType);
        if (!meta || !meta.titles || !meta.titles.length) return [];

        const queries = buildSearchQueries(meta.titles);
        const candidateUrls = await findFirstSearchResults(queries, isTv);
        if (!candidateUrls.length) return [];

        const scored = candidateUrls
            .map(url => ({ url, score: scoreSlugMatch(url, meta.titles, meta.year) }))
            .filter(c => c.score >= 35)
            .sort((a, b) => b.score - a.score);

        if (!scored.length) return [];

        for (let i = 0; i < scored.length; i++) {
            const rawStreams = await resolveCandidate(scored[i].url, isTv, season, episode);
            if (!rawStreams.length) continue;

            const seen = new Set();
            let streams = rawStreams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
            streams.sort((a, b) => resWeight(b.quality) - resWeight(a.quality));

            const total = streams.length;
            streams = streams.map((s, j) => {
                const tag = getInvertedSortTag(total - j, total + 1);
                return Object.assign({}, s, { name: tag + s.name, title: tag + s.title });
            });
            return streams;
        }
        return [];
    } catch {
        return [];
    }
}

module.exports = { getStreams };
