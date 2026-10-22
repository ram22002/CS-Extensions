package com.nextgen.anydrama

import android.content.Context
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin

@CloudstreamPlugin
class AnyDramaPlugin : Plugin() {
    override fun load(context: Context) {
        // 1. Master all-in-one provider
        registerMainAPI(AnyDramaProvider(null, "AnyDrama"))

        // 2. Individual short drama platforms (like OTT providers in one extension)
        registerMainAPI(AnyDramaProvider("dramabox", "DramaBox"))
        registerMainAPI(AnyDramaProvider("reelshort", "ReelShort"))
        registerMainAPI(AnyDramaProvider("shortmax", "ShortMax"))
        registerMainAPI(AnyDramaProvider("goodshort", "GoodShort"))
        registerMainAPI(AnyDramaProvider("moboreels", "MoboReels"))
        registerMainAPI(AnyDramaProvider("freereels", "FreeReels"))
        registerMainAPI(AnyDramaProvider("kalostv", "Kalos TV"))
        registerMainAPI(AnyDramaProvider("netshort", "NetShort"))
        registerMainAPI(AnyDramaProvider("joyreels", "JoyReels"))
        registerMainAPI(AnyDramaProvider("flickreels", "FlickReels"))
        registerMainAPI(AnyDramaProvider("happyshort", "HappyShort"))
        registerMainAPI(AnyDramaProvider("sereal", "Sereal+"))
        registerMainAPI(AnyDramaProvider("flextv", "FlexTV"))
        registerMainAPI(AnyDramaProvider("dramawave", "DramaWave"))
    }
}
