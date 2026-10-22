const PROVIDER = "EZTV";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY)
  ? TMDB_API_KEY
  : ((typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY) ? globalThis.TMDB_API_KEY : "307b7b8ef035c6aa336900aef4e203bd");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json"
};

const EZTV_DOMAINS = [
  "https://eztvx.to",
  "https://eztv.wf",
  "https://eztv.tf",
  "https://eztv.re"
];

async function fetchJson(url, timeoutMs = 6000) {
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

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "";
  const b = parseInt(bytes, 10);
  if (b >= 1024 * 1024 * 1024) {
    return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }
  if (b >= 1024 * 1024) {
    return (b / (1024 * 1024)).toFixed(0) + " MB";
  }
  return b + " B";
}

function parseQuality(title) {
  const t = (title || "").toLowerCase();
  if (/2160p|4k|uhd/.test(t)) return "2160p";
  if (/1080p/.test(t)) return "1080p";
  if (/720p/.test(t)) return "720p";
  if (/480p/.test(t)) return "480p";
  return "720p";
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType !== "tv" && mediaType !== "series") return [];

    const tmdbUrl = `${TMDB_API}/tv/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`;
    const tmdbData = await fetchJson(tmdbUrl);
    if (!tmdbData) return [];

    const rawImdb = tmdbData.external_ids?.imdb_id || "";
    if (!rawImdb) return [];

    const candidateIds = [
      rawImdb.replace(/^tt/, ""),
      rawImdb.replace(/^tt0*/, "")
    ];

    let torrents = [];
    for (const domain of EZTV_DOMAINS) {
      for (const cid of candidateIds) {
        if (!cid) continue;
        const data = await fetchJson(`${domain}/api/get-torrents?imdb_id=${cid}&limit=100`);
        if (data?.torrents?.length) {
          torrents = data.torrents;
          break;
        }
      }
      if (torrents.length) break;
    }

    if (!torrents.length) return [];

    const results = [];
    const sNum = parseInt(season, 10);
    const eNum = parseInt(episode, 10);
    const seRegex = new RegExp(`S0*${sNum}E0*${eNum}\\b`, 'i');

    for (const t of torrents) {
      if (!t.magnet_url) continue;

      const tSeason = parseInt(t.season, 10);
      const tEpisode = parseInt(t.episode, 10);

      const matches = (tSeason === sNum && tEpisode === eNum) || seRegex.test(t.title || "");
      if (!matches) continue;

      const quality = parseQuality(t.title);
      const sizeStr = formatBytes(t.size_bytes);
      const seeds = t.seeds || 0;
      const cleanTitle = (t.title || "").replace(/\[eztv.*\]/i, "").trim();
      const name = `${PROVIDER} • ${cleanTitle} [${quality} • ${sizeStr} • ${seeds} seeds]`;

      results.push({
        name,
        title: name,
        url: t.magnet_url,
        quality,
        size: sizeStr,
        isTorrent: true,
        seeds
      });
    }

    results.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
    return results;
  } catch {
    return [];
  }
}

module.exports = { getStreams };
