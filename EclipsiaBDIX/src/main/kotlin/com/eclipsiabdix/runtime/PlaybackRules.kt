package com.eclipsiabdix

import java.net.URLDecoder

enum class MediaKind { HLS, DASH, SMOOTH, PROGRESSIVE, TORRENT, MAGNET }

object MediaKinds {

    fun fromHint(type: String?): MediaKind? = when (type?.trim()?.lowercase()) {
        "hls", "m3u8" -> MediaKind.HLS
        "dash", "mpd" -> MediaKind.DASH
        "smoothstreaming", "ss", "ism" -> MediaKind.SMOOTH
        "mp4", "mkv", "webm", "m4v", "mov", "video", "progressive", "file" -> MediaKind.PROGRESSIVE
        else -> null
    }

    private val PROGRESSIVE_EXT = setOf(
        "mp4", "m4v", "mkv", "webm", "mov", "avi", "flv", "ts", "m2ts", "mts", "3gp", "wmv", "ogv",
        "mp3", "m4a", "aac", "ogg", "opus", "flac", "wav",
    )

    private val EMBEDDED_CONTAINER = Regex("""\.(mp4|mkv|webm|m4v)(/|&|$)""")

    fun fromUrl(url: String): MediaKind? {
        val trimmed = url.trim()
        if (trimmed.startsWith("magnet:", ignoreCase = true)) return MediaKind.MAGNET

        val noFragment = trimmed.substringBefore('#')
        val path = noFragment.substringBefore('?').lowercase()
        val query = noFragment.substringAfter('?', "").let {
            runCatching { URLDecoder.decode(it, "UTF-8") }.getOrDefault(it)
        }.lowercase()

        val ext = path.substringAfterLast('/').substringAfterLast('.', "")
        when {
            ext == "m3u8" || ext == "m3u" -> return MediaKind.HLS
            ext == "mpd" -> return MediaKind.DASH
            ext == "torrent" -> return MediaKind.TORRENT
            path.contains(".ism/manifest") || path.contains(".isml/manifest") -> return MediaKind.SMOOTH
            ext in PROGRESSIVE_EXT -> return MediaKind.PROGRESSIVE
        }

        if (path.contains("m3u8")) return MediaKind.HLS
        if (query.contains(".m3u8")) return MediaKind.HLS
        if (query.contains(".mpd")) return MediaKind.DASH
        if (EMBEDDED_CONTAINER.containsMatchIn(path) || EMBEDDED_CONTAINER.containsMatchIn(query)) return MediaKind.PROGRESSIVE
        return null
    }

    fun fromContentType(contentType: String?): MediaKind? {
        val ct = contentType?.substringBefore(';')?.trim()?.lowercase().orEmpty()
        return when {
            ct.isEmpty() -> null
            ct.contains("mpegurl") -> MediaKind.HLS
            ct.contains("dash+xml") -> MediaKind.DASH
            ct.contains("vnd.ms-sstr") -> MediaKind.SMOOTH
            ct == "application/x-bittorrent" -> MediaKind.TORRENT
            ct.startsWith("video/") || ct.startsWith("audio/") -> MediaKind.PROGRESSIVE
            ct == "application/mp4" || ct == "application/ogg" -> MediaKind.PROGRESSIVE
            else -> null
        }
    }

