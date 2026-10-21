package com.nextgenbdix

import com.lagradost.cloudstream3.ErrorLoadingException
import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageData
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.mainPageOf
import com.lagradost.cloudstream3.newHomePageResponse
import com.lagradost.cloudstream3.newMovieSearchResponse
import com.lagradost.cloudstream3.newTvSeriesSearchResponse
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.json.JSONArray
import org.json.JSONObject

internal object NextGenCatalog {
    private const val POSTER_BASE = "https://image.tmdb.org/t/p/w500"
    private const val HOME_URL = "https://www.themoviedb.org"

    private class Shelf(val title: String, val query: String)

    private fun discoverTv(filter: String) = "discover/tv?$filter"
    private fun network(id: Int) = discoverTv("with_networks=$id")

    private val shelves = listOf(
        Shelf("Trending", "trending/all/day"),
        Shelf("Popular Movies", "trending/movie/week"),
        Shelf("Popular TV Shows", "trending/tv/week"),
        Shelf("Netflix", network(213)),
        Shelf("Disney+", network(2739)),
        Shelf("Apple TV+", network(2552)),
        Shelf("HBO", network(49)),
        Shelf("Paramount+", network(4330)),
    )

    val titles: List<String> = shelves.map { it.title }

    fun activeRows(): List<MainPageData> {
        val order = runCatching { NextGenStore.rowOrder("tmdb", titles) }.getOrDefault(titles)
        val on = shelves.sortedBy { order.indexOf(it.title) }
            .filter { runCatching { NextGenStore.catalogRowEnabled(it.title) }.getOrDefault(true) }
        return mainPageOf(*on.map { it.query to it.title }.toTypedArray())
    }

    private fun requestPath(query: String, page: Int): String {
        val sep = if ('?' in query) '&' else '?'
        val excluded = NextGenStore.excludedKeywords
        return "$query${sep}region=${NextGenStore.region}&language=${NextGenStore.language}" +
            (if (excluded.isNotEmpty()) "&without_keywords=$excluded" else "") + "&page=$page"
    }

    suspend fun page(api: MainAPI, page: Int, request: MainPageRequest): HomePageResponse =
        NextGenParallel.page(api, page, request.name, request.data, activeRows()) { p, name, data ->
            load(api, p, name, data)
        }

    private suspend fun load(api: MainAPI, page: Int, name: String, query: String): HomePageResponse {
        val fallback = if ("/movie" in query) "movie" else "tv"

        val body = NextGenTmdb.get(requestPath(query, page)) ?: throw ErrorLoadingException("TMDB request failed")
        val array = runCatching { JSONObject(body).getJSONArray("results") }.getOrNull()
            ?: throw ErrorLoadingException("Invalid Json response")

        return newHomePageResponse(name, entries(api, array, fallback))
    }

    suspend fun search(api: MainAPI, query: String, page: Int): List<SearchResponse> {
        val q = query.trim()
        if (q.isEmpty()) return emptyList()
        val enc = java.net.URLEncoder.encode(q, "UTF-8").replace("+", "%20")
        val path = "search/multi?query=$enc&include_adult=false&language=${NextGenStore.language}&page=${page.coerceAtLeast(1)}"
        val body = NextGenTmdb.get(path) ?: return emptyList()
        val all = runCatching { JSONObject(body).getJSONArray("results") }.getOrNull() ?: return emptyList()
        val array = JSONArray()
        for (i in 0 until all.length()) {
            val o = all.optJSONObject(i) ?: continue
            if (o.optString("media_type") == "movie" || o.optString("media_type") == "tv") array.put(o)
        }
        return entries(api, array, "movie")
    }

    suspend fun entries(api: MainAPI, array: JSONArray?, fallback: String): List<SearchResponse> {
        if (array == null) return emptyList()
        return coroutineScope {
            (0 until array.length())
                .mapNotNull { array.optJSONObject(it) }
                .map { async { entry(api, it, fallback) } }
                .awaitAll()
                .filterNotNull()
        }
    }

    suspend fun entry(api: MainAPI, json: JSONObject, fallback: String): SearchResponse? {
        val id = json.optInt("id").takeIf { it > 0 } ?: return null
        val kind = json.optString("media_type").takeIf { it == "movie" || it == "tv" } ?: fallback
        val title = sequenceOf("title", "name", "original_title", "original_name")
            .map { json.optString(it) }
            .firstOrNull { it.isNotBlank() } ?: return null
        val tmdbCover = json.optString("poster_path").takeIf { it.startsWith("/") }?.let { POSTER_BASE + it }
        val cover = NextGenPosters.resolve(kind, id, null, tmdbCover)
        val target = "$HOME_URL/$kind/$id"
        val label = NextGenPosters.cardLabel(title)

        return when (kind) {
            "movie" -> api.newMovieSearchResponse(label, target, TvType.Movie) { posterUrl = cover }
            else -> api.newTvSeriesSearchResponse(label, target, TvType.TvSeries) { posterUrl = cover }
        }
    }
}
