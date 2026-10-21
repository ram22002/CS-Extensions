package com.nextgen

import org.json.JSONArray

data class NextGenScraper(

    val id: String,
    val name: String,
    val description: String?,
    val version: String,
    val supportedTypes: Set<String>,
    val manifestEnabled: Boolean,
    val defaultEnabled: Boolean,
    val hasSettings: Boolean,
    val category: String,
)

class ProviderPreset(val label: String, val providerIds: Set<String>)

class ProviderCategory(val id: String, val label: String, val bannerText: String)

object NextGenRepository {
    const val REPO_URL = "bundled"

    val PRESETS: List<ProviderPreset> by lazy {
        val arr = runCatching { JSONArray(ProviderConfigData.PRESETS) }.getOrDefault(JSONArray())
        (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            val label = o.optString("label").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val ids = o.optJSONArray("providerIds") ?: JSONArray()
            ProviderPreset(label, (0 until ids.length()).map { ids.optString(it) }.toSet())
        }
    }

    val CATEGORIES: List<ProviderCategory> by lazy {
        val arr = runCatching { JSONArray(ProviderConfigData.CATEGORIES) }.getOrDefault(JSONArray())
        (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            val id = o.optString("id").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            ProviderCategory(id, o.optString("label", id), o.optString("bannerText"))
        }
    }

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
                category = it.category,
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
