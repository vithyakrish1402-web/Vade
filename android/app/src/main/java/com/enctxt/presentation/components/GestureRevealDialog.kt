package com.enctxt.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.RevealState

/**
 * Authentication modal for Layer 3 reveal (Phase 16).
 *
 * Never displays the stored gesture shape — the user must recall their own sequence.
 * Shows only generic failure feedback (never which step or gesture failed) and a step
 * progress indicator (● ○ ○) so the user knows where they are without leaking anything
 * about the enrolled template.
 */
@Composable
fun GestureRevealDialog(
    state: RevealState.Authenticating,
    sequenceLength: Int,
    isConfigured: Boolean,
    feedback: String?,
    onStroke: (List<GesturePoint>) -> Unit,
    onDismiss: () -> Unit,
    onOpenSetup: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .background(Color(0xFF0F172A), RoundedCornerShape(24.dp))
                .padding(24.dp)
        ) {
            if (!isConfigured) {
                NotConfiguredContent(onOpenSetup = onOpenSetup, onDismiss = onDismiss)
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "Authenticate to reveal",
                        color = Color.White,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    Text(
                        "Step ${state.step + 1} of $sequenceLength",
                        color = Color(0xFF94A3B8),
                        fontSize = 12.sp
                    )

                    Spacer(modifier = Modifier.height(12.dp))
                    StepProgressIndicator(total = sequenceLength, currentIndex = state.step)
                    Spacer(modifier = Modifier.height(16.dp))

                    GestureCanvas(onStrokeComplete = onStroke)

                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = feedback ?: "Draw your gesture for step ${state.step + 1}.",
                        color = if (feedback != null) Color(0xFFF43F5E) else Color(0xFF94A3B8),
                        fontSize = 12.sp
                    )

                    Spacer(modifier = Modifier.height(12.dp))
                    TextButton(onClick = onDismiss) {
                        Text("Cancel", color = Color(0xFF94A3B8))
                    }
                }
            }
        }
    }
}

@Composable
fun GestureLockedDialog(
    state: RevealState.Locked,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .background(Color(0xFF0F172A), RoundedCornerShape(24.dp))
                .padding(24.dp)
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .background(Color(0xFFF43F5E).copy(alpha = 0.12f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    androidx.compose.material3.Icon(
                        Icons.Default.Lock,
                        contentDescription = null,
                        tint = Color(0xFFF43F5E)
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Text("Too Many Failed Attempts", color = Color.White, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                val maxLockoutSeconds = 30f
                val lockProgress = (state.remainingSeconds / maxLockoutSeconds).coerceIn(0f, 1f)
                LinearProgressIndicator(
                    progress = { lockProgress },
                    modifier = Modifier
                        .fillMaxWidth(0.7f)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp)),
                    color = Color(0xFFF43F5E),
                    trackColor = Color(0xFF881337)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "Try again in ${state.remainingSeconds}s",
                    color = Color(0xFFF43F5E),
                    fontSize = 12.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Medium
                )
                Spacer(modifier = Modifier.height(16.dp))
                TextButton(onClick = onDismiss) {
                    Text("Close", color = Color(0xFF94A3B8))
                }
            }
        }
    }
}

@Composable
private fun NotConfiguredContent(onOpenSetup: () -> Unit, onDismiss: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("No Reveal Gesture", color = Color.White, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            "You haven't configured a reveal gesture on this device.",
            color = Color(0xFF94A3B8),
            fontSize = 12.sp
        )
        Spacer(modifier = Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = onDismiss) { Text("Cancel", color = Color(0xFF94A3B8)) }
            Button(onClick = onOpenSetup) { Text("Set Up Gesture") }
        }
    }
}

/** ● for completed/current steps, ○ for remaining — communicates progress, never the shape. */
@Composable
fun StepProgressIndicator(total: Int, currentIndex: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for (i in 0 until total) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(
                        if (i <= currentIndex) Color(0xFF10B981) else Color(0xFF334155),
                        CircleShape
                    )
            )
        }
    }
}
