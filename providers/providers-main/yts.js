const PROVIDER = "YTS";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY)
  ? TMDB_API_KEY
  : ((typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY) ? globalThis.TMDB_API_KEY : "307b7b8ef035c6aa336900aef4e203bd");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json"
};

const YTS_DOMAINS = [
  "https://yts.bz",
  "https://yts.lt",
  "https://yts.do",
  "https://yts.mx"
];

const TRACKERS = [
  "udp://open.demonii.com:1337/announce",
  "udp://tracker.openbittorrent.com:80",
  "udp://tracker.coppersurfer.tk:6969",
  "udp://glotorrents.pw:6969/announce",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://torrent.gresille.org:80/announce",
  "udp://p4p.arenabg.com:1337",
  "udp://tracker.leechers-paradise.org:6969"
];
const TR_PARAMS = TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join("");

async function fetchJson(url, timeoutMs = 7000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType === "tv") return [];

    const tmdbUrl = `${TMDB_API}/movie/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`;
    const tmdbData = await fetchJson(tmdbUrl);
    if (!tmdbData) return [];

    const title = tmdbData.title || tmdbData.original_title || "";
    const year = (tmdbData.release_date || "").slice(0, 4);
    const imdbId = tmdbData.external_ids?.imdb_id || "";

    let ytsData = null;
    for (const domain of YTS_DOMAINS) {
      if (imdbId) {
        ytsData = await fetchJson(`${domain}/api/v2/list_movies.json?query_term=${encodeURIComponent(imdbId)}&limit=5`);
        if (ytsData?.data?.movies?.length) break;
      }
      if (title) {
        const q = year ? `${title} ${year}` : title;
        ytsData = await fetchJson(`${domain}/api/v2/list_movies.json?query_term=${encodeURIComponent(q)}&limit=5`);
        if (ytsData?.data?.movies?.length) break;
      }
    }

    const movies = ytsData?.data?.movies || [];
    if (!movies.length) return [];

    const movie = movies[0];
    const torrents = movie.torrents || [];
    const results = [];

    for (const t of torrents) {
      if (!t.hash) continue;
      const quality = t.quality === "2160p" ? "2160p" : (t.quality || "720p");
      const seeds = t.seeds || 0;
      const sizeStr = t.size || "";
      const name = `${PROVIDER} • ${movie.title} [${quality} • ${sizeStr} • ${seeds} seeds]`;
      const magnet = `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title)}${TR_PARAMS}`;

      results.push({
        name,
        title: name,
        url: magnet,
        quality,
        size: sizeStr,
        isTorrent: true,
        seeds
      });
    }

    // Sort by resolution descending then seeds descending
    const qualityWeight = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1 };
    results.sort((a, b) => {
      const wA = qualityWeight[a.quality] || 0;
      const wB = qualityWeight[b.quality] || 0;
      if (wB !== wA) return wB - wA;
      return (b.seeds || 0) - (a.seeds || 0);
    });

    return results;
  } catch {
    return [];
  }
}

module.exports = { getStreams };
