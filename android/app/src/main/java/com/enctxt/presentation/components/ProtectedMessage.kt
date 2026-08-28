package com.enctxt.presentation.components

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import com.enctxt.core.gesture.RevealState
import com.enctxt.core.privacy.ProtectedRenderMode
import com.enctxt.core.privacy.ProtectedTextEngine
import com.enctxt.presentation.theme.VadeType

/**
 * ProtectedMessage — the single text primitive for message content.
 *
 * Renders decrypted content through the deterministic ProtectedTextEngine by default. Plaintext
 * is displayed ONLY when [revealState] is [RevealState.Revealed] for this exact [messageId].
 *
 * There is deliberately no public `revealed: Boolean` parameter: visibility is derived entirely
 * from a [RevealState] value, which only [com.enctxt.core.gesture.GestureRevealManager] can
 * advance to `Revealed` after a full correct gesture sequence. A caller cannot "just pass true"
 * — it would have to fabricate a whole authenticated state object, making accidental or ad-hoc
 * bypasses structurally awkward. All message text in the app MUST render through this
 * composable — never a raw `Text(transientPlaintext)` outside this path.
 *
 * Security contracts:
 * - Default display is always the protected representation.
 * - Rendering failure falls back to a safe error, never to plaintext.
 * - Accessibility semantics mirror the currently visible state exactly (protected text while
 *   protected, real content only when genuinely revealed).
 * - Text is not selectable, so revealed plaintext can never enter the system clipboard.
 * - Memoized on content and mode to avoid redundant transformations.
 *
 * The countdown and the bubble geometry live in
 * [com.enctxt.presentation.components.vade.RevealCountdown] and the bubble composables, so this
 * stays a text primitive with one job.
 */
@Composable
fun ProtectedMessage(
    content: String,
    modifier: Modifier = Modifier,
    messageId: String? = null,
    revealState: RevealState = RevealState.Protected,
    protectionMode: ProtectedRenderMode = ProtectedRenderMode.HOMOGLYPH,
    color: Color = Color.Unspecified,
    warnColor: Color = Color(0xFF9A5B12),
    protectedStyle: TextStyle = VadeType.message,
    revealedStyle: TextStyle = VadeType.plain
) {
    val isRevealed = messageId != null &&
        revealState is RevealState.Revealed &&
        revealState.messageId == messageId

    val protectedText = remember(content, protectionMode) {
        try {
            ProtectedTextEngine.protect(content, protectionMode)
        } catch (_: Exception) {
            null // Fail closed — never fall back to plaintext.
        }
    }

    if (protectedText == null) {
        Text(
            text = "Unable to display protected message",
            color = warnColor,
            style = protectedStyle,
            modifier = modifier.clearAndSetSemantics {
                contentDescription = "Unable to display protected message"
            }
        )
        return
    }

    if (isRevealed) {
        Text(
            text = content,
            color = color,
            style = revealedStyle,
            modifier = modifier.clearAndSetSemantics {
                // Genuinely revealed: accessibility matches the visible plaintext state.
                contentDescription = content
            }
        )
    } else {
        Text(
            text = protectedText,
            color = color,
            style = protectedStyle,
            modifier = modifier.clearAndSetSemantics {
                // Accessibility gets the protected representation, never plaintext.
                contentDescription = protectedText
            }
        )
    }
}
