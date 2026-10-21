package com.eclipsia

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.LoadResponse.Companion.addImdbId
import com.lagradost.cloudstream3.LoadResponse.Companion.addTrailer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

internal object EclipsiaDetails {
    private const val BASE = "https://api.themoviedb.org/3"
    private const val IMAGE = "https://image.tmdb.org/t/p"
    private val LINK_PATTERN = Regex("""themoviedb\.org/(movie|tv)/(\d+)""")

    private suspend fun queryAnilist(titles: List<String>, year: Int?, movie: Boolean): Pair<Int?, Int?> {
        val q = "query(\$s: String) { Page(page: 1, perPage: 10) { media(search: \$s, type: ANIME, sort: SEARCH_MATCH) { id idMal format status seasonYear startDate { year } title { romaji english native } synonyms } } }"
        val wanted = titles.map { it.lowercase().filter { c -> c.isLetterOrDigit() } }.filter { it.isNotEmpty() }.toSet()
        if (wanted.isEmpty()) return null to null
        for (title in titles.take(3)) {
            val body = JSONObject().put("query", q).put("variables", JSONObject().put("s", title)).toString()
            val text = try {
                app.post(
                    "https://graphql.anilist.co",
                    headers = mapOf("Accept" to "application/json", "Content-Type" to "application/json"),
                    requestBody = body.toRequestBody("application/json".toMediaTypeOrNull()),
                    timeout = 8_000L
                ).text
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            } ?: continue
            val media = runCatching { JSONObject(text) }.getOrNull()
                ?.optJSONObject("data")?.optJSONObject("Page")?.optJSONArray("media").objects()
            val hit = media.firstOrNull { o ->
                val isMovie = o.optString("format", "").equals("MOVIE", true)
                if (isMovie != movie) return@firstOrNull false
                val y = o.optInt("seasonYear", 0).takeIf { it > 0 } ?: o.optJSONObject("startDate")?.optInt("year", 0)
                if (year != null && y != null && kotlin.math.abs(y - year) > 1) return@firstOrNull false
                val t = o.optJSONObject("title")
                val tList = listOfNotNull(t?.optString("english"), t?.optString("romaji"), t?.optString("native"))
                tList.map { it.lowercase().filter { c -> c.isLetterOrDigit() } }.any { it in wanted }
            } ?: continue
            val aniId = hit.optInt("id", 0).takeIf { it > 0 }
            val malId = hit.optInt("idMal", 0).takeIf { it > 0 }
            if (aniId != null || malId != null) return aniId to malId
        }
        return null to null
    }

    private class Ref(val isTv: Boolean, val id: Int)

    private fun refOf(url: String): Ref? {
        LINK_PATTERN.find(url)?.let { return Ref(it.groupValues[1] == "tv", it.groupValues[2].toInt()) }
        val json = runCatching { JSONObject(url) }.getOrNull() ?: return null
        val id = json.optInt("tmdbID").takeIf { it > 0 } ?: return null
        return Ref(json.has("season") || json.has("episode"), id)
    }

    private suspend fun plotOf(kind: String, id: Int, detail: JSONObject): String? {
        detail.text("overview")?.let { return it }
        if (!EclipsiaStore.language.startsWith("en")) {
            fetchJson("$kind/$id?language=en-US")?.text("overview")?.let { return it }
        }
        return detail.text("tagline")
    }

    private fun image(path: String?, size: String): String? =
        path?.takeIf { it.startsWith("/") }?.let { "$IMAGE/$size$it" }

    private fun JSONObject.text(key: String): String? = optString(key, "").takeIf { it.isNotBlank() }

    private fun JSONArray?.objects(): List<JSONObject> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

    private fun payload(imdb: String?, id: Int, season: Int?, episode: Int?, name: String?): String =
        JSONObject().apply {
            imdb?.let { put("imdbID", it) }
            put("tmdbID", id)
            season?.let { put("season", it) }
            episode?.let { put("episode", it) }
            name?.let { put("movieName", it) }
        }.toString()

    suspend fun fetchJson(path: String): JSONObject? =
        EclipsiaTmdb.get(path)?.let { runCatching { JSONObject(it) }.getOrNull() }

    private fun ageRating(detail: JSONObject): String? {
        detail.optJSONObject("content_ratings")?.optJSONArray("results").objects()
            .firstOrNull { it.optString("iso_3166_1") == "US" }?.text("rating")?.let { return it }
        return detail.optJSONObject("release_dates")?.optJSONArray("results").objects()
            .firstOrNull { it.optString("iso_3166_1") == "US" }
            ?.optJSONArray("release_dates").objects()
            .firstNotNullOfOrNull { it.text("certification") }
    }

    private fun trailers(detail: JSONObject): List<String> {
        val videos = detail.optJSONObject("videos")?.optJSONArray("results").objects()
        fun link(v: JSONObject) = v.text("key")?.let { "https://www.youtube.com/watch?v=$it" }
        val onlyTrailers = videos.filter { it.optString("type") == "Trailer" }.mapNotNull(::link).reversed()
        return onlyTrailers.ifEmpty { videos.mapNotNull(::link) }
    }

    private fun cast(detail: JSONObject): List<ActorData> =
        detail.optJSONObject("credits")?.optJSONArray("cast").objects().mapNotNull { c ->
            val name = c.text("name") ?: c.text("original_name") ?: return@mapNotNull null
            ActorData(Actor(name, image(c.text("profile_path"), "w500")), roleString = c.text("character"))
        }

