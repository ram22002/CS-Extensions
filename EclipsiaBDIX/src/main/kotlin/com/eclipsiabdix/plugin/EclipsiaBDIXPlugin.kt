package com.eclipsiabdix

import android.content.Context
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin

@CloudstreamPlugin
class EclipsiaBDIXPlugin : Plugin() {
    override fun load(context: Context) {
        EclipsiaStore.init(context.applicationContext)
        registerMainAPI(EclipsiaProvider())

        openSettings = { ctx -> EclipsiaSettingsUi.show(ctx) }
    }
}
