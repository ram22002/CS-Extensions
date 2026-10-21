package com.live

import com.lagradost.cloudstream3.ActorData
import com.lagradost.cloudstream3.Actor
import com.lagradost.cloudstream3.HomePageList
import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.Score
import com.lagradost.cloudstream3.SubtitleFile
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.mainPageOf
import com.lagradost.cloudstream3.newEpisode
import com.lagradost.cloudstream3.newHomePageResponse
import com.lagradost.cloudstream3.newLiveSearchResponse
import com.lagradost.cloudstream3.newLiveStreamLoadResponse
import com.lagradost.cloudstream3.newMovieLoadResponse
import com.lagradost.cloudstream3.newMovieSearchResponse
import com.lagradost.cloudstream3.newSubtitleFile
import com.lagradost.cloudstream3.newTvSeriesLoadResponse
import com.lagradost.cloudstream3.newTvSeriesSearchResponse
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.utils.ExtractorLinkType
import com.lagradost.cloudstream3.utils.Qualities
import com.lagradost.cloudstream3.utils.newDrmExtractorLink
import com.lagradost.cloudstream3.utils.newExtractorLink
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class JsProvider(
    private val source: JsSourceDef,
    private val variant: JsVariant,
) : MainAPI() {
    override var name = if (JsStore.shortNames) variant.shortName ?: variant.name else variant.name
    override var mainUrl = source.baseUrl
    override var lang = source.lang
    override val hasMainPage = variant.hasHome
    override val supportedTypes: Set<TvType> = source.types.mapNotNull { jsTvType(it) }.toSet()
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

    private suspend fun resolvePosters(items: List<JSONObject>, horizontal: Boolean = false): Map<String, String?> {
        val raw = items.mapNotNull { it.text("posterUrl") }.distinct()
        if (raw.isEmpty()) return emptyMap()
        val gate = Semaphore(JsStore.POSTER_CONCURRENCY)
        val out = coroutineScope {
            raw.map { u ->
                async(Dispatchers.IO) { u to gate.withPermit { PosterRenderer.resolve(u, horizontal = horizontal) } }
            }.awaitAll().toMap()
        }
        return out
    }

    private fun toSearch(o: JSONObject, posters: Map<String, String?>, hideTitle: Boolean = false): SearchResponse? {
        val url = o.text("url") ?: return null

        val title = if (hideTitle) " " else o.text("title") ?: " "
        val poster = o.text("posterUrl")?.let { posters[it] }
        val tvType = jsTvType(o.text("type"))
        return if (tvType == TvType.Live) {
            newLiveSearchResponse(title, url, tvType) { posterUrl = poster }
        } else if (tvType == TvType.Movie || tvType == TvType.AnimeMovie) {
            newMovieSearchResponse(title, url, tvType) { posterUrl = poster }
        } else {
            newTvSeriesSearchResponse(title, url, tvType) { posterUrl = poster }
        }
    }

    private fun JSONArray.objects(): List<JSONObject> =
        (0 until length()).mapNotNull { optJSONObject(it) }

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse? {
        if (!variant.hasHome) return null
        if (page > 1) return newHomePageResponse(emptyList<HomePageList>(), hasNext = false)
        val data = callCatalog("getHome", null)?.optJSONObject("data") ?: return null
        val trays = data.keys().asSequence().map { it to data.optJSONArray(it)?.objects().orEmpty() }
            .filter { it.second.isNotEmpty() }.toList()
        if (trays.isEmpty()) return null
        val titles = trays.map { it.first }
        JsStore.setSeenRows(source.id, variant.id, titles)
        val byTitle = trays.toMap()
        val enabled = JsStore.rowOrder(source.id, variant.id, titles)
            .filter { JsStore.rowEnabled(source.id, variant.id, it) }
        val horizontal = JsStore.horizontalPosters
        val posters = resolvePosters(enabled.flatMap { byTitle[it].orEmpty() }, horizontal)
        val shown = enabled.mapNotNull { tray ->
            val items = byTitle[tray].orEmpty().mapNotNull { toSearch(it, posters, hideTitle = true) }
            if (items.isEmpty()) null else HomePageList(tray, items, horizontal)
        }
        if (shown.isEmpty()) return null
        return newHomePageResponse(shown, hasNext = false)
    }

    override suspend fun search(query: String): List<SearchResponse>? {
        val data = callCatalog("search", query)?.optJSONArray("data") ?: return null
        val objs = data.objects()
        val posters = resolvePosters(objs)
        return objs.mapNotNull { toSearch(it, posters) }
    }

    override suspend fun load(url: String): LoadResponse? {
        val item = callCatalog("load", url)?.optJSONObject("data") ?: return null
        val title = item.text("title") ?: return null
        val tvType = jsTvType(item.text("type"))
        val isLive = tvType == TvType.Live
        val isSeries = !(isLive || tvType == TvType.Movie || tvType == TvType.AnimeMovie)

        val actorList = item.optJSONArray("cast")?.objects()?.mapNotNull { c ->
            val n = c.text("name") ?: return@mapNotNull null
            ActorData(Actor(n, c.text("image")), roleString = c.text("role"))
        }

        val relatedObjs = item.optJSONArray("recommendations")?.objects().orEmpty()
        val episodeObjs = item.optJSONArray("episodes")?.objects().orEmpty()
        val posters = resolvePosters(relatedObjs + episodeObjs)
        val rawPoster = item.text("posterUrl")
        val detailScale = JsStore.posterDetailScale
        val mainPoster = rawPoster?.let { PosterRenderer.resolve(it, detailScale, horizontal = false) }

        val backdrop = rawPoster?.let { PosterRenderer.resolve(it, detailScale, backdrop = true) }
        val related = relatedObjs.mapNotNull { toSearch(it, posters) }

        val episodes = episodeObjs.mapNotNull { e ->
            val epUrl = e.text("url") ?: return@mapNotNull null
            newEpisode(epUrl) {
                this.name = e.text("name")
                this.season = e.optInt("season", 1).takeIf { isSeries }
                this.episode = e.optInt("episode", 1).takeIf { isSeries }
                this.posterUrl = e.text("posterUrl")?.let { posters[it] }
                this.description = e.text("description")
                this.runTime = e.optInt("runtime", 0).takeIf { it > 0 }
            }
        }

        fun LoadResponse.fill() {
            posterUrl = mainPoster
            backgroundPosterUrl = backdrop ?: item.text("bannerUrl")
            plot = item.text("description")
            year = item.optInt("year", 0).takeIf { it > 0 }
            score = item.optDouble("score", 0.0).takeIf { it > 0 }?.let { Score.from10(it) }
            contentRating = item.text("contentRating")
            actors = actorList
            recommendations = related
        }

        return if (isLive) {
            val playUrl = episodes.firstOrNull()?.data ?: return null
            newLiveStreamLoadResponse(title, url, playUrl) { fill() }
        } else if (isSeries) {
            newTvSeriesLoadResponse(title, url, tvType, episodes) {
                fill()
                duration = item.optInt("duration", 0).takeIf { it > 0 }
            }
        } else {
            val playUrl = episodes.firstOrNull()?.data ?: return null
            newMovieLoadResponse(title, url, tvType, playUrl) {
                fill()
                duration = item.optInt("duration", 0).takeIf { it > 0 }
            }
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
            val label = s.text("name") ?: s.text("source") ?: name
            val quality = parseQuality(s.text("quality"))
            val kind = s.text("type")?.lowercase()
            val linkType = when {
                kind == "hls" || kind == "m3u8" -> ExtractorLinkType.M3U8
                kind == "dash" || kind == "mpd" -> ExtractorLinkType.DASH
                kind == "magnet" -> ExtractorLinkType.MAGNET
                kind == "mp4" || kind == "video" || kind == "mkv" -> ExtractorLinkType.VIDEO
                url.contains(".m3u8", ignoreCase = true) -> ExtractorLinkType.M3U8
                url.contains(".mpd", ignoreCase = true) -> ExtractorLinkType.DASH
                url.startsWith("magnet:", ignoreCase = true) -> ExtractorLinkType.MAGNET
                else -> ExtractorLinkType.VIDEO
            }

            s.optJSONArray("subtitles")?.objects()?.forEach { sub ->
                val su = sub.text("url")?.let(::normalizeUrl) ?: return@forEach
                subtitleCallback(newSubtitleFile(sub.text("language") ?: sub.text("name") ?: "Unknown", su))
            }

            val drmKey = s.text("drmKey")?.let(::toBase64Url)
            val drmKid = s.text("drmKid")?.let(::toBase64Url)
            val licenseUrl = (s.text("licenseUrl") ?: s.text("drmLicenseUrl"))?.let(::normalizeUrl)
            val drmType = s.text("drmType")?.lowercase().orEmpty()

            if (drmKey != null && drmKid != null) {
                callback(
                    newDrmExtractorLink(name, label, url, linkType, CLEARKEY_UUID) {
                        this.referer = referer
                        this.quality = quality
                        this.headers = otherHeaders
                        this.kid = drmKid
                        this.key = drmKey
                    }
                )
            } else if (licenseUrl != null && (drmType.isEmpty() || drmType.contains("widevine"))) {
                callback(
                    newDrmExtractorLink(name, label, url, linkType, WIDEVINE_UUID) {
                        this.referer = referer
                        this.quality = quality
                        this.headers = otherHeaders
                        this.licenseUrl = licenseUrl
                    }
                )
            } else {
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
            }
            found = true
        }
        return found
    }

    private fun normalizeUrl(raw: String): String? {
        var u = raw.trim().trim('"', '\'').replace("\\/", "/").replace("&amp;", "&")
        if (u.startsWith("//")) u = "https:$u"
        return u.takeIf { it.startsWith("http://", true) || it.startsWith("https://", true) || it.startsWith("magnet:", true) }
    }

    private fun toBase64Url(raw: String): String {
        val v = raw.trim()
        if (v.length % 2 != 0 || !v.matches(Regex("^[0-9a-fA-F]+$"))) return v
        val bytes = ByteArray(v.length / 2) { v.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
        return android.util.Base64.encodeToString(
            bytes,
            android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP,
        )
    }

    private fun parseQuality(q: String?): Int {
        val h = q?.let { Regex("(\\d{3,4})\\s*p?", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1)?.toIntOrNull() }
        return h ?: Qualities.Unknown.value
    }
}

private val CLEARKEY_UUID: UUID = UUID.fromString("e2719d58-a985-b3c9-781a-b030af78d30e")
private val WIDEVINE_UUID: UUID = UUID.fromString("edef8ba9-79d6-4ace-a3c8-27dcd51d21ed")

internal fun jsTvType(type: String?): TvType = when (type?.lowercase()) {
    "live", "livestream" -> TvType.Live
    "series", "tv", "tvseries", "show" -> TvType.TvSeries
    "anime" -> TvType.Anime
    "animemovie", "anime_movie" -> TvType.AnimeMovie
    "ova" -> TvType.OVA
    else -> TvType.Movie
}
