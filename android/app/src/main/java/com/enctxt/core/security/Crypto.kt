package com.enctxt.core.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.enctxt.data.model.EncryptedEnvelopeDto
import java.nio.charset.StandardCharsets
import java.security.*
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.math.min

class DecryptionException(message: String = "Unable to decrypt message") : Exception(message)
class CryptoException(message: String, cause: Throwable? = null) : Exception(message, cause)

// ==============================================================================
// 1. Android Keystore Identity Key Management
// ==============================================================================

class KeyStoreManager(
    private val keyAlias: String = "enctxt_identity_key",
    private val keyStoreProvider: String = "AndroidKeyStore"
) {
    private val secureRandom = SecureRandom()

    fun hasIdentityKey(): Boolean {
        return try {
            val keyStore = KeyStore.getInstance(keyStoreProvider).apply { load(null) }
            keyStore.containsAlias(keyAlias)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Generates a new hardware-backed ECDH P-256 key pair inside Android KeyStore.
     * Private key material never leaves the secure hardware boundary.
     */
    fun generateIdentityKeyPair(): String {
        val keyPairGenerator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            keyStoreProvider
        )

        val spec = KeyGenParameterSpec.Builder(
            keyAlias,
            KeyProperties.PURPOSE_AGREE_KEY
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512)
            .build()

        keyPairGenerator.initialize(spec)
        keyPairGenerator.generateKeyPair()

        return generateKeyId()
    }

    fun getPublicKeyBase64(): String {
        val keyStore = KeyStore.getInstance(keyStoreProvider).apply { load(null) }
        val certificate = keyStore.getCertificate(keyAlias)
            ?: throw CryptoException("Identity certificate not found in KeyStore")
        val publicKeyBytes = certificate.publicKey.encoded
        return Base64.getEncoder().encodeToString(publicKeyBytes)
    }

    fun getPrivateKey(): PrivateKey {
        val keyStore = KeyStore.getInstance(keyStoreProvider).apply { load(null) }
        val entry = keyStore.getEntry(keyAlias, null) as? KeyStore.PrivateKeyEntry
            ?: throw CryptoException("Identity private key entry not found in KeyStore")
        return entry.privateKey
    }

    fun deleteIdentityKey() {
        try {
            val keyStore = KeyStore.getInstance(keyStoreProvider).apply { load(null) }
            if (keyStore.containsAlias(keyAlias)) {
                keyStore.deleteEntry(keyAlias)
            }
        } catch (e: Exception) {
            throw CryptoException("Failed to delete KeyStore entry", e)
        }
    }

    companion object {
        fun generateKeyId(): String = "k_${UUID.randomUUID()}"

        /**
         * Derives a stable keyId from the public key bytes themselves, so
         * re-publishing on every app launch reuses the same id for as long as
         * the underlying KeyStore key is unchanged. A random id here (the
         * previous behavior) republished a new keyId on every launch despite
         * the key material never changing, which both spammed the server
         * with pointless identity updates and made key-change detection
         * compare against a moving target (ContactSecurityRepository checks
         * keyId equality), risking false "key changed" warnings whenever a
         * peer simply relaunched their app.
         */
        fun deriveKeyId(publicKeyBase64: String): String {
            val digest = MessageDigest.getInstance("SHA-256")
                .digest(Base64.getDecoder().decode(publicKeyBase64))
            return "k_" + digest.joinToString("") { "%02x".format(it) }.take(32)
        }
    }
}

// ==============================================================================
// 2. ECDH Shared Secret Agreement & Public Key Parsing
// ==============================================================================

object KeyAgreementEngine {
    fun parsePublicKeyFromSpkiBase64(spkiBase64: String): PublicKey {
        val bytes = Base64.getDecoder().decode(spkiBase64)
        val spec = X509EncodedKeySpec(bytes)
        val kf = KeyFactory.getInstance("EC")
        return kf.generatePublic(spec)
    }

    fun computeEcdhSharedSecret(privateKey: PrivateKey, peerPublicKey: PublicKey): ByteArray {
        val ka = KeyAgreement.getInstance("ECDH")
        ka.init(privateKey)
        ka.doPhase(peerPublicKey, true)
        return ka.generateSecret()
    }
}

// ==============================================================================
// 3. HKDF-SHA-256 Key Derivation (RFC 5869)
// ==============================================================================

object HkdfKeyDerivation {
    private const val HMAC_ALGORITHM = "HmacSHA256"
    private const val HASH_LEN = 32 // SHA-256 outputs 32 bytes

    fun deriveAesKey(
        sharedSecret: ByteArray,
        salt: String,
        info: String = "enctxt-v1-e2ee",
        keyLengthBytes: Int = 32
    ): SecretKey {
        val saltBytes = salt.toByteArray(StandardCharsets.UTF_8)
        val infoBytes = info.toByteArray(StandardCharsets.UTF_8)

        // 1. Extract: PRK = HMAC-SHA256(salt, IKM)
        val macExtract = Mac.getInstance(HMAC_ALGORITHM)
        val saltKey = SecretKeySpec(if (saltBytes.isNotEmpty()) saltBytes else ByteArray(HASH_LEN), HMAC_ALGORITHM)
        macExtract.init(saltKey)
        val prk = macExtract.doFinal(sharedSecret)

        // 2. Expand: OKM = HKDF-Expand(PRK, info, L)
        val macExpand = Mac.getInstance(HMAC_ALGORITHM)
        val prkKey = SecretKeySpec(prk, HMAC_ALGORITHM)
        macExpand.init(prkKey)

        val okm = ByteArray(keyLengthBytes)
        var previousT = ByteArray(0)
        var bytesGenerated = 0
        var blockIndex = 1.toByte()

        while (bytesGenerated < keyLengthBytes) {
            macExpand.reset()
            if (previousT.isNotEmpty()) {
                macExpand.update(previousT)
            }
            macExpand.update(infoBytes)
            macExpand.update(blockIndex)
            previousT = macExpand.doFinal()

            val toCopy = min(previousT.size, keyLengthBytes - bytesGenerated)
            System.arraycopy(previousT, 0, okm, bytesGenerated, toCopy)
            bytesGenerated += toCopy
            blockIndex++
        }

        return SecretKeySpec(okm, "AES")
    }
}

// ==============================================================================
// 4. AES-256-GCM Authenticated Encryption & Decryption
// ==============================================================================

object AeadCipherEngine {
    private const val GCM_TAG_LENGTH_BITS = 128
    private const val NONCE_LENGTH_BYTES = 12
    private val secureRandom = SecureRandom()

    fun encrypt(
        plaintext: String,
        secretKey: SecretKey,
        conversationId: String,
        senderId: String,
        senderKeyId: String,
        recipientKeyId: String,
        customNonce: ByteArray? = null
    ): EncryptedEnvelopeDto {
        val nonce = customNonce ?: ByteArray(NONCE_LENGTH_BYTES).also { secureRandom.nextBytes(it) }
        val aadString = "$conversationId:$senderId:v1"
        val aadBytes = aadString.toByteArray(StandardCharsets.UTF_8)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(GCM_TAG_LENGTH_BITS, nonce)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, spec)
        cipher.updateAAD(aadBytes)

        val plaintextBytes = plaintext.toByteArray(StandardCharsets.UTF_8)
        val ciphertextBytes = cipher.doFinal(plaintextBytes)

        return EncryptedEnvelopeDto(
            version = 1,
            algorithm = "AES-256-GCM",
            keyAgreement = "ECDH-P256",
            senderKeyId = senderKeyId,
            recipientKeyId = recipientKeyId,
            nonce = Base64.getEncoder().encodeToString(nonce),
            ciphertext = Base64.getEncoder().encodeToString(ciphertextBytes),
            aad = aadString
        )
    }

    fun decrypt(
        envelope: EncryptedEnvelopeDto,
        secretKey: SecretKey,
        conversationId: String,
        senderId: String
    ): String {
        // Enforce Protocol v1 Invariants
        if (envelope.version != 1) {
            throw DecryptionException("Unsupported protocol version: ${envelope.version}")
        }
        if (envelope.algorithm != "AES-256-GCM") {
            throw DecryptionException("Unsupported algorithm: ${envelope.algorithm}")
        }
        if (envelope.keyAgreement != "ECDH-P256") {
            throw DecryptionException("Unsupported key agreement: ${envelope.keyAgreement}")
        }

        return try {
            val nonce = Base64.getDecoder().decode(envelope.nonce)
            val ciphertext = Base64.getDecoder().decode(envelope.ciphertext)
            val expectedAad = "$conversationId:$senderId:v1".toByteArray(StandardCharsets.UTF_8)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val spec = GCMParameterSpec(GCM_TAG_LENGTH_BITS, nonce)
            cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)
            cipher.updateAAD(expectedAad)

            val decryptedBytes = cipher.doFinal(ciphertext)
            String(decryptedBytes, StandardCharsets.UTF_8)
        } catch (e: Exception) {
            throw DecryptionException("Authentication tag mismatch or corrupted ciphertext")
        }
    }
}


