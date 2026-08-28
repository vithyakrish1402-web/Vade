package com.enctxt.presentation.components.vade

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enctxt.core.gesture.GestureRevealManager
import com.enctxt.core.gesture.RevealState
import com.enctxt.core.privacy.ProtectedRenderMode
import com.enctxt.presentation.components.ProtectedMessage
import com.enctxt.presentation.theme.VadeIconSize
import com.enctxt.presentation.theme.VadeShape
import com.enctxt.presentation.theme.VadeType
import com.enctxt.presentation.theme.vadeColors

/**
 * A message bubble.
 *
 * Geometry is 22dp all round with a 7dp tail corner on the sender's side; no tails, no shadows.
 * A revealed bubble takes a 1.5dp accent outline at 2dp offset and appears at full opacity with
 * no transition — plaintext is never animated, so no motion can extend the exposure window.
 *
 * Plaintext reaches the screen only through [ProtectedMessage], which derives visibility from
 * [revealState] rather than from any flag this composable could pass.
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun MessageBubbleSurface(
    content: String,
    messageId: String,
    isOutgoing: Boolean,
    revealState: RevealState,
    protectionMode: ProtectedRenderMode,
    onReveal: () -> Unit,
    onLongPress: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = vadeColors
    val isRevealed = revealState is RevealState.Revealed && revealState.messageId == messageId
    val shape = if (isOutgoing) VadeShape.bubbleOutgoing else VadeShape.bubbleIncoming

    val container = if (isOutgoing) colors.outBg else colors.surface
    val ink = if (isOutgoing) colors.outFg else colors.text

    Box(
        modifier = modifier
            .fillMaxWidth(0.8f)
            .wrapContentWidth(if (isOutgoing) Alignment.End else Alignment.Start)
            .then(
                if (isRevealed) {
                    Modifier
                        .padding(2.dp)
                        .border(1.5.dp, colors.accent, shape)
                        .padding(2.dp)
                } else {
                    Modifier
                }
            )
            .clip(shape)
            .background(container)
            .then(
                if (isRevealed) {
                    Modifier.combinedClickable(onClick = {}, onLongClick = onLongPress)
                } else {
                    Modifier.combinedClickable(
                        onClickLabel = "Reveal",
                        role = Role.Button,
                        onClick = onReveal,
                        onLongClick = onLongPress
                    )
                }
            )
            .padding(horizontal = 15.dp, vertical = 11.dp)
            .then(
                if (isRevealed) {
                    Modifier
                } else {
                    // Screen readers get the action, never the content. The visible protected
                    // text is a rendering of the message, not the message.
                    Modifier.clearAndSetSemantics {
                        contentDescription = "Protected message, double-tap to reveal"
                    }
                }
            )
    ) {
        ProtectedMessage(
            content = content,
            messageId = messageId,
            revealState = revealState,
            protectionMode = protectionMode,
            color = ink
        )
    }
}

/**
 * The row under a revealed bubble: a 26 × 3dp track, the seconds remaining, and Hide.
 *
 * The countdown renders from the manager's own state, so a stalled or recomposing UI can never
 * extend a window — re-protection is owned by [GestureRevealManager]'s timer.
 */
@Composable
fun RevealCountdown(
    remainingSeconds: Int,
    onHide: () -> Unit,
    modifier: Modifier = Modifier,
    totalSeconds: Int = GestureRevealManager.REVEAL_DURATION_SECONDS
) {
    val colors = vadeColors
    val fraction = if (totalSeconds > 0) {
        (remainingSeconds.toFloat() / totalSeconds).coerceIn(0f, 1f)
    } else {
        0f
    }

    Row(
        modifier = modifier.padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp)
    ) {
        Box(
            modifier = Modifier
                .width(26.dp)
                .height(3.dp)
                .clip(CircleShape)
                .background(colors.line)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .height(3.dp)
                    .clip(CircleShape)
                    .background(colors.accent)
            )
        }
        Text("Revealed · ${remainingSeconds}s", style = VadeType.meta, color = colors.accentInk)
        Text(
            "Hide",
            style = VadeType.meta.copy(textDecoration = TextDecoration.Underline),
            color = colors.muted,
            modifier = Modifier
                .clip(CircleShape)
                .combinedClickableCompat(onHide)
                .padding(horizontal = 4.dp, vertical = 2.dp)
        )
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
private fun Modifier.combinedClickableCompat(onClick: () -> Unit): Modifier =
    this.combinedClickable(onClick = onClick, role = Role.Button)

/**
 * The line under a protected bubble: the time, or — while the connection is down — what
 * happened to the send. Queued and failed are words, not just icons.
 */
@Composable
fun MessageMeta(
    time: String,
    isOutgoing: Boolean,
    status: MessageDeliveryStatus,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = vadeColors

    Row(
        modifier = modifier.padding(horizontal = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        when (status) {
            MessageDeliveryStatus.Failed -> {
                Text("Not delivered", style = VadeType.rowSecondary.copy(fontSize = 11.sp), color = colors.warn)
                Text(
                    "Retry",
                    style = VadeType.meta.copy(fontSize = 11.sp, textDecoration = TextDecoration.Underline),
                    color = colors.warn,
                    modifier = Modifier
                        .clip(CircleShape)
                        .combinedClickableCompat(onRetry)
                        .padding(horizontal = 4.dp, vertical = 2.dp)
                )
            }
            MessageDeliveryStatus.Queued -> {
                Text(
                    "Queued · sends when online",
                    style = VadeType.rowSecondary.copy(fontSize = 11.sp),
                    color = colors.faint
                )
                Icon(
                    Icons.Default.Schedule,
                    contentDescription = null,
                    tint = colors.faint,
                    modifier = Modifier.size(VadeIconSize.small)
                )
            }
            else -> {
                Text(time, style = VadeType.rowSecondary.copy(fontSize = 11.sp), color = colors.faint)
                if (isOutgoing) {
                    when (status) {
                        MessageDeliveryStatus.Read -> Icon(
                            Icons.Default.DoneAll,
                            contentDescription = "Read",
                            tint = colors.accent,
                            modifier = Modifier.size(VadeIconSize.small)
                        )
                        MessageDeliveryStatus.Delivered -> Icon(
                            Icons.Default.DoneAll,
                            contentDescription = "Delivered",
                            tint = colors.faint,
                            modifier = Modifier.size(VadeIconSize.small)
                        )
                        MessageDeliveryStatus.Sending -> Icon(
                            Icons.Default.Schedule,
                            contentDescription = "Sending",
                            tint = colors.faint,
                            modifier = Modifier.size(VadeIconSize.small)
                        )
                        else -> Icon(
                            Icons.Default.Check,
                            contentDescription = "Sent",
                            tint = colors.faint,
                            modifier = Modifier.size(VadeIconSize.small)
                        )
                    }
                }
            }
        }
    }
}

enum class MessageDeliveryStatus { Sending, Queued, Sent, Delivered, Read, Failed }
