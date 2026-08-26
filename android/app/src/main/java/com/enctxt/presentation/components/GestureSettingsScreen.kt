package com.enctxt.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.ShieldMoon
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.enctxt.core.gesture.GestureRepository

/**
 * Local device settings for the Layer 3 reveal gesture. Never displays the gesture itself —
 * only whether one is configured and how many steps it has.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GestureSettingsScreen(
    repository: GestureRepository,
    userId: String,
    onBack: () -> Unit,
    onChangeGesture: () -> Unit
) {
    var showDeleteConfirm by remember { mutableStateOf(false) }

    // Re-read storage on every foreground resume (e.g. returning from the enrollment screen
    // after "Change Gesture"), since the underlying encrypted prefs may have changed elsewhere.
    var refreshGeneration by remember { mutableIntStateOf(0) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) refreshGeneration++
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    var isConfigured by remember(refreshGeneration) { mutableStateOf(repository.isConfigured(userId)) }
    val sequenceLength = remember(refreshGeneration, isConfigured) { if (isConfigured) repository.sequenceLength(userId) else 0 }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Reveal Gesture") },
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
                .padding(20.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(
                            if (isConfigured) Color(0xFF10B981).copy(alpha = 0.12f) else Color(0xFF1E293B),
                            CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        if (isConfigured) Icons.Default.ShieldMoon else Icons.Default.Shield,
                        contentDescription = null,
                        tint = if (isConfigured) Color(0xFF10B981) else Color(0xFF94A3B8)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text("Message Reveal Gesture", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(
                        if (isConfigured) "Configured ✓ ($sequenceLength steps)" else "Not configured",
                        color = if (isConfigured) Color(0xFF10B981) else Color(0xFF94A3B8),
                        fontSize = 12.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0F172A), RoundedCornerShape(16.dp))
                    .padding(14.dp)
            ) {
                Text(
                    "Your gesture sequence is stored locally on this device and is never sent to " +
                        "the server. Protected messages remain protected until authorized with your " +
                        "custom gesture.",
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp
                )
            }

            Spacer(modifier = Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onChangeGesture) {
                    Icon(Icons.Default.Key, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(if (isConfigured) "Change Gesture" else "Create Gesture")
                }
                if (isConfigured) {
                    OutlinedButton(
                        onClick = { showDeleteConfirm = true },
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFF43F5E))
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Delete Gesture")
                    }
                }
            }
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete your reveal gesture?") },
            text = { Text("You will need to create a new one before revealing protected messages.") },
            confirmButton = {
                TextButton(onClick = {
                    repository.deleteSequence(userId)
                    isConfigured = false
                    showDeleteConfirm = false
                }) {
                    Text("Delete", color = Color(0xFFF43F5E))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") }
            }
        )
    }
}
