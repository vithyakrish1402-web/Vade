package com.enctxt.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.GestureNormalizer
import com.enctxt.core.gesture.GestureRecognizer
import com.enctxt.core.gesture.GestureRepository
import com.enctxt.core.gesture.GestureSequence
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class EnrollmentPhase { DRAW, CONFIRM }

data class GestureEnrollmentUiState(
    val totalSteps: Int = GestureSequence.DEFAULT_SEQUENCE_LENGTH,
    val currentStepIndex: Int = 0,
    val phase: EnrollmentPhase = EnrollmentPhase.DRAW,
    val statusMessage: String? = null,
    val isError: Boolean = false,
    val isComplete: Boolean = false
)

/**
 * Drives the enrollment wizard: each step requires the same gesture drawn twice in a row
 * (draw -> confirm) before it's accepted — never persists a gesture from a single drawing.
 * The old gesture (if any) is left completely untouched in storage until
 * [GestureRepository.saveSequence] succeeds for the *entire* new sequence.
 */
class GestureEnrollmentViewModel(
    private val repository: GestureRepository,
    private val userId: String
) : ViewModel() {

    private val _uiState = MutableStateFlow(GestureEnrollmentUiState())
    val uiState: StateFlow<GestureEnrollmentUiState> = _uiState.asStateFlow()

    private var firstDrawing: List<GesturePoint>? = null
    private val confirmedSteps = mutableListOf<List<GesturePoint>>()

    fun setTotalSteps(count: Int) {
        val s = _uiState.value
        if (s.currentStepIndex == 0 && s.phase == EnrollmentPhase.DRAW && firstDrawing == null) {
            _uiState.value = s.copy(totalSteps = count)
        }
    }

    fun onStroke(points: List<GesturePoint>) {
        val s = _uiState.value

        if (!GestureNormalizer.isValidStroke(points)) {
            _uiState.value = s.copy(
                statusMessage = "Stroke too short. Draw a clear continuous gesture.",
                isError = true
            )
            return
        }

        if (s.phase == EnrollmentPhase.DRAW) {
            firstDrawing = points
            _uiState.value = s.copy(
                phase = EnrollmentPhase.CONFIRM,
                statusMessage = "Now redraw the same gesture to confirm.",
                isError = false
            )
            return
        }

        // CONFIRM phase
        val first = firstDrawing
        if (first == null) {
            _uiState.value = s.copy(phase = EnrollmentPhase.DRAW)
            return
        }

        if (!GestureRecognizer.enrollmentDrawingsMatch(first, points)) {
            firstDrawing = null
            _uiState.value = s.copy(
                phase = EnrollmentPhase.DRAW,
                statusMessage = "Gestures didn't match closely enough. Redraw this step.",
                isError = true
            )
            return
        }

        confirmedSteps.add(first)
        firstDrawing = null

        if (s.currentStepIndex + 1 < s.totalSteps) {
            val nextStep = s.currentStepIndex + 1
            _uiState.value = s.copy(
                currentStepIndex = nextStep,
                phase = EnrollmentPhase.DRAW,
                statusMessage = "Step ${nextStep} confirmed! Now draw gesture ${nextStep + 1}.",
                isError = false
            )
        } else {
            val saved = repository.saveSequence(userId, confirmedSteps.toList())
            _uiState.value = if (saved) {
                s.copy(isComplete = true, statusMessage = "Gesture sequence saved locally on this device.", isError = false)
            } else {
                s.copy(statusMessage = "Failed to save gesture sequence.", isError = true)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GestureEnrollmentScreen(
    viewModel: GestureEnrollmentViewModel,
    onBack: () -> Unit,
    onComplete: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (state.isComplete) "Gesture Configured" else "Create Reveal Gesture") },
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
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (!state.isComplete) {
                Text(
                    "Create your private reveal gesture",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    "This gesture stays on this device. It is never sent to the server. " +
                        "Draw the same gesture twice to confirm it.",
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.height(20.dp))

                Text(
                    "Step ${state.currentStepIndex + 1} of ${state.totalSteps}",
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.height(8.dp))
                StepProgressIndicator(total = state.totalSteps, currentIndex = state.currentStepIndex)
                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    if (state.phase == EnrollmentPhase.DRAW)
                        "Draw gesture ${state.currentStepIndex + 1}"
                    else
                        "Redraw gesture ${state.currentStepIndex + 1} to confirm",
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(12.dp))

                GestureCanvas(onStrokeComplete = { viewModel.onStroke(it) })

                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = state.statusMessage ?: "Draw any shape in one continuous stroke.",
                    color = if (state.isError) Color(0xFFF43F5E) else Color(0xFF94A3B8),
                    fontSize = 12.sp
                )

                if (state.currentStepIndex == 0 && state.phase == EnrollmentPhase.DRAW) {
                    Spacer(modifier = Modifier.height(20.dp))
                    Text("Steps in sequence", color = Color(0xFF94A3B8), fontSize = 11.sp)
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (len in GestureSequence.MIN_SEQUENCE_LENGTH..GestureSequence.MAX_SEQUENCE_LENGTH) {
                            val selected = state.totalSteps == len
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .background(
                                        if (selected) Color(0xFF10B981) else Color(0xFF1E293B),
                                        CircleShape
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    "$len",
                                    color = if (selected) Color.Black else Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(2.dp)
                                )
                            }
                        }
                    }
                }
            } else {
                Spacer(modifier = Modifier.height(40.dp))
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .background(Color(0xFF10B981).copy(alpha = 0.12f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF10B981))
                }
                Spacer(modifier = Modifier.height(16.dp))
                Text("Gesture Configured", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    "Your ${state.totalSteps}-step reveal sequence is saved locally on this device.",
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.height(20.dp))
                Button(onClick = onComplete) { Text("Done") }
            }
        }
    }
}
