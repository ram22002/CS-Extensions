package com.nextgenanime

import android.util.Base64
import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageData
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.ProviderType
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.SearchResponseList
import com.lagradost.cloudstream3.SubtitleFile
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.newSearchResponseList
import com.lagradost.cloudstream3.newSubtitleFile
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
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

open class NextGenAnimeProvider : MainAPI() {
    override var name = "NextGenAnime"
    override var mainUrl = "https://anilist.co"
    override var lang = "en"
    override val providerType = ProviderType.DirectProvider
    override val instantLinkLoading = true
    override val supportedTypes = setOf(TvType.Anime, TvType.AnimeMovie)
    override val hasMainPage = true
    override val hasQuickSearch = false

    override val mainPage: List<MainPageData>
        get() = NextGenAnilistApi.activeRows()

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse =
        NextGenAnilistApi.page(this, page, request)

    override suspend fun search(query: String): List<SearchResponse> =
        NextGenAnilistApi.search(this, query)

    override suspend fun search(query: String, page: Int): SearchResponseList =
        newSearchResponseList(NextGenAnilistApi.search(this, query, page), hasNext = true)

    override suspend fun load(url: String): LoadResponse? =
        NextGenAnilistDetails.loadDetails(this, url)

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit,
    ): Boolean {
        val payload = runCatching { AniListEpisodePayload.fromJson(data) }.getOrNull() ?: return false
        val mediaType = if (payload.season > 0) "tv" else "movie"

        val scrapers = NextGenRepository.active(mediaType)
        if (scrapers.isEmpty()) return false

        val found = AtomicBoolean(false)
        val seenSubtitles = Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())
        val seenLinks = Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())
        val caps = StreamCaps()
        val deadlineMs = NextGenStore.timeoutSeconds * 1000L
        suspend fun <T> withDeadline(block: suspend () -> T): T? =
            if (deadlineMs > 0) withTimeoutOrNull(deadlineMs) { block() } else block()
        withDeadline {
            coroutineScope {
                scrapers.map { scraper ->
                    async {
                        val streams = try {
                            NextGenRuntime.getStreams(scraper, payload)
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
        .replace("\uFEFF", "").replace("\u200B", "")
        .replace(Regex("\\s*[\\r\\n]+\\s*"), " • ")
        .trim()

    private fun subtitleLabel(sub: NextGenSubtitle): String =
        SubtitleLabels.label(sub.language, sub.name) { code ->
            if (code.length == 2) SubtitleHelper.fromTwoLettersToLanguage(code)
            else SubtitleHelper.fromThreeLettersToLanguage(code)
        }

    private fun qualityOf(text: String?): Int? = QualityParser.heightOf(text)
}
