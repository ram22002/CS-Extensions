package com.eclipsia

import org.json.JSONArray
import org.json.JSONObject

data class EclipsiaSubtitle(
    val url: String,
    val language: String,
    val name: String?,
    val headers: Map<String, String>,
)

data class EclipsiaStream(
    val url: String,
    val title: String?,
    val name: String?,
    val quality: String?,
    val size: String?,
    val language: String?,
    val type: String?,
    val headers: Map<String, String>,
    val subtitles: List<EclipsiaSubtitle>,
) {
    companion object {
        fun parseList(raw: String): List<EclipsiaStream> {
            val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
            return (0 until arr.length()).mapNotNull { runCatching { parse(arr.optJSONObject(it)) }.getOrNull() }
        }

        private fun JSONObject.str(key: String): String? {
            val v = opt(key)
            if (v !is String && v !is Number && v !is Boolean) return null
            val s = v.toString().trim()
            return s.takeIf { it.isNotEmpty() && !it.contains("[object") }
        }

        private fun JSONObject.headerMap(key: String): Map<String, String> {
            val o = optJSONObject(key) ?: return emptyMap()
            val raw = LinkedHashMap<String, String>()
            for (k in o.keys()) {
                val v = o.opt(k)
                if (v !is String && v !is Number && v !is Boolean) continue
                raw[k] = v.toString()
            }
            return HeaderRules.sanitize(raw)
        }

        private fun parse(o: JSONObject?): EclipsiaStream? {
            o ?: return null

            val rawUrl = o.opt("url")
            val url0 = when (rawUrl) {
                is String -> rawUrl
                is JSONObject -> rawUrl.optString("url")
                else -> ""
            }
            val url = HeaderRules.normalizeUrl(url0) ?: return null

            val subs = o.optJSONArray("subtitles")?.let { a ->
                (0 until a.length()).mapNotNull { i ->
                    val s = a.optJSONObject(i) ?: return@mapNotNull null
                    val su = HeaderRules.normalizeUrl(s.str("url") ?: return@mapNotNull null) ?: return@mapNotNull null
                    EclipsiaSubtitle(su, s.str("language") ?: "Unknown", s.str("name"), s.headerMap("headers"))
                }
            } ?: emptyList()

            return EclipsiaStream(
                url = url,
                title = o.str("title"),
                name = o.str("name"),
                quality = o.str("quality"),
                size = o.str("size"),
                language = o.str("language"),
                type = o.str("type")?.lowercase(),
                headers = o.headerMap("headers"),
                subtitles = subs,
            )
        }
    }
}
