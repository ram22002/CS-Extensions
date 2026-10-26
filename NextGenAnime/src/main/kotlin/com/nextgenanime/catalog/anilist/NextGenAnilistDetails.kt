package com.nextgenanime

import com.lagradost.cloudstream3.Actor
import com.lagradost.cloudstream3.ActorData
import com.lagradost.cloudstream3.AnimeSearchResponse
import com.lagradost.cloudstream3.Episode
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.LoadResponse.Companion.addTrailer
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.Score
import com.lagradost.cloudstream3.SeasonData
import com.lagradost.cloudstream3.ShowStatus
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.app
import com.lagradost.cloudstream3.newAnimeSearchResponse
import com.lagradost.cloudstream3.newEpisode
import com.lagradost.cloudstream3.newMovieLoadResponse
import com.lagradost.cloudstream3.newTvSeriesLoadResponse
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

object NextGenAnilistDetails {

    private val mediaCache = ConcurrentHashMap<Int, AniListMedia>()
    private val aniZipCache = ConcurrentHashMap<Int, AniZipData>()
    private val EP_RE = Regex("""^\s*(?:episode|ep\.?|e)\s*(\d+)\s*(?:[-:–—]\s*(.*))?$""", RegexOption.IGNORE_CASE)

    data class AniZipEpisode(
        val title: String?,
        val image: String?,
        val summary: String?
    )

    data class AniZipData(
        val episodeCount: Int,
        val episodes: Map<Int, AniZipEpisode>
    )

    private const val FULL_MEDIA_QUERY = """
        query(${'$'}id: Int) {
          Media(id: ${'$'}id, type: ANIME) {
            id
            idMal
            format
            status
            description(asHtml: false)
            startDate { year }
            season
            seasonYear
            episodes
            duration
            isAdult
            genres
            synonyms
            averageScore
            meanScore
            title {
              romaji
              english
              native
              userPreferred
            }
            coverImage {
              extraLarge
              large
              medium
              color
            }
            bannerImage
            trailer {
              id
              site
            }
            relations {
              edges {
                relationType
                node {
                  id
                  format
                  type
                  title {
                    userPreferred
                    english
                    romaji
                  }
                  coverImage {
                    large
                  }
                }
              }
            }
            streamingEpisodes {
              title
              thumbnail
              url
              site
            }
            nextAiringEpisode {
              airingAt
              timeUntilAiring
              episode
            }
            characters(sort: ROLE, perPage: 12) {
              edges {
                role
                node {
                  name { full }
                  image { medium }
                }
              }
            }
            recommendations(perPage: 10, sort: RATING_DESC) {
              nodes {
                mediaRecommendation {
                  id
                  title { userPreferred english romaji }
                  coverImage { large }
                  format
                }
              }
            }
          }
        }
    """

