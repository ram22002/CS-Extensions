package com.eclipsiaanime

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

internal object C {
    val BG = Color.parseColor("#000000")
    val CARD = Color.parseColor("#1C1C1E")
    val CARD_HIGH = Color.parseColor("#2C2C2E")
    val OUTLINE = Color.parseColor("#48484A")
    val TEXT = Color.parseColor("#D5DCEC")
    val TEXT_DIM = Color.parseColor("#98989F")
    val PRIMARY = Color.parseColor("#2F6FDE")
    val ON_PRIMARY = Color.parseColor("#D5DCEC")
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
        val w = 52 * d;
        val h = 32 * d
        val left = (width - w) / 2f;
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

internal class GearView(ctx: Context) : View(ctx) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = C.TEXT_DIM }
    private val d = ctx.resources.displayMetrics.density

    init {
        background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(C.CARD_HIGH) }
    }

    override fun onDraw(c: Canvas) {
        val cx = width / 2f;
        val cy = height / 2f
        val body = 6.5f * d;
        val tooth = 2.6f * d;
        val toothW = 3.2f * d
        paint.style = Paint.Style.FILL
        c.drawCircle(cx, cy, body, paint)
        for (i in 0 until 8) {
            c.save(); c.rotate(i * 45f, cx, cy)
            c.drawRoundRect(
                RectF(cx - toothW / 2, cy - body - tooth, cx + toothW / 2, cy - body + d),
                d / 2,
                d / 2,
                paint
            )
            c.restore()
        }
        paint.color = C.CARD_HIGH
        c.drawCircle(cx, cy, 2.8f * d, paint)
        paint.color = C.TEXT_DIM
    }
}

internal fun subPage(ctx: Context, title: String, subtitle: String, content: View, onBack: () -> Unit): View =
    LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        addView(LinearLayout(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(ctx, 16), dp(ctx, 36), dp(ctx, 16), dp(ctx, 12))
            addView(BackButton(ctx, onBack), LinearLayout.LayoutParams(dp(ctx, 44), dp(ctx, 44)))
            addView(LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                addView(text(ctx, title, 28f, C.TEXT, bold = true))
                addView(text(ctx, subtitle, 14f, C.TEXT_DIM), lp(top = 2))
            }, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { leftMargin = dp(ctx, 16) })
        })
        addView(ScrollView(ctx).apply { addView(content) }, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
    }

internal fun menuCard(ctx: Context, kind: IconView.Kind, tint: Int, title: String, sub: TextView, onClick: () -> Unit) =
    card(ctx).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(ctx, 16), dp(ctx, 16), dp(ctx, 16), dp(ctx, 16))
        addView(IconView(ctx, kind, tint), LinearLayout.LayoutParams(dp(ctx, 48), dp(ctx, 48)))
        addView(LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            addView(text(ctx, title, 17f, C.TEXT, bold = true))
            addView(sub, lp(top = 2))
        }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { leftMargin = dp(ctx, 14) })
        addView(text(ctx, "›", 28f, C.OUTLINE).apply { includeFontPadding = false })
        setOnClickListener { onClick() }
        focusRing(ctx, this, 20)
    }

internal fun settingCard(ctx: Context, title: String, desc: String, trailing: View) = card(ctx).apply {
    setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 12), dp(ctx, 16))
    addView(LinearLayout(ctx).apply {
        gravity = Gravity.CENTER_VERTICAL
        addView(text(ctx, title, 17f, C.TEXT, bold = true), LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        addView(trailing, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
    })
    addView(text(ctx, desc, 13f, C.TEXT_DIM).apply { setLineSpacing(0f, 1.2f) }, lp(top = 10).apply { rightMargin = dp(ctx, 4) })
}

internal fun toggleCard(ctx: Context, title: String, sub: String, toggle: ToggleView) = card(ctx).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 12), dp(ctx, 14))
    addView(LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        addView(text(ctx, title, 17f, C.TEXT, bold = true))
        addView(text(ctx, sub, 13f, C.TEXT_DIM), lp(top = 2))
    }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
    addView(toggle, LinearLayout.LayoutParams(dp(ctx, 52), dp(ctx, 32)))
    rowFocus(ctx, this, toggle)
}

