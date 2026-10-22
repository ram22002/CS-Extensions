import groovy.json.JsonSlurper

version = 10000

val sourceManifests = File(rootProject.projectDir, "sources/story").let { listOf(it) }
    .filter { it.isDirectory && !it.name.startsWith("_") && !it.name.startsWith(".") && File(it, "source.json").exists() }
    .sortedBy { it.name }
    .mapNotNull { JsonSlurper().parse(File(it, "source.json")) as? Map<*, *> }

val first = sourceManifests.singleOrNull()

cloudstream {
    description = (first?.get("description") as? String) ?: "Short dramas, mini-series & vertical reels"
    authors = listOf("ram22002")
    status = 1
    tvTypes = listOf("AsianDrama", "TvSeries", "Movie", "Others")
    language = "en"
    iconUrl = "https://raw.githubusercontent.com/ram22002/CS-Extensions/main/icons/story.png"
}

android {
    namespace = "com.nextgenstory"
}
