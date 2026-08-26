package com.enctxt.core.gesture

/**
 * State machine for the Layer 3 gesture reveal flow, owned by [GestureRevealManager].
 *
 * Reveal is scoped to a single target message at a time (see [messageId]) — the strongest
 * privacy option available while staying usable, since it never creates a plaintext cache for
 * a message the user didn't explicitly authenticate to see. Starting a new reveal, or any
 * re-protection trigger, always resolves back to [Protected] first.
 */
sealed interface RevealState {

    /** Default, and the only safe fallback for any failure or uncertain condition. */
    data object Protected : RevealState

    /** Gesture modal open, targeting [messageId], currently expecting step [step] (0-indexed). */
    data class Authenticating(val messageId: String, val step: Int) : RevealState

    /** Fully authenticated: [messageId] may render plaintext for [remainingSeconds] more. */
    data class Revealed(val messageId: String, val remainingSeconds: Int) : RevealState

    /** Five consecutive failures reached; reveal unavailable for [remainingSeconds]. */
    data class Locked(val remainingSeconds: Int) : RevealState
}
