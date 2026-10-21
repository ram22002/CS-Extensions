version = run {
    val text = rootProject.file("providers/providers-bdix/manifest.json").readText()
    val m = Regex("\"version\"\\s*:\\s*\"(\\d+)\\.(\\d+)\\.(\\d+)\"").find(text)
        ?: error("providers/providers-bdix/manifest.json has no top-level \"version\": \"x.y.z\"")
    val (major, minor, patch) = m.destructured
    major.toInt() * 10000 + minor.toInt() * 100 + patch.toInt()
}

cloudstream {
    description = "Regional FTP sources"
    authors = listOf("ram22002")

    status = 1

    tvTypes = listOf("Movie", "TvSeries")
    language = "en"

    iconUrl = "https://eclipsia.dpdns.org/logo_v2.png"
}

android {
    namespace = "com.nextgenbdix"
}
