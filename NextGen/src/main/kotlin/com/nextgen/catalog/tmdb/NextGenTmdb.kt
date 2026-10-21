package com.nextgen

import com.lagradost.cloudstream3.app
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

internal object NextGenTmdb {
    const val BASE = "https://api.themoviedb.org/3"
    private const val TIMEOUT_MS = 10_000L
    private const val RETRY_DELAY_MS = 400L
    private const val TTL_MS = 10 * 60 * 1000L
    private const val MAX_ENTRIES = 150

    private class Entry(val text: String, val at: Long)

    private val cache = object : LinkedHashMap<String, Entry>(32, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Entry>?): Boolean =
            size > MAX_ENTRIES
    }

    suspend fun get(path: String, ttlMs: Long = TTL_MS): String? {
        val now = System.currentTimeMillis()
        synchronized(cache) { cache[path] }?.let { if (now - it.at < ttlMs) return it.text }

        val url = "$BASE/$path${if ('?' in path) '&' else '?'}api_key=${NextGenStore.tmdbKey()}"
        repeat(2) { attempt ->
            try {
                val resp = app.get(url, timeout = TIMEOUT_MS)
                val code = resp.code
                if (code in 200..299) {
                    val text = resp.text
                    synchronized(cache) { cache[path] = Entry(text, System.currentTimeMillis()) }
                    return text
                }
                if (code != 429 && code < 500) return null
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
            if (attempt == 0) delay(RETRY_DELAY_MS)
        }
        return null
    }
}
