package com.nextgen

import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageData
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.Score
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.app
import com.lagradost.cloudstream3.mainPageOf
import com.lagradost.cloudstream3.newHomePageResponse
import com.lagradost.cloudstream3.newMovieSearchResponse
import com.lagradost.cloudstream3.newTvSeriesSearchResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap

internal fun JSONObject.imdbText(key: String): String? =
    optString(key, "").takeIf { it.isNotBlank() && it != "null" }

internal fun JSONArray?.imdbObjects(): List<JSONObject> =
    if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

internal fun JSONArray?.imdbStrings(): List<String> =
    if (this == null) emptyList() else (0 until length()).mapNotNull { optString(it, "").takeIf { s -> s.isNotBlank() && s != "null" } }

internal object NextGenIMDbApi {
    const val PREFIX = "imdb:"
    const val BASE = "https://v3-cinemeta.strem.io"
    const val HOME_URL = "https://www.imdb.com"
        private const val SUGGEST_BASE = "https://v3.sg.media-imdb.com/suggestion"
    private const val IMAGE_PROXY = "https://wsrv.nl/?url="
    private const val POSTER_HOST = "https://images.metahub.space/poster/medium"
    private const val FETCH_TIMEOUT_MS = 12_000L
    private const val PROBE_TIMEOUT_MS = 6_000L
    private const val TTL_MS = 10 * 60 * 1000L
    private const val MAX_ENTRIES = 160

    private class Shelf(val key: String, val kind: String, val catalog: String) {
        val label = key.removePrefix("IMDb ")
        val query = "$PREFIX$kind:$catalog"
    }

    private val shelves = listOf(
        Shelf("IMDb Popular Movies", "movie", "top"),
        Shelf("IMDb Popular Series", "series", "top"),
        Shelf("IMDb New Movies", "movie", "year"),
        Shelf("IMDb New Series", "series", "year"),
        Shelf("IMDb Featured Movies", "movie", "imdbRating"),
        Shelf("IMDb Featured Series", "series", "imdbRating"),
    )

    val titles: List<String> = shelves.map { it.key }
    val labels: List<String> = shelves.map { it.label }

    fun activeRows(): List<MainPageData> {
        val order = runCatching { NextGenStore.rowOrder("imdb", titles) }.getOrDefault(titles)
        val visible = shelves.sortedBy { order.indexOf(it.key) }
            .filter { runCatching { NextGenStore.catalogRowEnabled(it.key) }.getOrDefault(true) }
        return mainPageOf(*visible.map { it.query to it.label }.toTypedArray())
    }

    private class Stored(val body: String, val stamp: Long)

    private val responses = ConcurrentHashMap<String, Stored>()
    private val consumed = ConcurrentHashMap<String, Int>()
    private val probes = ConcurrentHashMap<String, Boolean>()

