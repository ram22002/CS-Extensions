import groovy.json.JsonSlurper

val sorynNames = File(rootDir, "sources").listFiles()
    ?.filter { it.isDirectory && it.name != "live" && !it.name.startsWith("_") && !it.name.startsWith(".") && File(it, "source.json").exists() }
    ?.sortedBy { it.name }
    ?.mapNotNull { (JsonSlurper().parse(File(it, "source.json")) as? Map<*, *>)?.get("name") as? String }
    .orEmpty()
val sorynPluginName = (sorynNames.singleOrNull() ?: "Soryn").replace(Regex("[/\\\\:<>\"?*|]"), "").trim().trim('.').ifEmpty { "Soryn" }

rootProject.name = "CloudstreamPlugins"

val disabled = listOf<String>()

File(rootDir, ".").eachDir { dir ->
    if (!disabled.contains(dir.name) && File(dir, "build.gradle.kts").exists()) {
        include(dir.name)
        if (dir.name == "Soryn") project(":Soryn").name = sorynPluginName
    }
}

fun File.eachDir(block: (File) -> Unit) {
    listFiles()?.filter { it.isDirectory }?.forEach { block(it) }
}
