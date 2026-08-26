package com.enctxt.presentation.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.enctxt.core.security.ContactSecurityState
import com.enctxt.core.security.FingerprintEngine
import com.enctxt.core.security.SafetyNumberEngine
import com.enctxt.data.repository.ContactSecurityRepository
import com.enctxt.data.repository.CryptoRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactSecurityScreen(
    peerId: String,
    peerName: String,
    currentUserId: String,
    contactSecurityRepository: ContactSecurityRepository,
    cryptoRepository: CryptoRepository,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    var securityState by remember { mutableStateOf<ContactSecurityState>(ContactSecurityState.Unverified) }
    var currentKeyId by remember { mutableStateOf<String?>(null) }
    var peerPublicKeyBase64 by remember { mutableStateOf<String?>(null) }
    var peerFingerprint by remember { mutableStateOf<String?>(null) }
    var safetyNumber by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    var showVerifyDialog by remember { mutableStateOf(false) }
    var showRemoveDialog by remember { mutableStateOf(false) }

    fun refresh() {
        scope.launch {
            isLoading = true
            errorMessage = null

            when (val keyResult = cryptoRepository.getPeerPublicKey(peerId)) {
                is NetworkResult.Success -> {
                    val keyId = keyResult.data.first
                    val pubKey = keyResult.data.second
                    val localPubBase64 = cryptoRepository.getLocalPublicKeyBase64()

                    // Convert peer key bytes to Base64 SPKI
                    val peerPubBase64 = java.util.Base64.getEncoder().encodeToString(pubKey.encoded)
                    peerPublicKeyBase64 = peerPubBase64
                    currentKeyId = keyId

                    val fp = try {
                        FingerprintEngine.calculateFingerprint(peerPubBase64)
                    } catch (_: Exception) {
                        null
                    }
                    peerFingerprint = fp

                    val sn = if (localPubBase64.isNotBlank() && peerPubBase64.isNotBlank()) {
                        try {
                            SafetyNumberEngine.calculateSafetyNumber(localPubBase64, peerPubBase64)
                        } catch (_: Exception) {
                            null
                        }
                    } else null
                    safetyNumber = sn

                    val stored = contactSecurityRepository.getStoredVerification(peerId)
                    if (fp != null) {
                        securityState = contactSecurityRepository.evaluateSecurityState(
                            storedVerification = stored,
                            currentKeyId = keyId,
                            currentFingerprint = fp
                        )
                    } else {
                        securityState = ContactSecurityState.NoKey
                    }
                }
                is NetworkResult.Error -> {
                    errorMessage = keyResult.message.ifEmpty { "Unable to load peer cryptographic identity" }
                    securityState = ContactSecurityState.NoKey
                }
                is NetworkResult.Loading -> {}
            }
            isLoading = false
        }
    }

    LaunchedEffect(peerId) {
        refresh()
    }

    fun copyToClipboard(label: String, text: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(context, "$label copied to clipboard", Toast.LENGTH_SHORT).show()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Contact Security") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scrollState)
                .padding(16.dp)
        ) {
            // Peer Header
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(MaterialTheme.colorScheme.secondary, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        peerName.take(1).uppercase(),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(peerName, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color.White)
                    currentKeyId?.let { kId ->
                        Text("Key ID: $kId", fontSize = 11.sp, color = Color(0xFF94A3B8))
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            if (isLoading) {
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            } else {
                // Trust State Card
                when (val state = securityState) {
                    is ContactSecurityState.Verified -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF064E3B), RoundedCornerShape(12.dp))
                                .padding(14.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = Color(0xFF10B981))
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text("Verified Contact ✓", fontWeight = FontWeight.Bold, color = Color(0xFF10B981), fontSize = 14.sp)
                                    Text("This identity key matches your verified fingerprint.", fontSize = 12.sp, color = Color(0xFFD1FAE5))
                                }
                            }
                        }
                    }
                    is ContactSecurityState.KeyChanged -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF881337), RoundedCornerShape(12.dp))
                                .padding(14.dp)
                        ) {
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFF43F5E))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("⚠ Security Key Changed", fontWeight = FontWeight.Bold, color = Color(0xFFF43F5E), fontSize = 14.sp)
                                }
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    "$peerName's identity key has changed. This may indicate a new device, reinstallation, or a potential security risk. Messages may not be secure until you verify the new identity.",
                                    fontSize = 12.sp,
                                    color = Color(0xFFFFE4E6)
                                )
                                Spacer(modifier = Modifier.height(10.dp))
                                Text("Previous Fingerprint:", fontSize = 11.sp, color = Color(0xFFFDA4AF), fontWeight = FontWeight.SemiBold)
                                Text(state.previousFingerprint, fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = Color(0xFFFECDD3))
                                Spacer(modifier = Modifier.height(4.dp))
                                Text("Current Fingerprint:", fontSize = 11.sp, color = Color(0xFFFDA4AF), fontWeight = FontWeight.SemiBold)
                                Text(state.currentFingerprint, fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = Color.White)
                            }
                        }
                    }
                    is ContactSecurityState.Unverified -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF1E293B), RoundedCornerShape(12.dp))
                                .padding(14.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Shield, contentDescription = null, tint = Color(0xFF94A3B8))
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text("Unverified Contact", fontWeight = FontWeight.Bold, color = Color.White, fontSize = 14.sp)
                                    Text("Messages are end-to-end encrypted, but this contact's key has not been manually verified.", fontSize = 12.sp, color = Color(0xFF94A3B8))
                                }
                            }
                        }
                    }
                    is ContactSecurityState.NoKey -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF1E293B), RoundedCornerShape(12.dp))
                                .padding(14.dp)
                        ) {
                            Text(errorMessage ?: "No public key available for this contact.", color = Color(0xFF94A3B8), fontSize = 13.sp)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Identity Fingerprint Card
                peerFingerprint?.let { fp ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Identity Fingerprint (SHA-256)", fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Color(0xFF94A3B8))
                                IconButton(onClick = { copyToClipboard("Fingerprint", fp) }, modifier = Modifier.size(28.dp)) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = "Copy Fingerprint", tint = Color(0xFF94A3B8), modifier = Modifier.size(16.dp))
                                }
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0xFF090D16), RoundedCornerShape(8.dp))
                                    .padding(12.dp)
                            ) {
                                Text(
                                    text = fp,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Color.White,
                                    lineHeight = 22.sp
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Symmetric Safety Number Card
                safetyNumber?.let { sn ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text("Symmetric Safety Number", fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Color(0xFF94A3B8))
                                    Text("Matches on both your and ${peerName}'s device", fontSize = 11.sp, color = Color(0xFF64748B))
                                }
                                IconButton(onClick = { copyToClipboard("Safety Number", sn) }, modifier = Modifier.size(28.dp)) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = "Copy Safety Number", tint = Color(0xFF94A3B8), modifier = Modifier.size(16.dp))
                                }
                            }
                            Spacer(modifier = Modifier.height(10.dp))
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0xFF090D16), RoundedCornerShape(8.dp))
                                    .padding(12.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = sn,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Verification Instructions
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF0F172A), RoundedCornerShape(12.dp))
                        .padding(14.dp)
                ) {
                    Text(
                        "Compare this fingerprint or safety number with your contact using a trusted communication method (in person or via a secure phone call). Do not rely solely on this chat to verify the identity.",
                        fontSize = 12.sp,
                        color = Color(0xFF94A3B8),
                        lineHeight = 18.sp
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Verification Action Buttons
                when (securityState) {
                    is ContactSecurityState.Unverified, is ContactSecurityState.KeyChanged -> {
                        Button(
                            onClick = { showVerifyDialog = true },
                            enabled = currentKeyId != null && peerFingerprint != null,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                        ) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = Color.Black)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Mark as Verified", color = Color.Black, fontWeight = FontWeight.Bold)
                        }
                    }
                    is ContactSecurityState.Verified -> {
                        OutlinedButton(
                            onClick = { showRemoveDialog = true },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFF43F5E))
                        ) {
                            Icon(Icons.Default.Close, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Remove Verification")
                        }
                    }
                    is ContactSecurityState.NoKey -> {}
                }
            }
        }
    }

    // Confirmation Dialog: Mark as Verified
    if (showVerifyDialog) {
        AlertDialog(
            onDismissRequest = { showVerifyDialog = false },
            title = { Text("Mark $peerName as Verified?") },
            text = {
                Text("Have you compared the fingerprint or safety number with your contact using a trusted channel?")
            },
            confirmButton = {
                Button(
                    onClick = {
                        val kId = currentKeyId
                        val fp = peerFingerprint
                        if (kId != null && fp != null) {
                            contactSecurityRepository.markAsVerified(peerId, kId, fp)
                            refresh()
                        }
                        showVerifyDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) {
                    Text("Mark as Verified", color = Color.Black)
                }
            },
            dismissButton = {
                TextButton(onClick = { showVerifyDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Confirmation Dialog: Remove Verification
    if (showRemoveDialog) {
        AlertDialog(
            onDismissRequest = { showRemoveDialog = false },
            title = { Text("Remove Verification?") },
            text = {
                Text("$peerName will no longer be marked as verified on this device. Messages will remain encrypted.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        contactSecurityRepository.removeVerification(peerId)
                        refresh()
                        showRemoveDialog = false
                    }
                ) {
                    Text("Remove", color = Color(0xFFF43F5E))
                }
            },
            dismissButton = {
                TextButton(onClick = { showRemoveDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}
