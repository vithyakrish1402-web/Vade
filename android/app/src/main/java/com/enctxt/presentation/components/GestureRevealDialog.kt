package com.enctxt.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.RevealState
import com.enctxt.presentation.components.vade.GesturePad
import com.enctxt.presentation.components.vade.GesturePadSkin
import com.enctxt.presentation.components.vade.GesturePips
import com.enctxt.presentation.components.vade.VadeButton
import com.enctxt.presentation.theme.VadeShape
import com.enctxt.presentation.theme.VadeType

/** The overlay is drawn on its own dark ground, so these are fixed rather than themed. */
private val OVERLAY_SCRIM = Color(0xA808090A)
private val OVERLAY_INK = Color(0xFFFFFFFF)
private val OVERLAY_MUTED = Color(0x9EFFFFFF)
private val OVERLAY_WARN = Color(0xFFF0B48A)

/**
 * The reveal overlay: a full-bleed scrim over the thread rather than a card modal, so nothing
 * of the conversation is legible behind it while a gesture is being drawn.
 *
 * Feedback says only that the gesture did not match — never how close it was, which stroke
 * diverged, or how many attempts remain. That text comes from GestureRevealManager, which is
 * where the failure is actually known.
 */
@Composable
fun GestureRevealDialog(
    state: RevealState.Authenticating,
    requiredStrokes: Int,
    isConfigured: Boolean,
    feedback: String?,
    onStroke: (List<GesturePoint>) -> Unit,
    onDismiss: () -> Unit,
    onOpenSetup: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(OVERLAY_SCRIM)
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            if (!isConfigured) {
                Text(
                    "No reveal gesture yet",
                    style = VadeType.name.copy(fontSize = 17.sp),
                    color = OVERLAY_INK,
                    textAlign = TextAlign.Center
                )
                Text(
                    "Set a gesture on this device before you can read protected messages.",
                    style = VadeType.rowSecondary,
                    color = OVERLAY_MUTED,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .widthIn(max = 300.dp)
                        .padding(top = 8.dp, bottom = 20.dp)
                )
                VadeButton(text = "Set up gesture", onClick = onOpenSetup)
            } else {
                Text(
                    "Draw to reveal",
                    style = VadeType.name.copy(fontSize = 17.sp),
                    color = OVERLAY_INK
                )
                Text(
                    "Stroke ${(state.step + 1).coerceAtMost(requiredStrokes)} of $requiredStrokes",
                    style = VadeType.rowSecondary,
                    color = OVERLAY_MUTED,
                    modifier = Modifier.padding(top = 3.dp, bottom = 20.dp)
                )

                GesturePips(
                    total = requiredStrokes,
                    completed = state.step,
                    skin = GesturePadSkin.Overlay
                )

                Spacer(Modifier.height(20.dp))

                GesturePad(
                    onStroke = onStroke,
                    hasError = feedback != null,
                    skin = GesturePadSkin.Overlay,
                    size = 272.dp,
                    contentDescriptionText = "Draw your reveal gesture in one continuous stroke."
                )

                Box(
                    modifier = Modifier
                        .heightIn(min = 20.dp)
                        .padding(top = 16.dp)
                ) {
                    if (feedback != null) {
                        Text(
                            feedback,
                            style = VadeType.bodySmall,
                            color = OVERLAY_WARN,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }

            Text(
                "Cancel",
                style = VadeType.rowSecondary,
                color = OVERLAY_MUTED,
                modifier = Modifier
                    .padding(top = 20.dp)
                    .clip(VadeShape.pill)
                    .clickable(onClick = onDismiss, role = Role.Button)
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            )
        }
    }
}

/**
 * Shown after five consecutive failures. Says how long the pause lasts and nothing else —
 * dismissing it hides the message, not the countdown, which keeps running in the manager.
 */
@Composable
fun GestureLockedDialog(state: RevealState.Locked, onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(OVERLAY_SCRIM)
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                "Try again shortly",
                style = VadeType.name.copy(fontSize = 17.sp),
                color = OVERLAY_INK
            )
            Text(
                "Reveal is paused for ${state.remainingSeconds}s.",
                style = VadeType.rowSecondary,
                color = OVERLAY_MUTED,
                modifier = Modifier.padding(top = 8.dp)
            )
            Text(
                "Close",
                style = VadeType.rowSecondary,
                color = OVERLAY_MUTED,
                modifier = Modifier
                    .padding(top = 20.dp)
                    .clip(VadeShape.pill)
                    .clickable(onClick = onDismiss, role = Role.Button)
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            )
        }
    }
}
