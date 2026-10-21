package com.nextgenbdix

import android.util.Base64
import com.lagradost.cloudstream3.app
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

internal object NextGenHttp {
    const val DEFAULT_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"
    private const val MAX_BODY_BYTES = 4 * 1_048_576
    private const val MAX_HEADER_CHARS = 8 * 1024
    private const val TRUNCATED = "\n...[truncated]"

    private class Raw(
        val code: Int,
        val message: String,
        val finalUrl: String,
        val headers: JSONObject,
        val bytes: ByteArray,
        val truncated: Boolean,
        val charset: String,
    )

    private fun send(client: OkHttpClient, request: Request): Raw =
        client.newCall(request).execute().use { resp ->
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
            Raw(
                resp.code, resp.message, resp.request.url.toString(), outHeaders, bytes, truncated,
                resp.body?.contentType()?.charset()?.name() ?: "utf-8",
            )
        }

    private fun Raw.isCfChallenge(): Boolean {
        if (code != 403 && code != 429 && code != 503) return false
        val map = HashMap<String, String>()
        for (k in headers.keys()) map[k] = headers.optString(k)
        val head = String(bytes, 0, minOf(bytes.size, 8192), Charsets.UTF_8)
        return NextGenCf.isChallenge(code, map, head)
    }

    suspend fun execute(
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
                    if (HeaderRules.isValid(key, value)) {
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
        val request = builder.build()

        val client = app.baseClient.newBuilder()
            .followRedirects(follow)
            .followSslRedirects(follow)
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addNetworkInterceptor(NextGenCf.interceptor)
            .build()

        var raw = withContext(Dispatchers.IO) { send(client, request) }

        if (raw.isCfChallenge()) {
            val host = NextGenCf.hostOf(url)
            val stale = host?.let { NextGenCf.cached(it) }
            val solveUrl = if (m == "GET" || m == "HEAD") url else url.substringBefore("://") + "://" + (host ?: "")
            val clearance = NextGenCf.obtain(solveUrl, stale)
            if (clearance != null) {
                raw = withContext(Dispatchers.IO) { send(client, request) }
            }
        }

        JSONObject()
            .put("status", raw.code)
            .put("statusText", raw.message)
            .put("url", raw.finalUrl)
            .put("headers", raw.headers)
            .put("b64", Base64.encodeToString(raw.bytes, Base64.NO_WRAP))
            .put("charset", raw.charset)
            .put("truncated", raw.truncated)
            .toString()
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
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
