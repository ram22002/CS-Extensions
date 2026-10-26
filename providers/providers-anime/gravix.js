const cheerio = require("cheerio");
const BASE_URL = "https://watchanimeworld.one";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": BASE_URL + "/"
};

async function getText(url, extra) {
    try {
        const res = await fetch(url, { headers: Object.assign({}, HEADERS, extra || {}) });
        if (!res.ok) return "";
        return await res.text();
    } catch {
        return "";
    }
}

function normalize(str) {
    return String(str || "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function similarity(a, b) {
    const x = normalize(a);
    const y = normalize(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.includes(y) || y.includes(x)) return 0.85;
    const wx = new Set(x.split(" "));
    const wy = new Set(y.split(" "));
    let hit = 0;
    for (const w of wx) if (wy.has(w)) hit++;
    const union = new Set([...wx, ...wy]).size;
    return union ? hit / union : 0;
}

function isFullHd(...values) {
    const text = values.filter(Boolean).join(" ");
    if (!text) return true;
    const m = text.match(/(\d{3,4})\s*p/i);
    if (m) return m[1] === "1080";
    return !/4k|uhd|2160/i.test(text);
}

async function getAnimeInfo(id, isSeries) {
    try {
        const bridge = (typeof globalThis !== "undefined" && (globalThis.NextGenNative || globalThis.EclipsiaNative)) || null;
        const callArgs = bridge ? JSON.parse(bridge.getCallArgs() || "{}") : {};
        if (callArgs.title || callArgs.showTitle) {
            return {
                title: callArgs.title || callArgs.showTitle || "",
                originalTitle: callArgs.romajiTitle || "",
                baseTitle: callArgs.baseTitle || ""
            };
        }
        const aniData = await fetch(`https://api.ani.zip/mappings?anilist_id=${id}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
        }).then(r => r.json()).catch(() => null);
        if (aniData?.titles) {
            return {
                title: aniData.titles.en || aniData.titles['x-jat'] || "",
                originalTitle: aniData.titles.ja || aniData.titles['x-jat'] || "",
                baseTitle: aniData.titles.en || ""
            };
        }
        return null;
    } catch {
        return null;
    }
}

async function searchSite(info, isSeries) {
    const titlesToTry = [
        info.baseTitle,
        info.title,
        info.originalTitle
    ].filter(Boolean);

    const want = isSeries ? "/series/" : "/movies/";
    const seen = new Set();
    const found = [];

    const add = (href, title) => {
        if (!href || !href.includes(want) || seen.has(href)) return;
        seen.add(href);
        const sim = Math.max(
            similarity(info.title, title),
            info.baseTitle ? similarity(info.baseTitle, title) : 0,
            info.originalTitle ? similarity(info.originalTitle, title) : 0
        );
        found.push({ href, sim });
    };

    for (const searchTitle of titlesToTry) {
        const html = await getText(`${BASE_URL}/?s=${encodeURIComponent(searchTitle)}`);
        if (!html) continue;
        const $ = cheerio.load(html);

        $("article, .result-item, div.item, .search-post").each((_, el) => {
            const a = $(el).find("a").first();
            const title = $(el).find(".title, h2, h3, .entry-title").text().trim() || a.attr("title") || a.text().trim();
            add(a.attr("href"), title);
        });

        if (!found.length) {
            $("a[href]").each((_, el) => {
                const href = $(el).attr("href") || "";
                const m = href.match(/^https?:\/\/[^/]+\/(?:series|movies)\/([^/]+)\//);
                if (!m || m[1] === "page") return;
                add(href, $(el).attr("title") || $(el).text().trim() || m[1].replace(/-/g, " "));
            });
        }

        if (found.length) break;
    }

    const good = found.filter((c) => c.sim >= 0.5);
    return (good.length ? good : found).sort((a, b) => b.sim - a.sim).slice(0, 2).map((c) => c.href);
}

function findEpisodeUrl($, season, episode) {
    const links = [];
    $('a[href*="/episode/"]').each((_, el) => {
        links.push({ href: $(el).attr("href"), text: $(el).text().trim() });
    });
    const patterns = [
        new RegExp(`(^|[^0-9])${season}x0?${episode}(?![0-9])`, "i"),
        new RegExp(`s0?${season}[-_ ]?e0?${episode}(?![0-9])`, "i"),
        new RegExp(`season[-_\\s]*${season}[-_\\s]*episode[-_\\s]*${episode}(?![0-9])`, "i")
    ];
    for (const re of patterns) {
        const hit = links.find((l) => re.test(l.href || "") || re.test(l.text));
        if (hit) return hit.href;
    }
    return null;
}

async function resolveEpisode(seriesUrl, season, episode) {
    const html = await getText(seriesUrl);
    if (!html) return null;
    const $ = cheerio.load(html);

    const direct = findEpisodeUrl($, season, episode);
    if (direct) return direct;

    const postId =
        (($("body").attr("class") || "").match(/postid-(\d+)/) || [])[1] ||
        $("[data-post]").first().attr("data-post");
    if (!postId) return null;

    const ajax = await getText(
        `${BASE_URL}/wp-admin/admin-ajax.php?action=action_select_season&season=${season}&post=${postId}`,
        { Referer: seriesUrl }
    );
    if (!ajax) return null;
    return findEpisodeUrl(cheerio.load(ajax), season, episode);
}

async function findEpisodePage(candidates, season, episode) {
    for (const url of candidates) {
        let ep = await resolveEpisode(url, season, episode);
        if (!ep && season !== 1) ep = await resolveEpisode(url, 1, episode);
        if (ep) return ep;
    }
    return null;
}

async function extractZephyrix(playerUrl, referer) {
    try {
        const m = playerUrl.match(/^(https?:\/\/[^/]+)\/video\/([a-f0-9]+)/i);
        if (!m) return null;
        const origin = m[1];
        const hash = m[2];

        let cookie = "";
        try {
            const pr = await fetch(playerUrl, { headers: Object.assign({}, HEADERS, { Referer: referer }) });
            cookie = (pr.headers.get("set-cookie") || "")
                .split(/,(?=[^;]+=[^;]+)/)
                .map((c) => c.trim().split(";")[0])
                .filter(Boolean)
                .join("; ");
        } catch { }
        const cookieHeader = cookie ? { Cookie: cookie } : {};

        const res = await fetch(`${origin}/player/index.php?data=${hash}&do=getVideo`, {
            method: "POST",
            headers: Object.assign({}, HEADERS, {
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": playerUrl,
                "Origin": origin,
                "X-Requested-With": "XMLHttpRequest"
            }, cookieHeader),
            body: `hash=${hash}&r=${encodeURIComponent(BASE_URL + "/")}`
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data) return null;

        const url = data.securedLink || data.videoSource || data.source || data.file;
        if (!url || typeof url !== "string") return null;

        const hm = url.match(/\/cdn\/hls\/([a-f0-9]+)\//);
        const contentHash = hm ? hm[1] : hash;
        return {
            url,
            headers: Object.assign({ "Referer": origin + "/", "Origin": origin, "User-Agent": USER_AGENT }, cookieHeader),
            subtitles: [{
                url: `${origin}/cdn/down/${contentHash}/Subtitle/subtitle_eng.srt`,
                language: "en",
                name: "English"
            }]
        };
    } catch {
        return null;
    }
}

async function decodeAbyss(url) {
    try {
        const cleanUrl = url.replace("https://short.icu", "https://player.abyssplayer.com");
        const reqHeaders = { "Referer": "https://playhydrax.com/", "User-Agent": USER_AGENT, "Origin": "https://playhydrax.com" };
        const html = await getText(cleanUrl, reqHeaders);
        const match = html.match(/const\s+datas\s*=\s*"([^"]*)"/);
        if (!match || !match[1]) return [];
        const res = await fetch("https://enc-dec.app/api/dec-abyss", {
            method: "POST",
            headers: Object.assign({}, reqHeaders, { "Content-Type": "application/json" }),
            body: JSON.stringify({ text: match[1] })
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data && data.result && data.result.sources) || [];
    } catch {
        return [];
    }
}

async function readDubPlayer(iframeUrl, referer) {
    try {
        const text = await getText(iframeUrl, { Referer: referer });
        const m = text.match(/var\s+CONFIG\s*=\s*({[\s\S]*?});/);
        if (!m) return [];
        const config = JSON.parse(m[1]);
        const prefix = config.prefix || "https://player.abyssplayer.com/";
        const out = [];
        for (const [key, code] of Object.entries(config.ready || {})) {
            if (code) out.push({ type: "abyss", url: prefix + code, lang: { hin: "Hindi", tam: "Tamil", tel: "Telugu", eng: "English", jpn: "Japanese" }[key] || key.toUpperCase() });
        }
        return out;
    } catch {
        return [];
    }
}

async function collectSources(pageUrl) {
    const html = await getText(pageUrl);
    if (!html) return [];
    const $ = cheerio.load(html);
    const sources = [];
    const dubTasks = [];
    let hasZephyrix = false;

    $("iframe").each((_, el) => {
        let src = $(el).attr("src") || $(el).attr("data-src");
        if (!src) return;
        if (src.startsWith("//")) src = "https:" + src;
        else if (src.startsWith("/")) src = BASE_URL + src;

        if (src.includes("dub-player")) {
            dubTasks.push(readDubPlayer(src, pageUrl));
        } else if (/play\.(?:zephyrix|zephyrflick)\./i.test(src)) {
            hasZephyrix = true;
            sources.push({ type: "zephyrix", url: src, lang: "Multi-Dub" });
        }
    });

    if (!hasZephyrix) {
        const loose = html.match(/https?:\/\/play\.(?:zephyrflick|zephyrix)\.[^/\s"']+\/video\/[a-f0-9]+/i);
        if (loose) sources.push({ type: "zephyrix", url: loose[0], lang: "Multi-Dub" });
    }

    const p1 = html.match(/player1\.php\?data=([a-zA-Z0-9+=/]+)/);
    if (p1) {
        try {
            const list = JSON.parse(atob(p1[1]));
            if (Array.isArray(list)) {
                for (const item of list) {
                    if (!item || !item.link) continue;
                    const abyss = item.link.includes("short.icu") || item.link.includes("abyssplayer");
                    sources.push({
                        type: abyss ? "abyss" : "direct",
                        url: item.link,
                        lang: item.language ? String(item.language) : "English"
                    });
                }
            }
        } catch { }
    }

    const dubs = await Promise.all(dubTasks);
    return sources.concat(...dubs);
}

function makeStream(lang, url, headers, subtitles) {
    const label = `AnimeWorld \u2022 ${lang}`;
    const stream = {
        name: label,
        title: label,
        url,
        quality: "1080p",
        headers,
        type: url.includes(".m3u8") ? "m3u8" : "mp4"
    };
    if (subtitles && subtitles.length) stream.subtitles = subtitles;
    return stream;
}

async function buildStreams(src, pageUrl) {
    const plain = { "Referer": BASE_URL + "/", "User-Agent": USER_AGENT };

    if (src.type === "zephyrix") {
        const z = await extractZephyrix(src.url, pageUrl);
        return z ? [makeStream(src.lang, z.url, z.headers, z.subtitles)] : [];
    }

    if (src.type === "abyss") {
        const decoded = await decodeAbyss(src.url);
        const out = [];
        for (const d of decoded) {
            if (!d || !d.url || !isFullHd(d.label, d.type, d.quality, d.res)) continue;
            out.push(makeStream(src.lang, d.url, { 
                "Referer": "https://playhydrax.com/", 
                "User-Agent": USER_AGENT 
            }));
        }
        return out;
    }

    return [makeStream(src.lang, src.url, plain)];
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const isSeries = mediaType === "tv";
        if (isSeries && (season == null || episode == null)) return [];

        const info = await getAnimeInfo(tmdbId, isSeries);
        if (!info || !info.title) return [];

        const candidates = await searchSite(info, isSeries);
        if (!candidates.length) return [];

        const pageUrl = isSeries
            ? await findEpisodePage(candidates, parseInt(season) || 1, parseInt(episode) || 1)
            : candidates[0];
        if (!pageUrl) return [];

        const sources = await collectSources(pageUrl);
        if (!sources.length) return [];

        const groups = await Promise.all(sources.map((s) => buildStreams(s, pageUrl).catch(() => [])));
        const seen = new Set();
        return [].concat(...groups).filter((s) => s.url && !seen.has(s.url) && seen.add(s.url));
    } catch {
        return [];
    }
}

module.exports = { getStreams };