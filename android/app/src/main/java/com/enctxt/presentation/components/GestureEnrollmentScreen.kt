package com.enctxt.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.GestureRecognizer
import com.enctxt.core.gesture.GestureRepository
import com.enctxt.core.gesture.GestureRevealManager
import com.enctxt.core.privacy.SharedPrefsProtectionStylePreference
import com.enctxt.presentation.components.vade.*
import com.enctxt.presentation.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** After three failed confirmations, offer a fresh start rather than more of the same. */
const val MAX_CONFIRM_ATTEMPTS = 3

enum class EnrollmentPhase { DRAW, CONFIRM }

data class GestureEnrollmentUiState(
    val phase: EnrollmentPhase = EnrollmentPhase.DRAW,
    val attempts: Int = 0,
    val statusMessage: String? = null,
    val isError: Boolean = false,
    val isComplete: Boolean = false
)

/**
 * Drives enrollment: one continuous shape, drawn once and then repeated within tolerance
 * before anything is written. A single sample is not enough to enroll something the user will
 * have to reproduce under pressure.
 *
 * Multi-stroke sequences were tested and rejected — too easy to mistime — so exactly one
 * template is saved. Any existing gesture is left untouched in storage until
 * [GestureRepository.saveSequence] succeeds.
 */
class GestureEnrollmentViewModel(
    private val repository: GestureRepository,
    private val userId: String
) : ViewModel() {

    private val _uiState = MutableStateFlow(GestureEnrollmentUiState())
    val uiState: StateFlow<GestureEnrollmentUiState> = _uiState.asStateFlow()

    private var firstDrawing: List<GesturePoint>? = null

    fun onStroke(points: List<GesturePoint>) {
        val state = _uiState.value

        if (!isMemorableStroke(points)) {
            _uiState.value = state.copy(
                statusMessage = "Too short to be memorable. Draw a longer, continuous shape.",
                isError = true
            )
            return
        }

        if (state.phase == EnrollmentPhase.DRAW) {
            firstDrawing = points
            _uiState.value = state.copy(
                phase = EnrollmentPhase.CONFIRM,
                statusMessage = "Gesture recorded.",
                isError = false,
                attempts = 0
            )
            return
        }

        val first = firstDrawing
        if (first == null) {
            _uiState.value = state.copy(phase = EnrollmentPhase.DRAW, statusMessage = null, isError = false)
            return
        }

        if (!GestureRecognizer.enrollmentDrawingsMatch(first, points)) {
            // Retry in place: the recorded shape is kept, so the user is confirming the same
            // gesture rather than starting from scratch on every miss.
            val attempts = state.attempts + 1
            _uiState.value = state.copy(
                attempts = attempts,
                statusMessage = if (attempts >= MAX_CONFIRM_ATTEMPTS) {
                    "Still not matching. You can start over with a simpler shape."
                } else {
                    "That did not match. Try to draw it the same way."
                },
                isError = true
            )
            return
        }

        val saved = repository.saveSequence(userId, listOf(first))
        firstDrawing = null
        _uiState.value = if (saved) {
            state.copy(isComplete = true, statusMessage = null, isError = false)
        } else {
            state.copy(statusMessage = "Could not save the gesture on this device.", isError = true)
        }
    }

    fun startOver() {
        firstDrawing = null
        _uiState.value = GestureEnrollmentUiState()
    }
}

private enum class EnrollmentStage { Intro, Draw, Confirm, Style, Done }

/**
 * The four-step enrollment: understand, draw, confirm, choose a style.
 *
 * Raw coordinates stay in memory; only the normalised template is persisted, and only locally.
 */