    fun parseMedia(o: JSONObject): AniListMedia {
        val id = o.getInt("id")
        val idMal = o.optInt("idMal", 0).takeIf { it > 0 }
        val format = o.optString("format", "TV").takeIf { it.isNotBlank() }
        val status = o.optString("status", "").takeIf { it.isNotBlank() }
        val description = o.optString("description", "").takeIf { it.isNotBlank() }
        val startDateYear = o.optJSONObject("startDate")?.optInt("year", 0)?.takeIf { it > 0 }
        val season = o.optString("season", "").takeIf { it.isNotBlank() }
        val seasonYear = o.optInt("seasonYear", 0).takeIf { it > 0 }
        val episodes = o.optInt("episodes", 0).takeIf { it > 0 }
        val duration = o.optInt("duration", 0).takeIf { it > 0 }
        val isAdult = o.optBoolean("isAdult", false)

        val genres = mutableListOf<String>()
        o.optJSONArray("genres")?.let { arr ->
            for (i in 0 until arr.length()) arr.optString(i)?.takeIf { it.isNotBlank() }?.let(genres::add)
        }

        val synonyms = mutableListOf<String>()
        o.optJSONArray("synonyms")?.let { arr ->
            for (i in 0 until arr.length()) arr.optString(i)?.takeIf { it.isNotBlank() }?.let(synonyms::add)
        }

        val averageScore = o.optInt("averageScore", 0).takeIf { it > 0 }
        val meanScore = o.optInt("meanScore", 0).takeIf { it > 0 }

        val titleObj = o.optJSONObject("title")
        val title = AniListTitle(
            romaji = titleObj?.optString("romaji")?.takeIf { it.isNotBlank() },
            english = titleObj?.optString("english")?.takeIf { it.isNotBlank() },
            native = titleObj?.optString("native")?.takeIf { it.isNotBlank() },
            userPreferred = titleObj?.optString("userPreferred")?.takeIf { it.isNotBlank() },
        )

        val coverObj = o.optJSONObject("coverImage")
        val coverImage = AniListCoverImage(
            extraLarge = coverObj?.optString("extraLarge")?.takeIf { it.isNotBlank() },
            large = coverObj?.optString("large")?.takeIf { it.isNotBlank() },
            medium = coverObj?.optString("medium")?.takeIf { it.isNotBlank() },
            color = coverObj?.optString("color")?.takeIf { it.isNotBlank() },
        )

        val bannerImage = o.optString("bannerImage", "").takeIf { it.isNotBlank() }

        val trailerObj = o.optJSONObject("trailer")
        val trailerYoutubeId = if (trailerObj?.optString("site") == "youtube") {
            trailerObj.optString("id").takeIf { it.isNotBlank() }
        } else null

        val relations = mutableListOf<AniListEdge>()
        o.optJSONObject("relations")?.optJSONArray("edges")?.let { arr ->
            for (i in 0 until arr.length()) {
                val edge = arr.optJSONObject(i) ?: continue
                val relType = edge.optString("relationType", "")
                val node = edge.optJSONObject("node") ?: continue
                val nodeId = node.optInt("id", 0).takeIf { it > 0 } ?: continue
                val nodeFormat = node.optString("format", "").takeIf { it.isNotBlank() }
                val nodeType = node.optString("type", "ANIME")
                val nodeTitle = node.optJSONObject("title")?.let {
                    it.optString("userPreferred").takeIf { s -> s.isNotBlank() }
                        ?: it.optString("english").takeIf { s -> s.isNotBlank() }
                        ?: it.optString("romaji").takeIf { s -> s.isNotBlank() }
                }
                val nodeCover = node.optJSONObject("coverImage")?.optString("large")?.takeIf { it.isNotBlank() }
                relations.add(AniListEdge(relType, nodeId, nodeFormat, nodeType, nodeTitle, nodeCover))
            }
        }

        val streamingEpisodes = mutableListOf<AniListStreamingEpisode>()
        o.optJSONArray("streamingEpisodes")?.let { arr ->
            for (i in 0 until arr.length()) {
                val ep = arr.optJSONObject(i) ?: continue
                streamingEpisodes.add(
                    AniListStreamingEpisode(
                        title = ep.optString("title").takeIf { it.isNotBlank() },
                        thumbnail = ep.optString("thumbnail").takeIf { it.isNotBlank() },
                        url = ep.optString("url").takeIf { it.isNotBlank() },
                        site = ep.optString("site").takeIf { it.isNotBlank() }
                    )
                )
            }
        }

        val nextObj = o.optJSONObject("nextAiringEpisode")
        val nextAiring = if (nextObj != null) {
            AniListNextAiring(
                airingAt = nextObj.optLong("airingAt", 0L).takeIf { it > 0L },
                timeUntilAiring = nextObj.optLong("timeUntilAiring", 0L).takeIf { it > 0L },
                episode = nextObj.optInt("episode", 0).takeIf { it > 0 }
            )
        } else null

        return AniListMedia(
            id = id,
            idMal = idMal,
            title = title,
            format = format,
            status = status,
            description = description,
            startDateYear = startDateYear,
            season = season,
            seasonYear = seasonYear,
            episodes = episodes,
            duration = duration,
            isAdult = isAdult,
            genres = genres,
            synonyms = synonyms,
            averageScore = averageScore,
            meanScore = meanScore,
            coverImage = coverImage,
            bannerImage = bannerImage,
            trailerYoutubeId = trailerYoutubeId,
            relations = relations,
            streamingEpisodes = streamingEpisodes,
            nextAiring = nextAiring
        )
    }

    suspend fun fetchMedia(id: Int): AniListMedia? {
        mediaCache[id]?.let { return it }
        val data = NextGenAnilistMeta.query(FULL_MEDIA_QUERY, JSONObject().put("id", id))
        val mediaObj = data?.optJSONObject("Media") ?: return null
        return parseMedia(mediaObj).also {
            if (mediaCache.size < 300) mediaCache[id] = it
        }
    }