    fun fromBytes(b: ByteArray, len: Int = b.size): MediaKind? {
        val n = minOf(len, b.size)
        if (n < 4) return null

        if (n >= 8 && b[4] == 'f'.code.toByte() && b[5] == 't'.code.toByte() && b[6] == 'y'.code.toByte() && b[7] == 'p'.code.toByte()) {
            return MediaKind.PROGRESSIVE
        }
        if (n >= 8 && (ascii(b, 4, 4) == "moov" || ascii(b, 4, 4) == "mdat" || ascii(b, 4, 4) == "styp" ||
                ascii(b, 4, 4) == "free" || ascii(b, 4, 4) == "wide" || ascii(b, 4, 4) == "skip")) return MediaKind.PROGRESSIVE
        if ((b[0].toInt() and 0xFF) == 0x1A && (b[1].toInt() and 0xFF) == 0x45 &&
            (b[2].toInt() and 0xFF) == 0xDF && (b[3].toInt() and 0xFF) == 0xA3
        ) return MediaKind.PROGRESSIVE
        if (ascii(b, 0, 3) == "FLV" || ascii(b, 0, 4) == "OggS" || ascii(b, 0, 3) == "ID3") return MediaKind.PROGRESSIVE
        if (n >= 12 && ascii(b, 0, 4) == "RIFF" && ascii(b, 8, 4).startsWith("AVI")) return MediaKind.PROGRESSIVE
        if ((b[0].toInt() and 0xFF) == 0x47 && n > 188 && (b[188].toInt() and 0xFF) == 0x47) return MediaKind.PROGRESSIVE

        var start = 0
        if (n >= 3 && (b[0].toInt() and 0xFF) == 0xEF && (b[1].toInt() and 0xFF) == 0xBB && (b[2].toInt() and 0xFF) == 0xBF) start = 3
        while (start < n && b[start].toInt().let { it == 0x20 || it == 0x09 || it == 0x0A || it == 0x0D }) start++
        if (start >= n) return null
        val text = String(b, start, minOf(n - start, 4096), Charsets.ISO_8859_1)
        return when {
            text.startsWith("#EXTM3U") -> MediaKind.HLS
            text.startsWith("<") && text.contains("<MPD") -> MediaKind.DASH
            text.startsWith("<") && text.contains("<SmoothStreamingMedia") -> MediaKind.SMOOTH
            text.startsWith("d8:announce") || text.startsWith("d10:created") || text.startsWith("d4:info") -> MediaKind.TORRENT
            else -> null
        }
    }

    private fun ascii(b: ByteArray, off: Int, len: Int): String {
        if (off + len > b.size) return ""
        return String(b, off, len, Charsets.ISO_8859_1)
    }

    fun classify(finalUrl: String, contentType: String?, head: ByteArray): MediaKind? =
        fromBytes(head) ?: fromContentType(contentType) ?: fromUrl(finalUrl)

    private val RESOLUTION = Regex("""RESOLUTION=(\d+)x(\d+)""", RegexOption.IGNORE_CASE)

    fun maxHlsHeight(playlist: String): Int? =
        RESOLUTION.findAll(playlist).mapNotNull { it.groupValues[2].toIntOrNull() }.maxOrNull()
}

object HeaderRules {
    private val TOKEN = Regex("^[!#$%&'*+\\-.^_`|~0-9A-Za-z]+$")

    private val FORBIDDEN = setOf(
        "range", "accept-encoding", "content-length", "connection", "keep-alive",
        "transfer-encoding", "te", "upgrade", "proxy-connection",
    )

    fun isValid(name: String, value: String): Boolean {
        if (!TOKEN.matches(name)) return false
        for (c in value) {
            if (c == '\t') continue
            if (c < ' ' || c > '~') return false
        }
        return true
    }

    fun sanitize(raw: Map<String, String>): Map<String, String> {
        val out = LinkedHashMap<String, String>()
        val keyByLower = HashMap<String, String>()
        for ((k, v) in raw) {
            val name = k.trim()
            val value = v.trim()
            if (name.isEmpty() || value.isEmpty()) continue
            val lower = name.lowercase()
            if (lower in FORBIDDEN) continue
            if (!isValid(name, value)) continue
            keyByLower[lower]?.let { out.remove(it) }
            keyByLower[lower] = name
            out[name] = value
        }
        return out
    }

    fun find(headers: Map<String, String>, name: String): String? =
        headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value

    fun without(headers: Map<String, String>, name: String): Map<String, String> =
        headers.filterKeys { !it.equals(name, ignoreCase = true) }

