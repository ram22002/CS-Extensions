version = run {
    val text = rootProject.file("providers/providers-main/manifest.json").readText()
    val m = Regex("\"version\"\\s*:\\s*\"(\\d+)\\.(\\d+)\\.(\\d+)\"").find(text)
        ?: error("providers/providers-main/manifest.json has no top-level \"version\": \"x.y.z\"")
    val (major, minor, patch) = m.destructured
    major.toInt() * 10000 + minor.toInt() * 100 + patch.toInt()
}

cloudstream {
    description = "Movies & TV series"
    authors = listOf("ram22002")

    status = 1

    tvTypes = listOf("Movie", "TvSeries")
    language = "en"

    iconUrl = "https://eclipsia.dpdns.org/logo_v2.png"
}

android {
    namespace = "com.nextgen"
}
