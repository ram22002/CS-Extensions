package com.nextgenanime

internal object NextGenPosters {
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

    fun resolve(anilistId: Int, fallback: String?): String? {
        val pattern = template() ?: return fallback
        return pattern
            .replace("{anilist_id}", anilistId.toString())
            .replace("{id}", anilistId.toString())
            .replace("{type}", "series")
    }
}
