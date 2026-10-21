import groovy.json.JsonSlurper

version = 2

val sourceManifests = File(rootProject.projectDir, "sources/live").let { listOf(it) }
    ?.filter { it.isDirectory && !it.name.startsWith("_") && !it.name.startsWith(".") && File(it, "source.json").exists() }
    ?.sortedBy { it.name }
    ?.mapNotNull { JsonSlurper().parse(File(it, "source.json")) as? Map<*, *> }
    .orEmpty()
val first = sourceManifests.singleOrNull()

cloudstream {
    description = (first?.get("description") as? String)
        ?: sourceManifests.mapNotNull { it["name"] as? String }.joinToString(", ").ifEmpty { "JS sources" }
    authors = (first?.get("authors") as? List<*>)?.filterIsInstance<String>()?.takeIf { it.isNotEmpty() }
        ?: sourceManifests.mapNotNull { it["name"] as? String }.ifEmpty { listOf(project.name) }

    status = 1

    tvTypes = listOf("Live")
    language = "en"
}

android {
    namespace = "com.live"
}
