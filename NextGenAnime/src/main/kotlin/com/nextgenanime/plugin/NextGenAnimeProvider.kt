package com.nextgenanime

import android.util.Base64
import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.MainPageData
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.ProviderType
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.SearchResponseList
import com.lagradost.cloudstream3.newSearchResponseList
import com.lagradost.cloudstream3.SubtitleFile
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.metaproviders.TmdbLink
import com.lagradost.cloudstream3.metaproviders.TmdbProvider
import com.lagradost.cloudstream3.newSubtitleFile
import com.lagradost.cloudstream3.utils.AppUtils.parseJson
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.utils.ExtractorLinkType
import com.lagradost.cloudstream3.utils.Qualities
import com.lagradost.cloudstream3.utils.SubtitleHelper
import com.lagradost.cloudstream3.utils.newExtractorLink
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

abstract class NextGenAnimeProvider : TmdbProvider() {
    override var mainUrl = "https://www.themoviedb.org"
    override var lang = "en"
    override val useMetaLoadResponse = true
    override val providerType = ProviderType.DirectProvider
    override val instantLinkLoading = true
    override val supportedTypes = setOf(TvType.Movie, TvType.TvSeries)
    override val hasMainPage = true
    private class Target(val tmdbId: String, val season: Int?, val episode: Int?, val isTv: Boolean)

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit,
    ): Boolean {
        val link = runCatching { parseJson<TmdbLink>(data) }.getOrNull() ?: return false
        val target = resolveTarget(link) ?: return false

        if (target.isTv && (target.season == null || target.episode == null)) return false
        val mediaType = if (target.isTv) "tv" else "movie"

        val scrapers = NextGenRepository.active(mediaType)
        if (scrapers.isEmpty()) return false

        val found = AtomicBoolean(false)
        val seenSubtitles = ConcurrentHashMap.newKeySet<String>()
        val seenLinks = ConcurrentHashMap.newKeySet<String>()
        val caps = StreamCaps()
        val deadlineMs = NextGenStore.timeoutSeconds * 1000L
        suspend fun <T> withDeadline(block: suspend () -> T): T? =
            if (deadlineMs > 0) withTimeoutOrNull(deadlineMs) { block() } else block()
        withDeadline {
        coroutineScope {
            scrapers.map { scraper ->
                async {
                    val streams = try {
                        NextGenRuntime.getStreams(scraper, target.tmdbId, mediaType, target.season, target.episode)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Exception) {
                        emptyList()
                    }
                    streams.map { stream ->
                        async {
                            try {
                                emit(scraper, stream, seenSubtitles, seenLinks, caps, subtitleCallback, callback)
                                found.set(true)
                            } catch (e: CancellationException) {
                                throw e
                            } catch (_: Exception) {
                            }
                        }
                    }.awaitAll()
                }
            }.awaitAll()
        }
        }
        return found.get()
    }

    private suspend fun resolveTarget(link: TmdbLink): Target? {
        val season = link.season
        val episode = link.episode
        val tvHint = season != null || episode != null

        link.tmdbID?.let { return Target(it.toString(), season, episode, tvHint) }

        val imdb = link.imdbID?.trim()?.takeIf { it.startsWith("tt") } ?: return null
        val text = NextGenTmdb.get("find/$imdb?external_source=imdb_id", ttlMs = 60 * 60 * 1000L) ?: return null
        val root = runCatching { JSONObject(text) }.getOrNull() ?: return null
        fun first(key: String): JSONObject? = root.optJSONArray(key)?.optJSONObject(0)

        first("tv_episode_results")?.let { ep ->
            val show = ep.optInt("show_id", 0)
            if (show > 0) {
                return Target(
                    show.toString(),
                    season ?: ep.optInt("season_number", -1).takeIf { it >= 0 },
                    episode ?: ep.optInt("episode_number", -1).takeIf { it >= 0 },
                    true,
                )
            }
        }
        val order = if (tvHint) listOf("tv_results" to true, "movie_results" to false)
        else listOf("movie_results" to false, "tv_results" to true)
        for ((key, tv) in order) {
            val id = first(key)?.optInt("id", 0) ?: 0
            if (id > 0) return Target(id.toString(), season, episode, tv)
        }
        return null
    }

    private suspend fun emit(
        scraper: NextGenScraper,
        stream: NextGenStream,
        seenSubtitles: MutableSet<String>,
        seenLinks: MutableSet<String>,
        caps: StreamCaps,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit,
    ) {
        if (caps.full(scraper.id)) return
        if (!LanguageFilter.allows(stream)) return

        for (sub in stream.subtitles) {
            if (!seenSubtitles.add(sub.url)) continue
            subtitleCallback(newSubtitleFile(subtitleLabel(sub), sub.url) {
                if (sub.headers.isNotEmpty()) headers = sub.headers
            })
        }

        if (!seenLinks.add(stream.url)) return

        val label = clean(stream.name ?: stream.title).ifBlank { scraper.name }
        val detail = listOfNotNull(stream.size, stream.language).joinToString(" · ")
        val display = if (detail.isBlank()) label else "$label · $detail"

        val referer = HeaderRules.find(stream.headers, "referer").orEmpty()
        val otherHeaders = HeaderRules.without(stream.headers, "referer").let { h ->
            if (HeaderRules.find(h, "user-agent") != null) h else h + ("User-Agent" to NextGenHttp.DEFAULT_UA)
        }

        var quality = qualityOf(stream.quality) ?: qualityOf(label)

        var playUrl = stream.url
        var inlinePlaylist = false
        DataUrls.parsePlaylist(stream.url)?.let { payload ->
            val text = try {
                if (payload.base64) String(Base64.decode(payload.data, Base64.DEFAULT), Charsets.UTF_8)
                else DataUrls.decodePlain(payload.data)
            } catch (_: Exception) {
                return
            }
            if (!text.trimStart().startsWith("#EXTM3U")) return
            if (quality == null) quality = MediaKinds.maxHlsHeight(text)
            playUrl = NextGenLocalServer.publishResolved(text)
            inlinePlaylist = true
        }

        var kind = if (inlinePlaylist) MediaKind.HLS
        else MediaKinds.fromHint(stream.type) ?: MediaKinds.fromUrl(stream.url)
        val needsProbe = !inlinePlaylist && kind != MediaKind.MAGNET && kind != MediaKind.TORRENT
        if (needsProbe) {
            val probeHeaders = if (referer.isNotEmpty()) otherHeaders + ("Referer" to referer) else otherHeaders
            val probed = NextGenProbe.probe(stream.url, probeHeaders)
            if (probed != null) {
                if (probed.dead) return
                if (probed.kind != null && (kind == null || probed.sure)) kind = probed.kind
                if (quality == null && probed.kind == MediaKind.HLS) quality = probed.height
            }
        }

        if (!caps.claim(scraper.id)) return

        callback(
            newExtractorLink(scraper.name, display, playUrl, linkType(kind)) {
                this.referer = referer
                this.quality = quality ?: Qualities.Unknown.value
                this.headers = otherHeaders
            }
        )
    }

    private fun linkType(kind: MediaKind?): ExtractorLinkType? = when (kind) {
        MediaKind.HLS -> ExtractorLinkType.M3U8
        MediaKind.DASH -> ExtractorLinkType.DASH
        MediaKind.PROGRESSIVE -> ExtractorLinkType.VIDEO
        MediaKind.MAGNET -> ExtractorLinkType.MAGNET
        MediaKind.TORRENT -> enumOrNull("TORRENT") ?: ExtractorLinkType.MAGNET
        MediaKind.SMOOTH -> enumOrNull("ISM") ?: ExtractorLinkType.VIDEO
        null -> null
    }

    private fun enumOrNull(name: String): ExtractorLinkType? =
        runCatching { ExtractorLinkType.valueOf(name) }.getOrNull()

    private fun clean(s: String?): String = s.orEmpty()
        .replace("﻿", "").replace("​", "")
        .replace(Regex("\\s*[\\r\\n]+\\s*"), " • ")
        .trim()

    private fun subtitleLabel(sub: NextGenSubtitle): String =
        SubtitleLabels.label(sub.language, sub.name) { code ->
            if (code.length == 2) SubtitleHelper.fromTwoLettersToLanguage(code)
            else SubtitleHelper.fromThreeLettersToLanguage(code)
        }

    private fun qualityOf(text: String?): Int? = QualityParser.heightOf(text)
}
