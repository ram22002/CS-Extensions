package com.eclipsiaanime

import com.lagradost.cloudstream3.app
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap

internal object EclipsiaKitsuMeta {
    private const val BASE = "https://kitsu.io/api/edge"
    private const val TIMEOUT_MS = 12_000L
    private const val PAGE = 20
    private const val MAX_PAGES = 15

    class Entry(
        val id: String,
        val synopsis: String?,
        val episodeCount: Int?,
        val poster: String?,
        val cover: String?,
        val malId: Int? = null,
        val anilistId: Int? = null,
        val kitsuId: String? = null,
    )
    class Ep(val title: String?, val synopsis: String?, val thumb: String?, val airdate: String?, val minutes: Int?)

    private val cache = ConcurrentHashMap<String, JSONObject>()

    internal suspend fun get(path: String): JSONObject? {
        cache[path]?.let { return it }
        return try {
            val resp = app.get("$BASE/$path", headers = mapOf("Accept" to "application/vnd.api+json"), timeout = TIMEOUT_MS)
            if (resp.code !in 200..299) return null
            JSONObject(resp.text).also { if (cache.size < 200) cache[path] = it }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    private fun norm(s: String?) = s.orEmpty().lowercase().filter { it.isLetterOrDigit() }
    private fun JSONObject.str(k: String) = optString(k, "").takeIf { it.isNotBlank() && it != "null" }
    private fun JSONArray?.objs(): List<JSONObject> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

    private fun cleanSynopsis(s: String?): String? = s?.replace("\r", "")
        ?.replace(Regex("""\s*[(\[]\s*(Source|Written by)[^)\]]*[)\]]\s*$""", RegexOption.IGNORE_CASE), "")
        ?.trim()?.takeIf { it.isNotBlank() }

    private fun entryOf(o: JSONObject): Entry? {
        val id = o.str("id") ?: return null
        val at = o.optJSONObject("attributes") ?: return null
        val poster = at.optJSONObject("posterImage")
        val cover = at.optJSONObject("coverImage")
        return Entry(
            id, cleanSynopsis(at.str("synopsis") ?: at.str("description")),
            at.optInt("episodeCount", 0).takeIf { it > 0 },
            poster?.str("original") ?: poster?.str("large"),
            cover?.str("original") ?: cover?.str("large"),
            kitsuId = id,
        )
    }

    private fun titlesOf(at: JSONObject): List<String> {
        val t = at.optJSONObject("titles")
        val list = mutableListOf<String>()
        t?.keys()?.forEach { k -> t.str(k)?.let(list::add) }
        at.str("canonicalTitle")?.let(list::add)
        at.optJSONArray("abbreviatedTitles")?.let { a -> for (i in 0 until a.length()) a.optString(i).takeIf { it.isNotBlank() }?.let(list::add) }
        return list
    }

    internal suspend fun malIdFor(kitsuId: String): Int? {
        val json = get("anime/$kitsuId/mappings") ?: return null
        val data = json.optJSONArray("data").objs()
        for (m in data) {
            val attr = m.optJSONObject("attributes") ?: continue
            val site = attr.str("externalSite") ?: continue
            if (site.contains("myanimelist", ignoreCase = true)) {
                return attr.str("externalId")?.toIntOrNull()
            }
        }
        return null
    }

    suspend fun find(titles: List<String>, year: Int?, movie: Boolean): Entry? {
        val wanted = titles.map(::norm).filter { it.isNotEmpty() }.toSet()
        if (wanted.isEmpty()) return null
        for (title in titles.distinct().take(3)) {
            val data = get("anime?filter%5Btext%5D=${enc(title)}&page%5Blimit%5D=10")?.optJSONArray("data").objs()
            val hit = data.firstOrNull { o ->
                val at = o.optJSONObject("attributes") ?: return@firstOrNull false
                val isMovie = at.str("subtype").equals("movie", true)
                if (isMovie != movie) return@firstOrNull false
                val y = at.str("startDate")?.take(4)?.toIntOrNull()
                if (year != null && y != null && kotlin.math.abs(y - year) > 1) return@firstOrNull false
                titlesOf(at).any { norm(it) in wanted }
            } ?: continue
            val e = entryOf(hit) ?: continue
            val mal = malIdFor(e.id)
            return Entry(
                e.id, e.synopsis, e.episodeCount, e.poster, e.cover,
                malId = mal,
                kitsuId = e.id,
            )
        }
        return null
    }

    private suspend fun sequel(id: String): Entry? {
        val root = get("anime/$id/media-relationships?filter%5Brole%5D=sequel&include=destination&page%5Blimit%5D=10") ?: return null
        val tv = root.optJSONArray("included").objs().firstOrNull {
            it.optString("type") == "anime" &&
                it.optJSONObject("attributes")?.str("subtype")?.lowercase() in setOf("tv", "ona")
        } ?: return null
        return entryOf(tv)
    }

    private suspend fun episodes(entry: Entry): Map<Int, Ep> {
        fun path(offset: Int) = "anime/${entry.id}/episodes?sort=number&page%5Blimit%5D=$PAGE&page%5Boffset%5D=$offset"
        val first = get(path(0)) ?: return emptyMap()
        val total = first.optJSONObject("meta")?.optInt("count", 0) ?: 0
        val pages = ((total + PAGE - 1) / PAGE).coerceIn(1, MAX_PAGES)
        val rest = coroutineScope {
            (1 until pages).map { p -> async { get(path(p * PAGE)) } }.awaitAll()
        }
        val out = LinkedHashMap<Int, Ep>()
        for (page in listOf(first) + rest) {
            for (o in page?.optJSONArray("data").objs()) {
                val at = o.optJSONObject("attributes") ?: continue
                val n = at.optInt("number", 0).takeIf { it > 0 } ?: continue
                val t = at.optJSONObject("titles")
                val title = (t?.str("en_us") ?: t?.str("en") ?: at.str("canonicalTitle") ?: t?.str("en_jp"))
                    ?.takeUnless { it.matches(Regex("""(?i)episode\s*\d+""")) }
                out[n] = Ep(
                    title,
                    cleanSynopsis(at.str("synopsis")),
                    at.optJSONObject("thumbnail")?.str("original"),
                    at.str("airdate"),
                    at.optInt("length", 0).takeIf { it > 0 },
                )
            }
        }
        return out
    }

    suspend fun forSeasons(first: Entry, seasons: List<Pair<Int, Int>>): Map<Int, Map<Int, Ep>> {
        val out = HashMap<Int, Map<Int, Ep>>()
        var entry: Entry? = first
        for ((season, tmdbCount) in seasons.take(12)) {
            val e = entry ?: break
            val kc = e.episodeCount
            if (kc == null || kotlin.math.abs(kc - tmdbCount) <= maxOf(2, tmdbCount / 5)) {
                val eps = episodes(e)
                if (eps.isNotEmpty()) out[season] = eps
            }
            entry = sequel(e.id)
        }
        return out
    }
}
