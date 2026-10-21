const PROVIDER = "Wikimedia";
const CMNS_API_BASE = "https://commons.wikimedia.org/w/api.php";
const WKPD_API_BASE = "https://en.wikipedia.org/w/api.php";
const MIN_DUR_SECS = parseInt(SCRAPER_SETTINGS.minSeconds, 10) || 360;
const CMNS_REFERER = "https://commons.wikimedia.org/";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36";
const REQUEST_HEADERS = { "User-Agent": USER_AGENT, "Accept": "application/json" };
const IMAGE_INFO_PROPS = "url|size|metadata";
const VIDEO_FILE_PATTERN = /\.(webm|mp4|ogv|ogg)(\?|$)/i;

async function fetchJson(url) {
    try {
        const response = await fetch(url, { headers: REQUEST_HEADERS });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

async function fetchTmdbMovieMetadata(tmdbId) {
    if (!TMDB_API_KEY) return null;
    const movieData = await fetchJson(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`
    );
    if (!movieData || !movieData.title) return null;
    return {
        title: movieData.title,
        year: (movieData.release_date || "").slice(0, 4),
        originalTitle: movieData.original_title || movieData.title,
    };
}

function extractVideoFileTitles(pages) {
    const seen = new Set();
    const videoFiles = [];
    for (const page of pages) {
        if (page.missing) continue;
        for (const image of (page.images || [])) {
            if (VIDEO_FILE_PATTERN.test(image.title) && !seen.has(image.title)) {
                seen.add(image.title);
                videoFiles.push(image.title);
            }
        }
    }
    return videoFiles;
}

async function queryWikipediaVideoFiles(titles) {
    const wikipediaData = await fetchJson(
        `${WKPD_API_BASE}?action=query&format=json&formatversion=2` +
        `&titles=${encodeURIComponent(titles.join("|"))}` +
        `&prop=images&imlimit=50`
    );
    return extractVideoFileTitles((wikipediaData && wikipediaData.query && wikipediaData.query.pages) || []);
}

async function discoverFilmVideoFiles(title, year, originalTitle) {
    const candidates = [];
    if (year) {
        candidates.push(`${title} (${year} film)`);
        if (originalTitle !== title) candidates.push(`${originalTitle} (${year} film)`);
    }
    candidates.push(`${title} (film)`);
    candidates.push(title);
    if (originalTitle !== title) candidates.push(`${originalTitle} (film)`);

    const videoFiles = await queryWikipediaVideoFiles(candidates);
    if (videoFiles.length) return videoFiles;

    const searchResponse = await fetchJson(
        `${WKPD_API_BASE}?action=query&format=json&formatversion=2` +
        `&list=search&srsearch=${encodeURIComponent([title, year, "film"].filter(Boolean).join(" "))}` +
        `&srlimit=5&srnamespace=0`
    );
    const searchResults = (searchResponse && searchResponse.query && searchResponse.query.search) || [];
    if (!searchResults.length) return [];
    return queryWikipediaVideoFiles(searchResults.slice(0, 3).map(result => result.title));
}

async function batchFetchCommonsImageInfo(fileTitles) {
    if (!fileTitles.length) return [];
    const batches = [];
    for (let i = 0; i < fileTitles.length; i += 20) batches.push(fileTitles.slice(i, i + 20));
    const batchResults = await Promise.all(batches.map(batch =>
        fetchJson(
            `${CMNS_API_BASE}?action=query&format=json&formatversion=2` +
            `&prop=imageinfo&iiprop=${IMAGE_INFO_PROPS}` +
            `&titles=${encodeURIComponent(batch.join("|"))}`
        ).then(responseData => (responseData && responseData.query && responseData.query.pages) || [])
    ));
    return batchResults.flat().filter(
        page => !page.missing && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url
    );
}

function getMetadataValue(imageInfo, name) {
    for (const entry of ((imageInfo && imageInfo.metadata) || [])) {
        if (entry.name === name) return entry.value;
    }
    return null;
}

function getPlaytimeSeconds(imageInfo) {
    const seconds = parseFloat(getMetadataValue(imageInfo, "playtime_seconds"));
    return isNaN(seconds) ? 0 : seconds;
}

function getVideoWidth(imageInfo) {
    const width = parseInt(getMetadataValue(imageInfo, "width"), 10);
    return isNaN(width) ? 0 : width;
}

function resolveQualityLabel(width) {
    return width >= 3840 ? "2160p" : width >= 1920 ? "1080p" : width >= 1280 ? "720p" : width >= 640 ? "480p" : width > 0 ? "SD" : "Auto";
}

function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return null;
    return bytes >= 1e9 ? (bytes / 1e9).toFixed(1) + " GB"
        : bytes >= 1e6 ? (bytes / 1e6).toFixed(0) + " MB"
            : Math.round(bytes / 1e3) + " KB";
}

function getContainerFormat(url) {
    return /\.mp4(\?|$)/i.test(url) ? "MP4" : /\.webm(\?|$)/i.test(url) ? "WebM" : "OGV";
}

function buildStreamEntry(page) {
    const imageInfo = page.imageinfo[0];
    if (!imageInfo.url || getPlaytimeSeconds(imageInfo) < MIN_DUR_SECS) return null;
    const qualityLabel = resolveQualityLabel(getVideoWidth(imageInfo));
    const formattedSize = formatFileSize(imageInfo.size);
    const containerFormat = getContainerFormat(imageInfo.url);
    return {
        name: `${PROVIDER} \u2022 ${containerFormat}`,
        title: `${PROVIDER} \u2022 ${containerFormat}`,
        quality: qualityLabel,
        url: imageInfo.url,
        size: formattedSize || undefined,
        headers: { "User-Agent": USER_AGENT, "Referer": CMNS_REFERER },
    };
}

function deduplicateByUrl(streams) {
    const seen = new Set();
    return streams.filter(stream => stream.url && !seen.has(stream.url) && seen.add(stream.url));
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv") return [];
        const movieMetadata = await fetchTmdbMovieMetadata(tmdbId);
        if (!movieMetadata) return [];
        const fileTitles = await discoverFilmVideoFiles(movieMetadata.title, movieMetadata.year, movieMetadata.originalTitle);
        if (!fileTitles.length) return [];
        const imageInfoPages = await batchFetchCommonsImageInfo(fileTitles);
        return deduplicateByUrl(imageInfoPages.map(buildStreamEntry).filter(Boolean));
    } catch {
        return [];
    }
}

async function onSettings() {
    return [
        {
            type: "select",
            key: "minSeconds",
            label: "Minimum video duration",
            defaultValue: "360",
            options: [
                { value: "0", label: "No minimum" },
                { value: "60", label: "1 minute" },
                { value: "300", label: "5 minutes" },
                { value: "360", label: "6 minutes (default)" },
                { value: "900", label: "15 minutes" },
                { value: "1800", label: "30 minutes" },
                { value: "2700", label: "45 minutes" },
                { value: "3600", label: "60 minutes" },
            ],
            description: "Skip videos shorter than this. Raise to filter out short films and clips.",
        },
    ];
}

module.exports = { getStreams, onSettings };