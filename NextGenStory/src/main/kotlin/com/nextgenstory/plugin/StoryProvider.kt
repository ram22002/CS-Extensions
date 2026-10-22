package com.nextgenstory

import com.lagradost.cloudstream3.ActorData
import com.lagradost.cloudstream3.Actor
import com.lagradost.cloudstream3.HomePageList
import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.SubtitleFile
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.mainPageOf
import com.lagradost.cloudstream3.newEpisode
import com.lagradost.cloudstream3.newHomePageResponse
import com.lagradost.cloudstream3.newMovieLoadResponse
import com.lagradost.cloudstream3.newMovieSearchResponse
import com.lagradost.cloudstream3.newSubtitleFile
import com.lagradost.cloudstream3.newTvSeriesLoadResponse
import com.lagradost.cloudstream3.newTvSeriesSearchResponse
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.utils.ExtractorLinkType
import com.lagradost.cloudstream3.utils.Qualities
import com.lagradost.cloudstream3.utils.newExtractorLink
import org.json.JSONArray
import org.json.JSONObject

class StoryProvider(
    private val source: JsSourceDef,
    private val variant: JsVariant,
) : MainAPI() {
    override var name = if (JsStore.shortNames) variant.shortName ?: variant.name else variant.name
    override var mainUrl = source.baseUrl
    override var lang = source.lang
    override val hasMainPage = variant.hasHome
    override val supportedTypes: Set<TvType> = setOf(TvType.TvSeries, TvType.Movie, TvType.Others)
    override val mainPage = mainPageOf("home" to "Home")

    private suspend fun callCatalog(fn: String, arg: String?): JSONObject? {
        val raw = JsRuntime.call(source, variant, JsScript.CATALOG, fn, arg) ?: return null
        val root = runCatching { JSONObject(raw) }.getOrNull() ?: return null
        return root.takeIf { it.optBoolean("success", false) }
    }

    private fun JSONObject.text(key: String): String? {
        val v = opt(key)
        if (v == null || v == JSONObject.NULL) return null
        return v.toString().trim().takeIf { it.isNotEmpty() }
    }

    private fun toSearch(o: JSONObject): SearchResponse? {
        val url = o.text("url") ?: return null
        val title = o.text("title") ?: "Drama Reel"
        val poster = o.text("posterUrl")
        return newTvSeriesSearchResponse(title, url, TvType.TvSeries) {
            posterUrl = poster
        }
    }

    private fun JSONArray.objects(): List<JSONObject> =
        (0 until length()).mapNotNull { optJSONObject(it) }

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse? {
        if (!variant.hasHome) return null
        if (page > 1) return newHomePageResponse(emptyList<HomePageList>(), hasNext = false)
        val data = callCatalog("getHome", null)?.optJSONObject("data") ?: return null
        val lists = data.keys().asSequence().mapNotNull { tray ->
            val items = data.optJSONArray(tray)?.objects()?.mapNotNull { toSearch(it) }.orEmpty()
            if (items.isEmpty()) null else HomePageList(tray, items)
        }.toList()
        if (lists.isEmpty()) return null
        val titles = lists.map { it.name }
        JsStore.setSeenRows(source.id, variant.id, titles)
        val byTitle = lists.associateBy { it.name }
        val shown = JsStore.rowOrder(source.id, variant.id, titles)
            .filter { JsStore.rowEnabled(source.id, variant.id, it) }
            .mapNotNull { byTitle[it] }
        if (shown.isEmpty()) return null
        return newHomePageResponse(shown, hasNext = false)
    }

    override suspend fun search(query: String): List<SearchResponse>? {
        val data = callCatalog("search", query)?.optJSONArray("data") ?: return null
        return data.objects().mapNotNull { toSearch(it) }
    }

    override suspend fun load(url: String): LoadResponse? {
        val item = callCatalog("load", url)?.optJSONObject("data") ?: return null
        val title = item.text("title") ?: return null
        val isSeries = true

        val actorList = item.optJSONArray("cast")?.objects()?.mapNotNull { c ->
            val n = c.text("name") ?: return@mapNotNull null
            ActorData(Actor(n, c.text("image")), roleString = c.text("role"))
        }

        val rawEps = item.optJSONArray("episodes")?.objects().orEmpty()
        val episodes = rawEps.mapIndexed { idx, ep ->
            val epNum = ep.optInt("episode", idx + 1)
            val seasonNum = ep.optInt("season", 1)
            val name = ep.text("name") ?: "Episode $epNum"
            val epUrl = ep.text("url") ?: url
            newEpisode(epUrl) {
                this.name = name
                this.season = seasonNum
                this.episode = epNum
                this.posterUrl = ep.text("posterUrl")
                this.description = ep.text("description")
                this.runTime = ep.optInt("runtime", 0).takeIf { it > 0 }
            }
        }

        val recs = item.optJSONArray("recommendations")?.objects()?.mapNotNull { toSearch(it) }

        return newTvSeriesLoadResponse(title, url, TvType.TvSeries, episodes) {
            this.posterUrl = item.text("posterUrl")
            this.backgroundPosterUrl = item.text("bannerUrl")
            this.plot = item.text("description")
            this.recommendations = recs
            this.actors = actorList
            this.duration = item.optInt("duration", 0).takeIf { it > 0 }
        }
    }

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit,
    ): Boolean {
        val raw = JsRuntime.call(source, variant, JsScript.STREAM, "loadStreams", data) ?: return false
        val root = runCatching { JSONObject(raw) }.getOrNull() ?: return false
        if (!root.optBoolean("success", false)) return false
        val streams = root.optJSONArray("data")?.objects().orEmpty()

        var found = false
        val seen = HashSet<String>()
        for (s in streams) {
            val url = s.text("url")?.let(::normalizeUrl) ?: continue
            if (!seen.add(url)) continue

            val headers = JsHeaders.sanitize(
                s.optJSONObject("headers")?.let { h ->
                    h.keys().asSequence().associateWith { k -> h.optString(k) }
                }.orEmpty()
            )
            val referer = JsHeaders.find(headers, "referer").orEmpty()
            val otherHeaders = JsHeaders.without(headers, "referer")
            val label = s.text("name") ?: name
            val quality = parseQuality(s.text("quality"))
            val kind = s.text("type")?.lowercase()
            val linkType = when {
                kind == "hls" || kind == "m3u8" -> ExtractorLinkType.M3U8
                url.contains(".m3u8", ignoreCase = true) -> ExtractorLinkType.M3U8
                else -> ExtractorLinkType.VIDEO
            }

            s.optJSONArray("subtitles")?.objects()?.forEach { sub ->
                val su = sub.text("url")?.let(::normalizeUrl) ?: return@forEach
                subtitleCallback(newSubtitleFile(sub.text("language") ?: sub.text("name") ?: "Unknown", su))
            }

            callback(
                newExtractorLink(
                    name,
                    label,
                    url,
                    linkType,
                ) {
                    this.referer = referer
                    this.quality = quality
                    this.headers = otherHeaders
                }
            )
            found = true
        }
        return found
    }

    private fun normalizeUrl(raw: String): String? {
        var u = raw.trim().trim('"', '\'').replace("\\/", "/").replace("&amp;", "&")
        if (u.startsWith("//")) u = "https:$u"
        return u.takeIf { it.startsWith("http://", true) || it.startsWith("https://", true) }
    }

    private fun parseQuality(q: String?): Int {
        val h = q?.let { Regex("(\\d{3,4})\\s*p?", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1)?.toIntOrNull() }
        return h ?: Qualities.Unknown.value
    }
}
