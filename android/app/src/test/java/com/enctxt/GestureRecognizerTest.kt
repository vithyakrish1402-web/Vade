package com.enctxt

import com.enctxt.core.gesture.GestureNormalizer
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.GestureRecognizer
import org.junit.Assert.*
import org.junit.Test

class GestureRecognizerTest {

    /** A simple "U" shape: down, across, up. */
    private fun uShape(offsetX: Float = 0f, offsetY: Float = 0f, scale: Float = 1f): List<GesturePoint> {
        val raw = mutableListOf<GesturePoint>()
        for (i in 0..20) raw.add(GesturePoint(0f, i * 5f)) // down
        for (i in 0..20) raw.add(GesturePoint(i * 5f, 100f)) // across
        for (i in 0..20) raw.add(GesturePoint(100f, 100f - i * 5f)) // up
        return raw.map { GesturePoint(it.x * scale + offsetX, it.y * scale + offsetY) }
    }

    /** An unrelated triangle-ish shape, clearly geometrically different from [uShape]. */
    private fun triangleShape(): List<GesturePoint> {
        val raw = mutableListOf<GesturePoint>()
        for (i in 0..20) raw.add(GesturePoint(i * 5f, i * 5f)) // diagonal down-right
        for (i in 0..20) raw.add(GesturePoint(100f - i * 5f, 100f)) // across left
        for (i in 0..20) raw.add(GesturePoint(0f, 100f - i * 5f)) // up
        return raw
    }

    @Test
    fun testIdenticalGestureMatches() {
        val enrolled = GestureNormalizer.normalize(uShape())!!
        val drawn = uShape()
        assertTrue(GestureRecognizer.isMatch(drawn, enrolled))
    }

    @Test
    fun testTranslatedGestureMatches() {
        val enrolled = GestureNormalizer.normalize(uShape())!!
        val drawnElsewhere = uShape(offsetX = 300f, offsetY = 400f)
        assertTrue(GestureRecognizer.isMatch(drawnElsewhere, enrolled))
    }

    @Test
    fun testScaledGestureMatches() {
        val enrolled = GestureNormalizer.normalize(uShape())!!
        val drawnBigger = uShape(scale = 2.5f)
        assertTrue(GestureRecognizer.isMatch(drawnBigger, enrolled))
    }

    @Test
    fun testSimilarButImperfectDrawingMatches() {
        val enrolled = GestureNormalizer.normalize(uShape())!!
        // Slight jitter added to every point, still recognizably the same U shape.
        val jittered = uShape().mapIndexed { i, p ->
            GesturePoint(p.x + (if (i % 2 == 0) 1.5f else -1.5f), p.y + (if (i % 3 == 0) 1f else -1f))
        }
        assertTrue(GestureRecognizer.isMatch(jittered, enrolled))
    }

    @Test
    fun testDifferentShapeRejected() {
        val enrolled = GestureNormalizer.normalize(uShape())!!
        val drawn = triangleShape()
        assertFalse(GestureRecognizer.isMatch(drawn, enrolled))
    }

    @Test
    fun testReversedDirectionRejected() {
        val enrolled = GestureNormalizer.normalize(uShape())!!
        val drawnReversed = uShape().reversed()
        assertFalse(GestureRecognizer.isMatch(drawnReversed, enrolled))
    }

    @Test
    fun testInvalidDrawnStrokeNeverMatches() {
        val enrolled = GestureNormalizer.normalize(uShape())!!
        val tinyTap = listOf(GesturePoint(0f, 0f), GesturePoint(1f, 1f))
        assertFalse(GestureRecognizer.isMatch(tinyTap, enrolled))
    }

    @Test
    fun testEnrollmentDrawingsMustMatchToConfirm() {
        val first = uShape()
        val secondCloseEnough = uShape().mapIndexed { i, p ->
            GesturePoint(p.x + (if (i % 2 == 0) 1f else -1f), p.y)
        }
        assertTrue(GestureRecognizer.enrollmentDrawingsMatch(first, secondCloseEnough))
    }

    @Test
    fun testEnrollmentDrawingsRejectedWhenDifferentShapes() {
        assertFalse(GestureRecognizer.enrollmentDrawingsMatch(uShape(), triangleShape()))
    }

    @Test
    fun testSimilarityScoreIsBoundedAndMonotonic() {
        val enrolled = GestureNormalizer.normalize(uShape())!!
        val identical = GestureNormalizer.normalize(uShape())!!
        val different = GestureNormalizer.normalize(triangleShape())!!

        val highSimilarity = GestureRecognizer.similarity(enrolled, identical)
        val lowSimilarity = GestureRecognizer.similarity(enrolled, different)

        assertTrue(highSimilarity in 0f..1f)
        assertTrue(lowSimilarity in 0f..1f)
        assertTrue(highSimilarity > lowSimilarity)
    }
}
