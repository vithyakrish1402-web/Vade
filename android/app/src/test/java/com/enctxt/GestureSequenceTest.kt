package com.enctxt

import com.enctxt.core.gesture.GestureNormalizer
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.GestureRecordSerializer
import com.enctxt.core.gesture.GestureRepository
import com.enctxt.core.gesture.GestureSequence
import com.enctxt.core.gesture.GestureStorage
import com.enctxt.core.gesture.StoredGesturePointDto
import com.enctxt.core.gesture.StoredGestureSequenceDto
import com.enctxt.core.gesture.StoredGestureStepDto
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/** In-memory [GestureStorage] test double — never touches Android/EncryptedSharedPreferences. */
class FakeGestureStorage(private var available: Boolean = true) : GestureStorage {
    private val store = mutableMapOf<String, StoredGestureSequenceDto>()
    private val rawOverride = mutableMapOf<String, String>()

    override fun isAvailable(): Boolean = available
    fun setAvailable(value: Boolean) { available = value }

    override fun save(userId: String, sequence: StoredGestureSequenceDto): Boolean {
        if (!available) return false
        store[userId] = sequence
        rawOverride.remove(userId)
        return true
    }

    override fun load(userId: String): StoredGestureSequenceDto? {
        if (!available) return null
        rawOverride[userId]?.let { raw -> return GestureRecordSerializer.decode(raw) }
        return store[userId]
    }

    override fun delete(userId: String) {
        store.remove(userId)
        rawOverride.remove(userId)
    }

    /** Simulates corrupted JSON on disk for [userId]. */
    fun corrupt(userId: String) {
        rawOverride[userId] = "{ not valid json !!"
    }
}

/**
 * Distinct unistroke test fixtures — deliberately different *shapes* (not just translated
 * copies of the same shape, which would normalize identically and defeat "wrong gesture"
 * assertions). Pairwise average normalized distance between every pair below is >= 37, well
 * clear of the 28.0 match threshold; verified empirically before writing these tests.
 */
object GestureFixtures {
    private fun linePts(x0: Float, y0: Float, x1: Float, y1: Float, n: Int = 20): List<GesturePoint> =
        (0..n).map { i -> GesturePoint(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) }

    private fun polyPts(vararg segs: List<Float>, n: Int = 20): List<GesturePoint> =
        segs.flatMap { s -> linePts(s[0], s[1], s[2], s[3], n) }

    /** Down then right. */
    val shapeL = polyPts(listOf(0f, 0f, 0f, 100f), listOf(0f, 100f, 100f, 100f))

    /** Down, right, up — a "U". */
    val shapeU = polyPts(listOf(0f, 0f, 0f, 100f), listOf(0f, 100f, 100f, 100f), listOf(100f, 100f, 100f, 0f))

    /** Right, diagonal, right — a "Z". */
    val shapeZ = polyPts(listOf(0f, 0f, 100f, 0f), listOf(100f, 0f, 0f, 100f), listOf(0f, 100f, 100f, 100f))

    /** Down, diagonal, down — an "N". */
    val shapeN = polyPts(listOf(0f, 0f, 0f, 100f), listOf(0f, 100f, 100f, 0f), listOf(100f, 0f, 100f, 100f))

    /** Diagonal, left, up — a triangle. */
    val shapeTriangle = polyPts(listOf(0f, 0f, 100f, 100f), listOf(100f, 100f, 0f, 100f), listOf(0f, 100f, 0f, 0f))

    val fiveDistinctShapes = listOf(shapeL, shapeU, shapeZ, shapeN, shapeTriangle)
}

class GestureSequenceTest {

    private lateinit var storage: FakeGestureStorage
    private lateinit var repository: GestureRepository
    private val userId = "user_alice"

    private val shapeL = GestureFixtures.shapeL
    private val shapeU = GestureFixtures.shapeU
    private val shapeZ = GestureFixtures.shapeZ
    private val shapeN = GestureFixtures.shapeN

    @Before
    fun setUp() {
        storage = FakeGestureStorage()
        repository = GestureRepository(storage)
    }

    // ---- Enrollment ----

    @Test
    fun testEnrollmentSavesDefaultThreeStepSequence() {
        val steps = listOf(shapeL, shapeU, shapeZ)
        assertTrue(repository.saveSequence(userId, steps))
        assertTrue(repository.isConfigured(userId))
        assertEquals(3, repository.sequenceLength(userId))
    }

    @Test
    fun testEnrollmentSupportsTwoToFiveSteps() {
        for (n in GestureSequence.MIN_SEQUENCE_LENGTH..GestureSequence.MAX_SEQUENCE_LENGTH) {
            val fresh = GestureRepository(FakeGestureStorage())
            val steps = GestureFixtures.fiveDistinctShapes.take(n)
            assertTrue("Expected $n-step sequence to save", fresh.saveSequence(userId, steps))
            assertEquals(n, fresh.sequenceLength(userId))
        }
    }

    @Test
    fun testEnrollmentAcceptsASingleShape() {
        // Enrollment records one shape; reveal asks for it three times. This previously
        // returned false, which stranded the user on the confirm step forever.
        assertTrue(repository.saveSequence(userId, listOf(shapeL)))
        assertEquals(1, repository.sequenceLength(userId))
    }

