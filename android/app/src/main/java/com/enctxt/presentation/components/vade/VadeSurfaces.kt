package com.enctxt.presentation.components.vade

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.enctxt.presentation.theme.VadeIconSize
import com.enctxt.presentation.theme.VadeShape
import com.enctxt.presentation.theme.VadeSpace
import com.enctxt.presentation.theme.VadeType
import com.enctxt.presentation.theme.vadeColors

/**
 * A row in the conversation list.
 *
 * The secondary line always reads "Protected conversation" — the list never decrypts a message
 * to build a preview, so there is nothing here for a shoulder to read.
 */
@Composable
fun ConversationRow(
    name: String,
    time: String,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    unreadCount: Int = 0,
    isVerified: Boolean = false,
    isFlagged: Boolean = false
) {
    val colors = vadeColors
    val status = if (isFlagged) "Key changed" else if (isVerified) "Verified" else "Unverified"
    val unread = if (unreadCount > 0) ", $unreadCount unread" else ""

    Column {
        Row(
            modifier = modifier
                .fillMaxWidth()
                .clickable(onClick = onOpen, role = Role.Button)
                .heightIn(min = 70.dp)
                .padding(horizontal = VadeSpace.screenPadding, vertical = VadeSpace.row)
                .semantics {
                    contentDescription = "$name, $status, protected conversation, $time$unread"
                },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(VadeSpace.row)
        ) {
            VadeAvatar(name)

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        name,
                        style = VadeType.name,
                        color = colors.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (isFlagged) {
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = null,
                            tint = colors.warn,
                            modifier = Modifier.size(VadeIconSize.inline)
                        )
                    } else if (isVerified) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = colors.accent,
                            modifier = Modifier.size(VadeIconSize.inline)
                        )
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        Icons.Default.Lock,
                        contentDescription = null,
                        tint = colors.muted,
                        modifier = Modifier.size(VadeIconSize.small)
                    )
                    Text("Protected conversation", style = VadeType.rowSecondary, color = colors.muted)
                }
            }

            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(time, style = VadeType.rowSecondary.copy(fontSize = 12.sp), color = colors.faint)
                if (unreadCount > 0) {
                    Box(
                        modifier = Modifier
                            .heightIn(min = 20.dp)
                            .widthIn(min = 20.dp)
                            .background(colors.accent, CircleShape)
                            .padding(horizontal = 6.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            if (unreadCount > 99) "99+" else unreadCount.toString(),
                            style = VadeType.meta,
                            color = Color.White
                        )
                    }
                }
            }
        }
        HorizontalDivider(color = colors.line, thickness = 1.dp)
    }
}

/**
 * Sits under the chat header when the peer's key no longer matches the one that was verified.
 *
 * A live region, so it is announced once when it appears. It has exactly one action and does
 * not dismiss itself — the warning persists until the safety number is compared again.
 */
@Composable
fun KeyChangedBanner(onReview: () -> Unit, modifier: Modifier = Modifier) {
    val colors = vadeColors

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(VadeShape.banner)
            .background(colors.warnTint)
            .border(1.dp, colors.warn, VadeShape.banner)
            .padding(horizontal = 15.dp, vertical = 13.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(11.dp)
    ) {
        Icon(
            Icons.Default.Warning,
            contentDescription = null,
            tint = colors.warn,
            modifier = Modifier
                .padding(top = 1.dp)
                .size(18.dp)
        )
        Column {
            Text("Safety number changed", style = VadeType.name.copy(fontSize = 14.sp), color = colors.text)
            Text(
                "Verify again before you reveal anything in this conversation.",
                style = VadeType.bodySmall,
                color = colors.muted,
                modifier = Modifier.padding(top = 2.dp)
            )
            Box(
                modifier = Modifier
                    .padding(top = 9.dp)
                    .height(32.dp)
                    .clip(CircleShape)
                    .background(colors.warn)
                    .clickable(onClick = onReview, role = Role.Button)
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("Review safety number", style = VadeType.meta.copy(fontSize = 13.sp), color = colors.bg)
            }
        }
    }
}

