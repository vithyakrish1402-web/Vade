package com.enctxt

import com.enctxt.core.security.AeadCipherEngine
import com.enctxt.core.security.DecryptionException
import com.enctxt.core.security.HkdfKeyDerivation
import com.enctxt.core.security.KeyAgreementEngine
import com.enctxt.core.security.KeyStoreManager
import com.enctxt.data.model.EncryptedEnvelopeDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.security.KeyFactory
import java.security.spec.PKCS8EncodedKeySpec
import java.util.Base64

class CryptoTestVectorsTest {

    private val alicePublicKeySpkiBase64 =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEawMQ2rcQ7O3eTx0A3MmKjcMKOcqAuojgM68JwnxzDSpi40mxKcY2A/dWMdWvp0C3sGX/aXjlwmzMLOV+EAVJdg=="

    private val alicePrivateKeyPkcs8Base64 =
        "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgRraQoKacbhfuCtWQ+Y4Ap+u5Ze2KWwoPRplSvMISIOqhRANCAARrAxDatxDs7d5PHQDcyYqNwwo5yoC6iOAzrwnCfHMNKmLjSbEpxjYD91Yx1a+nQLewZf9peOXCbMws5X4QBUl2"

    private val bobPublicKeySpkiBase64 =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJ7Os1SMBOvYE78qWI3qRiHNcNDf9KevsKZSbJWrD8iRYKQP+ho7+QEZUVIfxuv03wn7V5hvgLMEGXYuaQdgZNg=="

    private val bobPrivateKeyPkcs8Base64 =
        "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQggsLjUcLnbd6T4bAK8UzLdH2+YFKEuT7m1PN+95Ub7GahRANCAAQns6zVIwE69gTvypYjepGIc1w0N/0p6+wplJslasPyJFgpA/6Gjv5ARlRUh/G6/TfCftXmG+AswQZdi5pB2Bk2"

    private val conversationId = "conv-test-vector-001"
    private val senderId = "user-alice-001"
    private val expectedPlaintext = "Cross-platform cryptographic test vector for ENCTXT v1."
    private val expectedDerivedKeyHex = "900410531c9a5c2a304d738dee0c4734b2117e5ed4add6f5e19059f62a10ca03"
    private val expectedCiphertextBase64 = "Mz/hwY9pM8oHVHzJC+Us8fMQwglUGvXpyxVN9csUET6U2NbN/m8/ArvV9vbBGBbDruDY4LU2IzePl0XKRkzPjRYHVzdUqxU="
    private val nonceBase64 = "MTIzNDU2Nzg5MDEy"

    @Test
    fun testEcdhAndHkdfMatchesVector() {
        val kf = KeyFactory.getInstance("EC")
        val alicePriv = kf.generatePrivate(PKCS8EncodedKeySpec(Base64.getDecoder().decode(alicePrivateKeyPkcs8Base64)))
        val bobPub = KeyAgreementEngine.parsePublicKeyFromSpkiBase64(bobPublicKeySpkiBase64)

        // 1. ECDH Agreement
        val sharedSecret = KeyAgreementEngine.computeEcdhSharedSecret(alicePriv, bobPub)

        // 2. HKDF-SHA-256 Key Derivation
        val derivedKey = HkdfKeyDerivation.deriveAesKey(
            sharedSecret = sharedSecret,
            salt = conversationId,
            info = "enctxt-v1-e2ee",
            keyLengthBytes = 32
        )

        val derivedKeyHex = derivedKey.encoded.joinToString("") { "%02x".format(it) }
        assertEquals(expectedDerivedKeyHex, derivedKeyHex)
    }

    @Test
    fun testBobDecryptsVectorEnvelope() {
        val kf = KeyFactory.getInstance("EC")
        val bobPriv = kf.generatePrivate(PKCS8EncodedKeySpec(Base64.getDecoder().decode(bobPrivateKeyPkcs8Base64)))
        val alicePub = KeyAgreementEngine.parsePublicKeyFromSpkiBase64(alicePublicKeySpkiBase64)

        // 1. Bob derives symmetric key
        val bobSharedSecret = KeyAgreementEngine.computeEcdhSharedSecret(bobPriv, alicePub)
        val bobAesKey = HkdfKeyDerivation.deriveAesKey(
            sharedSecret = bobSharedSecret,
            salt = conversationId,
            info = "enctxt-v1-e2ee"
        )

        // 2. Bob decrypts test envelope
        val envelope = EncryptedEnvelopeDto(
            version = 1,
            algorithm = "AES-256-GCM",
            keyAgreement = "ECDH-P256",
            senderKeyId = "k_alice_test_key_001",
            recipientKeyId = "k_bob_test_key_002",
            nonce = nonceBase64,
            ciphertext = expectedCiphertextBase64,
            aad = "$conversationId:$senderId:v1"
        )

        val decrypted = AeadCipherEngine.decrypt(
            envelope = envelope,
            secretKey = bobAesKey,
            conversationId = conversationId,
            senderId = senderId
        )

        assertEquals(expectedPlaintext, decrypted)
    }

    @Test
    fun testTamperedCiphertextThrowsDecryptionException() {
        val kf = KeyFactory.getInstance("EC")
        val bobPriv = kf.generatePrivate(PKCS8EncodedKeySpec(Base64.getDecoder().decode(bobPrivateKeyPkcs8Base64)))
        val alicePub = KeyAgreementEngine.parsePublicKeyFromSpkiBase64(alicePublicKeySpkiBase64)

        val bobSharedSecret = KeyAgreementEngine.computeEcdhSharedSecret(bobPriv, alicePub)
        val bobAesKey = HkdfKeyDerivation.deriveAesKey(
            sharedSecret = bobSharedSecret,
            salt = conversationId,
            info = "enctxt-v1-e2ee"
        )

        val tamperedCiphertext = "A" + expectedCiphertextBase64.substring(1)
        val envelope = EncryptedEnvelopeDto(
            version = 1,
            algorithm = "AES-256-GCM",
            keyAgreement = "ECDH-P256",
            senderKeyId = "k_alice_test_key_001",
            recipientKeyId = "k_bob_test_key_002",
            nonce = nonceBase64,
            ciphertext = tamperedCiphertext,
            aad = "$conversationId:$senderId:v1"
        )

        assertThrows(DecryptionException::class.java) {
            AeadCipherEngine.decrypt(envelope, bobAesKey, conversationId, senderId)
        }
    }

    // Regression test: keyId used to be a random UUID minted on every app
    // launch even when reusing the same KeyStore key, which republished a
    // moving-target keyId on every session init and made key-change
    // detection (which compares stored keyId against current) unreliable.
    // Deriving it from the public key bytes makes it stable across launches
    // and naturally distinct when the key material actually changes.
    @Test
    fun testDeriveKeyIdIsDeterministicForSameKey() {
        val first = KeyStoreManager.deriveKeyId(alicePublicKeySpkiBase64)
        val second = KeyStoreManager.deriveKeyId(alicePublicKeySpkiBase64)
        assertEquals(first, second)
    }

    @Test
    fun testDeriveKeyIdDiffersForDifferentKeys() {
        val aliceKeyId = KeyStoreManager.deriveKeyId(alicePublicKeySpkiBase64)
        val bobKeyId = KeyStoreManager.deriveKeyId(bobPublicKeySpkiBase64)
        assertNotEquals(aliceKeyId, bobKeyId)
    }
}