@Composable
fun GestureEnrollmentScreen(
    viewModel: GestureEnrollmentViewModel,
    userId: String,
    isOnboarding: Boolean,
    onBack: () -> Unit,
    onComplete: () -> Unit
) {
    val colors = vadeColors
    val context = LocalContext.current
    val state by viewModel.uiState.collectAsState()

    val stylePreference = remember { SharedPrefsProtectionStylePreference(context) }
    var protectionMode by remember { mutableStateOf(stylePreference.getMode(userId)) }
    var stage by remember { mutableStateOf(EnrollmentStage.Intro) }

    // The view model owns draw/confirm; the screen owns the surrounding steps. When the
    // template lands, move on to choosing how protected text should look.
    LaunchedEffect(state.isComplete) {
        if (state.isComplete && stage == EnrollmentStage.Confirm) stage = EnrollmentStage.Style
    }
    LaunchedEffect(state.phase) {
        if (stage == EnrollmentStage.Draw && state.phase == EnrollmentPhase.CONFIRM) {
            stage = EnrollmentStage.Confirm
        }
    }

    val progress = when (stage) {
        EnrollmentStage.Intro -> 0.20f to "1 of 4"
        EnrollmentStage.Draw -> 0.40f to "2 of 4"
        EnrollmentStage.Confirm -> 0.60f to "3 of 4"
        EnrollmentStage.Style -> 0.80f to "4 of 4"
        EnrollmentStage.Done -> 1f to "Done"
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 4.dp, end = 16.dp, top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (!isOnboarding || stage != EnrollmentStage.Intro) {
                VadeIconButton(
                    icon = Icons.Default.ChevronLeft,
                    contentDescription = "Back",
                    diameter = 34.dp,
                    onClick = {
                        when (stage) {
                            EnrollmentStage.Intro -> onBack()
                            EnrollmentStage.Draw -> stage = EnrollmentStage.Intro
                            EnrollmentStage.Confirm -> {
                                viewModel.startOver()
                                stage = EnrollmentStage.Draw
                            }
                            EnrollmentStage.Style -> stage = EnrollmentStage.Confirm
                            EnrollmentStage.Done -> stage = EnrollmentStage.Style
                        }
                    }
                )
            } else {
                Spacer(Modifier.width(VadeSpace.touchTarget))
            }

            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(3.dp)
                    .clip(CircleShape)
                    .background(colors.line)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(progress.first)
                        .height(3.dp)
                        .clip(CircleShape)
                        .background(colors.accent)
                )
            }
            Text(progress.second, style = VadeType.bodySmall, color = colors.faint)
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 30.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            val (title, body) = when (stage) {
                EnrollmentStage.Intro -> "Set your reveal gesture" to
                    "You will draw a shape to unlock any protected message. It stays on this " +
                    "device and is never sent anywhere."
                EnrollmentStage.Draw -> "Draw it once" to
                    "One continuous stroke. Something you will repeat the same way every time."
                EnrollmentStage.Confirm -> "Now draw it again" to
                    "Repeat the same shape so Vade knows it was deliberate."
                EnrollmentStage.Style -> "How should protected text look?" to
                    "Change it any time in Profile. Encryption is the same either way."
                EnrollmentStage.Done -> "You are set up" to
                    "Tap any protected message and draw your gesture to read it."
            }

            Text(title, style = VadeType.stepTitle, color = colors.text, textAlign = TextAlign.Center)
            Text(
                body,
                style = VadeType.body,
                color = colors.muted,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .widthIn(max = 290.dp)
                    .padding(top = 9.dp, bottom = 22.dp)
            )

            when (stage) {
                EnrollmentStage.Draw, EnrollmentStage.Confirm -> {
                    GesturePad(
                        onStroke = { viewModel.onStroke(it) },
                        hasError = state.isError,
                        contentDescriptionText = if (stage == EnrollmentStage.Draw) {
                            "Draw your gesture in one continuous stroke."
                        } else {
                            "Draw the same gesture again to confirm it."
                        }
                    )
                    Spacer(Modifier.height(22.dp))
                    GesturePips(total = 2, completed = if (stage == EnrollmentStage.Confirm) 1 else 0)
                    Box(
                        modifier = Modifier
                            .heightIn(min = 20.dp)
                            .padding(top = 12.dp)
                    ) {
                        state.statusMessage?.let {
                            Text(
                                it,
                                style = VadeType.rowSecondary,
                                color = if (state.isError) colors.warn else colors.muted,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.widthIn(max = 290.dp)
                            )
                        }
                    }
                }

                EnrollmentStage.Style -> ProtectionStylePicker(
                    selected = protectionMode,
                    onSelect = { mode ->
                        stylePreference.setMode(userId, mode)
                        protectionMode = mode
                    }
                )

                EnrollmentStage.Done -> {
                    Box(
                        modifier = Modifier
                            .size(88.dp)
                            .background(colors.accentTint, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = colors.accentInk,
                            modifier = Modifier.size(38.dp)
                        )
                    }
                    Spacer(Modifier.height(22.dp))
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(VadeShape.card)
                            .background(colors.surface)
                            .padding(horizontal = 18.dp, vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(11.dp)
                    ) {
                        SummaryRow("Reveal gesture", "Saved on this device")
                        SummaryRow("Protection style", protectionStyleLabel(protectionMode))
                        SummaryRow(
                            "Reveal window",
                            "${GestureRevealManager.REVEAL_STROKE_COUNT} strokes · " +
                                "${GestureRevealManager.REVEAL_DURATION_SECONDS} seconds"
                        )
                    }
                }

                EnrollmentStage.Intro -> Unit
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 30.dp)
                .padding(bottom = 26.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            when (stage) {
                EnrollmentStage.Intro -> VadeButton(
                    text = "Draw my gesture",
                    onClick = { stage = EnrollmentStage.Draw },
                    modifier = Modifier.fillMaxWidth()
                )

                EnrollmentStage.Confirm -> Text(
                    "Start over",
                    style = VadeType.body,
                    color = colors.muted,
                    modifier = Modifier
                        .clip(VadeShape.pill)
                        .clickable(role = Role.Button) {
                            viewModel.startOver()
                            stage = EnrollmentStage.Draw
                        }
                        .padding(horizontal = 12.dp, vertical = 10.dp)
                )

                EnrollmentStage.Style -> VadeButton(
                    text = "Continue",
                    onClick = { stage = EnrollmentStage.Done },
                    modifier = Modifier.fillMaxWidth()
                )

                EnrollmentStage.Done -> VadeButton(
                    text = if (isOnboarding) "Start messaging" else "Done",
                    onClick = onComplete,
                    modifier = Modifier.fillMaxWidth()
                )

                EnrollmentStage.Draw -> Unit
            }
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    val colors = vadeColors
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = VadeType.rowSecondary.copy(fontSize = 13.5.sp), color = colors.muted)
        Text(value, style = VadeType.name.copy(fontSize = 13.5.sp), color = colors.text)
    }
}
