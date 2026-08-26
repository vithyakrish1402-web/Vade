package com.enctxt.data.repository

import com.enctxt.core.network.ApiClient
import com.enctxt.core.network.NetworkResult
import com.enctxt.core.security.*
import com.enctxt.core.storage.ConversationEntity
import com.enctxt.core.storage.EncryptedMessageEntity
import com.enctxt.core.storage.EnctxtDatabase
import com.enctxt.core.storage.UserSessionEntity
import com.enctxt.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import java.security.PrivateKey
import java.security.PublicKey
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.SecretKey

// ==============================================================================
// 1. Auth Repository
// ==============================================================================

class AuthRepository(
    private val apiClient: ApiClient,
    private val database: EnctxtDatabase
) {
    fun observeSession(): Flow<UserSessionEntity?> =
        database.sessionDao().observeActiveSession()

    suspend fun getActiveSession(): UserSessionEntity? =
        database.sessionDao().getActiveSession()

    suspend fun register(request: RegisterRequest): NetworkResult<AuthResponse> {
        val result = apiClient.register(request)
        if (result is NetworkResult.Success && result.data.user != null) {
            val user = result.data.user
            database.sessionDao().saveSession(
                UserSessionEntity(
                    userId = user.id,
                    username = user.username,
                    displayName = user.displayName,
                    email = request.email
                )
            )
        }
        return result
    }

    suspend fun login(request: LoginRequest): NetworkResult<AuthResponse> {
        val result = apiClient.login(request)
        if (result is NetworkResult.Success && result.data.user != null) {
            val user = result.data.user
            database.sessionDao().saveSession(
                UserSessionEntity(
                    userId = user.id,
                    username = user.username,
                    displayName = user.displayName
                )
            )
        }
        return result
    }

    suspend fun checkSession(): NetworkResult<AuthResponse> {
        val result = apiClient.getMe()
        if (result is NetworkResult.Success && result.data.user != null) {
            val user = result.data.user
            database.sessionDao().saveSession(
                UserSessionEntity(
                    userId = user.id,
                    username = user.username,
                    displayName = user.displayName
                )
            )
        } else if (result is NetworkResult.Error && result.statusCode == 401) {
            database.sessionDao().clearSession()
        }
        return result
    }

    suspend fun logout(): NetworkResult<LogoutResponse> {
        val result = apiClient.logout()
        database.sessionDao().clearSession()
        database.conversationDao().clearAll()
        return result
    }
}

// ==============================================================================
// 2. User Repository (Search)
// ==============================================================================

class UserRepository(
    private val apiClient: ApiClient
) {
    suspend fun searchUsers(query: String): NetworkResult<List<UserSummary>> {
        return when (val res = apiClient.searchUsers(query)) {
            is NetworkResult.Success -> NetworkResult.Success(res.data.users)
            is NetworkResult.Error -> NetworkResult.Error(res.code, res.message, res.statusCode)
            is NetworkResult.Loading -> NetworkResult.Loading
        }
    }
}

// ==============================================================================
// 3. Conversation Repository
// ==============================================================================

