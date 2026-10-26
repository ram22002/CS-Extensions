const BASE_URL = "https://anikoto.cz";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "Referer": `${BASE_URL}/`,
};
const AJAX_HEADERS = {
    ...HEADERS,
    "X-Requested-With": "XMLHttpRequest",
};

function decodeHtmlEntities(str) {
    if (!str) return "";
    return str
        .replace(/&#039;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

function normalizeTitle(str) {
    if (!str) return "";
    return decodeHtmlEntities(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function diceCoefficient(a, b) {
    const na = normalizeTitle(a);
    const nb = normalizeTitle(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const wordsA = na.split(" ").filter(Boolean);
    const wordsB = nb.split(" ").filter(Boolean);
    if (!wordsA.length || !wordsB.length) return 0;
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    let intersection = 0;
    for (const w of setA) if (setB.has(w)) intersection++;
    return (2 * intersection) / (wordsA.length + wordsB.length);
}

function parseSeasonNumber(title) {
    if (!title) return null;
    const match = title.match(/\b(?:season\s*(\d+)|(\d+)(?:nd|rd|th|st)\s*season|part\s*(\d+))\b/i);
    if (!match) return null;
    const num = match[1] || match[2] || match[3];
    return num ? parseInt(num, 10) : null;
}

function dedupeStreamsByUrl(streams) {
    const seen = new Set();
    return streams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
}

async function fetchAnimeMetadata(tmdbId, mediaType, targetSeason) {
    const bridge = (typeof globalThis !== "undefined" && (globalThis.NextGenNative || globalThis.EclipsiaNative)) || null;
    const callArgs = bridge ? JSON.parse(bridge.getCallArgs() || "{}") : {};
    const title = callArgs.title || callArgs.showTitle || "";
    const origTitle = callArgs.romajiTitle || "";
    const altTitles = [];
    if (!title) {
        try {
            const aniData = await fetch(`https://api.ani.zip/mappings?anilist_id=${tmdbId}`, { headers: HEADERS }).then(r => r.json()).catch(() => null);
            if (aniData?.titles) {
                if (aniData.titles.en) altTitles.push(aniData.titles.en);
                if (aniData.titles['x-jat']) altTitles.push(aniData.titles['x-jat']);
            }
        } catch { }
    }
    return {
        numericId: String(tmdbId),
        kind: mediaType === "movie" ? "movie" : "tv",
        title: decodeHtmlEntities(title || altTitles[0] || ""),
        originalTitle: origTitle ? decodeHtmlEntities(origTitle) : undefined,
        alternateTitles: altTitles,
        imdbId: undefined,
        seasonName: undefined,
        absoluteOffset: 0,
    };
}

async function searchAnikoto(query) {
    if (!query?.trim()) return [];
    try {
        const res = await fetch(
            `${BASE_URL}/filter?keyword=${encodeURIComponent(query.trim())}`,
            { headers: HEADERS }
        );
        if (res.ok) {
            const html = await res.text();
            const matches = [...html.matchAll(
                /<div class="item [\s\S]*?<div class="ani poster tip" data-tip="(\d+)"[\s\S]*?<a class="name d-title" href="([^"]+)"(?:\s+data-jp="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/gi
            )];
            if (matches.length > 0) {
                return matches.map(m => ({
                    id: m[1],
                    url: m[2],
                    jpTitle: m[3] ? decodeHtmlEntities(m[3].trim()) : undefined,
                    title: decodeHtmlEntities(m[4].replace(/<[^>]+>/g, "").trim()),
                }));
            }
        }
    } catch { }
    try {
        const res = await fetch(
            `${BASE_URL}/ajax/anime/search?keyword=${encodeURIComponent(query.trim())}`,
            { headers: AJAX_HEADERS }
        );
        if (res.ok) {
            const json = await res.json();
            const html = json?.result?.html || "";
            return [...html.matchAll(
                /<a class="item" href="([^"]+)"[\s\S]*?<div class="name d-title"[^>]*>([\s\S]*?)<\/div>/gi
            )].map(m => ({
                id: "",
                url: m[1],
                title: decodeHtmlEntities(m[2].replace(/<[^>]+>/g, "").trim()),
            }));
        }
    } catch { }
    return [];
}

async function resolveAnimeIdFromUrl(pageUrl) {
    try {
        const res = await fetch(pageUrl, { headers: HEADERS });
        if (res.ok) {
            const html = await res.text();
            const match = html.match(/data-id="(\d+)"/);
            if (match) return match[1];
        }
    } catch { }
    return null;
}

async function fetchAnimeSeasons(animeId) {
    try {
        const res = await fetch(
            `${BASE_URL}/api/seasons/${encodeURIComponent(animeId)}`,
            { headers: AJAX_HEADERS }
        );
        if (res.ok) {
            const json = await res.json();
            const html = json?.result || "";
            return [...html.matchAll(
                /<div class="swiper-slide season (active)?">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<div class="name"[^>]*>([\s\S]*?)<\/div>/gi
            )].map(m => ({
                active: !!m[1],
                url: m[2],
                name: decodeHtmlEntities(m[3].trim()),
            }));
        }
    } catch { }
    return [];
}

async function fetchEpisodeList(animeId) {
    try {
        const res = await fetch(
            `${BASE_URL}/ajax/episode/list/${encodeURIComponent(animeId)}`,
            { headers: AJAX_HEADERS }
        );
        if (res.ok) {
            const json = await res.json();
            const html = json?.result || "";
            return [...html.matchAll(
                /<a[^>]+data-id="(\d+)"[^>]+data-num="(\d+)"[^>]+data-ids="([^"]+)"(?:[^>]*data-mal="(\d+)")?[^>]*>(?:<b>(\d+)<\/b>)?(?:\s*<span[^>]*class="d-title"[^>]*>([^<]*)<\/span>)?/gi
            )].map(m => ({
                id: m[1],
                num: parseInt(m[2], 10),
                dataIds: m[3],
                malId: m[4] || undefined,
                title: m[6] ? decodeHtmlEntities(m[6].trim()) : undefined,
            }));
        }
    } catch { }
    return [];
}

async function fetchServerList(dataIds) {
    try {
        const res = await fetch(
            `${BASE_URL}/ajax/server/list?servers=${encodeURIComponent(dataIds)}`,
            { headers: AJAX_HEADERS }
        );
        if (res.ok) {
            const json = await res.json();
            const html = json?.result || "";
            const typeBlocks = [...html.matchAll(/<div class="type" data-type="(sub|dub)">([\s\S]*?)<\/div>/gi)];
            const servers = [];
            for (const block of typeBlocks) {
                const type = block[1];
                const items = [...block[2].matchAll(/<li[^>]*data-link-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi)];
                for (const item of items) {
                    servers.push({
                        type,
                        linkId: item[1],
                        serverName: decodeHtmlEntities(item[2].replace(/<[^>]+>/g, "").trim()),
                    });
                }
            }
            return servers;
        }
    } catch { }
    return [];
}

async function fetchPlayerUrl(linkId) {
    try {
        const res = await fetch(
            `${BASE_URL}/ajax/server?get=${encodeURIComponent(linkId)}`,
            { headers: AJAX_HEADERS }
        );
        if (res.ok) {
            const json = await res.json();
            return json?.result?.url || null;
        }
    } catch { }
    return null;
}

function padUtf8ToWordArray(str, byteLength) {
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
        const key = padUtf8ToWordArray("i?LMTAx0Q6,:}50U", 32);
        const iv = padUtf8ToWordArray("W0;27ToaUpl_P%'c", 16);
        let b64 = encryptedBase64.replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        const cipherParams = CryptoJS.lib.CipherParams.create({
            ciphertext: CryptoJS.enc.Base64.parse(b64),
        });
        const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
            iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
        });
        return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
    } catch {
        return null;
    }
}

async function extractStreamFromServer(server) {
    try {
        const playerUrl = await fetchPlayerUrl(server.linkId);
        if (!playerUrl) return null;

        const playerRes = await fetch(playerUrl, {
            headers: { ...HEADERS, "Referer": `${BASE_URL}/` },
        });
        if (!playerRes.ok) return null;

        const playerHtml = await playerRes.text();
        const dataIdMatch = playerHtml.match(/data-id="(\d+)"/);
        if (!dataIdMatch) return null;

        const streamId = dataIdMatch[1];
        const playerOrigin = new URL(playerUrl).origin;
        const sParam = new URL(playerUrl).searchParams.get("s") || "tcdn";

        const sourcesRes = await fetch(
            `${playerOrigin}/stream/getSourcesNew?id=${streamId}&s=${encodeURIComponent(sParam)}`,
            {
                headers: {
                    ...HEADERS,
                    "Referer": playerUrl,
                    "X-Requested-With": "XMLHttpRequest",
                },
            }
        );
        if (!sourcesRes.ok) return null;

        const sourcesJson = await sourcesRes.json();
        let masterUrl = sourcesJson?.sources?.file;
        if (!masterUrl && sourcesJson?.enc) {
            const decrypted = decryptAesCbc(sourcesJson.enc);
            masterUrl = decrypted?.file;
        }
        if (!masterUrl || typeof masterUrl !== "string") return null;

        if (masterUrl.includes("fetch.nexabloom.top")) {
            masterUrl = masterUrl.replace("fetch.nexabloom.top", "ncdn.imgnex.top");
        }

        const subtitles = (sourcesJson.tracks || [])
            .filter(t => t.file)
            .map(t => ({
                url: t.file,
                language: t.label || "Unknown",
                name: t.label || "Subtitles",
            }));

        const isDub = server.type === "dub";
        const langName = isDub ? "English" : "Japanese";

        return {
            title: `Anikoto \u2022 ${langName} \u2022 ${server.serverName}`,
            name: `Anikoto \u2022 ${langName} \u2022 ${server.serverName}`,
            quality: "1080p",
            url: masterUrl,
            headers: {
                "Referer": `${playerOrigin}/`,
                "Origin": playerOrigin,
            },
            subtitles: subtitles.length > 0 ? subtitles : undefined,
        };
    } catch {
        return null;
    }
}

function scoreTitleMatch(candidateTitle, candidateJp, targetTitle, targetSeason) {
    const cn = normalizeTitle(candidateTitle);
    const jn = candidateJp ? normalizeTitle(candidateJp) : "";
    const tn = normalizeTitle(targetTitle);
    if ((!cn && !jn) || !tn) return 0;
    if (cn === tn || jn === tn) return 1;
    let best = 0;
    for (const candidate of [cn, jn]) {
        if (!candidate) continue;
        if (candidate === tn) { best = 1; break; }
        if (candidate.startsWith(tn) || tn.startsWith(candidate)) {
            const ratio = Math.min(candidate.length, tn.length) / Math.max(candidate.length, tn.length);
            best = Math.max(best, 0.8 * ratio);
        } else if (candidate.includes(tn) || tn.includes(candidate)) {
            const ratio = Math.min(candidate.length, tn.length) / Math.max(candidate.length, tn.length);
            best = Math.max(best, 0.65 * ratio);
        } else {
            best = Math.max(best, diceCoefficient(candidate, tn));
        }
    }
    if (targetSeason && targetSeason > 1) {
        const candidateSeason =
            parseSeasonNumber(candidateTitle) ||
            (candidateJp ? parseSeasonNumber(candidateJp) : null);
        if (candidateSeason === targetSeason) best += 0.35;
        else if (candidateSeason !== null) best -= 0.4;
    }
    return Math.max(0, best);
}

function pickBestCandidate(candidates, meta, season) {
    if (!candidates?.length) return null;
    const titlesToScore = [
        meta.title,
        meta.originalTitle,
        ...(meta.alternateTitles || []),
    ].filter(t => t?.trim());
    const isMovie = meta.kind === "movie";
    let best = null;
    let highScore = -1;
    for (const candidate of candidates) {
        let candidateScore = 0;
        for (const title of titlesToScore) {
            const s = scoreTitleMatch(candidate.title, candidate.jpTitle, title, season);
            if (s > candidateScore) candidateScore = s;
        }
        const isItemMovie = /\bmovie\b/i.test(candidate.title) || /\/movie\b/i.test(candidate.url);
        const isItemOva = /\b(?:ova|ona|special)\b/i.test(candidate.title) || /\b(?:ova|ona|special)\b/i.test(candidate.url);
        if (isMovie && !isItemMovie) candidateScore *= 0.5;
        else if (!isMovie && isItemMovie) candidateScore *= 0.6;
        else if (!isMovie && isItemOva) candidateScore *= 0.7;
        if (candidateScore > highScore) { highScore = candidateScore; best = candidate; }
    }
    return highScore >= 0.25 ? best : null;
}

async function resolveTargetSeasonId(baseAnimeId, seasonNumber, seasonName) {
    if (!seasonNumber || seasonNumber <= 1) return baseAnimeId;
    const seasons = await fetchAnimeSeasons(baseAnimeId);
    if (!seasons.length) return baseAnimeId;
    let matched = seasons.find(s => parseSeasonNumber(s.name) === seasonNumber);
    if (!matched && seasonName) {
        const normalizedTarget = normalizeTitle(seasonName);
        matched = seasons.find(s => {
            const sn = normalizeTitle(s.name);
            return sn.includes(normalizedTarget) || normalizedTarget.includes(sn);
        });
    }
    if (!matched) return baseAnimeId;
    const resolvedId = await resolveAnimeIdFromUrl(matched.url);
    return resolvedId || baseAnimeId;
}

function resolveTargetEpisode(episodes, episodeNumber, absoluteOffset = 0) {
    if (!episodes?.length) return null;
    const target = episodeNumber > 0 ? episodeNumber : 1;
    let ep = episodes.find(e => e.num === target);
    if (ep) return ep;
    if (absoluteOffset > 0) {
        ep = episodes.find(e => e.num === absoluteOffset + target);
        if (ep) return ep;
    }
    return target <= episodes.length ? (episodes[target - 1] ?? null) : null;
}

async function onSettings() {
    return [
        { type: "header", label: "Anikoto" },
        { type: "header", label: "Audio" },
        {
            type: "toggle",
            key: "enableSub",
            label: "Japanese (Sub)",
            defaultValue: true,
            description: "Include Subtitled streams (Japanese audio) streams.",
        },
        {
            type: "toggle",
            key: "enableDub",
            label: "English (Dub)",
            defaultValue: true,
            description: "Include Dubbed streams (English audio) streams.",
        },
        { type: "header", label: "Quality" },
        {
            type: "toggle",
            key: "enable1080p",
            label: "1080p",
            defaultValue: true,
            description: "Include 1080p streams.",
        },
        {
            type: "toggle",
            key: "enable720p",
            label: "720p",
            defaultValue: false,
            description: "Include 720p streams.",
        },
    ];
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (!tmdbId) return [];

        const enableSub = SCRAPER_SETTINGS.enableSub !== false;
        const enableDub = SCRAPER_SETTINGS.enableDub !== false;
        const enable1080 = SCRAPER_SETTINGS.enable1080p !== false;
        const enable720 = SCRAPER_SETTINGS.enable720p === true;

        const targetSeason = typeof season === "number" ? season : 1;
        const targetEpisode = typeof episode === "number" ? episode : 1;

        const meta = await fetchAnimeMetadata(tmdbId, mediaType, targetSeason);
        if (!meta?.title) return [];

        const searchQueries = [
            meta.title,
            meta.originalTitle,
            meta.title.includes(":") ? meta.title.split(":")[0].trim() : null,
            meta.title.includes("-") ? meta.title.split("-")[0].trim() : null,
            meta.originalTitle?.includes(":") ? meta.originalTitle.split(":")[0].trim() : null,
            ...(meta.alternateTitles || []),
        ].filter(t => t?.trim());

        let candidates = [];
        for (const query of searchQueries.slice(0, 8)) {
            candidates = await searchAnikoto(query);
            if (candidates.length) break;
        }
        if (!candidates.length) return [];

        const matchedAnime = pickBestCandidate(candidates, meta, targetSeason);
        if (!matchedAnime?.id) return [];

        const seasonAnimeId = await resolveTargetSeasonId(
            matchedAnime.id,
            targetSeason,
            meta.seasonName
        );

        const episodes = await fetchEpisodeList(seasonAnimeId);
        if (!episodes.length) return [];

        const matchedEpisode = resolveTargetEpisode(episodes, targetEpisode, meta.absoluteOffset);
        if (!matchedEpisode?.dataIds) return [];

        const allServers = await fetchServerList(matchedEpisode.dataIds);
        if (!allServers.length) return [];

        const eligibleServers = allServers
            .filter(s => {
                if (s.type === "sub" && !enableSub) return false;
                if (s.type === "dub" && !enableDub) return false;
                return true;
            })
            .sort((a, b) => {
                const aHd = a.serverName.toLowerCase().includes("hd");
                const bHd = b.serverName.toLowerCase().includes("hd");
                return aHd === bHd ? 0 : aHd ? -1 : 1;
            });

        const settled = await Promise.allSettled(
            eligibleServers.map(s => extractStreamFromServer(s))
        );

        const streams = settled
            .filter(r => r.status === "fulfilled" && r.value?.url)
            .map(r => r.value)
            .filter(s => {
                if (s.quality === "1080p" && !enable1080) return false;
                if (s.quality === "720p" && !enable720) return false;
                return true;
            });

        return dedupeStreamsByUrl(streams);
    } catch {
        return [];
    }
}

module.exports = { getStreams, onSettings };