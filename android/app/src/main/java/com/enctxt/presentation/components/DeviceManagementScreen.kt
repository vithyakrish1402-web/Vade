package com.enctxt.presentation.components

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.TabletAndroid
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enctxt.core.network.NetworkResult
import com.enctxt.data.model.DeviceRecord
import com.enctxt.data.repository.CryptoRepository
import com.enctxt.data.repository.DeviceRepository
import com.enctxt.presentation.components.vade.*
import com.enctxt.presentation.theme.*
import kotlinx.coroutines.launch

/**
 * Your devices.
 *
 * Rows carry safe metadata only — what the device is and when it was last active. Key ids,
 * gesture data and message content deliberately do not appear here: this screen is often the
 * one shown to someone else while explaining the app.
 */
@Composable
fun DeviceManagementScreen(
    deviceRepository: DeviceRepository,
    cryptoRepository: CryptoRepository,
    onBack: () -> Unit,
    onCurrentDeviceRevoked: () -> Unit = {}
) {
    val colors = vadeColors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var devices by remember { mutableStateOf<List<DeviceRecord>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var deviceToRevoke by remember { mutableStateOf<DeviceRecord?>(null) }
    var revokingId by remember { mutableStateOf<String?>(null) }

    fun loadDevices() {
        scope.launch {
            isLoading = true
            errorMessage = null
            when (val result = deviceRepository.listDevices(null)) {
                is NetworkResult.Success -> devices = result.data
                is NetworkResult.Error ->
                    errorMessage = result.message.ifEmpty { "Could not load your devices." }
                is NetworkResult.Loading -> Unit
            }
            isLoading = false
        }
    }

    LaunchedEffect(Unit) { loadDevices() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
    ) {
        VadeBackHeader(onBack = onBack, title = "Your devices", backLabel = "Back to profile") {
            VadeIconButton(
                icon = Icons.Default.Refresh,
                contentDescription = "Refresh devices",
                onClick = { loadDevices() },
                diameter = 34.dp
            )
        }

        when {
            isLoading && devices.isEmpty() -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = colors.muted, strokeWidth = 2.dp)
            }

            errorMessage != null && devices.isEmpty() -> Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(VadeSpace.screenPadding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    errorMessage!!,
                    style = VadeType.rowSecondary,
                    color = colors.warn,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(VadeShape.card)
                        .background(colors.warnTint)
                        .padding(16.dp)
                )
                VadeButton(
                    text = "Try again",
                    onClick = { loadDevices() },
                    variant = VadeButtonVariant.Outline,
                    size = VadeButtonSize.Small
                )
            }

            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    start = VadeSpace.screenPadding,
                    end = VadeSpace.screenPadding,
                    top = 12.dp,
                    bottom = 40.dp
                ),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                items(devices, key = { it.id }) { device ->
                    DeviceCard(
                        device = device,
                        isRevoking = revokingId == device.id,
                        onRevoke = { deviceToRevoke = device }
                    )
                }

                item {
                    Text(
                        "Vade shows only what a device is and when it was last active. Keys, " +
                            "gestures and message content never appear here.",
                        style = VadeType.bodySmall,
                        color = colors.muted,
                        modifier = Modifier.padding(top = 6.dp, start = 2.dp)
                    )
                }
            }
        }
    }

    deviceToRevoke?.let { device ->
        ConfirmDialog(
            title = "Revoke this device?",
            body = if (device.isCurrentDevice) {
                "This is the device you are using. Revoking it signs you out here and it will " +
                    "lose access to your encrypted messages. This cannot be undone."
            } else {
                "${device.deviceName} will lose access to your account and your encrypted " +
                    "messages. This cannot be undone."
            },
            confirmLabel = "Revoke",
            onConfirm = {
                scope.launch {
                    revokingId = device.id
                    when (val result = deviceRepository.revokeDevice(device.id)) {
                        is NetworkResult.Success -> {
                            if (device.isCurrentDevice) {
                                onCurrentDeviceRevoked()
                            } else {
                                loadDevices()
                            }
                        }
                        is NetworkResult.Error ->
                            Toast.makeText(context, result.message, Toast.LENGTH_LONG).show()
                        is NetworkResult.Loading -> Unit
                    }
                    revokingId = null
                }
            },
            onDismiss = { deviceToRevoke = null }
        )
    }
}

@Composable
private fun DeviceCard(device: DeviceRecord, isRevoking: Boolean, onRevoke: () -> Unit) {
    val colors = vadeColors
    val isRevoked = device.status.equals("revoked", ignoreCase = true)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(VadeShape.card)
            .background(colors.surface)
            .padding(horizontal = 18.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(colors.bg, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = deviceIcon(device.platform),
                contentDescription = null,
                tint = colors.text,
                modifier = Modifier.size(VadeIconSize.action)
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                Text(
                    device.deviceName,
                    style = VadeType.name.copy(fontSize = 15.sp),
                    color = colors.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false)
                )
                if (device.isCurrentDevice) {
                    Text(
                        "This device",
                        style = VadeType.meta.copy(fontSize = 11.sp),
                        color = colors.accentInk,
                        modifier = Modifier
                            .clip(VadeShape.pill)
                            .background(colors.accentTint)
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
            }
            Text(
                text = if (isRevoked) {
                    "Revoked"
                } else {
                    listOfNotNull(
                        device.platform.takeIf { it.isNotBlank() },
                        device.lastSeenAt?.let { "Last active ${relativeTime(it)}" }
                    ).joinToString(" · ")
                },
                style = VadeType.rowSecondary,
                color = colors.muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 1.dp)
            )
        }

        // The device you are using is revocable, but it is a sign-out with extra consequences,
        // so it takes the same confirmation with different copy.
        if (!isRevoked) {
            VadeButton(
                text = "Revoke",
                onClick = onRevoke,
                variant = VadeButtonVariant.Outline,
                size = VadeButtonSize.Small,
                isLoading = isRevoking
            )
        }
    }
}

private fun deviceIcon(platform: String) = when {
    platform.contains("tablet", ignoreCase = true) || platform.contains("ipad", ignoreCase = true) ->
        Icons.Default.TabletAndroid
    platform.contains("android", ignoreCase = true) ||
        platform.contains("ios", ignoreCase = true) ||
        platform.contains("mobile", ignoreCase = true) -> Icons.Default.PhoneAndroid
    else -> Icons.Default.Computer
}

private fun relativeTime(isoTimestamp: String): String = try {
    val instant = java.time.Instant.parse(isoTimestamp)
    val minutes = java.time.Duration.between(instant, java.time.Instant.now()).toMinutes()
    when {
        minutes < 1 -> "just now"
        minutes < 60 -> "$minutes min ago"
        minutes < 60 * 24 -> "${minutes / 60} h ago"
        minutes < 60 * 24 * 2 -> "yesterday"
        else -> java.time.format.DateTimeFormatter.ofPattern("d MMM")
            .format(instant.atZone(java.time.ZoneId.systemDefault()))
    }
} catch (_: Exception) {
    "recently"
}
