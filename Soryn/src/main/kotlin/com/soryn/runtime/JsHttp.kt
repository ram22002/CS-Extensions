package com.soryn

import android.util.Base64
import com.lagradost.cloudstream3.app
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

internal object JsHttp {
    const val DEFAULT_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
    private const val MAX_BODY_BYTES = 4 * 1_048_576
    private const val MAX_HEADER_CHARS = 8 * 1024
    private const val TRUNCATED = "\n...[truncated]"

    fun execute(
        url: String,
        method: String,
        headersJson: String,
        bodyB64: String,
        hasBody: Boolean,
        follow: Boolean,
    ): String = try {
        val headers = JSONObject(headersJson)
        val builder = Request.Builder().url(url)

        var hasUserAgent = false
        var contentType: String? = null
        for (key in headers.keys()) {
            val value = headers.optString(key)
            when {
                key.equals("accept-encoding", true) -> Unit
                else -> {
                    if (key.equals("content-type", true)) contentType = value
                    if (JsHeaders.isValid(key, value)) {
                        builder.header(key, value)
                        if (key.equals("user-agent", true)) hasUserAgent = true
                    }
                }
            }
        }
        if (!hasUserAgent) builder.header("User-Agent", DEFAULT_UA)

        val m = method.uppercase()
        val body = when (m) {
            "GET", "HEAD" -> null
            else -> {
                val bytes = if (hasBody) Base64.decode(bodyB64, Base64.DEFAULT) else ByteArray(0)
                val type = contentType
                    ?: if (m == "POST") "application/x-www-form-urlencoded" else "application/json"
                bytes.toRequestBody(type.toMediaTypeOrNull())
            }
        }
        builder.method(m, body)

        val client = app.baseClient.newBuilder()
            .followRedirects(follow)
            .followSslRedirects(follow)
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()

        client.newCall(builder.build()).execute().use { resp ->
            var truncated = false
            val bytes: ByteArray = resp.body?.let { rb ->
                val source = rb.source()
                source.request((MAX_BODY_BYTES + 1).toLong())
                val available = minOf(source.buffer.size, (MAX_BODY_BYTES + 1).toLong())
                if (available > MAX_BODY_BYTES) {
                    truncated = true
                    source.buffer.readByteArray(MAX_BODY_BYTES.toLong())
                } else {
                    source.buffer.readByteArray(available)
                }
            } ?: ByteArray(0)

            val outHeaders = JSONObject()
            for (name in resp.headers.names()) {
                var joined = resp.headers.values(name).joinToString(",")
                if (joined.length > MAX_HEADER_CHARS) joined = joined.take(MAX_HEADER_CHARS) + TRUNCATED
                outHeaders.put(name.lowercase(), joined)
            }

            JSONObject()
                .put("status", resp.code)
                .put("statusText", resp.message)
                .put("url", resp.request.url.toString())
                .put("headers", outHeaders)
                .put("b64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                .put("charset", resp.body?.contentType()?.charset()?.name() ?: "utf-8")
                .put("truncated", truncated)
                .toString()
        }
    } catch (e: Exception) {
        JSONObject()
            .put("status", 0)
            .put("statusText", e.message ?: e.javaClass.simpleName)
            .put("url", url)
            .put("headers", JSONObject())
            .put("b64", "")
            .put("charset", "utf-8")
            .put("truncated", false)
            .toString()
    }
}

internal object JsHeaders {
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
        for ((k, v) in raw) {
            val name = k.trim()
            val value = v.trim()
            if (name.isEmpty() || value.isEmpty()) continue
            if (name.lowercase() in FORBIDDEN) continue
            if (!isValid(name, value)) continue
            out[name] = value
        }
        return out
    }

    fun find(headers: Map<String, String>, name: String): String? =
        headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value

    fun without(headers: Map<String, String>, name: String): Map<String, String> =
        headers.filterKeys { !it.equals(name, ignoreCase = true) }
}
