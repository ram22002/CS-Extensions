package com.live

import android.app.AlertDialog
import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

object PlayZSettingsUi {
    private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    fun show(ctx: Context) {
        val dialog = Dialog(ctx, android.R.style.Theme_Material_NoActionBar)
        val sources = JsSources.all

        fun pageColumn() = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(ctx, 16), 0, dp(ctx, 16), dp(ctx, 48))
        }

        val homeList = pageColumn()
        val horizontalToggle = ToggleView(ctx).apply { setChecked(JsStore.horizontalPosters, false) }
        val rowToggles = ArrayList<Triple<Pair<String, String>, String, ToggleView>>()
        val rowOrderSavers = ArrayList<() -> Unit>()
        for (source in sources) for (variant in source.variants) {
            if (!variant.hasHome) continue
            val titles = JsStore.seenRows(source.id, variant.id)
            val heading = card(ctx).apply { setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 12), dp(ctx, 16)) }
            heading.addView(text(ctx, variant.name.uppercase(), 17f, C.TEXT, bold = true))
            if (titles.isEmpty()) {
                heading.addView(
                    text(ctx, "Open this catalog's home page once and its rows will be listed here", 13f, C.TEXT_DIM),
                    lp(top = 2)
                )
                homeList.addView(heading, lp(top = 10))
                continue
            }
            heading.addView(text(ctx, "Use the arrows to reorder", 13f, C.TEXT_DIM), lp(top = 2))
            heading.addView(View(ctx).apply { setBackgroundColor(C.CARD_HIGH) },
                LinearLayout.LayoutParams(MATCH_PARENT, dp(ctx, 1)).apply { topMargin = dp(ctx, 12) })
            val toggleOf = titles.associateWith { k ->
                ToggleView(ctx).apply { setChecked(JsStore.rowEnabled(source.id, variant.id, k), false) }
            }
            toggleOf.forEach { (k, t) -> rowToggles += Triple(source.id to variant.id, k, t) }
            val order = JsStore.rowOrder(source.id, variant.id, titles).toMutableList()
            rowOrderSavers += { JsStore.setRowOrder(source.id, variant.id, order) }
            val list = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
            fun render() {
                list.removeAllViews()
                order.forEachIndexed { idx, key ->
                    val t = toggleOf.getValue(key)
                    (t.parent as? android.view.ViewGroup)?.removeView(t)
                    val pinned = key == JsStore.PINNED_ROW
                    val floor = if (order.firstOrNull() == JsStore.PINNED_ROW) 1 else 0
                    fun move(by: Int) {
                        val to = idx + by
                        if (pinned || to < floor || to !in order.indices) return
                        order.add(to, order.removeAt(idx))
                        render()
                    }
                    list.addView(LinearLayout(ctx).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER_VERTICAL
                        setPadding(dp(ctx, 8), dp(ctx, 6), dp(ctx, 8), dp(ctx, 6))
                        addView(text(ctx, key, 16f, C.TEXT), LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
                        if (pinned) {
                            addView(View(ctx), LinearLayout.LayoutParams(dp(ctx, 72), dp(ctx, 36)))
                        } else {
                            addView(ChevronButton(ctx, true) { move(-1) }.apply { alpha = if (idx == floor) 0.3f else 1f }, LinearLayout.LayoutParams(dp(ctx, 36), dp(ctx, 36)))
                            addView(ChevronButton(ctx, false) { move(1) }.apply { alpha = if (idx == order.lastIndex) 0.3f else 1f }, LinearLayout.LayoutParams(dp(ctx, 36), dp(ctx, 36)))
                        }
                        addView(t, LinearLayout.LayoutParams(dp(ctx, 52), dp(ctx, 32)).apply { leftMargin = dp(ctx, 6) })
                        rowFocus(ctx, this, t, 14)
                    }, lp(top = 6).apply { leftMargin = -dp(ctx, 8); rightMargin = -dp(ctx, 8) })
                    if (idx != order.lastIndex) list.addView(View(ctx).apply { setBackgroundColor(C.CARD_HIGH) },
                        LinearLayout.LayoutParams(MATCH_PARENT, dp(ctx, 1)).apply { topMargin = dp(ctx, 6) })
                }
            }
            render()
            heading.addView(list)
            homeList.addView(heading, lp(top = 10))
        }

        val sourcePages = HashMap<String, View>()
        val collectors = HashMap<String, List<(JSONObject) -> Unit>>()

        val menuList = pageColumn()
        val menuScroll = ScrollView(ctx).apply { addView(menuList) }
        val pages = FrameLayout(ctx)
        var current: View = menuScroll
        val header = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(ctx, 24), dp(ctx, 40), dp(ctx, 24), dp(ctx, 16))
            addView(text(ctx, sources.joinToString(", ") { it.name }.ifBlank { "PlayZ Live" }, 34f, C.TEXT, bold = true))
            addView(text(ctx, "Home rows and source settings", 15f, C.TEXT_DIM), lp(top = 4))
        }

        fun showPage(v: View) {
            current = v
            for (i in 0 until pages.childCount) pages.getChildAt(i).visibility = if (pages.getChildAt(i) === v) View.VISIBLE else View.GONE
            header.visibility = if (v === menuScroll) View.VISIBLE else View.GONE
            if (!pages.isInTouchMode) {
                v.requestFocus()
            }
        }

        pages.addView(menuScroll, MATCH_PARENT, MATCH_PARENT)
        val homePage = subPage(ctx, "Home Rows", "Show, hide and reorder home rows", homeList) { showPage(menuScroll) }
        pages.addView(homePage, MATCH_PARENT, MATCH_PARENT)

        fun openSourcePage(source: JsSourceDef) {
            sourcePages[source.id]?.let { showPage(it); return }
            val content = pageColumn().apply { addView(text(ctx, "Loading settings…", 15f, C.TEXT_DIM), lp(top = 16)) }
            val page = subPage(ctx, source.name, "Source settings", content) { showPage(menuScroll) }
            sourcePages[source.id] = page
            pages.addView(page, MATCH_PARENT, MATCH_PARENT)
            showPage(page)
            uiScope.launch {
                val layout = loadLayout(source)
                content.removeAllViews()
                if (layout == null) {
                    sourcePages.remove(source.id)
                    content.addView(text(ctx, "Couldn't load settings for ${source.name}. Go back and try again.", 15f, C.TEXT_DIM), lp(top = 16))
                    return@launch
                }
                val saved = runCatching { JSONObject(JsStore.settingsJson(source.id)) }.getOrDefault(JSONObject())
                collectors[source.id] = buildFields(ctx, content, layout, saved)
            }
        }

        menuList.addView(sectionLabel(ctx, "Preferences"))
        menuList.addView(
            menuCard(
                ctx, IconView.Kind.LIST, Color.parseColor("#FF453A"), "Home Rows",
                text(ctx, "Show, hide and reorder home rows", 13f, C.TEXT_DIM)
            ) { showPage(homePage) },
            lp(top = 0)
        )
        menuList.addView(
            toggleCard(ctx, "Horizontal Posters", "Show home rows with wide posters instead of tall ones", horizontalToggle),
            lp(top = 12)
        )
        val withSettings = sources.filter { it.hasSettings }
        if (withSettings.isNotEmpty()) menuList.addView(sectionLabel(ctx, "Sources"))
        withSettings.forEach { source ->
            menuList.addView(
                menuCard(
                    ctx, IconView.Kind.BOLT, Color.parseColor("#FF9F0A"), source.name,
                    text(ctx, "Source settings", 13f, C.TEXT_DIM)
                ) { openSourcePage(source) },
                lp(top = 12)
            )
        }

        val actions = LinearLayout(ctx).apply {
            setBackgroundColor(C.BG)
            setPadding(dp(ctx, 16), dp(ctx, 12), dp(ctx, 16), dp(ctx, 28))
            addView(
                button(ctx, "Cancel", filled = false) { dialog.dismiss() },
                LinearLayout.LayoutParams(0, dp(ctx, 52), 1f).apply { rightMargin = dp(ctx, 8) })
            addView(button(ctx, "Save", filled = true) {
                JsStore.horizontalPosters = horizontalToggle.checked
                rowToggles.forEach { (ids, title, t) -> JsStore.setRowEnabled(ids.first, ids.second, title, t.checked) }
                rowOrderSavers.forEach { it() }
                collectors.forEach { (sourceId, collect) ->
                    val out = JSONObject()
                    collect.forEach { it(out) }
                    JsStore.saveSettings(sourceId, out.toString())
                }
                toast(ctx, "Saved")
                dialog.dismiss()
            }, LinearLayout.LayoutParams(0, dp(ctx, 52), 1f).apply { leftMargin = dp(ctx, 8) })
        }

        showPage(menuScroll)
        dialog.setOnKeyListener { _, keyCode, ev ->
            if (keyCode == KeyEvent.KEYCODE_BACK && current !== menuScroll) {
                if (ev.action == KeyEvent.ACTION_UP) showPage(menuScroll)
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

    private suspend fun loadLayout(source: JsSourceDef): JSONArray? {
        val variant = source.variants.firstOrNull() ?: return null
        val raw = JsRuntime.call(source, variant, JsScript.CATALOG, "getSettings", null) ?: return null
        val root = runCatching { JSONObject(raw) }.getOrNull() ?: return null
        if (!root.optBoolean("success", false)) return null
        return root.optJSONArray("data") ?: JSONArray()
    }

    private fun buildFields(ctx: Context, box: LinearLayout, layout: JSONArray, saved: JSONObject): List<(JSONObject) -> Unit> {
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
                        setText(if (saved.has(key)) saved.optString(key) else f.optString("defaultValue", ""))
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
                        setChecked(if (saved.has(key)) saved.optBoolean(key) else f.optBoolean("defaultValue", false), false)
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
        if (layout.length() == 0) box.addView(text(ctx, "This source has no settings.", 15f, C.TEXT_DIM))
        return collect
    }
}
