package com.nextgen.reelfren

import android.content.Context
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin
import com.nextgen.reelfren.ui.ReelFrenSettingsUi
import com.nextgen.reelfren.ui.ReelFrenStore

@CloudstreamPlugin
class ReelFrenPlugin : Plugin() {
    override fun load(context: Context) {
        ReelFrenStore.init(context)
        ReelFrenCf.appContext = context

        // 1. Master all-in-one provider (always available)
        registerMainAPI(ReelFrenProvider(null, "ReelFren"))

        // 2. Individual short drama platforms (registered if toggled on)
        for (item in ReelFrenStore.PLATFORMS) {
            if (ReelFrenStore.isEnabled(item.slug)) {
                registerMainAPI(ReelFrenProvider(item.slug, item.name))
            }
        }

        openSettings = { ctx -> ReelFrenSettingsUi.show(ctx) }
    }
}
