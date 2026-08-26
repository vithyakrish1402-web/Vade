package com.enctxt.core.gesture

import java.time.Instant

/**
 * Domain-level API over [GestureStorage]: normalizes raw enrollment strokes, converts between
 * the [GestureSequence] domain model and the wire DTOs, and verifies authentication attempts.
 *
 * Every operation is local-only and scoped by userId (multiple accounts on one device do not
 * share a gesture sequence). Nothing here ever touches the network.
 */
class GestureRepository(private val storage: GestureStorage) {

    fun isStorageAvailable(): Boolean = storage.isAvailable()

    fun isConfigured(userId: String): Boolean = loadSequence(userId) != null

    fun sequenceLength(userId: String): Int = loadSequence(userId)?.length ?: 0

    /**
     * Normalizes each raw enrollment step and persists them as the new gesture sequence.
     * Returns false (and leaves any existing sequence untouched) if normalization fails for
     * any step, the step count is out of range, or storage is unavailable/fails — enrollment
     * replacement must never destroy a valid old gesture on a failed attempt.
     */
    fun saveSequence(userId: String, rawSteps: List<List<GesturePoint>>): Boolean {
        if (userId.isBlank()) return false
        if (rawSteps.size !in GestureSequence.MIN_SEQUENCE_LENGTH..GestureSequence.MAX_SEQUENCE_LENGTH) return false
        if (!storage.isAvailable()) return false

        val templates = rawSteps.map { GestureNormalizer.normalize(it) ?: return false }

        val now = Instant.now().toString()
        val dto = StoredGestureSequenceDto(
            version = GestureSequence.SCHEMA_VERSION,
            sequence = templates.map { template ->
                StoredGestureStepDto(template.points.map { StoredGesturePointDto(it.x, it.y) })
            },
            createdAt = now,
            updatedAt = now
        )

        return storage.save(userId, dto)
    }

    /**
     * Verifies a freshly drawn stroke against the enrolled template at [stepIndex].
     * Returns false (never throws) if unconfigured, the index is out of range, storage is
     * corrupted/unavailable, or the stroke doesn't match — all of these fail closed identically
     * from the caller's perspective.
     */
    fun verifyStep(userId: String, stepIndex: Int, rawPoints: List<GesturePoint>): Boolean {
        val sequence = loadSequence(userId) ?: return false
        val template = sequence.templates.getOrNull(stepIndex) ?: return false
        return GestureRecognizer.isMatch(rawPoints, template)
    }

    fun deleteSequence(userId: String) {
        if (userId.isBlank()) return
        storage.delete(userId)
    }

    private fun loadSequence(userId: String): GestureSequence? {
        if (userId.isBlank()) return null
        val dto = storage.load(userId) ?: return null

        val templates = dto.sequence.map { step ->
            GestureTemplate(step.points.map { GesturePoint(it.x, it.y) })
        }

        val sequence = GestureSequence(
            version = dto.version,
            templates = templates,
            createdAt = dto.createdAt,
            updatedAt = dto.updatedAt
        )

        return if (sequence.isValid()) sequence else null
    }
}
