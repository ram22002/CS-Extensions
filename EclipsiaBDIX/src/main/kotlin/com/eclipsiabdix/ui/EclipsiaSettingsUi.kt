package com.eclipsiabdix

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

object EclipsiaSettingsUi {
    private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    fun show(ctx: Context) {
        val dialog = Dialog(ctx, android.R.style.Theme_Material_NoActionBar)
        val scrapers = EclipsiaRepository.allScrapers()
        val toggles = ArrayList<Pair<EclipsiaScraper, ToggleView>>()

        fun pageColumn() = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(ctx, 16), 0, dp(ctx, 16), dp(ctx, 48))
        }

        val perfList = pageColumn()
        val tmdbList = pageColumn()
        val posterList = pageColumn()
        val homeList = pageColumn()
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
            addView(text(ctx, "EclipsiaBDIX", 34f, C.TEXT, bold = true))
            addView(subtitle, lp(top = 4))
        }

        var timeoutValue = EclipsiaStore.timeoutSeconds
        fun timeoutLabel() =
            if (timeoutValue == EclipsiaStore.TIMEOUT_AUTO) "Auto" else "${timeoutValue}s"
        val timeoutText = text(ctx, timeoutLabel(), 18f, C.TEXT, bold = true).apply { gravity = Gravity.CENTER }
        fun stepTimeout(delta: Int) {
            val cur = timeoutValue
            val next = if (cur == EclipsiaStore.TIMEOUT_AUTO) {
                if (delta > 0) EclipsiaStore.MIN_TIMEOUT_SECONDS else EclipsiaStore.TIMEOUT_AUTO
            } else cur + delta
            timeoutValue = if (next < EclipsiaStore.MIN_TIMEOUT_SECONDS) EclipsiaStore.TIMEOUT_AUTO
            else next.coerceAtMost(EclipsiaStore.MAX_TIMEOUT_SECONDS)
            timeoutText.text = timeoutLabel()
        }
        perfList.addView(sectionLabel(ctx, "Search"))
        perfList.addView(
            settingCard(
                ctx, "Timeout",
                "Auto gives each provider up to 60s. Or set a limit " +
                    "(${EclipsiaStore.MIN_TIMEOUT_SECONDS} - ${EclipsiaStore.MAX_TIMEOUT_SECONDS}s) after which the " +
                    "whole search stops, however many providers are active. Links already found are kept.",
                stepper(ctx, timeoutText, 56,
                    { stepTimeout(-EclipsiaStore.TIMEOUT_STEP_SECONDS) },
                    { stepTimeout(EclipsiaStore.TIMEOUT_STEP_SECONDS) })
            ), lp(top = 10)
        )

        val key = EditText(ctx).apply {
            hint = "Enter your TMDb API key"
            setText(EclipsiaStore.tmdbKeyOverride)
            textSize = 16f
            setTextColor(C.TEXT)
            setHintTextColor(C.OUTLINE)
            inputType = InputType.TYPE_CLASS_TEXT
            background = null
            setPadding(0, dp(ctx, 4), 0, dp(ctx, 4))
        }
        val keyCard = fieldCard(ctx, key)
        val keyHint =
            text(ctx, "Used instead of the built-in key [Recommended]", 13f, C.TEXT_DIM).apply {
                setPadding(dp(ctx, 8), dp(ctx, 8), 0, 0)
            }
        val personalToggle = ToggleView(ctx).apply {
            setChecked(EclipsiaStore.tmdbPersonalEnabled, false)
            onChange = { on ->
                val v = if (on) View.VISIBLE else View.GONE
                keyCard.visibility = v; keyHint.visibility = v
            }
        }
        keyCard.visibility = if (personalToggle.checked) View.VISIBLE else View.GONE
        keyHint.visibility = keyCard.visibility
        tmdbList.addView(
            toggleCard(ctx, "Personal API key", "Custom API key is Recommended\nDisabled: built-in key is used", personalToggle)
        )
        tmdbList.addView(keyCard, lp(top = 10))
        tmdbList.addView(keyHint)

        fun plainField(initial: String, hintText: String, sizeSp: Float = 16f) = EditText(ctx).apply {
            hint = hintText
            setText(initial)
            textSize = sizeSp
            setTextColor(C.TEXT)
            setHintTextColor(C.OUTLINE)
            inputType = InputType.TYPE_CLASS_TEXT
            background = null
            setPadding(0, dp(ctx, 4), 0, dp(ctx, 4))
        }
        fun note(msg: String) = text(ctx, msg, 13f, C.TEXT_DIM).apply {
            setPadding(dp(ctx, 8), dp(ctx, 8), 0, dp(ctx, 8))
        }
        tmdbList.addView(sectionLabel(ctx, "Region & language"))
        val regionField = plainField(EclipsiaStore.region, "US")
        tmdbList.addView(fieldCard(ctx, regionField), lp(top = 10))
        tmdbList.addView(note("Country code (e.g. US, GB, DE), used for the home rows."))
        val languageField = plainField(EclipsiaStore.language, "en-US")
        tmdbList.addView(fieldCard(ctx, languageField), lp(top = 10))
        tmdbList.addView(note("TMDb language for titles, descriptions and title logos (e.g. en-US, de-DE, pt-BR). Invalid values fall back to ${EclipsiaStore.DEFAULT_LANGUAGE}."))

        val posterField = EditText(ctx).apply {
            hint = "https://…/{imdb_id}.jpg"
            setText(EclipsiaStore.customPosterTemplate)
            textSize = 14f
            setTextColor(C.TEXT)
            setHintTextColor(C.OUTLINE)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            background = null
            setPadding(0, dp(ctx, 4), 0, dp(ctx, 4))
        }
        val posterFieldCard = fieldCard(ctx, posterField)
        val posterHint = text(
            ctx,
                "TMDb poster is used when poster is missing. Applies to the home page, details and recommendations.",
            13f, C.TEXT_DIM
        ).apply { setPadding(dp(ctx, 8), dp(ctx, 8), 0, dp(ctx, 8)) }
        val posterPresets = listOf(
            "BetterPosters" to "https://btttr.cc/poster-ra/imdb/poster-default/{imdb_id}.jpg?tag=none&rs=IM",
            "Poster+" to "https://postersplus.elfhosted.com/p/bar_sash/{type}/{imdb_id}.jpg",
        )
        val posterChips = LinearLayout(ctx).apply {
            posterPresets.forEach { (label, url) ->
                addView(TextView(ctx).apply {
                    text = label; textSize = 14f; setTextColor(C.ON_TONAL)
                    setTypeface(typeface, Typeface.BOLD); gravity = Gravity.CENTER
                    background = GradientDrawable().apply { setColor(C.TONAL); cornerRadius = dp(ctx, 18).toFloat() }
                    setPadding(dp(ctx, 18), 0, dp(ctx, 18), 0)
                    focusRing(ctx, this, 18, 1f)
                    setOnClickListener { posterField.setText(url) }
                }, LinearLayout.LayoutParams(WRAP_CONTENT, dp(ctx, 36)).apply { rightMargin = dp(ctx, 8) })
            }
        }
        val posterToggle = ToggleView(ctx).apply {
            setChecked(EclipsiaStore.customPosterEnabled, false)
            onChange = { on ->
                val v = if (on) View.VISIBLE else View.GONE
                posterFieldCard.visibility = v; posterHint.visibility = v; posterChips.visibility = v
            }
        }
        val posterVisibility = if (posterToggle.checked) View.VISIBLE else View.GONE
        posterFieldCard.visibility = posterVisibility
        posterHint.visibility = posterVisibility
        posterChips.visibility = posterVisibility
        posterList.addView(toggleCard(ctx, "Custom Poster", "Disabled: TMDb posters are used", posterToggle))
        posterList.addView(posterFieldCard, lp(top = 10))
        posterList.addView(posterHint)
        posterList.addView(posterChips)

        val hideLabelsToggle = ToggleView(ctx).apply { setChecked(EclipsiaStore.hideLabels, false) }
        posterList.addView(
            toggleCard(ctx, "Hide Labels", "Enabled: no label below posters on home rows and recommendations", hideLabelsToggle),
            lp(top = 10)
        )

        val (posterPreview, reloadPosterPreview) = EclipsiaPosterPreview.build(ctx, uiScope, { hideLabelsToggle.checked }) {
            if (!posterToggle.checked) null
            else posterField.text.toString().trim()
                .replace("%7B", "{", ignoreCase = true).replace("%7D", "}", ignoreCase = true)
                .takeIf { it.startsWith("http://") || it.startsWith("https://") }
        }
        posterList.addView(posterPreview, lp(top = 16))
        hideLabelsToggle.onChange = { reloadPosterPreview() }
        val toggleVisibility = posterToggle.onChange
        posterToggle.onChange = { on ->
            toggleVisibility?.invoke(on)
            reloadPosterPreview()
        }
        posterPresets.forEachIndexed { i, preset ->
            posterChips.getChildAt(i).setOnClickListener { posterField.setText(preset.second); reloadPosterPreview() }
        }
        reloadPosterPreview()

        val catalogToggles = ArrayList<Pair<String, ToggleView>>()
        val rowOrderSavers = ArrayList<() -> Unit>()
        fun rowsCard(group: String, heading: String, subtitle: String, titles: List<String>, labels: List<String> = titles) {
            val labelOf = titles.zip(labels).toMap()
            val toggleOf = titles.associateWith { k ->
                ToggleView(ctx).apply { setChecked(EclipsiaStore.catalogRowEnabled(k), false) }
            }
            toggleOf.forEach { (k, t) -> catalogToggles += k to t }
            val order = EclipsiaStore.rowOrder(group, titles).toMutableList()
            rowOrderSavers += { EclipsiaStore.setRowOrder(group, order) }
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
        rowsCard("tmdb", "TMDb", "Rows shown on the EclipsiaBDIX home page. Use the arrows to reorder", EclipsiaCatalog.titles)

        fun saveTmdb() {
            EclipsiaStore.customPosterTemplate = posterField.text.toString()
            EclipsiaStore.customPosterEnabled = posterToggle.checked
            EclipsiaStore.hideLabels = hideLabelsToggle.checked
            EclipsiaStore.tmdbKeyOverride = key.text.toString()
            EclipsiaStore.tmdbPersonalEnabled = personalToggle.checked
            EclipsiaStore.region = regionField.text.toString()
            EclipsiaStore.language = languageField.text.toString()
        }

        val perfSub = text(ctx, "", 13f, C.TEXT_DIM)
        fun refreshMenu() {
            val atOnce = "${toggles.count { it.second.checked }.coerceAtLeast(1)} at once (Auto)"
            perfSub.text = "$atOnce · " +
                (if (timeoutValue == EclipsiaStore.TIMEOUT_AUTO) "Auto timeout" else "${timeoutValue}s timeout")
        }
        refreshMenu()
        menuList.addView(sectionLabel(ctx, "Preferences"))
        menuList.addView(
            menuCard(ctx, IconView.Kind.BOLT, Color.parseColor("#FF9F0A"), "Performance", perfSub) { showPage(2) },
            lp(top = 0)
        )
        menuList.addView(
            menuCard(
                ctx, IconView.Kind.KEY, Color.parseColor("#0A84FF"), "TMDb",
                text(ctx, "API key, Region and Language", 13f, C.TEXT_DIM)
            ) { showPage(3) },
            lp(top = 12)
        )
        menuList.addView(
            menuCard(
                ctx, IconView.Kind.IMAGE, Color.parseColor("#30D158"), "Poster",
                text(ctx, "Custom poster, labels and Preview", 13f, C.TEXT_DIM)
            ) { showPage(4) },
            lp(top = 12)
        )
        menuList.addView(
            menuCard(
                ctx, IconView.Kind.LIST, Color.parseColor("#FF453A"), "Home",
                text(ctx, "Show, hide and reorder home rows", 13f, C.TEXT_DIM)
            ) { showPage(5) },
            lp(top = 12)
        )

        val categories = EclipsiaRepository.CATEGORIES
        fun keyOf(sc: EclipsiaScraper) = sc.id.substringAfter(':')
        val catKeys = scrapers.filter { sc -> categories.any { it.id == sc.category } }.map { keyOf(it) }.toSet()
        var syncing = false
        val catSync = ArrayList<() -> Unit>()
        val memberCards = HashMap<String, View>()
        val catBox = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        val holderSync = ArrayList<() -> Unit>()
        fun syncHolders() = holderSync.forEach { it() }

        val chipRow = LinearLayout(ctx).apply {
            EclipsiaRepository.PRESETS.forEach { preset ->
                addView(TextView(ctx).apply {
                    text = preset.label; textSize = 14f; setTextColor(C.ON_TONAL)
                    setTypeface(typeface, Typeface.BOLD); gravity = Gravity.CENTER
                    background = GradientDrawable().apply { setColor(C.TONAL); cornerRadius = dp(ctx, 18).toFloat() }
                    setPadding(dp(ctx, 18), 0, dp(ctx, 18), 0)
                    focusRing(ctx, this, 18, 1f)
                    setOnClickListener {
                        toggles.forEach { (sc, t) ->
                            if (!sc.manifestEnabled) return@forEach
                            val listed = keyOf(sc) in preset.providerIds
                            if (keyOf(sc) !in catKeys) t.setChecked(listed, false)
                            else if (listed) t.setChecked(true, false)
                        }
                        catSync.forEach { it() }
                        syncHolders()
                    }
                }, LinearLayout.LayoutParams(WRAP_CONTENT, dp(ctx, 36)).apply { rightMargin = dp(ctx, 8) })
            }
        }
        if (categories.isNotEmpty()) {
            provList.addView(sectionLabel(ctx, "Categories"))
            provList.addView(catBox)
        }
        provList.addView(sectionLabel(ctx, "Providers"))
        if (EclipsiaRepository.PRESETS.isNotEmpty()) {
            provList.addView(android.widget.HorizontalScrollView(ctx).apply {
                isHorizontalScrollBarEnabled = false
                addView(chipRow)
            }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        }

        fun setAll(on: Boolean) {
            toggles.forEach { (sc, t) ->
                if (sc.manifestEnabled && keyOf(sc) !in catKeys) t.setChecked(on, false)
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
                setChecked(EclipsiaStore.isEnabled(sc.id, sc.manifestEnabled, sc.defaultEnabled), false)
                isEnabled = sc.manifestEnabled
                onChange = { refreshSubtitle() }
            }
            toggles += sc to toggle
            val card = providerCard(ctx, sc, toggle)
            if (keyOf(sc) in catKeys) memberCards[keyOf(sc)] = card
            else provList.addView(card, lp(top = 10))
        }

        categories.forEach { cat ->
            val members = scrapers.filter { it.category == cat.id }
                .mapNotNull { sc -> toggles.firstOrNull { it.first.id == sc.id } }
            if (members.isEmpty()) return@forEach
            val anyOn = members.any { it.second.checked }
            val holder = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                visibility = if (anyOn) View.VISIBLE else View.GONE
                members.forEach { m ->
                    memberCards[keyOf(m.first)]?.let { addView(it, lp(top = 8).apply { leftMargin = dp(ctx, 16) }) }
                }
            }
            val catToggle = ToggleView(ctx).apply {
                setChecked(anyOn, false)
                onChange = { on ->
                    if (!syncing) members.forEach { it.second.setChecked(on, false) }
                    syncHolders()
                }
            }
            catSync += {
                val any = members.any { it.second.checked }
                syncing = true
                catToggle.setChecked(any, false)
                syncing = false
                syncHolders()
            }
            val catCard = card(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 12), dp(ctx, 14))
                addView(LinearLayout(ctx).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(text(ctx, cat.label, 17f, C.TEXT, bold = true))
                    if (cat.bannerText.isNotBlank()) addView(
                        text(ctx, cat.bannerText, 13f, C.TEXT_DIM).apply { setLineSpacing(0f, 1.2f) },
                        lp(top = 2)
                    )
                }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
                addView(catToggle, LinearLayout.LayoutParams(dp(ctx, 52), dp(ctx, 32)))
                rowFocus(ctx, this, catToggle)
            }
            holderSync += {
                holder.visibility = if (members.any { it.second.checked }) View.VISIBLE else View.GONE
            }
            catBox.addView(catCard, lp(top = 10))
            catBox.addView(holder)
        }
        syncHolders()
        refreshSubtitle()

        val actions = LinearLayout(ctx).apply {
            setBackgroundColor(C.BG)
            setPadding(dp(ctx, 16), dp(ctx, 12), dp(ctx, 16), dp(ctx, 28))
            addView(
                button(ctx, "Cancel", filled = false) { dialog.dismiss() },
                LinearLayout.LayoutParams(0, dp(ctx, 52), 1f).apply { rightMargin = dp(ctx, 8) })
            addView(button(ctx, "Save", filled = true) {
                EclipsiaStore.timeoutSeconds = timeoutValue
                saveTmdb()
                catalogToggles.forEach { (title, t) -> EclipsiaStore.setCatalogRowEnabled(title, t.checked) }
                rowOrderSavers.forEach { it() }
                toggles.forEach { (sc, t) -> EclipsiaStore.setEnabled(sc.id, t.checked) }
                toast(ctx, "Saved")
                dialog.dismiss()
            }, LinearLayout.LayoutParams(0, dp(ctx, 52), 1f).apply { leftMargin = dp(ctx, 8) })
        }

        val provScroll = ScrollView(ctx).apply { addView(provList) }
        val menuScroll = ScrollView(ctx).apply { addView(menuList) }
        val perfPage = subPage(ctx, "Performance", "Search speed & Time limits", perfList) { showPage(1) }
        val tmdbPage = subPage(ctx, "TMDb", "API key, Region and Language", tmdbList) { showPage(1) }
        val posterPage = subPage(ctx, "Poster", "Custom poster, labels and Preview", posterList) { showPage(1) }
        val homePage = subPage(ctx, "Home", "Show, hide and reorder rows", homeList) { showPage(1) }
        val pageViews = listOf<View>(provScroll, menuScroll, perfPage, tmdbPage, posterPage, homePage)
        val pages = android.widget.FrameLayout(ctx).apply {
            pageViews.forEach { addView(it, MATCH_PARENT, MATCH_PARENT) }
        }
        val tabViews = ArrayList<TextView>()
        var current = 0

        val tabs = LinearLayout(ctx).apply {
            background = GradientDrawable().apply { setColor(C.CARD); cornerRadius = dp(ctx, 22).toFloat() }
            setPadding(dp(ctx, 4), dp(ctx, 4), dp(ctx, 4), dp(ctx, 4))
            listOf("Providers", "Settings").forEachIndexed { i, label ->
                val t = TextView(ctx).apply {
                    text = label; textSize = 15f; gravity = Gravity.CENTER
                    setTypeface(typeface, Typeface.BOLD)
                    background = GradientDrawable().apply { cornerRadius = dp(ctx, 18).toFloat() }
                    setOnClickListener { showPage(i) }
                    focusRing(ctx, this, 18, 1f)
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

    private fun providerCard(ctx: Context, s: EclipsiaScraper, toggle: ToggleView): View {
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

    private fun scraperSettings(ctx: Context, s: EclipsiaScraper) {
        uiScope.launch {
            toast(ctx, "Loading settings…")
            val layout = EclipsiaRuntime.settingsLayout(s)
            val saved = runCatching { JSONObject(EclipsiaStore.settingsJson(s.id)) }.getOrDefault(JSONObject())
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
                EclipsiaStore.saveSettings(s.id, out.toString())
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
            background = GradientDrawable().apply { setColor(C.CARD); cornerRadius = dp(ctx, 28).toFloat() }
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
