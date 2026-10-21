package com.nextgen

import android.content.Context
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin

@CloudstreamPlugin
class NextGenPlugin : Plugin() {
    override fun load(context: Context) {
        NextGenStore.init(context.applicationContext)
        if (NextGenStore.tmdbEnabled) registerMainAPI(NextGenProvider())
        val anyCatalog = NextGenStore.tmdbEnabled || NextGenStore.imdbEnabled
        if (NextGenStore.imdbEnabled || !anyCatalog) registerMainAPI(NextGenIMDbProvider())

        openSettings = { ctx -> NextGenSettingsUi.show(ctx) }
    }
}
