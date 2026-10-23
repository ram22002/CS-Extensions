package com.nextgen.reelfren.ui

import android.app.Dialog
import android.content.Context
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView

object ReelFrenSettingsUi {
    fun show(ctx: Context) {
        ReelFrenStore.init(ctx)
        val dialog = Dialog(ctx, android.R.style.Theme_Material_NoActionBar)

        dialog.window?.apply {
            setLayout(MATCH_PARENT, MATCH_PARENT)
            setBackgroundDrawable(ColorDrawable(C.BG))
        }

        val root = FrameLayout(ctx).apply {
            setBackgroundColor(C.BG)
            fitsSystemWindows = true
        }

        val scroll = ScrollView(ctx).apply {
            isFillViewport = true
        }

        val mainList = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(ctx, 16), dp(ctx, 20), dp(ctx, 16), dp(ctx, 40))
        }

        // Header with Back Button and Title
        val header = LinearLayout(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(ctx, 4), dp(ctx, 12), dp(ctx, 4), dp(ctx, 16))
            addView(BackButton(ctx) { dialog.dismiss() }, LinearLayout.LayoutParams(dp(ctx, 42), dp(ctx, 42)))
            addView(LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                addView(text(ctx, "ReelFren Platforms", 22f, C.TEXT, bold = true))
                addView(text(ctx, "Toggle short drama sources on/off", 13f, C.TEXT_DIM).apply {
                    setPadding(0, dp(ctx, 3), 0, 0)
                })
            }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { leftMargin = dp(ctx, 14) })
        }
        mainList.addView(header)

        // Informational Description Card (Explicitly VERTICAL layout)
        val infoCard = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply {
                setColor(C.CARD_HIGH)
                cornerRadius = dp(ctx, 14).toFloat()
                setStroke(dp(ctx, 1), C.OUTLINE)
            }
            setPadding(dp(ctx, 16), dp(ctx, 16), dp(ctx, 16), dp(ctx, 16))

            // Header row with icon + title
            addView(LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(text(ctx, "💡", 18f, C.TEXT))
                addView(text(ctx, "Watch All Platforms in ReelFren", 15.5f, C.TEXT, bold = true).apply {
                    setPadding(dp(ctx, 10), 0, 0, 0)
                })
            }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))

            // Detailed description text (Clearly visible, full width, stacked vertically)
            addView(
                text(
                    ctx,
                    "You can watch all provider dramas directly in the master ReelFren extension without enabling individual providers. If you want a specific platform (e.g. DramaBox, ReelShort) to appear as its own separate provider in your CloudStream provider list, you can enable it below.\n\n(Default: All individual providers disabled for a clean list)",
                    13f,
                    C.TEXT_DIM
                ).apply {
                    setLineSpacing(dp(ctx, 3).toFloat(), 1.15f)
                },
                LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
                    topMargin = dp(ctx, 10)
                }
            )
        }
        mainList.addView(infoCard, lp(ctx, topDp = 4, bottomDp = 10))

        // Bulk action buttons: Enable All & Disable All
        val bulkRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(ctx, 6), 0, dp(ctx, 10))
        }

        val toggles = mutableListOf<Pair<String, ToggleView>>()

        val btnEnableAll = button(ctx, "Enable All", filled = true) {
            ReelFrenStore.setAll(true)
            for ((_, t) in toggles) {
                t.setChecked(true, true)
            }
            toast(ctx, "All platforms enabled. Reload repo to update provider list.")
        }
        val btnDisableAll = button(ctx, "Disable All", filled = false) {
            ReelFrenStore.setAll(false)
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
        for (item in ReelFrenStore.PLATFORMS) {
            val toggle = ToggleView(ctx).apply {
                setChecked(ReelFrenStore.isEnabled(item.slug), false)
            }
            toggle.onChange = { isOn ->
                ReelFrenStore.setEnabled(item.slug, isOn)
                toast(ctx, "${item.name} ${if (isOn) "Enabled" else "Disabled"}")
            }
            toggles.add(item.slug to toggle)

            val cardView = toggleCard(
                ctx,
                item.name,
                item.count,
                toggle
            )
            mainList.addView(cardView, lp(ctx, topDp = 8))
        }

        scroll.addView(mainList)
        root.addView(scroll, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))

        dialog.setContentView(root)
        dialog.show()
    }
}