    @Test
    fun testEnrollmentRejectsOutOfRangeStepCount() {
        assertFalse(repository.saveSequence(userId, emptyList())) // no steps at all
        assertFalse(
            repository.saveSequence(
                userId,
                GestureFixtures.fiveDistinctShapes + listOf(shapeL)
            ) // 6 steps, above max
        )
    }

    @Test
    fun testEnrollmentRejectsInvalidStroke() {
        val tinyTap = listOf(GesturePoint(0f, 0f), GesturePoint(1f, 1f))
        val steps = listOf(shapeL, tinyTap, shapeZ)
        assertFalse(repository.saveSequence(userId, steps))
        assertFalse(repository.isConfigured(userId)) // nothing partially saved
    }

    @Test
    fun testFailedEnrollmentReplacementPreservesOldGesture() {
        val original = listOf(shapeL, shapeU, shapeZ)
        assertTrue(repository.saveSequence(userId, original))

        // Attempt to replace with an invalid new sequence (a tap is not a valid stroke).
        val badReplacement = listOf(shapeN, listOf(GesturePoint(0f, 0f)))
        assertFalse(repository.saveSequence(userId, badReplacement))

        // Old gesture must still verify correctly.
        assertTrue(repository.isConfigured(userId))
        assertEquals(3, repository.sequenceLength(userId))
        assertTrue(repository.verifyStep(userId, 0, shapeL))
    }

    // ---- Sequence / order matters ----

    @Test
    fun testCorrectSequenceInOrderSucceeds() {
        repository.saveSequence(userId, listOf(shapeL, shapeU, shapeZ))

        assertTrue(repository.verifyStep(userId, 0, shapeL))
        assertTrue(repository.verifyStep(userId, 1, shapeU))
        assertTrue(repository.verifyStep(userId, 2, shapeZ))
    }

    @Test
    fun testWrongOrderFailsAtEachStep() {
        repository.saveSequence(userId, listOf(shapeL, shapeU, shapeZ))

        // Drawing step 1's shape when step 0 is expected must fail, and so on.
        assertFalse(repository.verifyStep(userId, 0, shapeU))
        assertFalse(repository.verifyStep(userId, 1, shapeZ))
        assertFalse(repository.verifyStep(userId, 2, shapeL))
    }

    @Test
    fun testWrongGestureFailsVerification() {
        repository.saveSequence(userId, listOf(shapeL, shapeU))
        assertFalse(repository.verifyStep(userId, 0, shapeN))
    }

    @Test
    fun testPartialSequenceAloneIsInsufficient() {
        // Verifying step 0 correctly says nothing about full-sequence authorization — that
        // composition is GestureRevealManager's responsibility. This only confirms step-by-step
        // verification never short-circuits into "fully authenticated".
        repository.saveSequence(userId, listOf(shapeL, shapeU, shapeZ))
        assertTrue(repository.verifyStep(userId, 0, shapeL))
        // Step 1 still requires its own correct gesture — step 0 success grants nothing here.
        assertFalse(repository.verifyStep(userId, 1, shapeL))
    }

    // ---- Storage: versioning & corruption ----

    @Test
    fun testUnsupportedVersionIsIgnored() {
        val badVersionDto = StoredGestureSequenceDto(
            version = 999,
            sequence = listOf(),
            createdAt = "now",
            updatedAt = "now"
        )
        storage.save(userId, badVersionDto)
        assertFalse(repository.isConfigured(userId))
    }

    @Test
    fun testCorruptedStorageFailsClosed() {
        repository.saveSequence(userId, listOf(shapeL, shapeU))
        storage.corrupt(userId)

        assertFalse(repository.isConfigured(userId))
        assertFalse(repository.verifyStep(userId, 0, shapeL))
    }

    @Test
    fun testUnavailableStorageFailsClosedOnSave() {
        storage.setAvailable(false)
        assertFalse(repository.saveSequence(userId, listOf(shapeL, shapeU)))
        assertFalse(repository.isConfigured(userId))
    }

    @Test
    fun testDeleteRemovesConfiguration() {
        repository.saveSequence(userId, listOf(shapeL, shapeU))
        assertTrue(repository.isConfigured(userId))

        repository.deleteSequence(userId)
        assertFalse(repository.isConfigured(userId))
    }

    @Test
    fun testSerializerRoundTrip() {
        val template = GestureNormalizer.normalize(shapeL)!!
        val dto = StoredGestureSequenceDto(
            version = GestureSequence.SCHEMA_VERSION,
            sequence = listOf(
                StoredGestureStepDto(template.points.map { StoredGesturePointDto(it.x, it.y) })
            ),
            createdAt = "2026-08-26T00:00:00Z",
            updatedAt = "2026-08-26T00:00:00Z"
        )
        val encoded = GestureRecordSerializer.encode(dto)
        val decoded = GestureRecordSerializer.decode(encoded)
        assertNotNull(decoded)
        assertEquals(dto.version, decoded!!.version)
        assertEquals(dto.sequence.size, decoded.sequence.size)
    }

    @Test
    fun testSerializerRejectsGarbageJson() {
        assertNull(GestureRecordSerializer.decode("not json at all"))
    }
}
