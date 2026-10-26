const PROVIDER = "Re:ANIME";
const BASE_URL = "https://reanime.to";
const API_BASE = "https://flixcloud.cc";
const ENC_DEC_API = "https://enc-dec.app/api";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 16; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";

function createSortTag(rank) {
    return Math.max(0, 23 - rank)
        .toString(2)
        .padStart(20, "0")
        .split("")
        .map(b => b === "1" ? "\uFEFF" : "\u200B")
        .join("");
}

function parseJsObjectLiteral(source) {
    let json = "";
    let cursor = 0;

    while (cursor < source.length) {
        const char = source[cursor];

        if (char === '"' || char === "'") {
            let end = cursor + 1;
            let body = "";
            while (end < source.length && source[end] !== char) {
                if (source[end] === "\\") { body += source[end] + source[end + 1]; end += 2; }
                else { body += source[end]; end += 1; }
            }
            json += char === '"' ? `"${body}"` : JSON.stringify(body.replace(/\\'/g, "'"));
            cursor = end + 1;
        } else if (/[A-Za-z_$]/.test(char)) {
            let end = cursor;
            while (end < source.length && /[\w$]/.test(source[end])) end += 1;
            const word = source.slice(cursor, end);

            let lookahead = end;
            while (lookahead < source.length && /\s/.test(source[lookahead])) lookahead += 1;

            if (source[lookahead] === ":") {
                json += JSON.stringify(word);
            } else if (word === "void") {
                if (source[lookahead] === "0") lookahead += 1;
                json += "null";
                end = lookahead;
            } else if (word === "true" || word === "false" || word === "null") {
                json += word;
            } else {
                json += "null";
            }
            cursor = end;
        } else if (char === "!" && (source[cursor + 1] === "0" || source[cursor + 1] === "1")) {
            json += source[cursor + 1] === "0" ? "true" : "false";
            cursor += 2;
        } else {
            json += char;
            cursor += 1;
        }
    }

    return JSON.parse(json.replace(/,(\s*[}\]])/g, "$1"));
}

async function request(url, init, format) {
    try {
        const res = await fetch(url, init);
        if (!res?.ok) return null;
        return format === "json" ? await res.json() : await res.text();
    } catch {
        return null;
    }
}

async function callEncDec(path, body) {
    try {
        const res = await fetch(ENC_DEC_API + path, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
            body: JSON.stringify(body),
        });
        if (!res?.ok) return null;
        const payload = await res.json();
        return payload?.status === 200 && payload.result ? payload.result : null;
    } catch {
        return null;
    }
}

async function resolveEmbed(embedUrl) {
    try {
        const page = await request(embedUrl, { headers: { "User-Agent": USER_AGENT, Referer: `${BASE_URL}/` } }, "text");
        const rawData = page ? /type:\s*"data",\s*data:\s*(\{[\s\S]*?\})\s*,\s*uses:/.exec(page)?.[1] : null;
        if (!rawData) return null;

        const { subtitles, ...payload } = parseJsObjectLiteral(rawData);

        const tokenResult = await callEncDec("/dec-flixcloud?type=token", { data: payload });
        if (!tokenResult?.token) return null;

        const streamResponse = await request(
            `${API_BASE}/api/m3u8/${tokenResult.token}`,
            { headers: { "User-Agent": USER_AGENT, Referer: `${BASE_URL}/` } },
            "json"
        );
        if (!streamResponse) return null;

        const streamResult = await callEncDec("/dec-flixcloud?type=stream", {
            data: { context: tokenResult.context, stream_response: streamResponse },
        });
        if (!streamResult?.stream || !streamResult.context) return null;

        const manifestUrl =
            `${ENC_DEC_API}/parse-flixcloud?url=${encodeURIComponent(streamResult.stream)}` +
            `&w_payload=${encodeURIComponent(streamResult.context.w_payload)}`;

        const manifest = await request(manifestUrl, { headers: { "User-Agent": USER_AGENT, Referer: `${API_BASE}/` } }, "text");
        if (!manifest?.includes("#EXTM3U")) return null;

        return { manifestUrl, manifest, subtitles: Array.isArray(subtitles) ? subtitles : [] };
    } catch {
        return null;
    }
}

