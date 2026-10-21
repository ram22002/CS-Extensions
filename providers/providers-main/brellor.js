const PROVIDER = "Internet Archive";
const BASE_URL = "https://archive.org";
const TMDB_API = "https://api.themoviedb.org/3";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36";
const HEADERS = { "User-Agent": USER_AGENT, "Accept": "application/json" };

async function getTmdbDetails(tmdbId, mediaType) {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  const res = await fetch(`${TMDB_API}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`, { headers: HEADERS });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data) return null;
  return {
    title: mediaType === "tv" ? (data.name || "") : (data.title || ""),
    year: (data.release_date || data.first_air_date || "").slice(0, 4),
  };
}

async function archiveGetJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function searchArchive(title, year) {
  let q = `title:(${title}) AND mediatype:movies`;
  if (year) {
    const y = parseInt(year, 10);
    if (!isNaN(y)) q += ` AND year:[${y - 1} TO ${y + 1}]`;
  }
  const url = `${BASE_URL}/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=year&sort[]=downloads+desc&rows=5&output=json`;
  const data = await archiveGetJson(url);
  return (data && data.response && data.response.docs) ? data.response.docs : [];
}

async function getMetadata(identifier) {
  return archiveGetJson(`${BASE_URL}/metadata/${encodeURIComponent(identifier)}`);
}

function guessQuality(name) {
  const n = (name || "").toLowerCase();
  if (/2160|4k|uhd/.test(n)) return "2160p";
  if (/1080/.test(n)) return "1080p";
  if (/720/.test(n)) return "720p";
  if (/480/.test(n)) return "480p";
  if (/360/.test(n)) return "360p";
  return "Auto";
}

function serveUrl(identifier, fileName) {
  return `${BASE_URL}/serve/${encodeURIComponent(identifier)}/${fileName.split("/").map(encodeURIComponent).join("/")}`;
}

async function streamsForIdentifier(identifier) {
  const d = await getMetadata(identifier);
  if (!d) return [];

  const mp4s = (d.files || [])
    .filter(f => /\.mp4$/i.test(f.name || ""))
    .map(f => ({ name: f.name, size: parseInt(f.size || "0", 10) || 0 }));

  const big = mp4s.filter(f => f.size >= 50 * 1024 * 1024);
  const pool = (big.length ? big : mp4s).sort((a, b) => b.size - a.size).slice(0, 3);
  if (!pool.length) return [];

  const itemTitle = (d.metadata || {}).title || identifier;

  return pool.map(f => {
    const quality = guessQuality(f.name);
    return {
      name: `${PROVIDER} \u2022 ${itemTitle}`,
      title: `${PROVIDER} \u2022 ${itemTitle}`,
      url: serveUrl(identifier, f.name),
      quality: quality,
      headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/details/${identifier}` },
    };
  });
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType === "tv") return [];

    const details = await getTmdbDetails(tmdbId, mediaType);
    if (!details || !details.title) return [];

    const docs = await searchArchive(details.title, details.year);
    if (!docs.length) return [];

    const results = await Promise.all(docs.slice(0, 3).map(doc => streamsForIdentifier(doc.identifier)));

    const seen = new Set();
    return results.flat().filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
  } catch {
    return [];
  }
}

module.exports = { getStreams };