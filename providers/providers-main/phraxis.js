const BASE_URL = "https://hackstore2.com";
const TMDB_API = "https://api.themoviedb.org/3";
const API_BASE = `${BASE_URL}/api/rest`;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const BLOCKED_SERVERS = ["videoapp"];
const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": `${BASE_URL}/`,
    "Origin": BASE_URL
};

function slugify(text) {
    if (!text) return "";
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
}

function normalizeForMatch(text) {
    if (!text) return "";
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreSlugAgainstTitles(slug, titleCandidates, year) {
    if (!slug) return 0;
    const normalized = normalizeForMatch(slug);
    let best = 0;

    for (const candidate of titleCandidates) {
        const clean = normalizeForMatch(candidate);
        if (!clean) continue;
        if (normalized === clean) { best = 100; continue; }

        const words = clean.split(/\s+/).filter(w => w.length > 2);
        if (!words.length) continue;

        const hits = words.filter(w => normalized.includes(w)).length;
        if (hits > 0) best = Math.max(best, (hits / words.length) * 75);
    }

    if (best > 0 && year && normalized.includes(String(year))) best += 20;
    return best;
}

function unpackDeanEdwards(p, a, c, k) {
    const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    function fromBase(val, radix) {
        let n = 0;
        for (const ch of val) {
            const i = alphabet.indexOf(ch);
            if (i === -1) return NaN;
            n = n * radix + i;
        }
        return n;
    }
    return p.replace(/\b([0-9a-zA-Z]+)\b/g, token => {
        const idx = fromBase(token, a);
        return (isNaN(idx) || idx >= k.length || !k[idx]) ? token : k[idx];
    });
}

function extractPackedM3u8(html) {
    const packed = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
    if (!packed) return null;
    const unpacked = unpackDeanEdwards(packed[1], parseInt(packed[2], 10), parseInt(packed[3], 10), packed[4].split("|"));
    const m = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
    return m ? m[1] : null;
}

function qualityFromUrl(url) {
    if (!url) return null;
    const u = url.toLowerCase();
    if (/4k|2160p?/.test(u)) return "4K";
    if (/1080p?/.test(u)) return "1080p";
    if (/720p?/.test(u)) return "720p";
    if (/480p?/.test(u)) return "480p";
    return null;
}

async function probeM3u8Quality(m3u8Url, headers) {
    const fast = qualityFromUrl(m3u8Url);
    if (fast) return fast;
    if (!m3u8Url || !m3u8Url.includes(".m3u8")) return "720p";

    try {
        const res = await fetch(m3u8Url, { headers: headers || { "User-Agent": USER_AGENT } });
        if (!res.ok) return "720p";
        const text = await res.text();
        if (!text.includes("#EXT-X-STREAM-INF")) return "720p";

        let maxHeight = 0;
        let match;
        const re = /RESOLUTION=\d+x(\d+)/gi;
        while ((match = re.exec(text)) !== null) {
            const h = parseInt(match[1], 10);
            if (h > maxHeight) maxHeight = h;
        }

        if (maxHeight >= 2160) return "4K";
        if (maxHeight >= 1080) return "1080p";
        if (maxHeight >= 720) return "720p";
        if (maxHeight >= 480) return "480p";
        return "720p";
    } catch {
        return "720p";
    }
}

function serverLabel(url) {
    if (!url) return "Online";
    const u = url.toLowerCase();
    if (u.includes("vimeos")) return "Vimeos";
    if (u.includes("goodstream")) return "GoodStream";
    if (u.includes("vidhide") || u.includes("minochinos")) return "VidHide";
    if (u.includes("videoapp")) return "Videoapp";
    return "Servidor";
}

async function resolveVimeos(url) {
    try {
        const headers = { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" };
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        const html = await res.text();

        let streamUrl = extractPackedM3u8(html);
        if (!streamUrl) {
            const m = html.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m) streamUrl = m[1];
        }

        if (!streamUrl) return null;
        const quality = await probeM3u8Quality(streamUrl, headers);
        return { url: streamUrl, quality, headers };
    } catch {
        return null;
    }
}

async function resolveGoodStream(url) {
    try {
        const headers = { "User-Agent": USER_AGENT, "Referer": "https://goodstream.one/", "Origin": "https://goodstream.one" };
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        const html = await res.text();

        const directMatch = html.match(/file:\s*"([^"]+)"/i);
        const streamUrl = directMatch ? directMatch[1] : extractPackedM3u8(html);
        if (!streamUrl) return null;

        const quality = await probeM3u8Quality(streamUrl, headers);
        return { url: streamUrl, quality, headers };
    } catch {
        return null;
    }
}

