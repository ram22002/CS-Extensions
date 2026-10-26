package com.nextgenanime

import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.TvSeriesLoadResponse
import com.lagradost.cloudstream3.TvType
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class PlaybackMappingTest {

    private class TestApi : MainAPI() {
        override var name = "NextGenAnime"
        override var mainUrl = "https://anilist.co"
        override val supportedTypes = setOf(TvType.Anime, TvType.AnimeMovie)
    }

    private val api = TestApi()

    @Test
    fun testLaterSeasonPlaybackMappingPreservesDistinctAniListIdAndLocalNumbering() = runBlocking {
        // Multi-season setup (e.g. Re:Zero Season 1 [25 eps] and Season 2 [13 eps])
        val s1 = AniListMedia(
            id = 21355,
            title = AniListTitle(english = "Re:ZERO Season 1", romaji = "Re:Zero kara Hajimeru Isekai Seikatsu"),
            episodes = 25,
            format = "TV"
        )
        val s2 = AniListMedia(
            id = 108632,
            title = AniListTitle(english = "Re:ZERO Season 2", romaji = "Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season"),
            episodes = 13,
            format = "TV"
        )

        val chain = listOf(s1, s2)
        val loadResponse = NextGenAnilistDetails.buildTvSeriesResponse(api, s1, chain) as TvSeriesLoadResponse

        // Find episode 1 of Season 2
        val s2Ep1 = loadResponse.episodes.firstOrNull { it.season == 2 && it.episode == 1 }
        assertNotNull("Season 2 Episode 1 must exist", s2Ep1)

        val payload = AniListEpisodePayload.fromJson(s2Ep1!!.data)

        // Verify distinct AniList ID for Season 2
        assertEquals(108632, payload.anilistId)
        assertEquals(2, payload.season)
        assertEquals(1, payload.episode)
        assertEquals("Episode 1", payload.title)
        assertEquals("Re:ZERO Season 2", payload.showTitle)
        assertEquals("Re:ZERO", payload.baseTitle)
        assertEquals("Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season", payload.romajiTitle)

        // Episode number must NOT be flattened to 26
        assertNotEquals(26, payload.episode)
        assertNotEquals(21355, payload.anilistId)
    }

    @Test
    fun testSeasonValuesInFinalCloudStreamResponse() = runBlocking {
        val s1 = AniListMedia(id = 100, title = AniListTitle("Anime S1"), episodes = 12, format = "TV")
        val s2 = AniListMedia(id = 200, title = AniListTitle("Anime S2"), episodes = 24, format = "TV")
        val s3 = AniListMedia(id = 300, title = AniListTitle("Anime S3"), episodes = 8, format = "TV")

        val chain = listOf(s1, s2, s3)
        val loadResponse = NextGenAnilistDetails.buildTvSeriesResponse(api, s1, chain) as TvSeriesLoadResponse

        // CloudStream UI uses loadResponse.seasonNames for the season dropdown
        val seasons = loadResponse.seasonNames
        assertNotNull("Season names list must not be null", seasons)
        assertEquals(3, seasons!!.size)

        assertEquals(1, seasons[0].season)
        assertEquals("Anime S1", seasons[0].name)

        assertEquals(2, seasons[1].season)
        assertEquals("Anime S2", seasons[1].name)

        assertEquals(3, seasons[2].season)
        assertEquals("Anime S3", seasons[2].name)

        // Verify episode season assignment in response
        assertEquals(12, loadResponse.episodes.count { it.season == 1 })
        assertEquals(24, loadResponse.episodes.count { it.season == 2 })
        assertEquals(8, loadResponse.episodes.count { it.season == 3 })
        assertEquals(44, loadResponse.episodes.size)
    }

    @Test
    fun testPayloadSerializationHasNoTmdbDependency() {
        val payload = AniListEpisodePayload(
            anilistId = 1535,
            malId = 1535,
            season = 1,
            episode = 1,
            title = "Death Note",
            showTitle = "Death Note",
            romajiTitle = "Death Note"
        )

        val raw = payload.toJson()

        // Must not serialize any tmdb references
        assertFalse("Payload must not contain tmdb", raw.contains("tmdb", ignoreCase = true))
        assertTrue("Payload must contain anilistId", raw.contains("\"anilistId\":1535"))

        val decoded = AniListEpisodePayload.fromJson(raw)
        assertEquals(payload, decoded)
    }
}
