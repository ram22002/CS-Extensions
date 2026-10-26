package com.nextgenanime

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AniListSeasonTest {

    @Test
    fun testMultiSeasonChainPreservesSeparateAniListIdsAndEpisodeCounts() = runBlocking {
        // Mock 3 seasons: S1 (ID 10, 25 eps), S2 (ID 20, 13 eps), S3 (ID 30, 12 eps)
        val s1 = AniListMedia(
            id = 10,
            idMal = 100,
            title = AniListTitle(romaji = "Anime S1", english = "Anime Season 1"),
            format = "TV",
            status = "FINISHED",
            episodes = 25,
            relations = listOf(AniListEdge("SEQUEL", 20, "TV", "ANIME"))
        )
        val s2 = AniListMedia(
            id = 20,
            idMal = 200,
            title = AniListTitle(romaji = "Anime S2", english = "Anime Season 2"),
            format = "TV",
            status = "FINISHED",
            episodes = 13,
            relations = listOf(
                AniListEdge("PREQUEL", 10, "TV", "ANIME"),
                AniListEdge("SEQUEL", 30, "TV", "ANIME")
            )
        )
        val s3 = AniListMedia(
            id = 30,
            idMal = 300,
            title = AniListTitle(romaji = "Anime S3", english = "Anime Season 3"),
            format = "TV",
            status = "FINISHED",
            episodes = 12,
            relations = listOf(AniListEdge("PREQUEL", 20, "TV", "ANIME"))
        )

        val map = mapOf(10 to s1, 20 to s2, 30 to s3)
        // Starting traversal from Season 2 (simulating user opening S2 directly)
        val chain = buildSeasonChain(s2) { id -> map[id] }

        assertEquals(3, chain.size)
        assertEquals(10, chain[0].id)
        assertEquals(25, chain[0].episodes)
        assertEquals(20, chain[1].id)
        assertEquals(13, chain[1].episodes)
        assertEquals(30, chain[2].id)
        assertEquals(12, chain[2].episodes)
    }

    @Test
    fun testExcludesMoviesOvasAndSpecialsFromSeasonChain() = runBlocking {
        val s1 = AniListMedia(
            id = 10,
            title = AniListTitle(romaji = "Anime S1", english = "Anime Season 1"),
            format = "TV",
            episodes = 12,
            relations = listOf(
                AniListEdge("SEQUEL", 20, "TV", "ANIME"),
                AniListEdge("SIDE_STORY", 99, "OVA", "ANIME"),
                AniListEdge("ALTERNATIVE", 98, "MOVIE", "ANIME"),
                AniListEdge("SPIN_OFF", 97, "TV_SHORT", "ANIME")
            )
        )
        val s2 = AniListMedia(
            id = 20,
            title = AniListTitle(romaji = "Anime S2", english = "Anime Season 2"),
            format = "TV",
            episodes = 12,
            relations = listOf(
                AniListEdge("PREQUEL", 10, "TV", "ANIME"),
                AniListEdge("CHARACTER", 96, "MOVIE", "ANIME")
            )
        )

        val map = mapOf(10 to s1, 20 to s2)
        val chain = buildSeasonChain(s1) { id -> map[id] }

        assertEquals(2, chain.size)
        assertEquals(listOf(10, 20), chain.map { it.id })
    }

    @Test
    fun testPreventsInfiniteLoopOnCyclicRelations() = runBlocking {
        val s1 = AniListMedia(
            id = 10,
            title = AniListTitle(romaji = "Cyclic 1"),
            format = "TV",
            episodes = 12,
            relations = listOf(AniListEdge("SEQUEL", 20, "TV", "ANIME"))
        )
        val s2 = AniListMedia(
            id = 20,
            title = AniListTitle(romaji = "Cyclic 2"),
            format = "TV",
            episodes = 12,
            relations = listOf(
                AniListEdge("PREQUEL", 10, "TV", "ANIME"),
                AniListEdge("SEQUEL", 10, "TV", "ANIME") // Malformed cyclic relation
            )
        )

        val map = mapOf(10 to s1, 20 to s2)
        val chain = buildSeasonChain(s1) { id -> map[id] }

        assertEquals(2, chain.size)
        assertEquals(listOf(10, 20), chain.map { it.id })
    }

    @Test
    fun testHandlesReleasingAnimeWithUnknownEpisodeCount() = runBlocking {
        val s1 = AniListMedia(
            id = 50,
            title = AniListTitle(romaji = "Currently Airing Anime"),
            format = "TV",
            status = "RELEASING",
            episodes = null,
            relations = emptyList()
        )

        val chain = buildSeasonChain(s1) { null }
        assertEquals(1, chain.size)
        assertEquals(50, chain[0].id)
        assertEquals(null, chain[0].episodes)
    }
}
