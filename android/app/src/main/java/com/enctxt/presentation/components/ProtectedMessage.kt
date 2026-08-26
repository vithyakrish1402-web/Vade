package com.enctxt.presentation.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enctxt.core.gesture.RevealState
import com.enctxt.core.privacy.ProtectedTextEngine

/**
 * ProtectedMessage — Compose component for Layer 2 Visual Privacy, extended in Phase 16 with
 * Layer 3 gesture-authorized temporary reveal.
 *
 * Renders decrypted message content through the deterministic ProtectedTextEngine homoglyph
 * transformation by default. Plaintext is displayed ONLY when [revealState] is
 * [RevealState.Revealed] for this exact [messageId].
 *
 * There is deliberately no public `revealed: Boolean` parameter here: visibility is derived
 * entirely from a [RevealState] value, which only [com.enctxt.core.gesture.GestureRevealManager]
 * can advance to `Revealed` after a full correct gesture sequence. A caller cannot "just pass
 * true" — it would have to fabricate a whole authenticated state object, making accidental or
 * ad-hoc bypasses structurally awkward. All message text in the app MUST render through this
 * composable (or GestureCanvas/dialog-internal previews of the user's own live stroke) — never
 * a raw `Text(transientPlaintext)` outside this path.
 *
 * Security Contracts:
 * - Default display is always the protected representation
 * - Rendering failure falls back to a safe error, never to plaintext
 * - Accessibility semantics mirror the currently visible state exactly (protected text when
 *   protected, real content when genuinely revealed) — never plaintext while protected
 * - Text is not selectable, so revealed plaintext can never enter the system clipboard
 * - Memoized via `remember(content)` to avoid redundant transformations
 */
@Composable
fun ProtectedMessage(
    content: String,
    modifier: Modifier = Modifier,
    messageId: String? = null,
    revealState: RevealState = RevealState.Protected,
    color: Color = Color.White,
    fontSize: TextUnit = 14.sp
) {
    val isRevealed = messageId != null &&
        revealState is RevealState.Revealed &&
        revealState.messageId == messageId

    // Memoize: recompute protection only when content changes, not on every recomposition
    val protectedText = remember(content) {
        try {
            ProtectedTextEngine.protect(content)
        } catch (_: Exception) {
            null // Fail closed — never fall back to plaintext
        }
    }

    if (protectedText == null) {
        // Fail-closed: rendering error — display safe generic message
        Text(
            text = "⚠️ Unable to display protected message",
            color = Color(0xFFF43F5E),
            fontSize = 13.sp,
            fontStyle = FontStyle.Italic,
            modifier = modifier.clearAndSetSemantics {
                contentDescription = "Unable to display protected message"
            }
        )
        return
    }

    if (isRevealed) {
        val remainingSeconds = (revealState as RevealState.Revealed).remainingSeconds
        val totalDuration = 8f
        val progress = (remainingSeconds / totalDuration).coerceIn(0f, 1f)

        Column(modifier = modifier) {
            Text(
                text = content,
                color = color,
                fontSize = fontSize,
                modifier = Modifier.clearAndSetSemantics {
                    // Genuinely revealed: accessibility matches the visible plaintext state.
                    contentDescription = content
                }
            )
            Spacer(modifier = Modifier.height(4.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier
                        .width(48.dp)
                        .height(3.dp)
                        .clip(RoundedCornerShape(2.dp)),
                    color = Color(0xFF10B981),
                    trackColor = Color(0xFF064E3B)
                )
                Text(
                    text = "👁 Revealed · ${remainingSeconds}s",
                    color = Color(0xFF10B981),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    } else {
        Text(
            text = protectedText,
            color = color,
            fontSize = fontSize,
            modifier = modifier.clearAndSetSemantics {
                // Accessibility gets the protected representation, never plaintext
                contentDescription = protectedText
            }
        )
    }
}
