package com.eclipsia

import android.content.Context
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin

@CloudstreamPlugin
class EclipsiaPlugin : Plugin() {
    override fun load(context: Context) {
        EclipsiaStore.init(context.applicationContext)
        if (EclipsiaStore.tmdbEnabled) registerMainAPI(EclipsiaProvider())
        val anyCatalog = EclipsiaStore.tmdbEnabled || EclipsiaStore.imdbEnabled
        if (EclipsiaStore.imdbEnabled || !anyCatalog) registerMainAPI(EclipsiaIMDbProvider())

        openSettings = { ctx -> EclipsiaSettingsUi.show(ctx) }
    }
}
