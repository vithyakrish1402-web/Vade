package com.enctxt

import com.enctxt.core.gesture.GestureNormalizer
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.GestureRecognizer
import com.enctxt.core.gesture.GestureRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * The false-accept / false-reject matrix behind the recognizer's thresholds.
 *
 * The thresholds used to sit at 28/30, where roughly one in nine distinct-shape pairs matched
 * each other — a wrong gesture could unlock a message. These cases pin the separation that
 * justifies 14/15, so a future "users complain it's fussy, bump the threshold" change has to
 * confront the security cost rather than silently reintroduce it.
 */
class GestureDiscriminationTest {

    private fun poly(vararg corners: Pair<Float, Float>): List<GesturePoint> {
        val out = mutableListOf<GesturePoint>()
        for (segment in 0 until corners.size - 1) {
            val (x0, y0) = corners[segment]
            val (x1, y1) = corners[segment + 1]
            for (i in 0..40) {
                val t = i / 40f
                out.add(GesturePoint(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
            }
        }
        return out
    }

    /** Distinct shapes a person might plausibly choose, all with at least one turn. */
    private val shapes: Map<String, List<GesturePoint>> = mapOf(
        "L" to poly(40f to 40f, 40f to 230f, 230f to 230f),
        "check" to poly(50f to 140f, 110f to 210f, 230f to 60f),
        "Z" to poly(40f to 40f, 230f to 40f, 40f to 230f, 230f to 230f),
        "N" to poly(40f to 230f, 40f to 40f, 230f to 230f, 230f to 40f),
        "triangle" to poly(140f to 40f, 230f to 220f, 50f to 220f, 140f to 40f),
        "U" to poly(50f to 40f, 50f to 220f, 220f to 220f, 220f to 40f),
        "circle" to (0..100).map {
            val a = it / 100f * 2f * Math.PI.toFloat()
            GesturePoint(140f + 90f * cos(a), 140f + 90f * sin(a))
        },
        "S" to (0..80).map {
            val t = it / 80f
            GesturePoint(40f + 200f * t, 140f + 80f * sin(t * 2f * Math.PI.toFloat()))
        }
    )

    /** A genuine redraw: different position, different size, hand wobble. */
    private fun redraw(base: List<GesturePoint>, wobble: Float, seed: Int): List<GesturePoint> {
        val rng = Random(seed)
        val dx = (rng.nextFloat() - 0.5f) * 60f
        val dy = (rng.nextFloat() - 0.5f) * 60f
        val scale = 1f + (rng.nextFloat() - 0.5f) * 0.5f
        return base.map {
            GesturePoint(
                it.x * scale + dx + (rng.nextFloat() - 0.5f) * 2f * wobble,
                it.y * scale + dy + (rng.nextFloat() - 0.5f) * 2f * wobble
            )
        }
    }

    private fun matches(drawn: List<GesturePoint>, enrolled: List<GesturePoint>): Boolean {
        val template = GestureNormalizer.normalize(enrolled) ?: return false
        return GestureRecognizer.isMatch(drawn, template)
    }

    @Test
    fun noDistinctShapeUnlocksAnother() {
        val names = shapes.keys.toList()
        val accepted = mutableListOf<String>()

        for (enrolled in names) {
            for (attacker in names) {
                if (enrolled == attacker) continue
                if (matches(shapes[attacker]!!, shapes[enrolled]!!)) {
                    accepted.add("$attacker unlocked $enrolled")
                }
            }
        }

        assertTrue("Wrong shapes must never unlock: $accepted", accepted.isEmpty())
    }

    @Test
    fun genuineRedrawsAreAcceptedEvenWhenUntidy() {
        var attempts = 0
        var rejected = 0

        for ((_, base) in shapes) {
            for (seed in 1..15) {
                for (wobble in listOf(4f, 9f, 14f)) {
                    attempts++
                    if (!matches(redraw(base, wobble, seed * 37 + wobble.toInt()), base)) rejected++
                }
            }
        }

        // A little strictness is the price of zero false accepts, but the flow must stay usable:
        // reveal asks for three strokes, so a high per-stroke reject rate compounds badly.
        val rate = rejected * 100.0 / attempts
        assertTrue("False-reject rate too high for a 3-stroke reveal: %.1f%%".format(rate), rate <= 5.0)
    }

    @Test
    fun straightLinesAreRefusedAtEnrollment() {
        val lines = mapOf(
            "horizontal" to poly(40f to 140f, 240f to 140f),
            "vertical" to poly(140f to 40f, 140f to 240f),
            "diagonal" to poly(50f to 50f, 230f to 230f),
            "reverse diagonal" to poly(230f to 50f, 50f to 230f)
        )

        lines.forEach { (name, line) ->
            assertFalse("$name should be refused as a gesture", GestureNormalizer.isDistinctiveShape(line))
        }

        // And every shape a person would actually pick still passes.
        shapes.forEach { (name, shape) ->
            assertTrue("$name should be allowed", GestureNormalizer.isDistinctiveShape(shape))
        }
    }

    @Test
    fun theRepositoryRefusesToPersistAStraightLine() {
        val storage = FakeGestureStorage()
        val repository = GestureRepository(storage)

        assertFalse(repository.saveSequence("user", listOf(poly(40f to 140f, 240f to 140f))))
        assertFalse("Nothing may be written", repository.isConfigured("user"))

        assertTrue(repository.saveSequence("user", listOf(shapes["L"]!!)))
        assertEquals(1, repository.sequenceLength("user"))
    }
}
