const cheerio = require("cheerio");
const BASE_URL = "https://anizone.to";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "Referer": "https://anizone.to/",
};
const RE_HEX_ESCAPE = /\\x([0-9a-fA-F]{2})/g;
const RE_STRAY_BACKSLASH = /\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g;

function unescapeJson(raw) {
    if (!raw) return "";
    return raw
        .replace(/\\u0022/g, '"')
        .replace(/\\u0026/g, "&")
        .replace(/\\'/g, "'")
        .replace(/\\\//g, "/")
        .replace(/\\\\/g, "\\")
        .replace(/\\&/g, "&")
        .replace(/\\0/g, "\\u0000")
        .replace(RE_HEX_ESCAPE, (_, h) => "\\u00" + h)
        .replace(RE_STRAY_BACKSLASH, "");
}

function parseEmbedded(raw) {
    return JSON.parse(unescapeJson(raw));
}

async function httpText(path) {
    const url = path.startsWith("http") ? path : BASE_URL + path;
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) return "";
        return await res.text();
    } catch {
        return "";
    }
}

async function httpJson(url, opts) {
    try {
        const res = await fetch(url, opts);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function httpWithCookies(path) {
    const url = path.startsWith("http") ? path : BASE_URL + path;
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) return { text: "", cookies: "", ok: false };
        const text = await res.text();
        let cookies = "";
        try { cookies = res.headers.get("set-cookie") || ""; } catch { }
        return { text, cookies, ok: true };
    } catch {
        return { text: "", cookies: "", ok: false };
    }
}

async function fetchMalTitle(malId) {
    if (!malId) return null;
    const data = await httpJson(`https://animap.id/api/mal/${malId}`);
    return data?.title || data?.title_english || null;
}

function extractAnimeCards(html, $) {
    const m = html.match(/items:\s*JSON\.parse\('((?:[^'\\]|\\.)*)'\)/);
    if (m) {
        try {
            const parsed = parseEmbedded(m[1]);
            if (Array.isArray(parsed)) {
                const results = [];
                for (const item of parsed) {
                    if (!item?.slug) continue;
                    const titleSet = new Set();
                    if (item.main_title) titleSet.add(item.main_title);
                    if (item.title_list && typeof item.title_list === "object") {
                        Object.values(item.title_list).forEach(t => { if (t) titleSet.add(t); });
                    }
                    results.push({ slug: item.slug, titles: Array.from(titleSet) });
                }
                if (results.length > 0) return results;
            }
        } catch { }
    }

    const results = [];
    $('[x-data*="anmTitles"]').each((_, el) => {
        const href = $(el).find('a[href*="/anime/"]').first().attr("href");
        if (!href) return;
        const parts = href.split("/");
        const animeSlug = parts[parts.length - 1] || parts[parts.length - 2];
        const titleSet = new Set();
        const xData = $(el).attr("x-data") || "";
        const xm = xData.match(/JSON\.parse\('((?:[^'\\]|\\.)*)'\)/);
        if (xm) {
            try {
                Object.values(parseEmbedded(xm[1])).forEach(t => { if (t) titleSet.add(t); });
            } catch { }
        }
        results.push({ slug: animeSlug, titles: Array.from(titleSet) });
    });
    return results;
}

