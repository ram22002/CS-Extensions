package com.nextgenanime

data class AniListTitle(
    val romaji: String? = null,
    val english: String? = null,
    val native: String? = null,
    val userPreferred: String? = null,
) {
    fun best(): String = english?.takeIf { it.isNotBlank() }
        ?: romaji?.takeIf { it.isNotBlank() }
        ?: userPreferred?.takeIf { it.isNotBlank() }
        ?: native?.takeIf { it.isNotBlank() }
        ?: ""

    fun all(): List<String> = listOfNotNull(english, romaji, userPreferred, native)
        .filter { it.isNotBlank() }
        .distinct()
}

data class AniListCoverImage(
    val extraLarge: String? = null,
    val large: String? = null,
    val medium: String? = null,
    val color: String? = null,
) {
    fun best(): String? = extraLarge?.takeIf { it.isNotBlank() }
        ?: large?.takeIf { it.isNotBlank() }
        ?: medium?.takeIf { it.isNotBlank() }
}

data class AniListEdge(
    val relationType: String,
    val id: Int,
    val format: String? = null,
    val type: String = "ANIME",
    val title: String? = null,
    val posterUrl: String? = null,
)

data class AniListStreamingEpisode(
    val title: String? = null,
    val thumbnail: String? = null,
    val url: String? = null,
    val site: String? = null,
)

data class AniListNextAiring(
    val airingAt: Long? = null,
    val timeUntilAiring: Long? = null,
    val episode: Int? = null,
)

data class AniListEpisodePayload(
    val anilistId: Int,
    val malId: Int? = null,
    val season: Int,
    val episode: Int,
    val title: String? = null,
    val showTitle: String? = null,
    val romajiTitle: String? = null,
) {
    fun toJson(): String = org.json.JSONObject().apply {
        put("anilistId", anilistId)
        if (malId != null) put("malId", malId)
        put("season", season)
        put("episode", episode)
        if (!title.isNullOrBlank()) put("title", title)
        if (!showTitle.isNullOrBlank()) put("showTitle", showTitle)
        if (!romajiTitle.isNullOrBlank()) put("romajiTitle", romajiTitle)
    }.toString()

    companion object {
        fun fromJson(jsonStr: String): AniListEpisodePayload {
            val obj = org.json.JSONObject(jsonStr)
            return AniListEpisodePayload(
                anilistId = obj.getInt("anilistId"),
                malId = if (obj.has("malId")) obj.optInt("malId").takeIf { it > 0 } else null,
                season = obj.optInt("season", 1),
                episode = obj.optInt("episode", 1),
                title = obj.optString("title", "").takeIf { it.isNotBlank() },
                showTitle = obj.optString("showTitle", "").takeIf { it.isNotBlank() },
                romajiTitle = obj.optString("romajiTitle", "").takeIf { it.isNotBlank() },
            )
        }
    }
}

data class AniListMedia(
    val id: Int,
    val idMal: Int? = null,
    val title: AniListTitle = AniListTitle(),
    val format: String? = "TV",
    val status: String? = null,
    val description: String? = null,
    val startDateYear: Int? = null,
    val season: String? = null,
    val seasonYear: Int? = null,
    val episodes: Int? = null,
    val duration: Int? = null,
    val isAdult: Boolean = false,
    val genres: List<String> = emptyList(),
    val synonyms: List<String> = emptyList(),
    val averageScore: Int? = null,
    val meanScore: Int? = null,
    val coverImage: AniListCoverImage? = null,
    val bannerImage: String? = null,
    val trailerYoutubeId: String? = null,
    val relations: List<AniListEdge> = emptyList(),
    val streamingEpisodes: List<AniListStreamingEpisode> = emptyList(),
    val nextAiring: AniListNextAiring? = null,
) {
    val isMovie: Boolean get() = format.equals("MOVIE", ignoreCase = true)
}

/**
 * Valid formats that represent TV series seasons / cours in AniList.
 * Excludes MOVIE, OVA, SPECIAL, MUSIC so spin-offs or standalone movies are not merged.
 */
private val TV_SEASON_FORMATS = setOf("TV", "ONA", "TV_SHORT")

/**
 * Traverses PREQUEL relations backwards to find the root of the TV season chain,
 * then traverses SEQUEL relations forward to collect the ordered sequence of seasons.
 *
 * Prevents cycles using a visited set.
 */
suspend fun buildSeasonChain(
    initial: AniListMedia,
    fetchNode: suspend (Int) -> AniListMedia?,
): List<AniListMedia> {
    // If the initial entry is a movie, it does not have a TV season chain.
    if (initial.isMovie) return listOf(initial)

    val visited = mutableSetOf(initial.id)
    val mediaMap = mutableMapOf(initial.id to initial)

    // 1. Trace backwards along PREQUEL edges to find root season
    var curr = initial
    while (true) {
        val prequelEdge = curr.relations.firstOrNull { edge ->
            edge.relationType == "PREQUEL" &&
                edge.type == "ANIME" &&
                edge.format != null && edge.format in TV_SEASON_FORMATS &&
                edge.id !in visited
        } ?: break

        visited.add(prequelEdge.id)
        val parent = fetchNode(prequelEdge.id) ?: break
        if (parent.format !in TV_SEASON_FORMATS) break
        mediaMap[parent.id] = parent
        curr = parent
    }
    val root = curr

    // 2. Trace forward along SEQUEL edges from root
    val chain = mutableListOf<AniListMedia>()
    chain.add(root)
    val forwardVisited = mutableSetOf(root.id)
    curr = root

    while (true) {
        val sequelEdge = curr.relations.firstOrNull { edge ->
            edge.relationType == "SEQUEL" &&
                edge.type == "ANIME" &&
                edge.format != null && edge.format in TV_SEASON_FORMATS &&
                edge.id !in forwardVisited
        } ?: break

        forwardVisited.add(sequelEdge.id)
        val next = mediaMap[sequelEdge.id] ?: fetchNode(sequelEdge.id) ?: break
        if (next.format !in TV_SEASON_FORMATS) break
        chain.add(next)
        curr = next
    }

    return chain
}
