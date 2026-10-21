const PROVIDER = "CTGMovies";
const BASE_URL = "https://ctgmovies.com";
const TMDB_API = "https://api.themoviedb.org/3";
const API_BASE = "https://cockpit.103.109.92.178.nip.io/api/v1";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const WEB_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
    "Accept-Language": "en",
    "Referer": BASE_URL + "/",
    "Origin": BASE_URL,
};

const STREAM_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity",
    "Referer": BASE_URL + "/",
};

function encodeUrl(s) {
    return encodeURIComponent(s || "");
}

function yearFromDate(date) {
    if (!date) return null;
    const m = date.match(/\d{4}/);
    return m ? parseInt(m[0], 10) : null;
}

function cleanDisplayTitle(title) {
    if (!title) return "";
    return title
        .replace(/\b(1080p|720p|480p|2160p|4k|web[- ]?dl|webrip|bluray|hdrip|x264|x265|hevc|10bit|dual[- ]?audio|hindi[- ]?dubbed|dubbed|esub)\b/gi, " ")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizedTitle(title) {
    return cleanDisplayTitle(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function optString(obj, key) {
    if (!obj || obj[key] == null) return null;
    let v = obj[key];
    if (typeof v !== "string") v = String(v);
    v = v.trim();
    return (v && v !== "null") ? v : null;
}

function optInt(obj, key) {
    if (!obj || obj[key] == null) return null;
    const v = obj[key];
    if (typeof v === "number") return v;
    const parsed = parseInt(String(v), 10);
    return isNaN(parsed) ? null : parsed;
}

function splitCsv(s) {
    if (!s) return [];
    return s.split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
}

function resolveMediaUrl(url) {
    if (!url) return "";
    if (url.startsWith("//")) return "https:" + url;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("/")) return BASE_URL + url;
    return url;
}

function qualityFromUrl(url) {
    if (!url) return "Unknown";
    const m = url.match(/(2160p|1440p|1080p|720p|480p|360p|4k|uhd)/i);
    if (m) {
        const v = m[1].toLowerCase();
        if (v === "4k" || v === "uhd") return "2160p";
        return v;
    }
    return "Unknown";
}

function resWeight(quality) {
    const q = (quality || "").toLowerCase();
    if (q === "2160p") return 5;
    if (q === "1440p") return 4;
    if (q === "1080p") return 3;
    if (q === "720p") return 2;
    if (q === "480p") return 1;
    if (q === "360p") return 0;
    return -1;
}

function isValidLanguage(lang) {
    if (!lang) return false;
    const lower = lang.toLowerCase().trim();
    return lower !== "" && lower !== "unknown" && lower !== "null" && lower !== "none";
}

function collectLanguages(link) {
    const langs = new Set();
    function addLang(value) {
        if (!value) return;
        for (const part of splitCsv(value)) {
            if (isValidLanguage(part)) langs.add(part);
        }
    }
    if (Array.isArray(link.languages)) {
        for (const lang of link.languages) addLang(String(lang).trim());
    }
    addLang(optString(link, "language") || optString(link, "lang"));
    for (const key of ["subtitle_tracks", "subtitles", "captions", "tracks"]) {
        const subs = link[key];
        if (Array.isArray(subs)) {
            for (const sub of subs) {
                addLang(optString(sub, "label") || optString(sub, "language") || optString(sub, "srclang"));
            }
        }
    }
    return langs.size > 0 ? Array.from(langs).join(" • ") : "English";
}

function queryString(query) {
    query = query || {};
    const params = Object.keys(query)
        .filter(k => query[k] != null)
        .map(k => `${encodeUrl(k)}=${encodeUrl(String(query[k]))}`);
    return params.length ? "?" + params.join("&") : "";
}

function buildApiUrl(path, query) {
    const p = path.startsWith("/") ? path : "/" + path;
    return API_BASE + p + queryString(query);
}

function buildSameOriginUrl(path, query) {
    const p = path.startsWith("/") ? path : "/" + path;
    return BASE_URL + "/api/v1" + p + queryString(query);
}

async function apiGet(path, query) {
    const headers = WEB_HEADERS;

    async function tryUrl(url) {
        try {
            let res = await fetch(url, { headers });
            if (res.status >= 500 && res.status < 600) {
                res = await fetch(url, { headers });
            }
            return res.ok ? await res.text() : null;
        } catch { return null; }
    }

    const primary = await tryUrl(buildApiUrl(path, query));
    return primary !== null ? primary : tryUrl(buildSameOriginUrl(path, query));
}

async function getTMDBDetails(tmdbId, mediaType) {
    try {
        const endpoint = mediaType === "tv" ? "tv" : "movie";
        const res = await fetch(`${TMDB_API}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`, {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const title = mediaType === "tv" ? data.name : data.title;
        const releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
        return {
            title: title || null,
            year: releaseDate ? parseInt(releaseDate.split("-")[0], 10) : null,
            imdbId: (data.external_ids && data.external_ids.imdb_id) || null,
        };
    } catch { return null; }
}

function toSearchItem(obj, kind) {
    const isMovie = kind === "movies";
    const isAnime = kind === "anime" || (obj.is_anime === true && kind !== "tv");

    const title = optString(obj, "title") || optString(obj, "name") || optString(obj, "english_title");
    if (!title) return null;

    const id = optString(obj, "slug") || optString(obj, "id") || optString(obj, "_id");
    if (!id) return null;

    const year = optInt(obj, "year")
        || yearFromDate(optString(obj, "release_date"))
        || yearFromDate(optString(obj, "first_air_date"));

    let type;
    if (isMovie) type = "movie";
    else if (isAnime) type = "anime";
    else type = "tv";

    return {
        title: cleanDisplayTitle(title),
        id,
        kind,
        type,
        year,
    };
}

function parseSearchItems(raw, kind) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw.trim());
        const arr = Array.isArray(parsed)
            ? parsed
            : (parsed && typeof parsed === "object")
                ? (parsed.movies || parsed.results || parsed.data || [])
                : [];
        return arr.map(obj => toSearchItem(obj, kind)).filter(Boolean);
    } catch { return []; }
}

async function searchCtg(query) {
    const params = { search: query };
    const [movies, tv, anime] = await Promise.all([
        apiGet("/movies", params).then(raw => parseSearchItems(raw, "movies")),
        apiGet("/tv", params).then(raw => parseSearchItems(raw, "tv")),
        apiGet("/anime", params).then(raw => parseSearchItems(raw, "anime")),
    ]);
    return movies.concat(tv).concat(anime);
}

function findBestMatch(mediaInfo, items, mediaType) {
    if (!items.length) return null;

    const targetNorm = normalizedTitle(mediaInfo.title);
    const targetYear = mediaInfo.year;
    let best = null;
    let bestScore = -1;

    for (const item of items) {
        const itemNorm = normalizedTitle(item.title);
        let score = -1;

        if (itemNorm === targetNorm) {
            score = 100;
            if (targetYear && item.year === targetYear) score += 50;
        } else if (itemNorm.includes(targetNorm) && targetNorm.length >= 4) {
            score = 60;
            if (targetYear && item.year === targetYear) score += 30;
        } else if (targetNorm.includes(itemNorm) && itemNorm.length >= 4) {
            score = 40;
        }

        if (mediaType === "tv" && (item.type === "tv" || item.type === "anime")) score += 10;
        if (mediaType === "movie" && (item.type === "movie" || item.type === "anime")) score += 10;

        if (score > bestScore) { bestScore = score; best = item; }
    }

    return bestScore >= 30 ? best : null;
}

async function getDetail(item) {
    try {
        const raw = await apiGet(`/${item.kind}/${encodeUrl(item.id)}`);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

function buildStreams(links) {
    const seen = new Set();
    const out = [];

    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (!link || link.broken === true) continue;

        const rawUrl = optString(link, "url") || optString(link, "file")
            || optString(link, "src") || optString(link, "link");
        if (!rawUrl) continue;

        const finalUrl = resolveMediaUrl(rawUrl);
        if (!finalUrl || seen.has(finalUrl)) continue;
        seen.add(finalUrl);

        let quality = qualityFromUrl(finalUrl);
        if (quality === "Unknown") {
            const qHint = optString(link, "quality") || "";
            const qMatch = qHint.match(/(2160|1440|1080|720|480|360)p?/i);
            if (qMatch) {
                const v = parseInt(qMatch[1], 10);
                quality = v >= 2160 ? "2160p" : v >= 1440 ? "1440p" : v >= 1080 ? "1080p"
                    : v >= 720 ? "720p" : v >= 480 ? "480p" : v >= 360 ? "360p" : "Unknown";
            }
        }

        out.push({
            name: PROVIDER,
            title: PROVIDER,
            url: finalUrl,
            quality,
            language: collectLanguages(link),
            headers: STREAM_HEADERS,
        });
    }

    return out.sort((a, b) => resWeight(b.quality) - resWeight(a.quality));
}

async function getMovieStreams(item, mediaInfo) {
    try {
        const obj = await getDetail(item);
        if (!obj || !obj.links || !obj.links.length) return [];
        return buildStreams(obj.links);
    } catch { return []; }
}

async function getEpisodeStreams(item, mediaInfo, season, episode) {
    try {
        const obj = await getDetail(item);
        if (!obj || !obj.episodes || !obj.episodes.length) return [];

        const links = [];
        for (const ep of obj.episodes) {
            const epNum = optInt(ep, "episode_number") || optInt(ep, "absolute_number");
            const seasonNum = optInt(ep, "season_number") || 1;
            if (seasonNum !== season || epNum !== episode) continue;
            for (const link of (ep.links || [])) {
                if (link && link.broken !== true) links.push(link);
            }
        }

        return links.length ? buildStreams(links) : [];
    } catch { return []; }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const mediaInfo = await getTMDBDetails(tmdbId, mediaType);
        if (!mediaInfo || !mediaInfo.title) return [];

        const items = await searchCtg(mediaInfo.title);
        if (!items.length) return [];

        const match = findBestMatch(mediaInfo, items, mediaType);
        if (!match) return [];

        return mediaType === "tv"
            ? getEpisodeStreams(match, mediaInfo, season, episode)
            : getMovieStreams(match, mediaInfo);
    } catch { return []; }
}

module.exports = { getStreams };