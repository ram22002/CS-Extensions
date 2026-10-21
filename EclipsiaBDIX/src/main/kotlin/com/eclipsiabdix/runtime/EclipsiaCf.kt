package com.eclipsiabdix

import android.annotation.SuppressLint
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
import okhttp3.Interceptor
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume

internal object EclipsiaCf {

    data class Clearance(
        val host: String,
        val userAgent: String,
        val cookies: String,
        val obtainedAt: Long,
        val hasClearanceCookie: Boolean,
    ) {
        fun fresh(now: Long = System.currentTimeMillis()) = now - obtainedAt < TTL_MS
    }

    private const val TTL_MS = 25 * 60_000L
    private const val SOLVE_TIMEOUT_MS = 30_000L
    private const val POLL_MS = 400L
    private const val FAIL_COOLDOWN_MS = 60_000L

    private val cache = ConcurrentHashMap<String, Clearance>()
    private val locks = ConcurrentHashMap<String, Mutex>()
    private val failedAt = ConcurrentHashMap<String, Long>()

    private fun lockFor(host: String) = locks.getOrPut(host) { Mutex() }

    fun hostOf(url: String): String? =
        runCatching { URI(url).host?.lowercase() }.getOrNull()?.takeIf { it.isNotBlank() }

    private fun originOf(url: String): String? = runCatching {
        val u = URI(url)
        val port = if (u.port > 0) ":${u.port}" else ""
        "${u.scheme}://${u.host}$port/"
    }.getOrNull()

    private val BODY_MARKERS = listOf(
        "<title>just a moment", "cf-browser-verification", "/cdn-cgi/challenge-platform/",
        "_cf_chl_opt", "cf-chl-bypass", "challenges.cloudflare.com/turnstile", "attention required! | cloudflare",
    )

    fun isChallenge(status: Int, headers: Map<String, String>, head: String): Boolean {
        if (status != 403 && status != 429 && status != 503) return false
        val mitigated = headers["cf-mitigated"]?.contains("challenge", ignoreCase = true) == true
        if (mitigated) return true
        val viaCf = headers["server"]?.contains("cloudflare", ignoreCase = true) == true ||
            headers.containsKey("cf-ray")
        if (!viaCf) return false
        val lower = head.lowercase()
        return BODY_MARKERS.any { lower.contains(it) }
    }

    fun cached(host: String): Clearance? = cache[host]?.takeIf { it.fresh() }

    fun invalidate(host: String) {
        cache.remove(host)
    }

    fun headersFor(url: String): Map<String, String> {
        val host = hostOf(url) ?: return emptyMap()
        val c = cached(host) ?: return emptyMap()
        return mapOf("Cookie" to c.cookies, "User-Agent" to c.userAgent)
    }

    fun mergeCookies(base: String?, override: String): String {
        val map = LinkedHashMap<String, String>()
        fun add(raw: String?) {
            raw.orEmpty().split(';').forEach { part ->
                val p = part.trim()
                val eq = p.indexOf('=')
                if (eq > 0) map[p.substring(0, eq)] = p.substring(eq + 1)
            }
        }
        add(base)
        add(override)
        return map.entries.joinToString("; ") { "${it.key}=${it.value}" }
    }

    val interceptor = Interceptor { chain ->
        val req = chain.request()
        val c = cached(req.url.host)
        if (c == null) chain.proceed(req)
        else chain.proceed(
            req.newBuilder()
                .header("Cookie", mergeCookies(req.header("Cookie"), c.cookies))
                .header("User-Agent", c.userAgent)
                .build()
        )
    }

    suspend fun obtain(url: String, stale: Clearance? = null): Clearance? {
        val host = hostOf(url) ?: return null
        cached(host)?.let { if (it.cookies != stale?.cookies) return it }

        failedAt[host]?.let { if (System.currentTimeMillis() - it < FAIL_COOLDOWN_MS) return null }

        return lockFor(host).withLock {
            cached(host)?.let { if (it.cookies != stale?.cookies) return@withLock it }

            val solved = withTimeoutOrNull(SOLVE_TIMEOUT_MS + 5_000) { solve(host, url) }
            if (solved != null) {
                cache[host] = solved
                failedAt.remove(host)
            } else {
                cache.remove(host)
                failedAt[host] = System.currentTimeMillis()
            }
            solved
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private suspend fun solve(host: String, url: String): Clearance? {
        val target = originOf(url) ?: return null
        val cookieManager = CookieManager.getInstance()
        var view: WebView? = null
        try {
            val (wv, ua) = withContext(Dispatchers.Main) {
                val v = WebView(EclipsiaStore.context)
                v.settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    blockNetworkLoads = false
                    loadsImagesAutomatically = false
                    cacheMode = WebSettings.LOAD_DEFAULT
                    mediaPlaybackRequiresUserGesture = true
                    javaScriptCanOpenWindowsAutomatically = false
                    setSupportMultipleWindows(false)
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

                    override fun onReceivedError(
                        view: WebView?, request: WebResourceRequest?, error: WebResourceError?
                    ) {
                    }
                }
                cont.invokeOnCancellation { }
                wv.loadUrl(if (url.startsWith("http")) url else target)
            }

            val deadline = System.currentTimeMillis() + SOLVE_TIMEOUT_MS
            var clearStreak = 0
            while (System.currentTimeMillis() < deadline) {
                val cookies = withContext(Dispatchers.Main) { cookieManager.getCookie(target) }.orEmpty()
                val hasClearance = cookies.contains("cf_clearance=")
                val title = withContext(Dispatchers.Main) { evalString(wv, "document.title") }
                val stillChallenge = title.contains("just a moment", true) ||
                    title.contains("attention required", true) ||
                    title.contains("checking your browser", true)

                if (hasClearance && !stillChallenge) {
                    return Clearance(host, ua, cookies, System.currentTimeMillis(), true)
                }
                if (!stillChallenge && title.isNotBlank()) clearStreak++ else clearStreak = 0
                if (clearStreak >= 5 && cookies.isNotBlank()) {
                    return Clearance(host, ua, cookies, System.currentTimeMillis(), false)
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