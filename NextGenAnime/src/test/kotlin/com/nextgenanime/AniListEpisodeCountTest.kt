package com.nextgenanime

import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.TvSeriesLoadResponse
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class AniListEpisodeCountTest {

    private val dummyApi = object : MainAPI() {
        override var name = "NextGenAnime"
        override var mainUrl = "https://nextgenanime"
    }

    @Test
    fun testAnimeWithFewStreamingEpisodesGeneratesAllEpisodes() = runBlocking {
        // Simulates Kaiju No. 8 S1: AniList says 12 episodes, but streamingEpisodes only has 4 promotional links
        val media = AniListMedia(
            id = 153288,
            title = AniListTitle(romaji = "Kaijuu 8-gou", english = "Kaiju No. 8"),
            format = "TV",
            status = "FINISHED",
            episodes = 12,
            streamingEpisodes = listOf(
                AniListStreamingEpisode(title = "Episode 15 - The Strongest Division"),
                AniListStreamingEpisode(title = "Episode 14 - The Next Generation's Trial"),
                AniListStreamingEpisode(title = "Episode 13 - Kaiju Weapon"),
                AniListStreamingEpisode(title = "Hoshina's Day Off")
            )
        )

        val resp = NextGenAnilistDetails.buildTvSeriesResponse(
            api = dummyApi,
            rootMedia = media,
            seasons = listOf(media)
        ) as TvSeriesLoadResponse

        val episodes = resp.episodes
        assertEquals(12, episodes.size)
        assertEquals(1, episodes.first().episode)
        assertEquals(12, episodes.last().episode)
        assertEquals("Episode 1", episodes.first().name)
    }

    @Test
    fun testOngoingAnimeWithNextAiringGeneratesFullAiredEpisodeCount() = runBlocking {
        // Simulates One Piece: episodes is null, nextAiringEpisode is 1181, streamingEpisodes only has 69 items
        val media = AniListMedia(
            id = 21,
            title = AniListTitle(romaji = "ONE PIECE", english = "One Piece"),
            format = "TV",
            status = "RELEASING",
            episodes = null,
            nextAiring = AniListNextAiring(episode = 1181),
            streamingEpisodes = listOf(
                AniListStreamingEpisode(title = "Episode 62 - Laboon"),
                AniListStreamingEpisode(title = "Episode 130 - Nico Robin")
            )
        )

        val resp = NextGenAnilistDetails.buildTvSeriesResponse(
            api = dummyApi,
            rootMedia = media,
            seasons = listOf(media)
        ) as TvSeriesLoadResponse

        val episodes = resp.episodes
        assertEquals(1180, episodes.size)
        assertEquals(1, episodes.first().episode)
        assertEquals(1180, episodes.last().episode)
        // Episode 62 should match streaming title
        val ep62 = episodes.find { it.episode == 62 }
        assertNotNull(ep62)
        assertEquals("Laboon", ep62?.name)
    }
}
