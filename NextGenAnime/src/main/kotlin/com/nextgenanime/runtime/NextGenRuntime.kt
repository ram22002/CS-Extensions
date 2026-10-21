package com.nextgenanime

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

object NextGenRuntime {
    private const val TIMEOUT_MS = 60_000L
    private const val BASE_URL = "https://eclipsia.local/"
    private var gate: Semaphore? = null
    private var gateLimit = 0

    @Synchronized
    private fun currentGate(): Semaphore {
        val n = NextGenRepository.effectiveConcurrency()
        val current = gate
        if (current == null || n != gateLimit) {
            val fresh = Semaphore(n)
            gate = fresh
            gateLimit = n
            return fresh
        }
        return current
    }

    suspend fun getStreams(
        scraper: NextGenScraper,
        tmdbId: String,
        mediaType: String,
        season: Int?,
        episode: Int?,
    ): List<NextGenStream> {
        val args = JSONObject()
            .put("tmdbId", tmdbId)
            .put("mediaType", mediaType)
            .put("season", season ?: JSONObject.NULL)
            .put("episode", episode ?: JSONObject.NULL)
            .toString()
        val raw = execute(scraper, "run", args, NextGenStore.settingsJson(scraper.id)) ?: return emptyList()
        return NextGenStream.parseList(raw)
    }

    suspend fun settingsLayout(scraper: NextGenScraper): JSONArray {
        val raw = execute(scraper, "settings", "{}", "{}") ?: return JSONArray()
        return runCatching { JSONArray(raw) }.getOrDefault(JSONArray())
    }

    internal class Holder {
        @Volatile
        var view: WebView? = null
        @Volatile
        var closed = false
    }

    private suspend fun execute(
        scraper: NextGenScraper,
        mode: String,
        argsJson: String,
        settingsJson: String
    ): String? {
        val code = NextGenRepository.readCode(scraper) ?: return null
        return currentGate().withPermit {
            val holder = Holder()
            val result = CompletableDeferred<String>()
            val bridge = Bridge(scraper, code, settingsJson, argsJson, NextGenStore.tmdbKey(), result, holder)
            try {
                withTimeout(TIMEOUT_MS) {
                    val wv = createWebView(bridge, holder)
                    withContext(Dispatchers.Main) { wv.evaluateJavascript("__eclipsia_start('$mode')", null) }
                    result.await()
                }
            } catch (e: TimeoutCancellationException) {
                currentCoroutineContext().ensureActive()
                null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            } finally {
                holder.closed = true
                bridge.close()
                withContext(NonCancellable + Dispatchers.Main) {
                    holder.view?.let { wv ->
                        runCatching {
                            wv.stopLoading()
                            wv.removeJavascriptInterface("NextGenNative")
                            wv.loadUrl("about:blank")
                            wv.destroy()
                        }
                    }
                    holder.view = null
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private suspend fun createWebView(bridge: Bridge, holder: Holder): WebView =
        withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { cont ->
                fun fail(why: String) {
                    if (cont.isActive) cont.resumeWithException(IllegalStateException(why))
                }
                val wv = try {
                    WebView(NextGenStore.context)
                } catch (e: Exception) {
                    fail("cannot create WebView: ${e.message}")
                    return@suspendCancellableCoroutine
                }
                holder.view = wv
                wv.settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = false
                    allowFileAccess = false
                    allowContentAccess = false
                    blockNetworkLoads = true
                    loadsImagesAutomatically = false
                    cacheMode = WebSettings.LOAD_NO_CACHE
                }
                wv.addJavascriptInterface(bridge, "NextGenNative")
                wv.webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                        return true
                    }
                }
                wv.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        if (cont.isActive) cont.resume(wv)
                    }

                    @Suppress("OVERRIDE_DEPRECATION", "DEPRECATION")
                    override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
                        fail("page load error $errorCode: $description")
                    }

                    override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                        fail("WebView render process gone")
                        return true
                    }
                }
                try {
                    wv.loadDataWithBaseURL(BASE_URL, JsAssets.page(), "text/html", "UTF-8", null)
                } catch (e: Exception) {
                    fail("loadData failed: ${e.message}")
                }
            }
        }

    internal class Bridge(
        private val scraper: NextGenScraper,
        private val code: String,
        private val settingsJson: String,
        private val argsJson: String,
        private val tmdbKey: String,
        private val result: CompletableDeferred<String>,
        private val holder: Holder,
    ) {
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private val main = Handler(Looper.getMainLooper())

        fun close() = scope.cancel()

        @JavascriptInterface
        fun getScraperId(): String = scraper.id
        @JavascriptInterface
        fun getPluginCode(): String = code
        @JavascriptInterface
        fun getSettings(): String = settingsJson
        @JavascriptInterface
        fun getCallArgs(): String = argsJson
        @JavascriptInterface
        fun getTmdbKey(): String = tmdbKey
        @JavascriptInterface
        fun capture(json: String) {
            result.complete(json)
        }

        @JavascriptInterface
        fun fetch(
            id: Int,
            url: String,
            method: String,
            headersJson: String,
            bodyB64: String,
            hasBody: Boolean,
            follow: Boolean
        ) {
            scope.launch {
                val json = NextGenHttp.execute(url, method, headersJson, bodyB64, hasBody, follow)

                val literal = JSONObject.quote(json).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
                main.post {
                    val wv = holder.view
                    if (!holder.closed && wv != null) {
                        wv.evaluateJavascript("window.__eclipsia_onFetch($id,$literal)", null)
                    }
                }
            }
        }
    }
}
