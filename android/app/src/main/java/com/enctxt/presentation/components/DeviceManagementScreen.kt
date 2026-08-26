package com.enctxt.presentation.components

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enctxt.core.network.NetworkResult
import com.enctxt.data.model.DeviceRecord
import com.enctxt.data.repository.CryptoRepository
import com.enctxt.data.repository.DeviceRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceManagementScreen(
    deviceRepository: DeviceRepository,
    cryptoRepository: CryptoRepository,
    onBack: () -> Unit,
    onCurrentDeviceRevoked: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var devices by remember { mutableStateOf<List<DeviceRecord>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var deviceToRevoke by remember { mutableStateOf<DeviceRecord?>(null) }
    var isRevoking by remember { mutableStateOf(false) }

    fun loadDevices() {
        scope.launch {
            isLoading = true
            errorMessage = null
            val currentKeyId = if (cryptoRepository.isIdentityInitialized()) {
                try {
                    // Extract keyId from local public key or state
                    null
                } catch (_: Exception) {
                    null
                }
            } else null

            when (val res = deviceRepository.listDevices(currentKeyId)) {
                is NetworkResult.Success -> {
                    devices = res.data
                }
                is NetworkResult.Error -> {
                    errorMessage = res.message.ifEmpty { "Failed to load registered devices" }
                }
                is NetworkResult.Loading -> {}
            }
            isLoading = false
        }
    }

    LaunchedEffect(Unit) {
        loadDevices()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Device Management") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { loadDevices() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (isLoading && devices.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            } else if (errorMessage != null && devices.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFF43F5E), modifier = Modifier.size(48.dp))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(errorMessage ?: "Failed to load devices", color = Color.White, fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = { loadDevices() }) {
                        Text("Retry")
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF0F172A), RoundedCornerShape(12.dp))
                                .padding(14.dp)
                        ) {
                            Text(
                                "Your registered devices can send and receive end-to-end encrypted messages. Revoke any unrecognized or decommissioned devices.",
                                fontSize = 12.sp,
                                color = Color(0xFF94A3B8),
                                lineHeight = 18.sp
                            )
                        }
                    }

                    items(devices, key = { it.id }) { device ->
                        DeviceItemCard(
                            device = device,
                            onRevokeClick = { deviceToRevoke = device }
                        )
                    }
                }
            }
        }
    }

    // Confirmation Dialog: Revoke Device
    deviceToRevoke?.let { device ->
        AlertDialog(
            onDismissRequest = { if (!isRevoking) deviceToRevoke = null },
            title = { Text("Revoke ${device.deviceName}?") },
            text = {
                Text(
                    if (device.isCurrentDevice) {
                        "Warning: You are revoking the current device. This will log you out immediately and invalidate this device's sessions."
                    } else {
                        "This device will no longer be trusted to access your end-to-end encrypted messages."
                    }
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            isRevoking = true
                            when (val res = deviceRepository.revokeDevice(device.id)) {
                                is NetworkResult.Success -> {
                                    Toast.makeText(context, "${device.deviceName} revoked", Toast.LENGTH_SHORT).show()
                                    if (device.isCurrentDevice) {
                                        onCurrentDeviceRevoked()
                                    } else {
                                        loadDevices()
                                    }
                                }
                                is NetworkResult.Error -> {
                                    Toast.makeText(context, res.message, Toast.LENGTH_LONG).show()
                                }
                                is NetworkResult.Loading -> {}
                            }
                            isRevoking = false
                            deviceToRevoke = null
                        }
                    },
                    enabled = !isRevoking,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF43F5E))
                ) {
                    if (isRevoking) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                    } else {
                        Text("Revoke Device", color = Color.White)
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { deviceToRevoke = null },
                    enabled = !isRevoking
                ) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun DeviceItemCard(
    device: DeviceRecord,
    onRevokeClick: () -> Unit
) {
    val isRevoked = device.status == "revoked"
    val icon = when (device.platform.lowercase()) {
        "android" -> Icons.Default.PhoneAndroid
        "ios" -> Icons.Default.PhoneIphone
        "web" -> Icons.Default.Computer
        else -> Icons.Default.Devices
    }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (isRevoked) Color(0xFF0F172A).copy(alpha = 0.5f) else MaterialTheme.colorScheme.surface
        ),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(
                            if (isRevoked) Color(0xFF1E293B) else MaterialTheme.colorScheme.secondary,
                            CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        icon,
                        contentDescription = null,
                        tint = if (isRevoked) Color(0xFF64748B) else Color.White,
                        modifier = Modifier.size(22.dp)
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            device.deviceName,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = if (isRevoked) Color(0xFF94A3B8) else Color.White
                        )
                        if (device.isCurrentDevice) {
                            Spacer(modifier = Modifier.width(6.dp))
                            Box(
                                modifier = Modifier
                                    .background(Color(0xFF064E3B), RoundedCornerShape(4.dp))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text("This Device", fontSize = 10.sp, color = Color(0xFF10B981), fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        "Key ID: ${device.keyId.take(16)}...",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        color = Color(0xFF64748B)
                    )
                }

                if (isRevoked) {
                    Box(
                        modifier = Modifier
                            .background(Color(0xFF1E293B), RoundedCornerShape(4.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text("Revoked", fontSize = 11.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.SemiBold)
                    }
                } else {
                    OutlinedButton(
                        onClick = onRevokeClick,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFF43F5E)),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                        modifier = Modifier.height(32.dp)
                    ) {
                        Text("Revoke", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
