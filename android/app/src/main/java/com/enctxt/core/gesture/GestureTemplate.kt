package com.enctxt.core.gesture

/**
 * A single normalized 2D point within a gesture stroke.
 *
 * Coordinates are density-independent (dp-space, not raw pixels) and, once part of a
 * [GestureTemplate], are already centroid-translated and bounding-box scaled — see
 * [GestureNormalizer]. Never populated from raw/absolute screen coordinates after
 * normalization.
 */
data class GesturePoint(
    val x: Float,
    val y: Float
)

/**
 * A single normalized gesture (one step in a [GestureSequence]).
 *
 * Always contains exactly [GestureNormalizer.RESAMPLE_POINT_COUNT] points once produced by
 * [GestureNormalizer.normalize]. Direction is preserved — points are never reordered or sorted.
 */
data class GestureTemplate(
    val points: List<GesturePoint>
)
