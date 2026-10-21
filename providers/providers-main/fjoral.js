"use strict";

const PROVIDER_NAME = "GramCinema";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const HH_API = "https://tga-hd.api.hashhackers.com";
const REFERER = "https://bollywood.eu.org/";
const MAX_LINKS = 6;
const AUDIO = [
    [/ddp.?51.*truehd.*71|truehd.*71.*ddp.?51/i, "DDP 5.1 + TrueHD 7.1"],
    [/ddp.?51.*ddp.?71|ddp.?71.*ddp.?51/i, "DDP 5.1 + DDP 7.1"],
    [/ddp.?51.*aac.?71|aac.?71.*ddp.?51/i, "DDP 5.1 + AAC 7.1"],
    [/ddp.?51/i, "DDP 5.1"],
    [/truehd/i, "TrueHD 7.1"],
    [/aac.*71|71.*aac/i, "AAC 7.1"],
    [/aac/i, "AAC 5.1"],
];

function resolveApiToken() {
    const token = SCRAPER_SETTINGS && SCRAPER_SETTINGS.cinemaTvToken;
    return token ? String(token).trim() : "";
}

async function httpGetJson(url, options) {
    try {
        const res = await fetch(url, options || {});
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return "";
    const units = ["Bytes", "KB", "MB", "GB", "TB"];
    const exp = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, exp)).toFixed(2)) + " " + units[exp];
}

function resolveQuality(text) {
    if (/2160p|4k|uhd/i.test(text)) return "2160P";
    if (/1080p/i.test(text)) return "1080P";
    if (/720p/i.test(text)) return "720P";
    if (/480p/i.test(text)) return "480P";
    return "1080P";
}

function buildStreamResult(rawFilename, streamUrl, sizeLabel) {
    let combined;
    try {
        combined = (String(rawFilename || "") + " " + decodeURIComponent(streamUrl)).toLowerCase();
    } catch {
        combined = (String(rawFilename || "") + " " + streamUrl).toLowerCase();
    }

    const quality = resolveQuality(combined);

    const langParts = [];
    if (/\b(?:english|eng)\b/.test(combined)) langParts.push("English");
    if (/\bhindi\b/.test(combined)) langParts.push("Hindi");
    if (/\btamil\b/.test(combined)) langParts.push("Tamil");
    if (/\btelugu\b/.test(combined)) langParts.push("Telugu");

    let source = "WEB-DL";
    if (/\bremux\b/.test(combined)) source = "Blu-ray";
    else if (/\bblu[-\s]?ray\b/.test(combined)) source = "Blu-ray";
    else if (/\b(?:webrip|hdrip)\b/.test(combined)) source = "WEB-Rip";

    const cdnMatch = streamUrl.match(/cdn(\d+)/i);
    const cdnLabel = cdnMatch
        ? "CDN" + cdnMatch[1]
        : (streamUrl.includes("tga-hd") ? "TGA-CDN" : "CDN1");

    let hdrTag = "";
    if (/\b(?:hdr10\+|hdr10p)\b/.test(combined)) hdrTag = "HDR10+";
    else if (/\bhdr10\b/.test(combined)) hdrTag = "HDR10";
    else if (/\bhdr\b/.test(combined)) hdrTag = "HDR";
    else if (/\bsdr\b/.test(combined)) hdrTag = "SDR";

    const bit10Tag = /\b10bit\b/.test(combined) ? "10Bit" : "";
    const dvTag = /\b(?:dv|dolby\s*vision)\b/.test(combined) ? "DV" : "";
    const isRemux = /\bremux\b/.test(combined);
    const isImax = /\bimax\b/.test(combined);
    const codec = (/\b(?:hevc|x265|265)\b/.test(combined) || quality === "2160P") ? "H.265" : "H.264";

    let audio = "DDP 5.1";
    for (let i = 0; i < AUDIO.length; i++) {
        if (AUDIO[i][0].test(combined)) { audio = AUDIO[i][1]; break; }
    }
    if (/\batmos\b/.test(combined)) audio += " Atmos";

    const mainTitle = [PROVIDER_NAME, quality, sizeLabel].filter(Boolean).join(" • ");

    const line1 = langParts.join(" • ");
    const line2 = [source, isRemux && "REMUX", isImax && "IMAX", cdnLabel].filter(Boolean).join(" • ");
    const line3 = [bit10Tag, dvTag, hdrTag, codec, audio].filter(Boolean).join(" • ");
    const metaBlock = [line1, line2, line3].filter(Boolean).join("\n");

    return {
        name: mainTitle,
        title: mainTitle,
        size: metaBlock,
        url: streamUrl.replace(/ /g, "%20"),
        quality,
        headers: { Referer: REFERER },
    };
}

