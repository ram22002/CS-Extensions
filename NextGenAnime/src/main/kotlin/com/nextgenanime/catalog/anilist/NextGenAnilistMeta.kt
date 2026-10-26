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
    private const val TIMEOUT_MS = 15_000L

    private val cache = ConcurrentHashMap<String, JSONObject>()

    private const val MEDIA_FIELDS = """
        id idMal format status episodes seasonYear
        startDate { year }
        title { romaji english native userPreferred }
        synonyms
        description(asHtml: false)
        coverImage { extraLarge large medium }
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
            JSONObject(resp.text).optJSONObject("data")?.also { if (cache.size < 300) cache[body] = it }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }

    internal fun fields() = MEDIA_FIELDS

    internal fun cleanDescription(s: String?): String? = s?.replace("\r", "")
        ?.replace(Regex("""(?i)<br\s*/?>"""), "\n")
        ?.replace(Regex("""<[^>]+>"""), "")
        ?.replace(Regex("""\s*[(\[]\s*(Source|Written by)[^)\]]*[)\]]\s*$""", RegexOption.IGNORE_CASE), "")
        ?.replace(Regex("""\n{3,}"""), "\n\n")
        ?.trim()?.takeIf { it.isNotBlank() }

    internal fun titlesOf(o: JSONObject): List<String> {
        val t = o.optJSONObject("title")
        val list = mutableListOf<String>()
        listOf("english", "romaji", "userPreferred", "native").forEach { k ->
            val v = t?.optString(k, "")?.takeIf { it.isNotBlank() && it != "null" }
            if (v != null) list.add(v)
        }
        o.optJSONArray("synonyms")?.let { a ->
            for (i in 0 until a.length()) {
                a.optString(i)?.takeIf { it.isNotBlank() && it != "null" }?.let(list::add)
            }
        }
        return list.distinct()
    }

    internal fun yearOf(o: JSONObject): Int? =
        o.optInt("seasonYear", 0).takeIf { it > 0 }
            ?: o.optJSONObject("startDate")?.optInt("year", 0)?.takeIf { it > 0 }
}
