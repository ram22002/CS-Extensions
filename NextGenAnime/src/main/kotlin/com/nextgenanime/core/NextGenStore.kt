package com.nextgenanime

import android.content.Context
import android.content.SharedPreferences

object NextGenStore {
    private const val PREFS = "eclipsia_anime"
    private const val LEGACY_PREFS = "eclipsia"
    private var appContext: Context? = null

    fun init(ctx: Context) {
        appContext = ctx
        migrateFromNextGen(ctx)
    }

    private fun migrateFromNextGen(ctx: Context) {
        val own = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (own.getBoolean("migrated_from_eclipsia", false)) return
        runCatching {
            val old = ctx.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
            val ed = own.edit()
            val keep = listOf(
                "enabled_", "settings_", "catalog_row_", "row_order_anilist",
            )
            val plain = setOf(
                "anilist_enabled", "concurrency", "concurrency_auto",
                "timeout_seconds", "poster_custom", "poster_template", "hide_labels",
            )
            old.all.forEach { (k, v) ->
                if (k !in plain && keep.none { k.startsWith(it) }) return@forEach
                when (v) {
                    is Boolean -> ed.putBoolean(k, v)
                    is Int -> ed.putInt(k, v)
                    is String -> ed.putString(k, v)
                    is Long -> ed.putLong(k, v)
                    is Float -> ed.putFloat(k, v)
                }
            }
            ed.putBoolean("migrated_from_eclipsia", true).apply()
        }
    }

    val context: Context
        get() = appContext ?: error("NextGen Anime plugin has not been loaded yet")

    private val prefs: SharedPreferences
        get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isEnabled(scraperId: String, manifestEnabled: Boolean, defaultEnabled: Boolean = manifestEnabled): Boolean =
        manifestEnabled && prefs.getBoolean("enabled_$scraperId", defaultEnabled)

    fun setEnabled(scraperId: String, enabled: Boolean) {
        prefs.edit().putBoolean("enabled_$scraperId", enabled).apply()
    }

    fun settingsJson(scraperId: String): String = prefs.getString("settings_$scraperId", null) ?: "{}"
    fun saveSettings(scraperId: String, json: String) {
        prefs.edit().putString("settings_$scraperId", json).apply()
    }

    private const val DEFAULT_CONCURRENCY = 15
    private const val LOW_END_CONCURRENCY = 4
    const val MAX_CONCURRENCY = 48
    const val CONCURRENCY_STEP = 3

    fun defaultConcurrency(): Int {
        val c = appContext ?: return DEFAULT_CONCURRENCY
        val lowRam = runCatching {
            (c.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager).isLowRamDevice
        }.getOrDefault(false)
        val tv = runCatching {
            (c.getSystemService(Context.UI_MODE_SERVICE) as android.app.UiModeManager).currentModeType ==
                android.content.res.Configuration.UI_MODE_TYPE_TELEVISION
        }.getOrDefault(false)
        return if (lowRam || tv) LOW_END_CONCURRENCY else DEFAULT_CONCURRENCY
    }

    var concurrency: Int
        get() = prefs.getInt("concurrency", defaultConcurrency()).coerceIn(1, MAX_CONCURRENCY)
        set(value) {
            prefs.edit().putInt("concurrency", value.coerceIn(1, MAX_CONCURRENCY)).apply()
        }

    var concurrencyAuto: Boolean
        get() = prefs.getBoolean("concurrency_auto", false)
        set(value) {
            prefs.edit().putBoolean("concurrency_auto", value).apply()
        }

    const val MAX_STREAM_CAP = 100

    var totalCap: Int
        get() = prefs.getInt("cap_total", 0).coerceIn(0, MAX_STREAM_CAP)
        set(value) {
            prefs.edit().putInt("cap_total", value.coerceIn(0, MAX_STREAM_CAP)).apply()
        }

    var perProviderCapEnabled: Boolean
        get() = prefs.getBoolean("cap_per_provider", false)
        set(value) {
            prefs.edit().putBoolean("cap_per_provider", value).apply()
        }

    fun providerCap(scraperId: String): Int =
        prefs.getInt("cap_provider_$scraperId", 0).coerceIn(0, MAX_STREAM_CAP)

    fun setProviderCap(scraperId: String, value: Int) {
        prefs.edit().putInt("cap_provider_$scraperId", value.coerceIn(0, MAX_STREAM_CAP)).apply()
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

    var anilistEnabled: Boolean
        get() = prefs.getBoolean("anilist_enabled", true)
        set(value) {
            prefs.edit().putBoolean("anilist_enabled", value).apply()
        }

    var langEnglish: Boolean
        get() = prefs.getBoolean("lang_english", false)
        set(value) {
            prefs.edit().putBoolean("lang_english", value).apply()
        }

    var langMultiDub: Boolean
        get() = prefs.getBoolean("lang_multidub", false)
        set(value) {
            prefs.edit().putBoolean("lang_multidub", value).apply()
        }

    var langJapanese: Boolean
        get() = prefs.getBoolean("lang_japanese", false)
        set(value) {
            prefs.edit().putBoolean("lang_japanese", value).apply()
        }

    var customPosterTemplate: String
        get() = prefs.getString("poster_template", "") ?: ""
        set(value) {
            prefs.edit().putString("poster_template", value.trim()).apply()
        }
}
