version = run {
    val text = rootProject.file("providers/providers-anime/manifest.json").readText()
    val m = Regex("\"version\"\\s*:\\s*\"(\\d+)\\.(\\d+)\\.(\\d+)\"").find(text)
        ?: error("providers/providers-anime/manifest.json has no top-level \"version\": \"x.y.z\"")
    val (major, minor, patch) = m.destructured
    major.toInt() * 10000 + minor.toInt() * 100 + patch.toInt()
}

cloudstream {
    description = "Anime, movies & OVAs"
    authors = listOf("ram22002")

    status = 1

    tvTypes = listOf("Anime", "AnimeMovie", "OVA", "Movie", "TvSeries")
    language = "en"

    iconUrl = "https://raw.githubusercontent.com/ram22002/CS-Extensions/main/icons/anime.png"
}

android {
    namespace = "com.nextgenanime"
}

dependencies {
    testImplementation(files("${System.getProperty("user.home")}/.gradle/caches/cloudstream/cloudstream/cloudstream.jar"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
