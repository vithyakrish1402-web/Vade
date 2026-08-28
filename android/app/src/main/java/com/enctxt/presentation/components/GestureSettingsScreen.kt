package com.enctxt.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.enctxt.core.gesture.GestureRepository
import com.enctxt.core.gesture.GestureRevealManager
import com.enctxt.presentation.components.vade.*
import com.enctxt.presentation.theme.*

/**
 * Gesture reveal settings.
 *
 * Re-enrolling runs the same four-step flow as sign-up rather than a shortened "change gesture"
 * path — the confirmation step is what makes an enrolled shape reproducible, and it should not
 * be skippable just because one already exists.
 */
@Composable
fun GestureSettingsScreen(
    repository: GestureRepository,
    userId: String,
    onBack: () -> Unit,
    onChangeGesture: () -> Unit
) {
    val colors = vadeColors
    var showDeleteConfirm by remember { mutableStateOf(false) }

    // Re-read storage on every foreground resume (e.g. returning from the enrollment screen
    // after "Change gesture"), since the underlying encrypted prefs may have changed elsewhere.
    var refreshGeneration by remember { mutableIntStateOf(0) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) refreshGeneration++
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val isConfigured = remember(refreshGeneration, userId) { repository.isConfigured(userId) }
    val isStorageAvailable = remember(refreshGeneration) { repository.isStorageAvailable() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
    ) {
        VadeBackHeader(onBack = onBack, title = "Gesture reveal", backLabel = "Back to profile")

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = VadeSpace.screenPadding)
                .padding(bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(VadeSpace.section)
        ) {
            SettingsGroup {
                SettingsRow(label = "Status", value = if (isConfigured) "Set up" else "Not set up")
                SettingsRow(
                    label = "Strokes to reveal",
                    value = GestureRevealManager.REVEAL_STROKE_COUNT.toString()
                )
                SettingsRow(
                    label = "Reveal window",
                    value = "${GestureRevealManager.REVEAL_DURATION_SECONDS} seconds",
                    showDivider = false
                )
            }

            Text(
                "Your gesture is stored on this device only and is never sent to the server. It " +
                    "is kept as a normalised template, not as the strokes you drew.",
                style = VadeType.bodySmall,
                color = colors.muted,
                modifier = Modifier.padding(start = 2.dp)
            )

            if (!isStorageAvailable) {
                Text(
                    "Secure storage is unavailable on this device, so a gesture cannot be saved.",
                    style = VadeType.rowSecondary,
                    color = colors.warn,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 0.dp)
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                VadeButton(
                    text = if (isConfigured) "Change gesture" else "Set up gesture",
                    onClick = onChangeGesture,
                    enabled = isStorageAvailable,
                    size = VadeButtonSize.Medium,
                    modifier = Modifier.fillMaxWidth()
                )

                if (isConfigured) {
                    VadeButton(
                        text = "Delete gesture",
                        onClick = { showDeleteConfirm = true },
                        variant = VadeButtonVariant.Outline,
                        size = VadeButtonSize.Medium,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    }

    if (showDeleteConfirm) {
        ConfirmDialog(
            title = "Delete your gesture?",
            body = "Without a gesture you will not be able to reveal protected messages on this " +
                "device until you set a new one.",
            confirmLabel = "Delete",
            onConfirm = {
                repository.deleteSequence(userId)
                refreshGeneration++
            },
            onDismiss = { showDeleteConfirm = false }
        )
    }
}
