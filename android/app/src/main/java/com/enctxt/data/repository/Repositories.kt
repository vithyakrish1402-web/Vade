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
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
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
    private val database: EnctxtDatabase,
    private val sessionCookieStore: SessionCookieStore
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
            // A fresh sign-up stays signed in — there's no "remember me" choice to make yet.
            persistSessionCookie()
        }
        return result
    }

    suspend fun login(request: LoginRequest, rememberMe: Boolean): NetworkResult<AuthResponse> {
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
            if (rememberMe) {
                persistSessionCookie()
            } else {
                sessionCookieStore.clear()
            }
        }
        return result
    }

    /** Re-injects a session cookie saved from a prior "remember me" login, ahead of [checkSession]. */
    fun restorePersistedSession() {
        val persisted = sessionCookieStore.load() ?: return
        apiClient.restoreSessionCookie(persisted.name, persisted.value, persisted.expiresAt)
    }

    private fun persistSessionCookie() {
        val cookie = apiClient.getCookieJar().getSessionCookie() ?: return
        sessionCookieStore.save(PersistedSessionCookie(cookie.name, cookie.value, cookie.expiresAt))
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
            sessionCookieStore.clear()
        }
        return result
    }

    suspend fun logout(): NetworkResult<LogoutResponse> {
        val result = apiClient.logout()
        sessionCookieStore.clear()
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

/**
 * A message arrived from a peer for a conversation that isn't the one currently open — the
 * signal the heads-up [com.enctxt.presentation.components.vade.MessageNotificationBanner] reacts
 * to. Carries only what's needed to render it: never plaintext, matching the "Protected
 * conversation" placeholder already used everywhere else in the list.
 */
data class IncomingMessageNotification(
    val conversationId: String,
    val peerId: String,
    val peerDisplayName: String,
    val createdAt: String,
    val isNewConversation: Boolean
)

class ConversationRepository(
    private val apiClient: ApiClient,
    private val database: EnctxtDatabase
) {
    private val _incomingNotifications = MutableSharedFlow<IncomingMessageNotification>(extraBufferCapacity = 16)
    val incomingNotifications: SharedFlow<IncomingMessageNotification> = _incomingNotifications.asSharedFlow()

    fun observeCachedConversations(): Flow<List<ConversationEntity>> =
        database.conversationDao().observeConversations()

    suspend fun fetchConversations(): NetworkResult<List<ConversationListItem>> = withContext(Dispatchers.IO) {
        when (val res = apiClient.getConversations()) {
            is NetworkResult.Success -> {
                val list = res.data.conversations
                val entities = list.map { item ->
                    val existing = database.conversationDao().getConversation(item.id)
                    ConversationEntity(
                        id = item.id,
                        peerId = item.participant.id,
                        peerUsername = item.participant.username,
                        peerDisplayName = item.participant.displayName,
                        createdAt = item.createdAt,
                        updatedAt = item.updatedAt,
                        unreadCount = existing?.unreadCount ?: 0
                    )
                }
                database.conversationDao().insertConversations(entities)
                NetworkResult.Success(list)
            }
            is NetworkResult.Error -> NetworkResult.Error(res.code, res.message, res.statusCode)
            is NetworkResult.Loading -> NetworkResult.Loading
        }
    }

    suspend fun createConversation(userId: String): NetworkResult<SingleConversationItem> = withContext(Dispatchers.IO) {
        when (val res = apiClient.createConversation(userId)) {
            is NetworkResult.Success -> {
                val conv = res.data.conversation
                val peer = conv.participant

                database.conversationDao().insertConversation(
                    ConversationEntity(
                        id = conv.id,
                        peerId = peer.id,
                        peerUsername = peer.username,
                        peerDisplayName = peer.displayName,
                        createdAt = conv.createdAt,
                        updatedAt = conv.updatedAt,
                        unreadCount = 0
                    )
                )
                NetworkResult.Success(conv)
            }
            is NetworkResult.Error -> NetworkResult.Error(res.code, res.message, res.statusCode)
            is NetworkResult.Loading -> NetworkResult.Loading
        }
    }

    suspend fun handleIncomingMessage(
        message: MessageItemDto,
        currentUserId: String,
        activeConversationId: String?
    ): Unit = withContext(Dispatchers.IO) {
        val existing = database.conversationDao().getConversation(message.conversationId)
        val isFromPeer = message.senderId != currentUserId
        val isActive = activeConversationId == message.conversationId

        if (existing != null) {
            if (isFromPeer && !isActive) {
                database.conversationDao().incrementUnreadCount(message.conversationId, message.createdAt)
                _incomingNotifications.tryEmit(
                    IncomingMessageNotification(
                        conversationId = message.conversationId,
                        peerId = existing.peerId,
                        peerDisplayName = existing.peerDisplayName.ifEmpty { existing.peerUsername },
                        createdAt = message.createdAt,
                        isNewConversation = false
                    )
                )
            } else {
                database.conversationDao().updateUpdatedAt(message.conversationId, message.createdAt)
            }
        } else {
            // New conversation (Bug 2): fetch conversation details and insert into Room
            when (val detailsResult = apiClient.getConversationDetails(message.conversationId)) {
                is NetworkResult.Success -> {
                    val details = detailsResult.data.conversation
                    val peer = details.participants.find { it.id != currentUserId }
                        ?: UserSummary(id = message.senderId, username = "contact", displayName = "Contact")
                    val unread = if (isFromPeer && !isActive) 1 else 0

                    database.conversationDao().insertConversation(
                        ConversationEntity(
                            id = message.conversationId,
                            peerId = peer.id,
                            peerUsername = peer.username,
                            peerDisplayName = peer.displayName.ifEmpty { peer.username },
                            createdAt = details.createdAt,
                            updatedAt = message.createdAt,
                            unreadCount = unread
                        )
                    )

                    if (isFromPeer && !isActive) {
                        _incomingNotifications.tryEmit(
                            IncomingMessageNotification(
                                conversationId = message.conversationId,
                                peerId = peer.id,
                                peerDisplayName = peer.displayName.ifEmpty { peer.username },
                                createdAt = message.createdAt,
                                isNewConversation = true
                            )
                        )
                    }
                }
                else -> {
                    // Fallback to full fetch
                    fetchConversations()
                }
            }
        }
    }

    suspend fun clearUnread(conversationId: String) = withContext(Dispatchers.IO) {
        database.conversationDao().clearUnreadCount(conversationId)
    }

    /**
     * Clears this conversation from the caller's own view: wipes local history and removes the
     * list entry. The server records a per-user clearedAt rather than deleting anything shared,
     * so the other participant's copy is unaffected. A later message for this conversation goes
     * through the "unknown conversation" bootstrap path in [handleIncomingMessage] exactly as it
     * would for a brand-new one, which is what brings it back into view.
     */
    suspend fun clearConversation(conversationId: String): NetworkResult<Unit> = withContext(Dispatchers.IO) {
        when (val result = apiClient.clearConversation(conversationId)) {
            is NetworkResult.Success -> {
                database.messageDao().deleteConversationMessages(conversationId)
                database.conversationDao().deleteConversation(conversationId)
                NetworkResult.Success(Unit)
            }
            is NetworkResult.Error -> NetworkResult.Error(result.code, result.message, result.statusCode)
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
    // Caches the peer's keyId alongside the key: returning a placeholder id for
    // cache hits stamped a bogus recipientKeyId onto every message sent after
    // the first fetch, corrupting the envelope metadata that key-change
    // detection and device attribution rely on.
    private val peerPublicKeyCache = ConcurrentHashMap<String, Pair<String, PublicKey>>()

    fun isIdentityInitialized(): Boolean = keyStoreManager.hasIdentityKey()

    suspend fun initializeIdentityKey(): NetworkResult<String> {
        return try {
            // A transient KeyStore read failure must never be treated as "no key exists" — doing
            // so would generate a replacement and silently destroy the real one, since
            // AndroidKeyStore overwrites an existing alias without warning. Fail closed instead:
            // surface the error and let the caller retry once the KeyStore is reachable again.
            when (val presence = keyStoreManager.checkIdentityKeyPresence()) {
                is IdentityKeyPresence.Absent -> keyStoreManager.generateIdentityKeyPair()
                is IdentityKeyPresence.Unknown -> return NetworkResult.Error(
                    "KEYSTORE_UNAVAILABLE",
                    "Could not reach the secure key store: ${presence.cause.message}"
                )
                is IdentityKeyPresence.Present -> Unit
            }

            val publicKeyBase64 = keyStoreManager.getPublicKeyBase64()
            val keyId = KeyStoreManager.deriveKeyId(publicKeyBase64)

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
            peerPublicKeyCache[userId]?.let { cached ->
                return NetworkResult.Success(cached)
            }

            when (val res = apiClient.getUserPublicKey(userId)) {
                is NetworkResult.Success -> {
                    val record = res.data.key
                    if (record == null) {
                        NetworkResult.Error("KEY_NOT_FOUND", "Peer has not published an identity key")
                    } else {
                        val pubKey = KeyAgreementEngine.parsePublicKeyFromSpkiBase64(record.publicKey)
                        val entry = Pair(record.keyId, pubKey)
                        peerPublicKeyCache[userId] = entry
                        NetworkResult.Success(entry)
                    }
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
            // The stable hash of this device's actual identity key — not a fresh random id.
            // A random value here corrupted the envelope's key-attribution metadata (every
            // outgoing message claimed a different, made-up sender key) without affecting
            // decryption itself, which derives its AES key from the real KeyStore key
            // independently of this field.
            val localKeyId = KeyStoreManager.deriveKeyId(cryptoRepository.getLocalPublicKeyBase64())

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

        if (entity.deletedAt != null) {
            return MessageUiModel(
                localId = entity.localId,
                serverMessageId = entity.serverMessageId,
                clientTempId = entity.clientTempId,
                conversationId = entity.conversationId,
                senderId = entity.senderId,
                isOutgoing = isOutgoing,
                transientPlaintext = null,
                decryptionState = DecryptionState.DECRYPTED,
                localState = localState,
                createdAt = entity.createdAt,
                senderKeyId = entity.senderKeyId,
                recipientKeyId = entity.recipientKeyId,
                deletedAt = entity.deletedAt
            )
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
                // Whether decryption of the local ciphertext succeeds is independent of whether
                // the message was actually delivered — this used to hardcode FAILED here,
                // showing "Not delivered" on messages the server had already confirmed SENT
                // purely because this device's key can no longer decrypt its own history.
                localState = localState,
                createdAt = entity.createdAt,
                senderKeyId = entity.senderKeyId,
                recipientKeyId = entity.recipientKeyId
            )
        }
    }

    suspend fun markAsRead(conversationId: String) {
        apiClient.markConversationRead(conversationId)
        database.conversationDao().clearUnreadCount(conversationId)
    }

    suspend fun syncConversation(conversationId: String) {
        syncCoordinator.syncConversation(conversationId)
    }

    suspend fun flushOfflineQueue() {
        syncCoordinator.flushOfflineQueue()
    }

    /**
     * Delete for everyone — server enforces sender-only, so this simply surfaces that failure
     * rather than re-checking senderId locally. Updates the local tombstone immediately on
     * success; the WS `message.deleted` event (handled in [SyncCoordinator]) keeps every other
     * open session in sync, including the peer's.
     */
    suspend fun deleteMessage(conversationId: String, messageId: String): NetworkResult<Unit> {
        return when (val result = apiClient.deleteMessage(conversationId, messageId)) {
            is NetworkResult.Success -> {
                database.messageDao().markMessageDeleted(messageId, result.data.deletedAt)
                NetworkResult.Success(Unit)
            }
            is NetworkResult.Error -> NetworkResult.Error(result.code, result.message, result.statusCode)
            is NetworkResult.Loading -> NetworkResult.Loading
        }
    }
}
