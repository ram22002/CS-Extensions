package com.nextgen.reelfren

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume

internal object ReelFrenCf {

    data class Clearance(
        val host: String,
        val userAgent: String,
        val cookies: String,
        val obtainedAt: Long
    ) {
        fun fresh(now: Long = System.currentTimeMillis()) = now - obtainedAt < TTL_MS
    }

    private const val TTL_MS = 25 * 60_000L
    private const val SOLVE_TIMEOUT_MS = 30_000L
    private const val POLL_MS = 400L

    var appContext: Context? = null

    private val cache = ConcurrentHashMap<String, Clearance>()
    private val locks = ConcurrentHashMap<String, Mutex>()

    private fun lockFor(host: String) = locks.getOrPut(host) { Mutex() }

    fun hostOf(url: String): String? =
        runCatching { URI(url).host?.lowercase() }.getOrNull()?.takeIf { it.isNotBlank() }

    private fun originOf(url: String): String? = runCatching {
        val u = URI(url)
        val port = if (u.port > 0) ":${u.port}" else ""
        "${u.scheme}://${u.host}$port/"
    }.getOrNull()

    fun cached(host: String): Clearance? = cache[host]?.takeIf { it.fresh() }

    fun headersFor(url: String): Map<String, String> {
        val host = hostOf(url) ?: return emptyMap()
        val c = cached(host) ?: return emptyMap()
        return mapOf("Cookie" to c.cookies, "User-Agent" to c.userAgent)
    }

    suspend fun obtain(url: String): Clearance? {
        val host = hostOf(url) ?: return null
        cached(host)?.let { return it }

        return lockFor(host).withLock {
            cached(host)?.let { return@withLock it }

            val solved = withTimeoutOrNull(SOLVE_TIMEOUT_MS + 5_000) { solve(host, url) }
            if (solved != null) {
                cache[host] = solved
            }
            solved
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private suspend fun solve(host: String, url: String): Clearance? {
        val ctx = appContext ?: return null
        val target = originOf(url) ?: return null
        val cookieManager = CookieManager.getInstance()
        var view: WebView? = null
        try {
            val (wv, ua) = withContext(Dispatchers.Main) {
                val v = WebView(ctx)
                v.settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    loadsImagesAutomatically = false
                    cacheMode = WebSettings.LOAD_DEFAULT
                    mediaPlaybackRequiresUserGesture = true
                }
                cookieManager.setAcceptCookie(true)
                cookieManager.setAcceptThirdPartyCookies(v, true)
                v.layout(0, 0, 1080, 1920)
                v.onResume()
                v.resumeTimers()
                v to v.settings.userAgentString
            }
            view = wv

            suspendCancellableCoroutine { cont ->
                wv.webViewClient = object : WebViewClient() {
                    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) = Unit
                    override fun onPageFinished(view: WebView?, url: String?) {
                        if (cont.isActive) cont.resume(Unit)
                    }
                    override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) = Unit
                }
                wv.loadUrl(if (url.startsWith("http")) url else target)
            }

            val deadline = System.currentTimeMillis() + SOLVE_TIMEOUT_MS
            var clearStreak = 0
            while (System.currentTimeMillis() < deadline) {
                // Try clicking Turnstile if present
                withContext(Dispatchers.Main) {
                    wv.evaluateJavascript("""
                        (function() {
                            try {
                                var s = document.querySelector('#challenge-stage, #turnstile-wrapper');
                                if (s) s.click();
                            } catch(e) {}
                        })();
                    """.trimIndent(), null)
                }

                val cookies = withContext(Dispatchers.Main) { cookieManager.getCookie(target) }.orEmpty()
                val hasClearance = cookies.contains("cf_clearance=")
                val title = withContext(Dispatchers.Main) { evalString(wv, "document.title") }
                val stillChallenge = title.contains("just a moment", true) ||
                    title.contains("attention required", true) ||
                    title.contains("checking your browser", true)

                if (hasClearance && !stillChallenge) {
                    return Clearance(host, ua, cookies, System.currentTimeMillis())
                }
                if (!stillChallenge && title.isNotBlank()) clearStreak++ else clearStreak = 0
                if (clearStreak >= 4 && cookies.isNotBlank()) {
                    return Clearance(host, ua, cookies, System.currentTimeMillis())
                }
                delay(POLL_MS)
            }
            return null
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (_: Exception) {
            return null
        } finally {
            withContext(NonCancellable + Dispatchers.Main) {
                runCatching { cookieManager.flush() }
                view?.let { v ->
                    runCatching {
                        v.stopLoading()
                        v.loadUrl("about:blank")
                        v.destroy()
                    }
                }
            }
        }
    }

    private suspend fun evalString(wv: WebView, js: String): String =
        suspendCancellableCoroutine { cont ->
            wv.evaluateJavascript(js) { raw ->
                val s = raw?.trim().orEmpty()
                val out = if (s.length >= 2 && s.startsWith("\"") && s.endsWith("\"")) s.substring(1, s.length - 1) else ""
                if (cont.isActive) cont.resume(out)
            }
        }
}