internal fun toggleCardWithOption(
    ctx: Context,
    title: String,
    sub: String,
    toggle: ToggleView,
    optionTitle: String,
    optionSub: String,
    optionToggle: ToggleView,
): View {
    val optionRow = LinearLayout(ctx).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(ctx, 16), dp(ctx, 10), dp(ctx, 12), dp(ctx, 14))
        addView(LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            addView(text(ctx, optionTitle, 15f, C.TEXT))
            addView(text(ctx, optionSub, 13f, C.TEXT_DIM), lp(top = 2))
        }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        addView(optionToggle, LinearLayout.LayoutParams(dp(ctx, 52), dp(ctx, 32)))
        rowFocus(ctx, this, optionToggle)
    }
    fun sync() {
        optionRow.visibility = if (toggle.checked) View.VISIBLE else View.GONE
    }
    val previous = toggle.onChange
    toggle.onChange = { on ->
        previous?.invoke(on)
        sync()
    }
    sync()
    return card(ctx).apply {
        addView(toggleCard(ctx, title, sub, toggle).apply { background = null }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        addView(optionRow, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
    }
}

internal fun stepper(ctx: Context, value: TextView, valueWidthDp: Int, onMinus: () -> Unit, onPlus: () -> Unit): View {
    fun btn(label: String, click: () -> Unit) = TextView(ctx).apply {
        text = label; textSize = 22f; gravity = Gravity.CENTER
        setTextColor(C.PRIMARY); includeFontPadding = false
        setOnClickListener { click() }
        focusRing(ctx, this, 20, 1.1f)
    }
    return LinearLayout(ctx).apply {
        gravity = Gravity.CENTER_VERTICAL
        background = GradientDrawable().apply { setColor(C.CARD_HIGH); cornerRadius = dp(ctx, 22).toFloat() }
        addView(btn("−", onMinus), LinearLayout.LayoutParams(dp(ctx, 44), dp(ctx, 40)))
        value.minWidth = dp(ctx, valueWidthDp)
        addView(value)
        addView(btn("+", onPlus), LinearLayout.LayoutParams(dp(ctx, 44), dp(ctx, 40)))
    }
}

internal class IconView(ctx: Context, val kind: Kind, private val tint: Int) : View(ctx) {
    enum class Kind { BOLT, GRID, KEY, IMAGE, LIST }
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val d = ctx.resources.displayMetrics.density

    init {
        background = GradientDrawable().apply {
            setColor(Color.argb(40, Color.red(tint), Color.green(tint), Color.blue(tint)))
            cornerRadius = 14 * d
        }
    }

    override fun onDraw(c: Canvas) {
        val s = minOf(width, height) / 24f * 0.58f
        c.save()
        c.translate((width - 24 * s) / 2f, (height - 24 * s) / 2f)
        c.scale(s, s)
        paint.color = tint
        paint.style = Paint.Style.FILL
        when (kind) {
            Kind.BOLT -> {
                val p = Path().apply {
                    moveTo(13f, 2f); lineTo(4f, 14f); lineTo(11f, 14f)
                    lineTo(10f, 22f); lineTo(20f, 9.5f); lineTo(13f, 9.5f); close()
                }
                paint.strokeJoin = Paint.Join.ROUND
                paint.style = Paint.Style.FILL_AND_STROKE
                paint.strokeWidth = 1.2f
                c.drawPath(p, paint)
            }
            Kind.GRID -> {
                val r = 2.6f
                c.drawRoundRect(RectF(3f, 3f, 11f, 11f), r, r, paint)
                c.drawRoundRect(RectF(13f, 3f, 21f, 11f), r, r, paint)
                c.drawRoundRect(RectF(3f, 13f, 11f, 21f), r, r, paint)
                c.drawRoundRect(RectF(13f, 13f, 21f, 21f), r, r, paint)
            }
            Kind.KEY -> {
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 2.4f
                paint.strokeCap = Paint.Cap.ROUND
                c.drawCircle(8f, 15f, 4.5f, paint)
                c.drawLine(11.5f, 11.5f, 20f, 3f, paint)
                c.drawLine(17f, 6f, 20f, 9f, paint)
            }
            Kind.IMAGE -> {
                c.drawRoundRect(RectF(3f, 4f, 21f, 20f), 3f, 3f, paint.apply { style = Paint.Style.STROKE; strokeWidth = 2.2f })
                paint.style = Paint.Style.FILL
                c.drawCircle(8.5f, 9.5f, 1.8f, paint)
                val m = Path().apply { moveTo(4f, 18f); lineTo(10f, 12f); lineTo(14f, 16f); lineTo(16.5f, 13.5f); lineTo(20f, 17f); lineTo(20f, 19f); lineTo(4f, 19f); close() }
                c.drawPath(m, paint)
            }
            Kind.LIST -> {
                val r = 1.6f
                for (y in listOf(6f, 12f, 18f)) {
                    c.drawRoundRect(RectF(3f, y - 1.6f, 6.2f, y + 1.6f), r, r, paint)
                    c.drawRoundRect(RectF(9f, y - 1.3f, 21f, y + 1.3f), r, r, paint)
                }
            }
        }
        c.restore()
    }
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

internal class ChevronButton(ctx: Context, private val up: Boolean, onClick: () -> Unit) : View(ctx) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        strokeWidth = 2.4f
        color = C.PRIMARY
    }

    init {
        setOnClickListener { onClick() }
        focusRing(ctx, this, 12, 1.05f)
    }

    override fun onDraw(c: Canvas) {
        val s = minOf(width, height) / 24f * 0.6f
        c.save()
        c.translate((width - 24 * s) / 2f, (height - 24 * s) / 2f)
        c.scale(s, s)
        val path = Path().apply {
            if (up) { moveTo(5f, 15.5f); lineTo(12f, 8.5f); lineTo(19f, 15.5f) }
            else { moveTo(5f, 8.5f); lineTo(12f, 15.5f); lineTo(19f, 8.5f) }
        }
        c.drawPath(path, paint)
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

internal fun rowFocus(ctx: Context, row: View, toggle: ToggleView, radiusDp: Int = 20) {
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
    setPadding(dp(ctx, 8), dp(ctx, 24), 0, dp(ctx, 8))
}

internal fun card(ctx: Context) = LinearLayout(ctx).apply {
    orientation = LinearLayout.VERTICAL
    background = GradientDrawable().apply { setColor(C.CARD); cornerRadius = dp(ctx, 22).toFloat() }
}

internal fun fieldCard(ctx: Context, child: View) = LinearLayout(ctx).apply {
    orientation = LinearLayout.VERTICAL
    background = GradientDrawable().apply { setColor(C.CARD_HIGH); cornerRadius = dp(ctx, 16).toFloat() }
    setPadding(dp(ctx, 16), dp(ctx, 12), dp(ctx, 16), dp(ctx, 12))
    addView(child, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
    if (child is EditText) {
        val ring = ringDrawable(ctx, 16)
        child.setOnFocusChangeListener { _, has ->
            if (Build.VERSION.SDK_INT >= 23) foreground = if (has) ring else null
        }
    }
}

internal fun button(ctx: Context, label: String, filled: Boolean, compact: Boolean = false, onClick: () -> Unit) =
    TextView(ctx).apply {
        text = label; textSize = 16f; gravity = Gravity.CENTER
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(if (filled) C.ON_PRIMARY else C.ON_TONAL)
        background = GradientDrawable().apply {
            setColor(if (filled) C.PRIMARY else C.TONAL); cornerRadius = dp(ctx, 26).toFloat()
        }
        if (compact) setPadding(dp(ctx, 24), 0, dp(ctx, 24), 0)
        setOnClickListener { onClick() }
        focusRing(ctx, this, 26, 1.04f)
    }

internal fun textButton(ctx: Context, label: String, onClick: () -> Unit) = TextView(ctx).apply {
    text = label; textSize = 14f; setTextColor(C.PRIMARY)
    setTypeface(typeface, Typeface.BOLD)
    setPadding(dp(ctx, 10), dp(ctx, 8), dp(ctx, 10), dp(ctx, 8))
    setOnClickListener { onClick() }
    focusRing(ctx, this, 12, 1.05f)
}

internal fun toast(ctx: Context, msg: String) = Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()
