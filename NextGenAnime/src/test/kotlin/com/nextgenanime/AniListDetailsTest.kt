package com.nextgenanime

import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MovieLoadResponse
import com.lagradost.cloudstream3.TvSeriesLoadResponse
import com.lagradost.cloudstream3.TvType
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AniListDetailsTest {

    private class TestApi : MainAPI() {
        override var name = "NextGenAnime"
        override var mainUrl = "https://anilist.co"
        override val supportedTypes = setOf(TvType.Anime, TvType.AnimeMovie)
    }

    private val api = TestApi()

    @Test
    fun testTvSeriesResponseBuildsSeparateSeasonsWithLocalNumbering() = runBlocking {
        // S1 (AniList ID 100, 25 episodes)
        val s1 = AniListMedia(
            id = 100,
            idMal = 1001,
            title = AniListTitle(romaji = "Anime S1", english = "Anime Season 1"),
            format = "TV",
            status = "FINISHED",
            episodes = 25,
            relations = listOf(AniListEdge("SEQUEL", 200, "TV", "ANIME"))
        )
        // S2 (AniList ID 200, 13 episodes)
        val s2 = AniListMedia(
            id = 200,
            idMal = 2002,
            title = AniListTitle(romaji = "Anime S2", english = "Anime Season 2"),
            format = "TV",
            status = "FINISHED",
            episodes = 13,
            relations = listOf(AniListEdge("PREQUEL", 100, "TV", "ANIME"))
        )

        val chain = listOf(s1, s2)
        val streamingEps = mapOf(
            100 to (1..25).map { AniListStreamingEpisode("Episode $it - S1 Title $it", "https://img.co/s1/$it.jpg") },
            200 to (1..13).map { AniListStreamingEpisode("Episode $it - S2 Title $it", "https://img.co/s2/$it.jpg") }
        )

        val response = NextGenAnilistDetails.buildTvSeriesResponse(
            api = api,
            rootMedia = s1,
            seasons = chain,
            streamingEps = streamingEps
        )

        assertTrue(response is TvSeriesLoadResponse)
        val tv = response as TvSeriesLoadResponse
        assertEquals("Anime Season 1", tv.name)

        // Verify SeasonData list
        val seasonData = tv.seasonNames ?: emptyList()
        assertEquals(2, seasonData.size)
        assertEquals(1, seasonData[0].season)
        assertEquals(2, seasonData[1].season)

        // Verify episodes count
        val eps = tv.episodes
        assertEquals(38, eps.size)

        // Verify Season 1 episodes: season=1, episode=1..25
        val s1Eps = eps.filter { it.season == 1 }
        assertEquals(25, s1Eps.size)
        assertEquals(1, s1Eps.first().episode)
        assertEquals(25, s1Eps.last().episode)
        val s1FirstPayload = AniListEpisodePayload.fromJson(s1Eps.first().data)
        assertEquals(100, s1FirstPayload.anilistId)
        assertEquals(1, s1FirstPayload.season)
        assertEquals(1, s1FirstPayload.episode)

        // Verify Season 2 episodes: season=2, episode=1..13 (MUST be reset to 1, not 26!)
        val s2Eps = eps.filter { it.season == 2 }
        assertEquals(13, s2Eps.size)
        assertEquals(1, s2Eps.first().episode)
        assertEquals(13, s2Eps.last().episode)
        val s2FirstPayload = AniListEpisodePayload.fromJson(s2Eps.first().data)
        assertEquals(200, s2FirstPayload.anilistId)
        assertEquals(2, s2FirstPayload.season)
        assertEquals(1, s2FirstPayload.episode) // local numbering!

        // Verify CloudStream syncData
        assertEquals("100", tv.syncData["anilist"])
        assertEquals("1001", tv.syncData["mal"])
    }

    @Test
    fun testMovieResponseBuildsMovieLoadResponse() = runBlocking {
        val movie = AniListMedia(
            id = 500,
            idMal = 5005,
            title = AniListTitle(romaji = "Anime The Movie", english = "Anime The Movie English"),
            format = "MOVIE",
            status = "FINISHED",
            episodes = 1
        )

        val response = NextGenAnilistDetails.buildMovieResponse(
            api = api,
            media = movie
        )

        assertTrue(response is MovieLoadResponse)
        val mov = response as MovieLoadResponse
        assertEquals("Anime The Movie English", mov.name)
        assertEquals(TvType.AnimeMovie, mov.type)

        // Payload data
        val payload = AniListEpisodePayload.fromJson(mov.dataUrl)
        assertEquals(500, payload.anilistId)
        assertEquals(1, payload.episode)

        // Trackers
        assertEquals("500", mov.syncData["anilist"])
        assertEquals("5005", mov.syncData["mal"])
    }
}
