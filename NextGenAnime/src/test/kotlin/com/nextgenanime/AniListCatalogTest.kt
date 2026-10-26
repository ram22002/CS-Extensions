package com.nextgenanime

import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.TvType
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AniListCatalogTest {

    private class TestApi : MainAPI() {
        override var name = "NextGenAnime"
        override var mainUrl = "https://anilist.co"
        override val supportedTypes = setOf(TvType.Anime, TvType.AnimeMovie)
    }

    private val api = TestApi()

    @Test
    fun testParseMediaToSearchResponseUsesAniListUrlAndNoTmdb() = runBlocking {
        val json = JSONObject("""
            {
                "id": 21,
                "idMal": 21,
                "format": "TV",
                "title": {
                    "romaji": "One Piece",
                    "english": "One Piece",
                    "native": "ONE PIECE"
                },
                "coverImage": {
                    "extraLarge": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCDoj1EkAxFn.jpg",
                    "large": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21-YCDoj1EkAxFn.jpg"
                }
            }
        """.trimIndent())

        val res = NextGenAnilistApi.toSearchResponse(api, json)
        assertNotNull(res)
        assertEquals("One Piece", res!!.name)
        assertEquals("https://anilist.co/anime/21", res.url)
        assertEquals(TvType.Anime, res.type)
        assertEquals("https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCDoj1EkAxFn.jpg", res.posterUrl)
        assertFalse(res.url.contains("themoviedb.org"))
        assertFalse(res.url.contains("kitsu.io"))
    }

    @Test
    fun testMovieFormatProducesAnimeMovieType() = runBlocking {
        val json = JSONObject("""
            {
                "id": 199,
                "idMal": 199,
                "format": "MOVIE",
                "title": {
                    "romaji": "Sen to Chihiro no Kamikakushi",
                    "english": "Spirited Away"
                },
                "coverImage": {
                    "large": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/199.jpg"
                }
            }
        """.trimIndent())

        val res = NextGenAnilistApi.toSearchResponse(api, json)
        assertNotNull(res)
        assertEquals("Spirited Away", res!!.name)
        assertEquals("https://anilist.co/anime/199", res.url)
        assertEquals(TvType.AnimeMovie, res.type)
    }
}
