const BASE_URL = "https://ani.pm";
const API_BASE = "https://embed.settlar.io";
const LANGS = { sub: "Japanese", dub: "English" };
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const HEADERS = {
    "User-Agent": USER_AGENT,
    Referer: `${API_BASE}/`
};

const fetchJson = async (url, referer) => {
    try {
        const response = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: referer },
        });
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
};

const tokenize = (value) => String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const normalize = (value) => tokenize(value).join("");

const fetchAnimeDetails = async (tmdbId, mediaType, season) => {
    const bridge = (typeof globalThis !== "undefined" && (globalThis.NextGenNative || globalThis.EclipsiaNative)) || null;
    const callArgs = bridge ? JSON.parse(bridge.getCallArgs() || "{}") : {};
    const titles = [callArgs.title, callArgs.showTitle, callArgs.romajiTitle].filter(Boolean);
    if (!titles.length) {
        try {
            const aniData = await fetchJson(`https://api.ani.zip/mappings?anilist_id=${tmdbId}`, "");
            if (aniData?.titles) {
                if (aniData.titles.en) titles.push(aniData.titles.en);
                if (aniData.titles['x-jat']) titles.push(aniData.titles['x-jat']);
            }
        } catch { }
    }
    return { titles: [...new Set(titles)], year: null };
};

const searchAnime = async (query) => {
    if (query.length < 2) return [];
    const data = await fetchJson(`${BASE_URL}/api/anime/search?q=${encodeURIComponent(query)}`, `${BASE_URL}/`);
    return ((data && data.items) || []).filter((item) => item && item.id != null);
};

const scoreCandidate = (candidate, details, isTv, season) => {
    const title = candidate.title || "";
    const normalizedCandidate = normalize(title);
    const candidateTokens = tokenize(title);

    let score = Math.max(
        0,
        ...details.titles.map((name) => {
            const normalizedName = normalize(name);
            if (!normalizedName) return 0;
            if (normalizedCandidate === normalizedName) return 100;
            if (normalizedCandidate.startsWith(normalizedName) || normalizedName.startsWith(normalizedCandidate)) return 60;
            const nameTokens = tokenize(name);
            const shared = nameTokens.filter((token) => candidateTokens.includes(token)).length;
            return Math.round((shared / Math.max(nameTokens.length, candidateTokens.length, 1)) * 50);
        })
    );

    if (details.year && candidate.year) {
        const difference = Math.abs(details.year - candidate.year);
        score += difference === 0 ? 30 : difference === 1 ? 10 : -30;
    }

    const isMovie = String(candidate.type || "").toLowerCase() === "movie";
    if (isTv && isMovie) score -= 50;
    if (!isTv && isMovie) score += 20;

    if (isTv) {
        const match = title.toLowerCase().match(/season\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*season/);
        const candidateSeason = match ? parseInt(match[1] || match[2], 10) : null;
        if (season > 1 && candidateSeason != null) score += candidateSeason === season ? 40 : -40;
        if (season <= 1 && candidateSeason > 1) score -= 40;
    }
    return score;
};

const findAnime = async (details, isTv, season) => {
    const queries = details.titles.flatMap((title) => (isTv && season > 1 ? [title, `${title} season ${season}`] : [title]));
    const candidates = (await Promise.all(queries.map((query) => searchAnime(query)))).flat();

    let bestMatch = null;
    const MIN_SCORE = 50;
    let bestScore = MIN_SCORE - 1;
    for (const candidate of new Map(candidates.map((item) => [item.id, item])).values()) {
        const score = scoreCandidate(candidate, details, isTv, season);
        if (score > bestScore) [bestMatch, bestScore] = [candidate, score];
    }
    return bestMatch;
};