    private suspend fun getJson(url: String): JSONObject? {
        val now = System.currentTimeMillis()
        responses[url]?.let { if (now - it.stamp < TTL_MS) return runCatching { JSONObject(it.body) }.getOrNull() }
        return try {
            val resp = app.get(url, timeout = FETCH_TIMEOUT_MS)
            if (resp.code !in 200..299) return null
            val body = resp.text
            val parsed = JSONObject(body)
            if (responses.size >= MAX_ENTRIES) responses.clear()
            responses[url] = Stored(body, System.currentTimeMillis())
            parsed
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }

    suspend fun fetch(path: String): JSONObject? = getJson("$BASE/$path")

    fun proxy(url: String?): String? {
        if (url.isNullOrBlank()) return null
        return if ("metahub.space" in url || "kitsu." in url) IMAGE_PROXY + url else url
    }

    fun linkOf(id: String, kind: String) = "$HOME_URL/title/$id/?kind=$kind"

    private suspend fun imageReachable(url: String): Boolean {
        probes[url]?.let { return it }
        val ok = try {
            withTimeoutOrNull(PROBE_TIMEOUT_MS) { app.head(url).code == 200 } ?: false
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            false
        }
        if (probes.size > 800) probes.clear()
        probes[url] = ok
        return ok
    }

    private suspend fun suggestedImages(text: String): Map<String, Boolean> {
        val lower = text.lowercase()
        val head = lower.firstOrNull()?.takeIf { it in 'a'..'z' || it in '0'..'9' } ?: 'x'
        val encoded = URLEncoder.encode(lower, "UTF-8").replace("+", "%20")
        val root = runCatching { getJson("$SUGGEST_BASE/$head/$encoded.json") }.getOrNull() ?: return emptyMap()
        val found = HashMap<String, Boolean>()
        for (item in root.optJSONArray("d").imdbObjects()) {
            val id = item.imdbText("id")?.takeIf { it.startsWith("tt") } ?: continue
            found[id] = item.optJSONObject("i")?.imdbText("imageUrl") != null
        }
        return found
    }

    private class Item(val id: String, val kind: String, val title: String, val image: String?, val rating: Score?)

    private fun parse(json: JSONObject, fallbackKind: String, searching: Boolean): Item? {
        val id = (json.imdbText("imdb_id") ?: json.imdbText("id"))?.takeIf { it.startsWith("tt") } ?: return null
        val kind = json.imdbText("type")?.takeIf { it == "movie" || it == "series" } ?: fallbackKind
        val title = json.optJSONArray("aliases").imdbStrings().firstOrNull() ?: json.imdbText("name") ?: return null
        val image = if (searching) "$POSTER_HOST/$id/img" else json.imdbText("poster")
        val rating = json.imdbText("imdbRating")?.toDoubleOrNull()?.let { Score.from10(it) }
        return Item(id, kind, title, image, rating)
    }

    private fun render(api: MainAPI, item: Item): SearchResponse {
        val cover = NextGenPosters.resolveImdb(item.kind, item.id, proxy(item.image))
        val label = NextGenPosters.cardLabel(item.title)
        val target = linkOf(item.id, item.kind)
        return if (item.kind == "movie") api.newMovieSearchResponse(label, target, TvType.Movie) {
            posterUrl = cover
            score = item.rating
        } else api.newTvSeriesSearchResponse(label, target, TvType.TvSeries) {
            posterUrl = cover
            score = item.rating
        }
    }

    suspend fun page(api: MainAPI, page: Int, request: MainPageRequest): HomePageResponse =
        NextGenParallel.page(api, page, request.name, request.data, activeRows()) { p, name, data ->
            load(api, p, name, data)
        }

    private suspend fun load(api: MainAPI, page: Int, name: String, data: String): HomePageResponse {
        val parts = data.removePrefix(PREFIX).split(':', limit = 2)
        val kind = parts[0]
        val catalog = parts.getOrElse(1) { "top" }
        if (page <= 1) consumed.remove(data)
        val offset = consumed[data] ?: 0
        val tail = if (offset > 0) "$catalog/skip=$offset" else catalog
        val root = getJson("$BASE/catalog/$kind/$tail.json")
            ?: return newHomePageResponse(name, emptyList(), hasNext = false)
        val metas = root.optJSONArray("metas").imdbObjects()
        consumed[data] = offset + metas.size
        val cards = coroutineScope {
            metas.mapNotNull { parse(it, kind, false) }
                .map { item -> async { item.takeIf { it.image != null && imageReachable(it.image) } } }
                .awaitAll()
                .filterNotNull()
        }
        return newHomePageResponse(name, cards.map { render(api, it) }, hasNext = metas.isNotEmpty())
    }

    suspend fun search(api: MainAPI, query: String): List<SearchResponse> {
        val text = query.trim()
        if (text.isEmpty()) return emptyList()
        val encoded = URLEncoder.encode(text, "UTF-8").replace("+", "%20")
        return coroutineScope {
            val known = async { suggestedImages(text) }
            val lanes = listOf("movie", "series").map { kind ->
                async {
                    runCatching {
                        getJson("$BASE/catalog/$kind/top/search=$encoded.json")
                            ?.optJSONArray("metas").imdbObjects()
                            .mapNotNull { parse(it, kind, true) }
                    }.getOrDefault(emptyList())
                }
            }.awaitAll()
            val verdicts = known.await()
            val checked = lanes.map { lane ->
                lane.map { item ->
                    async {
                        val image = item.image
                        when {
                            image == null -> null
                            verdicts[item.id] == false -> null
                            verdicts[item.id] == true -> item
                            imageReachable(image) -> item
                            else -> null
                        }
                    }
                }.awaitAll().filterNotNull()
            }
            val longest = checked.maxOfOrNull { it.size } ?: 0
            (0 until longest).flatMap { i -> checked.mapNotNull { it.getOrNull(i) } }.map { render(api, it) }
        }
    }
}
