package com.enctxt.core.sync

import com.enctxt.core.network.ApiClient
import com.enctxt.core.network.NetworkResult
import com.enctxt.core.network.WebSocketClient
import com.enctxt.core.network.WebSocketState
import com.enctxt.core.storage.EncryptedMessageEntity
import com.enctxt.core.storage.EnctxtDatabase
import com.enctxt.data.model.EncryptedEnvelopeDto
import com.enctxt.data.model.MessageLocalState
import com.enctxt.data.model.SendMessageRequest
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class SyncCoordinator(
    private val apiClient: ApiClient,
    private val wsClient: WebSocketClient,
    private val database: EnctxtDatabase
) {
    private val conversationSyncLocks = ConcurrentHashMap<String, Mutex>()
    private val globalSyncLock = Mutex()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    var conversationRepository: com.enctxt.data.repository.ConversationRepository? = null
    var activeConversationId: String? = null
    var currentUserId: String? = null

    private val _isGlobalSyncing = MutableStateFlow(false)
    val isGlobalSyncing: StateFlow<Boolean> = _isGlobalSyncing.asStateFlow()

    init {
        // Observe WebSocket state: on reconnection, trigger catch-up synchronization
        scope.launch {
            wsClient.connectionState.collect { state ->
                if (state == WebSocketState.CONNECTED) {
                    flushOfflineQueue()
                    conversationRepository?.fetchConversations()
                }
            }
        }

        // Global listener for WebSocket real-time events
        scope.launch {
            wsClient.serverEvents.collect { event ->
                when {
                    event.type == "message.created" && event.message != null -> {
                        val uid = currentUserId ?: database.sessionDao().getActiveSession()?.userId ?: ""
                        conversationRepository?.handleIncomingMessage(
                            message = event.message,
                            currentUserId = uid,
                            activeConversationId = activeConversationId
                        )
                    }

                    // Delete-for-everyone — arrives for both the sender's and recipient's other
                    // sessions, so this must apply even when this device was the one that
                    // issued the delete via REST (it'll just be a harmless no-op re-tombstone).
                    event.type == "message.deleted" && event.messageId != null && event.deletedAt != null -> {
                        database.messageDao().markMessageDeleted(event.messageId, event.deletedAt)
                    }

                    // Per-user only — arrives solely on this account's OTHER sessions when one
                    // of them clears a chat, so this device's copy is only ever asked to catch
                    // up, never told to clear something the peer did.
                    event.type == "conversation.cleared" && event.conversationId != null -> {
                        database.messageDao().deleteConversationMessages(event.conversationId)
                        database.conversationDao().deleteConversation(event.conversationId)
                    }
                }
            }
        }
    }

    private fun getLockForConversation(conversationId: String): Mutex {
        return conversationSyncLocks.getOrPut(conversationId) { Mutex() }
    }

    /**
     * Synchronizes message history for a specific conversation from the authoritative REST API.
     * Merges messages idempotently into Room and avoids duplicating existing records.
     */
    suspend fun syncConversation(
        conversationId: String,
        limit: Int = 50,
        before: String? = null
    ): NetworkResult<Int> = withContext(Dispatchers.IO) {
        val lock = getLockForConversation(conversationId)
        lock.withLock {
            when (val res = apiClient.getMessages(conversationId, limit, before)) {
                is NetworkResult.Success -> {
                    val dtos = res.data.messages
                    var mergedCount = 0

                    dtos.forEach { dto ->
                        val existingByServerId = database.messageDao().getMessageByServerId(dto.id)
                        val mergedEntity = MessageStateReconciler.mergeServerDtoWithEntity(
                            existing = existingByServerId,
                            dto = dto,
                            localIdFallback = UUID.randomUUID().toString()
                        )
                        database.messageDao().insertMessage(mergedEntity)
                        mergedCount++
                    }

                    // Update conversation sync timestamp and updatedAt
                    database.conversationDao().updateSyncCursor(
                        convId = conversationId,
                        syncedAt = System.currentTimeMillis(),
                        lastMsgId = dtos.firstOrNull()?.id
                    )
                    dtos.maxByOrNull { it.createdAt }?.createdAt?.let { latestAt ->
                        database.conversationDao().updateUpdatedAt(conversationId, latestAt)
                    }

                    NetworkResult.Success(mergedCount)
                }
                is NetworkResult.Error -> NetworkResult.Error(res.code, res.message, res.statusCode)
                is NetworkResult.Loading -> NetworkResult.Loading
            }
        }
    }

    /**
     * Flushes the offline encrypted message queue when network connectivity is restored.
     * Transmits only encrypted envelopes; never handles plaintext.
     */
    suspend fun flushOfflineQueue() = withContext(Dispatchers.IO) {
        globalSyncLock.withLock {
            val pendingMessages = database.messageDao().getPendingSendMessages()
            if (pendingMessages.isEmpty()) return@withContext

            _isGlobalSyncing.value = true

            // Process pending messages sequentially to preserve chronological ordering
            pendingMessages.forEach { msg ->
                try {
                    val envelope = EncryptedEnvelopeDto(
                        version = msg.version,
                        algorithm = msg.algorithm,
                        keyAgreement = "ECDH-P256",
                        senderKeyId = msg.senderKeyId,
                        recipientKeyId = msg.recipientKeyId,
                        nonce = msg.nonce,
                        ciphertext = msg.ciphertext,
                        aad = msg.aad
                    )

                    database.messageDao().updateMessageState(
                        localId = msg.localId,
                        state = MessageLocalState.SENDING.name,
                        serverId = null,
                        updatedAt = msg.updatedAt
                    )

                    val sendResult = apiClient.sendMessage(
                        conversationId = msg.conversationId,
                        request = SendMessageRequest(
                            envelope = envelope,
                            tempId = msg.clientTempId ?: msg.localId
                        )
                    )

                    when (sendResult) {
                        is NetworkResult.Success -> {
                            val serverMsg = sendResult.data.message
                            database.messageDao().updateMessageState(
                                localId = msg.localId,
                                state = MessageLocalState.SENT.name,
                                serverId = serverMsg.id,
                                updatedAt = serverMsg.createdAt
                            )
                        }
                        is NetworkResult.Error -> {
                            // If 4xx client error (permanent rejection), mark FAILED
                            if (sendResult.statusCode != null && sendResult.statusCode in 400..499) {
                                database.messageDao().updateMessageState(
                                    localId = msg.localId,
                                    state = MessageLocalState.FAILED.name,
                                    serverId = null,
                                    updatedAt = msg.updatedAt
                                )
                            } else {
                                // Network timeout / 5xx server error: keep as PENDING_SEND for future retry
                                database.messageDao().updateMessageState(
                                    localId = msg.localId,
                                    state = MessageLocalState.PENDING_SEND.name,
                                    serverId = null,
                                    updatedAt = msg.updatedAt
                                )
                            }
                        }
                        else -> Unit
                    }
                } catch (_: Exception) {
                    database.messageDao().updateMessageState(
                        localId = msg.localId,
                        state = MessageLocalState.PENDING_SEND.name,
                        serverId = null,
                        updatedAt = msg.updatedAt
                    )
                }
            }

            _isGlobalSyncing.value = false
        }
    }
}
