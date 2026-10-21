package com.nextgenanime

data class NextGenScraper(

    val id: String,
    val name: String,
    val description: String?,
    val version: String,
    val supportedTypes: Set<String>,
    val manifestEnabled: Boolean,
    val defaultEnabled: Boolean,
    val hasSettings: Boolean,
)

object NextGenRepository {
    const val REPO_URL = "bundled"

    private val scrapers: List<NextGenScraper> by lazy {
        BundledProviders.all.map {
            NextGenScraper(
                id = "$REPO_URL:${it.key}",
                name = it.name,
                description = it.subtitle.ifBlank { null },
                version = it.version,
                supportedTypes = it.types,
                manifestEnabled = true,
                defaultEnabled = it.defaultEnabled,
                hasSettings = it.hasSettings,
            )
        }
    }

    fun allScrapers(): List<NextGenScraper> = scrapers.sortedBy { it.name.lowercase() }

    fun active(mediaType: String): List<NextGenScraper> = scrapers.filter {
        NextGenStore.isEnabled(it.id, it.manifestEnabled, it.defaultEnabled) && mediaType in it.supportedTypes
    }

    fun effectiveConcurrency(): Int =
        if (NextGenStore.concurrencyAuto) enabledCount().coerceAtLeast(1) else NextGenStore.concurrency

    private fun enabledCount(): Int = scrapers.count {
        NextGenStore.isEnabled(it.id, it.manifestEnabled, it.defaultEnabled)
    }

    fun readCode(s: NextGenScraper): String? =
        BundledProviders.all.firstOrNull { "$REPO_URL:${it.key}" == s.id }?.code
}