async function resolveDownloadLink(embedUrl) {
    const embedId = /\/e\/([a-z0-9]+)/i.exec(embedUrl)?.[1];
    if (!embedId) return null;

    const payload = await request(
        `${API_BASE}/d/${embedId}/__data.json`,
        { headers: { Accept: "*/*", Referer: `${API_BASE}/`, "User-Agent": USER_AGENT } },
        "text"
    );
    if (!payload) return null;

    const fileId = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(payload)?.[0];
    const token = /eyJ[\w-]+\.[\w-]+\.[\w-]+/.exec(payload)?.[0];
    if (!fileId || !token) return null;

    const fetchHost = /https:\/\/fetch\d*\.flixcloud\.cc/.exec(payload)?.[0] ?? API_BASE;
    const progress = await request(
        `${fetchHost}/download/${fileId}/progress?token=${token}`,
        { headers: { Accept: "*/*", Referer: `${API_BASE}/`, "User-Agent": USER_AGENT } },
        "text"
    );
    if (progress?.includes('"status":"failed"')) return null;

    return { url: `${fetchHost}/download/${fileId}?token=${token}`, headers: { Accept: "*/*", Referer: `${API_BASE}/`, "User-Agent": USER_AGENT } };
}

function matchGroup(text, pattern) {
    return pattern.exec(text)?.[1] ?? null;
}

function isEnglishTrack(mediaLine) {
    const lang = (matchGroup(mediaLine, /LANGUAGE="([^"]*)"/) ?? "").toLowerCase();
    const name = (matchGroup(mediaLine, /NAME="([^"]*)"/) ?? "").toLowerCase();
    return lang.startsWith("en") || name.includes("english");
}

function encodePlaylist(text) {
    return "data:application/vnd.apple.mpegurl;base64," + btoa(unescape(encodeURIComponent(text)));
}

function toAbsoluteUrl(ref, base) {
    if (/^https?:\/\//i.test(ref)) return ref;
    try { return new URL(ref, base).href; } catch { return null; }
}

function rewriteUriAttribute(line, transform) {
    return line.replace(/URI="([^"]+)"/, (match, uri) => {
        const r = transform(uri);
        return r ? `URI="${r}"` : match;
    });
}

function absolutizePlaylist(playlist, base) {
    const rewritten = playlist
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(line => {
            if (!line.startsWith("#")) return toAbsoluteUrl(line, base) ?? line;
            if (line.startsWith("#EXT-X-KEY") || line.startsWith("#EXT-X-MAP")) return rewriteUriAttribute(line, uri => toAbsoluteUrl(uri, base));
            return line;
        });
    return `${rewritten.join("\n")}\n`;
}

async function fetchPlaylistDataUri(url) {
    const playlist = await request(url, { headers: { "User-Agent": USER_AGENT, Referer: `${API_BASE}/` } }, "text");
    if (!playlist?.includes("#EXTM3U")) return null;
    const target = matchGroup(url, /[?&]url=([^&]+)/);
    return encodePlaylist(absolutizePlaylist(playlist, target ? decodeURIComponent(target) : url));
}

