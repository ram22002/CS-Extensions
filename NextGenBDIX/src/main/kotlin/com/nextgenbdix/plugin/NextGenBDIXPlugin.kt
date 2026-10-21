package com.nextgenbdix

import android.content.Context
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin

@CloudstreamPlugin
class NextGenBDIXPlugin : Plugin() {
    override fun load(context: Context) {
        NextGenStore.init(context.applicationContext)
        registerMainAPI(NextGenProvider())

        openSettings = { ctx -> NextGenSettingsUi.show(ctx) }
    }
}