async function resolveVidHide(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" } });
        if (!res.ok) return null;
        const html = await res.text();
        const streamUrl = extractPackedM3u8(html);
        if (!streamUrl) return null;

        const headers = { "User-Agent": USER_AGENT, "Referer": url };
        const quality = await probeM3u8Quality(streamUrl, headers);
        return { url: streamUrl, quality, headers };
    } catch {
        return null;
    }
}

async function resolveVideoApp(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` } });
        if (!res.ok) return null;
        const html = await res.text();
        const m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        return m ? dispatchResolver(m[1]) : null;
    } catch {
        return null;
    }
}

async function dispatchResolver(url) {
    if (!url) return null;
    const u = url.toLowerCase();
    if (u.includes("vimeos")) return resolveVimeos(url);
    if (u.includes("goodstream")) return resolveGoodStream(url);
    if (u.includes("vidhide") || u.includes("minochinos")) return resolveVidHide(url);
    if (u.includes("videoapp")) return resolveVideoApp(url);
    return null;
}

async function fetchPostId(slugCandidates, postType) {
    for (const slug of slugCandidates) {
        try {
            const res = await fetch(
                `${API_BASE}/single?post_name=${encodeURIComponent(slug)}&post_type=${postType}`,
                { headers: HEADERS }
            );
            if (!res.ok) continue;
            const json = await res.json();
            if (!json || !json.data) continue;
            if (postType === "movies" && json.data._id) return json.data._id;
            if (postType === "episodes" && json.data.episode && json.data.episode._id) return json.data.episode._id;
            if (json.data._id) return json.data._id;
        } catch {
        }
    }
    return null;
}

async function searchHackstoreByTitle(queries, titleCandidates, year) {
    for (const q of queries) {
        try {
            const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`, { headers: HEADERS });
            if (!res.ok) continue;
            const json = await res.json();
            const items = (json && json.data && Array.isArray(json.data)) ? json.data : [];

            const seen = new Set();
            const slugs = [];
            for (const item of items) {
                const s = item.slug || item.post_name;
                if (s && !seen.has(s) && scoreSlugAgainstTitles(s, titleCandidates, year) >= 35) {
                    seen.add(s);
                    slugs.push(s);
                }
            }
            if (slugs.length) return slugs;
        } catch {
        }
    }
    return [];
}

async function fetchPlayerEmbeds(postId) {
    try {
        const res = await fetch(`${API_BASE}/player?post_id=${postId}`, { headers: HEADERS });
        if (!res.ok) return [];
        const json = await res.json();
        return (json && json.data && Array.isArray(json.data)) ? json.data : [];
    } catch {
        return [];
    }
}

function resWeight(quality) {
    const q = (quality || "").toUpperCase();
    if (q === "4K" || q === "2160P") return 5;
    if (q === "1440P") return 4;
    if (q === "1080P") return 3;
    if (q === "720P") return 2;
    if (q === "480P") return 1;
    return 0;
}

