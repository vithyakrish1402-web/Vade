package com.enctxt.core.gesture

import kotlin.math.sqrt

/**
 * Gesture Recognition & Similarity Engine (Layer 3 — Local Gesture Reveal)
 *
 * Deterministic unistroke comparison over normalized 64-point templates using average
 * Euclidean distance. Ports client/src/utils/gestureRecognizer.ts.
 *
 * The match threshold is intentionally centralized and NOT exposed as a user-configurable
 * setting — surfacing it would let an attacker tune brute-force tolerance.
 */
object GestureRecognizer {

    /** D <= this counts as a match during authentication. */
    private const val MATCH_THRESHOLD = 28.0f

    /** Slightly more forgiving threshold used only during enrollment's confirm-redraw step. */
    private const val CONFIRMATION_THRESHOLD = 30.0f

    /** Maximum theoretical diagonal across the normalized bounding box: sqrt(100^2 + 100^2). */
    private val MAX_POSSIBLE_DISTANCE = sqrt(2f) * GestureNormalizer.NORMALIZED_BOUNDING_SIZE

    /** Average point-to-point Euclidean distance between two same-length normalized templates. */
    fun distanceBetween(a: GestureTemplate, b: GestureTemplate): Float {
        if (a.points.isEmpty() || b.points.isEmpty()) return Float.POSITIVE_INFINITY
        val n = minOf(a.points.size, b.points.size)
        var total = 0f
        for (i in 0 until n) {
            total += GestureNormalizer.distance(a.points[i], b.points[i])
        }
        return total / n
    }

    /**
     * Similarity score in [0.0, 1.0], for UI/debugging only — never expose raw distance or
     * per-step similarity to the end user, as it could aid brute-forcing the sequence.
     */
    fun similarity(a: GestureTemplate, b: GestureTemplate): Float {
        val d = distanceBetween(a, b)
        if (!d.isFinite()) return 0f
        val score = 1f - d / MAX_POSSIBLE_DISTANCE
        return score.coerceIn(0f, 1f)
    }

    /**
     * Verifies whether freshly drawn raw points match an already-enrolled normalized template.
     * Normalizes [drawnRawPoints] internally; fails closed (false) on an invalid stroke.
     */
    fun isMatch(
        drawnRawPoints: List<GesturePoint>,
        enrolledTemplate: GestureTemplate,
        maxDistance: Float = MATCH_THRESHOLD
    ): Boolean {
        val normalizedDrawn = GestureNormalizer.normalize(drawnRawPoints) ?: return false
        return distanceBetween(normalizedDrawn, enrolledTemplate) <= maxDistance
    }

    /**
     * Compares the two raw drawings captured during enrollment's draw/confirm step.
     * Returns true if the user reproduced their intended gesture closely enough to save it.
     */
    fun enrollmentDrawingsMatch(
        rawDrawing1: List<GesturePoint>,
        rawDrawing2: List<GesturePoint>,
        maxDistance: Float = CONFIRMATION_THRESHOLD
    ): Boolean {
        val norm1 = GestureNormalizer.normalize(rawDrawing1) ?: return false
        val norm2 = GestureNormalizer.normalize(rawDrawing2) ?: return false
        return distanceBetween(norm1, norm2) <= maxDistance
    }
}
