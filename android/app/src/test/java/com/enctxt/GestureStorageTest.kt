package com.enctxt

import com.enctxt.core.gesture.GestureNormalizer
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.GestureRecordSerializer
import com.enctxt.core.gesture.GestureSequence
import com.enctxt.core.gesture.GestureStorage
import com.enctxt.core.gesture.StoredGesturePointDto
import com.enctxt.core.gesture.StoredGestureSequenceDto
import com.enctxt.core.gesture.StoredGestureStepDto
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Storage and serialization tests for Layer 3 Custom Gesture Persistence.
 * Verifies save, load, replace, delete, schema versioning, corruption fail-closed,
 * and structural validation rules.
 */
class GestureStorageTest {

    private lateinit var storage: FakeGestureStorage
    private val userId = "test_user_storage"

    private fun sampleDto(version: Int = GestureSequence.SCHEMA_VERSION, numSteps: Int = 3): StoredGestureSequenceDto {
        val steps = (1..numSteps).map { stepIdx ->
            val points = (0..20).map { ptIdx ->
                StoredGesturePointDto(ptIdx * 5f, stepIdx * 10f)
            }
            StoredGestureStepDto(points)
        }
        return StoredGestureSequenceDto(
            version = version,
            sequence = steps,
            createdAt = "2026-08-26T12:00:00Z",
            updatedAt = "2026-08-26T12:00:00Z"
        )
    }

    @Before
    fun setUp() {
        storage = FakeGestureStorage()
    }

    @Test
    fun testSaveAndLoadGestureSequence() {
        val dto = sampleDto()
        assertTrue(storage.save(userId, dto))

        val loaded = storage.load(userId)
        assertNotNull(loaded)
        assertEquals(dto.version, loaded!!.version)
        assertEquals(dto.sequence.size, loaded.sequence.size)
        assertEquals(dto.createdAt, loaded.createdAt)
        assertEquals(dto.updatedAt, loaded.updatedAt)
    }

    @Test
    fun testReplaceExistingGestureSequence() {
        val original = sampleDto(numSteps = 3)
        assertTrue(storage.save(userId, original))
        assertEquals(3, storage.load(userId)!!.sequence.size)

        val updated = sampleDto(numSteps = 4).copy(updatedAt = "2026-08-26T13:00:00Z")
        assertTrue(storage.save(userId, updated))

        val loaded = storage.load(userId)
        assertNotNull(loaded)
        assertEquals(4, loaded!!.sequence.size)
        assertEquals("2026-08-26T13:00:00Z", loaded.updatedAt)
    }

    @Test
    fun testDeleteGestureSequence() {
        val dto = sampleDto()
        assertTrue(storage.save(userId, dto))
        assertNotNull(storage.load(userId))

        storage.delete(userId)
        assertNull(storage.load(userId))
    }

    @Test
    fun testCorruptedStorageFailsClosed() {
        val dto = sampleDto()
        assertTrue(storage.save(userId, dto))

        storage.corrupt(userId)
        val loaded = storage.load(userId)
        assertNull("Corrupted storage record must fail closed and return null", loaded)
    }

    @Test
    fun testUnsupportedVersionRejectsLoad() {
        val badVersionDto = sampleDto(version = 2) // Future version
        val encoded = GestureRecordSerializer.encode(badVersionDto)
        val decoded = GestureRecordSerializer.decode(encoded)
        assertNull("Non-version-1 records must be rejected (no migration/downgrade)", decoded)
    }

    @Test
    fun testVersionZeroRejectsLoad() {
        val badVersionDto = sampleDto(version = 0)
        val encoded = GestureRecordSerializer.encode(badVersionDto)
        val decoded = GestureRecordSerializer.decode(encoded)
        assertNull("Version 0 records must be rejected", decoded)
    }

    @Test
    fun testEmptySequenceRejectsLoad() {
        val emptySeqDto = StoredGestureSequenceDto(
            version = 1,
            sequence = emptyList(),
            createdAt = "2026-08-26T00:00:00Z",
            updatedAt = "2026-08-26T00:00:00Z"
        )
        val encoded = GestureRecordSerializer.encode(emptySeqDto)
        assertNull("Empty sequence must fail closed", GestureRecordSerializer.decode(encoded))
    }

    @Test
    fun testExceedingMaxSequenceLengthRejectsLoad() {
        val oversizedDto = sampleDto(numSteps = 6) // Max is 5
        val encoded = GestureRecordSerializer.encode(oversizedDto)
        assertNull("Sequences > 5 steps must fail closed", GestureRecordSerializer.decode(encoded))
    }

    @Test
    fun testUnderPopulatedStepPointsRejectsLoad() {
        // Step with fewer than 10 points is invalid
        val badStepDto = StoredGestureSequenceDto(
            version = 1,
            sequence = listOf(
                StoredGestureStepDto(listOf(StoredGesturePointDto(0f, 0f), StoredGesturePointDto(1f, 1f)))
            ),
            createdAt = "2026-08-26T00:00:00Z",
            updatedAt = "2026-08-26T00:00:00Z"
        )
        val encoded = GestureRecordSerializer.encode(badStepDto)
        assertNull("Steps with < 10 points must fail closed", GestureRecordSerializer.decode(encoded))
    }

    @Test
    fun testStorageUnavailableFailsClosed() {
        storage.setAvailable(false)
        assertFalse(storage.isAvailable())
        assertFalse(storage.save(userId, sampleDto()))
        assertNull(storage.load(userId))
    }

    @Test
    fun testMalformedJsonStringsFailClosed() {
        val malformedStrings = listOf(
            "",
            "{",
            "{\"version\":1}",
            "{\"version\":1,\"sequence\":null}",
            "{\"version\":1,\"sequence\":[{\"points\":[]}]}",
            "{\"version\":1,\"sequence\":[{\"points\":[{\"x\":\"not_a_float\"}]}]}",
            "random junk content"
        )
        for (str in malformedStrings) {
            val res = GestureRecordSerializer.decode(str)
            assertNull("Malformed JSON '$str' must decode to null", res)
        }
    }
}
