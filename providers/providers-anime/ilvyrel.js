const CryptoJS = require("crypto-js");
const cheerio = require("cheerio-without-node-native");
const BASE_URL = "https://toonworld4all.me";

const ARCV_BASE = "https://archive.toonworld4all.me";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

function emptyResponse() {
    return {
        ok: false,
        status: 504,
        url: "",
        headers: { get: () => "" },
        text: async () => "",
        json: async () => null
    };
}

async function safeFetch(url, options) {
    try {
        const headers = Object.assign({ "User-Agent": USER_AGENT }, (options && options.headers) || {});
        const response = await fetch(url, Object.assign({}, options, { headers: headers }));
        return response || emptyResponse();
    } catch {
        return emptyResponse();
    }
}

function flatten(lists) {
    return lists.reduce((accumulator, list) => accumulator.concat(list), []);
}

function hexToBytes(hex) {
    const bytes = [];
    for (let i = 0; i + 1 < hex.length; i += 2) {
        bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    return bytes;
}

function bytesToWordArray(bytes) {
    const words = [];
    for (let i = 0; i < bytes.length; i += 4) {
        words.push(
            ((bytes[i] || 0) << 24) |
            ((bytes[i + 1] || 0) << 16) |
            ((bytes[i + 2] || 0) << 8) |
            (bytes[i + 3] || 0)
        );
    }
    return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function wordArrayToBytes(wordArray) {
    const bytes = [];
    for (let i = 0; i < wordArray.sigBytes; i++) {
        bytes.push((wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff);
    }
    return bytes;
}

function bytesToUtf8(bytes) {
    try {
        let encoded = "";
        for (let i = 0; i < bytes.length; i++) {
            encoded += "%" + (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
        }
        return decodeURIComponent(encoded);
    } catch {
        return String.fromCharCode.apply(null, bytes);
    }
}

function decryptRedirectToken(tokenHex) {
    try {
        if (!tokenHex || tokenHex.length < 34) return null;

        const rawBytes = hexToBytes(tokenHex);
        const counter = rawBytes.slice(0, 16);
        const cipherBytes = rawBytes.slice(16);
        const blockCount = Math.ceil(cipherBytes.length / 16);
        const key = CryptoJS.enc.Hex.parse("556151c9cefdee6ea51aec956e6b8682312bb609c0167d4adc71f365a928920f");

        const counterBytes = [];
        for (let block = 0; block < blockCount; block++) {
            for (let i = 0; i < 16; i++) counterBytes.push(counter[i]);
            for (let i = 15; i >= 0; i--) {
                counter[i] = (counter[i] + 1) & 0xff;
                if (counter[i] !== 0) break;
            }
        }

        const keystream = wordArrayToBytes(
            CryptoJS.AES.encrypt(bytesToWordArray(counterBytes), key, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.NoPadding
            }).ciphertext
        );

        const plainBytes = new Array(cipherBytes.length);
        for (let i = 0; i < cipherBytes.length; i++) {
            plainBytes[i] = cipherBytes[i] ^ keystream[i];
        }

        const payload = JSON.parse(bytesToUtf8(plainBytes));
        return (payload && payload.url) || null;
    } catch {
        return null;
    }
}

function extractEmbeddedProps(html) {
    const markerIndex = html.indexOf("__PROPS__");
    if (markerIndex === -1) return null;

    const jsonStart = html.indexOf("{", markerIndex);
    if (jsonStart === -1) return null;
    const jsonEnd = html.indexOf("</script>", jsonStart);
    if (jsonEnd === -1) return null;

    try {
        return JSON.parse(html.slice(jsonStart, jsonEnd).trim().replace(/;\s*$/, ""));
    } catch {
        return null;
    }
}

async function resolveRedirectTarget(redirectPath) {
    const rawPath = String(redirectPath || "");
    const tokenMatch = rawPath.match(/\/redirect\/([0-9a-fA-F]{32,})/);

    if (tokenMatch) {
        const decryptedUrl = decryptRedirectToken(tokenMatch[1]);
        if (decryptedUrl && decryptedUrl.indexOf("http") === 0) return decryptedUrl;
    }

    const absoluteUrl = rawPath.indexOf("http") === 0
        ? rawPath
        : ARCV_BASE + (rawPath.charAt(0) === "/" ? "" : "/") + rawPath;

    try {
        const response = await safeFetch(absoluteUrl);
        if (!response.ok) return null;

        const html = await response.text();
        const props = extractEmbeddedProps(html);

        if (props) {
            if (props.link && props.link.domain && props.link.hidden) {
                return props.link.domain + props.link.hidden;
            }
            if (props.destination && props.destination.indexOf("http") === 0) {
                return props.destination;
            }
        }

        const obfuscatedMatch = html.match(/<code>(https?:\/\/[^<]+)<span[^>]*>([^<]+)<\/span><\/code>/i);
        if (obfuscatedMatch) return obfuscatedMatch[1] + obfuscatedMatch[2];

        const hostMatch = html.match(
            /https?:\/\/(?:[a-zA-Z0-9-]+\.)*(?:hubcloud\.[a-z]+|pixeldrain\.[a-z]+)\/[^\s"<>']+/i
        );
        if (hostMatch) return hostMatch[0];
    } catch { }

    return null;
}

async function fetchAnimeMetadata(numericId, isSeries) {
    try {
        const bridge = (typeof globalThis !== "undefined" && (globalThis.NextGenNative || globalThis.EclipsiaNative)) || null;
        const callArgs = bridge ? JSON.parse(bridge.getCallArgs() || "{}") : {};
        if (callArgs.title || callArgs.showTitle) {
            return {
                title: callArgs.title || callArgs.showTitle || "",
                year: null
            };
        }
        const aniData = await safeFetch(`https://api.ani.zip/mappings?anilist_id=${numericId}`);
        if (aniData?.ok) {
            const data = await aniData.json();
            const t = data?.titles?.en || data?.titles?.['x-jat'] || data?.titles?.ja;
            if (t) return { title: t, year: null };
        }
    } catch { }
    return null;
}

function normalizeTitle(value) {
    if (!value) return "";
    return value
        .toLowerCase()
        .replace(/^download\s+/i, "")
        .replace(/\b(the|a|an)\b/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreSearchResult(resultTitle, targetTitle, targetYear, isSeries, seasonNumber) {
    const normalizedTarget = normalizeTitle(targetTitle);
    const normalizedResult = normalizeTitle(resultTitle);
    const targetWords = normalizedTarget.split(" ").filter(Boolean);
    const matchedWords = targetWords.filter((word) => normalizedResult.indexOf(word) !== -1);

    if (targetWords.length > 0 && matchedWords.length === 0) return -1;

    let score = targetWords.length > 0 ? matchedWords.length / targetWords.length : 0;

    if (normalizedResult.indexOf(normalizedTarget) === 0) score += 0.35;
    else if (normalizedResult.indexOf(normalizedTarget) !== -1) score += 0.15;

    if (targetYear && resultTitle.indexOf(String(targetYear)) !== -1) score += 0.25;

    if (isSeries) {
        const paddedSeason = String(seasonNumber).padStart(2, "0");
        const seasonPattern = new RegExp(
            "\\b(?:Season\\s*0*" + seasonNumber + "|S" + paddedSeason + "|S0*" + seasonNumber + ")\\b",
            "i"
        );

        if (seasonPattern.test(resultTitle)) score += 0.4;
        else if (/\b(?:Season\s*\d+|S\d{1,2})\b/i.test(resultTitle)) score -= 0.45;
    } else if (/\b(?:Season\s*\d+|S\d{1,2}|Episodes)\b/i.test(resultTitle)) {
        score -= 0.4;
    }

    return score;
}

function detectQuality(fileName, fallbackLabel) {
    const qualityPattern = /\b(2160p|4K|UHD|1440p|2K|1080p|720p|540p|480p|360p)\b/i;
    const match = String(fileName || "").match(qualityPattern) || String(fallbackLabel || "").match(qualityPattern);

    if (!match) return "1080p";

    const quality = match[1].toUpperCase();
    if (quality === "2160P" || quality === "4K" || quality === "UHD") return "4K";
    if (quality === "1080P") return "1080p";
    return "other";
}

function sanitizeFileSize(rawSize) {
    const text = String(rawSize || "");
    const match = text.match(/(\d+(?:\.\d+)?\s*(?:TB|GB|MB|KB))/i);
    return match ? match[1].replace(/\s+/g, " ").trim() : text.split("|")[0].trim();
}

function createStream(serverLabel, url, fileName, fallbackLabel, fileSize) {
    const label = "ToonWorld4All \u2022 " + serverLabel + " \u2022 Multi-Dub";
    return {
        name: label,
        title: label,
        url: url,
        quality: detectQuality(fileName, fallbackLabel),
        size: sanitizeFileSize(fileSize)
    };
}

function createPixeldrainStream(link, fileName, label, fileSize) {
    const match = link.match(/\/u\/([A-Za-z0-9_-]+)/);
    if (!match) return null;

    return createStream(
        "Pixeldrain",
        "https://pixeldrain.com/api/file/" + match[1] + "?download",
        fileName,
        label,
        fileSize
    );
}

async function extractHubCloudStreams(pageUrl, label, fallbackSize) {
    const streams = [];

    try {
        const response = await safeFetch(pageUrl);
        if (!response.ok) return streams;

        const html = await response.text();
        const $ = cheerio.load(html);

        let fileName = ($("div.card-header").first().text() || "").trim();
        const sizeMatch = ($("i#size").first().text() || "").match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i);
        const fileSize = (sizeMatch ? sizeMatch[1] : "") || fallbackSize || "";

        let generatorUrl = $("a#download").attr("href") || $("a.btn-primary[href*='hubcloud.php']").attr("href") || "";
        if (!generatorUrl) {
            const fallbackMatch = html.match(/https?:\/\/[^"'\s>]+hubcloud\.php\?[^"'\s>]+/i);
            if (fallbackMatch) generatorUrl = fallbackMatch[0];
        }
        if (!generatorUrl) return streams;

        const generatorResponse = await safeFetch(generatorUrl, { headers: { "Referer": pageUrl } });
        if (!generatorResponse.ok) return streams;

        const $generator = cheerio.load(await generatorResponse.text());
        if (!fileName) fileName = ($generator("div.card-header").first().text() || "").trim();

        $generator("a[href]").each((_, anchor) => {
            const text = $generator(anchor).text().trim();
            const link = ($generator(anchor).attr("href") || "").trim();
            if (link.indexOf("http") !== 0) return;

            if (/FSLv2/i.test(text)) {
                streams.push(createStream("FSLv2", link, fileName, label, fileSize));
            } else if (/FSL\s*Server/i.test(text)) {
                streams.push(createStream("FSL Server", link, fileName, label, fileSize));
            } else if (/pixeldrain|pixelserver/i.test(text) || link.indexOf("pixeldrain.") !== -1) {
                const pixeldrainStream = createPixeldrainStream(link, fileName, label, fileSize);
                if (pixeldrainStream) streams.push(pixeldrainStream);
            }
        });
    } catch { }

    return streams;
}

async function resolveStreamsFromRedirect(redirectLink, label, size) {
    try {
        const destinationUrl = await resolveRedirectTarget(redirectLink);
        if (!destinationUrl) return [];

        if (destinationUrl.indexOf("hubcloud.") !== -1) {
            return await extractHubCloudStreams(destinationUrl, label, size);
        }

        if (destinationUrl.indexOf("pixeldrain.") !== -1) {
            const pixeldrainStream = createPixeldrainStream(destinationUrl, "", label, size);
            return pixeldrainStream ? [pixeldrainStream] : [];
        }
    } catch { }

    return [];
}

async function extractArchivePageStreams(archiveUrl, postTitle) {
    try {
        const response = await safeFetch(archiveUrl);
        if (!response.ok) return [];

        const html = await response.text();
        const pendingResolutions = [];

        const props = extractEmbeddedProps(html);
        const encodes = (props && props.data && props.data.data && props.data.data.encodes) || [];

        for (const encode of encodes) {
            const codec = (encode.readable && encode.readable.codec) || encode.resolution || "";
            const size = (encode.readable && encode.readable.size) || "";
            const label = [codec, postTitle].filter(Boolean).join(" ");

            for (const file of (encode.files || [])) {
                if (file && file.link) {
                    pendingResolutions.push(resolveStreamsFromRedirect(file.link, label, size));
                }
            }
        }

        if (pendingResolutions.length === 0) {
            const $ = cheerio.load(html);
            const redirectLinks = new Set();

            $("a[href*='/redirect/']").each((_, anchor) => {
                const href = ($(anchor).attr("href") || "").trim();
                if (href) redirectLinks.add(href);
            });

            for (const href of redirectLinks) {
                pendingResolutions.push(resolveStreamsFromRedirect(href, postTitle, ""));
            }
        }

        return flatten(await Promise.all(pendingResolutions));
    } catch {
        return [];
    }
}

function buildEpisodePattern(seasonNumber, episodeNumber) {
    const paddedSeason = String(seasonNumber).padStart(2, "0");

    let pattern = "(?:-" + seasonNumber + "x0*" + episodeNumber +
        "|-" + paddedSeason + "x0*" + episodeNumber +
        "|-(?:ep|episode)-?0*" + episodeNumber;

    if (seasonNumber === 1) pattern += "|-[xX]0*" + episodeNumber;

    return new RegExp(pattern + ")(?:/|\\?|$)", "i");
}

async function searchPosts(query, metadata, isSeries, seasonNumber) {
    const response = await safeFetch(BASE_URL + "/?s=" + encodeURIComponent(query));
    if (!response.ok) return [];

    const $ = cheerio.load(await response.text());
    const candidates = [];

    $("article").each((_, article) => {
        const anchor = $(article).find("h2 a, .entry-title a, a[href]").first();
        const url = (anchor.attr("href") || "").trim();
        const title = ($(article).find("h2, .entry-title").first().text() || anchor.text() || "").trim();

        if (!url || !title || /shows-list|movies-list/i.test(url)) return;

        const score = scoreSearchResult(title, metadata.title, metadata.year, isSeries, seasonNumber);
        if (score >= 0.35) candidates.push({ url: url, score: score });
    });

    return candidates;
}

async function findBestMatchingPost(metadata, isSeries, seasonNumber) {
    const normalizedQuery = metadata.title
        .toLowerCase()
        .replace(/[()[\]!?&'",:._-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const shortQuery = normalizedQuery.split(" ").slice(0, 3).join(" ");

    const queries = [normalizedQuery];
    if (shortQuery && shortQuery !== normalizedQuery) queries.push(shortQuery);

    const results = await Promise.all(
        queries.map((query) => searchPosts(query, metadata, isSeries, seasonNumber).catch(() => []))
    );

    const seenUrls = new Set();
    let best = null;

    for (const candidates of results) {
        for (const candidate of candidates) {
            if (seenUrls.has(candidate.url)) continue;
            seenUrls.add(candidate.url);
            if (!best || candidate.score > best.score) best = candidate;
        }
    }

    return best;
}

function parseSizeInMegabytes(sizeText) {
    const match = String(sizeText || "").match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i);
    if (!match) return 0;

    const multipliers = { TB: 1024 * 1024, GB: 1024, MB: 1, KB: 1 / 1024 };
    return parseFloat(match[1]) * multipliers[match[2].toUpperCase()];
}

function getSortTag(rank) {
    let binary = Math.max(0, 1000000 - rank).toString(2);
    while (binary.length < 20) binary = "0" + binary;
    return binary.split("").map((bit) => (bit === "1" ? "\uFEFF" : "\u200B")).join("");
}

function sortAndTagStreams(streams) {
    return streams
        .map((stream) => ({ stream: stream, sizeMb: parseSizeInMegabytes(stream.size) }))
        .sort((a, b) => b.sizeMb - a.sizeMb)
        .map((entry) => {
            const rank = Math.min(1000000, Math.round(entry.sizeMb));
            const sortTag = getSortTag(rank);
            return Object.assign({}, entry.stream, {
                name: sortTag + entry.stream.name,
                title: sortTag + entry.stream.title
            });
        });
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const isSeries = mediaType === "tv";
        if (isSeries && (season == null || episode == null)) return [];

        const seasonNumber = isSeries ? Number(season) : null;
        const episodeNumber = isSeries ? Number(episode) : null;

        const metadata = await fetchAnimeMetadata(tmdbId, isSeries);
        if (!metadata) return [];

        const post = await findBestMatchingPost(metadata, isSeries, seasonNumber);
        if (!post) return [];

        const postResponse = await safeFetch(post.url);
        if (!postResponse.ok) return [];

        const $ = cheerio.load(await postResponse.text());
        const episodePattern = isSeries ? buildEpisodePattern(seasonNumber, episodeNumber) : null;
        const archiveUrls = new Set();

        $("a[href*='archive.toonworld4all']").each((_, anchor) => {
            const href = ($(anchor).attr("href") || "").trim();
            if (!href) return;

            if (isSeries) {
                if (href.indexOf("/episode/") !== -1 && episodePattern.test(href)) archiveUrls.add(href);
            } else if (href.indexOf("/movie/") !== -1) {
                archiveUrls.add(href);
            }
        });

        const archiveResults = await Promise.all(
            Array.from(archiveUrls).map((url) => extractArchivePageStreams(url, post.title))
        );

        const seenUrls = new Set();
        const uniqueStreams = flatten(archiveResults).filter((stream) =>
            stream &&
            stream.url &&
            (stream.quality === "4K" || stream.quality === "1080p") &&
            !seenUrls.has(stream.url) &&
            seenUrls.add(stream.url)
        );

        return sortAndTagStreams(uniqueStreams);
    } catch {
        return [];
    }
}

module.exports = { getStreams };