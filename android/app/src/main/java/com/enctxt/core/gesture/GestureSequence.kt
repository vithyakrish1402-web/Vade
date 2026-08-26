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
        const val MIN_SEQUENCE_LENGTH = 2
        const val MAX_SEQUENCE_LENGTH = 5
        const val DEFAULT_SEQUENCE_LENGTH = 3
    }
}