function norm(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildSeasonFilter(season) {
    if (season === 1) {
        return {
            exclude: [
                /season\s*[2-9]/i, /saison\s*[2-9]/i, /[\s-][iI]{2,}/,
                /\s+[2-9]nd/i, /\s+[2-9]rd/i, /\s+[2-9]th/i,
                /\s+ii\b/i, /\s+iii\b/i, /\s+iv\b/i, /\s+v\b/i,
                /movie/i, /gekijouban/i, /the movie/i,
            ],
        };
    }
    const include = [];
    if (season === 2) include.push(/season\s*2/i, /saison\s*2/i, /2nd\s*season/i, /[\s-]ii\b/i, /\b2\b/);
    else if (season === 3) include.push(/season\s*3/i, /saison\s*3/i, /3rd\s*season/i, /[\s-]iii\b/i, /\b3\b/);
    else if (season === 4) include.push(/season\s*4/i, /saison\s*4/i, /4th\s*season/i, /[\s-]iv\b/i, /\b4\b/, /final\s*season/i);
    else include.push(new RegExp(`(?:season|saison)\\s*${season}`, "i"), new RegExp(`\\b${season}\\b`));
    return { include };
}

function pickSeriesSlug(cards, candidateTitles, baseTitle, season, seasonName) {
    const normCandidates = candidateTitles.map(norm).filter(Boolean);
    const normBase = norm(baseTitle);
    const normSeasonName = norm(seasonName);

    if (normSeasonName && normSeasonName !== "season" + season) {
        for (const card of cards) {
            if (card.titles.some(t => norm(t).includes(normSeasonName))) return card.slug;
        }
    }

    for (const candidate of normCandidates) {
        for (const card of cards) {
            if (card.titles.some(t => norm(t) === candidate)) return card.slug;
        }
    }

    const filter = buildSeasonFilter(season);
    for (const card of cards) {
        const baseMatch = card.titles.some(t => { const s = norm(t); return s.includes(normBase) || normBase.includes(s); });
        if (!baseMatch) continue;

        if (season === 1) {
            if (!card.titles.some(t => filter.exclude.some(r => r.test(t)))) return card.slug;
        } else {
            if (card.titles.some(t => filter.include.some(r => r.test(t)))) return card.slug;
        }
    }

    return cards[0]?.slug ?? null;
}

function pickMovieSlug(cards, candidateTitles) {
    const normCandidates = candidateTitles.map(norm).filter(Boolean);
    for (const card of cards) {
        if (card.titles.some(t => normCandidates.some(c => c === norm(t)))) return card.slug;
    }
    for (const card of cards) {
        if (card.titles.some(t => { const s = norm(t); return normCandidates.some(c => s.includes(c) || c.includes(s)); })) return card.slug;
    }
    return cards[0]?.slug ?? null;
}

function extractVidstack(html, $) {
    const m = html.match(/vidstackPlayer\(JSON\.parse\('((?:[^'\\]|\\.)*)'\)\)/);
    if (m) {
        try {
            const data = parseEmbedded(m[1]);
            const src = data.src ? data.src.replace(/\\/g, "") : null;
            const tracks = (data.subtitles || [])
                .map(s => ({ url: s.file ? s.file.replace(/\\/g, "") : "", name: s.title || s.language || "English", language: s.language || "en" }))
                .filter(s => s.url);
            if (src) return { src, tracks };
        } catch { }
    }

    let src = $("media-player").attr("src");
    if (!src) {
        const um = html.match(/https:\/\/[^"']+\/master\.m3u8/);
        if (um) src = um[0];
    }

    const tracks = [];
    $("track").each((_, el) => {
        const tsrc = $(el).attr("src");
        const kind = $(el).attr("kind");
        if (tsrc && (kind === "subtitles" || kind === "captions" || tsrc.endsWith(".ass") || tsrc.endsWith(".vtt"))) {
            tracks.push({ url: tsrc, name: $(el).attr("label") || "English", language: $(el).attr("srclang") || "en" });
        }
    });

    return { src, tracks };
}

async function searchAnime(query) {
    if (!query) return [];
    const html = await httpText(`/anime?search=${encodeURIComponent(query)}&sort=title-asc`);
    if (!html) return [];
    return extractAnimeCards(html, cheerio.load(html));
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const seasonNum = mediaType === "tv" ? parseInt(season, 10) : 1;
        const episodeNum = mediaType === "tv" ? parseInt(episode, 10) : 1;

        const bridge = (typeof globalThis !== "undefined" && (globalThis.NextGenNative || globalThis.EclipsiaNative)) || null;
        const callArgs = bridge ? JSON.parse(bridge.getCallArgs() || "{}") : {};

        let title = callArgs.showTitle || callArgs.title || "";
        let fallbackTitles = [callArgs.romajiTitle, callArgs.englishTitle, callArgs.nativeTitle].filter(Boolean);
        let targetEpisode = episodeNum;

        try {
            const aniData = await httpJson(`https://api.ani.zip/mappings?anilist_id=${tmdbId}`);
            if (aniData?.titles) {
                Object.values(aniData.titles).forEach(t => { if (t && !fallbackTitles.includes(t)) fallbackTitles.push(t); });
            }
            if (aniData?.mappings?.mal_id) {
                const malTitle = await fetchMalTitle(aniData.mappings.mal_id);
                if (malTitle && !fallbackTitles.includes(malTitle)) fallbackTitles.push(malTitle);
            }
        } catch { }

        if (!title && fallbackTitles.length > 0) title = fallbackTitles[0];
        if (!title) return [];

        const candidateTitles = [title, ...fallbackTitles];

        const searchQuery = title
            .split(":")[0]
            .replace(/season.*|\d+nd season|\d+rd season|\d+th season|saison.*/gi, "")
            .trim();

        let cards = await searchAnime(searchQuery);
        if (cards.length === 0 && title !== searchQuery) cards = await searchAnime(title.split(":")[0].trim());
        if (cards.length === 0) {
            for (const t of fallbackTitles) {
                cards = await searchAnime(t.split(":")[0].trim());
                if (cards.length > 0) break;
            }
        }
        if (cards.length === 0) return [];

        const animeSlug = mediaType === "tv"
            ? pickSeriesSlug(cards, candidateTitles, searchQuery, seasonNum, "")
            : pickMovieSlug(cards, candidateTitles);

        if (!animeSlug) return [];

        const epPath = `/anime/${animeSlug}/${targetEpisode}`;
        const page = await httpWithCookies(epPath);
        if (!page.ok || !page.text) return [];

        const $ = cheerio.load(page.text);
        const streams = [];
        const primary = extractVidstack(page.text, $);
        const serverBtns = $('button[wire\\:click*="setVideo"]');

        if (primary.src) {
            streams.push({
                name: "AniZone • Varyg",
                title: "AniZone • Varyg",
                url: primary.src,
                quality: "1080p",
                headers: HEADERS,
                subtitles: primary.tracks,
            });
        }

        if (serverBtns.length > 1) {
            const csrf = $("script[data-csrf]").attr("data-csrf");
            const snapshot = $("main > div[wire\\:snapshot], main > ul[wire\\:snapshot], [wire\\:snapshot]").attr("wire:snapshot");

            if (csrf && snapshot && page.cookies) {
                for (let i = 1; i < serverBtns.length; i++) {
                    const btn = serverBtns.eq(i);
                    const wireClick = btn.attr("wire:click") || "";
                    const idMatch = wireClick.match(/setVideo\((\d+)\)/);
                    if (!idMatch) continue;
                    const videoId = parseInt(idMatch[1], 10);

                    try {
                        const res = await fetch(`${BASE_URL}/livewire/update`, {
                            method: "POST",
                            headers: {
                                "Accept": "*/*",
                                "Content-Type": "application/json",
                                "X-Livewire": "",
                                "X-CSRF-TOKEN": csrf,
                                "Origin": BASE_URL,
                                "Referer": `${BASE_URL}${epPath}`,
                                "Cookie": page.cookies,
                                "User-Agent": HEADERS["User-Agent"],
                            },
                            body: JSON.stringify({
                                _token: csrf,
                                components: [{ snapshot, updates: {}, calls: [{ path: "", method: "setVideo", params: [videoId] }] }],
                            }),
                        });
                        if (res.ok) {
                            const json = await res.json();
                            const fragment = json?.components?.[0]?.effects?.html;
                            if (fragment) {
                                const $f = cheerio.load(fragment);
                                const alt = extractVidstack(fragment, $f);
                                if (alt.src && alt.src !== primary.src) {
                                    streams.push({
                                        name: "AniZone • Varyg",
                                        title: "AniZone • Varyg",
                                        url: alt.src,
                                        quality: "1080p",
                                        headers: HEADERS,
                                        subtitles: alt.tracks.length > 0 ? alt.tracks : primary.tracks,
                                    });
                                }
                            }
                        }
                    } catch { }
                }
            }
        }

        return streams;
    } catch {
        return [];
    }
}

module.exports = { getStreams };