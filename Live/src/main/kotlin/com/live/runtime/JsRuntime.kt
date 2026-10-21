package com.live

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

enum class JsScript { CATALOG, STREAM }

object JsRuntime {
    private const val TIMEOUT_MS = 60_000L
    private const val BASE_URL = "https://playz.local/"
    private val gate = Semaphore(3)

    private val cache = ConcurrentHashMap<String, String>()

    suspend fun call(source: JsSourceDef, variant: JsVariant, script: JsScript, fn: String, arg: String?): String? {
        val code = when (script) {
            JsScript.CATALOG -> source.catalogJs
            JsScript.STREAM -> source.streamJs
        }
        val manifest = buildManifest(source, variant)
        val callArgs = JSONObject().put("fn", fn).put("arg", arg ?: JSONObject.NULL).toString()

        return gate.withPermit {
            val holder = Holder()
            val result = CompletableDeferred<String>()
            val bridge = Bridge(source.id, code, manifest, JsStore.settingsJson(source.id), callArgs, result, holder)
            try {
                withTimeout(TIMEOUT_MS) {
                    val wv = createWebView(bridge, holder)
                    withContext(Dispatchers.Main) { wv.evaluateJavascript("__playz_start()", null) }
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
                            wv.removeJavascriptInterface("PlayZNative")
                            wv.loadUrl("about:blank")
                            wv.destroy()
                        }
                    }
                    holder.view = null
                }
            }
        }
    }

    private fun buildManifest(source: JsSourceDef, variant: JsVariant): String {
        val m = JSONObject()
            .put("id", source.id).put("variantId", variant.id).put("name", variant.name)
            .put("version", source.version).put("baseUrl", source.baseUrl).put("lang", source.lang)
        for (cfg in listOf(source.configJson, variant.configJson)) {
            val o = runCatching { JSONObject(cfg) }.getOrNull() ?: continue
            for (k in o.keys()) m.put(k, o.get(k))
        }
        return m.toString()
    }

    internal class Holder {
        @Volatile var view: WebView? = null
        @Volatile var closed = false
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private suspend fun createWebView(bridge: Bridge, holder: Holder): WebView =
        withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { cont ->
                fun fail(why: String) {
                    if (cont.isActive) cont.resumeWithException(IllegalStateException(why))
                }
                val wv = try {
                    WebView(JsStore.context)
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
                wv.addJavascriptInterface(bridge, "PlayZNative")
                wv.webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(m: ConsoleMessage): Boolean = true
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
        private val sourceId: String,
        private val code: String,
        private val manifest: String,
        private val settings: String,
        private val argsJson: String,
        private val result: CompletableDeferred<String>,
        private val holder: Holder,
    ) {
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private val main = Handler(Looper.getMainLooper())

        fun close() = scope.cancel()

        @JavascriptInterface fun getSourceId(): String = sourceId
        @JavascriptInterface fun getManifest(): String = manifest
        @JavascriptInterface fun getSettings(): String = settings
        @JavascriptInterface fun getPluginCode(): String = code
        @JavascriptInterface fun getCallArgs(): String = argsJson
        @JavascriptInterface fun capture(json: String) { result.complete(json) }
        @JavascriptInterface fun cacheGet(key: String): String = cache["$sourceId:$key"] ?: ""
        @JavascriptInterface fun cachePut(key: String, value: String) { cache["$sourceId:$key"] = value }

        @JavascriptInterface
        fun fetch(
            id: Int,
            url: String,
            method: String,
            headersJson: String,
            bodyB64: String,
            hasBody: Boolean,
            follow: Boolean,
        ) {
            scope.launch {
                val json = JsHttp.execute(url, method, headersJson, bodyB64, hasBody, follow)
                val literal = JSONObject.quote(json).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
                main.post {
                    val wv = holder.view
                    if (!holder.closed && wv != null) {
                        wv.evaluateJavascript("window.__playz_onFetch($id,$literal)", null)
                    }
                }
            }
        }
    }
}
