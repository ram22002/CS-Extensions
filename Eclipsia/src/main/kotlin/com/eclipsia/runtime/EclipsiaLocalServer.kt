package com.eclipsia

import android.util.Base64
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.UUID
import java.util.concurrent.Executors

internal object EclipsiaLocalServer {
    private const val MAX_PLAYLISTS = 64
    private const val PLAYLIST_MIME = "application/vnd.apple.mpegurl"

    private val store = object : LinkedHashMap<String, ByteArray>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ByteArray>?): Boolean =
            size > MAX_PLAYLISTS
    }

    private val pool = Executors.newCachedThreadPool { r ->
        Thread(r, "eclipsia-local").apply { isDaemon = true }
    }

    @Volatile
    private var server: ServerSocket? = null

    fun publish(playlist: String): String {
        val id = UUID.randomUUID().toString().replace("-", "")
        synchronized(store) { store[id] = playlist.toByteArray(Charsets.UTF_8) }
        return "http://127.0.0.1:${ensureStarted().localPort}/$id.m3u8"
    }

    private val nestedUri = Regex("URI=\"(data:[^\"]+)\"", RegexOption.IGNORE_CASE)

    private fun decodeNested(url: String): String? {
        val payload = DataUrls.parsePlaylist(url) ?: return null
        val text = runCatching {
            if (payload.base64) String(Base64.decode(payload.data, Base64.DEFAULT), Charsets.UTF_8)
            else DataUrls.decodePlain(payload.data)
        }.getOrNull() ?: return null
        return text.takeIf { it.trimStart().startsWith("#EXTM3U") }
    }

    fun publishResolved(playlist: String, depth: Int = 0): String {
        val resolved = if (depth >= 2) playlist else playlist.lines().joinToString("\n") { line ->
            when {
                line.trimStart().startsWith("data:", ignoreCase = true) ->
                    decodeNested(line.trim())?.let { publishResolved(it, depth + 1) } ?: line
                line.contains("URI=\"data:", ignoreCase = true) ->
                    nestedUri.replace(line) { m ->
                        decodeNested(m.groupValues[1])?.let { "URI=\"${publishResolved(it, depth + 1)}\"" } ?: m.value
                    }
                else -> line
            }
        }
        return publish(resolved)
    }

    @Synchronized
    private fun ensureStarted(): ServerSocket {
        server?.takeIf { !it.isClosed }?.let { return it }
        val s = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
        server = s
        pool.execute {
            while (!s.isClosed) {
                val client = try {
                    s.accept()
                } catch (e: Exception) {
                    break
                }
                pool.execute { runCatching { handle(client) } }
            }
        }
        return s
    }

    private fun handle(client: Socket) {
        client.use { sock ->
            sock.soTimeout = 10_000
            val reader = sock.getInputStream().bufferedReader(Charsets.ISO_8859_1)
            val requestLine = reader.readLine() ?: return@use
            while (true) {
                val h = reader.readLine() ?: break
                if (h.isEmpty()) break
            }
            val parts = requestLine.split(' ')
            val method = parts.getOrNull(0)
            val id = parts.getOrNull(1)?.substringBefore('?')?.trim('/')?.substringBefore('.')
            val body = id?.let { key -> synchronized(store) { store[key] } }

            val out = sock.getOutputStream()
            if (body == null || (method != "GET" && method != "HEAD")) {
                out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            } else {
                out.write(
                    ("HTTP/1.1 200 OK\r\nContent-Type: $PLAYLIST_MIME\r\n" +
                        "Content-Length: ${body.size}\r\nConnection: close\r\n\r\n").toByteArray()
                )
                if (method == "GET") out.write(body)
            }
            out.flush()
        }
    }
}
