const PROVIDER = "Anineko";
const BASE_URL = "https://anineko.es";
const TMDB_API = "https://api.themoviedb.org/3";
const ANIZIP_API = "https://api.ani.zip/mappings";
const API_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) ? TMDB_API_KEY : (typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY) ? globalThis.TMDB_API_KEY : "307b7b8ef035c6aa336900aef4e203bd";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": `${BASE_URL}/`,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function decodeBase64(str) {
    try {
        if (typeof atob === "function") return atob(str);
        if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8");
    } catch { }
    return "";
}

function padUtf8ToWordArray(str, byteLength) {
    if (typeof CryptoJS === "undefined") return null;
    const parsed = CryptoJS.enc.Utf8.parse(str);
    const sigBytes = parsed.sigBytes;
    const srcWords = parsed.words;
    const resultWords = [];
    for (let i = 0; i < byteLength; i += 4) {
        let word = 0;
        for (let j = 0; j < 4 && i + j < byteLength; j++) {
            const byteIdx = i + j;
            if (byteIdx < sigBytes) {
                const byte = (srcWords[Math.floor(byteIdx / 4)] >>> (24 - (byteIdx % 4) * 8)) & 0xff;
                word |= byte << (24 - j * 8);
            }
        }
        resultWords.push(word >>> 0);
    }
    return CryptoJS.lib.WordArray.create(resultWords, byteLength);
}

function decryptAesCbc(encryptedBase64) {
    try {
        let b64 = encryptedBase64.replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";

        if (typeof CryptoJS !== "undefined" && CryptoJS?.AES) {
            const key = padUtf8ToWordArray("i?LMTAx0Q6,:}50U", 32);
            const iv = padUtf8ToWordArray("W0;27ToaUpl_P%'c", 16);
            const cipherParams = CryptoJS.lib.CipherParams.create({
                ciphertext: CryptoJS.enc.Base64.parse(b64),
            });
            const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
                iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
            });
            return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
        }

        if (typeof require !== "undefined") {
            const c = require("crypto");
            function padKey(str, len) {
                const buf = Buffer.alloc(len, 0);
                Buffer.from(str, "utf8").copy(buf);
                return buf;
            }
            const key = padKey("i?LMTAx0Q6,:}50U", 32);
            const iv = padKey("W0;27ToaUpl_P%'c", 16);
            const decipher = c.createDecipheriv("aes-256-cbc", key, iv);
            decipher.setAutoPadding(true);
            let dec = decipher.update(Buffer.from(b64, "base64"));
            dec = Buffer.concat([dec, decipher.final()]);
            return JSON.parse(dec.toString("utf8"));
        }
    } catch { }
    return null;
}

function normalizeTitle(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
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

async function resolveMetadata(tmdbId, mediaType, season) {
    let titles = [];

    // 1. Check AniZip first (no ISP blocking)
    try {
        const aniData = await httpJson(`${ANIZIP_API}?themoviedb_id=${tmdbId}`);
        if (aniData?.titles) {
            if (aniData.titles.en) titles.push(aniData.titles.en);
            if (aniData.titles['x-jat']) titles.push(aniData.titles['x-jat']);
            if (aniData.titles.ja) titles.push(aniData.titles.ja);
        }
    } catch { }

    // 2. Query TMDb
    if (!titles.length) {
        try {
            const endpoint = mediaType === "tv" ? "tv" : "movie";
            const tmdbData = await httpJson(`${TMDB_API}/${endpoint}/${tmdbId}?api_key=${API_KEY}`);
            if (tmdbData) {
                const mainTitle = tmdbData.name || tmdbData.title || tmdbData.original_name || tmdbData.original_title;
                if (mainTitle) titles.push(mainTitle);
            }
        } catch { }
    }

    return titles.filter(Boolean);
}

function rankCandidates(candidates, queryTitle, targetSeason, isMovie) {
    if (!candidates || !candidates.length) return [];

    const normTarget = normalizeTitle(queryTitle);
    const targetWords = normTarget.split(" ").filter(w => w.length > 2);

    return candidates
        .map(c => {
            let score = 0;
            const normCand = normalizeTitle(c.title);
            const candWords = normCand.split(" ").filter(w => w.length > 2);

            // Word overlap
            for (const tw of targetWords) {
                if (candWords.includes(tw)) score += 15;
            }

            // Word count similarity
            score -= Math.abs(candWords.length - targetWords.length) * 3;

            if (isMovie) {
                if (normCand.includes("movie") || c.slug.includes("movie")) score += 30;
            } else {
                if (targetSeason && targetSeason > 1) {
                    const sNum = String(targetSeason);
                    const seasonPatterns = [`season ${sNum}`, `${sNum}nd season`, `${sNum}rd season`, `${sNum}th season`, `part ${sNum}`];
                    const hasSeason = seasonPatterns.some(p => normCand.includes(p) || c.slug.includes(p.replace(/\s+/g, "-")));
                    if (hasSeason) score += 50;
                } else {
                    // Season 1: penalize sequels & movies
                    if (normCand.includes("season") || normCand.includes("part") || normCand.includes("movie") || normCand.includes("arc") || c.slug.includes("movie") || c.slug.includes("arc")) {
                        score -= 20;
                    }
                    if (normCand.includes(" ii") || normCand.includes(" iii") || normCand.includes(" iv")) {
                        score -= 30;
                    }
                    if (normCand === normTarget) {
                        score += 40;
                    }
                }
            }
            return { ...c, score };
        })
        .sort((a, b) => b.score - a.score);
}

async function searchAnineko(title) {
    try {
        const searchUrl = `${BASE_URL}/filter?keyword=${encodeURIComponent(title)}`;
        const res = await fetch(searchUrl, { headers: HEADERS });
        if (!res.ok) return [];
        const html = await res.text();

        const titleRegex = /<a[^>]+class="[^"]*name d-title[^"]*"[^>]+href="https:\/\/anineko\.es\/watch\/([^\/"]+)(?:\/ep-\d+)?"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        const candidates = [];
        const seen = new Set();

        while ((match = titleRegex.exec(html)) !== null) {
            const slug = match[1];
            const text = match[2].replace(/<[^>]+>/g, "").trim();
            if (text && !seen.has(slug)) {
                seen.add(slug);
                candidates.push({ slug, title: text });
            }
        }
        return candidates;
    } catch {
        return [];
    }
}

