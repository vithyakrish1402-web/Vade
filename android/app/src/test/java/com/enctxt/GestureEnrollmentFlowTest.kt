package com.enctxt

import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.GestureRepository
import com.enctxt.presentation.components.EnrollmentPhase
import com.enctxt.presentation.components.GestureEnrollmentViewModel
import com.enctxt.presentation.components.MAX_CONFIRM_ATTEMPTS
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Drives [GestureEnrollmentViewModel] the way the screen does.
 *
 * The existing gesture tests all called [GestureRepository.saveSequence] with a multi-step
 * sequence, so none of them noticed that the single-shape enrollment introduced with the
 * redesign was rejected by the repository's length check. Enrollment is now covered end to
 * end — draw, confirm, persist — rather than only at the layers underneath it.
 */
class GestureEnrollmentFlowTest {

    private lateinit var storage: FakeGestureStorage
    private lateinit var repository: GestureRepository
    private lateinit var viewModel: GestureEnrollmentViewModel
    private val userId = "user_friend"

    /** A shape long enough to clear the memorability floor, drawn on a 280dp pad. */
    private fun shape(offsetX: Float = 0f, offsetY: Float = 0f, jitter: Float = 0f): List<GesturePoint> {
        val corners = listOf(40f to 40f, 40f to 230f, 230f to 230f)
        val out = mutableListOf<GesturePoint>()
        for (segment in 0 until corners.size - 1) {
            val (x0, y0) = corners[segment]
            val (x1, y1) = corners[segment + 1]
            for (step in 0..40) {
                val t = step / 40f
                val wobble = if (jitter == 0f) 0f else ((step % 5) - 2) * jitter / 2f
                out.add(GesturePoint(x0 + (x1 - x0) * t + offsetX + wobble, y0 + (y1 - y0) * t + offsetY))
            }
        }
        return out
    }

    /** Deliberately unlike [shape]: a horizontal line. */
    private fun differentShape(): List<GesturePoint> =
        (0..80).map { GesturePoint(40f + 200f * it / 80f, 60f) }

    @Before
    fun setUp() {
        storage = FakeGestureStorage()
        repository = GestureRepository(storage)
        viewModel = GestureEnrollmentViewModel(repository, userId)
    }

    @Test
    fun enrollingASingleShapePersistsIt() {
        viewModel.onStroke(shape())
        assertEquals(EnrollmentPhase.CONFIRM, viewModel.uiState.value.phase)
        assertFalse(viewModel.uiState.value.isError)

        // A careful redraw: same shape, slightly offset and wobbled.
        viewModel.onStroke(shape(offsetX = 8f, offsetY = -5f, jitter = 3f))

        assertTrue(
            "Confirming the shape must persist it — this is the step that silently failed",
            viewModel.uiState.value.isComplete
        )
        assertFalse(viewModel.uiState.value.isError)
        assertTrue(repository.isConfigured(userId))
        assertEquals(1, repository.sequenceLength(userId))
    }

    @Test
    fun theEnrolledShapeVerifiesAfterwards() {
        viewModel.onStroke(shape())
        viewModel.onStroke(shape(offsetX = 8f, offsetY = -5f, jitter = 3f))

        assertTrue(
            "A gesture that enrolled must also unlock, or the account is locked out of itself",
            repository.verifyStep(userId, 0, shape(offsetX = -6f, offsetY = 10f, jitter = 4f))
        )
    }

    @Test
    fun aMismatchedConfirmKeepsTheRecordedShapeAndRetriesInPlace() {
        viewModel.onStroke(shape())
        viewModel.onStroke(differentShape())

        val state = viewModel.uiState.value
        assertTrue(state.isError)
        assertFalse(state.isComplete)
        assertEquals("Retry happens in place, still on the confirm step", EnrollmentPhase.CONFIRM, state.phase)
        assertFalse("Nothing may be written on a failed confirmation", repository.isConfigured(userId))

        // The originally recorded shape is still the one being confirmed against.
        viewModel.onStroke(shape(offsetX = 5f, jitter = 2f))
        assertTrue(viewModel.uiState.value.isComplete)
    }

    @Test
    fun failureMessagesNeverRevealHowCloseTheAttemptWas() {
        viewModel.onStroke(shape())
        viewModel.onStroke(differentShape())

        val message = viewModel.uiState.value.statusMessage.orEmpty().lowercase()
        assertTrue(message.isNotEmpty())
        listOf("distance", "score", "%", "close", "step 1", "attempt").forEach { leak ->
            assertFalse("Feedback must not leak '$leak': $message", message.contains(leak))
        }
    }

    @Test
    fun afterThreeMissesTheUserIsOfferedAFreshStart() {
        viewModel.onStroke(shape())
        repeat(MAX_CONFIRM_ATTEMPTS) { viewModel.onStroke(differentShape()) }

        assertEquals(MAX_CONFIRM_ATTEMPTS, viewModel.uiState.value.attempts)
        assertTrue(
            viewModel.uiState.value.statusMessage.orEmpty().contains("start over", ignoreCase = true)
        )
    }

    @Test
    fun aStrokeTooShortToBeMemorableIsRejectedBeforeAnythingIsRecorded() {
        viewModel.onStroke(listOf(GesturePoint(10f, 10f), GesturePoint(20f, 14f)))

        assertTrue(viewModel.uiState.value.isError)
        assertEquals(
            "A rejected stroke must not advance the flow",
            EnrollmentPhase.DRAW,
            viewModel.uiState.value.phase
        )
    }

    @Test
    fun storageFailureIsReportedRatherThanSilentlyLeavingTheUserOnTheConfirmStep() {
        storage.setAvailable(false)

        viewModel.onStroke(shape())
        viewModel.onStroke(shape(offsetX = 8f, jitter = 3f))

        val state = viewModel.uiState.value
        assertFalse(state.isComplete)
        assertTrue(state.isError)
        assertTrue(state.statusMessage.orEmpty().contains("save", ignoreCase = true))
    }
}