const buildSubtitles = (rawSubtitles, seen) => {
    const subtitles = [];
    for (const { url, label } of rawSubtitles.filter(Boolean)) {
        const name = String(label || "Subtitle");
        const keys = [`url:${url}`, `label:${name.trim().toLowerCase()}`];
        if (!/^https?:/i.test(url) || keys.some((key) => seen.has(key))) continue;
        keys.forEach((key) => seen.add(key));
        subtitles.push({ url, language: name, name, headers: HEADERS });
    }
    return subtitles;
};

const resolveSettlarStream = async (selection, episodeNumber, language, label, seenSubtitles) => {
    const session = await fetchJson(
        `${BASE_URL}/api/anime/settlar/session?selection=${encodeURIComponent(selection)}` +
        `&provider=anipm&ep=${episodeNumber}&channel=${language}&telemetry=0`,
        `${BASE_URL}/`
    );
    const token = session && session.embedUrl && /t=([^&]+)/.exec(session.embedUrl);
    if (!token) return null;

    const embed = await fetchJson(`${API_BASE}/api/embed/session?t=${token[1]}`, `${API_BASE}/embed/v1`);
    if (!embed || !/^https?:/i.test(embed.source)) return null;

    return {
        name: label,
        title: label,
        url: embed.source,
        type: "hls",
        quality: "1080p",
        headers: HEADERS,
        subtitles: seenSubtitles && Array.isArray(embed.subtitles) ? buildSubtitles(embed.subtitles, seenSubtitles) : [],
    };
};

const fetchLanguageStreams = async (anime, episodeNumber, language, packagesPromise, seenSubtitles) => {
    const bootstrap = await fetchJson(
        `${BASE_URL}/api/anime/playback-bootstrap/settlar/${anime.id}?ep=${episodeNumber}&lang=${language}&backup=1`,
        `${BASE_URL}/`
    );
    const selection = bootstrap && typeof bootstrap.settlarSelection === "string" ? bootstrap.settlarSelection.trim() : "";
    if (!selection) return [];

    const packages = await packagesPromise;
    const packageEntry = packages && packages.episodes && packages.episodes[episodeNumber];
    const hasHardsub = packageEntry && packageEntry[`${language}hard`] === true;
    const label = `ANI.PM \u2022 ${LANGS[language]}`;

    const variants = [[language, label, seenSubtitles]];
    if (hasHardsub) variants.push([`${language}hard`, `${label} \u2022 Hard Sub`, null]);

    const streams = await Promise.all(
        variants.map((variant) => resolveSettlarStream(selection, episodeNumber, ...variant).catch(() => null))
    );
    return streams.filter(Boolean);
};

const getStreams = async (tmdbId, mediaType, season, episode) => {
    try {
        const isTv = mediaType === "tv";
        if (isTv && (season == null || episode == null)) return [];

        const details = await fetchAnimeDetails(tmdbId, mediaType, season);
        const anime = details && details.titles.length ? await findAnime(details, isTv, season) : null;
        const episodeNumber = isTv ? Number(episode) : 1;
        if (!anime || !(episodeNumber >= 1)) return [];

        const anilistId = anime.anilistId != null ? String(anime.anilistId).trim() : "";
        const packagesPromise = anilistId
            ? fetchJson(`${BASE_URL}/api/anime/anipm-server/_packages?anilistId=${encodeURIComponent(anilistId)}`, `${BASE_URL}/`)
            : Promise.resolve(null);

        const languages = ["sub", "dub"].filter((language) => (anime[`${language}Count`] || 0) > 0);
        const seenSubtitles = new Set();
        const streamLists = await Promise.all(
            (languages.length ? languages : ["sub", "dub"]).map((language) =>
                fetchLanguageStreams(anime, episodeNumber, language, packagesPromise, seenSubtitles).catch(() => [])
            )
        );

        const seenUrls = new Set();
        return streamLists.flat().filter((stream) => !seenUrls.has(stream.url) && seenUrls.add(stream.url));
    } catch {
        return [];
    }
};

module.exports = { getStreams };