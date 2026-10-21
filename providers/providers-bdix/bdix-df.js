const PROVIDER = "DhakaFlix FTP";
const TMDB_API = 'https://api.themoviedb.org/3';
const SERVERS = [
    { url: "http://172.16.50.12", root: "/DHAKA-FLIX-12/" },
    { url: "http://172.16.50.14", root: "/DHAKA-FLIX-14/" },
];
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "Content-Type": "application/json",
};

const AUDIO_TABLE = [
    [/ddp.?51.*truehd.*71|truehd.*71.*ddp.?51/i, "DDP 5.1 + TrueHD 7.1"],
    [/ddp.?51.*ddp.?71|ddp.?71.*ddp.?51/i, "DDP 5.1 + DDP 7.1"],
    [/ddp.?51.*aac.?71|aac.?71.*ddp.?51/i, "DDP 5.1 + AAC 7.1"],
    [/ddp.?51/i, "DDP 5.1"],
    [/truehd/i, "TrueHD 7.1"],
    [/aac.*71|71.*aac/i, "AAC 7.1"],
    [/aac/i, "AAC 5.1"],
];
const QUALITY_RANK = { '2160p': 5, '1440p': 4, '1080p': 3, '720p': 2, '480p': 0, 'hd': -1 };
const MAX_RANK = 5;

async function httpGet(url) {
    try {
        const res = await fetch(url, { headers: HEADERS });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

async function httpPost(url, body) {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify(body),
        });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

async function getTmdbMeta(tmdbId, mediaType) {
    if (!TMDB_API_KEY) return null;
    const data = await httpGet(
        `${TMDB_API}/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`
    );
    if (!data) return null;
    return {
        title: data.title || data.name || "",
        year: (data.release_date || data.first_air_date || "").slice(0, 4),
    };
}

function parseQuality(filename) {
    const s = filename.toLowerCase();
    if (s.includes("2160p") || s.includes("4k")) return "2160p";
    if (s.includes("1080p")) return "1080p";
    if (s.includes("720p")) return "720p";
    if (s.includes("480p")) return "480p";
    return "hd";
}

function buildSearchVariants(title) {
    const clean = title.replace(/[^a-zA-Z0-9 ]/g, "").trim();
    return [
        clean.replace(/ /g, "\\ "),
        clean.replace(/ /g, "."),
    ];
}

function passesMediaTypeFilter(href, mediaType) {
    const s = href.toLowerCase();
    if (mediaType === "movie") {
        return !s.includes("tv-web-series") && !s.includes("tv series");
    }
    return !s.includes("english movies") && !s.includes("hindi movies") && !s.includes("movies");
}

function passesEpisodeFilter(filename, season, episode) {
    const s = String(season).padStart(2, "0");
    const e = String(episode).padStart(2, "0");
    return new RegExp(`s${s}[. _-]?e${e}`, "i").test(filename);
}

function getSortTag(rank) {
    const inv = Math.max(0, MAX_RANK - rank);
    let bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    return bin.split("").map(b => b === "1" ? "\uFEFF" : "\u200B").join("");
}

function makeStream(filename, streamUrl, quality) {
    const combined = (filename + " " + streamUrl).toLowerCase();

    const langParts = [];
    if (/\b(?:english|eng)\b/.test(combined)) langParts.push("English");
    if (/\bhindi\b/.test(combined)) langParts.push("Hindi");
    if (/\btamil\b/.test(combined)) langParts.push("Tamil");
    if (/\btelugu\b/.test(combined)) langParts.push("Telugu");

    let source = "WEB-DL";
    if (/\bbluray\b/.test(combined)) source = "Blu-ray";
    else if (/\b(?:webrip|hdrip)\b/.test(combined)) source = "WEB-Rip";

    let hdrTag = "";
    if (/\bhdr10\+|hdr10p\b/.test(combined)) hdrTag = "HDR10+";
    else if (/\bhdr10\b/.test(combined)) hdrTag = "HDR10";
    else if (/\bhdr\b/.test(combined)) hdrTag = "HDR";
    else if (/\bsdr\b/.test(combined)) hdrTag = "SDR";

    const bit10Tag = /\b10bit\b/.test(combined) ? "10Bit" : "";
    const dvTag = /\b(?:dv|dolby\s*vision)\b/.test(combined) ? "DV" : "";
    const codec = /\b(?:hevc|x265|265)\b/.test(combined) ? "H.265" : "H.264";
    const isImax = /\bimax\b/.test(combined);

    let audio = "DDP 5.1";
    for (const [re, label] of AUDIO_TABLE) {
        if (re.test(combined)) { audio = label; break; }
    }
    if (/\batmos\b/.test(combined)) audio += " Atmos";

    const rank = QUALITY_RANK[quality] ?? -1;
    const tag = getSortTag(rank);
    const qualityUp = quality.toUpperCase();

    const line1 = langParts.join(" \u2022 ");
    const line2 = [source, isImax && "IMAX", "BDIX"].filter(Boolean).join(" \u2022 ");
    const line3 = [bit10Tag, dvTag, hdrTag, codec, audio].filter(Boolean).join(" \u2022 ");
    const size = [line1, line2, line3].filter(Boolean).join("\n");

    return {
        name: tag + PROVIDER + " \u2022 " + qualityUp,
        title: tag + PROVIDER + " \u2022 " + qualityUp,
        size,
        url: streamUrl,
        quality,
        headers: { "User-Agent": HEADERS["User-Agent"] },
    };
}

async function queryServer(server, query, mediaType, season, episode, year) {
    try {
        const data = await httpPost(`${server.url}${server.root}`, {
            action: "get",
            search: {
                href: server.root,
                ignorecase: true,
                pattern: query,
            },
        });
        if (!data || !Array.isArray(data.search)) return [];

        return data.search
            .filter(item => {
                const href = item.href.toLowerCase();
                const filename = decodeURIComponent(item.href.split("/").pop()).toLowerCase();
                if (!href.endsWith(".mkv") && !href.endsWith(".mp4") && !href.endsWith(".avi")) return false;
                if (!passesMediaTypeFilter(item.href, mediaType)) return false;
                if (mediaType === "tv" && season != null && episode != null && !passesEpisodeFilter(filename, season, episode)) return false;
                if (mediaType === "movie" && year && !filename.includes(year)) return false;
                return true;
            })
            .map(item => {
                const filename = decodeURIComponent(item.href.split("/").pop());
                const quality = parseQuality(filename);
                return makeStream(filename, `${server.url}${item.href}`, quality);
            });
    } catch {
        return [];
    }
}

async function probeServers(variants, mediaType, season, episode, year) {
    const seen = new Set();

    for (const query of variants) {
        const batches = await Promise.all(
            SERVERS.map(server => queryServer(server, query, mediaType, season, episode, year))
        );

        const streams = batches.flat().filter(stream => {
            if (!stream.url || seen.has(stream.url)) return false;
            seen.add(stream.url);
            return true;
        });

        if (streams.length > 0) return streams;
    }

    return [];
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const meta = await getTmdbMeta(tmdbId, mediaType);
        if (!meta || !meta.title) return [];

        const variants = buildSearchVariants(meta.title);

        return probeServers(
            variants,
            mediaType,
            mediaType === "tv" ? season : null,
            mediaType === "tv" ? episode : null,
            mediaType === "movie" ? meta.year : null
        );
    } catch {
        return [];
    }
}

module.exports = { getStreams };