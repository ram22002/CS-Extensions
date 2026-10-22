package com.nextgen.anydrama

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.utils.ExtractorLinkType
import com.lagradost.cloudstream3.utils.Qualities
import com.lagradost.cloudstream3.utils.newExtractorLink
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

open class AnyDramaProvider(
    private val providerSlug: String? = null,
    providerName: String = "AnyDrama"
) : MainAPI() {
    override var name = providerName
    override var mainUrl = "https://any-drama.com"
    override var lang = "en"
    override val hasMainPage = true
    override val supportedTypes: Set<TvType> = setOf(TvType.AsianDrama, TvType.TvSeries, TvType.Movie, TvType.Others)
    override val mainPage = mainPageOf("home" to "Home")

    companion object {
        private const val API_BASE = "https://api.any-drama.com"
        private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        private val HTTP_HEADERS = mapOf(
            "User-Agent" to USER_AGENT,
            "Referer" to "https://any-drama.com/"
        )
    }

    private fun toSearch(o: JSONObject): SearchResponse? {
        val slug = o.optString("slug").takeIf { it.isNotEmpty() } ?: return null
        val title = o.optString("title").takeIf { it.isNotEmpty() } ?: "Short Drama"
        val poster = o.optString("poster").takeIf { it.isNotEmpty() }
        val url = "https://any-drama.com/en/watch/$slug"
        return newTvSeriesSearchResponse(title, url, TvType.AsianDrama) {
            this.posterUrl = poster
        }
    }

    private suspend fun fetchDramas(endpoint: String): List<SearchResponse> {
        return try {
            val res = app.get(endpoint, headers = HTTP_HEADERS).text
            val json = JSONObject(res)
            val items = json.optJSONArray("items") ?: return emptyList()
            (0 until items.length()).mapNotNull { idx ->
                items.optJSONObject(idx)?.let { toSearch(it) }
            }
        } catch (e: Throwable) {
            emptyList()
        }
    }

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse? {
        if (page > 1) return newHomePageResponse(emptyList<HomePageList>(), hasNext = false)

        val lists = mutableListOf<HomePageList>()

        if (providerSlug == null) {
            // Master aggregated provider
            val sections = listOf(
                null to ("🔥 Trending Now" to "$API_BASE/api/catalog/dramas?sort=popular&limit=24"),
                null to ("✨ Latest Releases" to "$API_BASE/api/catalog/dramas?sort=updated&limit=24"),
                "dramabox" to ("👑 DramaBox Hits" to "$API_BASE/api/catalog/dramas?provider=dramabox&sort=popular&limit=20"),
                "reelshort" to ("🎬 ReelShort Hits" to "$API_BASE/api/catalog/dramas?provider=reelshort&sort=popular&limit=20"),
                "shortmax" to ("⚡ ShortMax Hits" to "$API_BASE/api/catalog/dramas?provider=shortmax&sort=popular&limit=20"),
                "goodshort" to ("💎 GoodShort Hits" to "$API_BASE/api/catalog/dramas?provider=goodshort&sort=popular&limit=20"),
                "moboreels" to ("📱 MoboReels Hits" to "$API_BASE/api/catalog/dramas?provider=moboreels&sort=popular&limit=20"),
                "freereels" to ("🌟 FreeReels Hits" to "$API_BASE/api/catalog/dramas?provider=freereels&sort=popular&limit=20"),
                "kalostv" to ("🍿 Kalos TV Hits" to "$API_BASE/api/catalog/dramas?provider=kalostv&sort=popular&limit=20"),
                "netshort" to ("📽️ NetShort Hits" to "$API_BASE/api/catalog/dramas?provider=netshort&sort=popular&limit=20"),
                "joyreels" to ("🎭 JoyReels Hits" to "$API_BASE/api/catalog/dramas?provider=joyreels&sort=popular&limit=20"),
                null to ("💰 Billionaire & CEO" to "$API_BASE/api/catalog/dramas?genre=billionaire&limit=20"),
                null to ("❤️ Romance & Love" to "$API_BASE/api/catalog/dramas?genre=romance&limit=20"),
                null to ("⚔️ Revenge & Karma" to "$API_BASE/api/catalog/dramas?genre=revenge&limit=20"),
                null to ("🐺 Werewolf & Lycan" to "$API_BASE/api/catalog/dramas?genre=werewolf&limit=20")
            )

            for ((_, pair) in sections) {
                val (title, url) = pair
                val items = fetchDramas(url)
                if (items.isNotEmpty()) {
                    lists.add(HomePageList(title, items))
                }
            }
        } else {
            // Platform specific provider
            val pName = name
            val sections = listOf(
                "🔥 Popular on $pName" to "$API_BASE/api/catalog/dramas?provider=$providerSlug&sort=popular&limit=24",
                "✨ Latest on $pName" to "$API_BASE/api/catalog/dramas?provider=$providerSlug&sort=updated&limit=24",
                "📚 Long Series on $pName" to "$API_BASE/api/catalog/dramas?provider=$providerSlug&sort=episodes&limit=24",
                "❤️ Romance" to "$API_BASE/api/catalog/dramas?provider=$providerSlug&genre=romance&limit=20",
                "⚔️ Revenge" to "$API_BASE/api/catalog/dramas?provider=$providerSlug&genre=revenge&limit=20",
                "💰 Billionaire & CEO" to "$API_BASE/api/catalog/dramas?provider=$providerSlug&genre=billionaire&limit=20"
            )

            for ((title, url) in sections) {
                val items = fetchDramas(url)
                if (items.isNotEmpty()) {
                    lists.add(HomePageList(title, items))
                }
            }
        }

        if (lists.isEmpty()) return null
        return newHomePageResponse(lists, hasNext = false)
    }

    override suspend fun search(query: String): List<SearchResponse>? {
        val q = URLEncoder.encode(query.trim(), "UTF-8")
        val url = if (providerSlug != null) {
            "$API_BASE/api/catalog/dramas?q=$q&provider=$providerSlug&limit=30"
        } else {
            "$API_BASE/api/catalog/dramas?q=$q&limit=30"
        }
        val items = fetchDramas(url)
        return items.ifEmpty { null }
    }

    override suspend fun load(url: String): LoadResponse? {
        val slug = url.trimEnd('/').substringAfterLast("/").substringBefore("?")
        if (slug.isEmpty()) return null

        val watchUrl = "https://any-drama.com/en/watch/$slug"
        val html = try {
            app.get(watchUrl, headers = HTTP_HEADERS).text
        } catch (e: Throwable) {
            return null
        }

        var title: String? = null
        var description: String? = null
        var poster: String? = null
        val genres = mutableListOf<String>()

        // 1. Try to extract from schema.org JSON-LD
        val ldPattern = Regex("""<script[^>]*type=["']application/ld\+json["'][^>]*>(.*?)</script>""", RegexOption.DOT_MATCHES_ALL)
        for (m in ldPattern.findAll(html)) {
            val block = m.groupValues[1]
            try {
                val ld = JSONObject(block)
                if (ld.optString("@type") == "TVSeries") {
                    title = ld.optString("name").takeIf { it.isNotEmpty() }
                    description = ld.optString("description").takeIf { it.isNotEmpty() }
                    poster = ld.optString("image").takeIf { it.isNotEmpty() }
                    val gArr = ld.optJSONArray("genre")
                    if (gArr != null) {
                        for (i in 0 until gArr.length()) {
                            genres.add(gArr.optString(i))
                        }
                    }
                    break
                }
            } catch (_: Throwable) {}
        }

        if (title == null) {
            val titleMatch = Regex("""<title>([^<]+)</title>""", RegexOption.IGNORE_CASE).find(html)
            title = titleMatch?.groupValues?.get(1)?.substringBefore(" short drama")?.trim()
                ?: slug.replace("-", " ").replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        }
        if (description == null) {
            val descMatch = Regex("""<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']""", RegexOption.IGNORE_CASE).find(html)
            description = descMatch?.groupValues?.get(1)?.trim()
        }

        // 2. Extract episodes list
        // Pattern matches: "(\d+)",{"className":"dr-ep","href":"[^"]*?/(\d+)"
        val epPattern = Regex("""(?:\\"|")(\d+)(?:\\"|"),\{(?:\\"|")className(?:\\"|"):(?:\\"|")dr-ep(?:\\"|"),(?:\\"|")href(?:\\"|"):(?:\\"|")[^"]*?/(\d+)(?:\\"|")""")
        val foundEps = epPattern.findAll(html).map {
            val epId = it.groupValues[1]
            val epNum = it.groupValues[2].toIntOrNull() ?: 1
            epId to epNum
        }.toList()

        val episodeItems = if (foundEps.isNotEmpty()) {
            foundEps.distinctBy { it.second }.sortedBy { it.second }.map { (epId, epNum) ->
                newEpisode("$slug|$epId|$epNum") {
                    this.name = "Episode $epNum"
                    this.episode = epNum
                    this.season = 1
                }
            }
        } else {
            // Fallback for single episode
            val singleMatch = Regex("""(?:\\"|")episodeId(?:\\"|"):\s*(\d+)""").find(html)
            val epId = singleMatch?.groupValues?.get(1) ?: slug
            listOf(
                newEpisode("$slug|$epId|1") {
                    this.name = "Episode 1"
                    this.episode = 1
                    this.season = 1
                }
            )
        }

        return newTvSeriesLoadResponse(title, url, TvType.AsianDrama, episodeItems) {
            this.posterUrl = poster
            this.plot = description
            this.tags = genres
        }
    }

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit
    ): Boolean {
        val parts = data.split("|")
        val epId = if (parts.size >= 2) parts[1] else parts[0]
        if (epId.isEmpty()) return false

        return try {
            val playUrl = "$API_BASE/api/play/$epId"
            val res = app.get(playUrl, headers = HTTP_HEADERS).text
            val json = JSONObject(res)
            val streamUrl = json.optString("url")
            if (streamUrl.isEmpty()) return false

            val format = json.optString("format", "mp4").lowercase()
            val isHls = format == "hls" || streamUrl.contains(".m3u8")

            callback.invoke(
                newExtractorLink(
                    source = name,
                    name = "$name • 9:16 Vertical Reel",
                    url = streamUrl,
                    type = if (isHls) ExtractorLinkType.M3U8 else ExtractorLinkType.VIDEO
                ) {
                    this.referer = "https://any-drama.com/"
                    this.quality = Qualities.P720.value
                }
            )

            val subs = json.optJSONArray("subtitles")
            if (subs != null) {
                for (i in 0 until subs.length()) {
                    val s = subs.optJSONObject(i) ?: continue
                    val lang = s.optString("lang").ifEmpty { "Subtitle" }
                    val subUrl = s.optString("url")
                    if (subUrl.isNotEmpty()) {
                        subtitleCallback.invoke(newSubtitleFile(lang, subUrl))
                    }
                }
            }
            true
        } catch (e: Throwable) {
            false
        }
    }
}
