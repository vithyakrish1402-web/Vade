package com.enctxt

import com.enctxt.core.security.*
import com.enctxt.data.model.EncryptedEnvelopeDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec

class E2eeMessagingPipelineTest {

    private fun generateTestEcKeyPair(): java.security.KeyPair {
        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        return kpg.generateKeyPair()
    }

    @Test
    fun testEndToEndEncryptionBetweenAliceAndBob() {
        val aliceKeyPair = generateTestEcKeyPair()
        val bobKeyPair = generateTestEcKeyPair()
        val conversationId = "conv-alice-bob-001"
        val aliceId = "user-alice-123"

        // 1. Alice derives conversation key
        val aliceShared = KeyAgreementEngine.computeEcdhSharedSecret(aliceKeyPair.private, bobKeyPair.public)
        val aliceKey = HkdfKeyDerivation.deriveAesKey(aliceShared, conversationId, "enctxt-v1-e2ee")

        // 2. Bob derives conversation key
        val bobShared = KeyAgreementEngine.computeEcdhSharedSecret(bobKeyPair.private, aliceKeyPair.public)
        val bobKey = HkdfKeyDerivation.deriveAesKey(bobShared, conversationId, "enctxt-v1-e2ee")

        // Keys must be identical (ECDH symmetry)
        assertEquals(
            aliceKey.encoded.joinToString("") { "%02x".format(it) },
            bobKey.encoded.joinToString("") { "%02x".format(it) }
        )

        // 3. Alice encrypts
        val plaintext = "Hello Bob! This message is protected by ENCTXT E2EE Protocol v1."
        val envelope = AeadCipherEngine.encrypt(
            plaintext = plaintext,
            secretKey = aliceKey,
            conversationId = conversationId,
            senderId = aliceId,
            senderKeyId = "k_alice_01",
            recipientKeyId = "k_bob_01"
        )

        // 4. Bob decrypts
        val decrypted = AeadCipherEngine.decrypt(
            envelope = envelope,
            secretKey = bobKey,
            conversationId = conversationId,
            senderId = aliceId
        )

        assertEquals(plaintext, decrypted)
    }

    @Test
    fun testUnicodeAndMultiLanguageMessages() {
        val aliceKeyPair = generateTestEcKeyPair()
        val bobKeyPair = generateTestEcKeyPair()
        val conversationId = "conv-unicode-001"
        val aliceId = "user-alice"

        val shared = KeyAgreementEngine.computeEcdhSharedSecret(aliceKeyPair.private, bobKeyPair.public)
        val key = HkdfKeyDerivation.deriveAesKey(shared, conversationId)

        val testCases = listOf(
            "Multi-byte emojis: 🔒 🚀 🛡️ 💬 ✨ 🔥 🎉",
            "Hindi: नमस्ते! यह एक गुप्त संदेश है।",
            "Chinese: 你好！这是一条端到端加密消息。",
            "Japanese: こんにちは！これは暗号化されたメッセージです。",
            "Accented Latin: Café français et façade crème brûlée",
            "Multiline formatting:\nLine 1\n\tIndented Line 2\n\nLine 3 with special chars: !@#$%^&*()",
            "A".repeat(5000) // Maximum message length boundary
        )

        for (text in testCases) {
            val envelope = AeadCipherEngine.encrypt(
                plaintext = text,
                secretKey = key,
                conversationId = conversationId,
                senderId = aliceId,
                senderKeyId = "k_1",
                recipientKeyId = "k_2"
            )

            val decrypted = AeadCipherEngine.decrypt(
                envelope = envelope,
                secretKey = key,
                conversationId = conversationId,
                senderId = aliceId
            )

            assertEquals(text, decrypted)
        }
    }

    @Test
    fun testNonceUniquenessProducesDistinctCiphertexts() {
        val aliceKeyPair = generateTestEcKeyPair()
        val bobKeyPair = generateTestEcKeyPair()
        val conversationId = "conv-nonce-001"
        val aliceId = "user-alice"

        val shared = KeyAgreementEngine.computeEcdhSharedSecret(aliceKeyPair.private, bobKeyPair.public)
        val key = HkdfKeyDerivation.deriveAesKey(shared, conversationId)
        val message = "Identical message sent twice"

        val envelope1 = AeadCipherEngine.encrypt(message, key, conversationId, aliceId, "k_1", "k_2")
        val envelope2 = AeadCipherEngine.encrypt(message, key, conversationId, aliceId, "k_1", "k_2")

        assertNotEquals(envelope1.nonce, envelope2.nonce)
        assertNotEquals(envelope1.ciphertext, envelope2.ciphertext)

        assertEquals(message, AeadCipherEngine.decrypt(envelope1, key, conversationId, aliceId))
        assertEquals(message, AeadCipherEngine.decrypt(envelope2, key, conversationId, aliceId))
    }