/** The compact header used by pushed screens: back chevron, title, optional trailing content. */
@Composable
fun VadeBackHeader(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    backLabel: String = "Back",
    trailing: @Composable RowScope.() -> Unit = {}
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 4.dp, end = 16.dp, top = 6.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        VadeIconButton(
            icon = Icons.Default.ChevronLeft,
            contentDescription = backLabel,
            onClick = onBack,
            diameter = 34.dp
        )
        if (title != null) {
            Text(title, style = VadeType.name, color = vadeColors.text, modifier = Modifier.weight(1f))
        } else {
            Spacer(Modifier.weight(1f))
        }
        trailing()
    }
}

@Composable
fun EmptyState(
    icon: ImageVector,
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    action: @Composable (() -> Unit)? = null
) {
    val colors = vadeColors

    Column(
        modifier = modifier.padding(horizontal = 44.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .background(colors.surface, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = colors.faint, modifier = Modifier.size(26.dp))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, style = VadeType.name.copy(fontSize = 17.sp), color = colors.text)
            Text(
                body,
                style = VadeType.body,
                color = colors.muted,
                modifier = Modifier.padding(top = 6.dp)
            )
        }
        action?.invoke()
    }
}

/**
 * Required for verify, unverify, revoke and delete — every security-sensitive action takes an
 * explicit confirmation before it runs.
 */
@Composable
fun ConfirmDialog(
    title: String,
    body: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    val colors = vadeColors

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(VadeShape.dialog)
                .background(colors.bg)
                .padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(title, style = VadeType.sheetTitle.copy(fontSize = 18.sp), color = colors.text)
            Text(body, style = VadeType.bodySmall.copy(fontSize = 13.5.sp), color = colors.muted)
            Row(
                modifier = Modifier.padding(top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                VadeButton(
                    text = "Cancel",
                    onClick = onDismiss,
                    variant = VadeButtonVariant.Outline,
                    size = VadeButtonSize.Small,
                    modifier = Modifier.weight(1f)
                )
                VadeButton(
                    text = confirmLabel,
                    onClick = {
                        onConfirm()
                        onDismiss()
                    },
                    size = VadeButtonSize.Small,
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

/**
 * The bottom sheet: full width, 30dp top corners, grab handle, dismissed by backdrop tap.
 * Used by the protection style picker and the message action list.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VadeActionSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    kicker: String? = null,
    description: String? = null,
    footnote: String? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val colors = vadeColors

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = colors.bg,
        contentColor = colors.text,
        scrimColor = colors.scrim,
        shape = VadeShape.sheet,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(top = 22.dp, bottom = 18.dp)
                    .width(38.dp)
                    .height(4.dp)
                    .background(colors.line, CircleShape)
            )
        }
    ) {
        Column(
            modifier = modifier.padding(horizontal = 22.dp).padding(bottom = 30.dp)
        ) {
            if (kicker != null) {
                Text(
                    kicker,
                    style = VadeType.bodySmall,
                    color = colors.faint,
                    modifier = Modifier.padding(bottom = 12.dp)
                )
            }
            if (title != null) {
                Text(title, style = VadeType.sheetTitle, color = colors.text)
                Spacer(Modifier.height(4.dp))
            }
            if (description != null) {
                Text(
                    description,
                    style = VadeType.rowSecondary,
                    color = colors.muted,
                    modifier = Modifier.padding(bottom = 18.dp)
                )
            }

            content()

            if (footnote != null) {
                Row(
                    modifier = Modifier.padding(top = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        Icons.Default.Lock,
                        contentDescription = null,
                        tint = colors.faint,
                        modifier = Modifier.size(VadeIconSize.small)
                    )
                    Text(footnote, style = VadeType.bodySmall, color = colors.faint)
                }
            }
        }
    }
}

@Composable
fun ActionSheetRow(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    note: String? = null,
    isDestructive: Boolean = false
) {
    val colors = vadeColors
    val tint = if (isDestructive) colors.warn else colors.text

    Column {
        Row(
            modifier = modifier
                .fillMaxWidth()
                .clickable(onClick = onClick, role = Role.Button)
                .heightIn(min = VadeSpace.touchTarget)
                .padding(horizontal = 4.dp, vertical = 15.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(VadeIconSize.action))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(label, style = VadeType.name, color = tint)
                if (note != null) {
                    Text(note, style = VadeType.bodySmall, color = colors.muted)
                }
            }
        }
        HorizontalDivider(color = colors.line, thickness = 1.dp)
    }
}