async function getEpisodeServers(slug, episode) {
    try {
        const epUrl = `${BASE_URL}/watch/${slug}/ep-${episode}`;
        const res = await fetch(epUrl, { headers: HEADERS });
        if (!res.ok) return [];
        const html = await res.text();

        const serverRegex = /<li[^>]+class="[^"]*server-item[^"]*"[^>]*data-server-name="([^"]+)"[^>]*data-link-id="([^"]+)"/g;
        const servers = [];
        let match;

        while ((match = serverRegex.exec(html)) !== null) {
            const serverName = match[1];
            const encodedLink = match[2];
            const decodedLink = decodeBase64(encodedLink);
            if (decodedLink && decodedLink.startsWith("http")) {
                const isDub = decodedLink.includes("/dub");
                servers.push({
                    serverName,
                    link: decodedLink,
                    type: isDub ? "dub" : "sub"
                });
            }
        }
        return servers;
    } catch {
        return [];
    }
}

async function extractStreamFromServer(server) {
    try {
        const pRes = await fetch(server.link, {
            headers: {
                ...HEADERS,
                Referer: `${BASE_URL}/`
            }
        });
        if (!pRes.ok) return null;
        const pHtml = await pRes.text();

        const dataIdMatch = pHtml.match(/data-id="(\d+)"/);
        if (!dataIdMatch) return null;
        const streamId = dataIdMatch[1];

        const sourcesUrl = `https://megaplay.buzz/stream/getSources?id=${streamId}`;
        const sRes = await fetch(sourcesUrl, {
            headers: {
                ...HEADERS,
                Referer: server.link,
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        if (!sRes.ok) return null;
        const sJson = await sRes.json();

        let masterUrl = null;
        if (sJson.enc) {
            const dec = decryptAesCbc(sJson.enc);
            masterUrl = dec?.file;
        }
        if (!masterUrl && sJson.sources) {
            masterUrl = sJson.sources.file;
        }

        if (!masterUrl || typeof masterUrl !== "string" || !masterUrl.startsWith("http")) {
            return null;
        }

        const subtitles = (sJson.tracks || [])
            .filter(t => t.file && t.kind !== "thumbnails")
            .map(t => ({
                url: t.file,
                language: t.label || "Unknown",
                name: t.label || "Subtitles",
                default: Boolean(t.default)
            }));

        const isDub = server.type === "dub";
        return {
            name: PROVIDER,
            title: `${server.serverName} (${isDub ? "DUB" : "SUB"})`,
            url: masterUrl,
            quality: "auto",
            isM3U8: true,
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://megaplay.buzz/",
                "Origin": "https://megaplay.buzz"
            },
            subtitles: subtitles
        };
    } catch {
        return null;
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const isTv = mediaType === "tv";
        const ep = isTv ? (episode || 1) : 1;
        const targetSeason = isTv ? (season || 1) : 1;

        const titles = await resolveMetadata(tmdbId, mediaType, targetSeason);
        if (!titles.length) return [];

        let candidates = [];
        let matchedTitle = titles[0];
        for (const t of titles) {
            candidates = await searchAnineko(t);
            if (candidates.length) {
                matchedTitle = t;
                break;
            }
        }
        if (!candidates.length) return [];

        const ranked = rankCandidates(candidates, matchedTitle, targetSeason, !isTv);
        if (!ranked.length) return [];

        for (const best of ranked.slice(0, 3)) {
            const servers = await getEpisodeServers(best.slug, ep);
            if (!servers.length) continue;

            const results = await Promise.allSettled(
                servers.map(s => extractStreamFromServer(s))
            );

            const streams = results
                .filter(r => r.status === "fulfilled" && r.value?.url)
                .map(r => r.value);

            if (streams.length) {
                return streams;
            }
        }
        return [];
    } catch {
        return [];
    }
}

module.exports = { getStreams };