class ConversationRepository(
    private val apiClient: ApiClient,
    private val database: EnctxtDatabase
) {
    fun observeCachedConversations(): Flow<List<ConversationEntity>> =
        database.conversationDao().observeConversations()

    suspend fun fetchConversations(): NetworkResult<List<ConversationListItem>> = withContext(Dispatchers.IO) {
        when (val res = apiClient.getConversations()) {
            is NetworkResult.Success -> {
                val list = res.data.conversations
                val entities = list.map { item ->
                    ConversationEntity(
                        id = item.id,
                        peerId = item.participant.id,
                        peerUsername = item.participant.username,
                        peerDisplayName = item.participant.displayName,
                        createdAt = item.createdAt,
                        updatedAt = item.updatedAt
                    )
                }
                database.conversationDao().insertConversations(entities)
                NetworkResult.Success(list)
            }
            is NetworkResult.Error -> NetworkResult.Error(res.code, res.message, res.statusCode)
            is NetworkResult.Loading -> NetworkResult.Loading
        }
    }

    suspend fun createConversation(userId: String): NetworkResult<ConversationDetails> = withContext(Dispatchers.IO) {
        when (val res = apiClient.createConversation(userId)) {
            is NetworkResult.Success -> {
                val conv = res.data.conversation
                val currentSession = database.sessionDao().getActiveSession()
                val peer = conv.participants.firstOrNull { it.id != currentSession?.userId }
                    ?: conv.participants.first()

                database.conversationDao().insertConversation(
                    ConversationEntity(
                        id = conv.id,
                        peerId = peer.id,
                        peerUsername = peer.username,
                        peerDisplayName = peer.displayName,
                        createdAt = conv.createdAt,
                        updatedAt = conv.updatedAt
                    )
                )
                NetworkResult.Success(conv)
            }
            is NetworkResult.Error -> NetworkResult.Error(res.code, res.message, res.statusCode)
            is NetworkResult.Loading -> NetworkResult.Loading
        }
    }
}

// ==============================================================================
// 4. Crypto Repository (KeyStore & Public Key PKI)
// ==============================================================================

class CryptoRepository(
    private val apiClient: ApiClient,
    private val keyStoreManager: KeyStoreManager
) {
    private val peerPublicKeyCache = ConcurrentHashMap<String, PublicKey>()

    fun isIdentityInitialized(): Boolean = keyStoreManager.hasIdentityKey()

    suspend fun initializeIdentityKey(): NetworkResult<String> {
        return try {
            val keyId = if (!keyStoreManager.hasIdentityKey()) {
                keyStoreManager.generateIdentityKeyPair()
            } else {
                KeyStoreManager.generateKeyId()
            }

            val publicKeyBase64 = keyStoreManager.getPublicKeyBase64()

            val publishResult = apiClient.publishIdentityKey(
                PublishKeyRequest(
                    keyId = keyId,
                    publicKey = publicKeyBase64,
                    algorithm = "ECDH-P256"
                )
            )

            if (publishResult is NetworkResult.Success) {
                NetworkResult.Success(keyId)
            } else if (publishResult is NetworkResult.Error) {
                NetworkResult.Error(publishResult.code, publishResult.message, publishResult.statusCode)
            } else {
                NetworkResult.Error("UNKNOWN", "Failed to publish public key")
            }
        } catch (e: Exception) {
            NetworkResult.Error("KEYSTORE_ERROR", e.message ?: "KeyStore initialization failed")
        }
    }

    suspend fun getPeerPublicKey(userId: String): NetworkResult<Pair<String, PublicKey>> {
        return try {
            when (val res = apiClient.getUserPublicKey(userId)) {
                is NetworkResult.Success -> {
                    val pubKey = KeyAgreementEngine.parsePublicKeyFromSpkiBase64(res.data.publicKey)
                    peerPublicKeyCache[userId] = pubKey
                    NetworkResult.Success(Pair(res.data.keyId, pubKey))
                }
                is NetworkResult.Error -> NetworkResult.Error(res.code, res.message, res.statusCode)
                is NetworkResult.Loading -> NetworkResult.Loading
            }
        } catch (e: Exception) {
            NetworkResult.Error("CRYPTO_ERROR", "Invalid peer public key: ${e.message}")
        }
    }

    fun getLocalPrivateKey(): PrivateKey = keyStoreManager.getPrivateKey()
    fun getLocalPublicKeyBase64(): String = keyStoreManager.getPublicKeyBase64()

    suspend fun registerDevice(deviceName: String, keyId: String): NetworkResult<DeviceDto> =
        apiClient.registerDevice(RegisterDeviceRequest(deviceName = deviceName, platform = "android", keyId = keyId))
}

// ==============================================================================
// 5. Message Repository (Local Encryption/Decryption & Room Persistence)
// ==============================================================================

