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

    /*
     * Thresholds are average point-to-point distance across a 100x100 normalized box, chosen
     * from a sweep over genuine redraws (varying offset, scale and hand wobble) against
     * distinct-shape impostor pairs:
     *
     *   threshold   false-reject   false-accept
     *        28.0           0.0%          11.1%   <- the previous value
     *        20.0           0.0%           6.7%
     *        16.0           0.0%           2.2%
     *        14.0           1.0%           0.0%
     *        12.0           7.9%           0.0%
     *
     * Genuine redraws top out around 15.5 and the closest impostor pair sits at 15.1, so 14
     * is the widest setting that still admits no wrong shape. At 28 roughly one in nine
     * wrong-shape pairs unlocked, which defeats the point of gating reveal on a gesture: a
     * false reject costs one redraw, a false accept puts plaintext on screen.
     */

    /** D <= this counts as a match during authentication. */
    private const val MATCH_THRESHOLD = 14.0f

    /**
     * Enrollment's confirm-redraw compares two freshly drawn strokes, so both sides carry hand
     * wobble rather than just one. It is a hair more forgiving to account for that, and still
     * admits no impostor pair. Kept close to [MATCH_THRESHOLD] deliberately: a gesture loose
     * enough to enroll but too loose to unlock would be the worst possible outcome.
     */
    private const val CONFIRMATION_THRESHOLD = 15.0f

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
