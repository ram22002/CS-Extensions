package com.nextgen.anydrama.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

internal object C {
    val BG = Color.parseColor("#000000")
    val CARD = Color.parseColor("#1C1C1E")
    val CARD_HIGH = Color.parseColor("#2C2C2E")
    val OUTLINE = Color.parseColor("#48484A")
    val TEXT = Color.parseColor("#D5DCEC")
    val TEXT_DIM = Color.parseColor("#98989F")
    val PRIMARY = Color.parseColor("#FF2D55") // AnyDrama vibrant reel pink/red
    val ON_PRIMARY = Color.parseColor("#FFFFFF")
    val TONAL = Color.parseColor("#3A3A3C")
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

internal fun toggleCard(ctx: Context, title: String, sub: String, toggle: ToggleView) = card(ctx).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 12), dp(ctx, 14))
    addView(LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        addView(text(ctx, title, 16f, C.TEXT, bold = true))
        addView(text(ctx, sub, 12.5f, C.TEXT_DIM), lp(top = 2))
    }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
    addView(toggle, LinearLayout.LayoutParams(dp(ctx, 52), dp(ctx, 32)))
    rowFocus(ctx, this, toggle)
}

internal class BackButton(ctx: Context, onClick: () -> Unit) : View(ctx) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        strokeWidth = 2.4f
        color = C.TEXT
    }

    init {
        background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(C.CARD) }
        setOnClickListener { onClick() }
        focusRing(ctx, this, 20, 1.1f)
    }

    override fun onDraw(c: Canvas) {
        val s = minOf(width, height) / 24f * 0.6f
        c.save()
        c.translate((width - 24 * s) / 2f, (height - 24 * s) / 2f)
        c.scale(s, s)
        c.drawPath(Path().apply { moveTo(14.5f, 5f); lineTo(7.5f, 12f); lineTo(14.5f, 19f) }, paint)
        c.restore()
    }
}

internal fun ringDrawable(ctx: Context, radiusDp: Int) = GradientDrawable().apply {
    setColor(Color.argb(30, 255, 255, 255))
    cornerRadius = dp(ctx, radiusDp).toFloat()
    setStroke(dp(ctx, 3), Color.WHITE)
}

internal fun focusRing(ctx: Context, v: View, radiusDp: Int, scale: Float = 1.02f) {
    v.isFocusable = true
    val ring = ringDrawable(ctx, radiusDp)
    v.setOnFocusChangeListener { view, has ->
        if (Build.VERSION.SDK_INT >= 23) view.foreground = if (has) ring else null
        val target = if (has) scale else 1f
        view.animate().scaleX(target).scaleY(target).setDuration(120).start()
    }
}

internal fun rowFocus(ctx: Context, row: View, toggle: ToggleView, radiusDp: Int = 18) {
    focusRing(ctx, row, radiusDp)
    row.setOnClickListener { toggle.performClick() }
}

internal fun dp(ctx: Context, v: Int) = (v * ctx.resources.displayMetrics.density).toInt()

internal fun lp(top: Int = 0) = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
    topMargin = (top * android.content.res.Resources.getSystem().displayMetrics.density).toInt()
}

internal fun text(ctx: Context, s: String, size: Float, color: Int, bold: Boolean = false) = TextView(ctx).apply {
    text = s; textSize = size; setTextColor(color)
    if (bold) setTypeface(typeface, Typeface.BOLD)
}

internal fun sectionLabel(ctx: Context, s: String) = text(ctx, s.uppercase(), 12f, C.PRIMARY, bold = true).apply {
    letterSpacing = 0.1f
    setPadding(dp(ctx, 8), dp(ctx, 20), 0, dp(ctx, 8))
}

internal fun card(ctx: Context) = LinearLayout(ctx).apply {
    orientation = LinearLayout.VERTICAL
    background = GradientDrawable().apply { setColor(C.CARD); cornerRadius = dp(ctx, 18).toFloat() }
}

internal fun button(ctx: Context, label: String, filled: Boolean, onClick: () -> Unit) =
    TextView(ctx).apply {
        text = label; textSize = 14f; gravity = Gravity.CENTER
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(if (filled) C.ON_PRIMARY else C.ON_TONAL)
        background = GradientDrawable().apply {
            setColor(if (filled) C.PRIMARY else C.TONAL); cornerRadius = dp(ctx, 20).toFloat()
        }
        setPadding(dp(ctx, 16), dp(ctx, 10), dp(ctx, 16), dp(ctx, 10))
        setOnClickListener { onClick() }
        focusRing(ctx, this, 20, 1.04f)
    }

internal fun toast(ctx: Context, msg: String) = Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()