class MessageRepository(
    private val apiClient: ApiClient,
    private val database: EnctxtDatabase,
    private val cryptoRepository: CryptoRepository
) {
    // In-memory conversation symmetric AES-256-GCM key cache (conversationId -> SecretKey)
    private val conversationKeyCache = ConcurrentHashMap<String, SecretKey>()

    suspend fun getConversationKey(conversationId: String, peerId: String): SecretKey {
        return conversationKeyCache.getOrPut(conversationId) {
            val peerKeyResult = cryptoRepository.getPeerPublicKey(peerId)
            if (peerKeyResult !is NetworkResult.Success) {
                throw CryptoException("Recipient public identity key unavailable")
            }
            val peerPublicKey = peerKeyResult.data.second
            val localPrivateKey = cryptoRepository.getLocalPrivateKey()

            // 1. ECDH Shared Secret
            val sharedSecret = KeyAgreementEngine.computeEcdhSharedSecret(localPrivateKey, peerPublicKey)

            // 2. HKDF-SHA-256 Symmetric Derivation
            HkdfKeyDerivation.deriveAesKey(
                sharedSecret = sharedSecret,
                salt = conversationId,
                info = "enctxt-v1-e2ee"
            )
        }
    }

    suspend fun fetchMessageHistory(
        conversationId: String,
        peerId: String,
        currentUserId: String
    ): NetworkResult<List<MessageUiModel>> = withContext(Dispatchers.IO) {
        when (val res = apiClient.getMessages(conversationId)) {
            is NetworkResult.Success -> {
                val dtos = res.data.messages

                // Persist ciphertext envelopes only (Zero Plaintext Invariant)
                val entities = dtos.map { dto ->
                    EncryptedMessageEntity(
                        id = dto.id,
                        conversationId = dto.conversationId,
                        senderId = dto.senderId,
                        ciphertext = dto.ciphertext,
                        nonce = dto.nonce,
                        senderKeyId = dto.senderKeyId,
                        recipientKeyId = dto.recipientKeyId,
                        algorithm = dto.algorithm,
                        version = dto.version,
                        aad = dto.aad,
                        status = dto.status,
                        createdAt = dto.createdAt,
                        updatedAt = dto.updatedAt
                    )
                }
                database.messageDao().insertMessages(entities)

                // Decrypt in transient memory for the UI layer
                val uiModels = dtos.map { dto ->
                    decryptDtoToUiModel(dto, conversationId, peerId, currentUserId)
                }
                NetworkResult.Success(uiModels)
            }
            is NetworkResult.Error -> NetworkResult.Error(res.code, res.message, res.statusCode)
            is NetworkResult.Loading -> NetworkResult.Loading
        }
    }

    suspend fun sendEncryptedMessage(
        conversationId: String,
        peerId: String,
        currentUserId: String,
        plaintext: String
    ): NetworkResult<MessageUiModel> = withContext(Dispatchers.IO) {
        try {
            // 1. Resolve Peer Public Key & Key IDs
            val peerKeyResult = cryptoRepository.getPeerPublicKey(peerId)
            if (peerKeyResult !is NetworkResult.Success) {
                return@withContext NetworkResult.Error("KEY_UNAVAILABLE", "Recipient encryption key unavailable")
            }
            val recipientKeyId = peerKeyResult.data.first
            val localKeyId = KeyStoreManager.generateKeyId()

            // 2. Derive Conversation Key
            val conversationKey = getConversationKey(conversationId, peerId)

            // 3. Encrypt Plaintext with CSPRNG Nonce and AAD
            val envelope = AeadCipherEngine.encrypt(
                plaintext = plaintext,
                secretKey = conversationKey,
                conversationId = conversationId,
                senderId = currentUserId,
                senderKeyId = localKeyId,
                recipientKeyId = recipientKeyId
            )

            // 4. Send Ciphertext Envelope to Server
            val sendResult = apiClient.sendMessage(
                conversationId = conversationId,
                request = SendMessageRequest(envelope = envelope)
            )

            when (sendResult) {
                is NetworkResult.Success -> {
                    val msgDto = sendResult.data.message

                    // Persist ciphertext envelope
                    database.messageDao().insertMessage(
                        EncryptedMessageEntity(
                            id = msgDto.id,
                            conversationId = msgDto.conversationId,
                            senderId = msgDto.senderId,
                            ciphertext = msgDto.ciphertext,
                            nonce = msgDto.nonce,
                            senderKeyId = msgDto.senderKeyId,
                            recipientKeyId = msgDto.recipientKeyId,
                            algorithm = msgDto.algorithm,
                            version = msgDto.version,
                            aad = msgDto.aad,
                            status = msgDto.status,
                            createdAt = msgDto.createdAt,
                            updatedAt = msgDto.updatedAt
                        )
                    )

                    NetworkResult.Success(
                        MessageUiModel(
                            id = msgDto.id,
                            conversationId = msgDto.conversationId,
                            senderId = msgDto.senderId,
                            isOutgoing = true,
                            transientPlaintext = plaintext,
                            decryptionState = DecryptionState.DECRYPTED,
                            deliveryState = DeliveryState.SENT,
                            createdAt = msgDto.createdAt,
                            senderKeyId = msgDto.senderKeyId,
                            recipientKeyId = msgDto.recipientKeyId
                        )
                    )
                }
                is NetworkResult.Error -> NetworkResult.Error(sendResult.code, sendResult.message, sendResult.statusCode)
                is NetworkResult.Loading -> NetworkResult.Loading
            }
        } catch (e: Exception) {
            NetworkResult.Error("ENCRYPTION_ERROR", e.message ?: "Failed to encrypt message")
        }
    }

    suspend fun decryptDtoToUiModel(
        dto: MessageItemDto,
        conversationId: String,
        peerId: String,
        currentUserId: String
    ): MessageUiModel {
        val isOutgoing = dto.senderId == currentUserId

        return try {
            val conversationKey = getConversationKey(conversationId, peerId)
            val envelope = EncryptedEnvelopeDto(
                version = dto.version,
                algorithm = dto.algorithm,
                keyAgreement = "ECDH-P256",
                senderKeyId = dto.senderKeyId,
                recipientKeyId = dto.recipientKeyId,
                nonce = dto.nonce,
                ciphertext = dto.ciphertext,
                aad = dto.aad
            )

            val decryptedText = AeadCipherEngine.decrypt(
                envelope = envelope,
                secretKey = conversationKey,
                conversationId = conversationId,
                senderId = dto.senderId
            )

            val deliveryState = when (dto.status) {
                "read" -> DeliveryState.READ
                "delivered" -> DeliveryState.DELIVERED
                else -> DeliveryState.SENT
            }

            MessageUiModel(
                id = dto.id,
                conversationId = dto.conversationId,
                senderId = dto.senderId,
                isOutgoing = isOutgoing,
                transientPlaintext = decryptedText,
                decryptionState = DecryptionState.DECRYPTED,
                deliveryState = deliveryState,
                createdAt = dto.createdAt,
                senderKeyId = dto.senderKeyId,
                recipientKeyId = dto.recipientKeyId
            )
        } catch (_: Exception) {
            MessageUiModel(
                id = dto.id,
                conversationId = dto.conversationId,
                senderId = dto.senderId,
                isOutgoing = isOutgoing,
                transientPlaintext = null,
                decryptionState = DecryptionState.DECRYPTION_FAILED,
                deliveryState = DeliveryState.FAILED,
                createdAt = dto.createdAt,
                senderKeyId = dto.senderKeyId,
                recipientKeyId = dto.recipientKeyId
            )
        }
    }

    suspend fun markAsRead(conversationId: String) {
        apiClient.markConversationRead(conversationId)
    }

    fun clearDecryptionKeys() {
        conversationKeyCache.clear()
    }
}
