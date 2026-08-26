package com.enctxt.data.repository

import com.enctxt.core.network.ApiClient
import com.enctxt.core.network.NetworkResult
import com.enctxt.core.security.*
import com.enctxt.core.storage.ConversationEntity
import com.enctxt.core.storage.EncryptedMessageEntity
import com.enctxt.core.storage.EnctxtDatabase
import com.enctxt.core.storage.UserSessionEntity
import com.enctxt.core.sync.MessageStateReconciler
import com.enctxt.core.sync.SyncCoordinator
import com.enctxt.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.security.PrivateKey
import java.security.PublicKey
import java.time.Instant
import java.util.UUID
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
        database.messageDao().clearAllMessages()
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
            peerPublicKeyCache[userId]?.let { cachedKey ->
                return NetworkResult.Success(Pair("k_cached", cachedKey))
            }

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
// 5. Message Repository (Reliability, Offline Queue & Room Transactions)
// ==============================================================================

class MessageRepository(
    private val apiClient: ApiClient,
    private val database: EnctxtDatabase,
    private val cryptoRepository: CryptoRepository,
    private val syncCoordinator: SyncCoordinator
) {
    private val conversationKeyCache = ConcurrentHashMap<String, SecretKey>()

    suspend fun getConversationKey(conversationId: String, peerId: String): SecretKey {
        return conversationKeyCache.getOrPut(conversationId) {
            val peerKeyResult = cryptoRepository.getPeerPublicKey(peerId)
            if (peerKeyResult !is NetworkResult.Success) {
                throw CryptoException("Recipient public identity key unavailable")
            }
            val peerPublicKey = peerKeyResult.data.second
            val localPrivateKey = cryptoRepository.getLocalPrivateKey()

            val sharedSecret = KeyAgreementEngine.computeEcdhSharedSecret(localPrivateKey, peerPublicKey)
            HkdfKeyDerivation.deriveAesKey(
                sharedSecret = sharedSecret,
                salt = conversationId,
                info = "enctxt-v1-e2ee"
            )
        }
    }

    fun observeRoomMessages(
        conversationId: String,
        peerId: String,
        currentUserId: String
    ): Flow<List<MessageUiModel>> {
        return database.messageDao().observeMessages(conversationId).map { entities ->
            entities.map { entity ->
                decryptEntityToUiModel(entity, conversationId, peerId, currentUserId)
            }
        }
    }

    suspend fun sendEncryptedMessage(
        conversationId: String,
        peerId: String,
        currentUserId: String,
        plaintext: String,
        isOnline: Boolean
    ): NetworkResult<MessageUiModel> = withContext(Dispatchers.IO) {
        try {
            val peerKeyResult = cryptoRepository.getPeerPublicKey(peerId)
            if (peerKeyResult !is NetworkResult.Success) {
                return@withContext NetworkResult.Error("KEY_UNAVAILABLE", "Recipient encryption key unavailable")
            }
            val recipientKeyId = peerKeyResult.data.first
            val localKeyId = KeyStoreManager.generateKeyId()

            val conversationKey = getConversationKey(conversationId, peerId)

            // Encrypt locally with fresh CSPRNG nonce
            val envelope = AeadCipherEngine.encrypt(
                plaintext = plaintext,
                secretKey = conversationKey,
                conversationId = conversationId,
                senderId = currentUserId,
                senderKeyId = localKeyId,
                recipientKeyId = recipientKeyId
            )

            val localId = UUID.randomUUID().toString()
            val tempId = "temp_${UUID.randomUUID()}"
            val nowIso = Instant.now().toString()

            val initialLocalState = if (isOnline) MessageLocalState.SENDING else MessageLocalState.PENDING_SEND

            // 1. Persist encrypted envelope immediately (Zero Plaintext Offline Invariant)
            val pendingEntity = EncryptedMessageEntity(
                localId = localId,
                serverMessageId = null,
                clientTempId = tempId,
                conversationId = conversationId,
                senderId = currentUserId,
                ciphertext = envelope.ciphertext,
                nonce = envelope.nonce,
                senderKeyId = envelope.senderKeyId,
                recipientKeyId = envelope.recipientKeyId,
                algorithm = envelope.algorithm,
                version = envelope.version,
                aad = envelope.aad,
                localState = initialLocalState.name,
                createdAt = nowIso,
                updatedAt = nowIso
            )
            database.messageDao().insertMessage(pendingEntity)

            val optimisticUiModel = MessageUiModel(
                localId = localId,
                serverMessageId = null,
                clientTempId = tempId,
                conversationId = conversationId,
                senderId = currentUserId,
                isOutgoing = true,
                transientPlaintext = plaintext,
                decryptionState = DecryptionState.DECRYPTED,
                localState = initialLocalState,
                createdAt = nowIso,
                senderKeyId = localKeyId,
                recipientKeyId = recipientKeyId
            )

            if (!isOnline) {
                return@withContext NetworkResult.Success(optimisticUiModel)
            }

            // 2. Transmit over network
            val sendResult = apiClient.sendMessage(
                conversationId = conversationId,
                request = SendMessageRequest(envelope = envelope, tempId = tempId)
            )

            when (sendResult) {
                is NetworkResult.Success -> {
                    val serverMsg = sendResult.data.message
                    database.messageDao().updateMessageState(
                        localId = localId,
                        state = MessageLocalState.SENT.name,
                        serverId = serverMsg.id,
                        updatedAt = serverMsg.createdAt
                    )
                    NetworkResult.Success(
                        optimisticUiModel.copy(
                            serverMessageId = serverMsg.id,
                            localState = MessageLocalState.SENT
                        )
                    )
                }
                is NetworkResult.Error -> {
                    if (sendResult.statusCode != null && sendResult.statusCode in 400..499) {
                        database.messageDao().updateMessageState(localId, MessageLocalState.FAILED.name, null, nowIso)
                    } else {
                        database.messageDao().updateMessageState(localId, MessageLocalState.PENDING_SEND.name, null, nowIso)
                    }
                    NetworkResult.Error(sendResult.code, sendResult.message, sendResult.statusCode)
                }
                is NetworkResult.Loading -> NetworkResult.Loading
            }
        } catch (e: Exception) {
            NetworkResult.Error("ENCRYPTION_ERROR", e.message ?: "Failed to encrypt message")
        }
    }

    suspend fun decryptEntityToUiModel(
        entity: EncryptedMessageEntity,
        conversationId: String,
        peerId: String,
        currentUserId: String
    ): MessageUiModel {
        val isOutgoing = entity.senderId == currentUserId
        val localState = try {
            MessageLocalState.valueOf(entity.localState)
        } catch (_: Exception) {
            MessageLocalState.SENT
        }

        return try {
            val conversationKey = getConversationKey(conversationId, peerId)
            val envelope = EncryptedEnvelopeDto(
                version = entity.version,
                algorithm = entity.algorithm,
                keyAgreement = "ECDH-P256",
                senderKeyId = entity.senderKeyId,
                recipientKeyId = entity.recipientKeyId,
                nonce = entity.nonce,
                ciphertext = entity.ciphertext,
                aad = entity.aad
            )

            val decryptedText = AeadCipherEngine.decrypt(
                envelope = envelope,
                secretKey = conversationKey,
                conversationId = conversationId,
                senderId = entity.senderId
            )

            MessageUiModel(
                localId = entity.localId,
                serverMessageId = entity.serverMessageId,
                clientTempId = entity.clientTempId,
                conversationId = entity.conversationId,
                senderId = entity.senderId,
                isOutgoing = isOutgoing,
                transientPlaintext = decryptedText,
                decryptionState = DecryptionState.DECRYPTED,
                localState = localState,
                createdAt = entity.createdAt,
                senderKeyId = entity.senderKeyId,
                recipientKeyId = entity.recipientKeyId
            )
        } catch (_: Exception) {
            MessageUiModel(
                localId = entity.localId,
                serverMessageId = entity.serverMessageId,
                clientTempId = entity.clientTempId,
                conversationId = entity.conversationId,
                senderId = entity.senderId,
                isOutgoing = isOutgoing,
                transientPlaintext = null,
                decryptionState = DecryptionState.DECRYPTION_FAILED,
                localState = MessageLocalState.FAILED,
                createdAt = entity.createdAt,
                senderKeyId = entity.senderKeyId,
                recipientKeyId = entity.recipientKeyId
            )
        }
    }

    suspend fun markAsRead(conversationId: String) {
        apiClient.markConversationRead(conversationId)
    }

    suspend fun syncConversation(conversationId: String) {
        syncCoordinator.syncConversation(conversationId)
    }

    suspend fun flushOfflineQueue() {
        syncCoordinator.flushOfflineQueue()
    }
}
