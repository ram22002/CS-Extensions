package com.nextgenanime

import com.lagradost.cloudstream3.app
import kotlinx.coroutines.CancellationException
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

internal object NextGenAnilistMeta {
    private const val URL = "https://graphql.anilist.co"
    private const val TIMEOUT_MS = 12_000L

    private val cache = ConcurrentHashMap<String, JSONObject>()

    private const val MEDIA_FIELDS = """
        id idMal format status episodes seasonYear
        startDate { year }
        title { romaji english native }
        synonyms
        description(asHtml: false)
        coverImage { extraLarge large }
        bannerImage
    """

    internal suspend fun query(query: String, variables: JSONObject): JSONObject? {
        val body = JSONObject().put("query", query).put("variables", variables).toString()
        cache[body]?.let { return it }
        return try {
            val resp = app.post(
                URL,
                headers = mapOf("Accept" to "application/json", "Content-Type" to "application/json"),
                requestBody = body.toRequestBody("application/json".toMediaTypeOrNull()),
                timeout = TIMEOUT_MS,
            )
            if (resp.code !in 200..299) return null
            JSONObject(resp.text).optJSONObject("data")?.also { if (cache.size < 200) cache[body] = it }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }

    internal fun fields() = MEDIA_FIELDS

    private fun norm(s: String?) = s.orEmpty().lowercase().filter { it.isLetterOrDigit() }
    private fun JSONObject.str(k: String) = optString(k, "").takeIf { it.isNotBlank() && it != "null" }
    private fun JSONArray?.objs(): List<JSONObject> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

    internal fun cleanDescription(s: String?): String? = s?.replace("\r", "")
        ?.replace(Regex("""(?i)<br\s*/?>"""), "\n")
        ?.replace(Regex("""<[^>]+>"""), "")
        ?.replace(Regex("""\s*[(\[]\s*(Source|Written by)[^)\]]*[)\]]\s*$""", RegexOption.IGNORE_CASE), "")
        ?.replace(Regex("""\n{3,}"""), "\n\n")
        ?.trim()?.takeIf { it.isNotBlank() }

    internal fun titlesOf(o: JSONObject): List<String> {
        val t = o.optJSONObject("title")
        val list = mutableListOf<String>()
        listOf("english", "romaji", "native").forEach { k -> t?.str(k)?.let(list::add) }
        o.optJSONArray("synonyms")?.let { a -> for (i in 0 until a.length()) a.optString(i).takeIf { it.isNotBlank() }?.let(list::add) }
        return list.distinct()
    }

    internal fun yearOf(o: JSONObject): Int? =
        o.optInt("seasonYear", 0).takeIf { it > 0 } ?: o.optJSONObject("startDate")?.optInt("year", 0)?.takeIf { it > 0 }

    private fun entryOf(o: JSONObject): NextGenKitsuMeta.Entry? {
        val id = o.opt("id")?.toString()?.takeIf { it != "null" } ?: return null
        val c = o.optJSONObject("coverImage")
        val malId = o.optInt("idMal", 0).takeIf { it > 0 }
        val aniId = id.toIntOrNull()
        return NextGenKitsuMeta.Entry(
            id, cleanDescription(o.str("description")),
            o.optInt("episodes", 0).takeIf { it > 0 },
            c?.str("extraLarge") ?: c?.str("large"),
            o.str("bannerImage"),
            malId = malId,
            anilistId = aniId,
            kitsuId = null,
        )
    }

    suspend fun find(titles: List<String>, year: Int?, movie: Boolean): NextGenKitsuMeta.Entry? {
        val wanted = titles.map(::norm).filter { it.isNotEmpty() }.toSet()
        if (wanted.isEmpty()) return null
        val q = "query(\$s: String) { Page(page: 1, perPage: 10) { media(search: \$s, type: ANIME, sort: SEARCH_MATCH) { $MEDIA_FIELDS } } }"
        for (title in titles.distinct().take(3)) {
            val data = query(q, JSONObject().put("s", title))
                ?.optJSONObject("Page")?.optJSONArray("media").objs()
            val hit = data.firstOrNull { o ->
                val isMovie = o.str("format").equals("MOVIE", true)
                if (isMovie != movie) return@firstOrNull false
                val y = yearOf(o)
                if (year != null && y != null && kotlin.math.abs(y - year) > 1) return@firstOrNull false
                titlesOf(o).any { norm(it) in wanted }
            } ?: continue
            return entryOf(hit)
        }
        return null
    }

    private suspend fun sequel(id: String): NextGenKitsuMeta.Entry? {
        val q = "query(\$id: Int) { Media(id: \$id, type: ANIME) { relations { edges { relationType node { $MEDIA_FIELDS } } } } }"
        val edges = query(q, JSONObject().put("id", id.toIntOrNull() ?: return null))
            ?.optJSONObject("Media")?.optJSONObject("relations")?.optJSONArray("edges").objs()
        val node = edges.firstOrNull {
            it.optString("relationType") == "SEQUEL" &&
                it.optJSONObject("node")?.str("format") in setOf("TV", "ONA")
        }?.optJSONObject("node") ?: return null
        return entryOf(node)
    }

    private val EP_RE = Regex("""^\s*(?:episode|ep\.?|e)\s*(\d+)\s*(?:[-:–—]\s*(.*))?$""", RegexOption.IGNORE_CASE)

    private suspend fun episodes(entry: NextGenKitsuMeta.Entry): Map<Int, NextGenKitsuMeta.Ep> {
        val q = "query(\$id: Int) { Media(id: \$id, type: ANIME) { streamingEpisodes { title thumbnail } } }"
        val list = query(q, JSONObject().put("id", entry.id.toIntOrNull() ?: return emptyMap()))
            ?.optJSONObject("Media")?.optJSONArray("streamingEpisodes").objs()
        val out = LinkedHashMap<Int, NextGenKitsuMeta.Ep>()
        for (o in list) {
            val m = EP_RE.find(o.str("title") ?: continue) ?: continue
            val n = m.groupValues[1].toIntOrNull()?.takeIf { it > 0 } ?: continue
            val title = m.groupValues[2].trim().takeIf { it.isNotEmpty() }
            out.putIfAbsent(n, NextGenKitsuMeta.Ep(title, null, o.str("thumbnail"), null, null))
        }
        return out
    }

    suspend fun forSeasons(first: NextGenKitsuMeta.Entry, seasons: List<Pair<Int, Int>>): Map<Int, Map<Int, NextGenKitsuMeta.Ep>> {
        val out = HashMap<Int, Map<Int, NextGenKitsuMeta.Ep>>()
        var entry: NextGenKitsuMeta.Entry? = first
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