    suspend fun fetchAniZipEpisodes(anilistId: Int): AniZipData? {
        aniZipCache[anilistId]?.let { return it }
        return try {
            val resp = app.get(
                "https://api.ani.zip/mappings?anilist_id=$anilistId",
                headers = mapOf("User-Agent" to "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
                timeout = 5_000L
            )
            if (resp.code !in 200..299) return null
            val json = JSONObject(resp.text)
            val epCount = json.optInt("episodeCount", 0)
            val epObj = json.optJSONObject("episodes")
            val epMap = mutableMapOf<Int, AniZipEpisode>()
            if (epObj != null) {
                val keys = epObj.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val num = key.toIntOrNull() ?: continue
                    val item = epObj.optJSONObject(key) ?: continue
                    val titleObj = item.optJSONObject("title")
                    val title = titleObj?.optString("en")?.takeIf { it.isNotBlank() }
                        ?: titleObj?.optString("x-jat")?.takeIf { it.isNotBlank() }
                        ?: titleObj?.optString("ja")?.takeIf { it.isNotBlank() }
                        ?: item.optString("name").takeIf { it.isNotBlank() }
                    val image = item.optString("image").takeIf { it.isNotBlank() }
                    val summary = item.optString("summary").takeIf { it.isNotBlank() }
                    epMap[num] = AniZipEpisode(title, image, summary)
                }
            }
            AniZipData(epCount, epMap).also {
                if (aniZipCache.size < 200) aniZipCache[anilistId] = it
            }
        } catch (_: Throwable) {
            null
        }
    }

