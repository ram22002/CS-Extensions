"use strict";

const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const CINEMACITY_BASE_URL = atob("aHR0cHM6Ly9jaW5lbWFjaXR5LmNj");
const REVERSE_PROXY_ORIGIN = "https://" + atob("Y2MucmVhbGJlc3RpYS5jb20=");
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const SITEMAP_FEED_URL = `${CINEMACITY_BASE_URL}/news_pages.xml`;
const SITEMAP_CACHE_TTL_MS = 3_600_000;
const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const DEFAULT_PROXY_HEADERS = { "User-Agent": DEFAULT_USER_AGENT };
const TITLE_STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "in", "on", "to", "for", "at", "by", "is", "it",
  "il", "lo", "la", "gli", "le", "un", "uno", "una", "di", "da", "del", "della", "dei", "e", "o", "con", "per", "su", "tra", "fra",
]);

let sitemapCatalogCache = null;

function normalizeHttpHeaders(headers) {
  if (!headers || typeof headers !== "object") return headers;
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    const lowerKey = String(key).toLowerCase();
    if (lowerKey === "user-agent") normalized["User-Agent"] = value;
    else if (lowerKey === "referer" || lowerKey === "referrer") normalized["Referer"] = value;
    else if (lowerKey === "origin") normalized["Origin"] = value;
    else if (lowerKey === "accept") normalized["Accept"] = value;
    else if (lowerKey === "accept-language") normalized["Accept-Language"] = value;
    else normalized[key] = value;
  }
  return normalized;
}

async function fetchViaProxy(url) {
  const parsed = url.startsWith("http") ? new URL(url) : null;
  const path = parsed ? parsed.pathname + parsed.search : url;
  const target = REVERSE_PROXY_ORIGIN.replace(/\/+$/, "") + (path.startsWith("/") ? path : "/" + path);
  const res = await fetch(target, { headers: DEFAULT_PROXY_HEADERS });
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  return res.text();
}

function resolveAbsoluteUrl(base, relative) {
  try { return new URL(relative, base).toString(); } catch (_) { return relative; }
}

function isNotWebReadyStream(stream, providerName) {
  const combined = [stream?.url, stream?.name, stream?.title, stream?.server, providerName]
    .filter(Boolean).join(" ").toLowerCase();
  return combined.includes("loadm") || combined.includes("mixdrop") || combined.includes("mxcontent");
}

function toProviderSlug(name) {
  const slug = String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return slug || undefined;
}

function buildStreamDescriptor(stream, providerName, mediaMeta = null) {
  if (!stream) return stream;

  const rawQuality = (stream.quality || "1080p").toLowerCase();
  let normalizedQuality = "1080p";
  if (rawQuality.includes("4k") || rawQuality.includes("2160")) normalizedQuality = "4K";
  else if (rawQuality.includes("1440")) normalizedQuality = "1440p";
  else if (rawQuality.includes("1080")) normalizedQuality = "1080p";
  else if (rawQuality.includes("720")) normalizedQuality = "720p";
  else if (rawQuality.includes("480")) normalizedQuality = "480p";
  else if (rawQuality.includes("360")) normalizedQuality = "360p";
  else normalizedQuality = stream.quality || "1080p";

  const isHighQuality = normalizedQuality === "4K" ||
    (stream.url && (stream.url.includes("hq") || stream.url.includes("hevc")));
  const audioCodec = isHighQuality ? "DD5.1" : "AAC";
  const videoCodec = (normalizedQuality === "4K" || (stream.url && stream.url.includes("hevc")))
    ? "HEVC" : "H.264";

  const runtime = mediaMeta?.runtime ?? stream.runtime;
  const displayName = providerName || stream.providerName || stream.name || "CinemaCity";

  const qualityLabel = runtime
    ? `${normalizedQuality} • ${runtime} minutes\n${videoCodec} • ${audioCodec}`
    : `${normalizedQuality}\n${videoCodec} • ${audioCodec}`;

  const behaviorHints = stream.behaviorHints && typeof stream.behaviorHints === "object"
    ? { ...stream.behaviorHints } : {};

  let mergedHeaders = { ...(stream.headers || {}) };
  if (behaviorHints.proxyHeaders?.request) Object.assign(mergedHeaders, behaviorHints.proxyHeaders.request);
  else if (behaviorHints.headers) Object.assign(mergedHeaders, behaviorHints.headers);
  mergedHeaders = Object.keys(mergedHeaders).length ? normalizeHttpHeaders(mergedHeaders) : null;

  const isStreamingCommunity =
    String(providerName || "").toLowerCase() === "streamingcommunity" ||
    String(stream?.name || "").toLowerCase().includes("streamingcommunity");

  if (isStreamingCommunity && !mergedHeaders) {
    delete behaviorHints.proxyHeaders;
    delete behaviorHints.headers;
    delete behaviorHints.notWebReady;
  }
  if (mergedHeaders) {
    behaviorHints.proxyHeaders = { ...(behaviorHints.proxyHeaders || {}), request: mergedHeaders };
    behaviorHints.headers = mergedHeaders;
  }

  const providerExplicitlySetNotWebReady = stream.behaviorHints && "notWebReady" in stream.behaviorHints;
  if (!isStreamingCommunity && isNotWebReadyStream(stream, providerName)) {
    behaviorHints.notWebReady = true;
  } else if (!providerExplicitlySetNotWebReady) {
    delete behaviorHints.notWebReady;
  }

  const referer = stream.referer ?? mergedHeaders?.Referer ?? mergedHeaders?.referer;
  const userAgent = stream.userAgent ?? mergedHeaders?.["User-Agent"] ?? mergedHeaders?.["user-agent"];

  const { quality: _q, language: _l, ...streamBase } = stream;

  return {
    ...streamBase,
    name: displayName,
    title: displayName,
    quality: qualityLabel,
    _nuvio_formatted: true,
    behaviorHints,
    provider: stream.provider || toProviderSlug(providerName),
    referer, userAgent,
    headers: mergedHeaders,
  };
}

