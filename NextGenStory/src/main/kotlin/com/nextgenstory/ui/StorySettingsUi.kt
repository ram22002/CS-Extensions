package com.nextgenstory

import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject

object StorySettingsUi {
    fun show(ctx: Context) {
        val dialog = Dialog(ctx, android.R.style.Theme_Material_NoActionBar)
        val sources = JsSources.all

        fun pageColumn() = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(ctx, 16), 0, dp(ctx, 16), dp(ctx, 48))
        }

        val root = FrameLayout(ctx).apply {
            setBackgroundColor(C.BG)
            fitsSystemWindows = true
        }

        val mainList = pageColumn()

        // Header
        mainList.addView(LinearLayout(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(ctx, 16), dp(ctx, 36), dp(ctx, 16), dp(ctx, 12))
            addView(BackButton(ctx) { dialog.dismiss() }, LinearLayout.LayoutParams(dp(ctx, 44), dp(ctx, 44)))
            addView(LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                addView(text(ctx, "NextGen Story", 28f, C.TEXT, bold = true))
                addView(text(ctx, "Short dramas, mini-series & vertical reels", 14f, C.TEXT_DIM), lp(top = 2))
            }, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { leftMargin = dp(ctx, 16) })
        })

        mainList.addView(sectionLabel(ctx, "Preferences"))

        val shortToggle = ToggleView(ctx).apply { setChecked(JsStore.shortNames, false) }
        mainList.addView(
            toggleCard(
                ctx, "Compact Names",
                "Display \"Story Reels\" instead of full name",
                shortToggle
            ), lp(top = 8)
        )
        shortToggle.onChange = { JsStore.shortNames = it }

        mainList.addView(sectionLabel(ctx, "Story TV Authentication"))

        val savedJson = runCatching { JSONObject(JsStore.settingsJson("storytv")) }.getOrDefault(JSONObject())
        val tokenEdit = EditText(ctx).apply {
            hint = "Bearer JWT token (optional)"
            setHintTextColor(C.TEXT_DIM)
            setTextColor(C.TEXT)
            textSize = 14f
            background = null
            setText(savedJson.optString("authToken", ""))
        }
        mainList.addView(card(ctx).apply {
            setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 16), dp(ctx, 14))
            addView(text(ctx, "Access Token (JWT)", 16f, C.TEXT, bold = true))
            addView(text(ctx, "Paste Bearer token from Story TV app to access VIP episodes directly.", 13f, C.TEXT_DIM), lp(top = 2))
            addView(fieldCard(ctx, tokenEdit), lp(top = 10))
        }, lp(top = 8))

        val deviceIdEdit = EditText(ctx).apply {
            hint = "Device ID (default: 72f8b873c1118da2)"
            setHintTextColor(C.TEXT_DIM)
            setTextColor(C.TEXT)
            textSize = 14f
            background = null
            setText(savedJson.optString("deviceId", "72f8b873c1118da2"))
        }
        mainList.addView(card(ctx).apply {
            setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 16), dp(ctx, 14))
            addView(text(ctx, "Device Identifier", 16f, C.TEXT, bold = true))
            addView(text(ctx, "Android device ID used in API headers.", 13f, C.TEXT_DIM), lp(top = 2))
            addView(fieldCard(ctx, deviceIdEdit), lp(top = 10))
        }, lp(top = 12))

        val btnRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(ctx, 16), dp(ctx, 20), dp(ctx, 16), dp(ctx, 20))
            addView(button(ctx, "Save Settings", filled = true, compact = true) {
                val updated = JSONObject()
                    .put("authToken", tokenEdit.text.toString().trim())
                    .put("deviceId", deviceIdEdit.text.toString().trim())
                JsStore.saveSettings("storytv", updated.toString())
                toast(ctx, "NextGen Story settings saved!")
                dialog.dismiss()
            }, LinearLayout.LayoutParams(0, dp(ctx, 48), 1f))
        }
        mainList.addView(btnRow)

        val scroll = ScrollView(ctx).apply { addView(mainList) }
        root.addView(scroll, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))

        dialog.setContentView(root)
        dialog.window?.apply {
            setLayout(MATCH_PARENT, MATCH_PARENT)
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        }
        dialog.show()
    }
}
