package com.nextgenstory

import android.content.Context
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin

@CloudstreamPlugin
class NextGenStoryPlugin : Plugin() {
    override fun load(context: Context) {
        JsStore.init(context)
        for (source in JsSources.all) {
            for (variant in source.variants) {
                if (!JsStore.catalogEnabled(source.id, variant.id)) continue
                registerMainAPI(StoryProvider(source, variant))
            }
        }
        openSettings = { ctx -> StorySettingsUi.show(ctx) }
    }
}
