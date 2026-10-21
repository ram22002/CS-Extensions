package com.live

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.net.Uri
import android.util.LruCache
import com.lagradost.cloudstream3.app
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

internal object PosterRenderer {
    private const val SCHEME = "playz-poster:"
    private const val DESIGN = "v10"
    private const val W = 600
    private const val H = 900
    private const val LW = 960
    private const val LH = 540
    private const val JPEG_QUALITY = 95
    private const val MAX_CACHED = 300
    private const val MAX_IMAGE_BYTES = 3L * 1024 * 1024
    private const val PARTIAL_TTL_MS = 10 * 60_000L
    private const val FAIL_TTL_MS = 10 * 60_000L
    private const val RENDER_BUDGET_MS = 8_000L
    private const val HOST_FAILS = 2
    private const val HOST_COOLDOWN_MS = 5 * 60_000L

    private val INK = 0xFFF4F4F5.toInt()
    private val MUTED = 0xFFA1A5AF.toInt()
    private val FAINT = 0xFF70747F.toInt()

    private fun accentFor(category: String): Int {
        val c = category.lowercase()
        return when {
            "cricket" in c -> 0xFF5FB48A.toInt()
            "football" in c || "soccer" in c -> 0xFF6C9BE8.toInt()
            listOf("motorsport", "formula", "racing", "f1").any { it in c } -> 0xFFE06C6C.toInt()
            "basketball" in c || "nba" in c -> 0xFFE39A5B.toInt()
            listOf("tennis", "badminton", "volleyball").any { it in c } -> 0xFFB5CC6A.toInt()
            listOf("boxing", "fight", "ufc", "mma", "wwe", "wrestling").any { it in c } -> 0xFFD97090.toInt()
            else -> 0xFF9AA3D9.toInt()
        }
    }

    private object Fonts {
        private fun load(key: String, fallback: Typeface): Typeface = runCatching {
            val dir = File(JsStore.context.cacheDir, "playz_fonts").apply { mkdirs() }
            val f = File(dir, "$key.ttf")
            if (!f.exists() || f.length() == 0L) {
                val bytes = JsFonts.bytes(key) ?: return@runCatching fallback
                val tmp = File(dir, "$key.tmp")
                tmp.writeBytes(bytes)
                tmp.renameTo(f)
            }
            Typeface.createFromFile(f)
        }.getOrDefault(fallback)

        val sans: Typeface by lazy { load("archivo_regular", Typeface.create("sans-serif", Typeface.NORMAL)) }

        val display: Typeface by lazy { load("bagnard", Typeface.create("serif", Typeface.BOLD)) }

        val brand: Typeface by lazy { load("bluunext_titling", Typeface.create("serif", Typeface.NORMAL)) }
    }

