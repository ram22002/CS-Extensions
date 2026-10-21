package com.live

import android.content.Context
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin

@CloudstreamPlugin
class JsPlugin : Plugin() {
    override fun load(context: Context) {
        JsStore.init(context)
        for (source in JsSources.all) {
            for (variant in source.variants) {
                if (!JsStore.catalogEnabled(source.id, variant.id)) continue
                registerMainAPI(JsProvider(source, variant))
            }
        }
        openSettings = { ctx -> PlayZSettingsUi.show(ctx) }
    }
}
