package com.nextgen

import com.lagradost.cloudstream3.app
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

data class AniZipMappings(
    val malId: Int? = null,
    val anilistId: Int? = null,
    val kitsuId: Int? = null,
    val imdbId: String? = null,
    val tmdbId: String? = null,
)

internal object NextGenAniZip {
    private const val BASE = "https://api.ani.zip/mappings"
    private const val TIMEOUT_MS = 8_000L
    private val cache = ConcurrentHashMap<String, AniZipMappings?>()

    suspend fun resolve(
        tmdbId: String? = null,
        imdbId: String? = null,
        anilistId: String? = null,
        malId: String? = null,
        kitsuId: String? = null,
    ): AniZipMappings? {
        val candidates = listOfNotNull(
            tmdbId?.takeIf { it.isNotBlank() }?.let { "themoviedb_id=$it" },
            imdbId?.takeIf { it.isNotBlank() }?.let { "imdb_id=$it" },
            anilistId?.takeIf { it.isNotBlank() }?.let { "anilist_id=$it" },
            malId?.takeIf { it.isNotBlank() }?.let { "mal_id=$it" },
            kitsuId?.takeIf { it.isNotBlank() }?.let { "kitsu_id=$it" },
        )
        if (candidates.isEmpty()) return null

        for (query in candidates) {
            if (cache.containsKey(query)) {
                cache[query]?.let { return it }
                continue
            }
            try {
                val resp = app.get(
                    "$BASE?$query",
                    headers = mapOf("User-Agent" to "Mozilla/5.0"),
                    timeout = TIMEOUT_MS
                )
                if (resp.code == 200) {
                    val root = JSONObject(resp.text)
                    val m = root.optJSONObject("mappings")
                    if (m != null) {
                        val mapping = AniZipMappings(
                            malId = m.optInt("mal_id", 0).takeIf { it > 0 },
                            anilistId = m.optInt("anilist_id", 0).takeIf { it > 0 },
                            kitsuId = m.optInt("kitsu_id", 0).takeIf { it > 0 },
                            imdbId = m.optString("imdb_id").takeIf { it.isNotBlank() && it != "null" },
                            tmdbId = m.opt("themoviedb_id")?.toString()?.takeIf { it.isNotBlank() && it != "null" },
                        )
                        if (cache.size < 500) {
                            cache[query] = mapping
                            mapping.tmdbId?.let { cache["themoviedb_id=$it"] = mapping }
                            mapping.imdbId?.let { cache["imdb_id=$it"] = mapping }
                            mapping.anilistId?.let { cache["anilist_id=$it"] = mapping }
                            mapping.malId?.let { cache["mal_id=$it"] = mapping }
                            mapping.kitsuId?.let { cache["kitsu_id=$it"] = mapping }
                        }
                        return mapping
                    }
                }
                if (cache.size < 500) cache[query] = null
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
        return null
    }
}
