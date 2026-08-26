package com.enctxt

import com.enctxt.core.security.*
import com.enctxt.core.storage.EncryptedMessageEntity
import com.enctxt.core.sync.MessageStateReconciler
import com.enctxt.data.model.EncryptedEnvelopeDto
import com.enctxt.data.model.MessageItemDto
import com.enctxt.data.model.MessageLocalState
import org.junit.Assert.*
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec
import java.util.UUID

class MessagingReliabilityTest {

    private fun generateTestEcKeyPair(): java.security.KeyPair {
        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        return kpg.generateKeyPair()
    }

    @Test
    fun testMonotonicStateProgression() {
        // 1. Initial State: SENDING
        var state = MessageLocalState.SENDING

        // 2. Advance to SENT
        state = MessageStateReconciler.reconcileDeliveryState(state, "sent")
        assertEquals(MessageLocalState.SENT, state)

        // 3. Advance to DELIVERED
        state = MessageStateReconciler.reconcileDeliveryState(state, "delivered")
        assertEquals(MessageLocalState.DELIVERED, state)

        // 4. Advance to READ
        state = MessageStateReconciler.reconcileDeliveryState(state, "read")
        assertEquals(MessageLocalState.READ, state)

        // 5. Out-of-order frame: Late DELIVERED must NOT regress READ
        val outOfOrderState = MessageStateReconciler.reconcileDeliveryState(state, "delivered")
        assertEquals(MessageLocalState.READ, outOfOrderState)

        // 6. Out-of-order frame: Late SENT must NOT regress READ
        val lateSentState = MessageStateReconciler.reconcileDeliveryState(state, "sent")
        assertEquals(MessageLocalState.READ, lateSentState)
    }

    @Test
    fun testServerDtoMergeDeduplication() {
        val serverMessageId = "msg_srv_12345"
        val conversationId = "conv_test_001"
        val senderId = "user_alice"

        val dto = MessageItemDto(
            id = serverMessageId,
            conversationId = conversationId,
            senderId = senderId,
            ciphertext = "ciphertext_data",
            nonce = "nonce_12_bytes",
            senderKeyId = "k_alice",
            recipientKeyId = "k_bob",
            status = "delivered",
            createdAt = "2026-08-26T10:00:00Z",
            updatedAt = "2026-08-26T10:01:00Z"
        )

        val existingEntity = EncryptedMessageEntity(
            localId = "local_uuid_001",
            serverMessageId = serverMessageId,
            clientTempId = "temp_uuid_001",
            conversationId = conversationId,
            senderId = senderId,
            ciphertext = "ciphertext_data",
            nonce = "nonce_12_bytes",
            senderKeyId = "k_alice",
            recipientKeyId = "k_bob",
            localState = "SENT",
            createdAt = "2026-08-26T10:00:00Z",
            updatedAt = "2026-08-26T10:00:00Z"
        )

        val merged = MessageStateReconciler.mergeServerDtoWithEntity(
            existing = existingEntity,
            dto = dto,
            localIdFallback = "new_local_id"
        )

        // Must preserve existing localId and clientTempId while updating state monotonically
        assertEquals("local_uuid_001", merged.localId)
        assertEquals("temp_uuid_001", merged.clientTempId)
        assertEquals(serverMessageId, merged.serverMessageId)
        assertEquals("DELIVERED", merged.localState)
    }

