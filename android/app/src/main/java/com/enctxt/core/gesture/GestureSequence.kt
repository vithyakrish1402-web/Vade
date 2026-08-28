package com.enctxt.core.gesture

/**
 * An ordered, enrolled sequence of gesture templates used to authorize a temporary
 * plaintext reveal (Layer 3 — Local Gesture Reveal).
 *
 * This is a LOCAL-ONLY authorization artifact. It is never transmitted, synchronized,
 * backed up, or persisted server-side. See [GestureStorage].
 */
data class GestureSequence(
    val version: Int = SCHEMA_VERSION,
    val templates: List<GestureTemplate>,
    val createdAt: String,
    val updatedAt: String
) {
    val length: Int get() = templates.size

    fun isValid(): Boolean =
        version == SCHEMA_VERSION &&
            templates.size in MIN_SEQUENCE_LENGTH..MAX_SEQUENCE_LENGTH &&
            templates.all { it.points.size == GestureNormalizer.RESAMPLE_POINT_COUNT }

    companion object {
        const val SCHEMA_VERSION = 1

        /**
         * Enrollment records a single shape, so one template is a complete sequence.
         *
         * This was 2 while enrollment was a multi-step wizard, which silently rejected every
         * single-shape save — the user confirmed their gesture, the write was refused, and the
         * screen sat on the confirm step forever. Strength now comes from repeating the one
         * shape [GestureRevealManager.REVEAL_STROKE_COUNT] times at reveal, not from enrolling
         * several different ones.
         */
        const val MIN_SEQUENCE_LENGTH = 1

        /** Sequences enrolled under the older multi-step flow still load and still work. */
        const val MAX_SEQUENCE_LENGTH = 5
    }
}
