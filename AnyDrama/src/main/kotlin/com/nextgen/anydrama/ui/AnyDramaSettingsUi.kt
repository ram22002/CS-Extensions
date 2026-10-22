package com.nextgen.anydrama.ui

import android.app.Dialog
import android.content.Context
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView

object AnyDramaSettingsUi {
    fun show(ctx: Context) {
        AnyDramaStore.init(ctx)
        val dialog = Dialog(ctx, android.R.style.Theme_Material_NoActionBar)

        val root = FrameLayout(ctx).apply {
            setBackgroundColor(C.BG)
            fitsSystemWindows = true
        }

        val scroll = ScrollView(ctx).apply {
            isFillViewport = true
        }

        val mainList = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(ctx, 16), dp(ctx, 24), dp(ctx, 16), dp(ctx, 48))
        }

        // Header with Back Button and Title
        val header = LinearLayout(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(ctx, 8), dp(ctx, 16), dp(ctx, 8), dp(ctx, 16))
            addView(BackButton(ctx) { dialog.dismiss() }, LinearLayout.LayoutParams(dp(ctx, 44), dp(ctx, 44)))
            addView(LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                addView(text(ctx, "AnyDrama Platforms", 24f, C.TEXT, bold = true))
                addView(text(ctx, "Toggle short drama sources on/off", 13.5f, C.TEXT_DIM), lp(top = 2))
            }, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { leftMargin = dp(ctx, 14) })
        }
        mainList.addView(header)

        // Informational Description Card
        val infoCard = card(ctx).apply {
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(C.CARD_HIGH)
                cornerRadius = dp(ctx, 16).toFloat()
            }
            setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 16), dp(ctx, 14))
            addView(LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(text(ctx, "💡", 16f, C.TEXT))
                addView(text(ctx, "Watch All Platforms in AnyDrama", 15f, C.TEXT, bold = true).apply {
                    setPadding(dp(ctx, 8), 0, 0, 0)
                })
            })
            addView(
                text(
                    ctx,
                    "You can watch all provider dramas directly in the master AnyDrama extension without enabling individual providers. If you want a specific platform (e.g. DramaBox, ReelShort) to appear as its own separate provider in your CloudStream provider list, you can enable it below.\n\n(Default: All individual providers disabled for a clean list)",
                    12.5f,
                    C.TEXT_DIM
                ),
                lp(top = 6)
            )
        }
        mainList.addView(infoCard, lp(top = 4))

        // Bulk action buttons: Enable All & Disable All
        val bulkRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(ctx, 8), dp(ctx, 8), dp(ctx, 8), dp(ctx, 14))
        }

        val toggles = mutableListOf<Pair<String, ToggleView>>()

        val btnEnableAll = button(ctx, "Enable All", filled = true) {
            AnyDramaStore.setAll(true)
            for ((_, t) in toggles) {
                t.setChecked(true, true)
            }
            toast(ctx, "All platforms enabled. Reload repo to update provider list.")
        }
        val btnDisableAll = button(ctx, "Disable All", filled = false) {
            AnyDramaStore.setAll(false)
            for ((_, t) in toggles) {
                t.setChecked(false, true)
            }
            toast(ctx, "All platforms disabled. Reload repo to update provider list.")
        }

        bulkRow.addView(btnEnableAll, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { rightMargin = dp(ctx, 8) })
        bulkRow.addView(btnDisableAll, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { leftMargin = dp(ctx, 8) })
        mainList.addView(bulkRow)

        mainList.addView(sectionLabel(ctx, "Short Drama Providers"))

        // Add cards for each platform
        for (item in AnyDramaStore.PLATFORMS) {
            val toggle = ToggleView(ctx).apply {
                setChecked(AnyDramaStore.isEnabled(item.slug), false)
            }
            toggle.onChange = { isOn ->
                AnyDramaStore.setEnabled(item.slug, isOn)
                toast(ctx, "${item.name} ${if (isOn) "Enabled" else "Disabled"}")
            }
            toggles.add(item.slug to toggle)

            val cardView = toggleCard(
                ctx,
                item.name,
                item.count,
                toggle
            )
            mainList.addView(cardView, lp(top = 8))
        }

        scroll.addView(mainList)
        root.addView(scroll, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))

        dialog.setContentView(root)
        dialog.show()
    }
}