    suspend fun buildTvSeriesResponse(
        api: MainAPI,
        rootMedia: AniListMedia,
        seasons: List<AniListMedia>,
        streamingEps: Map<Int, List<AniListStreamingEpisode>> = emptyMap(),
        charactersObj: JSONObject? = null,
        recommendationsArr: JSONArray? = null
    ): LoadResponse {
        val seasonDataList = mutableListOf<SeasonData>()
        val allEpisodes = mutableListOf<Episode>()

        seasons.forEachIndexed { index, seasonMedia ->
            val seasonNo = index + 1
            val seasonLabel = if (seasons.size == 1) {
                "Season 1"
            } else {
                val name = seasonMedia.title.best()
                if (name.isNotBlank()) name else "Season $seasonNo"
            }

            seasonDataList.add(SeasonData(seasonNo, seasonLabel, seasonNo))

            val streamingEpsByNumber = mutableMapOf<Int, AniListStreamingEpisode>()
            val epList = streamingEps[seasonMedia.id]
                ?: seasonMedia.streamingEpisodes.takeIf { it.isNotEmpty() }

            epList?.forEachIndexed { i, strEp ->
                val rawTitle = strEp.title.orEmpty()
                val match = EP_RE.find(rawTitle)
                val epNo = match?.groupValues?.get(1)?.toIntOrNull() ?: (i + 1)
                streamingEpsByNumber[epNo] = strEp
            }

            var totalCount = seasonMedia.episodes ?: 0
            if (totalCount <= 0 && seasonMedia.nextAiring?.episode != null && seasonMedia.nextAiring.episode > 1) {
                totalCount = seasonMedia.nextAiring.episode - 1
            }

            val aniZipEpData = fetchAniZipEpisodes(seasonMedia.id)
            if (aniZipEpData != null && aniZipEpData.episodeCount > 0) {
                totalCount = maxOf(totalCount, aniZipEpData.episodeCount)
            }
            if (totalCount <= 0 && streamingEpsByNumber.isNotEmpty()) {
                totalCount = streamingEpsByNumber.keys.maxOrNull() ?: 0
            }
            if (totalCount <= 0) {
                totalCount = 1
            }

            for (epNo in 1..totalCount) {
                val strEp = streamingEpsByNumber[epNo]
                val aniZipEp = aniZipEpData?.episodes?.get(epNo)

                val epTitle = strEp?.let {
                    val raw = it.title.orEmpty()
                    val match = EP_RE.find(raw)
                    match?.groupValues?.get(2)?.trim()?.takeIf { t -> t.isNotEmpty() }
                        ?: raw.takeIf { t -> t.isNotBlank() }
                } ?: aniZipEp?.title
                  ?: "Episode $epNo"

                val epThumb = strEp?.thumbnail
                    ?: aniZipEp?.image
                    ?: seasonMedia.bannerImage
                    ?: seasonMedia.coverImage?.best()

                val payload = AniListEpisodePayload(
                    anilistId = seasonMedia.id,
                    malId = seasonMedia.idMal,
                    season = seasonNo,
                    episode = epNo,
                    title = epTitle,
                    showTitle = rootMedia.title.best(),
                    romajiTitle = seasonMedia.title.romaji
                )

                allEpisodes.add(
                    api.newEpisode(payload.toJson()) {
                        name = epTitle
                        season = seasonNo
                        episode = epNo
                        posterUrl = epThumb
                        description = aniZipEp?.summary
                    }
                )
            }
        }

        val mainTitle = rootMedia.title.best()
        val mainUrl = "https://anilist.co/anime/${rootMedia.id}"

        return api.newTvSeriesLoadResponse(mainTitle, mainUrl, TvType.Anime, allEpisodes) {
            posterUrl = rootMedia.coverImage?.best()
            backgroundPosterUrl = rootMedia.bannerImage ?: rootMedia.coverImage?.best()
            year = rootMedia.startDateYear ?: rootMedia.seasonYear
            plot = NextGenAnilistMeta.cleanDescription(rootMedia.description)
            tags = rootMedia.genres
            score = rootMedia.averageScore?.let { Score.from10(it / 10.0) }
            showStatus = when (rootMedia.status) {
                "FINISHED" -> ShowStatus.Completed
                else -> ShowStatus.Ongoing
            }
            if (seasonDataList.size > 1) {
                seasonNames = seasonDataList
            }

            // AniList and MyAnimeList trackers
            val aniStr = rootMedia.id.toString()
            syncData["anilist"] = aniStr
            syncData["aniList"] = aniStr
            rootMedia.idMal?.let {
                val malStr = it.toString()
                syncData["myanimelist"] = malStr
                syncData["myAnimeList"] = malStr
                syncData["mal"] = malStr
            }

            if (rootMedia.trailerYoutubeId != null) {
                addTrailer("https://www.youtube.com/watch?v=${rootMedia.trailerYoutubeId}")
            }

            // Characters / Actors if available
            charactersObj?.optJSONArray("edges")?.let { arr ->
                val actorList = mutableListOf<ActorData>()
                for (i in 0 until arr.length()) {
                    val edge = arr.optJSONObject(i) ?: continue
                    val role = edge.optString("role", "")
                    val node = edge.optJSONObject("node") ?: continue
                    val name = node.optJSONObject("name")?.optString("full") ?: continue
                    val image = node.optJSONObject("image")?.optString("medium")
                    actorList.add(ActorData(Actor(name, image), roleString = role))
                }
                actors = actorList
            }

            val recList = mutableListOf<AnimeSearchResponse>()

            // 1. Related media (Sequels, Prequels, Side Stories, etc.)
            rootMedia.relations.filter { it.type == "ANIME" && !it.title.isNullOrBlank() }.forEach { rel ->
                val isMovie = rel.format.equals("MOVIE", true)
                val typeLabel = rel.relationType.replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() }
                recList.add(
                    api.newAnimeSearchResponse(
                        "${rel.title} ($typeLabel)",
                        "https://anilist.co/anime/${rel.id}",
                        if (isMovie) TvType.AnimeMovie else TvType.Anime
                    ) {
                        posterUrl = rel.posterUrl
                    }
                )
            }

            // 2. AniList user recommendations
            recommendationsArr?.let { arr ->
                for (i in 0 until arr.length()) {
                    val recNode = arr.optJSONObject(i)?.optJSONObject("mediaRecommendation") ?: continue
                    val recId = recNode.optInt("id", 0).takeIf { it > 0 } ?: continue
                    val recTitle = recNode.optJSONObject("title")?.let {
                        it.optString("userPreferred").takeIf { s -> s.isNotBlank() }
                            ?: it.optString("english").takeIf { s -> s.isNotBlank() }
                            ?: it.optString("romaji")
                    } ?: continue
                    val recCover = recNode.optJSONObject("coverImage")?.optString("large")
                    val isRecMovie = recNode.optString("format").equals("MOVIE", true)

                    recList.add(
                        api.newAnimeSearchResponse(
                            recTitle,
                            "https://anilist.co/anime/$recId",
                            if (isRecMovie) TvType.AnimeMovie else TvType.Anime
                        ) {
                            posterUrl = recCover
                        }
                    )
                }
            }
            if (recList.isNotEmpty()) {
                recommendations = recList
            }
        }
    }

    suspend fun buildMovieResponse(
        api: MainAPI,
        media: AniListMedia,
        charactersObj: JSONObject? = null,
        recommendationsArr: JSONArray? = null
    ): LoadResponse {
        val title = media.title.best()
        val url = "https://anilist.co/anime/${media.id}"
        val payload = AniListEpisodePayload(
            anilistId = media.id,
            malId = media.idMal,
            season = 1,
            episode = 1,
            title = title,
            showTitle = title,
            romajiTitle = media.title.romaji
        )

        return api.newMovieLoadResponse(title, url, TvType.AnimeMovie, payload.toJson()) {
            posterUrl = media.coverImage?.best()
            backgroundPosterUrl = media.bannerImage ?: media.coverImage?.best()
            year = media.startDateYear ?: media.seasonYear
            plot = NextGenAnilistMeta.cleanDescription(media.description)
            tags = media.genres
            duration = media.duration
            score = media.averageScore?.let { Score.from10(it / 10.0) }

            val aniStr = media.id.toString()
            syncData["anilist"] = aniStr
            syncData["aniList"] = aniStr
            media.idMal?.let {
                val malStr = it.toString()
                syncData["myanimelist"] = malStr
                syncData["myAnimeList"] = malStr
                syncData["mal"] = malStr
            }

            if (media.trailerYoutubeId != null) {
                addTrailer("https://www.youtube.com/watch?v=${media.trailerYoutubeId}")
            }

            charactersObj?.optJSONArray("edges")?.let { arr ->
                val actorList = mutableListOf<ActorData>()
                for (i in 0 until arr.length()) {
                    val edge = arr.optJSONObject(i) ?: continue
                    val role = edge.optString("role", "")
                    val node = edge.optJSONObject("node") ?: continue
                    val name = node.optJSONObject("name")?.optString("full") ?: continue
                    val image = node.optJSONObject("image")?.optString("medium")
                    actorList.add(ActorData(Actor(name, image), roleString = role))
                }
                actors = actorList
            }

            val recList = mutableListOf<AnimeSearchResponse>()

            // 1. Related media (Sequels, Prequels, Side Stories, etc.)
            media.relations.filter { it.type == "ANIME" && !it.title.isNullOrBlank() }.forEach { rel ->
                val isMovie = rel.format.equals("MOVIE", true)
                val typeLabel = rel.relationType.replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() }
                recList.add(
                    api.newAnimeSearchResponse(
                        "${rel.title} ($typeLabel)",
                        "https://anilist.co/anime/${rel.id}",
                        if (isMovie) TvType.AnimeMovie else TvType.Anime
                    ) {
                        posterUrl = rel.posterUrl
                    }
                )
            }

            // 2. AniList user recommendations
            recommendationsArr?.let { arr ->
                for (i in 0 until arr.length()) {
                    val recNode = arr.optJSONObject(i)?.optJSONObject("mediaRecommendation") ?: continue
                    val recId = recNode.optInt("id", 0).takeIf { it > 0 } ?: continue
                    val recTitle = recNode.optJSONObject("title")?.let {
                        it.optString("userPreferred").takeIf { s -> s.isNotBlank() }
                            ?: it.optString("english").takeIf { s -> s.isNotBlank() }
                            ?: it.optString("romaji")
                    } ?: continue
                    val recCover = recNode.optJSONObject("coverImage")?.optString("large")
                    val isRecMovie = recNode.optString("format").equals("MOVIE", true)

                    recList.add(
                        api.newAnimeSearchResponse(
                            recTitle,
                            "https://anilist.co/anime/$recId",
                            if (isRecMovie) TvType.AnimeMovie else TvType.Anime
                        ) {
                            posterUrl = recCover
                        }
                    )
                }
            }
            if (recList.isNotEmpty()) {
                recommendations = recList
            }
        }
    }

    suspend fun loadDetails(api: MainAPI, url: String): LoadResponse? {
        val id = Regex("""(?:anilist\.co/anime/|anilist:)(\d+)""").find(url)?.groupValues?.get(1)?.toIntOrNull()
            ?: url.toIntOrNull()
            ?: return null

        val data = NextGenAnilistMeta.query(FULL_MEDIA_QUERY, JSONObject().put("id", id))
        val mediaObj = data?.optJSONObject("Media") ?: return null
        val media = parseMedia(mediaObj)

        val charactersObj = mediaObj.optJSONObject("characters")
        val recommendationsArr = mediaObj.optJSONObject("recommendations")?.optJSONArray("nodes")

        if (media.isMovie) {
            return buildMovieResponse(api, media, charactersObj, recommendationsArr)
        }

        // TV / ONA / TV_SHORT / SPECIAL: 1:1 like AniList (each media is its own anime entry)
        return buildTvSeriesResponse(
            api = api,
            rootMedia = media,
            seasons = listOf(media),
            charactersObj = charactersObj,
            recommendationsArr = recommendationsArr
        )
    }
}
