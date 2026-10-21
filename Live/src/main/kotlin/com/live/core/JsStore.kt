package com.live

import android.content.Context
import android.content.SharedPreferences

object JsStore {
    private var appContext: Context? = null

    fun init(ctx: Context) {
        appContext = ctx.applicationContext
    }

    val context: Context
        get() = appContext ?: error("PlayZ Live plugin has not been loaded yet")

    private val prefs: SharedPreferences
        get() = context.getSharedPreferences("playzlive", Context.MODE_PRIVATE)

    fun catalogEnabled(sourceId: String, variantId: String): Boolean =
        prefs.getBoolean("catalog_enabled_$sourceId:$variantId", true)

    fun setCatalogEnabled(sourceId: String, variantId: String, enabled: Boolean) {
        prefs.edit().putBoolean("catalog_enabled_$sourceId:$variantId", enabled).apply()
    }

    var shortNames: Boolean
        get() = prefs.getBoolean("short_names", false)
        set(value) { prefs.edit().putBoolean("short_names", value).apply() }

    const val PINNED_ROW = "Live Now"

    var horizontalPosters: Boolean
        get() = prefs.getBoolean("horizontal_posters", false)
        set(value) { prefs.edit().putBoolean("horizontal_posters", value).apply() }

    const val POSTER_CONCURRENCY = 3

    const val POSTER_LIST_SCALE = 2.5f
    const val POSTER_DETAIL_SCALE = 3.5f

    val posterListScale: Float get() = POSTER_LIST_SCALE
    val posterDetailScale: Float get() = POSTER_DETAIL_SCALE

    fun settingsJson(sourceId: String): String = prefs.getString("settings_$sourceId", null) ?: "{}"

    fun saveSettings(sourceId: String, json: String) {
        prefs.edit().putString("settings_$sourceId", json).apply()
    }

    fun seenRows(sourceId: String, variantId: String): List<String> =
        runCatching {
            val a = org.json.JSONArray(prefs.getString("rows_seen_$sourceId:$variantId", "[]"))
            (0 until a.length()).map { a.getString(it) }
        }.getOrDefault(emptyList())

    fun setSeenRows(sourceId: String, variantId: String, titles: List<String>) {
        prefs.edit().putString("rows_seen_$sourceId:$variantId", org.json.JSONArray(titles).toString()).apply()
    }

    fun rowEnabled(sourceId: String, variantId: String, title: String): Boolean =
        prefs.getBoolean("row_enabled_$sourceId:$variantId:$title", true)

    fun setRowEnabled(sourceId: String, variantId: String, title: String, enabled: Boolean) {
        prefs.edit().putBoolean("row_enabled_$sourceId:$variantId:$title", enabled).apply()
    }

    fun rowOrder(sourceId: String, variantId: String, defaults: List<String>): List<String> {
        val saved = runCatching {
            val a = org.json.JSONArray(prefs.getString("row_order_$sourceId:$variantId", "[]"))
            (0 until a.length()).map { a.getString(it) }
        }.getOrDefault(emptyList()).filter { it in defaults }.distinct()
        return pinFirst(saved + defaults.filter { it !in saved })
    }

    fun pinFirst(titles: List<String>): List<String> =
        if (PINNED_ROW in titles) listOf(PINNED_ROW) + titles.filter { it != PINNED_ROW } else titles

    fun setRowOrder(sourceId: String, variantId: String, titles: List<String>) {
        prefs.edit().putString("row_order_$sourceId:$variantId", org.json.JSONArray(pinFirst(titles)).toString()).apply()
    }
}
