package com.nextgen.anydrama

import android.content.Context
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin
import com.nextgen.anydrama.ui.AnyDramaSettingsUi
import com.nextgen.anydrama.ui.AnyDramaStore

@CloudstreamPlugin
class AnyDramaPlugin : Plugin() {
    override fun load(context: Context) {
        AnyDramaStore.init(context)

        // 1. Master all-in-one provider (always available)
        registerMainAPI(AnyDramaProvider(null, "AnyDrama"))

        // 2. Individual short drama platforms (registered if toggled on)
        for (item in AnyDramaStore.PLATFORMS) {
            if (AnyDramaStore.isEnabled(item.slug)) {
                registerMainAPI(AnyDramaProvider(item.slug, item.name))
            }
        }

        openSettings = { ctx -> AnyDramaSettingsUi.show(ctx) }
    }
}
