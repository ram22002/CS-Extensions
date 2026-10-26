package com.nextgenanime

import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageData
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.mainPageOf
import com.lagradost.cloudstream3.newAnimeSearchResponse
import com.lagradost.cloudstream3.newHomePageResponse
import org.json.JSONArray
import org.json.JSONObject

internal object NextGenAnilistApi {
    const val PREFIX = "anilist:"
    private const val PER_PAGE = 20

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
        val order = runCatching { NextGenStore.rowOrder("anilist", titles) }.getOrDefault(titles)
        val on = shelves.sortedBy { order.indexOf(it.key) }
            .filter { runCatching { NextGenStore.catalogRowEnabled(it.key) }.getOrDefault(true) }
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

    private suspend fun fetch(gql: String, vars: JSONObject): JSONArray? {
        val data = NextGenAnilistMeta.query(gql, vars)
        return data?.optJSONObject("Page")?.optJSONArray("media")
    }

    suspend fun page(api: MainAPI, page: Int, request: MainPageRequest): HomePageResponse =
        NextGenParallel.page(api, page, request.name, request.data, activeRows()) { p, name, data ->
            load(api, p, name, data)
        }

    private suspend fun load(api: MainAPI, page: Int, name: String, data: String): HomePageResponse {
        val key = data.removePrefix(PREFIX)
        val gql = "query(\$p: Int) { Page(page: \$p, perPage: $PER_PAGE) { media(type: ANIME, isAdult: false, ${args(key)}) { ${NextGenAnilistMeta.fields()} } } }"
        val mediaArray = fetch(gql, JSONObject().put("p", page.coerceAtLeast(1)))
            ?: return newHomePageResponse(name, emptyList(), hasNext = false)
        val items = responses(api, mediaArray)
        return newHomePageResponse(name, items, hasNext = items.isNotEmpty())
    }

    suspend fun search(api: MainAPI, query: String, page: Int = 1): List<SearchResponse> {
        val q = query.trim()
        if (q.isEmpty()) return emptyList()
        val gql = "query(\$s: String, \$p: Int) { Page(page: \$p, perPage: $PER_PAGE) { media(search: \$s, type: ANIME, sort: SEARCH_MATCH) { ${NextGenAnilistMeta.fields()} } } }"
        val mediaArray = fetch(gql, JSONObject().put("s", q).put("p", page.coerceAtLeast(1))) ?: return emptyList()
        return responses(api, mediaArray)
    }

    fun toSearchResponse(api: MainAPI, json: JSONObject): SearchResponse? {
        val id = json.optInt("id").takeIf { it > 0 } ?: return null
        val format = json.optString("format", "")
        val isMovie = format.equals("MOVIE", ignoreCase = true)

        val titleObj = json.optJSONObject("title")
        val english = titleObj?.optString("english")?.takeIf { it.isNotBlank() && it != "null" }
        val romaji = titleObj?.optString("romaji")?.takeIf { it.isNotBlank() && it != "null" }
        val userPreferred = titleObj?.optString("userPreferred")?.takeIf { it.isNotBlank() && it != "null" }
        val native = titleObj?.optString("native")?.takeIf { it.isNotBlank() && it != "null" }
        val title = english ?: romaji ?: userPreferred ?: native ?: return null

        val coverObj = json.optJSONObject("coverImage")
        val poster = coverObj?.optString("extraLarge")?.takeIf { it.startsWith("http") }
            ?: coverObj?.optString("large")?.takeIf { it.startsWith("http") }
            ?: coverObj?.optString("medium")?.takeIf { it.startsWith("http") }

        val target = "https://anilist.co/anime/$id"
        val tvType = if (isMovie) TvType.AnimeMovie else TvType.Anime

        return api.newAnimeSearchResponse(NextGenPosters.cardLabel(title), target, tvType) {
            posterUrl = poster
        }
    }

    private fun responses(api: MainAPI, data: JSONArray): List<SearchResponse> {
        val list = mutableListOf<SearchResponse>()
        for (i in 0 until data.length()) {
            val obj = data.optJSONObject(i) ?: continue
            toSearchResponse(api, obj)?.let(list::add)
        }
        return list
    }
}
