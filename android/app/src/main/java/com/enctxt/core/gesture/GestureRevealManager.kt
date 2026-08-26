package com.enctxt.core.gesture

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Central authorization controller for Layer 3 — Local Gesture Reveal.
 *
 * This is the ONLY component permitted to drive plaintext visibility. UI must never construct
 * a "revealed" flag itself — every consumer (see ProtectedMessage) derives visibility solely
 * from [state], which only this class can advance to [RevealState.Revealed].
 *
 * Lifetime: intended to be created per-conversation-screen (e.g. via `remember(conversationId)`
 * in Compose) and torn down with [dispose] when that screen leaves composition — which is what
 * guarantees reveal state, the failed-attempt counter, and any lockout are all destroyed when
 * navigating away (see Phase 16 spec §41), and can never survive process death since nothing
 * here is persisted.
 *
 * Fails closed: any unexpected condition (unconfigured gesture, corrupted storage, cancelled
 * timer, disposed manager) resolves to [RevealState.Protected], never to a revealed message.
 */
class GestureRevealManager(
    private val repository: GestureRepository,
    private val userId: String,
    private val scope: CoroutineScope
) {
    private val _state = MutableStateFlow<RevealState>(RevealState.Protected)
    val state: StateFlow<RevealState> = _state.asStateFlow()

    /** Transient, generic feedback for the reveal dialog (e.g. "Gesture didn't match."). */
    private val _feedback = MutableStateFlow<String?>(null)
    val feedback: StateFlow<String?> = _feedback.asStateFlow()

    private var failedAttempts = 0
    private var timerJob: Job? = null

    val isConfigured: Boolean get() = repository.isConfigured(userId)
    val sequenceLength: Int get() = repository.sequenceLength(userId)

    /** Begins (or restarts) authentication targeting [messageId]. No-op while locked out. */
    fun startReveal(messageId: String) {
        if (_state.value is RevealState.Locked) return
        if (!repository.isConfigured(userId)) return

        cancelTimer()
        _feedback.value = null
        _state.value = RevealState.Authenticating(messageId, step = 0)
    }

    /**
     * Submits one completed stroke for the current authentication step.
     * Ignored unless [state] is currently [RevealState.Authenticating].
     */
    fun submitStroke(rawPoints: List<GesturePoint>) {
        val current = _state.value
        if (current !is RevealState.Authenticating) return

        if (!GestureNormalizer.isValidStroke(rawPoints)) {
            _feedback.value = "Stroke too short. Draw a clear continuous gesture."
            return
        }

        val matched = try {
            repository.verifyStep(userId, current.step, rawPoints)
        } catch (_: Exception) {
            false // Fail closed on any unexpected recognition error.
        }

        if (matched) {
            _feedback.value = null
            val nextStep = current.step + 1
            if (nextStep >= repository.sequenceLength(userId)) {
                onSequenceAuthenticated(current.messageId)
            } else {
                _state.value = RevealState.Authenticating(current.messageId, nextStep)
            }
        } else {
            onStepMismatch(current.messageId)
        }
    }

    private fun onSequenceAuthenticated(messageId: String) {
        failedAttempts = 0
        cancelTimer()
        _feedback.value = null
        _state.value = RevealState.Revealed(messageId, REVEAL_DURATION_SECONDS)

        timerJob = scope.launch {
            var remaining = REVEAL_DURATION_SECONDS
            while (remaining > 0) {
                delay(1_000)
                remaining -= 1
                val s = _state.value
                if (s !is RevealState.Revealed || s.messageId != messageId) return@launch
                _state.value = RevealState.Revealed(messageId, remaining)
            }
            if (_state.value.let { it is RevealState.Revealed && it.messageId == messageId }) {
                _state.value = RevealState.Protected
            }
        }
    }

    private fun onStepMismatch(messageId: String) {
        failedAttempts += 1

        // Never reveal which specific gesture in the sequence failed.
        if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
            _feedback.value = null
            enterLockout()
        } else {
            _feedback.value = "Gesture didn't match. Sequence restarted at step 1."
            _state.value = RevealState.Authenticating(messageId, step = 0)
        }
    }

    private fun enterLockout() {
        cancelTimer()
        _state.value = RevealState.Locked(LOCKOUT_DURATION_SECONDS)

        timerJob = scope.launch {
            var remaining = LOCKOUT_DURATION_SECONDS
            while (remaining > 0) {
                delay(1_000)
                remaining -= 1
                if (_state.value !is RevealState.Locked) return@launch
                _state.value = RevealState.Locked(remaining)
            }
            failedAttempts = 0
            if (_state.value is RevealState.Locked) {
                _state.value = RevealState.Protected
            }
        }
    }

    /** User tapped "Hide" — immediately re-protects. Does not reset the failed-attempt count. */
    fun hide() {
        if (_state.value is RevealState.Locked) return
        cancelTimer()
        _feedback.value = null
        _state.value = RevealState.Protected
    }

    /**
     * Forces immediate re-protection: app backgrounded, window lost focus, navigation away,
     * or logout. Does not clear an in-progress lockout countdown — only an actively revealed
     * or in-progress authentication is revoked.
     */
    fun revokeReveal() {
        val current = _state.value
        if (current is RevealState.Locked) return
        cancelTimer()
        _feedback.value = null
        _state.value = RevealState.Protected
    }

    /** Cancels all pending timers. Call when the owning screen leaves composition. */
    fun dispose() {
        cancelTimer()
    }

    private fun cancelTimer() {
        timerJob?.cancel()
        timerJob = null
    }

    companion object {
        const val MAX_FAILED_ATTEMPTS = 5
        const val LOCKOUT_DURATION_SECONDS = 30
        const val REVEAL_DURATION_SECONDS = 8
    }
}
