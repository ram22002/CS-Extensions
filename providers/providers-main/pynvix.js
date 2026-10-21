"use strict";

const CryptoJS = require("crypto-js");
const cheerio = require("cheerio-without-node-native");
const DEFAULT_API_BASE = "https://id-mapping-api-showbox-proxy.hf.space/api/media";
const TMDB_BASE_URL    = "https://api.themoviedb.org/3";
const TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd"
const WORKING_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "Accept":          "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type":    "application/json",
};

function parseRawToken(rawToken) {
  const t = String(rawToken).trim();
  if (!t) return "";
  if (t.startsWith("eyJ")) {
    try {
      const parsedWords   = CryptoJS.enc.Base64.parse(t);
      const decodedStr    = parsedWords.toString(CryptoJS.enc.Utf8);
      const parsed        = JSON.parse(decodedStr);
      if (parsed && parsed.encrypt_data) {
        const IV_KEY  = "wEiphTn!";
        const DES_KEY = "123d6cedf626dy54233aa1w6";
        const key     = CryptoJS.enc.Utf8.parse(DES_KEY);
        const iv      = CryptoJS.enc.Utf8.parse(IV_KEY);
        const decrypted = CryptoJS.TripleDES.decrypt(
          parsed.encrypt_data, key,
          { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
        );
        const decryptedJson = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
        if (decryptedJson && decryptedJson.uid) return String(decryptedJson.uid);
      }
    } catch (e) {}
  }
  return t;
}

function getAllUiTokens() {
  try {
    const settings = (typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS) || {};
    const raw = [];
    if (settings.uiToken)  raw.push(String(settings.uiToken));
    if (settings.uiTokens) raw.push(String(settings.uiTokens));

    const tokens = raw
      .join(",")
      .split(/[,\n]+/)
      .map(t => parseRawToken(t))
      .filter(Boolean);

    return [...new Set(tokens)];
  } catch {
    return [];
  }
}

function getEnabledQualities() {
  return new Set(["4K", "1080p", "Original"]);
}

function getQualityFromName(qualityStr) {
  if (!qualityStr) return "Unknown";
  const q = qualityStr.toUpperCase();
  if (q === "ORG"   || q === "ORIGINAL") return "Original";
  if (q === "4K"    || q === "2160P")    return "4K";
  if (q === "1440P" || q === "2K")       return "1440p";
  if (q === "1080P" || q === "FHD")      return "1080p";
  if (q === "720P"  || q === "HD")       return "720p";
  if (q === "480P"  || q === "SD")       return "480p";
  if (q === "360P")                      return "360p";
  if (q === "240P")                      return "240p";
  const match = qualityStr.match(/(\d{3,4})[pP]?/);
  if (match) {
    const res = parseInt(match[1], 10);
    if (res >= 2160) return "4K";
    if (res >= 1440) return "1440p";
    if (res >= 1080) return "1080p";
    if (res >= 720)  return "720p";
    if (res >= 480)  return "480p";
    if (res >= 360)  return "360p";
    return "240p";
  }
  return "Unknown";
}

function formatFileSize(sizeStr) {
  if (!sizeStr) return "Unknown";
  if (typeof sizeStr === "string" && /GB|MB|KB/.test(sizeStr)) return sizeStr;
  if (typeof sizeStr === "number") {
    const gb = sizeStr / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${(sizeStr / (1024 * 1024)).toFixed(2)} MB`;
  }
  return String(sizeStr);
}

function getApiBase() {
  try {
    const settings = (typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS) || {};
    if (settings.apiBase) return String(settings.apiBase);
  } catch { }
  return DEFAULT_API_BASE;
}

function validateIds(tmdbId, mediaType, seasonNum, episodeNum) {
  const idStr = String(tmdbId).trim();
  if (!/^\d+$/.test(idStr) || parseInt(idStr) <= 0) return false;
  if (mediaType === "tv") {
    if (seasonNum == null || episodeNum == null) return false;
    const ssn = parseInt(String(seasonNum).trim());
    const ep  = parseInt(String(episodeNum).trim());
    if (isNaN(ssn) || isNaN(ep) || ssn < 1 || ep < 1) return false;
  }
  return true;
}

async function getTMDBDetails(tmdbId, mediaType) {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  try {
    const res = await fetch(`${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_KEY}`);
    if (!res.ok) {
      return { title: `TMDB ID ${tmdbId}`, year: null };
    }
    const data = await res.json();
    const title       = mediaType === "tv" ? data.name : data.title;
    const releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
    const year        = releaseDate ? parseInt(releaseDate.split("-")[0], 10) : null;
    return { title, year };
  } catch {
    return { title: `TMDB ID ${tmdbId}`, year: null };
  }
}

async function fetchProxyWithTokenFallback(proxyUrl, tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    try {
      const response = await fetch(proxyUrl, {
        headers: Object.assign({}, WORKING_HEADERS, { "X-FebBox-Token": token }),
      });

      if (response.ok) {
        const data = await response.json();
        return { data, token };
      }

      if (response.status === 401 || response.status === 403 || response.status === 429) {
        continue;
      }

      return null;
    } catch {
      continue;
    }
  }
  return null;
}

async function extractFebBoxShare(showboxId, mediaType, seasonNum, episodeNum, uiToken, enabledQualities) {
  const streams = [];
  try {
    const boxType      = mediaType === "tv" ? 2 : 1;
    const sharePageUrl = `https://www.febbox.com/mbp/to_share_page?box_type=${boxType}&mid=${showboxId}&json=1`;

    const shareRes = await fetch(sharePageUrl).then(r => r.json()).catch(() => null);
    if (!shareRes || shareRes.code !== 1 || !shareRes.data) return [];

    const shareLink = shareRes.data.share_link || shareRes.data.shareLink;
    if (!shareLink) return [];

    const shareKey = new URL(shareLink).pathname.split("/").pop();
    if (!shareKey) return [];

    const listRes = await fetch(
      `https://www.febbox.com/file/file_share_list?share_key=${shareKey}`,
      { headers: { "Accept-Language": "en" } }
    ).then(r => r.json()).catch(() => null);
    if (!listRes || listRes.code !== 1 || !listRes.data || !listRes.data.file_list) return [];

    let fids = [];
    if (mediaType === "movie") {
      fids = listRes.data.file_list;
    } else {
      const seasonName   = `season ${seasonNum}`;
      const seasonFolder = listRes.data.file_list.find(
        f => f.file_name && f.file_name.toLowerCase() === seasonName
      );
      if (!seasonFolder) return [];

      const seasonListRes = await fetch(
        `https://www.febbox.com/file/file_share_list?share_key=${shareKey}&parent_id=${seasonFolder.fid}&page=1`,
        { headers: { "Accept-Language": "en" } }
      ).then(r => r.json()).catch(() => null);
      if (!seasonListRes || seasonListRes.code !== 1 || !seasonListRes.data || !seasonListRes.data.file_list) return [];

      const seasonSlug  = String(seasonNum).padStart(2, "0");
      const episodeSlug = String(episodeNum).padStart(2, "0");
      fids = seasonListRes.data.file_list.filter(f =>
        f.file_name && (
          f.file_name.toLowerCase().includes(`s${seasonSlug}e${episodeSlug}`) ||
          f.file_name.toLowerCase().includes(`s${seasonNum}e${episodeNum}`)
        )
      );
    }

    const videoHeaders = {
      "Accept":          "*/*",
      "Accept-Language": "en-US,en;q=0.8",
      "Connection":      "keep-alive",
      "Range":           "bytes=0-",
      "Referer":         "https://www.febbox.com/",
      "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    };
    const formattedCookie = uiToken.startsWith("ui=") ? uiToken : `ui=${uiToken}`;

    await Promise.all(fids.map(async (file) => {
      try {
        const qualityRes = await fetch(
          `https://www.febbox.com/console/video_quality_list?fid=${file.fid}&share_key=${shareKey}`,
          { headers: { "Cookie": formattedCookie } }
        ).then(r => r.json()).catch(() => null);
        if (!qualityRes || !qualityRes.html) return;

        const $ = cheerio.load(qualityRes.html);
        $("div.file_quality").each((_, el) => {
          const $quality     = $(el);
          const streamUrl    = $quality.attr("data-url");
          const qualityLabel = $quality.attr("data-quality");
          const sizeText     = $quality.find(".size").text().trim();
          if (!streamUrl) return;

          const normalizedQuality = getQualityFromName(qualityLabel);
          if (!enabledQualities.has(normalizedQuality)) return;

          streams.push({
            name:    `FebBox \u2022  ${normalizedQuality}`,
            title:    `FebBox \u2022  ${normalizedQuality}`,
            url:     streamUrl,
            quality: normalizedQuality,
            size:    sizeText || file.file_size || "Unknown",
            headers: videoHeaders,
          });
        });
      } catch {}
    }));
  } catch {}
  return streams;
}

function processShowBoxResponse(data, mediaInfo, mediaType, seasonNum, episodeNum, enabledQualities) {
  const streams = [];
  try {
    if (!data || data.success !== true) return streams;
    if (!Array.isArray(data.versions) || !data.versions.length) return streams;

    let streamTitle = mediaInfo.title || "Unknown Title";
    if (mediaInfo.year) streamTitle += ` (${mediaInfo.year})`;
    if (mediaType === "tv" && seasonNum && episodeNum) {
      streamTitle = `${mediaInfo.title || "Unknown"} S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`;
      if (mediaInfo.year) streamTitle += ` (${mediaInfo.year})`;
    }

    data.versions.forEach((version, versionIndex) => {
      if (!Array.isArray(version.links)) return;
      version.links.forEach((link) => {
        if (!link.url) return;
        const normalizedQuality = getQualityFromName(link.quality || "Unknown");
        if (!enabledQualities.has(normalizedQuality)) return;

        let streamName = "ShowBox";
        if (data.versions.length > 1) streamName += ` V${versionIndex + 1}`;
        streamName += ` ${normalizedQuality}`;

        streams.push({
          name:    streamName,
          title:   streamTitle,
          url:     link.url,
          quality: normalizedQuality,
          size:    formatFileSize(link.size || version.size || "Unknown"),
          speed:   link.speed || null,
        });
      });
    });
  } catch {}
  return streams;
}

async function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  if (!validateIds(tmdbId, mediaType, seasonNum, episodeNum)) return [];

  const tokens          = getAllUiTokens();
  const enabledQualities = getEnabledQualities();
  const apiBase         = getApiBase();

  if (!tokens.length) return [];

  try {
    const mediaInfo = await getTMDBDetails(tmdbId, mediaType);

    const proxyUrl = mediaType === "tv" && seasonNum && episodeNum
      ? `${apiBase}/tv/${tmdbId}/${seasonNum}/${episodeNum}`
      : `${apiBase}/movie/${tmdbId}`;

    const result = await fetchProxyWithTokenFallback(proxyUrl, tokens);
    if (!result) return [];

    const { data, token: activeToken } = result;

    let streams = processShowBoxResponse(data, mediaInfo, mediaType, seasonNum, episodeNum, enabledQualities);

    const showboxId = (data.id || data.mid) ||
      (data.data && (data.data.id || data.data.mid)) || null;

    if (showboxId) {
      const directStreams = await extractFebBoxShare(
        showboxId, mediaType, seasonNum, episodeNum, activeToken, enabledQualities
      );
      if (directStreams.length > 0) streams = streams.concat(directStreams);
    }

    if (!streams.length) return [];

    const seen = new Set();
    return streams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
  } catch {
    return [];
  }
}

async function onSettings() {
  return [
    { type: "header", label: "ShowBox Configuration" },
    {
      type:        "text",
      isPassword:  true,
      key:         "uiToken",
      label:       "FebBox UI Token [Primary]",
      placeholder: "ui=...",
      description: "Copy your Febbox 'ui' cookie value",
    },
    {
      type:        "text",
      isPassword:  true,
      key:         "uiTokens",
      label:       "FebBox Additional UI Tokens [Optional]",
      placeholder: "ui=token2, ui=token3, ui=token4",
      description: "Separate with commas",
    },
  ];
}

module.exports = { getStreams, onSettings };