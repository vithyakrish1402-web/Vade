package com.enctxt.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.enctxt.core.network.NetworkResult
import com.enctxt.core.security.ContactSecurityState
import com.enctxt.core.security.FingerprintEngine
import com.enctxt.core.security.SafetyNumberEngine
import com.enctxt.data.repository.ContactSecurityRepository
import com.enctxt.data.repository.CryptoRepository
import com.enctxt.presentation.components.vade.*
import com.enctxt.presentation.theme.*
import kotlinx.coroutines.launch

/** Splits a space-separated code into fixed-size lines so it can be read aloud in chunks. */
private fun toLines(value: String?, perLine: Int): List<String> {
    if (value.isNullOrBlank()) return emptyList()
    return value.split(" ").chunked(perLine).map { it.joinToString(" ") }
}

/**
 * Contact security, a screen rather than a dialog — comparing a safety number is a task done
 * with another person present.
 *
 * Verify and unverify each go through a confirmation: both change what the rest of the app
 * tells the user about this conversation. The safety number and fingerprint are deliberately
 * not copyable; they are meant to be read aloud over a channel you already trust, and a
 * clipboard copy is exactly the channel that cannot be trusted.
 */
@Composable
fun ContactSecurityScreen(
    peerId: String,
    peerName: String,
    currentUserId: String,
    contactSecurityRepository: ContactSecurityRepository,
    cryptoRepository: CryptoRepository,
    onBack: () -> Unit
) {
    val colors = vadeColors
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    var securityState by remember { mutableStateOf<ContactSecurityState>(ContactSecurityState.Unverified) }
    var currentKeyId by remember { mutableStateOf<String?>(null) }
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
                    val peerPubBase64 = java.util.Base64.getEncoder()
                        .encodeToString(keyResult.data.second.encoded)
                    val localPubBase64 = cryptoRepository.getLocalPublicKeyBase64()
                    currentKeyId = keyId

                    val fingerprint = try {
                        FingerprintEngine.calculateFingerprint(peerPubBase64)
                    } catch (_: Exception) {
                        null
                    }
                    peerFingerprint = fingerprint

                    safetyNumber = if (localPubBase64.isNotBlank() && peerPubBase64.isNotBlank()) {
                        try {
                            SafetyNumberEngine.calculateSafetyNumber(localPubBase64, peerPubBase64)
                        } catch (_: Exception) {
                            null
                        }
                    } else {
                        null
                    }

                    securityState = if (fingerprint != null) {
                        contactSecurityRepository.evaluateSecurityState(
                            storedVerification = contactSecurityRepository.getStoredVerification(peerId),
                            currentKeyId = keyId,
                            currentFingerprint = fingerprint
                        )
                    } else {
                        ContactSecurityState.NoKey
                    }
                }

                is NetworkResult.Error -> {
                    errorMessage = keyResult.message.ifEmpty { "Could not load this contact's identity key." }
                    securityState = ContactSecurityState.NoKey
                }

                is NetworkResult.Loading -> Unit
            }
            isLoading = false
        }
    }

    LaunchedEffect(peerId) { refresh() }

    val isVerified = securityState is ContactSecurityState.Verified

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
    ) {
        VadeBackHeader(onBack = onBack, title = "Contact security", backLabel = "Back to conversation")

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = VadeSpace.screenPadding)
                .padding(bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(VadeSpace.section)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                VadeAvatar(peerName, size = 64.dp)
                Text(
                    peerName,
                    style = VadeType.name.copy(fontSize = 19.sp, letterSpacing = (-0.018).em),
                    color = colors.text
                )
                if (!isLoading) SecurityChip(state = securityState)
            }

            if (errorMessage != null) {
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
            }

            Column {
                SectionLabel("Safety number")
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(VadeShape.card)
                        .background(colors.surface)
                        .padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    val lines = toLines(safetyNumber, 2)
                    if (lines.isEmpty()) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                color = colors.muted,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(20.dp)
                            )
                        } else {
                            Text("Unavailable", style = VadeType.body, color = colors.muted)
                        }
                    } else {
                        lines.forEach { line ->
                            Text(
                                line,
                                style = VadeType.message.copy(
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 19.sp,
                                    lineHeight = 32.sp,
                                    letterSpacing = 0.06.em
                                ),
                                color = colors.text,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }
                Text(
                    "Read these numbers aloud with $peerName in person or over a channel you " +
                        "already trust. If they match, no one is between you.",
                    style = VadeType.bodySmall,
                    color = colors.muted,
                    modifier = Modifier.padding(top = 10.dp, start = 2.dp)
                )
            }

            Column {
                SectionLabel("Fingerprint")
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(VadeShape.card)
                        .background(colors.surface)
                        .padding(horizontal = 18.dp, vertical = 16.dp)
                ) {
                    val lines = toLines(peerFingerprint, 4)
                    if (lines.isEmpty()) {
                        Text("Unavailable", style = VadeType.body, color = colors.muted)
                    } else {
                        lines.forEach { line ->
                            Text(
                                line,
                                style = VadeType.message.copy(
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 13.5.sp,
                                    lineHeight = 24.sp,
                                    letterSpacing = 0.04.em
                                ),
                                color = colors.text
                            )
                        }
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (isVerified) {
                    VadeButton(
                        text = "Remove verification",
                        onClick = { showRemoveDialog = true },
                        variant = VadeButtonVariant.Outline,
                        size = VadeButtonSize.Medium,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else {
                    VadeButton(
                        text = "Mark as verified",
                        onClick = { showVerifyDialog = true },
                        enabled = peerFingerprint != null && currentKeyId != null,
                        size = VadeButtonSize.Medium,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                Text(
                    "Protocol v1 · ECDH P-256 · AES-256-GCM",
                    style = VadeType.bodySmall,
                    color = colors.faint,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }

    if (showVerifyDialog) {
        ConfirmDialog(
            title = "Mark as verified?",
            body = "Only do this once you have compared the safety number with $peerName over a " +
                "channel you trust.",
            confirmLabel = "Mark verified",
            onConfirm = {
                val keyId = currentKeyId
                val fingerprint = peerFingerprint
                if (keyId != null && fingerprint != null) {
                    scope.launch {
                        contactSecurityRepository.markAsVerified(peerId, keyId, fingerprint)
                        refresh()
                    }
                }
            },
            onDismiss = { showVerifyDialog = false }
        )
    }

    if (showRemoveDialog) {
        ConfirmDialog(
            title = "Remove verification?",
            body = "This conversation stays encrypted, but Vade will stop showing it as verified " +
                "until you compare safety numbers again.",
            confirmLabel = "Remove",
            onConfirm = {
                scope.launch {
                    contactSecurityRepository.removeVerification(peerId)
                    refresh()
                }
            },
            onDismiss = { showRemoveDialog = false }
        )
    }
}