async function buildMasterPlaylists({ manifest, manifestUrl }) {
    const lines = manifest.split("\n").map(l => l.trim()).filter(Boolean);

    const audioIndexes = [];
    lines.forEach((line, i) => {
        if (line.startsWith("#EXT-X-MEDIA") && line.includes("TYPE=AUDIO")) audioIndexes.push(i);
    });
    const audioIndexSet = new Set(audioIndexes);
    const englishIndexes = audioIndexes.filter(i => isEnglishTrack(lines[i]));
    const otherIndexes = audioIndexes.filter(i => !englishIndexes.includes(i));

    const variants = [];
    if (audioIndexes.length === 0) {
        variants.push({ language: "sub", keep: new Set() });
    } else {
        if (otherIndexes.length) variants.push({ language: "sub", keep: new Set(otherIndexes) });
        if (englishIndexes.length) variants.push({ language: "dub", keep: new Set(englishIndexes) });
    }

    const keptAudioIndexes = new Set(variants.flatMap(v => [...v.keep]));
    const playlistUrls = new Set();
    let expectingVariantUrl = false;

    lines.forEach((line, i) => {
        if (audioIndexSet.has(i)) {
            if (!keptAudioIndexes.has(i)) return;
            const uri = matchGroup(line, /URI="([^"]+)"/);
            const absolute = uri && toAbsoluteUrl(uri, manifestUrl);
            if (absolute) playlistUrls.add(absolute);
        } else if (line.startsWith("#EXT-X-STREAM-INF")) {
            expectingVariantUrl = true;
        } else if (expectingVariantUrl && !line.startsWith("#")) {
            const absolute = toAbsoluteUrl(line, manifestUrl);
            if (absolute) playlistUrls.add(absolute);
            expectingVariantUrl = false;
        }
    });

    const urls = [...playlistUrls];
    const dataUris = await Promise.all(urls.map(fetchPlaylistDataUri));
    const dataUriByUrl = new Map();
    urls.forEach((url, i) => { if (dataUris[i]) dataUriByUrl.set(url, dataUris[i]); });

    const masters = [];
    for (const variant of variants) {
        const output = [];
        let pendingStreamInf = null;
        let variantCount = 0;

        lines.forEach((line, i) => {
            if (line.startsWith("#EXT-X-MEDIA")) {
                if (!audioIndexSet.has(i)) {
                    output.push(rewriteUriAttribute(line, uri => toAbsoluteUrl(uri, manifestUrl)));
                    return;
                }
                if (!variant.keep.has(i)) return;
                const uri = matchGroup(line, /URI="([^"]+)"/);
                if (!uri) { output.push(line); return; }
                const dataUri = dataUriByUrl.get(toAbsoluteUrl(uri, manifestUrl));
                if (dataUri) output.push(rewriteUriAttribute(line, () => dataUri));
                return;
            }
            if (line.startsWith("#EXT-X-STREAM-INF")) { pendingStreamInf = line; return; }
            if (pendingStreamInf !== null && !line.startsWith("#")) {
                const dataUri = dataUriByUrl.get(toAbsoluteUrl(line, manifestUrl));
                if (dataUri) { output.push(pendingStreamInf, dataUri); variantCount += 1; }
                pendingStreamInf = null;
                return;
            }
            output.push(line);
        });

        if (variantCount > 0) masters.push({ language: variant.language, url: encodePlaylist(`${output.join("\n")}\n`) });
    }

    return masters;
}

function toSubtitleTracks(subtitles) {
    return subtitles
        .filter(s => typeof s?.url === "string" && s.url.startsWith("http"))
        .map(s => {
            const language = s.language || "Subtitle";
            const format = s.format ? ` (${String(s.format).toUpperCase()})` : "";
            return { url: s.url, language, name: `${language}${format}` };
        });
}

async function collectHlsStreams(embedUrl) {
    const embed = await resolveEmbed(embedUrl);
    if (!embed) return [];

    const masters = await buildMasterPlaylists(embed);
    const subtitles = toSubtitleTracks(embed.subtitles);

    return masters.map(({ language, url }) => {
        const isDub = language === "dub";
        const label = `${PROVIDER} \u2022 ${isDub ? "English" : "Japanese"}`;
        return {
            name: label,
            title: label,
            url,
            quality: "1080p \u2022 HLS",
            type: "hls",
            headers: { "User-Agent": USER_AGENT, Referer: `${API_BASE}/` },
            subtitles,
            rank: isDub ? 18 : 19,
        };
    });
}

async function collectServerStreams(embedUrl, audioType, hlsEnabled) {
    const [hlsOutcome, downloadOutcome] = await Promise.allSettled([
        hlsEnabled ? collectHlsStreams(embedUrl) : Promise.resolve([]),
        resolveDownloadLink(embedUrl),
    ]);

    const streams = hlsOutcome.status === "fulfilled" ? [...hlsOutcome.value] : [];
    const download = downloadOutcome.status === "fulfilled" ? downloadOutcome.value : null;

    if (download) {
        streams.push({
            name: PROVIDER,
            title: PROVIDER,
            url: download.url,
            quality: "1080p \u2022 MKV",
            headers: download.headers,
            rank: audioType === "dub" ? 16 : 17,
        });
    }

    return streams;
}

async function fetchServerList(path) {
    const res = await request(
        BASE_URL + path,
        { headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: `${BASE_URL}/watch/` } },
        "json"
    );
    return res?.success === true && Array.isArray(res.servers) ? res.servers : [];
}

