const BASE_API = "https://api.hlowb.com";
const TMDB_API = "https://api.themoviedb.org/3";
const PKG = "com.external.castle";
const CHANNEL = "2";
const CLIENT = "1";
const LANG = "en-US";

const API_HEADERS = {
    "User-Agent": "okhttp/4.11.0",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": BASE_API,
};

const PLAYBACK_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "video",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
};

const RESOLUTIONS = [3, 2];
const QUALITY_MAP = { "3": "1080p", "2": "720p", "1": "480p" };
const KARNIS_SUFFIX = "T!BgJB";
const ALLOWED_LANGS = new Set(["english", "hindi", "bangla", "bengali"]);

function isAllowedLang(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    for (const l of ALLOWED_LANGS) if (n.includes(l)) return true;
    return false;
}

function getQualityValue(quality) {
    if (!quality) return 0;
    const clean = quality.toString().toLowerCase()
        .replace(/^(sd|hd|fhd|uhd|4k)\s*/i, "")
        .replace(/p$/, "")
        .trim();
    const map = {
        "4k": 2160, "2160": 2160, "1440": 1440, "1080": 1080,
        "720": 720, "480": 480, "360": 360, "240": 240,
    };
    return map[clean] ?? (parseInt(clean) || 0);
}

function formatSize(v) {
    if (typeof v !== "number" || v <= 0) return undefined;
    return v > 1e9 ? `${(v / 1e9).toFixed(2)} GB` : `${(v / 1e6).toFixed(0)} MB`;
}

function getSortTag(qualityVal) {
    let rank;
    if (qualityVal >= 2160) rank = 5;
    else if (qualityVal >= 1080) rank = 4;
    else if (qualityVal >= 720) rank = 3;
    else if (qualityVal >= 480) rank = 2;
    else if (qualityVal >= 360) rank = 1;
    else rank = 0;
    let bin = (5 - rank).toString(2);
    while (bin.length < 20) bin = "0" + bin;
    return bin.split("").map(b => b === "1" ? "\uFEFF" : "\u200B").join("");
}

function extractData(obj) {
    return (obj?.data && typeof obj.data === "object") ? obj.data : (obj || {});
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        method: options.method || "GET",
        headers: { ...API_HEADERS, ...(options.headers || {}) },
        body: options.body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
}

async function decryptKarnis(encryptedB64, securityKeyB64) {
    const keyMaterial = CryptoJS.enc.Base64.parse(securityKeyB64)
        .concat(CryptoJS.enc.Utf8.parse(KARNIS_SUFFIX));

    let finalKey;
    if (keyMaterial.sigBytes < 16) {
        finalKey = keyMaterial.concat(
            CryptoJS.lib.WordArray.create(new Array(16 - keyMaterial.sigBytes).fill(0))
        );
    } else if (keyMaterial.sigBytes > 16) {
        finalKey = CryptoJS.lib.WordArray.create(keyMaterial.words.slice(0, 4), 16);
    } else {
        finalKey = keyMaterial;
    }

    const decrypted = CryptoJS.AES.decrypt(encryptedB64, finalKey, {
        iv: finalKey,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
    });

    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (!result) throw new Error("Decryption failed");
    return result;
}

async function karnisRequest(url, options = {}) {
    const res = await apiFetch(url, options);
    const text = (await res.text()).trim();
    if (!text) throw new Error("Empty response");

    let cipher;
    try {
        const json = JSON.parse(text);
        cipher = (json?.data && typeof json.data === "string") ? json.data.trim() : text;
    } catch (_) {
        cipher = text;
    }

    return JSON.parse(await decryptKarnis(cipher, options._securityKey));
}

async function getTMDBInfo(tmdbId, mediaType) {
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const res = await fetch(`${TMDB_API}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`);
    const data = await res.json();
    const title = mediaType === "tv" ? data.name : data.title;
    const date = mediaType === "tv" ? data.first_air_date : data.release_date;
    return { title, year: date ? parseInt(date) : null };
}

async function getSecurityKey() {
    const url = `${BASE_API}/v0.1/system/getSecurityKey/1?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}`;
    const data = await (await apiFetch(url)).json();
    if (data.code !== 200 || !data.data) throw new Error("Security key error");
    return data.data;
}

async function searchKarnis(securityKey, keyword) {
    const params = new URLSearchParams({
        channel: CHANNEL, clientType: CLIENT, keyword, lang: LANG,
        mode: "1", packageName: PKG, page: "1", size: "30",
    });
    return karnisRequest(
        `${BASE_API}/film-api/v2.1.2/movie/searchByKeyword?${params}`,
        { _securityKey: securityKey }
    );
}

async function getDetails(securityKey, movieId) {
    return karnisRequest(
        `${BASE_API}/film-api/v2.1.2/movie?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}&movieId=${movieId}&packageName=${PKG}`,
        { _securityKey: securityKey }
    );
}

