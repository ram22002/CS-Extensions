package com.soryn

import com.lagradost.cloudstream3.ActorData
import com.lagradost.cloudstream3.Actor
import com.lagradost.cloudstream3.HomePageList
import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.LoadResponse.Companion.addImdbId
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.Score
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

    private fun toSearch(o: JSONObject): SearchResponse? {
        val url = o.text("url") ?: return null
        val title = o.text("title") ?: " "
        val poster = o.text("posterUrl")
        val tvType = jsTvType(o.text("type"))
        return if (tvType == TvType.Movie || tvType == TvType.AnimeMovie) {
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
        val tvType = jsTvType(item.text("type"))
        val isSeries = !(tvType == TvType.Movie || tvType == TvType.AnimeMovie)

        val actorList = item.optJSONArray("cast")?.objects()?.mapNotNull { c ->
            val n = c.text("name") ?: return@mapNotNull null
            ActorData(Actor(n, c.text("image")), roleString = c.text("role"))
        }

        val related = item.optJSONArray("recommendations")?.objects()?.mapNotNull { toSearch(it) }

        val episodes = item.optJSONArray("episodes")?.objects()?.mapNotNull { e ->
            val epUrl = e.text("url") ?: return@mapNotNull null
            newEpisode(epUrl) {
                this.name = e.text("name")
                this.season = e.optInt("season", 1).takeIf { isSeries }
                this.episode = e.optInt("episode", 1).takeIf { isSeries }
                this.posterUrl = e.text("posterUrl")
                this.description = e.text("description")
                this.runTime = e.optInt("runtime", 0).takeIf { it > 0 }
            }
        }.orEmpty()

        fun LoadResponse.fill() {
            posterUrl = item.text("posterUrl")
            backgroundPosterUrl = item.text("bannerUrl")
            plot = item.text("description")
            year = item.optInt("year", 0).takeIf { it > 0 }
            score = item.optDouble("score", 0.0).takeIf { it > 0 }?.let { Score.from10(it) }
            contentRating = item.text("contentRating")
            actors = actorList
            recommendations = related

            item.text("imdbId")?.takeIf { it.isNotBlank() }?.let {
                addImdbId(it)
                syncData["imdb"] = it
            }
            item.text("tmdbId")?.takeIf { it.isNotBlank() }?.let {
                syncData["tmdb"] = it
            }

            val anime = item.optJSONObject("animeTrackers")
            if (anime != null) {
                anime.text("anilistId")?.takeIf { it.isNotBlank() }?.let {
                    syncData["anilist"] = it
                    syncData["aniList"] = it
                }
                anime.text("malId")?.takeIf { it.isNotBlank() }?.let {
                    syncData["mal"] = it
                    syncData["myanimelist"] = it
                    syncData["myAnimeList"] = it
                }
                anime.text("kitsuId")?.takeIf { it.isNotBlank() }?.let {
                    syncData["kitsu"] = it
                }
                anime.text("anidbId")?.takeIf { it.isNotBlank() }?.let {
                    syncData["anidb"] = it
                }
                anime.text("animePlanet")?.takeIf { it.isNotBlank() }?.let {
                    syncData["animeplanet"] = it
                }
                anime.text("liveChartId")?.takeIf { it.isNotBlank() }?.let {
                    syncData["livechart"] = it
                }
                anime.text("crunchyrollId")?.takeIf { it.isNotBlank() }?.let {
                    syncData["crunchyroll"] = it
                }
            }
        }

        return if (isSeries) {
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
            val label = s.text("name") ?: name
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
        return u.takeIf { it.startsWith("http://", true) || it.startsWith("https://", true) || it.startsWith("magnet:", true) }
    }

    private fun parseQuality(q: String?): Int {
        val h = q?.let { Regex("(\\d{3,4})\\s*p?", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1)?.toIntOrNull() }
        return h ?: Qualities.Unknown.value
    }
}

internal fun jsTvType(type: String?): TvType = when (type?.lowercase()) {
    "series", "tv", "tvseries", "show" -> TvType.TvSeries
    "anime" -> TvType.Anime
    "animemovie", "anime_movie" -> TvType.AnimeMovie
    "ova" -> TvType.OVA
    else -> TvType.Movie
}
