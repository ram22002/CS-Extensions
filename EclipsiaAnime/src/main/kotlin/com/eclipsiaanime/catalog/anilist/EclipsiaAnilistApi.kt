package com.eclipsiaanime

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
import java.util.concurrent.ConcurrentHashMap

internal object EclipsiaAnilistApi {
    const val PREFIX = "anilist:"
    private const val HOME_URL = "https://www.themoviedb.org"
    private const val PER_PAGE = 20

    private val matches = ConcurrentHashMap<String, EclipsiaKitsuApi.Match>()

    private class Shelf(val key: String, val query: String) {
        val label = key.removePrefix("AniList ")
    }

    private val shelves = listOf(
        Shelf("AniList Top Anime", "${PREFIX}top"),
        Shelf("AniList Airing Now", "${PREFIX}airing"),
        Shelf("AniList Most Popular", "${PREFIX}popular"),
        Shelf("AniList Upcoming", "${PREFIX}upcoming"),
        Shelf("AniList Top Anime Movies", "${PREFIX}movies"),
        Shelf("AniList This Season", "${PREFIX}season"),
    )

    val titles: List<String> = shelves.map { it.key }
    val labels: List<String> = shelves.map { it.label }

    fun activeRows(): List<MainPageData> {
        val order = runCatching { EclipsiaStore.rowOrder("anilist", titles) }.getOrDefault(titles)
        val on = shelves.sortedBy { order.indexOf(it.key) }
            .filter { runCatching { EclipsiaStore.catalogRowEnabled(it.key) }.getOrDefault(true) }
        return mainPageOf(*on.map { it.query to it.label }.toTypedArray())
    }

    private fun currentSeason(): Pair<String, Int> {
        val c = java.util.Calendar.getInstance()
        val name = when (c.get(java.util.Calendar.MONTH)) {
            in 0..2 -> "WINTER"; in 3..5 -> "SPRING"; in 6..8 -> "SUMMER"; else -> "FALL"
        }
        return name to c.get(java.util.Calendar.YEAR)
    }

    private fun args(key: String): String = when (key) {
        "airing" -> "status: RELEASING, sort: POPULARITY_DESC"
        "popular" -> "sort: POPULARITY_DESC"
        "upcoming" -> "status: NOT_YET_RELEASED, sort: POPULARITY_DESC"
        "movies" -> "format: MOVIE, sort: SCORE_DESC"
        "season" -> {
            val (season, year) = currentSeason()
            "season: $season, seasonYear: $year, sort: POPULARITY_DESC"
        }
        else -> "sort: SCORE_DESC"
    }

    private var lastError = "unknown error"

    private suspend fun fetch(gql: String, vars: JSONObject): JSONArray? {
        val data = EclipsiaAnilistMeta.query(gql, vars)
        val media = data?.optJSONObject("Page")?.optJSONArray("media")
        if (media == null) lastError = "AniList request failed"
        return media
    }

    suspend fun page(api: MainAPI, page: Int, request: MainPageRequest): HomePageResponse =
        EclipsiaParallel.page(api, page, request.name, request.data, activeRows()) { p, name, data ->
            load(api, p, name, data)
        }

    private suspend fun load(api: MainAPI, page: Int, name: String, data: String): HomePageResponse {
        val key = data.removePrefix(PREFIX)
        val gql = "query(\$p: Int) { Page(page: \$p, perPage: $PER_PAGE) { media(type: ANIME, isAdult: false, ${args(key)}) { ${EclipsiaAnilistMeta.fields()} } } }"
        val data = fetch(gql, JSONObject().put("p", page.coerceAtLeast(1)))
            ?: return newHomePageResponse(name, emptyList(), hasNext = false)
        val items = responses(api, data)
        return newHomePageResponse(name, items, hasNext = items.isNotEmpty())
    }

    suspend fun search(api: MainAPI, query: String, page: Int = 1): List<SearchResponse> {
        val q = query.trim()
        if (q.isEmpty()) return emptyList()
        val gql = "query(\$s: String, \$p: Int) { Page(page: \$p, perPage: $PER_PAGE) { media(search: \$s, type: ANIME, sort: SEARCH_MATCH) { ${EclipsiaAnilistMeta.fields()} } } }"
        val data = fetch(gql, JSONObject().put("s", q).put("p", page.coerceAtLeast(1))) ?: return emptyList()
        return responses(api, data)
    }

    private suspend fun responses(api: MainAPI, data: JSONArray): List<SearchResponse> = coroutineScope {
        (0 until data.length())
            .mapNotNull { data.optJSONObject(it) }
            .distinctBy { it.optInt("id") }
            .map { async { entry(api, it) } }
            .awaitAll()
            .filterNotNull()
    }

    private suspend fun entry(api: MainAPI, json: JSONObject): SearchResponse? {
        val id = json.optInt("id").takeIf { it > 0 } ?: return null
        val isMovie = json.optString("format").equals("MOVIE", true)
        val titles = EclipsiaAnilistMeta.titlesOf(json)
        if (titles.isEmpty()) return null
        val t = json.optJSONObject("title")
        val title = t?.optString("english", "")?.takeIf { it.isNotBlank() && it != "null" }
            ?: t?.optString("romaji", "")?.takeIf { it.isNotBlank() && it != "null" }
            ?: titles.first()
        val year = EclipsiaAnilistMeta.yearOf(json)

        val key = "$id:$isMovie"
        val found = matches[key] ?: resolve(json.optInt("idMal", 0), titles, isMovie, year)?.also { matches[key] = it } ?: return null
        val c = json.optJSONObject("coverImage")
        val alPoster = (c?.optString("extraLarge", "")?.takeIf { it.startsWith("http") }
            ?: c?.optString("large", "")?.takeIf { it.startsWith("http") })
        val cover = EclipsiaPosters.resolve(found.kind, found.id, null, alPoster ?: found.poster)
        val target = "$HOME_URL/${found.kind}/${found.id}"
        return if (found.kind == "movie") api.newMovieSearchResponse(EclipsiaPosters.cardLabel(title), target, TvType.Movie) { posterUrl = cover }
        else api.newTvSeriesSearchResponse(EclipsiaPosters.cardLabel(title), target, TvType.TvSeries) { posterUrl = cover }
    }

    private suspend fun resolve(malId: Int, titles: List<String>, isMovie: Boolean, year: Int?): EclipsiaKitsuApi.Match? {
        if (!isMovie && malId > 0) {
            val root = EclipsiaKitsuMeta.get(
                "mappings?filter%5BexternalSite%5D=myanimelist/anime&filter%5BexternalId%5D=$malId&include=item"
            )
            val kitsuId = root?.optJSONArray("included")?.optJSONObject(0)?.optString("id")?.takeIf { it.isNotBlank() }
            if (kitsuId != null) EclipsiaKitsuApi.viaTvdb(kitsuId)?.let { return it }
        }
        return EclipsiaKitsuApi.resolveByTitle(titles, isMovie, year)
    }
}
