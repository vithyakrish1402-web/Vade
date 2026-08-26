package com.enctxt

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.RevealState
import com.enctxt.presentation.components.GestureCanvas
import com.enctxt.presentation.components.ProtectedMessage
import org.junit.Rule
import org.junit.Test

/**
 * Compose UI tests for the Layer 3 gesture reveal surfaces. These run on-device/emulator
 * (androidTest) rather than the JVM unit test suite, since they exercise real pointer input
 * and Compose semantics trees.
 */
class GestureRevealUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun protectedMessage_defaultsToProtectedRepresentation_neverShowsPlaintext() {
        composeRule.setContent {
            MaterialTheme {
                ProtectedMessage(
                    content = "Meet me at 7 PM",
                    revealState = RevealState.Protected,
                    messageId = "msg_1"
                )
            }
        }

        // The exact protected text is Android-produced via ProtectedTextEngine — assert only
        // the privacy invariant: raw plaintext must not appear anywhere in the semantics tree.
        // ProtectedMessage uses clearAndSetSemantics { contentDescription = ... }, replacing the
        // default Text semantics property entirely, so both channels are checked here.
        composeRule.onAllNodesWithText("Meet me at 7 PM", substring = true).assertCountEquals(0)
        composeRule.onAllNodesWithContentDescription("Meet me at 7 PM", substring = true).assertCountEquals(0)
    }

    @Test
    fun protectedMessage_revealedForMatchingMessageId_showsPlaintext() {
        composeRule.setContent {
            MaterialTheme {
                ProtectedMessage(
                    content = "Meet me at 7 PM",
                    revealState = RevealState.Revealed(messageId = "msg_1", remainingSeconds = 5),
                    messageId = "msg_1"
                )
            }
        }

        // Genuinely revealed content is exposed via contentDescription (see note above), not Text.
        composeRule.onAllNodesWithContentDescription("Meet me at 7 PM", substring = true).assertCountEquals(1)
    }

    @Test
    fun protectedMessage_revealedForDifferentMessageId_staysProtected() {
        composeRule.setContent {
            MaterialTheme {
                ProtectedMessage(
                    content = "Meet me at 7 PM",
                    revealState = RevealState.Revealed(messageId = "some_other_message", remainingSeconds = 5),
                    messageId = "msg_1"
                )
            }
        }

        // Reveal is message-scoped: a different message being revealed must not leak this one.
        composeRule.onAllNodesWithText("Meet me at 7 PM", substring = true).assertCountEquals(0)
        composeRule.onAllNodesWithContentDescription("Meet me at 7 PM", substring = true).assertCountEquals(0)
    }

    @Test
    fun gestureCanvas_tinyTap_neverInvokesOnStrokeComplete() {
        var invoked = false
        composeRule.setContent {
            MaterialTheme {
                GestureCanvas(onStrokeComplete = { invoked = true })
            }
        }

        composeRule.onRoot().performTouchInput {
            down(center)
            up()
        }
        composeRule.waitForIdle()

        assert(!invoked) { "A tap with no meaningful drag must not be treated as a completed gesture." }
    }

    @Test
    fun gestureCanvas_meaningfulDrag_invokesOnStrokeCompleteWithPoints() {
        var captured: List<GesturePoint>? = null
        composeRule.setContent {
            MaterialTheme {
                GestureCanvas(onStrokeComplete = { captured = it })
            }
        }

        composeRule.onRoot().performTouchInput {
            swipeDown(startY = top + 10, endY = bottom - 10)
        }
        composeRule.waitForIdle()

        assert(captured != null && captured!!.isNotEmpty()) {
            "A real drag gesture must produce a non-empty stroke."
        }
    }
}
