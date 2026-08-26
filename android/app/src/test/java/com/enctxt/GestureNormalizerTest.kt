package com.enctxt

import com.enctxt.core.gesture.GestureNormalizer
import com.enctxt.core.gesture.GesturePoint
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs

class GestureNormalizerTest {

    // ---- Validation ----

    @Test
    fun testEmptyInputRejected() {
        assertFalse(GestureNormalizer.isValidStroke(emptyList()))
        assertNull(GestureNormalizer.normalize(emptyList()))
    }

    @Test
    fun testSinglePointRejected() {
        val points = listOf(GesturePoint(10f, 10f))
        assertFalse(GestureNormalizer.isValidStroke(points))
        assertNull(GestureNormalizer.normalize(points))
    }

    @Test
    fun testTinyTapRejected() {
        // Total movement well under the 30dp minimum path length.
        val points = listOf(GesturePoint(0f, 0f), GesturePoint(2f, 1f), GesturePoint(3f, 2f))
        assertFalse(GestureNormalizer.isValidStroke(points))
        assertNull(GestureNormalizer.normalize(points))
    }

    @Test
    fun testNaNCoordinatesRejected() {
        val points = listOf(GesturePoint(0f, 0f), GesturePoint(Float.NaN, 50f), GesturePoint(50f, 50f))
        assertFalse(GestureNormalizer.isValidStroke(points))
        assertNull(GestureNormalizer.normalize(points))
    }

    @Test
    fun testInfiniteCoordinatesRejected() {
        val points = listOf(GesturePoint(0f, 0f), GesturePoint(Float.POSITIVE_INFINITY, 50f))
        assertFalse(GestureNormalizer.isValidStroke(points))
        assertNull(GestureNormalizer.normalize(points))
    }

    @Test
    fun testShortStrokeBelowThresholdRejected() {
        val points = listOf(GesturePoint(0f, 0f), GesturePoint(10f, 0f), GesturePoint(20f, 0f))
        assertTrue(GestureNormalizer.calculatePathLength(points) < GestureNormalizer.MIN_GESTURE_PATH_LENGTH)
        assertFalse(GestureNormalizer.isValidStroke(points))
    }

    @Test
    fun testValidStrokeAccepted() {
        val points = (0..50).map { GesturePoint(it.toFloat(), 0f) }
        assertTrue(GestureNormalizer.isValidStroke(points))
        assertNotNull(GestureNormalizer.normalize(points))
    }

    // ---- Resampling ----

    @Test
    fun testResamplesToExactlyNPoints() {
        val points = (0..10).map { GesturePoint(it * 10f, 0f) }
        val resampled = GestureNormalizer.resample(points, GestureNormalizer.RESAMPLE_POINT_COUNT)
        assertEquals(GestureNormalizer.RESAMPLE_POINT_COUNT, resampled.size)
    }

    @Test
    fun testResamplingIndependentOfInputDensity() {
        // Same straight line, sampled sparsely vs densely — should normalize to the same shape.
        val sparse = listOf(GesturePoint(0f, 0f), GesturePoint(50f, 0f), GesturePoint(100f, 0f))
        val dense = (0..100).map { GesturePoint(it.toFloat(), 0f) }

        val normSparse = GestureNormalizer.normalize(sparse)!!
        val normDense = GestureNormalizer.normalize(dense)!!

        assertEquals(normSparse.points.size, normDense.points.size)
        for (i in normSparse.points.indices) {
            assertEquals(normSparse.points[i].x, normDense.points[i].x, 0.5f)
            assertEquals(normSparse.points[i].y, normDense.points[i].y, 0.5f)
        }
    }

    // ---- Centroid / translation invariance ----

    @Test
    fun testCentroidNormalizationCentersShape() {
        val points = listOf(GesturePoint(0f, 0f), GesturePoint(100f, 0f), GesturePoint(50f, 100f))
        val translated = GestureNormalizer.translateToOrigin(points)
        val meanX = translated.map { it.x }.average()
        val meanY = translated.map { it.y }.average()
        assertEquals(0.0, meanX, 0.001)
        assertEquals(0.0, meanY, 0.001)
    }

    @Test
    fun testTranslationInvariance() {
        val base = (0..50).map { GesturePoint(it.toFloat(), it.toFloat() * 0.5f) }
        val shifted = base.map { GesturePoint(it.x + 500f, it.y + 300f) }

        val normBase = GestureNormalizer.normalize(base)!!
        val normShifted = GestureNormalizer.normalize(shifted)!!

        for (i in normBase.points.indices) {
            assertEquals(normBase.points[i].x, normShifted.points[i].x, 0.5f)
            assertEquals(normBase.points[i].y, normShifted.points[i].y, 0.5f)
        }
    }

    // ---- Scale invariance ----

    @Test
    fun testScaleNormalizationFitsBoundingBox() {
        val points = listOf(GesturePoint(0f, 0f), GesturePoint(500f, 0f), GesturePoint(250f, 500f))
        val scaled = GestureNormalizer.scaleToBoundingBox(points, GestureNormalizer.NORMALIZED_BOUNDING_SIZE)

        val width = scaled.maxOf { it.x } - scaled.minOf { it.x }
        val height = scaled.maxOf { it.y } - scaled.minOf { it.y }
        assertTrue(abs(maxOf(width, height) - GestureNormalizer.NORMALIZED_BOUNDING_SIZE) < 0.5f)
    }

    @Test
    fun testScaleInvariancePreservesAspectRatio() {
        val base = (0..50).map { GesturePoint(it.toFloat(), it.toFloat() * 2f) }
        val scaledUp = base.map { GesturePoint(it.x * 3f, it.y * 3f) }

        val normBase = GestureNormalizer.normalize(base)!!
        val normScaled = GestureNormalizer.normalize(scaledUp)!!

        for (i in normBase.points.indices) {
            assertEquals(normBase.points[i].x, normScaled.points[i].x, 1.0f)
            assertEquals(normBase.points[i].y, normScaled.points[i].y, 1.0f)
        }
    }

    // ---- Direction preservation ----

    @Test
    fun testDirectionIsPreservedNotSortedOrReversed() {
        val forward = listOf(GesturePoint(0f, 0f), GesturePoint(50f, 0f), GesturePoint(100f, 0f))
        val reversed = forward.reversed()

        val normForward = GestureNormalizer.normalize(forward)!!
        val normReversed = GestureNormalizer.normalize(reversed)!!

        // First resampled point should differ in x between the two directions.
        val diff = abs(normForward.points.first().x - normReversed.points.first().x)
        assertTrue("Expected direction-dependent difference, got identical first points", diff > 1f)
    }
}
