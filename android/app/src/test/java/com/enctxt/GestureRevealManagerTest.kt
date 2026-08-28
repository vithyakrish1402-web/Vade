package com.enctxt

import com.enctxt.core.gesture.GestureRepository
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.GestureRevealManager
import com.enctxt.core.gesture.RevealState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GestureRevealManagerTest {

    private lateinit var storage: FakeGestureStorage
    private lateinit var repository: GestureRepository
    private val userId = "user_alice"
    private val messageId = "msg_001"

    // Distinct shapes (not just translated copies of one shape — see GestureFixtures kdoc for
    // why that distinction matters and the empirically-verified separation margin).
    private val step0 = GestureFixtures.shapeL
    private val step1 = GestureFixtures.shapeU
    private val step2 = GestureFixtures.shapeZ
    private val wrongStroke = GestureFixtures.shapeN

    @Before
    fun setUp() {
        storage = FakeGestureStorage()
        repository = GestureRepository(storage)
        repository.saveSequence(userId, listOf(step0, step1, step2))
    }

    private fun RevealState.isRevealedFor(id: String) = this is RevealState.Revealed && messageId == id

    // ---- Correct / wrong sequence ----

    @Test
    fun testCorrectFullSequenceReveals() = runTest {
        val manager = GestureRevealManager(repository, userId, this)
        manager.startReveal(messageId)

        manager.submitStroke(step0)
        assertTrue(manager.state.value is RevealState.Authenticating)
        manager.submitStroke(step1)
        assertTrue(manager.state.value is RevealState.Authenticating)
        manager.submitStroke(step2)

        assertTrue(manager.state.value.isRevealedFor(messageId))
    }

    @Test
    fun testWrongOrderRestartsSequenceWithoutRevealing() = runTest {
        val manager = GestureRevealManager(repository, userId, this)
        manager.startReveal(messageId)

        manager.submitStroke(step1) // step0 expected, drew step1's shape
        val state = manager.state.value
        assertTrue(state is RevealState.Authenticating)
        assertEquals(0, (state as RevealState.Authenticating).step) // sequence restarted
        assertFalse(manager.state.value.isRevealedFor(messageId))
    }

    @Test
    fun testWrongGestureDoesNotReveal() = runTest {
        val manager = GestureRevealManager(repository, userId, this)
        manager.startReveal(messageId)
        manager.submitStroke(wrongStroke)
        assertFalse(manager.state.value.isRevealedFor(messageId))
    }

    @Test
    fun testPartialSequenceNeverReveals() = runTest {
        val manager = GestureRevealManager(repository, userId, this)
        manager.startReveal(messageId)
        manager.submitStroke(step0)
        manager.submitStroke(step1)
        // Stopped before step2 — must not be revealed under any circumstance.
        assertFalse(manager.state.value.isRevealedFor(messageId))
    }

    @Test
    fun testMismatchFeedbackIsGenericNeverIdentifiesWhichStepFailed() = runTest {
        val manager = GestureRevealManager(repository, userId, this)
        manager.startReveal(messageId)
        manager.submitStroke(wrongStroke)

        val fb = manager.feedback.value
        assertNotNull(fb)
        assertFalse(fb!!.contains("step 0", ignoreCase = true))
        assertFalse(fb.contains("distance", ignoreCase = true))
        assertFalse(fb.contains("similarity", ignoreCase = true))
    }

    // ---- Lockout ----

    @Test
    fun testFiveFailuresTriggersLockout() = runTest {
        val manager = GestureRevealManager(repository, userId, this)

        repeat(4) {
            manager.startReveal(messageId)
            manager.submitStroke(wrongStroke)
            assertTrue("Expected still-authenticating after failure #${it + 1}", manager.state.value is RevealState.Authenticating)
        }

        manager.startReveal(messageId)
        manager.submitStroke(wrongStroke) // 5th failure
        assertTrue(manager.state.value is RevealState.Locked)
        assertEquals(30, (manager.state.value as RevealState.Locked).remainingSeconds)
    }

    @Test
    fun testLockoutBlocksRevealAttemptsUntilExpiry() = runTest {
        val manager = GestureRevealManager(repository, userId, this)
        repeat(5) {
            manager.startReveal(messageId)
            manager.submitStroke(wrongStroke)
        }
        assertTrue(manager.state.value is RevealState.Locked)

        // Attempting to start a new reveal while locked is a no-op.
        manager.startReveal(messageId)
        assertTrue(manager.state.value is RevealState.Locked)

        advanceTimeBy(29_500)
        assertTrue("Should still be locked just before 30s", manager.state.value is RevealState.Locked)

        advanceTimeBy(1_000)
        advanceUntilIdle()
        assertEquals(RevealState.Protected, manager.state.value)
    }

    @Test
    fun testSuccessfulSequenceResetsFailedAttemptCounter() = runTest {
        val manager = GestureRevealManager(repository, userId, this)

        // 4 failures (not enough to lock), then a full correct sequence.
        repeat(4) {
            manager.startReveal(messageId)
            manager.submitStroke(wrongStroke)
        }
        manager.startReveal(messageId)
        manager.submitStroke(step0)
        manager.submitStroke(step1)
        manager.submitStroke(step2)
        assertTrue(manager.state.value.isRevealedFor(messageId))
        manager.hide()

        // Counter should be back at zero: 4 more failures must NOT lock (needs 5 fresh failures).
        repeat(4) {
            manager.startReveal(messageId)
            manager.submitStroke(wrongStroke)
        }
        assertTrue("Reset counter should tolerate 4 more failures without locking",
            manager.state.value is RevealState.Authenticating)
    }

    // ---- Reveal timer ----

    @Test
    fun testRevealAutoProtectsAfterTheRevealWindow() = runTest {
        val manager = GestureRevealManager(repository, userId, this)
        manager.startReveal(messageId)
        manager.submitStroke(step0)
        manager.submitStroke(step1)
        manager.submitStroke(step2)
        assertTrue(manager.state.value.isRevealedFor(messageId))

        advanceTimeBy((GestureRevealManager.REVEAL_DURATION_SECONDS - 1) * 1_000L + 500)
        assertTrue(
            "Should still be revealed just before the window closes",
            manager.state.value.isRevealedFor(messageId)
        )

        advanceTimeBy(1_000)
        advanceUntilIdle()
        assertEquals(RevealState.Protected, manager.state.value)
    }

    @Test
    fun testManualHideImmediatelyProtects() = runTest {
        val manager = GestureRevealManager(repository, userId, this)
        manager.startReveal(messageId)
        manager.submitStroke(step0)
        manager.submitStroke(step1)
        manager.submitStroke(step2)
        assertTrue(manager.state.value.isRevealedFor(messageId))

        manager.hide()
        assertEquals(RevealState.Protected, manager.state.value)

        // No extension/resurrection after the timer would have otherwise fired.
        advanceTimeBy(10_000)
        advanceUntilIdle()
        assertEquals(RevealState.Protected, manager.state.value)
    }

    // ---- Lifecycle revocation ----

    @Test
    fun testRevokeRevealDuringAuthenticationProtectsImmediately() = runTest {
        val manager = GestureRevealManager(repository, userId, this)
        manager.startReveal(messageId)
        manager.submitStroke(step0)
        assertTrue(manager.state.value is RevealState.Authenticating)

        manager.revokeReveal() // simulates background / window blur / navigation away
        assertEquals(RevealState.Protected, manager.state.value)
    }

    @Test
    fun testRevokeRevealDuringRevealedProtectsImmediately() = runTest {
        val manager = GestureRevealManager(repository, userId, this)
        manager.startReveal(messageId)
        manager.submitStroke(step0)
        manager.submitStroke(step1)
        manager.submitStroke(step2)
        assertTrue(manager.state.value.isRevealedFor(messageId))

        manager.revokeReveal()
        assertEquals(RevealState.Protected, manager.state.value)
    }

    @Test
    fun testRevokeRevealDoesNotShortenAnActiveLockout() = runTest {
        val manager = GestureRevealManager(repository, userId, this)
        repeat(5) {
            manager.startReveal(messageId)
            manager.submitStroke(wrongStroke)
        }
        assertTrue(manager.state.value is RevealState.Locked)

        manager.revokeReveal()
        // Lockout is a security control, not just a reveal — it must survive re-protection triggers.
        assertTrue(manager.state.value is RevealState.Locked)
    }

    @Test
    fun testFreshManagerAfterNavigationAlwaysStartsProtected() = runTest {
        val first = GestureRevealManager(repository, userId, this)
        first.startReveal(messageId)
        first.submitStroke(step0)
        first.submitStroke(step1)
        first.submitStroke(step2)
        assertTrue(first.state.value.isRevealedFor(messageId))
        first.dispose() // screen left composition

        // A new screen visit (and thus process-death / navigation-away) always starts clean.
        val second = GestureRevealManager(repository, userId, this)
        assertEquals(RevealState.Protected, second.state.value)
    }

    // ---- Unconfigured device ----

    @Test
    fun testStartRevealNoOpWhenGestureNotConfigured() = runTest {
        val unconfiguredRepo = GestureRepository(FakeGestureStorage())
        val manager = GestureRevealManager(unconfiguredRepo, userId, this)
        manager.startReveal(messageId)
        assertEquals(RevealState.Protected, manager.state.value)
    }
}
