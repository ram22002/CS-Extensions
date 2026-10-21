package com.nextgenbdix

import java.util.concurrent.ConcurrentHashMap

internal object NextGenPosters {
    private val imdbIds = ConcurrentHashMap<String, String>()

    private const val HIDDEN_TITLE = "\u200B"

    fun cardLabel(title: String): String {
        val hide = runCatching { NextGenStore.hideLabels }.getOrDefault(false)
        return if (hide) HIDDEN_TITLE else title
    }

    private fun template(): String? {
        val on = runCatching { NextGenStore.customPosterEnabled }.getOrDefault(false)
        if (!on) return null
        return runCatching { NextGenStore.customPosterTemplate }.getOrNull()
            ?.replace("%7B", "{", ignoreCase = true)?.replace("%7D", "}", ignoreCase = true)
            ?.takeIf { it.startsWith("http://") || it.startsWith("https://") }
    }

    private suspend fun imdbOf(kind: String, tmdbId: Int): String? {
        val key = "$kind:$tmdbId"
        imdbIds[key]?.let { return it }
        val found = NextGenDetails.fetchJson("$kind/$tmdbId/external_ids")
            ?.optString("imdb_id")?.takeIf { it.startsWith("tt") }
            ?: return null
        imdbIds[key] = found
        return found
    }

    fun resolveImdb(kind: String, imdbId: String, fallback: String?): String? {
        val pattern = template() ?: return fallback
        if ("{tmdb_id}" in pattern) return fallback
        return pattern
            .replace("{imdb_id}", imdbId)
            .replace("{type}", if (kind == "series") "series" else "movie")
    }

    suspend fun resolve(kind: String, tmdbId: Int, imdbId: String?, fallback: String?): String? {
        val pattern = template() ?: return fallback
        var url = pattern
        if ("{imdb_id}" in url) {
            val imdb = imdbId?.takeIf { it.startsWith("tt") } ?: imdbOf(kind, tmdbId) ?: return fallback
            url = url.replace("{imdb_id}", imdb)
        }
        return url
            .replace("{tmdb_id}", tmdbId.toString())
            .replace("{type}", if (kind == "tv") "series" else "movie")
    }
}
