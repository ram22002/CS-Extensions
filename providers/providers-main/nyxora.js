const PROVIDER = "VidFast";
const BASE_URL = "https://vidfast.vc";
const ENC_API = "https://enc-dec.app/api/enc-vidfast";
const DEC_API = "https://enc-dec.app/api/dec-vidfast";
const BLOCKED_SERVERS = new Set(["Horizon"]);
const ALLOWED_QUALITIES = new Set(["4K", "2160p", "1440p", "1080p", "Adaptive", "Auto"]);

const DEFAULT_HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
    "Origin": BASE_URL,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
};

const heightToQuality = (height) => {
    if (height >= 2160) return "2160p";
    if (height >= 1440) return "1440p";
    if (height >= 1080) return "1080p";
    if (height >= 720) return "720p";
    if (height >= 480) return "480p";
    if (height >= 360) return "360p";
    return `${height}p`;
};

const parseQualityLabel = (str) => {
    if (/2160|4k/i.test(str)) return "2160p";
    if (/1440/i.test(str)) return "1440p";
    if (/1080/i.test(str)) return "1080p";
    if (/720/i.test(str)) return "720p";
    if (/480/i.test(str)) return "480p";
    if (/360/i.test(str)) return "360p";
    if (/auto|adaptive/i.test(str)) return "Auto";
    return null;
};

const extractStreamQuality = (data) => {
    if (data.quality) {
        const q = parseQualityLabel(data.quality);
        if (q) return q;
    }
    if (data.label) {
        const q = parseQualityLabel(data.label);
        if (q) return q;
    }
    const match = data.url?.match(/(\d{3,4})[pP]/);
    if (match) return `${match[1]}p`;
    return "Auto";
};

const resWeight = (quality) => {
    const q = (quality || "").toLowerCase();
    if (q === "2160p" || q === "4k") return 5;
    if (q === "1440p") return 4;
    if (q === "1080p") return 3;
    if (q === "720p") return 2;
    if (q === "480p" || q === "360p") return 1;
    return 0;
};

const getInvertedSortTag = (score, maxScore) => {
    maxScore = maxScore || 999999;
    let inv = Math.max(0, maxScore - Math.max(0, parseInt(score, 10) || 0));
    let bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    return bin.split("").map(b => b === "1" ? "\uFEFF" : "\u200B").join("");
};

const fetchPlaylistVariants = async (playlistUrl) => {
    try {
        const res = await fetch(playlistUrl, {
            headers: {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": `${BASE_URL}/`,
            },
        });

        if (!res.ok) return null;

        const text = await res.text();
        if (!text.includes("#EXT-X-STREAM-INF")) return null;

        const tracks = [];
        const lines = text.split("\n");

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.startsWith("#EXT-X-STREAM-INF")) continue;

            const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
            const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
            const urlLine = lines[i + 1]?.trim();

            if (!urlLine || urlLine.startsWith("#")) continue;

            const url = urlLine.startsWith("http")
                ? urlLine
                : playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1) + urlLine;

            tracks.push({
                url,
                quality: resMatch ? heightToQuality(parseInt(resMatch[2])) : null,
                bandwidth: bwMatch ? parseInt(bwMatch[1]) : 0,
            });
        }

        if (tracks.length === 0) return null;

        tracks.sort((a, b) => b.bandwidth - a.bandwidth);

        for (const track of tracks) {
            if (!track.quality) {
                const m = track.url.match(/(\d{3,4})[pP]/);
                track.quality = m ? `${m[1]}p` : heightToQuality(
                    tracks.indexOf(track) === 0 ? 2160 :
                        tracks.indexOf(track) === 1 ? 1080 : 720
                );
            }
        }

        return tracks;
    } catch {
        return null;
    }
};

const decrypt = async (payload) => {
    try {
        const res = await fetch(DEC_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: payload }),
        });
        return await res.json();
    } catch {
        return null;
    }
};

