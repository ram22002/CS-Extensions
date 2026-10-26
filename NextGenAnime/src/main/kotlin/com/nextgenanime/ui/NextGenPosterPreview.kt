package com.nextgenanime

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

internal object NextGenPosterPreview {
    private class Sample(val label: String, val anilistId: Int, val imdbId: String, val fallbackCover: String)

    private val samples = listOf(
        Sample("One Piece", 21, "tt0388629", "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCDoj1EkAxFn.jpg"),
        Sample("Spirited Away", 199, "tt0245429", "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx199-hWSc9N4sKx9k.png"),
    )

    private fun fill(template: String, s: Sample) = template
        .replace("{imdb_id}", s.imdbId)
        .replace("{anilist_id}", s.anilistId.toString())

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
            val title = text(ctx, s.label, 13f, C.TEXT, bold = true).apply {
                gravity = Gravity.CENTER
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            }
            val note = text(ctx, "", 11f, C.TEXT_DIM).apply {
                gravity = Gravity.CENTER
                maxLines = 1
            }
            val col = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                val posterH = dp(ctx, 140)
                val posterW = (posterH * 2) / 3
                addView(image, LinearLayout.LayoutParams(posterW, posterH))
                addView(title, LinearLayout.LayoutParams(posterW, WRAP_CONTENT).apply { topMargin = dp(ctx, 6) })
                addView(note, LinearLayout.LayoutParams(posterW, WRAP_CONTENT).apply { topMargin = dp(ctx, 2) })
            }
            Slot(image, note) to col
        }

        val row = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_HORIZONTAL
            slots.forEachIndexed { i, (_, col) ->
                if (i > 0) addView(View(ctx), LinearLayout.LayoutParams(dp(ctx, 16), 1))
                addView(col, WRAP_CONTENT, WRAP_CONTENT)
            }
        }

        val refresh: () -> Unit = {
            val t = template()
            val hide = hideLabel()
            scope.launch {
                samples.forEachIndexed { i, s ->
                    val (slot, col) = slots[i]
                    val titleView = col.getChildAt(1) as? TextView
                    titleView?.visibility = if (hide) View.GONE else View.VISIBLE

                    val (url, label) = when {
                        t.isNullOrBlank() -> s.fallbackCover to "Default poster"
                        else -> {
                            val custom = fill(t, s)
                            custom to "Custom poster"
                        }
                    }

                    slot.note.text = "Loading..."
                    val bmp = withContext(Dispatchers.IO) { download(url) }
                    if (bmp != null) {
                        slot.image.setImageBitmap(bmp)
                        slot.note.text = label
                    } else {
                        val fallbackBmp = withContext(Dispatchers.IO) { download(s.fallbackCover) }
                        slot.image.setImageBitmap(fallbackBmp)
                        slot.note.text = if (t.isNullOrBlank()) "Default poster" else "Failed to load custom"
                    }
                }
            }
        }

        val container = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(C.BG)
            setPadding(dp(ctx, 16), dp(ctx, 16), dp(ctx, 16), dp(ctx, 16))
            addView(row, MATCH_PARENT, WRAP_CONTENT)
        }

        return container to refresh
    }
}
