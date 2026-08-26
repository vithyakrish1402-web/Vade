package com.enctxt.core.gesture

import kotlin.math.max
import kotlin.math.sqrt

/**
 * Gesture Normalization & Geometric Preprocessing Engine (Layer 3 — Local Gesture Reveal)
 *
 * Ports the geometric normalization pipeline of the Web implementation
 * (client/src/utils/gestureNormalize.ts) 1:1 so recognition behavior is conceptually
 * identical across platforms, even though gesture templates themselves are never shared
 * cross-platform (each device enrolls and stores its own templates locally).
 *
 * Pipeline: validate -> resample (N=64, equidistant arc length) -> scale to bounding box
 * (100x100, aspect preserved) -> translate centroid to origin. Direction is preserved —
 * points are never reversed or sorted.
 *
 * Input points must already be density-independent (dp), not raw device pixels — see
 * GestureCanvas, which converts pointer offsets via LocalDensity before building points.
 */
object GestureNormalizer {

    const val RESAMPLE_POINT_COUNT = 64
    const val MIN_GESTURE_PATH_LENGTH = 30f // dp — same conceptual minimum as Web Phase 6
    const val NORMALIZED_BOUNDING_SIZE = 100f

    fun distance(a: GesturePoint, b: GesturePoint): Float {
        val dx = b.x - a.x
        val dy = b.y - a.y
        return sqrt(dx * dx + dy * dy)
    }

    fun calculatePathLength(points: List<GesturePoint>): Float {
        if (points.size < 2) return 0f
        var total = 0f
        for (i in 1 until points.size) {
            total += distance(points[i - 1], points[i])
        }
        return total
    }

    /**
     * Rejects empty/single-point input, NaN/infinite coordinates, and strokes shorter than
     * [MIN_GESTURE_PATH_LENGTH] (accidental taps / noise).
     */
    fun isValidStroke(points: List<GesturePoint>, minPathLength: Float = MIN_GESTURE_PATH_LENGTH): Boolean {
        if (points.size < 2) return false
        for (p in points) {
            if (p.x.isNaN() || p.y.isNaN() || !p.x.isFinite() || !p.y.isFinite()) return false
        }
        return calculatePathLength(points) >= minPathLength
    }

    /**
     * Resamples a stroke to exactly [n] equidistant points along its arc length, so drawing
     * speed and input sampling frequency don't affect the resulting template.
     */
    fun resample(points: List<GesturePoint>, n: Int = RESAMPLE_POINT_COUNT): List<GesturePoint> {
        if (points.isEmpty()) return emptyList()
        if (points.size == 1) return List(n) { points[0] }

        val totalLength = calculatePathLength(points)
        if (totalLength == 0f) return List(n) { points[0] }

        val interval = totalLength / (n - 1)
        var accumulated = 0f
        val resampled = mutableListOf(points[0])
        val src = points.toMutableList()

        var i = 1
        while (i < src.size) {
            val p1 = src[i - 1]
            val p2 = src[i]
            val segDist = distance(p1, p2)

            if (segDist == 0f) {
                i++
                continue
            }

            if (accumulated + segDist >= interval) {
                val remainingToTarget = interval - accumulated
                val ratio = remainingToTarget / segDist
                val newPoint = GesturePoint(
                    x = p1.x + ratio * (p2.x - p1.x),
                    y = p1.y + ratio * (p2.y - p1.y)
                )
                resampled.add(newPoint)
                src.add(i, newPoint)
                accumulated = 0f
            } else {
                accumulated += segDist
            }
            i++
        }

        while (resampled.size < n) {
            resampled.add(points.last())
        }

        return resampled.take(n)
    }

    /** Translation invariance: shifts the shape so its centroid sits at the origin. */
    fun translateToOrigin(points: List<GesturePoint>): List<GesturePoint> {
        if (points.isEmpty()) return emptyList()
        val centroidX = points.sumOf { it.x.toDouble() }.toFloat() / points.size
        val centroidY = points.sumOf { it.y.toDouble() }.toFloat() / points.size
        return points.map { GesturePoint(it.x - centroidX, it.y - centroidY) }
    }

    /** Scale invariance: fits the shape into a standard bounding box, preserving aspect ratio. */
    fun scaleToBoundingBox(points: List<GesturePoint>, size: Float = NORMALIZED_BOUNDING_SIZE): List<GesturePoint> {
        if (points.isEmpty()) return emptyList()

        var minX = Float.POSITIVE_INFINITY
        var maxX = Float.NEGATIVE_INFINITY
        var minY = Float.POSITIVE_INFINITY
        var maxY = Float.NEGATIVE_INFINITY

        for (p in points) {
            if (p.x < minX) minX = p.x
            if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y
            if (p.y > maxY) maxY = p.y
        }

        val width = max(maxX - minX, 1f)
        val height = max(maxY - minY, 1f)
        val scale = size / max(width, height)

        return points.map { GesturePoint(it.x * scale, it.y * scale) }
    }

    /**
     * Full pipeline: validate -> resample -> scale -> translate.
     * Returns null for an invalid stroke (fail closed — caller must not save/match a null result).
     */
    fun normalize(rawPoints: List<GesturePoint>): GestureTemplate? {
        if (!isValidStroke(rawPoints)) return null
        val resampled = resample(rawPoints, RESAMPLE_POINT_COUNT)
        val scaled = scaleToBoundingBox(resampled, NORMALIZED_BOUNDING_SIZE)
        val translated = translateToOrigin(scaled)
        return GestureTemplate(translated)
    }
}
