package com.nextgenbdix

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Outline
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.ViewOutlineProvider
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.lagradost.cloudstream3.app
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONObject

internal object NextGenPosterPreview {
    private class Sample(val label: String, val kind: String, val tmdbId: Int, val imdbId: String)

    private val samples = listOf(
        Sample("Inception", "movie", 27205, "tt1375666"),
        Sample("One Piece", "tv", 37854, "tt0388629"),
    )

    private fun fill(template: String, s: Sample) = template
        .replace("{imdb_id}", s.imdbId)
        .replace("{tmdb_id}", s.tmdbId.toString())
        .replace("{type}", if (s.kind == "tv") "series" else "movie")

    private suspend fun tmdbPoster(s: Sample): String? {
        val text = NextGenTmdb.get("${s.kind}/${s.tmdbId}?language=${NextGenStore.language}") ?: return null
        val path = runCatching { JSONObject(text).optString("poster_path") }.getOrNull()
        return path?.takeIf { it.startsWith("/") }?.let { "https://image.tmdb.org/t/p/w500$it" }
    }

    private fun download(url: String): Bitmap? = try {
        app.baseClient.newCall(Request.Builder().url(url).build()).execute().use { r ->
            if (!r.isSuccessful) null else r.body?.byteStream()?.let { BitmapFactory.decodeStream(it) }
        }
    } catch (_: Exception) {
        null
    }

    fun build(ctx: Context, scope: CoroutineScope, hideLabel: () -> Boolean, template: () -> String?): Pair<View, () -> Unit> {
        class Slot(val image: ImageView, val note: TextView)

        val slots = samples.map { s ->
            val image = ImageView(ctx).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                background = GradientDrawable().apply { setColor(C.CARD_HIGH); cornerRadius = dp(ctx, 12).toFloat() }
                clipToOutline = true
                outlineProvider = object : ViewOutlineProvider() {
                    override fun getOutline(v: View, o: Outline) = o.setRoundRect(0, 0, v.width, v.height, dp(ctx, 12).toFloat())
                }
            }
            val note = text(ctx, "", 12f, C.TEXT_DIM).apply { gravity = Gravity.CENTER }
            Slot(image, note)
        }

        val labels = samples.map { s -> text(ctx, s.label, 14f, C.TEXT, bold = true).apply { gravity = Gravity.CENTER } }

        val row = LinearLayout(ctx).apply {
            weightSum = samples.size.toFloat()
            samples.forEachIndexed { i, s ->
                addView(LinearLayout(ctx).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                    addView(slots[i].image, LinearLayout.LayoutParams(dp(ctx, 120), dp(ctx, 180)))
                    addView(labels[i], lp(top = 8))
                    addView(slots[i].note, lp(top = 2))
                }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
            }
        }

        var generation = 0
        fun reload() {
            val gen = ++generation
            val tpl = template()
            labels.forEach { it.visibility = if (hideLabel()) View.GONE else View.VISIBLE }
            samples.forEachIndexed { i, s ->
                slots[i].image.setImageDrawable(null)
                slots[i].note.text = "Loading…"
                scope.launch {
                    val custom = tpl != null
                    val url = if (tpl != null) fill(tpl, s) else tmdbPoster(s)
                    val bmp = url?.let { withContext(Dispatchers.IO) { download(it) } }
                    if (gen != generation) return@launch
                    if (bmp != null) {
                        slots[i].image.setImageBitmap(bmp)
                        slots[i].note.text = if (custom) "Custom Poster" else "TMDb Poster"
                    } else {
                        slots[i].note.text = if (custom) "Custom Poster failed to load" else "Could not load poster"
                    }
                }
            }
        }

        val box = card(ctx).apply {
            setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 12), dp(ctx, 16))
            val head = LinearLayout(ctx).apply {
                gravity = Gravity.CENTER_VERTICAL
                addView(text(ctx, "PREVIEW", 17f, C.TEXT, bold = true), LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
                addView(textButton(ctx, "Reload") { reload() })
            }
            addView(head)
            addView(text(ctx, "Movie and TV poster using the settings above", 13f, C.TEXT_DIM), lp(top = 2))
            addView(row, lp(top = 14))
        }
        return box to ::reload
    }
}
