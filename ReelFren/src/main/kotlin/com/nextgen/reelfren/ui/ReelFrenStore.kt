package com.nextgen.reelfren.ui

import android.content.Context
import android.content.SharedPreferences

data class PlatformItem(
    val slug: String,
    val name: String,
    val count: String
)

object ReelFrenStore {
    private const val PREFS = "reelfren_platform_prefs"
    private const val KEY_PREFIX = "reelfren_plat_on_"

    val PLATFORMS = listOf(
        PlatformItem("dramabox", "DramaBox", "9,140+ short dramas"),
        PlatformItem("reelshort", "ReelShort", "4,760+ short dramas"),
        PlatformItem("shortmax", "ShortMax", "1,760+ short dramas"),
        PlatformItem("goodshort", "GoodShort", "3,580+ short dramas"),
        PlatformItem("moboreels", "MoboReels", "6,530+ short dramas"),
        PlatformItem("freereels", "FreeReels", "5,470+ short dramas"),
        PlatformItem("kalostv", "Kalos TV", "2,530+ short dramas"),
        PlatformItem("netshort", "NetShort", "2,310+ short dramas"),
        PlatformItem("joyreels", "JoyReels", "2,040+ short dramas"),
        PlatformItem("flickreels", "FlickReels", "1,600+ short dramas"),
        PlatformItem("happyshort", "HappyShort", "1,570+ short dramas"),
        PlatformItem("sereal", "Sereal+", "1,110+ short dramas"),
        PlatformItem("rapidtv", "RapidTV", "1,050+ short dramas"),
        PlatformItem("melolo", "Melolo", "1,000+ short dramas"),
        PlatformItem("stardusttv", "StardustTV", "840+ short dramas"),
        PlatformItem("flextv", "FlexTV", "670+ short dramas"),
        PlatformItem("flareflow", "FlareFlow", "600+ short dramas"),
        PlatformItem("dramawave", "DramaWave", "540+ short dramas"),
        PlatformItem("idrama", "iDrama", "440+ short dramas"),
        PlatformItem("playlet", "Playlet", "420+ short dramas"),
        PlatformItem("dramabite", "Dramabite", "300+ short dramas"),
        PlatformItem("dotdrama", "DotDrama", "280+ short dramas"),
        PlatformItem("shortical", "Shortical", "160+ short dramas")
    )

    private var sp: SharedPreferences? = null

    fun init(ctx: Context) {
        if (sp == null) {
            sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        }
    }

    fun isEnabled(slug: String): Boolean {
        return sp?.getBoolean("$KEY_PREFIX$slug", false) ?: false
    }

    fun setEnabled(slug: String, on: Boolean) {
        sp?.edit()?.putBoolean("$KEY_PREFIX$slug", on)?.apply()
    }

    fun setAll(on: Boolean) {
        val editor = sp?.edit() ?: return
        for (p in PLATFORMS) {
            editor.putBoolean("$KEY_PREFIX${p.slug}", on)
        }
        editor.apply()
    }
}
