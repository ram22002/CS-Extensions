package com.nextgenanime

import android.content.Context
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin

@CloudstreamPlugin
class NextGenAnimePlugin : Plugin() {
    override fun load(context: Context) {
        NextGenStore.init(context.applicationContext)
        val anyCatalog = NextGenStore.kitsuEnabled || NextGenStore.anilistEnabled
        if (NextGenStore.kitsuEnabled || !anyCatalog) registerMainAPI(NextGenKitsuProvider())
        if (NextGenStore.anilistEnabled) registerMainAPI(NextGenAnilistProvider())

        openSettings = { ctx -> NextGenSettingsUi.show(ctx) }
    }
}