    fun normalizeUrl(raw: String): String? {
        var u = raw.trim().trim('"', '\'')
        if (u.isEmpty()) return null
        if (u.startsWith("//")) u = "https:$u"
        val lower = u.lowercase()
        if (lower.startsWith("data:")) return if (DataUrls.parsePlaylist(u) != null) u else null
        if (!(lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("magnet:"))) return null
        if (lower.startsWith("magnet:")) return u
        u = u.replace("\\/", "/").replace("&amp;", "&")
        return encodeIllegal(u)
    }

    private const val HEX = "0123456789ABCDEF"

    fun encodeIllegal(url: String): String {
        val out = StringBuilder(url.length + 16)
        var i = 0
        while (i < url.length) {
            val cp = url.codePointAt(i)
            val n = Character.charCount(cp)
            val bad = cp <= 0x20 || cp >= 0x7F || cp == '"'.code || cp == '<'.code || cp == '>'.code ||
                cp == '\\'.code || cp == '^'.code || cp == '`'.code || cp == '{'.code || cp == '|'.code || cp == '}'.code
            if (!bad) {
                out.append(url, i, i + n)
            } else {
                for (byte in url.substring(i, i + n).toByteArray(Charsets.UTF_8)) {
                    val v = byte.toInt() and 0xFF
                    out.append('%').append(HEX[v shr 4]).append(HEX[v and 0xF])
                }
            }
            i += n
        }
        return out.toString()
    }
}

object DataUrls {
    class Payload(val base64: Boolean, val data: String)

    private val PLAYLIST_MIMES = setOf(
        "application/vnd.apple.mpegurl", "application/x-mpegurl", "application/mpegurl",
        "audio/mpegurl", "audio/x-mpegurl",
    )

    fun parsePlaylist(url: String): Payload? {
        val u = url.trim()
        if (!u.startsWith("data:", ignoreCase = true)) return null
        val comma = u.indexOf(',')
        if (comma < 0) return null
        val meta = u.substring(5, comma).split(';').map { it.trim().lowercase() }
        if (meta.firstOrNull() !in PLAYLIST_MIMES) return null
        return Payload(base64 = "base64" in meta, data = u.substring(comma + 1))
    }

    fun decodePlain(data: String): String =
        runCatching { URLDecoder.decode(data.replace("+", "%2B"), "UTF-8") }.getOrDefault(data)
}

object QualityParser {
    private val resolutionRegex = Regex("(\\d{3,4})\\s*[x×]\\s*(\\d{3,4})")
    private val heightRegex = Regex("\\b(\\d{3,4})\\s*p\\b")
    private val uhdRegex = Regex("\\b(4k|uhd)\\b")

    fun heightOf(text: String?): Int? {
        text ?: return null
        val t = text.lowercase()
        if (uhdRegex.containsMatchIn(t)) return 2160
        heightRegex.find(t)?.groupValues?.get(1)?.toIntOrNull()?.let { return it }
        resolutionRegex.find(t)?.groupValues?.get(2)?.toIntOrNull()?.let { return it }
        t.trim().toIntOrNull()?.takeIf { it in 144..4320 }?.let { return it }
        return null
    }
}

object SubtitleLabels {
    fun label(language: String, name: String?, languageName: (String) -> String?): String {
        val raw = language.trim()
        val base = raw.substringBefore('-').substringBefore('_').lowercase()
        val mapped = if (base.length == 2 || base.length == 3) runCatching { languageName(base) }.getOrNull() else null
        val lang = if (raw.length <= 8 && !mapped.isNullOrBlank()) mapped else raw
        val n = name?.trim().orEmpty()
        return when {
            n.isEmpty() || n.equals(raw, true) || n.equals(lang, true) -> lang
            n.contains(lang, true) -> n
            else -> "$lang ($n)"
        }
    }
}