    @Test
    fun testTamperedCiphertextRejection() {
        val aliceKeyPair = generateTestEcKeyPair()
        val bobKeyPair = generateTestEcKeyPair()
        val conversationId = "conv-tamper-001"
        val aliceId = "user-alice"

        val shared = KeyAgreementEngine.computeEcdhSharedSecret(aliceKeyPair.private, bobKeyPair.public)
        val key = HkdfKeyDerivation.deriveAesKey(shared, conversationId)

        val envelope = AeadCipherEngine.encrypt("Sensitive wire transfer details", key, conversationId, aliceId, "k_1", "k_2")

        val tamperedCiphertext = if (envelope.ciphertext.startsWith("A")) "B" + envelope.ciphertext.substring(1) else "A" + envelope.ciphertext.substring(1)
        val tamperedEnvelope = envelope.copy(ciphertext = tamperedCiphertext)

        assertThrows(DecryptionException::class.java) {
            AeadCipherEngine.decrypt(tamperedEnvelope, key, conversationId, aliceId)
        }
    }

    @Test
    fun testTamperedAadContextRejection() {
        val aliceKeyPair = generateTestEcKeyPair()
        val bobKeyPair = generateTestEcKeyPair()
        val conversationId = "conv-aad-001"
        val aliceId = "user-alice"

        val shared = KeyAgreementEngine.computeEcdhSharedSecret(aliceKeyPair.private, bobKeyPair.public)
        val key = HkdfKeyDerivation.deriveAesKey(shared, conversationId)

        val envelope = AeadCipherEngine.encrypt("Secret conversation message", key, conversationId, aliceId, "k_1", "k_2")

        // Attempting to decrypt in a different conversation context must fail closed
        assertThrows(DecryptionException::class.java) {
            AeadCipherEngine.decrypt(envelope, key, "conv-different-context-999", aliceId)
        }
    }

    @Test
    fun testWrongKeyRejectionByCharlie() {
        val aliceKeyPair = generateTestEcKeyPair()
        val bobKeyPair = generateTestEcKeyPair()
        val charlieKeyPair = generateTestEcKeyPair()
        val conversationId = "conv-charlie-001"
        val aliceId = "user-alice"

        // Alice encrypts for Bob
        val aliceShared = KeyAgreementEngine.computeEcdhSharedSecret(aliceKeyPair.private, bobKeyPair.public)
        val aliceBobKey = HkdfKeyDerivation.deriveAesKey(aliceShared, conversationId)

        val envelope = AeadCipherEngine.encrypt("Confidential Bob only", aliceBobKey, conversationId, aliceId, "k_alice", "k_bob")

        // Charlie tries to decrypt with his own key
        val charlieShared = KeyAgreementEngine.computeEcdhSharedSecret(charlieKeyPair.private, aliceKeyPair.public)
        val charlieKey = HkdfKeyDerivation.deriveAesKey(charlieShared, conversationId)

        assertThrows(DecryptionException::class.java) {
            AeadCipherEngine.decrypt(envelope, charlieKey, conversationId, aliceId)
        }
    }

    @Test
    fun testProtocolVersionRejection() {
        val aliceKeyPair = generateTestEcKeyPair()
        val bobKeyPair = generateTestEcKeyPair()
        val conversationId = "conv-ver-001"
        val aliceId = "user-alice"

        val shared = KeyAgreementEngine.computeEcdhSharedSecret(aliceKeyPair.private, bobKeyPair.public)
        val key = HkdfKeyDerivation.deriveAesKey(shared, conversationId)

        val envelope = AeadCipherEngine.encrypt("Valid message", key, conversationId, aliceId, "k_1", "k_2")
        val invalidVersionEnvelope = envelope.copy(version = 2) // Unsupported version

        assertThrows(DecryptionException::class.java) {
            AeadCipherEngine.decrypt(invalidVersionEnvelope, key, conversationId, aliceId)
        }
    }
}
