const BASE_URL = 'http://new.circleftp.net';
const BASE_URL_P = 'http://new.circleftp.net:5000';
const TMDB_API = 'https://api.themoviedb.org/3';
const FLBCK_URL = 'http://15.1.1.50:5000';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': BASE_URL + '/',
};
const QUALITY_RANK = { '2160p': 5, '1440p': 4, '1080p': 3, '720p': 2, '576p': 1, '480p': 0, 'Unknown': -1 };
const MAX_RANK = 5;

async function fetchText(url, headers) {
    try {
        const res = await fetch(url, { headers: headers || HEADERS });
        return res.ok ? await res.text() : null;
    } catch {
        return null;
    }
}

async function fetchJson(url, headers) {
    try {
        const res = await fetch(url, { headers: headers || HEADERS });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

async function circleGet(path) {
    const p = path.startsWith('/') ? path : '/' + path;
    return (await fetchText(BASE_URL_P + p)) ?? (await fetchText(FALLBACK_URL + p));
}

function normalize(title) {
    return String(title || '')
        .replace(/\b(1080p|720p|480p|2160p|4k|web[- ]?dl|webrip|bluray|hdrip|x264|x265|hevc|10bit|dual[- ]?audio|hindi[- ]?dubbed|dubbed|esub)\b/gi, ' ')
        .replace(/\[[^\]]*\]/g, ' ')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function parseYear(text) {
    for (const m of (String(text || '').match(/(?:19|20)\d{2}/g) || [])) {
        const n = parseInt(m, 10);
        if (n >= 1900 && n <= 2035) return n;
    }
    return null;
}

function resolveQuality(...parts) {
    const m = parts.filter(Boolean).join(' ').match(/(2160p|1440p|1080p|720p|576p|540p|480p|360p|4k|uhd)/i);
    if (!m) return 'Unknown';
    const v = m[1].toLowerCase();
    return (v === '4k' || v === 'uhd') ? '2160p' : v;
}

function extractMeta(name, title) {
    const audioMatches = String(title || '').match(/\b(dual[- ]?audio|multi[- ]?audio|dubbed|hindi[- ]?dubbed|eng[- ]?sub|bengali|hindi|dual|multi)\b/gi) || [];
    const audioTag = audioMatches.length ? audioMatches.join(' ').toUpperCase() : null;
    let cleaned = String(name || '').trim();
    if (!cleaned || cleaned.toLowerCase() === 'null') {
        cleaned = String(title || '')
            .replace(/\.[a-zA-Z0-9]{2,4}$/, '')
            .replace(/[._-]/g, ' ')
            .replace(/\b(19|20)\d{2}\b/g, '')
            .trim();
    }
    cleaned = cleaned.split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
    return { cleaned, audioTag };
}

function isAnime(categories, title) {
    if (/\banime\b|\bdubbed anime\b|\bova\b|\bona\b/i.test(title || '')) return true;
    return Array.isArray(categories) &&
        categories.some(c => String(c?.name || c?.title || c || '').toLowerCase().includes('anime'));
}

function getSortTag(rank) {
    const inv = Math.max(0, MAX_RANK - rank);
    let bin = inv.toString(2);
    while (bin.length < 20) bin = '0' + bin;
    return bin.split('').map(b => b === '1' ? '\uFEFF' : '\u200B').join('');
}

async function getTmdbInfo(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const data = await fetchJson(
        `${TMDB_API}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`,
        { 'Accept': 'application/json' }
    );
    if (!data) return null;
    const title = mediaType === 'tv' ? data.name : data.title;
    const date = mediaType === 'tv' ? data.first_air_date : data.release_date;
    return { title: title || null, year: date ? parseInt(date.slice(0, 4), 10) : null };
}

async function searchPosts(query) {
    const text = await circleGet(`/api/posts?searchTerm=${encodeURIComponent(query)}&order=desc`);
    if (!text) return [];
    try {
        const obj = JSON.parse(text);
        const raw = Array.isArray(obj) ? obj : (obj.posts || obj.data || []);
        return Array.isArray(raw)
            ? raw.filter(p => p?.type === 'singleVideo' || p?.type === 'series').map(p => ({
                id: p.id, type: p.type,
                title: p.title || '', name: p.name || '',
                categories: p.categories || [],
            }))
            : [];
    } catch {
        return [];
    }
}

async function fetchPostDetail(id) {
    const text = await circleGet(`/api/posts/${id}`);
    if (!text) return null;
    try {
        const obj = JSON.parse(text);
        return obj?.post || obj?.data || obj;
    } catch {
        return null;
    }
}

function matchGroup(mediaInfo, posts, mediaType) {
    if (!posts.length) return null;
    const targetNorm = normalize(mediaInfo.title);
    const targetYear = mediaInfo.year;
    const groups = {};

    for (const post of posts) {
        const { cleaned, audioTag } = extractMeta(post.name, post.title);
        const anime = isAnime(post.categories, post.title);
        const year = parseYear(post.title) || parseYear(post.name);
        const key = normalize(cleaned) + (!anime && year ? '|' + year : '');
        if (!groups[key]) groups[key] = { cleanedTitle: cleaned, year, posts: [] };
        groups[key].posts.push({ id: post.id, type: post.type, audioTag });
    }

    let best = null, bestScore = -1;
    for (const g of Object.values(groups)) {
        const itemNorm = normalize(g.cleanedTitle);
        let score = -1;

        if (itemNorm === targetNorm) {
            score = 100;
            if (targetYear && g.year === targetYear) score += 50;
        } else if (targetNorm.length >= 4 && itemNorm.includes(targetNorm)) {
            score = 60;
            if (targetYear && g.year === targetYear) score += 30;
        } else if (itemNorm.length >= 4 && targetNorm.includes(itemNorm)) {
            score = 40;
        }

        const mainType = g.posts[0]?.type;
        if (mediaType === 'movie' && mainType === 'singleVideo') score += 10;
        if (mediaType === 'tv' && mainType === 'series') score += 10;

        if (score > bestScore) { bestScore = score; best = g; }
    }

    return bestScore >= 30 ? best : null;
}

function extractMovieLinks(details) {
    return details.flatMap(({ obj }) => {
        const content = obj?.content;
        return typeof content === 'string' && content.trim()
            ? [{ url: content.trim(), title: obj.title || '' }]
            : [];
    });
}

function extractEpisodeLinks(details, season, episode) {
    const links = [];
    for (const { obj } of details) {
        if (!Array.isArray(obj?.content)) continue;

        const byIndex = obj.content[season - 1];
        if (Array.isArray(byIndex?.episodes)) {
            const ep = byIndex.episodes[episode - 1];
            const url = String(ep?.link || ep?.url || '');
            if (url) { links.push({ url, title: ep?.title || obj.title || '' }); continue; }
        }

        for (let si = 0; si < obj.content.length; si++) {
            const s = obj.content[si];
            if (!s) continue;
            const sNum = parseInt((String(s.seasonName || s.name || '').match(/\d+/) || [])[0], 10) || si + 1;
            if (sNum !== season) continue;
            const eps = s.episodes || [];
            for (let ei = 0; ei < eps.length; ei++) {
                const ep = eps[ei];
                if (!ep) continue;
                const eNum = parseInt(String(ep.episode || ep.number || ep.ep || ''), 10) || ei + 1;
                if (eNum !== episode) continue;
                const url = String(ep.link || ep.url || '');
                if (url) links.push({ url, title: ep.title || obj.title || '' });
            }
        }
    }
    return links;
}

function buildStreams(links) {
    const seen = new Set();
    return links
        .filter(l => l.url && !seen.has(l.url) && seen.add(l.url))
        .map(l => {
            const quality = resolveQuality(l.url, l.title);
            const rank = QUALITY_RANK[quality] ?? -1;
            const tag = getSortTag(rank);
            return {
                name: tag + 'Circle FTP',
                title: tag + 'Circle FTP \u2022 ' + quality,
                url: l.url,
                quality,
                headers: { 'User-Agent': USER_AGENT, 'Referer': BASE_URL + '/' },
            };
        })
        .sort((a, b) => (QUALITY_RANK[b.quality] ?? -1) - (QUALITY_RANK[a.quality] ?? -1));
}

async function hydrateGroup(group) {
    const results = await Promise.all(
        group.posts.map(async p => {
            try {
                const obj = await fetchPostDetail(p.id);
                return obj ? { obj, type: p.type || obj.type } : null;
            } catch {
                return null;
            }
        })
    );
    return results.filter(Boolean);
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === 'tv' && (season == null || episode == null)) return [];
        if (!TMDB_API_KEY) return [];

        const info = await getTmdbInfo(tmdbId, mediaType);
        if (!info?.title) return [];

        const posts = await searchPosts(info.title);
        if (!posts.length) return [];

        const group = matchGroup(info, posts, mediaType);
        if (!group) return [];

        const details = await hydrateGroup(group);
        if (!details.length) return [];

        const links = mediaType === 'tv'
            ? extractEpisodeLinks(details, Number(season), Number(episode))
            : extractMovieLinks(details);

        return buildStreams(links);
    } catch {
        return [];
    }
}

module.exports = { getStreams };