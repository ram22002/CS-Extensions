package com.nextgen.reelfren.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

internal object C {
    val BG = Color.parseColor("#0A0A0C")
    val CARD = Color.parseColor("#16161A")
    val CARD_HIGH = Color.parseColor("#222228")
    val OUTLINE = Color.parseColor("#383842")
    val TEXT = Color.parseColor("#FFFFFF")
    val TEXT_DIM = Color.parseColor("#B0B4C4") // High-contrast, crystal clear readable text
    val PRIMARY = Color.parseColor("#FF5E3A") // ReelFren vibrant reel accent
    val ON_PRIMARY = Color.parseColor("#FFFFFF")
    val TONAL = Color.parseColor("#2E2E38")
    val ON_TONAL = Color.parseColor("#D5DCEC")
}

internal class ToggleView(ctx: Context) : View(ctx) {
    var checked = false
        private set
    var onChange: ((Boolean) -> Unit)? = null
    private var progress = 0f
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val d = ctx.resources.displayMetrics.density

    init {
        isFocusable = false
        setOnClickListener { if (isEnabled) setChecked(!checked, true) }
    }

    fun setChecked(value: Boolean, animate: Boolean) {
        val changed = value != checked
        checked = value
        val target = if (value) 1f else 0f
        if (animate) ValueAnimator.ofFloat(progress, target).apply {
            duration = 180
            addUpdateListener { progress = it.animatedValue as Float; invalidate() }
        }.start() else {
            progress = target; invalidate()
        }
        if (changed) onChange?.invoke(value)
    }

    private fun mix(a: Int, b: Int, t: Float) = Color.argb(
        (Color.alpha(a) + (Color.alpha(b) - Color.alpha(a)) * t).toInt(),
        (Color.red(a) + (Color.red(b) - Color.red(a)) * t).toInt(),
        (Color.green(a) + (Color.green(b) - Color.green(a)) * t).toInt(),
        (Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t).toInt()
    )

    override fun onDraw(c: Canvas) {
        val w = 52 * d
        val h = 32 * d
        val left = (width - w) / 2f
        val top = (height - h) / 2f
        val alpha = if (isEnabled) 255 else 90
        val rect = RectF(left, top, left + w, top + h)

        paint.style = Paint.Style.FILL
        paint.color = mix(C.CARD_HIGH, C.PRIMARY, progress); paint.alpha = alpha
        c.drawRoundRect(rect, h / 2, h / 2, paint)
        if (progress < 1f) {
            paint.style = Paint.Style.STROKE; paint.strokeWidth = 2 * d
            paint.color = C.OUTLINE; paint.alpha = ((1f - progress) * alpha).toInt()
            val r = RectF(rect); r.inset(d, d)
            c.drawRoundRect(r, h / 2, h / 2, paint)
        }

        val radius = (8f + 4f * progress) * d
        val cx = left + 16 * d + 20 * d * progress
        paint.style = Paint.Style.FILL
        paint.color = mix(C.OUTLINE, C.ON_PRIMARY, progress); paint.alpha = alpha
        c.drawCircle(cx, top + h / 2, radius, paint)
    }
}

internal fun toggleCard(ctx: Context, title: String, sub: String, toggle: ToggleView) = LinearLayout(ctx).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    background = GradientDrawable().apply {
        setColor(C.CARD)
        cornerRadius = dp(ctx, 14).toFloat()
        setStroke(dp(ctx, 1), C.OUTLINE)
    }
    setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 14), dp(ctx, 14))
    addView(LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        addView(text(ctx, title, 16f, C.TEXT, bold = true))
        addView(text(ctx, sub, 12.5f, C.TEXT_DIM).apply {
            setPadding(0, dp(ctx, 3), 0, 0)
        })
    }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
    addView(toggle, LinearLayout.LayoutParams(dp(ctx, 54), dp(ctx, 36)))
}

internal fun card(ctx: Context) = LinearLayout(ctx).apply {
    orientation = LinearLayout.VERTICAL
    background = GradientDrawable().apply {
        setColor(C.CARD)
        cornerRadius = dp(ctx, 16).toFloat()
        setStroke(dp(ctx, 1), C.OUTLINE)
    }
}

internal fun text(
    ctx: Context,
    str: String,
    sp: Float,
    color: Int,
    bold: Boolean = false
) = TextView(ctx).apply {
    text = str
    textSize = sp
    setTextColor(color)
    typeface = if (bold) Typeface.create("sans-serif-medium", Typeface.BOLD) else Typeface.create("sans-serif", Typeface.NORMAL)
}

internal fun sectionLabel(ctx: Context, title: String) = text(
    ctx,
    title.uppercase(),
    12f,
    C.TEXT_DIM,
    bold = true
).apply {
    letterSpacing = 0.08f
    setPadding(dp(ctx, 6), dp(ctx, 20), dp(ctx, 6), dp(ctx, 8))
}

internal fun button(
    ctx: Context,
    label: String,
    filled: Boolean,
    onClick: () -> Unit
) = TextView(ctx).apply {
    text = label
    textSize = 13.5f
    gravity = Gravity.CENTER
    typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
    setPadding(dp(ctx, 14), dp(ctx, 11), dp(ctx, 14), dp(ctx, 11))
    if (filled) {
        setTextColor(C.ON_PRIMARY)
        background = GradientDrawable().apply {
            setColor(C.PRIMARY)
            cornerRadius = dp(ctx, 10).toFloat()
        }
    } else {
        setTextColor(C.TEXT)
        background = GradientDrawable().apply {
            setColor(C.TONAL)
            cornerRadius = dp(ctx, 10).toFloat()
            setStroke(dp(ctx, 1), C.OUTLINE)
        }
    }
    setOnClickListener { onClick() }
}

internal class BackButton(ctx: Context, onClick: () -> Unit) : View(ctx) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = C.TEXT
        style = Paint.Style.STROKE
        strokeWidth = 2.4f * ctx.resources.displayMetrics.density
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val path = Path()
    private val d = ctx.resources.displayMetrics.density

    init {
        isClickable = true
        isFocusable = true
        val bg = GradientDrawable().apply {
            setColor(C.CARD_HIGH)
            shape = GradientDrawable.OVAL
        }
        background = bg
        setOnClickListener { onClick() }
    }

    override fun onDraw(c: Canvas) {
        super.onDraw(c)
        val cx = width / 2f
        val cy = height / 2f
        val size = 6f * d
        path.reset()
        path.moveTo(cx + size * 0.4f, cy - size)
        path.lineTo(cx - size * 0.6f, cy)
        path.lineTo(cx + size * 0.4f, cy + size)
        c.drawPath(path, paint)
    }
}

internal fun dp(ctx: Context, v: Int) = (v * ctx.resources.displayMetrics.density).toInt()

internal fun lp(ctx: Context, topDp: Int = 0, bottomDp: Int = 0, leftDp: Int = 0, rightDp: Int = 0) =
    LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
        setMargins(dp(ctx, leftDp), dp(ctx, topDp), dp(ctx, rightDp), dp(ctx, bottomDp))
    }

internal fun toast(ctx: Context, msg: String) {
    Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()
}