const resolvePageUrl = (tmdbId, mediaType, season, episode) =>
    mediaType === "tv"
        ? `${BASE_URL}/tv/${tmdbId}/${season}/${episode}/`
        : `${BASE_URL}/movie/${tmdbId}/`;

const extractEncryptedPayload = (pageText) => {
    const m = String(pageText || "").match(/\\"(?:en|token)\\":\\"(.*?)\\"/);
    return m ? m[1] : null;
};

const fetchRawStreams = async (tmdbId, mediaType, season, episode) => {
    const pageUrl = resolvePageUrl(tmdbId, mediaType, season, episode);
    const headers = {
        "User-Agent": DEFAULT_HEADERS["User-Agent"],
        "Referer": `${BASE_URL}/`,
    };

    const pageRes = await fetch(pageUrl, { headers });
    if (!pageRes.ok) return [];

    const payload = extractEncryptedPayload(await pageRes.text());
    if (!payload) return [];

    const encRes = await fetch(`${ENC_API}?text=${encodeURIComponent(payload)}`);
    if (!encRes.ok) return [];

    const encData = await encRes.json();
    if (encData?.status !== 200 || !encData.result) return [];

    const { servers: serversUrl, stream: streamBase, token } = encData.result;
    if (token) headers["X-CSRF-Token"] = token;

    const serversRes = await fetch(serversUrl, { method: "POST", headers });
    if (!serversRes.ok) return [];

    const decryptedServers = await decrypt(await serversRes.text());
    if (!decryptedServers?.result || !Array.isArray(decryptedServers.result) || decryptedServers.result.length === 0) return [];

    const settled = (
        await Promise.allSettled(
            decryptedServers.result
                .filter(s => !BLOCKED_SERVERS.has(s.name))
                .map(async (server, i) => {
                    const name = server.name || `Server ${i + 1}`;
                    const res = await fetch(`${streamBase}/${server.data}`, { method: "POST", headers });
                    if (!res.ok) return null;

                    const streamData = await decrypt(await res.text());
                    if (!streamData?.result?.url) return null;

                    const data = streamData.result;
                    return {
                        name,
                        url: data.url,
                        quality: extractStreamQuality(data),
                        isM3U8: data.url.includes(".m3u8"),
                    };
                })
        )
    )
        .filter(r => r.status === "fulfilled" && r.value != null)
        .map(r => r.value);

    const expanded = (
        await Promise.allSettled(
            settled.map(async (stream) => {
                if (!stream.isM3U8) return [stream];
                const tracks = await fetchPlaylistVariants(stream.url);
                if (tracks?.length > 0) {
                    return tracks.map(t => ({
                        name: stream.name,
                        url: t.url,
                        quality: t.quality,
                        isM3U8: false,
                    }));
                }
                return [stream];
            })
        )
    )
        .filter(r => r.status === "fulfilled")
        .flatMap(r => r.value);

    const seen = new Set();
    return expanded.filter(s => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return ALLOWED_QUALITIES.has(s.quality);
    });
};

const sortAndTag = (streams) => {
    streams.sort((a, b) => resWeight(b.quality) - resWeight(a.quality));
    const total = streams.length;
    return streams.map((s, i) => {
        const tag = getInvertedSortTag(total - i, total + 1);
        return { ...s, name: tag + s.name, title: tag + s.title };
    });
};

const normalizeStreams = (streams) =>
    sortAndTag(
        streams.map(stream => ({
            name: `${PROVIDER} • ${stream.name}`,
            title: `${PROVIDER} • ${stream.name}`,
            url: stream.url,
            quality: stream.quality,
            headers: {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": `${BASE_URL}/`,
            },
        }))
    );

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const streams = await fetchRawStreams(tmdbId, mediaType, season, episode);
        if (!streams?.length) return [];

        return normalizeStreams(streams);
    } catch {
        return [];
    }
}

module.exports = { getStreams };