async function locateServers(tmdbId, mediaType, season, episode) {
    const targetId = parseInt(tmdbId, 10);
    if (targetId) {
        const directServers = await fetchServerList(`/api/flix/${targetId}/${episode}`);
        if (directServers.length) return directServers;
    }

    const bridge = (typeof globalThis !== "undefined" && (globalThis.NextGenNative || globalThis.EclipsiaNative)) || null;
    const callArgs = bridge ? JSON.parse(bridge.getCallArgs() || "{}") : {};
    const titleCandidates = [callArgs.title, callArgs.showTitle, callArgs.romajiTitle].filter(Boolean);

    if (!titleCandidates.length) {
        try {
            const query = `query ($id: Int) { Media (id: $id, type: ANIME) { title { english romaji } } }`;
            const alData = await request("https://graphql.anilist.co", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, variables: { id: targetId } })
            }, "json");
            const m = alData?.data?.Media?.title;
            if (m?.english) titleCandidates.push(m.english);
            if (m?.romaji) titleCandidates.push(m.romaji);
        } catch { }
    }

    const titles = [...new Set(titleCandidates)].slice(0, 3);
    const searchResults = await Promise.all(
        titles.map(title =>
            request(
                `${BASE_URL}/api/v1/search?q=${encodeURIComponent(title)}&limit=10&offset=0`,
                { headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: `${BASE_URL}/` } },
                "json"
            )
        )
    );

    const slugs = [
        ...new Set(
            searchResults.flatMap(r => (r?.results ?? []).map(item => item?.anime_id).filter(Boolean))
        ),
    ].slice(0, 10);

    const candidates = await Promise.all(
        slugs.map(slug =>
            request(
                `${BASE_URL}/api/v1/anime/${encodeURIComponent(slug)}`,
                { headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: `${BASE_URL}/` } },
                "json"
            )
        )
    );

    const match = candidates.find(c => {
        if (!c?.anilist_id) return false;
        return c.anilist_id === targetId;
    });

    return match ? fetchServerList(`/api/flix/${match.anilist_id}/${episode}`) : [];
}

function extractEmbeds(servers) {
    const seen = new Set();
    const embeds = [];

    for (const server of servers) {
        const link = typeof server?.dataLink === "string" && server.dataLink.startsWith("http")
            ? server.dataLink : null;
        if (!link) continue;

        const serverName = String(server.serverName || "HD").trim();
        if (/^hd-?2$/i.test(serverName)) continue;

        const key = link.split("?")[0] + serverName;
        if (seen.has(key)) continue;
        seen.add(key);
        embeds.push({ link, audioType: server.dataType });
    }

    return embeds;
}

function dedupeStreams(streams) {
    const seenUrls = new Set();
    const seenHlsLabels = new Set();

    return streams.filter(stream => {
        if (!stream.url || seenUrls.has(stream.url)) return false;
        seenUrls.add(stream.url);

        if (stream.type !== "hls") return true;
        const labelKey = `${stream.name}|${stream.quality}`;
        if (seenHlsLabels.has(labelKey)) return false;
        seenHlsLabels.add(labelKey);
        return true;
    });
}

function toResult(stream) {
    const tag = createSortTag(stream.rank);
    const result = {
        name: tag + stream.name,
        title: tag + stream.title,
        url: stream.url,
        quality: stream.quality,
        headers: stream.headers,
    };
    if (stream.type) result.type = stream.type;
    if (stream.subtitles?.length) result.subtitles = stream.subtitles;
    return result;
}

async function onSettings() {
    return [
        { type: "header", label: `${PROVIDER} Settings` },
        {
            type: "toggle",
            key: "hlsEnabled",
            label: "Enable HLS Streams",
            defaultValue: false,
            description: "HLS streams in addition to MKV stream. Doesn't work on iOS & Disabled by default.",
        },
    ];
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const hlsEnabled = (typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS.hlsEnabled === true);
        const isTv = mediaType === "tv";

        const servers = await locateServers(tmdbId, mediaType, isTv ? season : 1, isTv ? episode : 1);
        if (!servers || !servers.length) return [];

        const outcomes = await Promise.allSettled(
            extractEmbeds(servers).map(({ link, audioType }) =>
                collectServerStreams(link, audioType, hlsEnabled)
            )
        );

        const streams = outcomes.flatMap(o => o.status === "fulfilled" ? o.value : []);
        return dedupeStreams(streams).map(toResult);
    } catch {
        return [];
    }
}

module.exports = { getStreams, onSettings };