    @Test
    fun testOfflineQueueZeroPlaintextInvariant() {
        val aliceKeyPair = generateTestEcKeyPair()
        val bobKeyPair = generateTestEcKeyPair()
        val conversationId = "conv_offline_001"
        val aliceId = "user_alice"

        val shared = KeyAgreementEngine.computeEcdhSharedSecret(aliceKeyPair.private, bobKeyPair.public)
        val key = HkdfKeyDerivation.deriveAesKey(shared, conversationId)

        val secretText = "Top secret message queued while offline"
        val envelope = AeadCipherEngine.encrypt(secretText, key, conversationId, aliceId, "k_a", "k_b")

        val entity = EncryptedMessageEntity(
            localId = UUID.randomUUID().toString(),
            serverMessageId = null,
            clientTempId = "temp_${UUID.randomUUID()}",
            conversationId = conversationId,
            senderId = aliceId,
            ciphertext = envelope.ciphertext,
            nonce = envelope.nonce,
            senderKeyId = envelope.senderKeyId,
            recipientKeyId = envelope.recipientKeyId,
            localState = MessageLocalState.PENDING_SEND.name,
            createdAt = "2026-08-26T10:00:00Z",
            updatedAt = "2026-08-26T10:00:00Z"
        )

        // Verify entity contains NO plaintext
        assertFalse(entity.ciphertext.contains("Top secret"))
        assertEquals("PENDING_SEND", entity.localState)

        // Decryption succeeds only with correct key
        val decrypted = AeadCipherEngine.decrypt(
            envelope = EncryptedEnvelopeDto(
                version = 1,
                algorithm = "AES-256-GCM",
                keyAgreement = "ECDH-P256",
                senderKeyId = entity.senderKeyId,
                recipientKeyId = entity.recipientKeyId,
                nonce = entity.nonce,
                ciphertext = entity.ciphertext,
                aad = "$conversationId:$aliceId:v1"
            ),
            secretKey = key,
            conversationId = conversationId,
            senderId = aliceId
        )
        assertEquals(secretText, decrypted)
    }

    @Test
    fun testNonceUniquenessOnRetry() {
        val aliceKeyPair = generateTestEcKeyPair()
        val bobKeyPair = generateTestEcKeyPair()
        val conversationId = "conv_retry_001"
        val aliceId = "user_alice"

        val shared = KeyAgreementEngine.computeEcdhSharedSecret(aliceKeyPair.private, bobKeyPair.public)
        val key = HkdfKeyDerivation.deriveAesKey(shared, conversationId)
        val message = "Message that required network retry"

        val attempt1 = AeadCipherEngine.encrypt(message, key, conversationId, aliceId, "k_a", "k_b")
        val attempt2 = AeadCipherEngine.encrypt(message, key, conversationId, aliceId, "k_a", "k_b")

        // Never reuse a nonce on retry
        assertNotEquals(attempt1.nonce, attempt2.nonce)
        assertNotEquals(attempt1.ciphertext, attempt2.ciphertext)

        // Both decrypt to the same plaintext
        assertEquals(message, AeadCipherEngine.decrypt(attempt1, key, conversationId, aliceId))
        assertEquals(message, AeadCipherEngine.decrypt(attempt2, key, conversationId, aliceId))
    }

    @Test
    fun testMultiDeviceConvergence() {
        // Simulate: Alice sends from Android, Bob reads on Web.
        // Server emits message.read event to Alice's Android client.
        val initialLocalState = MessageLocalState.SENT
        val convergedState = MessageStateReconciler.reconcileDeliveryState(initialLocalState, "read")
        assertEquals(MessageLocalState.READ, convergedState)
    }

    @Test
    fun testConcurrentSendNonceAndCiphertextIntegrity() {
        val aliceKeyPair = generateTestEcKeyPair()
        val bobKeyPair = generateTestEcKeyPair()
        val conversationId = "conv_concurrent_001"
        val aliceId = "user_alice"

        val shared = KeyAgreementEngine.computeEcdhSharedSecret(aliceKeyPair.private, bobKeyPair.public)
        val key = HkdfKeyDerivation.deriveAesKey(shared, conversationId)

        val nonces = mutableSetOf<String>()
        val ciphertexts = mutableSetOf<String>()

        for (i in 1..50) {
            val text = "Rapid fire message #$i"
            val env = AeadCipherEngine.encrypt(text, key, conversationId, aliceId, "k_a", "k_b")
            assertTrue("Nonce collision detected at iteration $i", nonces.add(env.nonce))
            assertTrue("Ciphertext collision detected at iteration $i", ciphertexts.add(env.ciphertext))

            val decrypted = AeadCipherEngine.decrypt(env, key, conversationId, aliceId)
            assertEquals(text, decrypted)
        }
    }
}
