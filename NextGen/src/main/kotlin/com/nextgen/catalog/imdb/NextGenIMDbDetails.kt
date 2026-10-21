package com.nextgen

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.LoadResponse.Companion.addImdbId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

internal object NextGenIMDbDetails {
    private val LINK_PATTERN = Regex("""imdb\.com/title/(tt\d+)/?\?kind=(movie|series)""")
    private val YEAR_PATTERN = Regex("""(19|20)\d{2}""")
    private val CAST_SOURCES = listOf(
        "https://aiometadata.elfhosted.com/stremio/9197a4a9-2f5b-4911-845e-8704c520bdf7/meta",
        "https://94c8cb9f702d-tmdb-addon.baby-beamup.club/meta",
    )

    private fun payload(id: String, season: Int?, episode: Int?, name: String?): String =
        JSONObject().apply {
            put("imdbID", id)
            season?.let { put("season", it) }
            episode?.let { put("episode", it) }
            name?.let { put("movieName", it) }
        }.toString()

    private fun bold(text: String): String = buildString {
        for (ch in text) {
            val point = when (ch) {
                in 'A'..'Z' -> 0x1D5D4 + (ch - 'A')
                in 'a'..'z' -> 0x1D5EE + (ch - 'a')
                in '0'..'9' -> 0x1D7EC + (ch - '0')
                else -> ch.code
            }
            appendCodePoint(point)
        }
    }

    private fun releaseYear(meta: JSONObject): Int? =
        listOf("year", "releaseInfo", "released")
            .firstNotNullOfOrNull { key -> meta.imdbText(key)?.let { YEAR_PATTERN.find(it)?.value?.toIntOrNull() } }

    private fun genresOf(meta: JSONObject): List<String> =
        meta.optJSONArray("genre").imdbStrings().ifEmpty { meta.optJSONArray("genres").imdbStrings() }

    private suspend fun castOf(kind: String, id: String): List<ActorData>? {
        for (source in CAST_SOURCES) {
            val body = try {
                withTimeoutOrNull(6_000L) { app.get("$source/$kind/$id.json").text }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
            if (body.isNullOrEmpty()) continue
            val members = runCatching { JSONObject(body) }.getOrNull()
                ?.optJSONObject("meta")?.optJSONObject("app_extras")?.optJSONArray("cast").imdbObjects()
            val actors = members.mapNotNull { m ->
                val name = m.imdbText("name") ?: return@mapNotNull null
                ActorData(Actor(name, NextGenIMDbApi.proxy(m.imdbText("photo"))), roleString = m.imdbText("character"))
            }
            if (actors.isNotEmpty()) return actors
        }
        return null
    }

    suspend fun MainAPI.loadIMDb(url: String): LoadResponse? {
        val match = LINK_PATTERN.find(url) ?: return null
        val id = match.groupValues[1]
        val kind = match.groupValues[2]
        val meta = NextGenIMDbApi.fetch("meta/$kind/$id.json")?.optJSONObject("meta") ?: return null
        val title = meta.optJSONArray("aliases").imdbStrings().firstOrNull() ?: meta.imdbText("name") ?: return null

        val cover = NextGenPosters.resolveImdb(kind, id, NextGenIMDbApi.proxy(meta.imdbText("poster")))
        val backdrop = NextGenIMDbApi.proxy(meta.imdbText("background"))
        val logo = NextGenIMDbApi.proxy(meta.imdbText("logo"))
        val plotText = meta.imdbText("description").let { text ->
            meta.imdbText("awards")?.let { "[${bold(it)}] ${text.orEmpty()}" } ?: text
        }
        val year = releaseYear(meta)
        val tagList = genresOf(meta)
        val rating = meta.imdbText("imdbRating")?.toDoubleOrNull()?.let { Score.from10(it) }
        val cast = castOf(kind, id)

        val aniZip = NextGenAniZip.resolve(imdbId = id)
        val tmdbId = aniZip?.tmdbId ?: run {
            val text = NextGenTmdb.get("find/$id?external_source=imdb_id", ttlMs = 24 * 60 * 60 * 1000L)
            text?.let {
                val obj = JSONObject(it)
                val results = if (kind == "movie") obj.optJSONArray("movie_results") else obj.optJSONArray("tv_results")
                val hit = results?.optJSONObject(0) ?: obj.optJSONArray("tv_results")?.optJSONObject(0) ?: obj.optJSONArray("movie_results")?.optJSONObject(0)
                hit?.optInt("id", 0)?.takeIf { v -> v > 0 }?.toString()
            }
        }
        val aniId = aniZip?.anilistId
        val malId = aniZip?.malId
        val kitsuId = aniZip?.kitsuId?.toString()

        fun LoadResponse.populateTrackers() {
            addImdbId(id)
            syncData["imdb"] = id
            tmdbId?.let { syncData["tmdb"] = it }
            aniId?.let {
                val s = it.toString()
                syncData["anilist"] = s
                syncData["aniList"] = s
            }
            malId?.let {
                val s = it.toString()
                syncData["myanimelist"] = s
                syncData["myAnimeList"] = s
                syncData["mal"] = s
            }
            kitsuId?.let {
                syncData["kitsu"] = it
            }
        }

        if (kind == "movie") {
            return newMovieLoadResponse(title, url, TvType.Movie, payload(id, null, null, title)) {
                posterUrl = cover
                backgroundPosterUrl = backdrop
                this.year = year
                plot = plotText
                logoUrl = logo
                tags = tagList
                score = rating
                contentRating = "IMDB"
                actors = cast
            }.also { it.populateTrackers() }
        }

        val episodes = meta.optJSONArray("videos").imdbObjects().mapNotNull { v ->
            val seasonNo = v.optInt("season", -1)
            val episodeNo = if (v.has("episode")) v.optInt("episode", -1) else v.optInt("number", -1)
            if (seasonNo <= 0 || episodeNo <= 0) return@mapNotNull null
            newEpisode(payload(id, seasonNo, episodeNo, title)) {
                name = v.imdbText("name") ?: v.imdbText("title")
                season = seasonNo
                episode = episodeNo
                posterUrl = NextGenIMDbApi.proxy(v.imdbText("thumbnail"))
                description = v.imdbText("overview") ?: v.imdbText("description")
                score = v.imdbText("rating")?.toDoubleOrNull()?.let { Score.from10(it) }
                addDate((v.imdbText("firstAired") ?: v.imdbText("released"))?.substringBefore('T'))
            }
        }

        return newTvSeriesLoadResponse(title, url, TvType.TvSeries, episodes) {
            posterUrl = cover
            backgroundPosterUrl = backdrop
            this.year = year
            plot = plotText
            logoUrl = logo
            tags = tagList
            score = rating
            contentRating = "IMDB"
            actors = cast
        }.also { it.populateTrackers() }
    }
}
