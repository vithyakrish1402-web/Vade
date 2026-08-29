package com.enctxt.presentation.components.vade

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enctxt.data.repository.IncomingMessageNotification
import com.enctxt.presentation.theme.VadeShape
import com.enctxt.presentation.theme.VadeType
import com.enctxt.presentation.theme.vadeColors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch

private const val AUTO_DISMISS_MS = 6000L

data class PendingBannerItem(
    val conversationId: String,
    val peerId: String,
    val peerDisplayName: String,
    val createdAt: String,
    val isNewConversation: Boolean,
    val count: Int
)

/**
 * Local, in-memory queue for the heads-up banner — mirrors the web client's
 * `MessageNotificationBar`: repeat messages from the same conversation collapse into one item
 * with a running count, and the whole queue auto-clears a fixed interval after the last arrival.
 */
class NotificationBannerState {
    private val scope = CoroutineScope(Dispatchers.Main.immediate + SupervisorJob())
    private var dismissJob: Job? = null

    var items by mutableStateOf<List<PendingBannerItem>>(emptyList())
        private set

    fun add(notification: IncomingMessageNotification) {
        val existingCount = items.find { it.conversationId == notification.conversationId }?.count ?: 0
        items = items.filterNot { it.conversationId == notification.conversationId } + PendingBannerItem(
            conversationId = notification.conversationId,
            peerId = notification.peerId,
            peerDisplayName = notification.peerDisplayName,
            createdAt = notification.createdAt,
            isNewConversation = notification.isNewConversation,
            count = existingCount + 1
        )
        dismissJob?.cancel()
        dismissJob = scope.launch {
            delay(AUTO_DISMISS_MS)
            items = emptyList()
        }
    }

    fun dismiss(conversationId: String) {
        items = items.filterNot { it.conversationId == conversationId }
        if (items.isEmpty()) dismissJob?.cancel()
    }

    fun dismissAll() {
        dismissJob?.cancel()
        items = emptyList()
    }
}

@Composable
fun rememberNotificationBannerState(notifications: SharedFlow<IncomingMessageNotification>): NotificationBannerState {
    val state = remember { NotificationBannerState() }
    LaunchedEffect(notifications) {
        notifications.collect { state.add(it) }
    }
    return state
}

/** "now", "2m", "1h" — the banner only ever shows something that just happened. */
private fun formatBannerTime(isoTimestamp: String): String = try {
    val instant = java.time.Instant.parse(isoTimestamp)
    val seconds = java.time.Duration.between(instant, java.time.Instant.now()).seconds.coerceAtLeast(0)
    when {
        seconds < 60 -> "now"
        seconds < 3600 -> "${seconds / 60}m"
        else -> "${seconds / 3600}h"
    }
} catch (_: Exception) {
    ""
}

/**
 * Heads-up banner for [IncomingMessageNotification] — fires for a message that isn't in the
 * conversation currently open. Mounted once above the nav host so it appears over the
 * conversation list, search, and profile alike, matching the bug it fixes: a message arriving
 * while the recipient was anywhere else in the app previously produced no visible signal at all.
 *
 * Never renders decrypted content: only the sender's known display name and a generic "Sent an
 * encrypted message" line, mirroring the "Protected conversation" placeholder already used in
 * [ConversationRow].
 */
@Composable
fun MessageNotificationBanner(
    state: NotificationBannerState,
    modifier: Modifier = Modifier,
    onOpen: (conversationId: String, peerId: String, peerName: String) -> Unit
) {
    val colors = vadeColors
    val items = state.items

    AnimatedVisibility(
        visible = items.isNotEmpty(),
        enter = fadeIn(tween(220)) + slideInVertically(tween(220)) { -it / 2 },
        exit = fadeOut(tween(160)) + slideOutVertically(tween(160)) { -it / 2 },
        modifier = modifier.padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        if (items.size > 1) {
            val totalMessages = items.sumOf { it.count }
            val mostRecent = items.maxByOrNull { it.createdAt } ?: items.first()

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(6.dp, VadeShape.card, clip = false)
                    .clip(VadeShape.card)
                    .background(colors.surface)
                    .border(1.dp, colors.line, VadeShape.card)
                    .clickable { onOpen(mostRecent.conversationId, mostRecent.peerId, mostRecent.peerDisplayName) }
                    .padding(14.dp)
                    .semantics { liveRegion = LiveRegionMode.Polite },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier.size(38.dp).background(colors.surface2, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "+${if (totalMessages > 99) "99+" else totalMessages.toString()}",
                        style = VadeType.name.copy(fontSize = 13.sp),
                        color = colors.text
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "$totalMessages new message${if (totalMessages == 1) "" else "s"}",
                        style = VadeType.name,
                        color = colors.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        "From ${items.size} people · tap to view",
                        style = VadeType.rowSecondary,
                        color = colors.muted
                    )
                }
                Text(formatBannerTime(mostRecent.createdAt), style = VadeType.rowSecondary.copy(fontSize = 11.sp), color = colors.faint)
                VadeIconButton(
                    icon = Icons.Default.Close,
                    contentDescription = "Dismiss notifications",
                    onClick = { state.dismissAll() },
                    diameter = 26.dp,
                    tint = colors.faint
                )
            }
        } else {
            val item = items.first()

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(6.dp, VadeShape.card, clip = false)
                    .clip(VadeShape.card)
                    .background(colors.surface)
                    .border(1.dp, colors.line, VadeShape.card)
                    .clickable { onOpen(item.conversationId, item.peerId, item.peerDisplayName) }
                    .padding(14.dp)
                    .semantics { liveRegion = LiveRegionMode.Polite },
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(contentAlignment = Alignment.TopEnd) {
                    VadeAvatar(item.peerDisplayName, size = 38.dp)
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(colors.accent, CircleShape)
                            .border(2.dp, colors.surface, CircleShape)
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            item.peerDisplayName,
                            style = VadeType.name,
                            color = colors.text,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        if (item.isNewConversation) {
                            Box(
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .background(colors.accentTint)
                                    .padding(horizontal = 7.dp, vertical = 2.dp)
                            ) {
                                Text("NEW", style = VadeType.meta.copy(fontSize = 10.sp), color = colors.accentInk)
                            }
                        }
                    }
                    Row(
                        modifier = Modifier.padding(top = 1.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Icon(Icons.Default.Lock, contentDescription = null, tint = colors.faint, modifier = Modifier.size(11.dp))
                        Text(
                            if (item.isNewConversation) "Started a conversation" else "Sent an encrypted message",
                            style = VadeType.rowSecondary,
                            color = colors.muted
                        )
                    }
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(formatBannerTime(item.createdAt), style = VadeType.rowSecondary.copy(fontSize = 11.sp), color = colors.faint)
                    VadeIconButton(
                        icon = Icons.Default.Close,
                        contentDescription = "Dismiss notification",
                        onClick = { state.dismiss(item.conversationId) },
                        diameter = 26.dp,
                        tint = colors.faint
                    )
                }
            }
        }
    }
}