async function getVideo(securityKey, movieId, episodeId, resolution, languageId) {
    const base = {
        mode: "1", appMarket: "IndiaAGuanWang",
        clientType: CLIENT,
        woolUser: "false", apkSignKey: "ED0955EB04E67A1D9F3305B95454FED485261475",
        androidVersion: "13", isNewUser: "true", packageName: PKG,
        movieId: String(movieId),
        episodeId: String(episodeId),
        resolution: String(resolution),
    };
    if (languageId != null) base.languageId = String(languageId);
    return karnisRequest(
        `${BASE_API}/film-api/v2.0.7/movie/getVideo2?clientType=${CLIENT}&packageName=${PKG}&channel=${CHANNEL}&lang=${LANG}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(base),
            _securityKey: securityKey,
        }
    );
}

function processVideoResponse(videoData, label, qualityFallback) {
    const data = extractData(videoData);
    if (!data.videoUrl) return [];

    const subtitles = (data.subtitles || [])
        .filter(s => s.url)
        .map(s => ({
            url: s.url,
            language: s.abbreviate || "Unknown",
            name: s.title || s.abbreviate || "Unknown",
            headers: PLAYBACK_HEADERS,
        }));

    const makeStream = (url, rawQuality, size) => {
        const q = (rawQuality || qualityFallback || "").replace(/^(SD|HD|FHD)\s+/i, "");
        if (getQualityValue(q) < 720) return null;
        const tag = getSortTag(getQualityValue(q));
        const streamName = `Castle${label ? ` • ${label}` : ""}${/preview/i.test(url) ? " (preview)" : ""}`;
        return {
            url,
            name: tag + streamName,
            title: tag + streamName,
            quality: q,
            size: formatSize(size),
            headers: PLAYBACK_HEADERS,
            subtitles,
        };
    };

    if (data.videos?.length) {
        return data.videos
            .map(v => makeStream(v.url || data.videoUrl, v.resolutionDescription || v.resolution, v.size))
            .filter(Boolean);
    }

    const s = makeStream(data.videoUrl, qualityFallback, data.size);
    return s ? [s] : [];
}

async function getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType === "tv" && (season == null || episode == null)) return [];

    try {
        const [tmdbInfo, securityKey] = await Promise.all([
            getTMDBInfo(tmdbId, mediaType),
            getSecurityKey(),
        ]);

        const searchTerm = tmdbInfo.year ? `${tmdbInfo.title} ${tmdbInfo.year}` : tmdbInfo.title;
        const searchResult = await searchKarnis(securityKey, searchTerm);
        const rows = extractData(searchResult).rows || [];
        if (!rows.length) return [];

        const searchTitle = tmdbInfo.title.toLowerCase();
        const match = rows.find(item => {
            const t = (item.title || item.name || "").toLowerCase();
            return t.includes(searchTitle) || searchTitle.includes(t);
        }) || rows[0];

        let movieId = String(match.id || match.redirectId || match.redirectIdStr || "");
        if (!movieId) return [];

        if (mediaType === "tv" && season != null) {
            const rootData = extractData(await getDetails(securityKey, movieId));
            const seasons = rootData.seasons || [];
            if (seasons.length > 1) {
                const seasonObj = seasons.find(s => s.number === season);
                if (seasonObj?.movieId && String(seasonObj.movieId) !== movieId)
                    movieId = String(seasonObj.movieId);
            }
        }

        const detailsData = extractData(await getDetails(securityKey, movieId));
        const episodes = detailsData.episodes || [];

        const episodeObj = (mediaType === "tv" && episode != null)
            ? (episodes.find(e => e.number === episode) ?? null)
            : (episodes[0] ?? null);

        if (!episodeObj?.id) return [];
        const episodeId = String(episodeObj.id);

        const tracks = (episodeObj.tracks || []).filter(t => isAllowedLang(t.languageName || t.abbreviate));
        const hasIndivVideo = tracks.some(t => t?.existIndividualVideo === true);
        const allStreams = [];

        async function tryResolutions(fetchFn) {
            for (const res of RESOLUTIONS) {
                try {
                    const streams = processVideoResponse(await fetchFn(res), null, QUALITY_MAP[String(res)]);
                    if (streams.length) { allStreams.push(...streams); return true; }
                } catch (_) { }
            }
            return false;
        }

        if (!hasIndivVideo) {
            await tryResolutions(res => getVideo(securityKey, movieId, episodeId, res));
        } else {
            let loaded = false;
            for (const track of tracks) {
                if (!track || track.languageId == null) continue;
                const langName = track.languageName || track.abbreviate || "Unknown";
                for (const res of RESOLUTIONS) {
                    try {
                        const streams = processVideoResponse(
                            await getVideo(securityKey, movieId, episodeId, res, track.languageId),
                            langName,
                            QUALITY_MAP[String(res)]
                        );
                        if (streams.length) { allStreams.push(...streams); loaded = true; }
                    } catch (_) { }
                }
            }
            if (!loaded) await tryResolutions(res => getVideo(securityKey, movieId, episodeId, res));
        }

        const seen = new Set();
        return allStreams
            .sort((a, b) => getQualityValue(b.quality) - getQualityValue(a.quality))
            .filter(s => s.url && !seen.has(s.url) && seen.add(s.url));

    } catch (_) {
        return [];
    }
}

module.exports = { getStreams };