function decodeHtmlEntities(str) {
  return String(str || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&ndash;|&mdash;/g, "-").replace(/\u2013|\u2014/g, "-");
}

function normalizeTitle(value) {
  return decodeHtmlEntities(String(value || ""))
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

const compactTitle = (value) => normalizeTitle(value).replace(/\s+/g, "");

function extractReleaseYear(meta) {
  const raw = meta?.release_date || meta?.first_air_date || "";
  const year = Number.parseInt(String(raw).slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

function tokenizeTitle(value) {
  return normalizeTitle(value).split(/\s+/).filter(token => token.length > 1 && !TITLE_STOPWORDS.has(token));
}

function parseSitemapEntries(xml) {
  const entries = [];
  const pattern = /<loc>(https:\/\/cinemacity\.cc\/(movies|tv-series)\/\d+-([a-z0-9-]+)\.html)<\/loc>/gi;
  let match;
  while ((match = pattern.exec(String(xml || ""))) !== null) {
    const [, url, kind, slug] = match;
    const yearMatch = slug.match(/-(\d{4})$/);
    const year = yearMatch ? Number.parseInt(yearMatch[1], 10) : null;
    const title = (yearMatch ? slug.slice(0, -5) : slug).replace(/-/g, " ");
    entries.push({
      url, kind, title,
      normalizedTitle: normalizeTitle(title),
      compactTitle: compactTitle(title),
      tokens: tokenizeTitle(title),
      year: Number.isInteger(year) ? year : null,
    });
  }
  return entries;
}

async function fetchSitemapCatalog() {
  if (sitemapCatalogCache && sitemapCatalogCache.expiresAt > Date.now()) return sitemapCatalogCache.entries;

  const sitemapPath = new URL(SITEMAP_FEED_URL).pathname;
  const buildPageUrl = (page) => `${REVERSE_PROXY_ORIGIN.replace(/\/+$/, "")}${sitemapPath}?page=${page}&perPage=500`;

  const firstPageRes = await fetch(buildPageUrl(1), { headers: DEFAULT_PROXY_HEADERS });
  if (firstPageRes.ok) {
    const totalEntries = parseInt(firstPageRes.headers.get("x-total-entries") || "0", 10);
    let entries = parseSitemapEntries(await firstPageRes.text());

    if (totalEntries > 0) {
      const totalPages = Math.ceil(totalEntries / 500);
      const remainingXml = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          fetch(buildPageUrl(i + 2), { headers: DEFAULT_PROXY_HEADERS })
            .then(r => r.ok ? r.text() : "")
            .catch(() => "")
        )
      );
      for (const xml of remainingXml) if (xml) entries = entries.concat(parseSitemapEntries(xml));
    } else if (entries.length >= 1800) {
      sitemapCatalogCache = { entries, expiresAt: Date.now() + SITEMAP_CACHE_TTL_MS };
      return entries;
    }

    if (entries.length > 0) {
      sitemapCatalogCache = { entries, expiresAt: Date.now() + SITEMAP_CACHE_TTL_MS };
      return entries;
    }
  }

  const fallbackRes = await fetch(
    `${REVERSE_PROXY_ORIGIN.replace(/\/+$/, "")}${sitemapPath}`,
    { headers: DEFAULT_PROXY_HEADERS }
  );
  if (!fallbackRes.ok) throw new Error(`Sitemap proxy HTTP ${fallbackRes.status}`);
  const entries = parseSitemapEntries(await fallbackRes.text());
  sitemapCatalogCache = { entries, expiresAt: Date.now() + SITEMAP_CACHE_TTL_MS };
  return entries;
}

function scoreCatalogEntry(entry, candidateTitles, releaseYear) {
  let highestScore = 0;
  for (const title of candidateTitles) {
    const normalized = normalizeTitle(title);
    const compact = compactTitle(title);
    if (!normalized || !compact) continue;

    let score = 0;
    if (entry.normalizedTitle === normalized || entry.compactTitle === compact) {
      score = 1000;
    } else if (entry.normalizedTitle.startsWith(normalized) || normalized.startsWith(entry.normalizedTitle)) {
      score = 500;
    } else if (entry.compactTitle.includes(compact) || compact.includes(entry.compactTitle)) {
      score = 420;
    } else {
      const expectedTokens = tokenizeTitle(title);
      if (expectedTokens.length && entry.tokens.length) {
        const entryTokenSet = new Set(entry.tokens);
        const matchedCount = expectedTokens.filter(t => entryTokenSet.has(t)).length;
        const coverageRatio = matchedCount / expectedTokens.length;
        const excessTokens = Math.max(0, entry.tokens.length - expectedTokens.length);
        score = coverageRatio * 300 - excessTokens * 20 - Math.abs(entry.tokens.length - expectedTokens.length) * 2;
      }
    }
    if (releaseYear && entry.year) score += entry.year === releaseYear ? 50 : -Math.abs(entry.year - releaseYear) * 3;
    highestScore = Math.max(highestScore, score);
  }
  return highestScore;
}

async function fetchTmdbMetadata(tmdbId, providerType) {
  try {
    const mediaType = providerType === "movie" ? "movie" : "tv";
    const res = await fetch(
      `${TMDB_API_BASE_URL}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids`
    );
    return res.ok ? await res.json() : null;
  } catch (_) { return null; }
}

async function fetchTmdbEpisodeTitle(tmdbId, season, episode) {
  try {
    const res = await fetch(`${TMDB_API_BASE_URL}/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}`);
    if (!res.ok) return "";
    const data = await res.json();
    return data?.episodes?.find(ep => ep.episode_number === parseInt(episode, 10))?.name ?? "";
  } catch (_) { return ""; }
}

function extractImdbId(html) {
  const matches = String(html || "").match(/\btt\d{5,}\b/gi) || [];
  return matches.find(id => /^tt\d{5,}$/i.test(id))?.toLowerCase() ?? null;
}

async function resolveImdbIdFromPage(candidateUrl, expectedImdbId) {
  const id = String(expectedImdbId || "").trim().toLowerCase();
  if (!/^tt\d{5,}$/.test(id)) return null;
  try {
    return extractImdbId(await fetchViaProxy(candidateUrl));
  } catch (_) { return null; }
}

function buildCdnStreamUrl(fileVal) {
  const publicFilesMarker = "/public_files/";
  const markerIndex = fileVal.indexOf(publicFilesMarker);
  if (markerIndex === -1) return null;
  const cdnBase = fileVal.substring(0, markerIndex + publicFilesMarker.length);
  const rest = fileVal.substring(markerIndex + publicFilesMarker.length);
  const parts = rest.split(",");
  const mp4File = parts.find(p => p.includes("1080p") && p.endsWith(".mp4")) || parts.find(p => p.endsWith(".mp4"));
  if (!mp4File) return null;
  const hasHlsManifest = parts.find(p => p.includes(".m3u8"));
  return cdnBase + rest + (hasHlsManifest ? "" : ".urlset/master.m3u8");
}

function extractAtobStreamSource(html, season, episode) {
  const atobPattern = /atob\s*\(\s*['"]([^"']{20,})['"]\s*\)/gi;
  let match;
  while ((match = atobPattern.exec(html)) !== null) {
    try {
      const decoded = atob(match[1]);
      if (!decoded || decoded.length < 20) continue;
      const fileMatch = decoded.match(/file\s*:\s*'(\[.*?\])'/s);
      if (!fileMatch) continue;
      const parsed = JSON.parse(fileMatch[1]);
      if (!Array.isArray(parsed) || !parsed.length) continue;
      if (parsed[0].folder && Array.isArray(parsed[0].folder)) {
        const seasonObj = parsed[(season || 1) - 1];
        if (seasonObj?.folder) {
          const episodeObj = seasonObj.folder[(episode || 1) - 1];
          if (episodeObj?.file) { const url = buildCdnStreamUrl(episodeObj.file); if (url) return url; }
        }
      }
      if (parsed[0].file?.startsWith("http")) {
        const url = buildCdnStreamUrl(parsed[0].file);
        if (url) return url;
      }
    } catch (_) { }
  }
  return null;
}

function extractMediaLinks(html) {
  const links = [];
  const anchorPattern = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[1].trim();
    const linkText = match[2].replace(/<[^>]+>/g, "").trim();
    if (!/\.(mp4|m3u8|mkv|avi|mov|webm)([?#].*)?$/i.test(href) || href.length < 10) continue;
    links.push({ url: href, text: linkText.toLowerCase() });
  }
  return links;
}

async function resolveCatalogEntry(tmdbId, providerType, metadata) {
  const imdbId = metadata?.imdb_id ?? metadata?.external_ids?.imdb_id ?? null;
  const candidateTitles = [...new Set(
    [metadata?.title, metadata?.name, metadata?.original_title, metadata?.original_name].filter(Boolean)
  )];
  if (!candidateTitles.length) return null;

  const releaseYear = extractReleaseYear(metadata);
  const contentKind = providerType === "movie" ? "movies" : "tv-series";
  const runtime = typeof metadata?.runtime === "number" && metadata.runtime > 0
    ? metadata.runtime
    : Array.isArray(metadata?.episode_run_time) && metadata.episode_run_time.length
      ? metadata.episode_run_time[0] : null;

  const catalogEntries = await fetchSitemapCatalog();

  let topEntry = null, topScore = -Infinity;
  const qualifiedEntries = [];

  for (const entry of catalogEntries) {
    if (entry.kind !== contentKind) continue;
    const score = scoreCatalogEntry(entry, candidateTitles, releaseYear);
    if (score >= 250) qualifiedEntries.push({ entry, score });
    if (score > topScore) { topScore = score; topEntry = entry; }
  }

  if (!topEntry || topScore < 250) return null;

  if (imdbId) {
    qualifiedEntries.sort((a, b) => b.score - a.score);
    for (const { entry } of qualifiedEntries.slice(0, 3)) {
      const resolvedId = await resolveImdbIdFromPage(entry.url, imdbId);
      if (resolvedId === imdbId) return { url: entry.url, title: candidateTitles[0] || entry.title, year: releaseYear ?? entry.year, runtime };
      if (resolvedId && resolvedId !== imdbId) continue;
    }
    if (topScore < 950) return null;
  }

  return { url: topEntry.url, title: candidateTitles[0] || topEntry.title, year: releaseYear ?? topEntry.year, runtime };
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const providerType = mediaType === "tv" ? "tv" : "movie";
    if (providerType === "tv" && (season == null || episode == null)) return [];

    const [metadata] = await Promise.all([
      fetchTmdbMetadata(tmdbId, providerType),
      fetchSitemapCatalog().catch(() => null),
    ]);
    if (!metadata) return [];

    const catalogMatch = await resolveCatalogEntry(tmdbId, providerType, metadata);
    if (!catalogMatch?.url) return [];

    const cleanTitle = (catalogMatch.title || "").replace(/\s*\(.*?\)\s*/g, "").trim();

    const [pageHtml, episodeTitle] = await Promise.all([
      fetchViaProxy(catalogMatch.url).catch(() => null),
      providerType === "tv" ? fetchTmdbEpisodeTitle(tmdbId, season, episode) : Promise.resolve(""),
    ]);

    if (!pageHtml || pageHtml.length < 500 || pageHtml.includes("Just a moment") ||
      (pageHtml.includes("admin") && pageHtml.includes("Unlimited"))) return [];

    const mediaLinks = extractMediaLinks(pageHtml);

    if (!mediaLinks.length) {
      const streamUrl = extractAtobStreamSource(
        pageHtml,
        providerType === "tv" ? season : null,
        providerType === "tv" ? episode : null
      );
      if (streamUrl) mediaLinks.push({ url: streamUrl, text: "" });
    }

    if (!mediaLinks.length) return [];

    const chosenUrl = mediaLinks.find(l => !/eng|sub/.test(l.text))?.url ?? mediaLinks[0].url;

    const resolvedStreamUrl = resolveAbsoluteUrl(catalogMatch.url, chosenUrl);
    const streamMediaMeta = {
      title: cleanTitle,
      year: catalogMatch.year,
      mediaType: providerType,
      season: providerType === "tv" ? season : null,
      episode: providerType === "tv" ? episode : null,
      episodeTitle,
      runtime: catalogMatch.runtime,
    };

    return [buildStreamDescriptor(
      {
        name: "CinemaCity",
        title: cleanTitle,
        url: resolvedStreamUrl,
        quality: "1080p",
        behaviorHints: { notWebReady: true },
        headers: { "Referer": `${CINEMACITY_BASE_URL}/`, "User-Agent": DEFAULT_USER_AGENT },
      },
      "CinemaCity",
      streamMediaMeta
    )];
  } catch (_) { return []; }
}

module.exports = { getStreams };