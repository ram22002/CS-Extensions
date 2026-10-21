package com.eclipsiaanime

import com.lagradost.cloudstream3.ErrorLoadingException
import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageData
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.mainPageOf
import com.lagradost.cloudstream3.app
import com.lagradost.cloudstream3.newHomePageResponse
import com.lagradost.cloudstream3.newMovieSearchResponse
import com.lagradost.cloudstream3.newTvSeriesSearchResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap

internal object EclipsiaKitsuApi {
    const val PREFIX = "kitsu:"
    private const val POSTER_BASE = "https://image.tmdb.org/t/p/w500"
    private const val HOME_URL = "https://www.themoviedb.org"
    private const val TIMEOUT_MS = 12_000L

    internal class Match(val kind: String, val id: Int, val poster: String?)

    private val matches = ConcurrentHashMap<String, Match>()

    fun isKitsu(query: String) = query.startsWith(PREFIX)

    private class Shelf(val key: String, val query: String) {
        val label = key.removePrefix("Kitsu ")
    }

    private val shelves = listOf(
        Shelf("Kitsu Top Anime", "${PREFIX}top"),
        Shelf("Kitsu Airing Now", "${PREFIX}airing"),
        Shelf("Kitsu Most Popular", "${PREFIX}popular"),
        Shelf("Kitsu Upcoming", "${PREFIX}upcoming"),
        Shelf("Kitsu Top Anime Movies", "${PREFIX}movies"),
        Shelf("Kitsu This Season", "${PREFIX}season"),
    )

    val titles: List<String> = shelves.map { it.key }
    val labels: List<String> = shelves.map { it.label }

    fun activeRows(): List<MainPageData> {
        val order = runCatching { EclipsiaStore.rowOrder("kitsu", titles) }.getOrDefault(titles)
        val on = shelves.sortedBy { order.indexOf(it.key) }
            .filter { runCatching { EclipsiaStore.catalogRowEnabled(it.key) }.getOrDefault(true) }
        return mainPageOf(*on.map { it.query to it.label }.toTypedArray())
    }

    private var lastError = "unknown error"

    private fun currentSeason(): Pair<String, Int> {
        val c = java.util.Calendar.getInstance()
        val name = when (c.get(java.util.Calendar.MONTH)) {
            in 0..2 -> "winter"; in 3..5 -> "spring"; in 6..8 -> "summer"; else -> "fall"
        }
        return name to c.get(java.util.Calendar.YEAR)
    }

    private fun kitsuFilter(key: String): String = when (key) {
        "airing" -> "filter%5Bstatus%5D=current&sort=popularityRank"
        "popular" -> "sort=popularityRank"
        "upcoming" -> "filter%5Bstatus%5D=upcoming&sort=popularityRank"
        "movies" -> "filter%5Bsubtype%5D=movie&sort=ratingRank"
        "season" -> {
            val (season, year) = currentSeason()
            "filter%5Bseason%5D=$season&filter%5BseasonYear%5D=$year&sort=popularityRank"
        }
        else -> "sort=ratingRank"
    }

    private suspend fun kitsu(path: String, page: Int): JSONArray? =
        fetch("https://kitsu.io/api/edge/anime?${kitsuFilter(path)}&page%5Blimit%5D=20&page%5Boffset%5D=${(page - 1) * 20}")

