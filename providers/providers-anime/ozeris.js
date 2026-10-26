const BASE_URL = "https://anv.to";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9"
};
const J_HEADERS = {
    ...HEADERS,
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: BASE_URL,
    Referer: `${BASE_URL}/`
};

const toAbsoluteUrl = (url) => (url ? (url.startsWith("http") ? url : `${BASE_URL}${url}`) : null);
const normalizeText = (text) => (text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const uniqueById = (items) => [...new Map(items.map((item) => [item.id, item])).values()];

function getTitles(media) {
    const { english, romaji, native } = media.title || {};
    return [english, romaji, native, ...(media.synonyms || [])].filter(Boolean).map(normalizeText);
}

function getPartNumber(titles) {
    for (const title of titles) {
        const match = title.match(/\b(?:part|cour)\s*(\d+)\b|\b(\d+)(?:st|nd|rd|th)\s+(?:part|cour)\b/);
        if (match) return parseInt(match[1] || match[2], 10);
    }
    return null;
}

function hasSeasonMarker(titles, season) {
    const marker = new RegExp(`(season ${season}\\b|\\b${season}(st|nd|rd|th) season| ${season}$)`);
    return titles.some((title) =>
        marker.test(title.replace(/\b(?:part|cour)\s*\d+\b|\b\d+(?:st|nd|rd|th)\s+(?:part|cour)\b/g, " ").trim())
    );
}

async function fetchSessionCookie(pageUrl) {
    try {
        const response = await fetch(pageUrl, { headers: HEADERS });
        const match = (response.headers.get("set-cookie") || "").match(/shiro_watch=([^;,\s]+)/);
        return match ? `shiro_watch=${match[1].trim()}` : null;
    } catch {
        return null;
    }
}

async function searchAnime(query) {
    try {
        const response = await fetch(`${BASE_URL}/api/catalog`, {
            method: "POST",
            headers: J_HEADERS,
            body: JSON.stringify({
                operation: "BrowseAnime",
                variables: { page: 1, perPage: 20, sort: ["POPULARITY_DESC"], search: query }
            })
        });
        const results = (await response.json())?.data?.Page?.media || [];
        return results.filter((media) => media?.id && media.slug && !media.isAdult);
    } catch {
        return [];
    }
}

async function requestEpisode(media, episodeNumber, pageUrl) {
    const body = JSON.stringify({ anilistId: media.id, malId: media.idMal || null, episode: episodeNumber });

    for (let attempt = 0; attempt < 2; attempt++) {
        const cookie = await fetchSessionCookie(pageUrl);
        if (!cookie) return null;

        const response = await fetch(`${BASE_URL}/api/episode`, {
            method: "POST",
            headers: { ...J_HEADERS, Cookie: cookie, Referer: pageUrl },
            body
        });
        if (response.status === 403 && attempt === 0) continue;

        const episode = await response.json();
        return episode ? { episode, cookie } : null;
    }
}

async function detectStreamHeight(streamUrl, headers) {
    try {
        const playlist = await (await fetch(streamUrl, { headers })).text();
        const heights = [...playlist.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((match) => parseInt(match[1], 10));
        return Math.max(0, ...heights);
    } catch {
        return 0;
    }
}

async function fetchAnimeDetails(tmdbId, mediaType, season) {
    const bridge = (typeof globalThis !== "undefined" && (globalThis.NextGenNative || globalThis.EclipsiaNative)) || null;
    const callArgs = bridge ? JSON.parse(bridge.getCallArgs() || "{}") : {};
    const titles = [callArgs.title, callArgs.showTitle, callArgs.romajiTitle].filter(Boolean);
    if (!titles.length) {
        try {
            const aniData = await fetch(`https://api.ani.zip/mappings?anilist_id=${tmdbId}`).then(r => r.json()).catch(() => null);
            if (aniData?.titles) {
                if (aniData.titles.en) titles.push(aniData.titles.en);
                if (aniData.titles['x-jat']) titles.push(aniData.titles['x-jat']);
            }
        } catch { }
    }
    return {
        titles: [...new Set(titles)],
        year: null,
        seasonYear: null,
        seasonName: null
    };
}

function scoreCandidate(candidate, tmdb, season) {
    const titles = getTitles(candidate);
    let score = 0;

    for (const tmdbTitle of tmdb.titles.map(normalizeText).filter(Boolean)) {
        if (titles.includes(tmdbTitle)) score += 10;
        else if (titles.some((title) => title.includes(tmdbTitle) || tmdbTitle.includes(title))) score += 3;
    }

    if (season > 1) {
        const seasonName = normalizeText(tmdb.seasonName);
        const bonuses = [
            hasSeasonMarker(titles, season) && 10,
            seasonName && titles.some((title) => title.includes(seasonName)) && 10,
            tmdb.seasonYear && candidate.seasonYear === tmdb.seasonYear && tmdb.seasonYear !== tmdb.year && 8
        ].filter(Boolean);
        if (!bonuses.length) return -1;
        score += bonuses.reduce((sum, bonus) => sum + bonus, 0);
    } else {
        if (tmdb.year && candidate.seasonYear === tmdb.year) score += 4;
        if (hasSeasonMarker(titles, 2) || hasSeasonMarker(titles, 3)) score -= 8;
    }

    return getPartNumber(titles) !== null ? score - 4 : score;
}

async function findBestMatch(tmdb, mediaType, season) {
    const isLaterSeason = mediaType === "tv" && season > 1;
    const queries = tmdb.titles.flatMap((title) =>
        isLaterSeason
            ? [
                ...(tmdb.seasonName ? [`${title} ${tmdb.seasonName}`] : []),
                `${title} season ${season}`,
                `${title} ${season}`,
                title
            ]
            : [title]
    );

    const searchResults = await Promise.all([...new Set(queries)].slice(0, 6).map(searchAnime));
    const candidates = uniqueById(searchResults.flat());

    let best = null;
    let bestScore = 0;
    for (const candidate of candidates) {
        const score = scoreCandidate(candidate, tmdb, season);
        if (score > bestScore) [best, bestScore] = [candidate, score];
    }

    return bestScore >= 10 ? { media: best, candidates } : null;
}

async function resolveEpisodeEntry(base, knownCandidates, episodeNumber) {
    if (!base.episodes || episodeNumber <= base.episodes) return { media: base, episodeNumber };

    const baseName = base.title?.english || base.title?.romaji;
    const partSearches = baseName ? [`${baseName} part 2`, `${baseName} cour 2`, `${baseName} part 3`] : [];
    const found = (await Promise.all(partSearches.map(searchAnime))).flat();

    const baseTitles = getTitles(base);
    const baseSeasons = [2, 3, 4, 5, 6, 7, 8, 9].filter((season) => hasSeasonMarker(baseTitles, season));

    const parts = uniqueById([...knownCandidates, ...found])
        .filter((candidate) => {
            const titles = getTitles(candidate);
            return (
                candidate.id !== base.id &&
                getPartNumber(titles) !== null &&
                !(base.seasonYear && candidate.seasonYear && candidate.seasonYear < base.seasonYear) &&
                ![2, 3, 4, 5, 6, 7, 8, 9].some((season) => hasSeasonMarker(titles, season) && !baseSeasons.includes(season)) &&
                titles.some((title) => baseTitles.some((baseTitle) => title.startsWith(baseTitle)))
            );
        })
        .sort((a, b) => getPartNumber(getTitles(a)) - getPartNumber(getTitles(b)));

    let remaining = episodeNumber - base.episodes;
    for (const part of parts) {
        if (!part.episodes || remaining <= part.episodes) return { media: part, episodeNumber: remaining };
        remaining -= part.episodes;
    }
    return null;
}

async function buildStreams(episode, cookie, pageUrl) {
    const headers = { ...HEADERS, Cookie: cookie, Referer: pageUrl };
    const urlUses = new Map();
    const streams = [];

    for (const variant of episode.variants || []) {
        const language = { sub: "Japanese", dub: "English" }[variant.id];
        if (!language) continue;

        for (const source of variant.sources || []) {
            const streamUrl = toAbsoluteUrl(source.url);
            const label = source.label?.trim();
            if (!streamUrl || !label) continue;

            const uses = urlUses.get(streamUrl) || 0;
            urlUses.set(streamUrl, uses + 1);

            const seenSubtitleUrls = new Set();
            const subtitles = (source.tracks || []).flatMap((track) => {
                const url = toAbsoluteUrl(track.src);
                if (!url || seenSubtitleUrls.has(url)) return [];
                seenSubtitleUrls.add(url);
                const name = track.label?.replace(/\s+/g, " ").trim() || track.language || "Unknown";
                return [{ url, language: track.language || name, name, headers }];
            });

            const name = `Anv \u2022 ${language} \u2022 ${label}`;
            streams.push({
                name,
                title: name,
                url: uses === 0 ? streamUrl : `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}f=${uses}`,
                type: "hls",
                headers,
                ...(subtitles.length ? { subtitles } : {})
            });
        }
    }

    const heights = await Promise.all(streams.map((stream) => detectStreamHeight(stream.url, headers)));
    return streams.flatMap((stream, index) =>
        [1080, 720].includes(heights[index]) ? [{ ...stream, quality: `${heights[index]}p` }] : []
    );
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const isTv = mediaType === "tv";
        if (!/^\d+$/.test(String(tmdbId)) || (isTv && (season == null || episode == null))) return [];

        const seasonNumber = isTv ? parseInt(season, 10) || 1 : 1;
        const episodeNumber = isTv ? parseInt(episode, 10) || 1 : 1;
        const anime = await fetchAnimeDetails(tmdbId, mediaType, seasonNumber);
        if (!anime || !anime.titles.length) return [];

        const match = await findBestMatch(anime, mediaType, seasonNumber);
        if (!match) return [];

        const entry = await resolveEpisodeEntry(match.media, match.candidates, episodeNumber);
        if (!entry) return [];

        const pageUrl = `${BASE_URL}/anime/${entry.media.slug}-episode-${entry.episodeNumber}`;
        const response = await requestEpisode(entry.media, entry.episodeNumber, pageUrl);
        if (response?.episode.status !== "ready") return [];

        return await buildStreams(response.episode, response.cookie, pageUrl);
    } catch {
        return [];
    }
}

module.exports = { getStreams };