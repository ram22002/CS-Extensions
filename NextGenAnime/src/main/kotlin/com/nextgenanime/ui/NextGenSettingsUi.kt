package com.nextgenanime

import android.animation.ValueAnimator
import android.app.AlertDialog
import android.app.Dialog
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.graphics.Path
import android.os.Build
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

object NextGenSettingsUi {
    private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    fun show(ctx: Context) {
        val dialog = Dialog(ctx, android.R.style.Theme_Material_NoActionBar)
        val scrapers = NextGenRepository.allScrapers()
        val toggles = ArrayList<Pair<NextGenScraper, ToggleView>>()

        fun pageColumn() = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(ctx, 16), 0, dp(ctx, 16), dp(ctx, 48))
        }

        val perfList = pageColumn()
        val homeList = pageColumn()
        val langList = pageColumn()
        val menuList = pageColumn()
        var showPage: (Int) -> Unit = {}
        val provList = pageColumn()

        val subtitle = text(ctx, "", 15f, C.TEXT_DIM)
        fun refreshSubtitle() {
            val on = toggles.count { it.second.checked }
            subtitle.text = "$on of ${scrapers.size} providers enabled"
        }

        val header = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(ctx, 24), dp(ctx, 40), dp(ctx, 24), dp(ctx, 16))
            addView(text(ctx, "NextGen Anime", 34f, C.TEXT, bold = true))
            addView(subtitle, lp(top = 4))
        }

        var concurrencyValue = NextGenStore.concurrency
        var timeoutValue = NextGenStore.timeoutSeconds
        val countText = text(ctx, concurrencyValue.toString(), 18f, C.TEXT, bold = true).apply {
            gravity = Gravity.CENTER
        }
        fun step(delta: Int) {
            concurrencyValue = (concurrencyValue + delta).coerceIn(1, NextGenStore.MAX_CONCURRENCY)
            countText.text = concurrencyValue.toString()
        }
        fun timeoutLabel() =
            if (timeoutValue == NextGenStore.TIMEOUT_AUTO) "Auto" else "${timeoutValue}s"
        val timeoutText = text(ctx, timeoutLabel(), 18f, C.TEXT, bold = true).apply { gravity = Gravity.CENTER }
        fun stepTimeout(delta: Int) {
            val cur = timeoutValue
            val next = if (cur == NextGenStore.TIMEOUT_AUTO) {
                if (delta > 0) NextGenStore.MIN_TIMEOUT_SECONDS else NextGenStore.TIMEOUT_AUTO
            } else cur + delta
            timeoutValue = if (next < NextGenStore.MIN_TIMEOUT_SECONDS) NextGenStore.TIMEOUT_AUTO
            else next.coerceAtMost(NextGenStore.MAX_TIMEOUT_SECONDS)
            timeoutText.text = timeoutLabel()
        }
        val autoToggle = ToggleView(ctx).apply { setChecked(NextGenStore.concurrencyAuto, false) }
        val concurrencyCard = settingCard(
            ctx, "Concurrency",
            "Providers searched in parallel (1-${NextGenStore.MAX_CONCURRENCY}). " +
                "Higher is faster but uses more memory. Default: ${NextGenStore.defaultConcurrency()}",
            stepper(ctx, countText, 44,
                { step(-NextGenStore.CONCURRENCY_STEP) },
                { step(NextGenStore.CONCURRENCY_STEP) })
        )
        concurrencyCard.visibility = if (autoToggle.checked) View.GONE else View.VISIBLE
        autoToggle.onChange = { on -> concurrencyCard.visibility = if (on) View.GONE else View.VISIBLE }
        perfList.addView(sectionLabel(ctx, "Search"))
        perfList.addView(
            toggleCard(
                ctx, "Auto concurrency",
                "Enabled: searches as many providers at once as there are enabled providers",
                autoToggle
            )
        )
        perfList.addView(concurrencyCard, lp(top = 10))
        perfList.addView(
            settingCard(
                ctx, "Timeout",
                "Auto gives each provider up to 60s. Or set a limit " +
                    "(${NextGenStore.MIN_TIMEOUT_SECONDS} - ${NextGenStore.MAX_TIMEOUT_SECONDS}s) after which the " +
                    "whole search stops, however many providers are active. Links already found are kept.",
                stepper(ctx, timeoutText, 56,
                    { stepTimeout(-NextGenStore.TIMEOUT_STEP_SECONDS) },
                    { stepTimeout(NextGenStore.TIMEOUT_STEP_SECONDS) })
            ), lp(top = 10)
        )

        fun capLabel(v: Int) = if (v <= 0) "Off" else v.toString()
        var totalCapValue = NextGenStore.totalCap
        val totalCapText = text(ctx, capLabel(totalCapValue), 18f, C.TEXT, bold = true).apply { gravity = Gravity.CENTER }
        perfList.addView(sectionLabel(ctx, "Stream limit"))
        perfList.addView(
            settingCard(
                ctx, "Total streams",
                "Maximum number of streams kept across all providers. Off = no limit",
                stepper(ctx, totalCapText, 44,
                    { totalCapValue = (totalCapValue - 1).coerceAtLeast(0); totalCapText.text = capLabel(totalCapValue) },
                    { totalCapValue = (totalCapValue + 1).coerceAtMost(NextGenStore.MAX_STREAM_CAP); totalCapText.text = capLabel(totalCapValue) })
            )
        )
        val perCapToggle = ToggleView(ctx).apply { setChecked(NextGenStore.perProviderCapEnabled, false) }
        val perCapBox = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            visibility = if (perCapToggle.checked) View.VISIBLE else View.GONE
        }
        val providerCapValues = HashMap<String, Int>()
        scrapers.forEach { sc ->
            var v = NextGenStore.providerCap(sc.id)
            providerCapValues[sc.id] = v
            val t = text(ctx, capLabel(v), 18f, C.TEXT, bold = true).apply { gravity = Gravity.CENTER }
            perCapBox.addView(
                settingCard(
                    ctx, sc.name, "Maximum streams from this provider. Off = no limit",
                    stepper(ctx, t, 44,
                        { v = (v - 1).coerceAtLeast(0); providerCapValues[sc.id] = v; t.text = capLabel(v) },
                        { v = (v + 1).coerceAtMost(NextGenStore.MAX_STREAM_CAP); providerCapValues[sc.id] = v; t.text = capLabel(v) })
                ), lp(top = 10)
            )
        }
        perCapToggle.onChange = { on -> perCapBox.visibility = if (on) View.VISIBLE else View.GONE }
        perfList.addView(
            toggleCard(ctx, "Limit per provider", "Enabled: set a maximum number of streams for each provider", perCapToggle),
            lp(top = 10)
        )
        perfList.addView(perCapBox)

        fun note(msg: String) = text(ctx, msg, 13f, C.TEXT_DIM).apply {
            setPadding(dp(ctx, 8), dp(ctx, 8), 0, dp(ctx, 8))
        }

        val hideLabelsToggle = ToggleView(ctx).apply { setChecked(NextGenStore.hideLabels, false) }
        homeList.addView(sectionLabel(ctx, "Display"))
        homeList.addView(
            toggleCard(ctx, "Hide Row Labels", "Enabled: no label below posters on home rows", hideLabelsToggle),
            lp(top = 0)
        )
        homeList.addView(sectionLabel(ctx, "Home Rows"))

        val catalogToggles = ArrayList<Pair<String, ToggleView>>()
        val rowOrderSavers = ArrayList<() -> Unit>()
        fun rowsCard(group: String, heading: String, subtitle: String, titles: List<String>, labels: List<String> = titles) {
            val labelOf = titles.zip(labels).toMap()
            val toggleOf = titles.associateWith { k ->
                ToggleView(ctx).apply { setChecked(NextGenStore.catalogRowEnabled(k), false) }
            }
            toggleOf.forEach { (k, t) -> catalogToggles += k to t }
            val order = NextGenStore.rowOrder(group, titles).toMutableList()
            rowOrderSavers += { NextGenStore.setRowOrder(group, order) }
            val rows = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
            fun render() {
                rows.removeAllViews()
                order.forEachIndexed { idx, key ->
                    val t = toggleOf.getValue(key)
                    (t.parent as? android.view.ViewGroup)?.removeView(t)
                    fun move(by: Int) {
                        val to = idx + by
                        if (to !in order.indices) return
                        order.add(to, order.removeAt(idx))
                        render()
                    }
                    rows.addView(LinearLayout(ctx).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER_VERTICAL
                        setPadding(dp(ctx, 8), dp(ctx, 6), dp(ctx, 8), dp(ctx, 6))
                        addView(text(ctx, labelOf.getValue(key), 16f, C.TEXT), LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
                        addView(ChevronButton(ctx, true) { move(-1) }.apply { alpha = if (idx == 0) 0.3f else 1f }, LinearLayout.LayoutParams(dp(ctx, 36), dp(ctx, 36)))
                        addView(ChevronButton(ctx, false) { move(1) }.apply { alpha = if (idx == order.lastIndex) 0.3f else 1f }, LinearLayout.LayoutParams(dp(ctx, 36), dp(ctx, 36)))
                        addView(t, LinearLayout.LayoutParams(dp(ctx, 52), dp(ctx, 32)).apply { leftMargin = dp(ctx, 6) })
                        rowFocus(ctx, this, t, 14)
                    }, lp(top = 6).apply { leftMargin = -dp(ctx, 8); rightMargin = -dp(ctx, 8) })
                    if (idx != order.lastIndex) rows.addView(View(ctx).apply { setBackgroundColor(C.CARD_HIGH) },
                        LinearLayout.LayoutParams(MATCH_PARENT, dp(ctx, 1)).apply { topMargin = dp(ctx, 6) })
                }
            }
            render()
            homeList.addView(card(ctx).apply {
                setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 12), dp(ctx, 16))
                addView(text(ctx, heading, 17f, C.TEXT, bold = true))
                addView(text(ctx, subtitle, 13f, C.TEXT_DIM), lp(top = 2))
                addView(View(ctx).apply { setBackgroundColor(C.CARD_HIGH) },
                    LinearLayout.LayoutParams(MATCH_PARENT, dp(ctx, 1)).apply { topMargin = dp(ctx, 12) })
                addView(rows)
            }, lp(top = 10))
        }
        rowsCard("anilist", "ANILIST", "Rows shown on the AniList home page. Use the arrows to reorder", NextGenAnilistApi.titles, NextGenAnilistApi.labels)

        val langEnglishToggle = ToggleView(ctx).apply { setChecked(NextGenStore.langEnglish, false) }
        val langMultiToggle = ToggleView(ctx).apply { setChecked(NextGenStore.langMultiDub, false) }
        val langJapaneseToggle = ToggleView(ctx).apply { setChecked(NextGenStore.langJapanese, false) }
        langList.addView(sectionLabel(ctx, "Stream language"))
        langList.addView(toggleCard(ctx, "English", "English streams only", langEnglishToggle), lp(top = 0))
        langList.addView(toggleCard(ctx, "Japanese", "Japanese streams only", langJapaneseToggle), lp(top = 10))
        langList.addView(toggleCard(ctx, "Multi-Dub", "Other languages (Hindi, Telugu, etc.)", langMultiToggle), lp(top = 10))
        langList.addView(note("Several can be on at once:\nA stream is kept if it matches any of them.\nWith none on, every stream is shown.\nA stream with no language in its name (e.g. Re:Anime) is shown under Multi-Dub only.\nA stream naming another language (AniWorld • Hindi, AniWorld • Telugu) is also Multi-Dub."))

        val perfSub = text(ctx, "", 13f, C.TEXT_DIM)
        fun refreshMenu() {
            val atOnce = if (autoToggle.checked) "${toggles.count { it.second.checked }.coerceAtLeast(1)} at once (Auto)"
            else "$concurrencyValue at once"
            perfSub.text = "$atOnce · " +
                (if (timeoutValue == NextGenStore.TIMEOUT_AUTO) "Auto timeout" else "${timeoutValue}s timeout")
        }
        refreshMenu()
        menuList.addView(sectionLabel(ctx, "Preferences"))
        menuList.addView(
            menuCard(ctx, IconView.Kind.BOLT, C.PRIMARY, "Performance", perfSub) { showPage(2) },
            lp(top = 0)
        )
        menuList.addView(
            menuCard(
                ctx, IconView.Kind.LIST, Color.parseColor("#5E9BFF"), "Language",
                text(ctx, "English, Japanese & Multi-Dub streams", 13f, C.TEXT_DIM)
            ) { showPage(3) },
            lp(top = 12)
        )
        menuList.addView(
            menuCard(
                ctx, IconView.Kind.GRID, Color.parseColor("#34C759"), "Home",
                text(ctx, "Show, hide and reorder home rows", 13f, C.TEXT_DIM)
            ) { showPage(4) },
            lp(top = 12)
        )

        fun keyOf(sc: NextGenScraper) = sc.id.substringAfter(':')

        provList.addView(sectionLabel(ctx, "Providers"))

        fun setAll(on: Boolean) {
            toggles.forEach { (sc, t) ->
                if (sc.manifestEnabled) t.setChecked(on, false)
            }
        }
        provList.addView(LinearLayout(ctx).apply {
            addView(
                button(ctx, "Enable all", filled = true) { setAll(true) },
                LinearLayout.LayoutParams(0, dp(ctx, 46), 1f).apply { rightMargin = dp(ctx, 6) })
            addView(
                button(ctx, "Disable all", filled = false) { setAll(false) },
                LinearLayout.LayoutParams(0, dp(ctx, 46), 1f).apply { leftMargin = dp(ctx, 6) })
        }, lp(top = 14))

        if (scrapers.isEmpty()) provList.addView(text(ctx, "No providers bundled.", 15f, C.TEXT_DIM))
        scrapers.forEach { sc ->
            val toggle = ToggleView(ctx).apply {
                setChecked(NextGenStore.isEnabled(sc.id, sc.manifestEnabled, sc.defaultEnabled), false)
                isEnabled = sc.manifestEnabled
                onChange = { refreshSubtitle() }
            }
            toggles += sc to toggle
            provList.addView(providerCard(ctx, sc, toggle), lp(top = 10))
        }

        refreshSubtitle()

        val actions = LinearLayout(ctx).apply {
            setBackgroundColor(C.BG)
            setPadding(dp(ctx, 16), dp(ctx, 12), dp(ctx, 16), dp(ctx, 28))
            addView(
                button(ctx, "Cancel", filled = false) { dialog.dismiss() },
                LinearLayout.LayoutParams(0, dp(ctx, 52), 1f).apply { rightMargin = dp(ctx, 8) })
            addView(button(ctx, "Save", filled = true) {
                NextGenStore.concurrency = concurrencyValue
                NextGenStore.concurrencyAuto = autoToggle.checked
                NextGenStore.timeoutSeconds = timeoutValue
                NextGenStore.totalCap = totalCapValue
                NextGenStore.perProviderCapEnabled = perCapToggle.checked
                providerCapValues.forEach { (id, v) -> NextGenStore.setProviderCap(id, v) }
                NextGenStore.hideLabels = hideLabelsToggle.checked
                NextGenStore.langEnglish = langEnglishToggle.checked
                NextGenStore.langMultiDub = langMultiToggle.checked
                NextGenStore.langJapanese = langJapaneseToggle.checked
                catalogToggles.forEach { (title, t) -> NextGenStore.setCatalogRowEnabled(title, t.checked) }
                rowOrderSavers.forEach { it() }
                toggles.forEach { (sc, t) -> NextGenStore.setEnabled(sc.id, t.checked) }
                toast(ctx, "Saved")
                dialog.dismiss()
            }, LinearLayout.LayoutParams(0, dp(ctx, 52), 1f).apply { leftMargin = dp(ctx, 8) })
        }

        val provScroll = ScrollView(ctx).apply { addView(provList) }
        val menuScroll = ScrollView(ctx).apply { addView(menuList) }
        val perfPage = subPage(ctx, "Performance", "Search speed, Time & Stream limits", perfList) { showPage(1) }
        val langPage = subPage(ctx, "Language", "Stream language preference", langList) { showPage(1) }
        val homePage = subPage(ctx, "Home", "Show, hide and reorder rows", homeList) { showPage(1) }
        val pageViews = listOf<View>(provScroll, menuScroll, perfPage, langPage, homePage)
        val pages = android.widget.FrameLayout(ctx).apply {
            pageViews.forEach { addView(it, MATCH_PARENT, MATCH_PARENT) }
        }
        val tabViews = ArrayList<TextView>()
        var current = 0

        val tabs = LinearLayout(ctx).apply {
            background = GradientDrawable().apply {
                setColor(C.CARD)
                cornerRadius = dp(ctx, 16).toFloat()
                setStroke(dp(ctx, 1), C.OUTLINE)
            }
            setPadding(dp(ctx, 4), dp(ctx, 4), dp(ctx, 4), dp(ctx, 4))
            listOf("Providers", "Settings").forEachIndexed { i, label ->
                val t = TextView(ctx).apply {
                    text = label; textSize = 15f; gravity = Gravity.CENTER
                    setTypeface(typeface, Typeface.BOLD)
                    background = GradientDrawable().apply { cornerRadius = dp(ctx, 12).toFloat() }
                    setOnClickListener { showPage(i) }
                    focusRing(ctx, this, 12, 1f)
                }
                tabViews += t
                addView(t, LinearLayout.LayoutParams(0, dp(ctx, 40), 1f))
            }
        }
        showPage = { i ->
            val prev = current
            current = i
            pageViews.forEachIndexed { idx, v -> v.visibility = if (idx == i) View.VISIBLE else View.GONE }
            val top = i <= 1
            header.visibility = if (top) View.VISIBLE else View.GONE
            tabs.visibility = if (top) View.VISIBLE else View.GONE
            tabViews.forEachIndexed { idx, t ->
                val on = idx == i
                t.setTextColor(if (on) C.ON_PRIMARY else C.TEXT_DIM)
                (t.background as GradientDrawable).setColor(if (on) C.PRIMARY else Color.TRANSPARENT)
            }
            if (i == 1) refreshMenu()
            if (!pages.isInTouchMode) {
                val target: View = if (i == 1 && prev >= 2) menuList.getChildAt(prev - 1) else pageViews[i]
                target.requestFocus()
            }
        }
        showPage(0)
        dialog.setOnKeyListener { _, keyCode, ev ->
            if (keyCode == KeyEvent.KEYCODE_BACK && current >= 2) {
                if (ev.action == KeyEvent.ACTION_UP) showPage(1)
                true
            } else false
        }

        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(C.BG)
            val maxW = minOf(ctx.resources.displayMetrics.widthPixels, dp(ctx, 640))
            fun colLp(h: Int, w: Float = 0f) =
                (if (w > 0f) LinearLayout.LayoutParams(maxW, h, w) else LinearLayout.LayoutParams(maxW, h))
                    .apply { gravity = Gravity.CENTER_HORIZONTAL }
            addView(header, colLp(WRAP_CONTENT))
            addView(tabs, LinearLayout.LayoutParams(maxW - dp(ctx, 32), WRAP_CONTENT).apply {
                gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = dp(ctx, 4)
            })
            addView(pages, colLp(0, 1f))
            addView(actions, colLp(WRAP_CONTENT))
        }
        dialog.setContentView(root)
        dialog.window?.apply {
            setBackgroundDrawable(ColorDrawable(C.BG))
            addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
            statusBarColor = C.BG
            navigationBarColor = C.BG
        }
        dialog.show()
    }

    private fun providerCard(ctx: Context, s: NextGenScraper, toggle: ToggleView): View {
        val info = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            addView(text(ctx, s.name, 17f, C.TEXT, bold = true))
            val sub = s.description ?: ""
            if (sub.isNotBlank()) addView(text(ctx, sub, 13f, C.TEXT_DIM), lp(top = 2))
        }
        return card(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 12), dp(ctx, 14))
            addView(info, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
            if (s.hasSettings) addView(GearView(ctx).apply {
                setOnClickListener { scraperSettings(ctx, s) }
                focusRing(ctx, this, 22, 1.1f)
            }, LinearLayout.LayoutParams(dp(ctx, 44), dp(ctx, 44)).apply { rightMargin = dp(ctx, 4) })
            addView(toggle, LinearLayout.LayoutParams(dp(ctx, 52), dp(ctx, 32)))
            if (toggle.isEnabled) rowFocus(ctx, this, toggle)
        }
    }

    private fun scraperSettings(ctx: Context, s: NextGenScraper) {
        uiScope.launch {
            toast(ctx, "Loading settings…")
            val layout = NextGenRuntime.settingsLayout(s)
            val saved = runCatching { JSONObject(NextGenStore.settingsJson(s.id)) }.getOrDefault(JSONObject())
            val box = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(ctx, 20), 0, dp(ctx, 20), dp(ctx, 8))
            }
            val collect = mutableListOf<(JSONObject) -> Unit>()

            for (i in 0 until layout.length()) {
                val f = layout.optJSONObject(i) ?: continue
                val key = f.optString("key")
                val labelText = f.optString("label")
                val desc = f.optString("description")
                fun addDesc() {
                    if (desc.isNotBlank()) box.addView(text(ctx, desc, 13f, C.TEXT_DIM).apply {
                        setPadding(dp(ctx, 4), dp(ctx, 6), 0, 0)
                    })
                }
                when (f.optString("type", "info")) {
                    "header" -> box.addView(sectionLabel(ctx, labelText))
                    "info", "" -> box.addView(text(ctx, labelText, 14f, C.TEXT_DIM).apply {
                        setPadding(dp(ctx, 4), dp(ctx, 8), 0, dp(ctx, 4))
                    })

                    "text" -> {
                        box.addView(sectionLabel(ctx, labelText))
                        val et = EditText(ctx).apply {
                            hint = f.optString("placeholder")
                            setText(saved.optString(key, ""))
                            textSize = 16f; setTextColor(C.TEXT); setHintTextColor(C.OUTLINE)
                            background = null
                            setPadding(0, dp(ctx, 4), 0, dp(ctx, 4))
                        }
                        box.addView(fieldCard(ctx, et))
                        addDesc()
                        collect += { out -> out.put(key, et.text.toString()) }
                    }

                    "toggle" -> {
                        val t = ToggleView(ctx).apply {
                            setChecked(
                                if (saved.has(key)) saved.optBoolean(key) else f.optBoolean(
                                    "defaultValue",
                                    false
                                ), false
                            )
                        }
                        val row = LinearLayout(ctx).apply {
                            gravity = Gravity.CENTER_VERTICAL
                            addView(text(ctx, labelText, 16f, C.TEXT), LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
                            addView(t, LinearLayout.LayoutParams(dp(ctx, 52), dp(ctx, 32)))
                        }
                        val fc = fieldCard(ctx, row)
                        rowFocus(ctx, fc, t, 16)
                        box.addView(fc, lp(top = 12))
                        addDesc()
                        collect += { out -> out.put(key, t.checked) }
                    }

                    "select" -> {
                        val opts = f.optJSONArray("options")
                        val values = ArrayList<String>()
                        val labels = ArrayList<String>()
                        if (opts != null) for (j in 0 until opts.length()) {
                            val o = opts.optJSONObject(j) ?: continue
                            values += o.optString("value")
                            labels += o.optString("label", o.optString("value"))
                        }
                        var selected = values.indexOf(
                            if (saved.has(key)) saved.optString(key) else f.optString("defaultValue", "")
                        ).coerceAtLeast(0)
                        box.addView(sectionLabel(ctx, labelText))
                        val value = text(ctx, labels.getOrElse(selected) { "" }, 16f, C.TEXT)
                        val row = LinearLayout(ctx).apply {
                            gravity = Gravity.CENTER_VERTICAL
                            addView(value, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
                            addView(text(ctx, "▾", 18f, C.TEXT_DIM))
                            setOnClickListener {
                                if (labels.isEmpty()) return@setOnClickListener
                                AlertDialog.Builder(ctx, android.R.style.Theme_Material_Dialog_Alert)
                                    .setTitle(labelText)
                                    .setSingleChoiceItems(labels.toTypedArray(), selected) { d, which ->
                                        selected = which
                                        value.text = labels[which]
                                        d.dismiss()
                                    }.show()
                            }
                        }
                        val fc = fieldCard(ctx, row)
                        focusRing(ctx, fc, 16)
                        fc.setOnClickListener { row.performClick() }
                        box.addView(fc)
                        addDesc()
                        collect += { out -> if (values.isNotEmpty()) out.put(key, values[selected]) }
                    }

                    else -> Unit
                }
            }
            if (layout.length() == 0) box.addView(text(ctx, "This provider has no settings.", 15f, C.TEXT_DIM))

            floatingDialog(ctx, s.name, box) {
                val out = JSONObject()
                collect.forEach { it(out) }
                NextGenStore.saveSettings(s.id, out.toString())
                toast(ctx, "Saved")
            }
        }
    }

    private fun floatingDialog(ctx: Context, title: String, content: View, onSave: () -> Unit) {
        val dialog = Dialog(ctx, android.R.style.Theme_Material_NoActionBar)
        val dm = ctx.resources.displayMetrics
        val maxH = (dm.heightPixels * 0.55f).toInt()
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply {
                setColor(C.CARD)
                cornerRadius = dp(ctx, 20).toFloat()
                setStroke(dp(ctx, 1), C.OUTLINE)
            }
            setPadding(0, dp(ctx, 24), 0, dp(ctx, 20))
        }
        root.addView(text(ctx, title, 24f, C.TEXT, bold = true).apply {
            setPadding(dp(ctx, 24), 0, dp(ctx, 24), dp(ctx, 4))
        })
        root.addView(object : ScrollView(ctx) {
            override fun onMeasure(w: Int, h: Int) =
                super.onMeasure(w, MeasureSpec.makeMeasureSpec(maxH, MeasureSpec.AT_MOST))
        }.apply { addView(content) })
        root.addView(LinearLayout(ctx).apply {
            gravity = Gravity.END
            addView(
                button(ctx, "Cancel", filled = false, compact = true) { dialog.dismiss() },
                LinearLayout.LayoutParams(WRAP_CONTENT, dp(ctx, 44)).apply { rightMargin = dp(ctx, 8) })
            addView(
                button(ctx, "Save", filled = true, compact = true) { onSave(); dialog.dismiss() },
                LinearLayout.LayoutParams(WRAP_CONTENT, dp(ctx, 44))
            )
        }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
            topMargin = dp(ctx, 16); leftMargin = dp(ctx, 24); rightMargin = dp(ctx, 24)
        })
        dialog.setContentView(root)
        dialog.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout((dm.widthPixels * 0.9f).toInt(), WRAP_CONTENT)
            setGravity(Gravity.CENTER)
            addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            setDimAmount(0.6f)
        }
        dialog.show()
    }

}
