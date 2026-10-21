package com.eclipsiaanime

import android.content.Context
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin

@CloudstreamPlugin
class EclipsiaAnimePlugin : Plugin() {
    override fun load(context: Context) {
        EclipsiaStore.init(context.applicationContext)
        val anyCatalog = EclipsiaStore.kitsuEnabled || EclipsiaStore.anilistEnabled
        if (EclipsiaStore.kitsuEnabled || !anyCatalog) registerMainAPI(EclipsiaKitsuProvider())
        if (EclipsiaStore.anilistEnabled) registerMainAPI(EclipsiaAnilistProvider())

        openSettings = { ctx -> EclipsiaSettingsUi.show(ctx) }
    }
}
