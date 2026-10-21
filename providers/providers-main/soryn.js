"use strict";

const PROVIDER = "Netmirror";
const BASE_URL = "https://net27.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const PLATFORM_MAP = {
    netflix: { ott: "nf" },
    primevideo: { ott: "pv" },
    hotstar: { ott: "hs" },
    disney: { ott: "hs" },
};
const NEW_TV_BASE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Requested-With": "NetmirrorNewTV v1.0",
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0`,
    "Accept": "application/json, text/plain, */*",
};
const PLAYBACK_HEADERS = {
    "Referer": "https://videodownloader.site/",
    "User-Agent": USER_AGENT,
};
const NET27_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": `${BASE_URL}/`,
    "User-Agent": USER_AGENT,
};
const NEW_TV_DOMAINS = [
    "aHR0cHM6Ly9tb2JpbGVkZXRlY3RzLmNvbQ==",
    "aHR0cHM6Ly9tb2JpbGVkZXR0LmFwcA==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmFydA==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNj",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNsaWNr",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0Lmluaw==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmxpdmU=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnBybw==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNob3A=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNpdGU=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNwYWNl",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnN0b3Jl",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnZpcA==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0Lndpa2k=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0Lnh5eg==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5hcnQ=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5jYw==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbmZv",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbks=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5saXZl",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5wcm8=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5zdG9yZQ==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy50b3A=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy54eXo=",
];

let resolvedApiUrl = "";

function meetsQualityFilter(quality) {
    if (quality === "Auto") return true;
    const num = parseInt(quality, 10);
    return !isNaN(num) && num >= 720;
}

function buildNewTvHeaders(ott) {
    return { ...NEW_TV_BASE_HEADERS, Ott: ott };
}

function buildNewTvPlayerHeaders(ott) {
    return { ...NEW_TV_BASE_HEADERS, Ott: ott, Usertoken: "" };
}

async function resolveApiUrl() {
    if (resolvedApiUrl) return resolvedApiUrl;
    for (const encoded of NEW_TV_DOMAINS) {
        const base = atob(encoded).replace(/\/$/, "");
        try {
            const res = await fetch(`${base}/checknewtv.php`, {
                headers: { ...NEW_TV_BASE_HEADERS, "User-Agent": USER_AGENT },
            });
            const data = await res.json();
            if (data && data.token_hash) {
                resolvedApiUrl = atob(data.token_hash).replace(/\/$/, "");
                return resolvedApiUrl;
            }
        } catch (_) { }
    }
    return null;
}

async function fetchJson(url, headers) {
    try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
    } catch (_) {
        return null;
    }
}

async function fetchFromNetflixDirect(tmdbId, mediaType, season, episode) {
    const url = mediaType === "tv"
        ? `${BASE_URL}/api/embed-tmdb/${tmdbId}?type=tv&s=${season}&e=${episode}`
        : `${BASE_URL}/api/embed-tmdb/${tmdbId}`;

    const data = await fetchJson(url, NET27_HEADERS);
    if (!data || data.ok !== true) return [];

    const subtitles = (data.captions || []).map(c => {
        const subUrl = c.url && c.url.startsWith("/") ? `${BASE_URL}${c.url}` : c.url;
        return { url: subUrl, language: c.lang || "en", name: c.name || "English", headers: PLAYBACK_HEADERS };
    });

    const streams = [];

    if (data.streams && data.streams.length > 0) {
        for (const stream of data.streams) {
            const quality = `${stream.resolution}p`;
            if (meetsQualityFilter(quality)) {
                streams.push({
                    name: `${PROVIDER} • ${quality}`,
                    title: `${PROVIDER} • ${quality}`,
                    url: stream.url,
                    quality,
                    headers: PLAYBACK_HEADERS,
                    subtitles,
                });
            }
        }
    } else if (data.mp4) {
        streams.push({
            name: `${PROVIDER} • Auto`,
            title: `${PROVIDER} • Auto`,
            url: data.mp4,
            quality: "Auto",
            headers: PLAYBACK_HEADERS,
            subtitles,
        });
    }

    return streams;
}

async function fetchEpisodesPage(seasonId, page, seasonNumber, ott, apiBase) {
    const episodes = [];
    let pg = page;
    while (true) {
        const data = await fetchJson(`${apiBase}/newtv/episodes.php?id=${seasonId}&page=${pg}`, buildNewTvHeaders(ott));
        if (!data || !data.episodes) break;
        for (const ep of data.episodes) {
            if (!ep) continue;
            const epNum = ep.ep ? parseInt(ep.ep) : ep.epNum ? parseInt(ep.epNum.replace("E", "")) : null;
            const sNum = seasonNumber || (ep.sNum ? parseInt(ep.sNum.replace("S", "")) : null);
            episodes.push({ id: ep.id, s: sNum, ep: epNum });
        }
        if (data.nextPageShow !== 1) break;
        pg++;
    }
    return episodes;
}

async function getAllEpisodes(postData, ott, apiBase) {
    const episodes = [];
    const selectedSeasonIdx = postData.season
        ? postData.season.findIndex(s => s.selected === true)
        : -1;
    const selectedSeasonId = selectedSeasonIdx >= 0
        ? postData.season[selectedSeasonIdx].id
        : postData.nextPageSeason;
    const selectedSeasonNumber = selectedSeasonIdx >= 0 ? selectedSeasonIdx + 1 : null;

    if (postData.episodes) {
        for (const ep of postData.episodes) {
            if (!ep) continue;
            const epNum = ep.ep ? parseInt(ep.ep) : ep.epNum ? parseInt(ep.epNum.replace("E", "")) : null;
            const sNum = selectedSeasonNumber || (ep.sNum ? parseInt(ep.sNum.replace("S", "")) : null);
            episodes.push({ id: ep.id, s: sNum, ep: epNum });
        }
    }

    const extraPageFetches = [];

    if (postData.nextPageShow === 1 && selectedSeasonId) {
        extraPageFetches.push(fetchEpisodesPage(selectedSeasonId, 2, selectedSeasonNumber, ott, apiBase));
    }

    if (postData.season) {
        for (let i = 0; i < postData.season.length; i++) {
            const s = postData.season[i];
            if (s.id && s.id !== selectedSeasonId) {
                extraPageFetches.push(fetchEpisodesPage(s.id, 1, i + 1, ott, apiBase));
            }
        }
    }

    const extra = await Promise.all(extraPageFetches);
    for (const batch of extra) episodes.push(...batch);

    return episodes;
}

async function fetchFromPlatform(platformKey, title, mediaType, season, episode) {
    const { ott } = PLATFORM_MAP[platformKey];
    const apiBase = await resolveApiUrl();
    if (!apiBase) return [];

    const searchData = await fetchJson(
        `${apiBase}/newtv/search.php?s=${encodeURIComponent(title)}`,
        buildNewTvHeaders(ott),
    );
    if (!searchData || !searchData.searchResult || searchData.searchResult.length === 0) return [];

    const contentId = searchData.searchResult[0].id;

    const postData = await fetchJson(
        `${apiBase}/newtv/post.php?id=${contentId}`,
        { ...buildNewTvPlayerHeaders(ott), Lastep: "" },
    );
    if (!postData) return [];

    let targetId;
    if (mediaType === "tv") {
        const episodes = await getAllEpisodes(postData, ott, apiBase);
        const target = episodes.find(ep => ep && ep.s === season && ep.ep === episode);
        if (!target) return [];
        targetId = target.id;
    } else {
        const isSeries = postData.type === "t" || (postData.episodes && postData.episodes.filter(e => e !== null).length > 0);
        if (isSeries) return [];
        targetId = postData.main_id || contentId;
    }

    const response = await fetchJson(
        `${apiBase}/newtv/player.php?id=${targetId}`,
        buildNewTvPlayerHeaders(ott),
    );
    if (!response || response.status !== "ok" || !response.video_link) return [];

    const label = platformKey.charAt(0).toUpperCase() + platformKey.slice(1);
    return [{
        name: `${PROVIDER} • ${label}`,
        title: `${PROVIDER} • ${label}`,
        url: response.video_link,
        quality: "Auto",
        headers: { Referer: response.referer || apiBase },
    }];
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const tmdbData = await fetchJson(
            `${TMDB_API}/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}?api_key=${TMDB_API_KEY}`,
            { "User-Agent": USER_AGENT, "Accept": "application/json" },
        );
        if (!tmdbData) return [];

        const title = mediaType === "tv" ? tmdbData.name : tmdbData.title;
        if (!title) return [];

        const [netflixDirect, ...platformResults] = await Promise.all([
            fetchFromNetflixDirect(tmdbId, mediaType, season, episode),
            ...["primevideo", "hotstar", "disney"].map(p =>
                fetchFromPlatform(p, title, mediaType, season, episode).catch(() => [])
            ),
        ]);

        let streams = [...(netflixDirect || [])];

        if (streams.length === 0) {
            streams = await fetchFromPlatform("netflix", title, mediaType, season, episode).catch(() => []);
        }

        for (const batch of platformResults) {
            if (batch && batch.length > 0) streams.push(...batch);
        }

        const seen = new Set();
        return streams.filter(s => {
            if (!s.url || !meetsQualityFilter(s.quality) || seen.has(s.url)) return false;
            seen.add(s.url);
            return true;
        });
    } catch (_) {
        return [];
    }
}

module.exports = { getStreams };