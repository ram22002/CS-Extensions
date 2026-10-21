package com.eclipsiabdix

import android.content.Context
import android.content.SharedPreferences

object EclipsiaStore {
    private var appContext: Context? = null

    fun init(ctx: Context) {
        appContext = ctx
    }

    val context: Context
        get() = appContext ?: error("EclipsiaBDIX plugin has not been loaded yet")

    private val prefs: SharedPreferences
        get() = context.getSharedPreferences("eclipsia_bdix", Context.MODE_PRIVATE)

    fun isEnabled(scraperId: String, manifestEnabled: Boolean, defaultEnabled: Boolean = manifestEnabled): Boolean =
        manifestEnabled && prefs.getBoolean("enabled_$scraperId", defaultEnabled)

    fun setEnabled(scraperId: String, enabled: Boolean) {
        prefs.edit().putBoolean("enabled_$scraperId", enabled).apply()
    }

    fun settingsJson(scraperId: String): String = prefs.getString("settings_$scraperId", null) ?: "{}"
    fun saveSettings(scraperId: String, json: String) {
        prefs.edit().putString("settings_$scraperId", json).apply()
    }

    var tmdbKeyOverride: String
        get() = prefs.getString("tmdb_key", "") ?: ""
        set(value) {
            prefs.edit().putString("tmdb_key", value.trim()).apply()
        }

    var tmdbPersonalEnabled: Boolean
        get() = prefs.getBoolean("tmdb_personal", false)
        set(value) {
            prefs.edit().putBoolean("tmdb_personal", value).apply()
        }

    const val TIMEOUT_AUTO = 0
    const val MIN_TIMEOUT_SECONDS = 5
    const val MAX_TIMEOUT_SECONDS = 180
    const val TIMEOUT_STEP_SECONDS = 5

    var timeoutSeconds: Int
        get() = prefs.getInt("timeout_seconds", TIMEOUT_AUTO).let {
            if (it <= TIMEOUT_AUTO) TIMEOUT_AUTO else it.coerceIn(MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS)
        }
        set(value) {
            val v = if (value < MIN_TIMEOUT_SECONDS) TIMEOUT_AUTO else value.coerceAtMost(MAX_TIMEOUT_SECONDS)
            prefs.edit().putInt("timeout_seconds", v).apply()
        }

    fun catalogRowEnabled(title: String): Boolean = prefs.getBoolean("catalog_row_$title", true)

    fun rowOrder(group: String, defaults: List<String>): List<String> {
        val saved = (prefs.getString("row_order_$group", "") ?: "").split("|").filter { it in defaults }.distinct()
        return saved + defaults.filter { it !in saved }
    }

    fun setRowOrder(group: String, keys: List<String>) {
        prefs.edit().putString("row_order_$group", keys.joinToString("|")).apply()
    }

    fun setCatalogRowEnabled(title: String, enabled: Boolean) {
        prefs.edit().putBoolean("catalog_row_$title", enabled).apply()
    }

    var customPosterEnabled: Boolean
        get() = prefs.getBoolean("poster_custom", false)
        set(value) {
            prefs.edit().putBoolean("poster_custom", value).apply()
        }

    var hideLabels: Boolean
        get() = prefs.getBoolean("hide_labels", false)
        set(value) {
            prefs.edit().putBoolean("hide_labels", value).apply()
        }

    var customPosterTemplate: String
        get() = prefs.getString("poster_template", "") ?: ""
        set(value) {
            prefs.edit().putString("poster_template", value.trim()).apply()
        }

    const val DEFAULT_TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd"

    fun tmdbKey(): String {
        val custom = tmdbKeyOverride
        return if (tmdbPersonalEnabled && custom.isNotBlank()) custom else DEFAULT_TMDB_KEY
    }

    const val DEFAULT_REGION = "US"
    const val DEFAULT_LANGUAGE = "en-US"
    const val DEFAULT_EXCLUDED_KEYWORDS = "190370|13059|226161|195669"

    private val REGION_RE = Regex("^[A-Z]{2}$")
    private val LANGUAGE_RE = Regex("^[a-z]{2}(-[A-Z]{2})?$")

    var region: String
        get() = prefs.getString("catalog_region", DEFAULT_REGION)?.takeIf { REGION_RE.matches(it) } ?: DEFAULT_REGION
        set(value) {
            prefs.edit().putString("catalog_region", value.trim().uppercase().takeIf { REGION_RE.matches(it) } ?: DEFAULT_REGION).apply()
        }

    var language: String
        get() = prefs.getString("catalog_language", DEFAULT_LANGUAGE)?.takeIf { LANGUAGE_RE.matches(it) } ?: DEFAULT_LANGUAGE
        set(value) {
            val v = value.trim().let { raw ->
                raw.substringBefore('-').lowercase() + (raw.substringAfter('-', "").takeIf { it.isNotEmpty() }?.let { "-" + it.uppercase() } ?: "")
            }
            prefs.edit().putString("catalog_language", v.takeIf { LANGUAGE_RE.matches(it) } ?: DEFAULT_LANGUAGE).apply()
        }

    val languageCode: String get() = language.substringBefore('-')

    var excludedKeywords: String
        get() = prefs.getString("catalog_excluded", DEFAULT_EXCLUDED_KEYWORDS) ?: DEFAULT_EXCLUDED_KEYWORDS
        set(value) {
            val ids = value.split('|', ',', ' ', ';').map { it.trim() }.filter { it.isNotEmpty() && it.all(Char::isDigit) }
            prefs.edit().putString("catalog_excluded", ids.distinct().joinToString("|")).apply()
        }
}
