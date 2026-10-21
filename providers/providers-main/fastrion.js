const PROVIDER = "MultiMovies";
const VO_API = "https://api.eclq-404.workers.dev";
const VO_HEADER = { Referer: `${VO_API}/` };
const FLMU_BASE = "https://embed.filmu.in";
const BLOCKED_HOSTS = ["rousav.tech", "movy.lol"];

function normalizeQuality(raw) {
    const s = String(raw || "").toLowerCase();
    if (s.includes("2160") || s.includes("4k")) return "2160p";
    if (s.includes("1080")) return "1080p";
    if (s.includes("720")) return "720p";
    if (s.includes("480")) return "480p";
    return "HD";
}

function isPlayable(url) {
    return (
        typeof url === "string" &&
        url.startsWith("http") &&
        !BLOCKED_HOSTS.some(host => url.includes(host))
    );
}

function joinUrl(base, path) {
    return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function fetchJson(url, options) {
    try {
        const res = await fetch(url, options || {});
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function createStream({ source, url, quality, headers, subtitles = [], title }) {
    const label = `${PROVIDER} \u2022 ${source}`;
    return {
        name: label,
        title: title || label,
        url,
        quality,
        headers,
        subtitles,
    };
}

async function fetchVidout(tmdbId, mediaType, season, episode) {
    try {
        const isTv = mediaType === "tv";
        const endpoint = isTv
            ? `${VO_API}/tv/${tmdbId}/${season}/${episode}`
            : `${VO_API}/movie/${tmdbId}`;

        const data = await fetchJson(endpoint);
        if (!data || !data.url) return [];

        const subtitles = (data.subtitles || []).map(s => ({
            url: s.url,
            language: s.language,
        }));

        return [
            createStream({
                source: "VidOut",
                url: data.url,
                quality: "1080p",
                headers: VO_HEADER,
                subtitles,
            }),
        ];
    } catch {
        return [];
    }
}

async function fetchFilmu(tmdbId, mediaType, season, episode) {
    try {
        const isTv = mediaType === "tv";

        const path = isTv
            ? `${FLMU_BASE}/api/singularity-tv?tmdb=${tmdbId}&s=${season}&e=${episode}`
            : `${FLMU_BASE}/api/singularity-movie?id=${tmdbId}`;
        const referer = isTv
            ? `${FLMU_BASE}/tv/${tmdbId}/${season}/${episode}`
            : `${FLMU_BASE}/movie/${tmdbId}`;

        const root = await fetchJson(path, { headers: { Referer: referer } });
        if (!root) return [];

        const subtitles = (root.subtitles || [])
            .filter(s => s && s.url)
            .map(s => ({ url: s.url, language: s.lang || "en" }));

        const base = root._base || "";
        const streams = [];

        const push = (url, q, title) =>
            streams.push(
                createStream({
                    source: "Filmu",
                    url,
                    quality: q,
                    headers: { Referer: referer },
                    subtitles,
                    title,
                })
            );

        for (const src of root.sources || []) {
            if (!src || !src.url) continue;
            const url =
                !src.url.startsWith("http") && base ? joinUrl(base, src.url) : src.url;
            if (!isPlayable(url)) continue;
            push(url, normalizeQuality(src.quality || "1080p"));
        }

        if (streams.length === 0) {
            const q = normalizeQuality(root.quality || "1080p");
            const single =
                (typeof root.url === "string" && root.url) ||
                (root.multilingual && root.multilingual_url) ||
                "";

            if (isPlayable(single)) {
                push(single, q, `${PROVIDER} \u2022 ${q}`);
            } else if (root.m3u8_path && base) {
                const url = joinUrl(base, root.m3u8_path);
                if (isPlayable(url)) push(url, q);
            }
        }

        return streams;
    } catch {
        return [];
    }
}

function dedupeByUrl(streams) {
    const seen = new Set();
    return streams.filter(s => s && s.url && !seen.has(s.url) && seen.add(s.url));
}

async function getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType === "tv" && (season == null || episode == null)) return [];
    const [vidout, filmu] = await Promise.all([
        fetchVidout(tmdbId, mediaType, season, episode),
        fetchFilmu(tmdbId, mediaType, season, episode),
    ]);
    return dedupeByUrl([...vidout, ...filmu]);
}

module.exports = { getStreams };