function getInvertedSortTag(score, maxScore) {
    maxScore = maxScore || 999999;
    let inv = Math.max(0, maxScore - (parseInt(score, 10) || 0));
    let bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    const chars = [];
    for (let i = 0; i < bin.length; i++) {
        chars.push(bin.charAt(i) === "1" ? "\uFEFF" : "\u200B");
    }
    return chars.join("");
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const isMovie = mediaType === "movie";
        const sNum = parseInt(season, 10) || 1;
        const eNum = parseInt(episode, 10) || 1;
        const epPadded = String(eNum).padStart(2, "0");

        const tmdbRes = await fetch(
            `${TMDB_API}/${isMovie ? "movie" : "tv"}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX&append_to_response=alternative_titles`,
            { headers: { "User-Agent": USER_AGENT } }
        );
        if (!tmdbRes.ok) return [];
        const meta = await tmdbRes.json();

        const primaryTitle = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
        const origTitle = isMovie ? meta.original_title : meta.original_name;
        const year = ((isMovie ? meta.release_date : meta.first_air_date) || "").slice(0, 4);

        const altTitles = ((meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [])
            .map(a => a.title).filter(Boolean);

        const allTitles = [...new Set([primaryTitle, origTitle !== primaryTitle ? origTitle : null, ...altTitles].filter(Boolean))];

        const querySeen = new Set();
        const searchQueries = [];
        const slugSeen = new Set();
        const baseSlugs = [];

        for (const title of allTitles) {
            const q = normalizeForMatch(title);
            if (q && !querySeen.has(q)) { querySeen.add(q); searchQueries.push(q); }

            const s = slugify(title);
            if (s && !slugSeen.has(s)) { slugSeen.add(s); baseSlugs.push(s); }

            if (title.includes("&")) {
                const withY = slugify(title.replace(/&/g, " y "));
                const withAnd = slugify(title.replace(/&/g, " and "));
                if (withY && !slugSeen.has(withY)) { slugSeen.add(withY); baseSlugs.push(withY); }
                if (withAnd && !slugSeen.has(withAnd)) { slugSeen.add(withAnd); baseSlugs.push(withAnd); }
            }

            const short = slugify(title.split(/[:\-\(]/)[0]);
            if (short && !slugSeen.has(short)) { slugSeen.add(short); baseSlugs.push(short); }
        }

        const directSlugs = [];
        for (const base of baseSlugs) {
            if (isMovie) {
                directSlugs.push(base);
                if (year) directSlugs.push(`${base}-${year}`);
            } else {
                directSlugs.push(`${base}-temporada-${sNum}-episodio-${eNum}`);
                directSlugs.push(`${base}-temporada-${sNum}-capitulo-${eNum}`);
                directSlugs.push(`${base}-temporada-${sNum}-episodio-${epPadded}`);
                directSlugs.push(`${base}-temporada-${sNum}-capitulo-${epPadded}`);
                directSlugs.push(`${base}-${sNum}x${eNum}`);
                directSlugs.push(`${base}-${sNum}x${epPadded}`);
            }
        }

        const postType = isMovie ? "movies" : "episodes";
        let postId = await fetchPostId(directSlugs, postType);

        if (!postId) {
            const foundSlugs = await searchHackstoreByTitle(searchQueries, allTitles, year);
            if (foundSlugs.length) {
                const fallbackSlugs = [];
                for (const s of foundSlugs) {
                    if (isMovie) {
                        fallbackSlugs.push(s);
                        if (year) fallbackSlugs.push(`${s}-${year}`);
                    } else {
                        fallbackSlugs.push(`${s}-temporada-${sNum}-episodio-${eNum}`);
                        fallbackSlugs.push(`${s}-temporada-${sNum}-capitulo-${eNum}`);
                        fallbackSlugs.push(`${s}-temporada-${sNum}-episodio-${epPadded}`);
                        fallbackSlugs.push(`${s}-${sNum}x${eNum}`);
                    }
                }
                postId = await fetchPostId(fallbackSlugs, postType);
            }
        }

        if (!postId) return [];

        const embeds = await fetchPlayerEmbeds(postId);
        if (!embeds.length) return [];

        const filteredEmbeds = embeds.filter(embed => {
            const u = (embed.url || embed.link || "").toLowerCase();
            return !BLOCKED_SERVERS.some(domain => u.includes(domain));
        });

        const resolved = await Promise.all(
            filteredEmbeds.map(async embed => {
                try {
                    const embedUrl = embed.url || embed.link || "";
                    const result = await dispatchResolver(embedUrl);
                    if (!result || !result.url) return null;
                    const label = serverLabel(embedUrl);
                    const quality = result.quality || "720p";
                    return {
                        name: `HackStore \u2022 ${label}`,
                        title: `HackStore \u2022 ${label} \u2022 ${quality}`,
                        quality,
                        url: result.url,
                        headers: result.headers || {}
                    };
                } catch {
                    return null;
                }
            })
        );

        const seen = new Set();
        let streams = resolved.filter(s => s !== null && s.url && !seen.has(s.url) && seen.add(s.url));

        streams.sort((a, b) => resWeight(b.quality) - resWeight(a.quality));

        const total = streams.length;
        streams = streams.map((s, i) => {
            const tag = getInvertedSortTag(total - i, total + 1);
            return Object.assign({}, s, { name: tag + s.name, title: tag + s.title });
        });

        return streams;
    } catch {
        return [];
    }
}

module.exports = { getStreams };
