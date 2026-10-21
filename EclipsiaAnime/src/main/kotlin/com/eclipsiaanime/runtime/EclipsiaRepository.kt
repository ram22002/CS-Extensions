package com.eclipsiaanime

data class EclipsiaScraper(

    val id: String,
    val name: String,
    val description: String?,
    val version: String,
    val supportedTypes: Set<String>,
    val manifestEnabled: Boolean,
    val defaultEnabled: Boolean,
    val hasSettings: Boolean,
)

object EclipsiaRepository {
    const val REPO_URL = "bundled"

    private val scrapers: List<EclipsiaScraper> by lazy {
        BundledProviders.all.map {
            EclipsiaScraper(
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

    fun allScrapers(): List<EclipsiaScraper> = scrapers.sortedBy { it.name.lowercase() }

    fun active(mediaType: String): List<EclipsiaScraper> = scrapers.filter {
        EclipsiaStore.isEnabled(it.id, it.manifestEnabled, it.defaultEnabled) && mediaType in it.supportedTypes
    }

    fun effectiveConcurrency(): Int =
        if (EclipsiaStore.concurrencyAuto) enabledCount().coerceAtLeast(1) else EclipsiaStore.concurrency

    private fun enabledCount(): Int = scrapers.count {
        EclipsiaStore.isEnabled(it.id, it.manifestEnabled, it.defaultEnabled)
    }

    fun readCode(s: EclipsiaScraper): String? =
        BundledProviders.all.firstOrNull { "$REPO_URL:${it.key}" == s.id }?.code
}