    private suspend fun fetch(url: String): JSONArray? {
        return try {
            val resp = app.get(url, headers = mapOf("Accept" to "application/vnd.api+json"), timeout = TIMEOUT_MS)
            if (resp.code !in 200..299) { lastError = "Kitsu HTTP ${resp.code}"; return null }
            val data = JSONObject(resp.text).getJSONArray("data")
            JSONArray().also { out ->
                for (i in 0 until data.length()) {
                    val m = data.optJSONObject(i) ?: continue
                    val at = m.optJSONObject("attributes") ?: continue
                    val titles = at.optJSONObject("titles")
                    fun str(o: JSONObject?, k: String) = o?.optString(k, "")?.takeIf { it != "null" }.orEmpty()
                    val romaji = str(titles, "en_jp").ifBlank { str(at, "canonicalTitle") }
                    val year = str(at, "startDate").take(4).toIntOrNull() ?: 0
                    val poster = at.optJSONObject("posterImage")
                    out.put(JSONObject()
                        .put("kitsu_id", m.optString("id"))
                        .put("mal_id", m.optString("id").toIntOrNull()?.plus(20_000_000) ?: continue)
                        .put("type", if (str(at, "subtype").equals("movie", true)) "Movie" else "TV")
                        .put("title_english", str(titles, "en").ifBlank { str(titles, "en_us") })
                        .put("title", romaji)
                        .put("year", year)
                        .put("images", JSONObject().put("jpg", JSONObject()
                            .put("large_image_url", str(poster, "large").ifBlank { str(poster, "original") }))))
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            lastError = "Kitsu: ${e.message ?: e.javaClass.simpleName}"
            null
        }
    }

    suspend fun page(api: MainAPI, page: Int, request: MainPageRequest): HomePageResponse =
        EclipsiaParallel.page(api, page, request.name, request.data, activeRows()) { p, name, data ->
            load(api, p, name, data)
        }

    private suspend fun load(api: MainAPI, page: Int, name: String, data: String): HomePageResponse {
        val path = data.removePrefix(PREFIX)
        val data = kitsu(path, page) ?: throw ErrorLoadingException("Kitsu request failed ($lastError)")

        val items = responses(api, data)
        return newHomePageResponse(name, items, hasNext = items.isNotEmpty())
    }

    private suspend fun responses(api: MainAPI, data: JSONArray): List<SearchResponse> = coroutineScope {
        (0 until data.length())
            .mapNotNull { data.optJSONObject(it) }
            .distinctBy { it.optInt("mal_id") }
            .map { async { entry(api, it) } }
            .awaitAll()
            .filterNotNull()
    }

    suspend fun search(api: MainAPI, query: String, page: Int = 1): List<SearchResponse> {
        val q = URLEncoder.encode(query.trim(), "UTF-8")
        if (q.isEmpty()) return emptyList()
        val offset = (page.coerceAtLeast(1) - 1) * 20
        val data = fetch("https://kitsu.io/api/edge/anime?filter%5Btext%5D=$q&page%5Blimit%5D=20&page%5Boffset%5D=$offset") ?: return emptyList()
        return responses(api, data)
    }

    private suspend fun entry(api: MainAPI, json: JSONObject): SearchResponse? {
        val malId = json.optInt("mal_id").takeIf { it > 0 } ?: return null
        val isMovie = json.optString("type").equals("Movie", true)
        val titles = listOf(json.optString("title_english"), json.optString("title"))
            .filter { it.isNotBlank() }.distinct()
        if (titles.isEmpty()) return null
        val year = json.optJSONObject("aired")?.optJSONObject("prop")?.optJSONObject("from")
            ?.optInt("year", 0)?.takeIf { it > 0 } ?: json.optInt("year", 0).takeIf { it > 0 }

        val key = "$malId:$isMovie"
        val kitsuId = json.optString("kitsu_id")
        val found = matches[key] ?: resolve(kitsuId, titles, isMovie, year)?.also { matches[key] = it } ?: return null
        val malPoster = json.optJSONObject("images")?.optJSONObject("jpg")
            ?.optString("large_image_url")?.takeIf { it.startsWith("http") }
        val cover = EclipsiaPosters.resolve(found.kind, found.id, null, malPoster ?: found.poster)
        val title = titles.first()
        val target = "$HOME_URL/${found.kind}/${found.id}"
        return if (found.kind == "movie") api.newMovieSearchResponse(EclipsiaPosters.cardLabel(title), target, TvType.Movie) { posterUrl = cover }
        else api.newTvSeriesSearchResponse(EclipsiaPosters.cardLabel(title), target, TvType.TvSeries) { posterUrl = cover }
    }

    private fun JSONObject.str(k: String) = optString(k, "").takeIf { it.isNotBlank() && it != "null" }
    private fun norm(s: String?) = s.orEmpty().lowercase().filter { it.isLetterOrDigit() }

    private fun baseTitle(t: String) = t
        .replace(Regex("""(?i)\s*[:\-]?\s*(\d+(st|nd|rd|th)\s+season|season\s*\d+|part\s*\d+|cour\s*\d+|final season)\b.*$"""), "")
        .trim()

    internal suspend fun viaTvdb(kitsuId: String): Match? {
        if (kitsuId.isBlank()) return null
        val root = EclipsiaKitsuMeta.get("anime/$kitsuId/mappings?page%5Blimit%5D=20") ?: return null
        val arr = root.optJSONArray("data") ?: return null
        var tvdb: String? = null
        for (i in 0 until arr.length()) {
            val at = arr.optJSONObject(i)?.optJSONObject("attributes") ?: continue
            val site = at.str("externalSite") ?: continue
            val ext = at.str("externalId") ?: continue
            when {
                site == "thetvdb/series" || site == "thetvdb" -> tvdb = ext.substringBefore('/')
                site == "thetvdb/season" && '/' in ext && tvdb == null -> tvdb = ext.substringBefore('/')
            }
        }
        val id = tvdb?.takeIf { it.all(Char::isDigit) } ?: return null
        val text = EclipsiaTmdb.get("find/$id?external_source=tvdb_id", ttlMs = 24 * 60 * 60 * 1000L) ?: return null
        val hit = runCatching { JSONObject(text).optJSONArray("tv_results")?.optJSONObject(0) }.getOrNull() ?: return null
        val tmdb = hit.optInt("id", 0).takeIf { it > 0 } ?: return null
        val poster = hit.optString("poster_path").takeIf { it.startsWith("/") }?.let { POSTER_BASE + it }
        return Match("tv", tmdb, poster)
    }

    private suspend fun resolve(kitsuId: String, titles: List<String>, isMovie: Boolean, year: Int?): Match? {
        if (!isMovie) viaTvdb(kitsuId)?.let { return it }
        return resolveByTitle(titles, isMovie, year)
    }

    internal suspend fun resolveByTitle(titles: List<String>, isMovie: Boolean, year: Int?): Match? {

        val kind = if (isMovie) "movie" else "tv"
        val wanted = (titles + titles.map(::baseTitle)).map(::norm).filter { it.isNotEmpty() }.toSet()
        for (title in (titles.map(::baseTitle) + titles).distinct()) {
            val q = URLEncoder.encode(title, "UTF-8")
            val text = EclipsiaTmdb.get(
                "search/$kind?query=$q&include_adult=false&language=${EclipsiaStore.language}",
                ttlMs = 6 * 60 * 60 * 1000L,
            ) ?: continue
            val results = runCatching { JSONObject(text).optJSONArray("results") }.getOrNull() ?: continue
            val list = (0 until results.length()).mapNotNull { results.optJSONObject(it) }.take(8)
            fun animation(o: JSONObject) = (0 until (o.optJSONArray("genre_ids")?.length() ?: 0))
                .any { o.optJSONArray("genre_ids")!!.optInt(it) == 16 }
            fun yearOk(o: JSONObject): Boolean {
                if (!isMovie || year == null) return true
                val y = (o.str("release_date") ?: "").take(4).toIntOrNull() ?: return true
                return kotlin.math.abs(y - year) <= 1
            }
            fun nameMatches(o: JSONObject) = listOf("name", "original_name", "title", "original_title")
                .any { norm(o.str(it)) in wanted }
            val hit = list.firstOrNull { animation(it) && nameMatches(it) && yearOk(it) }
                ?: list.firstOrNull { animation(it) && yearOk(it) && it.str("original_language") == "ja" }
                ?: continue
            val id = hit.optInt("id", 0).takeIf { it > 0 } ?: continue
            val poster = hit.optString("poster_path").takeIf { it.startsWith("/") }?.let { POSTER_BASE + it }
            return Match(kind, id, poster)
        }
        return null
    }
}