    private val images = object : LruCache<String, Bitmap>(48 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    private val baseLayers = object : LruCache<String, Bitmap>(64 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    private fun baseLayer(accent: Int, cy: Float, scale: Float, land: Boolean = false): Bitmap = synchronized(baseLayers) {
        val k = "$accent:$cy:$scale:$land"
        baseLayers.get(k)?.let { return@synchronized it }
        val bw = if (land) LW else W
        val bh = if (land) LH else H
        val b = Bitmap.createBitmap((bw * scale).toInt(), (bh * scale).toInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(b)
        c.scale(scale, scale)
        drawBackdrop(c, accent, cy, land = land)
        if (land) drawBrand(c, 50f, cx = LW / 2f, size = 26f) else drawBrand(c, 88f)
        baseLayers.put(k, b)
        b
    }
    private val failed = ConcurrentHashMap<String, Long>()

    private val FLAG_CODE = Regex("^[a-z]{2}(-[a-z]{2,3})?$")

    private fun flagCode(raw: String): String? {
        val v = raw.trim().lowercase()
        if (FLAG_CODE.matches(v)) return v.takeIf { JsFlags.has(it) }
        val name = v.substringBefore('?').substringBefore('#').substringAfterLast('/').substringBeforeLast('.')
        if (v.contains("flag") && FLAG_CODE.matches(name)) return name.takeIf { JsFlags.has(it) }
        return null
    }

    private fun flagBitmap(code: String): Bitmap? {
        val key = "flag:$code"
        images.get(key)?.let { return it }
        val bytes = JsFlags.bytes(code) ?: return null
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        images.put(key, bmp)
        return bmp
    }

    private fun imageUrl(raw: String): String? {
        val v = raw.trim()
        return when {
            v.isEmpty() -> null
            v.startsWith("http://") || v.startsWith("https://") -> v
            v.startsWith("//") -> "https:$v"
            else -> null
        }
    }

    private val urlLocks = ConcurrentHashMap<String, Any>()
    private val hostFails = ConcurrentHashMap<String, Pair<Int, Long>>()

    private fun hostOf(url: String): String = runCatching { Uri.parse(url).host }.getOrNull().orEmpty()

    private fun hostBlocked(host: String): Boolean {
        val (n, t) = hostFails[host] ?: return false
        if (n < HOST_FAILS) return false
        if (System.currentTimeMillis() - t > HOST_COOLDOWN_MS) { hostFails.remove(host); return false }
        return true
    }

    private fun noteHost(host: String, networkOk: Boolean) {
        if (networkOk) hostFails.remove(host)
        else hostFails.compute(host) { _, old -> ((old?.first ?: 0) + 1) to System.currentTimeMillis() }
    }

    private fun fetchImage(url: String): Bitmap? = synchronized(urlLocks.getOrPut(url) { Any() }) {
        images.get(url)?.let { return@synchronized it }
        failed[url]?.let { if (System.currentTimeMillis() - it < FAIL_TTL_MS) return@synchronized null }
        val host = hostOf(url)
        if (host.isNotEmpty() && hostBlocked(host)) return@synchronized null
        val res = runCatching { download(url) }
        if (host.isNotEmpty()) noteHost(host, res.isSuccess)
        val bmp = res.getOrNull()
        if (bmp != null) images.put(url, bmp) else failed[url] = System.currentTimeMillis()
        bmp
    }

    private fun download(url: String): Bitmap? {
        val client = app.baseClient.newBuilder()
            .connectTimeout(3, TimeUnit.SECONDS)
            .readTimeout(3, TimeUnit.SECONDS)
            .callTimeout(4, TimeUnit.SECONDS)
            .build()
        val req = okhttp3.Request.Builder().url(url).header("User-Agent", JsHttp.DEFAULT_UA).build()
        return client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return@use null
            val src = resp.body?.source() ?: return@use null
            src.request(MAX_IMAGE_BYTES + 1)
            if (src.buffer.size > MAX_IMAGE_BYTES) return@use null
            val bytes = src.buffer.readByteArray()
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@use null
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= 1280 || bounds.outHeight / (sample * 2) >= 1280) sample *= 2
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
        }
    }

    private fun hasVisibleContent(b: Bitmap): Boolean {
        val small = Bitmap.createScaledBitmap(b, 32, 32, true)
        val px = IntArray(32 * 32)
        small.getPixels(px, 0, 32, 0, 0, 32, 32)
        if (small !== b) small.recycle()
        var visible = 0
        for (p in px) {
            if ((p ushr 24) < 40) continue
            val r = (p shr 16) and 255
            val g = (p shr 8) and 255
            val bl = p and 255
            val lum = 0.299f * r + 0.587f * g + 0.114f * bl
            if (lum > 60f || maxOf(r, g, bl) - minOf(r, g, bl) > 40) visible++
        }
        return visible > px.size * 0.03f
    }

    fun resolve(posterUrl: String?, scale: Float = JsStore.posterListScale, backdrop: Boolean = false, horizontal: Boolean = false): String? {
        if (posterUrl == null || !posterUrl.startsWith(SCHEME)) return posterUrl
        return runCatching {
            val spec = JSONObject(Uri.decode(posterUrl.removePrefix(SCHEME)))
            if (backdrop) renderBackdrop(spec, scale) else render(spec, scale, horizontal)
        }.getOrNull()
    }

    private fun renderBackdrop(spec: JSONObject, scale: Float): String? {
        val dir = File(JsStore.context.cacheDir, "playz_posters").apply { mkdirs() }
        val key = sha1(DESIGN + "bd3" + scale + spec.toString())
        val file = File(dir, "$key.jpg")
        if (file.exists() && file.length() > 0) return Uri.fromFile(file).toString()
        val partialFile = File(dir, "$key.partial.jpg")
        if (partialFile.exists() && partialFile.length() > 0 &&
            System.currentTimeMillis() - partialFile.lastModified() < PARTIAL_TTL_MS
        ) return Uri.fromFile(partialFile).toString()

        val category = spec.optString("category").ifBlank { "Live" }
        val teamA = spec.optString("teamA").trim()
        val teamB = spec.optString("teamB").trim()
        val versus = teamA.isNotEmpty() && teamB.isNotEmpty() && teamA != teamB
        val accent = accentFor(category)

        var partial = false
        val deadline = System.currentTimeMillis() + RENDER_BUDGET_MS
        fun image(field: String): Bitmap? {
            val rawValue = spec.optString(field)
            flagCode(rawValue)?.let { code -> return flagBitmap(code) }
            val url = imageUrl(rawValue) ?: return null
            if (System.currentTimeMillis() > deadline) { partial = true; return null }
            val img = fetchImage(url)
            if (img == null) { partial = true; return null }
            return img.takeIf { hasVisibleContent(it) }
        }
        val flagA = image("flagA")
        val flagB = if (versus) image("flagB") else null

        val cy = 470f
        val bmp = Bitmap.createBitmap((W * scale).toInt(), (H * scale).toInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.scale(scale, scale)
        drawBackdrop(c, accent, cy, rings = false)
        drawBrand(c, 332f)

        val r = 96f
        if (versus) {
            drawHero(c, 150f, cy + 20f, r, flagA, teamA, accent, ring = false)
            drawHero(c, 450f, cy + 20f, r, flagB, teamB, accent, ring = false)
            val vs = label(28f, 0xB3FFFFFF.toInt(), spacing = 0.12f)
            val b = Rect().also { vs.getTextBounds("VS", 0, 2, it) }
            drawCentered(c, "VS", 300f, cy + 20f - b.exactCenterY(), vs)
        } else {
            drawHero(c, 300f, cy + 20f, 120f, flagA, teamA.ifEmpty { spec.optString("eventName").trim() }, accent, ring = false)
        }

        val out = if (partial) partialFile else file
        FileOutputStream(out).use { bmp.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
        bmp.recycle()
        prune(dir)
        return Uri.fromFile(out).toString()
    }

    private fun render(spec: JSONObject, scale: Float, land: Boolean = false): String? {
        val dir = File(JsStore.context.cacheDir, "playz_posters").apply { mkdirs() }
        val key = sha1(DESIGN + (if (land) "land" else "") + scale + spec.toString())
        val file = File(dir, "$key.jpg")
        if (file.exists() && file.length() > 0) return Uri.fromFile(file).toString()

        val partialFile = File(dir, "$key.partial.jpg")
        if (partialFile.exists() && partialFile.length() > 0 &&
            System.currentTimeMillis() - partialFile.lastModified() < PARTIAL_TTL_MS
        ) return Uri.fromFile(partialFile).toString()

        val category = spec.optString("category").ifBlank { "Live" }
        val eventName = spec.optString("eventName").trim()
        val teamA = spec.optString("teamA").trim()
        val teamB = spec.optString("teamB").trim()
        val status = spec.optString("status", "LIVE")
        val time = spec.optString("time")
        val accent = accentFor(category)
        val versus = teamA.isNotEmpty() && teamB.isNotEmpty() && teamA != teamB

        var partial = false
        val deadline = System.currentTimeMillis() + RENDER_BUDGET_MS

        fun image(field: String): Bitmap? {
            val rawValue = spec.optString(field)
            flagCode(rawValue)?.let { code -> return flagBitmap(code) }
            val url = imageUrl(rawValue) ?: return null
            if (System.currentTimeMillis() > deadline) { partial = true; return null }
            val img = fetchImage(url)
            if (img == null) { partial = true; return null }
            return img.takeIf { hasVisibleContent(it) }
        }
        val flagA = if (versus) image("flagA") else null
        val flagB = if (versus) image("flagB") else null
        val single = if (!versus) image("flagA") else null
        val logo = image("logo")

        val cy = if (land) (if (versus) 290f else 288f) else if (versus) 470f else 482f
        val bmp = baseLayer(accent, cy, scale, land).copy(Bitmap.Config.ARGB_8888, true) ?: return null
        val c = Canvas(bmp)
        c.scale(scale, scale)

        if (land) {
            val ly = 110f
            if (logo != null) {
                drawLogoBadge(c, logo, 90f, 96f, 34f)
            }
            val lcat = label(26f, accent, spacing = 0.26f)
            drawCentered(c, wrap(category.uppercase(), lcat, 640f, 1).first(), LW / 2f, ly, lcat)
            val ltitle = if (versus) "" else teamA.ifEmpty { eventName.ifEmpty { "Live Event" } }
            if (eventName.isNotEmpty() && eventName != ltitle) {
                val p = text(Fonts.sans, 28f, MUTED, Paint.Align.CENTER)
                c.drawText(wrap(eventName, p, 700f, 1).first(), LW / 2f, ly + 40f, p)
            }
            if (versus) {
                val r = 88f
                val xa = 250f
                val xb = 710f
                drawHero(c, xa, cy, r, flagA, teamA, accent)
                drawHero(c, xb, cy, r, flagB, teamB, accent)
                val hair = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x2EFFFFFF; strokeWidth = 2f }
                c.drawLine(LW / 2f, cy - r - 8f, LW / 2f, cy - 30f, hair)
                c.drawLine(LW / 2f, cy + 30f, LW / 2f, cy + r + 8f, hair)
                val vs = label(26f, 0xB3FFFFFF.toInt(), spacing = 0.12f)
                val b = Rect().also { vs.getTextBounds("VS", 0, 2, it) }
                drawCentered(c, "VS", LW / 2f, cy - b.exactCenterY(), vs)
                val size = fitSize(listOf(teamA, teamB), 380f, 36f, 26f)
                val nameY = cy + r + 12f + 44f
                drawName(c, xa, nameY, teamA, 380f, size)
                drawName(c, xb, nameY, teamB, 380f, size)
            } else {
                val r = 96f
                drawHero(c, LW / 2f, cy, r, single, ltitle, accent)
                val size = fitSize(listOf(ltitle), 760f, 44f, 30f)
                drawName(c, LW / 2f, cy + r + 12f + 46f, ltitle, 760f, size)
            }
            drawFooterLand(c, status, time)
            val lout = if (partial) partialFile else file
            FileOutputStream(lout).use { bmp.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
            bmp.recycle()
            prune(dir)
            return Uri.fromFile(lout).toString()
        }

        var y = 180f
        if (logo != null) {
            drawLogoBadge(c, logo, 300f, 156f, 38f)
            y = 248f
        }
        val catPaint = label(28f, accent, spacing = 0.26f)
        drawCentered(c, wrap(category.uppercase(), catPaint, 520f, 1).first(), 300f, y, catPaint)
        val title = if (versus) "" else teamA.ifEmpty { eventName.ifEmpty { "Live Event" } }
        if (eventName.isNotEmpty() && eventName != title) {
            val p = text(Fonts.sans, 34f, MUTED, Paint.Align.CENTER)
            wrap(eventName, p, 500f, 2).forEachIndexed { i, l -> c.drawText(l, 300f, y + 54f + i * 44f, p) }
        }

        if (versus) {
            val r = 96f
            val xa = 150f
            val xb = 450f
            drawHero(c, xa, cy, r, flagA, teamA, accent)
            drawHero(c, xb, cy, r, flagB, teamB, accent)
            val hair = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x2EFFFFFF; strokeWidth = 2f }
            c.drawLine(300f, cy - r - 12f, 300f, cy - 34f, hair)
            c.drawLine(300f, cy + 34f, 300f, cy + r + 12f, hair)
            val vs = label(28f, 0xB3FFFFFF.toInt(), spacing = 0.12f)
            val b = Rect().also { vs.getTextBounds("VS", 0, 2, it) }
            drawCentered(c, "VS", 300f, cy - b.exactCenterY(), vs)
            val size = fitSize(listOf(teamA, teamB), 250f, 40f, 30f)
            val nameY = cy + r + 12f + 56f
            drawName(c, xa, nameY, teamA, 250f, size)
            drawName(c, xb, nameY, teamB, 250f, size)
        } else {
            val r = 132f
            drawHero(c, 300f, cy, r, single, title, accent)
            val size = fitSize(listOf(title), 520f, 48f, 34f)
            drawName(c, 300f, cy + r + 12f + 60f, title, 520f, size)
        }

        drawFooter(c, status, time)

        val out = if (partial) partialFile else file
        FileOutputStream(out).use { bmp.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
        bmp.recycle()
        prune(dir)
        return Uri.fromFile(out).toString()
    }

    private fun drawBackdrop(c: Canvas, accent: Int, glowY: Float, rings: Boolean = true, land: Boolean = false) {
        val wf = (if (land) LW else W).toFloat()
        val hf = (if (land) LH else H).toFloat()
        val topEnd = if (land) 150f else 260f
        val bottomStart = if (land) 380f else 640f
        val glowR = if (land) 560f else 430f

        c.drawRect(0f, 0f, wf, hf, Paint().apply {
            shader = LinearGradient(0f, 0f, 0f, hf, 0xFF0B0C10.toInt(), 0xFF15161B.toInt(), Shader.TileMode.CLAMP)
        })

        c.drawRect(0f, 0f, wf, hf, Paint().apply {
            shader = RadialGradient(wf / 2, glowY, glowR, withAlpha(accent, 0x38), withAlpha(accent, 0), Shader.TileMode.CLAMP)
        })

        val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1.5f; color = 0x0DFFFFFF }
        if (rings) listOf(175f, 255f, 345f, 445f).forEach { c.drawCircle(wf / 2, glowY, it, ring) }

        c.drawRect(0f, 0f, wf, topEnd, Paint().apply {
            shader = LinearGradient(0f, 0f, 0f, topEnd, 0x66000000, 0x00000000, Shader.TileMode.CLAMP)
        })
        c.drawRect(0f, bottomStart, wf, hf, Paint().apply {
            shader = LinearGradient(0f, bottomStart, 0f, hf, 0x00000000, 0xD9000000.toInt(), Shader.TileMode.CLAMP)
        })
    }

    private fun drawHero(c: Canvas, cx: Float, cy: Float, r: Float, img: Bitmap?, name: String, accent: Int, ring: Boolean = true) {

        c.drawCircle(cx, cy, r + 70f, Paint().apply {
            shader = RadialGradient(cx, cy, r + 70f, withAlpha(accent, 0x2E), withAlpha(accent, 0), Shader.TileMode.CLAMP)
        })

        if (ring) c.drawCircle(cx, cy, r + 12f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; strokeWidth = 1.5f; color = 0x33FFFFFF
        })
        if (img != null) {
            val s = maxOf(2 * r / img.width, 2 * r / img.height)
            val flagShader = BitmapShader(img, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
                setLocalMatrix(Matrix().apply {
                    setScale(s, s)
                    postTranslate(cx - img.width * s / 2, cy - img.height * s / 2)
                })
            }
            c.drawCircle(cx, cy, r, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = flagShader; isFilterBitmap = true })

            c.drawCircle(cx, cy, r, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader = RadialGradient(
                    cx, cy, r, intArrayOf(0x00000000, 0x00000000, 0x66000000),
                    floatArrayOf(0f, 0.68f, 1f), Shader.TileMode.CLAMP
                )
            })
        } else {

            c.drawCircle(cx, cy, r, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader = LinearGradient(cx, cy - r, cx, cy + r, 0xFF23252C.toInt(), 0xFF111216.toInt(), Shader.TileMode.CLAMP)
            })
            c.drawCircle(cx, cy, r, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader = RadialGradient(cx, cy - r * 0.35f, r * 1.1f, withAlpha(accent, 0x40), withAlpha(accent, 0), Shader.TileMode.CLAMP)
            })
            c.drawCircle(cx, cy, r * 0.62f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE; strokeWidth = 1.5f; color = 0x26FFFFFF
            })

            val label = name.trim().split(Regex("\\s+")).firstOrNull()?.uppercase() ?: ""
            if (label.isNotEmpty()) {
                val maxLabelW = r * 1.55f
                var labelSize = r * 0.52f
                val lp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    typeface = Fonts.display
                    textAlign = Paint.Align.CENTER
                    color = INK
                }
                lp.textSize = labelSize
                while (labelSize > r * 0.18f && lp.measureText(label) > maxLabelW) {
                    labelSize -= 2f
                    lp.textSize = labelSize
                }
                val metrics = lp.fontMetrics
                val textBaseline = cy - (metrics.ascent + metrics.descent) / 2f
                c.drawText(label, cx, textBaseline, lp)
            }
        }
    }

    private fun drawLogoBadge(c: Canvas, logo: Bitmap, cx: Float, cy: Float, r: Float) {
        c.drawCircle(cx, cy, r, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF1B1C21.toInt() })
        val box = r * 1.3f
        val s = minOf(box / logo.width, box / logo.height)
        val w = logo.width * s
        val h = logo.height * s
        c.drawBitmap(logo, null, RectF(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), Paint(Paint.ANTI_ALIAS_FLAG).apply { isFilterBitmap = true })
    }

    private fun drawBrand(c: Canvas, baseline: Float, cx: Float = 300f, size: Float = 30f) {
        val name = "ECLIPSIA"
        val p = text(Fonts.brand, size, 0xD9F4F4F5.toInt(), Paint.Align.CENTER, 0.3f)
        drawCentered(c, name, cx, baseline, p)
        val w = p.measureText(name) - p.letterSpacing * p.textSize
        val y = baseline - p.textSize * 0.34f
        val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x40FFFFFF; strokeWidth = 1.5f }
        c.drawLine(cx - w / 2 - 22f - 40f, y, cx - w / 2 - 22f, y, line)
        c.drawLine(cx + w / 2 + 22f, y, cx + w / 2 + 22f + 40f, y, line)
    }

    private fun fitSize(names: List<String>, maxW: Float, start: Float, min: Float): Float {
        var size = start
        while (size > min) {
            val p = serif(size, INK, Paint.Align.CENTER)
            val widest = names.flatMap { it.split(Regex("\\s+")) }.maxOfOrNull { p.measureText(it) } ?: 0f
            if (widest <= maxW) break
            size -= 2f
        }
        return size
    }

    private fun drawName(c: Canvas, cx: Float, baseline: Float, name: String, maxW: Float, size: Float) {
        val p = serif(size, INK, Paint.Align.CENTER)
        wrap(name, p, maxW, 2).forEachIndexed { i, l -> c.drawText(l, cx, baseline + i * size * 1.22f, p) }
    }

    private fun drawCentered(c: Canvas, t: String, cx: Float, baseline: Float, p: Paint) {
        c.drawText(t, cx + p.letterSpacing * p.textSize / 2f, baseline, p)
    }

    private fun drawFooter(c: Canvas, status: String, time: String) {
        c.drawLine(60f, 768f, 540f, 768f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x1AFFFFFF; strokeWidth = 1.5f })
        val (txt, color) = when (status) {
            "UPCOMING" -> "UPCOMING" to 0xFFD9A857.toInt()
            "ENDED" -> "ENDED" to 0xFF7C808B.toInt()
            else -> "LIVE" to 0xFFFF5A5F.toInt()
        }
        val lp = label(30f, INK, Paint.Align.LEFT, 0.22f)
        val textW = lp.measureText(txt) - lp.letterSpacing * lp.textSize
        val dotR = 8f
        val gap = 18f
        val total = dotR * 2 + gap + textW
        val startX = 300f - total / 2
        val base = 818f
        val dotCy = base - lp.textSize * 0.36f
        if (status == "LIVE") {
            c.drawCircle(startX + dotR, dotCy, dotR * 2.6f, Paint().apply {
                shader = RadialGradient(startX + dotR, dotCy, dotR * 2.6f, withAlpha(color, 0x55), withAlpha(color, 0), Shader.TileMode.CLAMP)
            })
        }
        c.drawCircle(startX + dotR, dotCy, dotR, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color })
        c.drawText(txt, startX + dotR * 2 + gap, base, lp)
        if (time.isNotEmpty() && status != "LIVE") {
            val tp = text(Fonts.sans, 34f, MUTED, Paint.Align.CENTER, 0.03f)
            c.drawText(wrap(time, tp, 500f, 1).first(), 300f, 856f, tp)
        }
    }

    private fun drawFooterLand(c: Canvas, status: String, time: String) {
        c.drawLine(60f, 492f, LW - 60f, 492f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x1AFFFFFF; strokeWidth = 1.5f })
        val (txt, color) = when (status) {
            "UPCOMING" -> "UPCOMING" to 0xFFD9A857.toInt()
            "ENDED" -> "ENDED" to 0xFF7C808B.toInt()
            else -> "LIVE" to 0xFFFF5A5F.toInt()
        }
        val lp = label(26f, INK, Paint.Align.LEFT, 0.22f)
        val dotR = 7f
        val gap = 16f
        val startX = 60f
        val base = 524f
        val dotCy = base - lp.textSize * 0.36f
        if (status == "LIVE") {
            c.drawCircle(startX + dotR, dotCy, dotR * 2.6f, Paint().apply {
                shader = RadialGradient(startX + dotR, dotCy, dotR * 2.6f, withAlpha(color, 0x55), withAlpha(color, 0), Shader.TileMode.CLAMP)
            })
        }
        c.drawCircle(startX + dotR, dotCy, dotR, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color })
        c.drawText(txt, startX + dotR * 2 + gap, base, lp)
        if (time.isNotEmpty() && status != "LIVE") {
            val tp = text(Fonts.sans, 30f, MUTED, Paint.Align.RIGHT, 0.03f)
            c.drawText(wrap(time, tp, 520f, 1).first(), LW - 60f, base, tp)
        }
    }

    private fun wrap(text: String, p: Paint, maxW: Float, maxLines: Int): List<String> {
        val lines = mutableListOf<String>()
        var cur = ""
        for (w in text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }) {
            val t = if (cur.isEmpty()) w else "$cur $w"
            if (p.measureText(t) <= maxW) cur = t else {
                if (cur.isNotEmpty()) lines.add(cur)
                cur = w
            }
        }
        if (cur.isNotEmpty()) lines.add(cur)
        if (lines.size > maxLines) {
            val keep = lines.take(maxLines).toMutableList()
            keep[maxLines - 1] = ellipsize(keep[maxLines - 1], p, maxW)
            return keep
        }
        return lines.map { if (p.measureText(it) > maxW) ellipsize(it, p, maxW) else it }
    }

    private fun ellipsize(s: String, p: Paint, maxW: Float): String {
        var t = s.trimEnd('\u2026', ' ')
        while (t.isNotEmpty() && p.measureText("$t\u2026") > maxW) t = t.dropLast(1)
        return "$t\u2026"
    }

    private fun text(face: Typeface, size: Float, color: Int, align: Paint.Align = Paint.Align.LEFT, spacing: Float = 0f) =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = face
            textSize = size
            this.color = color
            textAlign = align
            letterSpacing = spacing
        }

    private fun label(size: Float, color: Int, align: Paint.Align = Paint.Align.CENTER, spacing: Float = 0.2f) =
        text(Fonts.sans, size, color, align, spacing)

    private fun serif(size: Float, color: Int, align: Paint.Align) = text(Fonts.display, size, color, align)

    private fun withAlpha(color: Int, alpha: Int) = (color and 0x00FFFFFF) or (alpha shl 24)

    private fun sha1(s: String): String =
        MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun prune(dir: File) {
        val files = dir.listFiles() ?: return
        if (files.size <= MAX_CACHED) return
        files.sortedBy { it.lastModified() }.take(files.size - MAX_CACHED).forEach { it.delete() }
    }
}
