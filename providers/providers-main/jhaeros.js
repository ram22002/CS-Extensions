const BASE_URL = "https://ydfvfdizipanel.ru";
const API_BASE = "https://ydfvfdizipanel.ru/public/api";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
    "Referer": BASE_URL + "/",
    "Origin": BASE_URL,
};

async function httpGetJson(url, requestHeaders) {
    try {
        const response = await fetch(url, { headers: requestHeaders || sinewixRequestHeaders });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

function deduplicateByUrl(streamList) {
    const visitedUrls = new Set();
    return streamList.filter(stream => stream.url && !visitedUrls.has(stream.url) && visitedUrls.add(stream.url));
}

async function fetchTmdbMetadata(tmdbId, mediaType) {
    const tmdbEndpoint = mediaType === "tv" ? "tv" : "movie";
    const tmdbData = await httpGetJson(
        `https://api.themoviedb.org/3/${tmdbEndpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`,
        { "Accept": "application/json" }
    );
    if (!tmdbData) return null;
    return {
        title: mediaType === "tv" ? tmdbData.name : tmdbData.title,
        originalTitle: mediaType === "tv" ? tmdbData.original_name : tmdbData.original_title,
        year: (tmdbData.release_date || tmdbData.first_air_date || "").slice(0, 4),
        imdbId: tmdbData.external_ids && tmdbData.external_ids.imdb_id || null,
        tmdbId: String(tmdbData.id),
    };
}

const _xk = "sinewix";
const _dec = a => a.map((c, i) => String.fromCharCode(c ^ _xk.charCodeAt(i % _xk.length))).join("");

const _ek = [74, 0, 63, 43, 52, 92, 48, 34, 30, 62, 9, 22, 47, 13, 57, 45, 5, 13, 25, 10, 50, 70, 49, 58, 47, 79, 15, 29, 52, 49, 33, 47, 22, 29, 57, 50];
const _eh = [68, 88, 95, 7, 17, 15, 76, 18, 15, 11, 7, 67, 94, 30, 67, 94, 15, 7, 71, 81, 25, 67, 11, 94, 82, 18, 81, 77, 23, 90, 86, 86, 66, 12, 79, 64, 80, 92, 92, 66, 12, 64, 18, 95, 93, 83, 70, 13, 26, 68, 94, 11, 0, 21, 13, 65, 64, 13, 87, 83, 68, 89, 78, 17];
const _es = [64, 89, 86, 87, 71, 92, 64, 75, 90, 94, 93, 69, 89, 75, 68, 89, 15, 85, 71, 90, 72, 65, 89, 95, 85, 69, 89, 74, 66, 93, 91, 7, 21, 15, 26, 17, 8, 87, 82, 78, 88, 28, 17, 94, 91, 93, 22, 13, 73, 65, 91, 87, 80, 65, 90, 78, 22, 89, 87, 81, 22, 11, 76, 17, 89, 89, 1, 20, 91, 76, 64, 89, 94, 1, 71, 95, 72, 74, 91, 15, 93, 65, 93, 64, 75, 95, 8, 82, 71, 13, 72, 66, 89, 95, 85, 21, 89, 77, 67, 89, 93, 85, 64, 93, 75, 66, 89, 12, 86, 71, 89, 65, 67, 95, 94, 86, 66, 92, 72, 71, 89, 88, 84, 68, 89, 74, 70, 92, 91, 86, 68, 88, 73, 64, 90, 94, 84, 70, 89, 78, 67, 90, 91, 80, 71, 93, 72, 75, 88, 93, 85, 22, 93, 75, 69, 88, 88, 6, 65, 80, 78, 69, 95, 8, 82, 69, 95, 29, 69, 80, 88, 84, 68, 88, 73, 69, 90, 94, 84, 67, 89, 78, 67, 90, 91, 80, 71, 93, 72, 68, 88, 93, 85, 19, 93, 28, 69, 15, 89, 80, 65, 12, 79, 71, 95, 95, 83, 78, 95, 29, 65, 89, 91, 83, 65, 80, 78, 70, 94, 89, 86, 70, 88, 76, 64, 89, 95, 87, 71, 95, 72, 64, 92, 91, 85, 67, 89, 25, 66, 90, 94, 7, 67, 94, 78, 21, 95, 8, 83, 64, 95, 27, 69, 92, 92, 85, 67, 80, 78, 22, 95, 93, 87, 18, 90, 73, 66, 89, 93, 85, 71, 12, 72, 69, 89, 93, 80, 66, 89, 76, 67, 11, 95, 86, 71, 94, 76, 66, 95, 11, 83, 67, 94, 74, 69, 15, 88, 92, 65, 93, 75, 66, 88, 94, 86, 71, 89, 29, 67, 95, 94, 86, 66, 92, 72, 71, 89, 93, 84, 68, 89, 79, 71, 88, 88, 0, 65, 93, 79, 65, 95, 8, 83, 78, 95, 76, 64, 89, 92, 85, 70, 94, 72, 23, 90, 92, 86, 70, 90, 73, 64, 91, 93, 84, 68, 92, 75, 65, 90, 92, 86, 71, 90, 76, 64, 90, 93, 86, 66, 8, 73, 75, 89, 8, 86, 69, 90, 72, 64, 92, 93, 84, 68, 88, 75, 65, 90, 95, 86, 66, 90, 74, 64, 91, 93, 85, 68, 93, 75, 64, 90, 93, 80, 22, 90, 72, 68, 93, 93, 84, 71, 11, 75, 67, 89, 87, 85, 65, 89, 75, 70, 92, 94, 81, 71, 95, 73, 64, 89, 92, 80, 66, 92, 75, 64, 88, 95, 86, 68, 89, 73, 66, 89, 88, 85, 68, 92, 77, 67, 93, 94, 93, 70, 90, 72, 18, 93, 93, 83, 70, 95, 27, 69, 80, 88, 83, 65, 15, 79, 65, 95, 11, 83, 78, 95, 73, 64, 88, 95, 83, 68, 89, 73, 71, 89, 88, 85, 68, 92, 77, 67, 93, 94, 82, 70, 90, 72, 23, 93, 10, 83, 17, 94, 77, 69, 12, 89, 81, 65, 88, 78, 74, 95, 11, 87, 71, 92, 78, 69, 80, 88, 80, 64, 94, 75, 66, 88, 90, 86, 71, 88, 74, 67, 95, 94, 86, 66, 92, 72, 71, 89, 15, 84, 68, 89, 26, 71, 94, 88, 3, 65, 15, 78, 68, 95, 13, 83, 66, 91, 72, 71, 80, 88, 0, 65, 90, 74, 22, 90, 95, 84, 71, 90, 72, 67, 12, 94, 83, 71, 90, 77, 70, 89, 90, 85, 21, 88, 75, 67, 94, 90, 84, 65, 12, 78, 71, 94, 92, 83, 17, 95, 65, 69, 93, 93, 84, 70, 89, 75, 67, 89, 11, 85, 65, 89, 75, 70, 92, 94, 81, 71, 90, 73, 64, 89, 89, 81, 70, 95, 29, 69, 93, 89, 87, 65, 15, 78, 74, 95, 90, 86, 71, 81, 74, 67, 91, 92, 87, 68, 89, 72, 23, 89, 88, 85, 78, 91, 25, 75, 95, 90, 93, 79, 95, 30, 68, 89, 10, 85, 70, 89, 73, 67, 88, 94, 80, 71, 89, 72, 64, 81, 92, 85, 69, 89, 30, 67, 89, 93, 85, 79, 91, 72, 65, 89, 15, 85, 69, 81, 74, 67, 91, 94, 84, 71, 89, 25, 70, 88, 94, 83, 22, 91, 76, 17, 11, 93, 3, 78, 10, 72, 18, 8, 8, 86, 22, 91, 26, 65, 91, 86, 3, 64, 80, 76, 17, 92, 11, 4, 17, 88, 79, 70, 94, 12, 4, 64, 92, 64, 17, 88, 87, 82, 68, 95, 25, 64, 80, 10, 84, 21, 13, 27, 68, 90, 8, 6, 78, 81, 75, 18, 94, 92, 86, 64, 11, 64, 23, 92, 13, 4, 66, 88, 77, 69, 10, 8, 4, 78, 80, 65, 16, 88, 10, 4, 21, 90, 76, 66, 81, 12, 7, 20, 91, 26, 22, 89, 87, 87, 71, 12, 72, 22, 12, 94, 85, 70, 10, 64, 18, 8, 90, 93, 70, 91, 28, 66, 13, 15, 0, 64, 92, 28, 67, 81, 94, 3, 71, 80, 29, 74, 88, 11, 85, 22, 11, 28, 18, 81, 93, 3, 17, 80, 25, 68, 95, 11, 93, 68, 81, 76, 18, 93, 90, 87, 78, 15, 76, 75, 93, 87, 87, 67, 81, 72, 69, 80, 15, 80, 78, 92, 72, 70, 11, 95, 87, 22, 10, 74, 16, 88, 90, 7, 22, 91, 29, 71, 13, 95, 4, 70, 90, 25, 21, 10, 10, 4, 17, 92, 76, 22, 92, 94, 93, 65, 80, 79, 21, 15, 87, 87, 79, 8, 65, 21, 94, 93, 93, 18, 95, 30, 71, 8, 88, 3, 20, 91, 79, 71, 89, 87, 6, 66, 92, 75, 65, 80, 11, 7, 70, 93, 65, 17, 92, 8, 3, 79, 80, 27, 70, 8, 92, 1, 64, 10, 72, 69, 11, 8, 92, 18, 95, 74, 67, 81, 88, 3, 78, 92, 77, 16, 8, 10, 84, 64, 13, 79, 17, 12, 92, 83, 69, 90, 29, 22, 80, 10, 80, 18, 10, 77, 69, 89, 88, 93, 18, 8, 28, 16, 91, 93, 6, 21, 89, 65, 69, 92, 15, 84, 68, 15, 30, 74, 94, 10, 81, 78, 15, 29, 66, 89, 11, 3, 67, 88, 25, 21, 10, 88, 0, 18, 10, 25, 64, 95, 12, 81, 22, 10, 29, 74, 92, 86, 87, 71, 80, 79, 21, 8, 8, 3, 79, 80, 30, 70, 80, 94, 7, 20, 81, 75, 66, 10, 10, 7, 68, 8, 78, 74, 12, 11, 6, 66, 13, 73, 70, 11, 88, 82, 20, 90, 30, 65, 10, 15, 1, 67, 80, 29, 64, 94, 11, 1, 71, 92, 75, 68, 90, 93, 0, 68, 13, 74, 23, 93, 94, 85, 20, 93, 79, 68, 92, 91, 7, 78, 90, 74, 17, 13, 12, 0, 70, 92, 28, 68, 93, 87, 3, 19, 95, 25, 23, 88, 10, 6, 18, 90, 72, 17, 8, 91, 0, 65, 95, 72, 74, 93, 10, 3, 21, 95, 29, 22, 95, 8, 83, 67, 10, 25, 21, 11, 86, 85, 64, 12, 73, 66, 11, 95, 92, 22, 80, 65, 67, 10, 91, 1, 71, 94, 64, 16, 95, 10, 83, 64, 89, 73, 16, 13, 15, 85, 21, 13, 29, 17, 91, 95, 0, 78, 80, 76, 67, 93, 8, 3, 70, 95, 78, 67, 94, 90, 3, 67, 10, 64, 74, 11, 94, 81, 20, 93, 73, 75, 15, 90, 0, 64, 80, 76, 67, 13, 12, 80, 20, 94, 64, 69, 93, 89, 6, 67, 94, 77, 17, 10, 8, 7, 79, 92, 28, 71, 10, 90, 0, 79, 90, 78, 22, 12, 89, 1, 64, 10, 73, 23, 92, 93, 0, 78, 12, 79, 64, 95, 12, 80, 19, 80, 78, 23, 93, 12, 81, 19, 81, 26, 74, 81, 92, 85, 78, 89, 78, 71, 11, 89, 87, 78, 8, 27, 69, 8, 88, 93, 69, 13, 77, 70, 8, 88, 4, 78, 90, 72, 22, 92, 95, 93, 19, 81, 76, 74, 81, 87, 93, 21, 11, 74, 75, 90, 92, 92, 20, 8, 72, 18, 8, 15, 84, 68, 90, 26, 70, 12, 91, 87, 64, 89, 25, 74, 13, 91, 92, 67, 89, 27, 18, 10, 88, 4, 17, 93, 64, 67, 91, 15, 80, 64, 15, 28, 74, 94, 95, 0, 17, 13, 25, 74, 88, 15, 7, 21, 95, 72, 65, 81, 86, 87, 19, 13, 78, 18, 8, 88, 6, 18, 91, 26, 65, 90, 88, 7, 66, 94, 26, 70, 91, 11, 0, 69, 93, 64, 66, 93, 87, 93, 17, 89, 27, 18, 10, 12, 6, 20, 91, 27, 64, 95, 13, 87, 68, 81, 26, 16, 81, 90, 7, 18, 10, 25, 23, 94, 11, 4, 22, 15, 73, 66, 91, 91, 7, 78, 8, 73, 16, 8, 87, 1, 18, 13, 78, 16, 94, 87, 3, 68, 15, 74, 75, 90, 15, 80, 69, 89, 77, 67, 90, 89, 82, 79, 89, 65, 17, 91, 15, 92, 78, 80, 77, 23, 95, 88, 0, 70, 95, 75, 69, 11, 94, 0, 19, 93, 74, 69, 15, 10, 1, 79, 95, 64, 70, 10, 90, 82, 20, 11, 73, 75, 12, 86, 87, 71, 94, 79, 21, 93, 15, 0, 17, 10, 27, 67, 94, 86, 93, 64, 12, 73, 23, 10, 91, 93, 21, 93, 28, 69, 93, 12, 0, 70, 95, 75, 65, 15, 94, 0, 64, 11, 76, 69, 91, 91, 1, 22, 95, 30, 71, 89, 13, 83, 66, 8, 64, 70, 88, 92, 4, 65, 93, 77, 71, 8, 90, 7, 78, 95, 65, 69, 90, 11, 82, 17, 81, 79, 69, 88, 93, 83, 18, 95, 27, 67, 89, 88, 92, 22, 92, 73, 74, 8, 89, 92, 22, 13, 78, 64, 91, 94, 82, 79, 12, 28, 74, 95, 91, 4, 22, 88, 74, 71, 81, 92, 81, 66, 81, 72, 69, 89, 13, 85, 68, 89, 29, 23, 92, 94, 1, 21, 94, 72, 69, 13, 86, 80, 67, 15, 64, 75, 10, 12, 85, 71, 93, 78, 64, 89, 12, 81, 78, 91, 64, 70, 13, 86, 4, 17, 81, 26, 71, 94, 95, 3, 17, 81, 30, 69, 89, 89, 85, 65, 81, 79, 75, 91, 88, 81, 70, 91, 74, 75, 94, 12, 80, 71, 89, 76, 74, 11, 13, 7, 64, 13, 73, 17, 95, 12, 83, 69, 12, 30, 74, 89, 92, 85, 68, 89, 73, 67, 89, 94, 84, 22, 90, 73, 67, 90, 94, 85, 18, 90, 72, 67, 10, 94, 83, 71, 90, 77, 70, 88, 10, 84, 68, 89, 76, 67, 92, 93, 85, 71, 90, 72, 66, 89, 95, 3, 17, 90, 72, 67, 13, 94, 83, 71, 80, 74, 18, 81, 88, 81, 79, 81, 78, 21, 94, 94, 1, 71, 88, 72, 66, 89, 12, 85, 66, 89, 72, 67, 90, 86, 87, 71, 91, 72, 66, 89, 94, 80, 70, 10, 72, 17, 94, 12, 1, 64, 80, 75, 66, 81, 95, 1, 20, 91, 65, 16, 8, 89, 82, 64, 13, 75, 68, 94, 93, 3, 78, 91, 64, 18, 90, 88, 83, 20, 81, 76, 69, 80, 11, 6, 17, 91, 30, 18, 90, 13, 3, 21, 89, 79, 69, 12, 86, 93, 68, 88, 65, 68, 89, 10, 84, 78, 11, 26, 65, 11, 87, 83, 18, 93, 76, 22, 81, 13, 6, 20, 95, 76, 68, 10, 8, 85, 65, 80, 78, 17, 11, 86, 87, 67, 8, 27, 69, 88, 13, 87, 68, 13, 65, 70, 81, 91, 87, 66, 13, 74, 75, 90, 13, 4, 21, 91, 78, 67, 90, 89, 7, 71, 93, 28, 70, 81, 15, 4, 64, 80, 26, 21, 80, 92, 84, 78, 91, 28, 17, 81, 90, 86, 22, 13, 30, 70, 10, 92, 83, 22, 80, 64, 67, 15, 94, 93, 70, 13, 74, 21, 89, 11, 84, 67, 15, 79, 70, 80, 8, 6, 66, 15, 30, 71, 10, 91, 7, 21, 90, 28, 16, 12, 94, 93, 65, 89, 74, 74, 80, 12, 3, 18, 94, 26, 64, 93, 87, 4, 79, 88, 77, 70, 8, 92, 0, 17, 8, 30, 68, 90, 95, 7, 22, 91, 77, 16, 12, 89, 92, 65, 8, 64, 67, 10, 95, 81, 67, 91, 27, 68, 11, 8, 93, 71, 15, 64, 16, 88, 15, 82, 78, 88, 74, 21, 15, 94, 7, 65, 15, 78, 70, 80, 92, 87, 65, 93, 75, 66, 92, 93, 86, 64, 91, 77, 66, 8, 86, 81, 65, 93, 78, 67, 88, 87, 81, 17, 8, 77, 74, 93, 8, 93, 70, 15, 75, 75, 15, 87, 0, 66, 91, 75, 64, 8, 88, 86, 69, 89, 73, 22, 80, 93, 84, 22, 13, 65, 16, 8, 12, 80, 21, 15, 73, 66, 80, 8, 87, 67, 89, 74, 70, 95, 95, 86, 17, 90, 72, 68, 88, 87, 81, 18, 8, 25, 69, 12, 12, 86, 78, 8, 64, 64, 15, 93, 6, 71, 92, 25, 71, 80, 12, 4, 68, 93, 76, 70, 92, 12, 84, 22, 15, 30, 68, 10, 88, 93, 68, 80, 26, 17, 11, 88, 80, 64, 13, 65, 64, 80, 92, 3, 17, 13, 30, 64, 80, 89, 81, 68, 91, 25, 21, 95, 11, 80, 65, 11, 25, 74, 92, 93, 81, 22, 81, 26, 67, 94, 10, 82, 71, 95, 72, 21, 12, 94, 92, 65, 80, 73, 16, 95, 13, 3, 71, 94, 27, 17, 92, 93, 87, 67, 15, 78, 68, 11, 93, 6, 20, 89, 64, 68, 88, 15, 93, 20, 95, 74, 66, 13, 86, 84, 17, 12, 79, 66, 13, 89, 84, 71, 81, 77, 16, 92, 91, 87, 71, 95, 25, 71, 15, 91, 82, 18, 91, 77, 21, 94, 89, 81, 17, 13, 76, 17, 80, 89, 92, 21, 91, 65, 74, 12, 86, 7, 21, 89, 79, 69, 11, 91, 85, 17, 10, 25, 71, 91, 8, 4, 66, 94, 28, 18, 91, 10, 80, 70, 80, 30, 23, 90, 91, 4, 67, 8, 79, 16, 89, 95, 86, 64, 11, 25, 17, 8, 11, 1, 67, 90, 76, 70, 15, 86, 85, 68, 88, 26, 69, 90, 12, 83, 22, 94, 73, 21, 92, 11, 93, 69, 95, 64, 21, 94, 94, 92, 19, 95, 77, 75, 10, 13, 1, 64, 10, 74, 18, 92, 86, 93, 67, 80, 75, 68, 80, 10, 87, 66, 11, 30, 18, 92, 87, 93, 20, 90, 30, 71, 8, 92, 6, 68, 13, 65, 17, 94, 10, 93, 78, 91, 64, 70, 15, 11, 3, 18, 11, 79, 21, 89, 11, 6, 65, 92, 73, 64, 94, 10, 86, 79, 11, 72, 75, 10, 11, 81, 68, 91, 25, 66, 92, 88, 93, 79, 11, 78, 65, 93, 15, 84, 64, 80, 29, 69, 8, 90, 4, 66, 89, 77, 22, 11, 13, 86, 21, 10, 28, 21, 11, 13, 81, 19, 93, 75, 64, 89, 91, 85, 79, 12, 29, 65, 13, 86, 1, 71, 15, 72, 66, 95, 87, 87, 67, 13, 27, 22, 10, 92, 84, 22, 95, 64, 64, 81, 11, 3, 64, 13, 64, 64, 93, 13, 83, 17, 93, 75, 17, 13, 11, 81, 22, 92, 74, 67, 88, 11, 1, 71, 11, 75, 17, 11, 90, 0, 78, 11, 28, 64, 94, 89, 7, 67, 94, 72, 22, 90, 88, 7, 20, 15, 77, 17, 10, 93, 1, 66, 95, 73, 69, 80, 10, 7, 19, 81, 29, 64, 80, 91, 83, 64, 8, 25, 68, 13, 13, 0, 67, 13, 73, 18, 81, 15, 93, 22, 92, 76, 18, 92, 11, 84, 22, 8, 78, 21, 11, 95, 4, 79, 8, 25, 17, 89, 94, 83, 69, 95, 78, 74, 8, 87, 83, 65, 15, 65, 69, 12, 95, 80, 20, 10, 27, 22, 95, 8, 0, 70, 91, 29, 18, 92, 11, 83, 22, 81, 26, 75, 10, 86, 93, 69, 90, 26, 23, 10, 87, 81, 78, 81, 64, 16, 8, 93, 92, 64, 92, 65, 21, 13, 95, 6, 20, 81, 30, 23, 81, 15, 0, 66, 10, 75, 23, 94, 90, 1, 21, 92, 72, 17, 88, 89, 81, 20, 15, 79, 23, 94, 89, 83, 66, 92, 72, 66, 95, 13, 85, 64, 92, 27, 74, 88, 10, 81, 68, 80, 29, 23, 89, 95, 6, 20, 89, 25, 74, 15, 88, 92, 66, 10, 65, 74, 15, 15, 1, 68, 11, 77, 71, 80, 91, 3, 21, 95, 27, 17, 88, 11, 85, 70, 8, 77, 21, 8, 94, 87, 71, 10, 27, 69, 89, 92, 87, 22, 81, 77, 16, 89, 89, 0, 20, 92, 77, 21, 80, 11, 7, 22, 81, 65, 68, 88, 87, 3, 79, 95, 29, 71, 80, 10, 86, 67, 8, 26, 70, 11, 10, 87, 71, 81, 27, 70, 15, 89, 85, 20, 10, 29, 23, 91, 12, 82, 21, 94, 65, 69, 90, 13, 85, 70, 93, 30, 75, 93, 94, 81, 67, 90, 74, 74, 94, 87, 7, 66, 89, 78, 23, 12, 92, 92, 18];

const sinewixApiKey = _dec(_ek);
const sinewixRequestHeaders = { "hash256": _dec(_eh), "signature": _dec(_es), "User-Agent": "EasyPlex (Android 14; SM-A546B; Samsung Galaxy A54 5G; tr)", "Accept": "application/json" };

async function resolveMediaFireUrl(mediaFirePageUrl) {
    try {
        const response = await fetch(mediaFirePageUrl);
        const pageHtml = await response.text();
        const directLinkMatch = pageHtml.match(/href="(https:\/\/download\d+\.mediafire\.com[^"]+)"/);
        return directLinkMatch ? directLinkMatch[1] : mediaFirePageUrl;
    } catch {
        return mediaFirePageUrl;
    }
}

async function buildStreamEntries(videoList) {
    if (!Array.isArray(videoList) || videoList.length === 0) return [];
    const streamEntries = await Promise.all(videoList.map(async video => {
        const videoUrl = video.link;
        if (!videoUrl) return null;
        const isMediaFire = videoUrl.includes("mediafire.com");
        const resolvedUrl = isMediaFire ? await resolveMediaFireUrl(videoUrl) : videoUrl;
        return {
            name: "SineWix",
            title: "SineWix",
            url: resolvedUrl,
            quality: "1080p",
            headers: HEADERS
        };
    }));
    return streamEntries.filter(Boolean);
}

async function searchSinewixCatalog(searchQuery) {
    const searchResponse = await httpGetJson(`${API_BASE}/search/${encodeURIComponent(searchQuery)}/${sinewixApiKey}`);
    return searchResponse && Array.isArray(searchResponse.search) ? searchResponse.search : [];
}

async function fetchSinewixItemDetail(itemId, mediaType) {
    const apiPath = mediaType === "movie" ? "media/detail" : "series/show";
    return httpGetJson(`${API_BASE}/${apiPath}/${itemId}/${sinewixApiKey}`);
}

function findBestMatchingItem(candidates, targetInfo) {
    const { title, originalTitle, year, imdbId, tmdbId } = targetInfo;

    const idMatch = candidates.find(candidate =>
        (tmdbId && candidate.tmdb_id && String(candidate.tmdb_id) === tmdbId) ||
        (imdbId && candidate.imdb_external_id === imdbId)
    );
    if (idMatch) return idMatch;

    const normalizeTitle = s => (s || "").toLowerCase().trim();
    const normalizedTitles = [normalizeTitle(title), normalizeTitle(originalTitle)].filter(Boolean);

    const exactMatch = candidates.find(candidate => {
        const candidateTitle = normalizeTitle(candidate.title || candidate.name);
        const candidateYear = (candidate.release_date || candidate.first_air_date || "").slice(0, 4);
        return normalizedTitles.includes(candidateTitle) && (!year || !candidateYear || candidateYear === year);
    });
    if (exactMatch) return exactMatch;

    return candidates.find(candidate => {
        const candidateTitle = normalizeTitle(candidate.title || candidate.name);
        return normalizedTitles.some(t => candidateTitle.includes(t));
    }) || null;
}

async function extractVideoList(contentItem, mediaType, season, episode) {
    if (mediaType === "movie") return contentItem.videos || [];
    const seasonEntry = (contentItem.seasons || []).find(
        s => parseInt(s.season_number) === parseInt(season)
    );
    if (!seasonEntry) return [];
    const episodeEntry = (seasonEntry.episodes || []).find(
        e => parseInt(e.episode_number) === parseInt(episode)
    );
    return episodeEntry ? episodeEntry.videos || [] : [];
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const tmdbMetadata = await fetchTmdbMetadata(tmdbId, mediaType);
        if (!tmdbMetadata || (!tmdbMetadata.title && !tmdbMetadata.originalTitle)) return [];

        const searchQueries = [tmdbMetadata.originalTitle, tmdbMetadata.title]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i);

        let catalogResults = await searchSinewixCatalog(searchQueries[0]);
        if (catalogResults.length === 0 && searchQueries[1]) {
            catalogResults = await searchSinewixCatalog(searchQueries[1]);
        }
        if (catalogResults.length === 0) return [];

        const contentType = mediaType === "movie" ? "movie" : "series";
        const detailedCatalog = (await Promise.all(
            catalogResults.map(item => fetchSinewixItemDetail(item.id, contentType))
        )).filter(Boolean);

        const matchedContent = findBestMatchingItem(detailedCatalog, tmdbMetadata);
        if (!matchedContent) return [];

        const videoEntries = await extractVideoList(matchedContent, mediaType, season, episode);
        const streamResults = await buildStreamEntries(videoEntries);

        return deduplicateByUrl(streamResults);
    } catch {
        return [];
    }
}

module.exports = { getStreams };