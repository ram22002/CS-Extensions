package com.eclipsiaanime

import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.newMovieSearchResponse
import com.lagradost.cloudstream3.newTvSeriesSearchResponse
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.json.JSONArray
import org.json.JSONObject

internal object EclipsiaCatalog {
    private const val POSTER_BASE = "https://image.tmdb.org/t/p/w500"
    private const val HOME_URL = "https://www.themoviedb.org"

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
        val cover = EclipsiaPosters.resolve(kind, id, null, tmdbCover)
        val target = "$HOME_URL/$kind/$id"
        val label = EclipsiaPosters.cardLabel(title)

        return when (kind) {
            "movie" -> api.newMovieSearchResponse(label, target, TvType.Movie) { posterUrl = cover }
            else -> api.newTvSeriesSearchResponse(label, target, TvType.TvSeries) { posterUrl = cover }
        }
    }
}