    private suspend fun logoFor(isTv: Boolean, id: Int): String? {
        val logos = fetchJson("${if (isTv) "tv" else "movie"}/$id/images")?.optJSONArray("logos").objects()
            .filter { !it.optString("file_path").isNullOrBlank() }
        if (logos.isEmpty()) return null

        fun isSvg(o: JSONObject) = o.optString("file_path").endsWith(".svg", ignoreCase = true)
        fun url(o: JSONObject) = "$IMAGE/w500${o.optString("file_path")}"

        val english = logos.filter { it.optString("iso_639_1").trim().lowercase() == EclipsiaStore.languageCode }
        english.firstOrNull { !isSvg(it) }?.let { return url(it) }
        english.firstOrNull { isSvg(it) }?.let { return url(it) }

        val voted = logos.filter { it.optDouble("vote_average", 0.0) > 0 && it.optInt("vote_count", 0) > 0 }
        val ranking = compareByDescending<JSONObject> { it.optDouble("vote_average", 0.0) }
            .thenByDescending { it.optInt("vote_count", 0) }
        voted.filter { !isSvg(it) }.minWithOrNull(ranking)?.let { return url(it) }
        return voted.filter { isSvg(it) }.minWithOrNull(ranking)?.let { url(it) }
    }

    suspend fun MainAPI.loadDetails(url: String): LoadResponse? {
        val ref = refOf(url) ?: return null
        val kind = if (ref.isTv) "tv" else "movie"
        val extras = "credits,external_ids,videos,recommendations,content_ratings,release_dates"

        return coroutineScope {
            val logoJob = async { logoFor(ref.isTv, ref.id) }
            val detail = fetchJson("$kind/${ref.id}?append_to_response=$extras&language=${EclipsiaStore.language}") ?: return@coroutineScope null

            val title = detail.text("title") ?: detail.text("name") ?: return@coroutineScope null
            val plotText = plotOf(kind, ref.id, detail)
            val backdrop = image(detail.text("backdrop_path"), "original")
            val released = detail.text("release_date") ?: detail.text("first_air_date")
            val releaseYear = released?.substringBefore('-')?.toIntOrNull()
            val genreNames = detail.optJSONArray("genres").objects().mapNotNull { it.text("name") }
            val imdb = detail.optJSONObject("external_ids")?.text("imdb_id")
            val rating = Score.from10(detail.optDouble("vote_average", 0.0))
            val poster = EclipsiaPosters.resolve(
                kind, ref.id, imdb,
                image(detail.text("poster_path"), "original")
            )
            val related = EclipsiaCatalog.entries(
                this@loadDetails, detail.optJSONObject("recommendations")?.optJSONArray("results"), kind
            )
            val logo = logoJob.await()
            val isAnime = (detail.optString("original_language") == "ja" || detail.optJSONArray("origin_country").objects().any { it.optString("iso_3166_1", "") == "JP" })
                && genreNames.any { it.equals("Animation", ignoreCase = true) }
            val animeIds = if (isAnime) {
                val names = listOfNotNull(detail.text("name"), detail.text("original_name"), detail.text("title"), detail.text("original_title")).distinct()
                queryAnilist(names, releaseYear, !ref.isTv)
            } else null
            val aniId = animeIds?.first
            val malId = animeIds?.second

            suspend fun LoadResponse.populateTrackers() {
                addTrailer(trailers(detail))
                addImdbId(imdb)
                imdb?.let { syncData["imdb"] = it }
                syncData["tmdb"] = ref.id.toString()
                aniId?.let { syncData["anilist"] = it.toString() }
                malId?.let {
                    syncData["myanimelist"] = it.toString()
                    syncData["mal"] = it.toString()
                }
            }

            if (!ref.isTv) {
                return@coroutineScope newMovieLoadResponse(
                    title, url, TvType.Movie, payload(imdb, ref.id, null, null, title)
                ) {
                    posterUrl = poster
                    backgroundPosterUrl = backdrop
                    year = releaseYear
                    plot = plotText
                    duration = detail.optInt("runtime").takeIf { it > 0 }
                    contentRating = ageRating(detail)
                    logoUrl = logo
                    tags = genreNames
                    score = rating
                    recommendations = related
                    actors = cast(detail)
                }.also { it.populateTrackers() }
            }

            val seasonNumbers = detail.optJSONArray("seasons").objects()
                .map { it.optInt("season_number", -1) }
                .filter { it > 0 }
            val seasonData = seasonNumbers
                .map { n -> async { n to fetchJson("tv/${ref.id}/season/$n?language=${EclipsiaStore.language}")?.optJSONArray("episodes").objects() } }
                .awaitAll()
            val episodes = seasonData
                .flatMap { it.second }
                .map { ep ->
                    val seasonNo = ep.optInt("season_number").takeIf { ep.has("season_number") }
                    val episodeNo = ep.optInt("episode_number").takeIf { ep.has("episode_number") }
                    newEpisode(payload(imdb, ref.id, seasonNo, episodeNo, title)) {
                        name = ep.text("name")
                        season = seasonNo
                        episode = episodeNo
                        posterUrl = image(ep.text("still_path"), "w500") ?: backdrop ?: poster
                        score = Score.from10(ep.optDouble("vote_average", 0.0))
                        description = ep.text("overview")
                        runTime = ep.optInt("runtime").takeIf { it > 0 }
                        addDate(ep.text("air_date"))
                    }
                }

            newTvSeriesLoadResponse(title, url, TvType.TvSeries, episodes) {
                posterUrl = poster
                backgroundPosterUrl = backdrop
                year = releaseYear
                plot = plotText
                contentRating = ageRating(detail)
                logoUrl = logo
                tags = genreNames
                score = rating
                showStatus = if (detail.optString("status") == "Returning Series") ShowStatus.Ongoing else ShowStatus.Completed
                recommendations = related
                actors = cast(detail)
            }.also { it.populateTrackers() }
        }
    }
}