function sortStreamsByResolution(streams) {
    const weight = q => {
        const v = (q || "").toUpperCase();
        if (v === "2160P" || v === "4K") return 4;
        if (v === "1080P") return 3;
        if (v === "720P") return 2;
        return 1;
    };
    return streams.slice().sort((a, b) => weight(b.quality) - weight(a.quality));
}

function deduplicateByUrl(streams) {
    const seen = new Set();
    return streams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
}

function resolveResolutionSettings() {
    const s = (typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS) || {};
    return {
        enable2160p: s.enable2160p !== false,
        enable1080p: s.enable1080p !== false,
        enable720p: s.enable720p === true,
    };
}

function applyResolutionFilter(streams, settings) {
    return streams.filter(s => {
        const q = (s.quality || "").toUpperCase();
        if (q === "2160P" && !settings.enable2160p) return false;
        if (q === "1080P" && !settings.enable1080p) return false;
        if (q === "720P" && !settings.enable720p) return false;
        return true;
    });
}

async function fetchTmdbMetadata(tmdbId, mediaType) {
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const data = await httpGetJson(
        `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`
    );
    if (!data) return null;
    return {
        title: mediaType === "tv" ? data.name : data.title,
        year: (data.release_date || data.first_air_date || "").slice(0, 4),
    };
}

async function resolveStreamLinks(fileEntries, requestHeaders) {
    const candidates = fileEntries
        .filter(f => /\.(mkv|mp4)$/i.test(f.file_name.trim()))
        .slice(0, MAX_LINKS);

    const settled = await Promise.allSettled(
        candidates.map(async file => {
            const linkData = await httpGetJson(
                `${HH_API}/genLink?type=mix_media&id=${file.id}`,
                { headers: requestHeaders }
            );
            if (!linkData || !linkData.success || !linkData.url) return null;
            return buildStreamResult(
                file.file_name,
                linkData.url,
                formatFileSize(parseInt(file.file_size))
            );
        })
    );

    return settled
        .filter(r => r.status === "fulfilled" && r.value !== null)
        .map(r => r.value);
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType !== "movie" && mediaType !== "tv") return [];
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const token = resolveApiToken();
        if (!token) return [];

        const metadata = await fetchTmdbMetadata(tmdbId, mediaType);
        if (!metadata || !metadata.title) return [];

        let searchQuery = `${metadata.title} ${metadata.year}`.trim();
        if (mediaType === "tv") {
            const s = String(season).padStart(2, "0");
            const e = String(episode).padStart(2, "0");
            searchQuery += ` S${s}E${e}`;
        }

        const requestHeaders = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Mobile/15E148 Safari/604.1",
            "Accept": "*/*",
            "Authorization": `Bearer ${token}`,
            "Origin": "https://bollywood.eu.org",
            "Referer": REFERER,
        };

        const searchData = await httpGetJson(
            `${HH_API}/mix_media_files/search?q=${encodeURIComponent(searchQuery)}&page=1`,
            { headers: requestHeaders }
        );

        if (!searchData || !searchData.files || searchData.files.length === 0) return [];

        const streams = await resolveStreamLinks(searchData.files, requestHeaders);
        const filtered = applyResolutionFilter(streams, resolveResolutionSettings());
        return deduplicateByUrl(sortStreamsByResolution(filtered));
    } catch {
        return [];
    }
}

async function onSettings() {
    return [
        { type: "header", label: "GramCinema Cookie/Token" },
        {
            type: "text",
            isPassword: true,
            key: "cinemaTvToken",
            placeholder: "Paste cookie/token here...",
            description: "Paste cookie/token obtained from bollywood.eu.org",
        },
        { type: "header", label: "Resolution" },
        {
            type: "toggle",
            key: "enable2160p",
            label: "4K / 2160p",
            defaultValue: true,
        },
        {
            type: "toggle",
            key: "enable1080p",
            label: "FHD / 1080p",
            defaultValue: true,
        },
        {
            type: "toggle",
            key: "enable720p",
            label: "HD / 720p",
            defaultValue: false,
        },
    ];
}

module.exports = { getStreams, onSettings };