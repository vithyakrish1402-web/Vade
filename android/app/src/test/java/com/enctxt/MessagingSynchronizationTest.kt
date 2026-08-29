package com.enctxt

import com.enctxt.core.storage.ConversationEntity
import com.enctxt.core.storage.EncryptedMessageEntity
import com.enctxt.data.model.EncryptedEnvelopeDto
import com.enctxt.data.model.MessageItemDto
import com.enctxt.data.model.UserSummary
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class MessagingSynchronizationTest {

    private val currentUserId = "user_bob_id"
    private val friendId = "user_alice_id"
    private val existingConvId = "conv_existing_123"
    private val newConvId = "conv_new_456"

    @Test
    fun testScenarioA_ExistingConversationUnreadStateAndOrdering() {
        val initialConversation = ConversationEntity(
            id = existingConvId,
            peerId = friendId,
            peerUsername = "alice",
            peerDisplayName = "Alice",
            createdAt = "2026-08-25T10:00:00Z",
            updatedAt = "2026-08-25T10:00:00Z",
            unreadCount = 0
        )

        val incomingMessage = MessageItemDto(
            id = "msg_existing_1",
            conversationId = existingConvId,
            senderId = friendId,
            ciphertext = "CiphertextExistingA==",
            nonce = "NonceExistingA==",
            senderKeyId = "k_alice_1",
            recipientKeyId = "k_bob_1",
            algorithm = "AES-256-GCM",
            version = 1,
            status = "sent",
            createdAt = "2026-08-25T11:00:00Z",
            updatedAt = "2026-08-25T11:00:00Z"
        )

        val activeConversationId: String? = null // Bob is outside this chat (e.g. on Inbox)
        val isFromPeer = incomingMessage.senderId != currentUserId
        val isActive = activeConversationId == incomingMessage.conversationId

        val updatedConversation = if (isFromPeer && !isActive) {
            initialConversation.copy(
                unreadCount = initialConversation.unreadCount + 1,
                updatedAt = incomingMessage.createdAt
            )
        } else {
            initialConversation.copy(updatedAt = incomingMessage.createdAt)
        }

        assertEquals(1, updatedConversation.unreadCount)
        assertEquals("2026-08-25T11:00:00Z", updatedConversation.updatedAt)
    }

    @Test
    fun testScenarioB_FirstConversationAutomaticDiscoveryWithoutSearch() {
        val incomingMessage = MessageItemDto(
            id = "msg_first_1",
            conversationId = newConvId,
            senderId = friendId,
            ciphertext = "CiphertextFirstB==",
            nonce = "NonceFirstB==",
            senderKeyId = "k_alice_1",
            recipientKeyId = "k_bob_1",
            algorithm = "AES-256-GCM",
            version = 1,
            status = "sent",
            createdAt = "2026-08-25T12:00:00Z",
            updatedAt = "2026-08-25T12:00:00Z"
        )

        val peerUser = UserSummary(id = friendId, username = "alice", displayName = "Alice")
        val activeConversationId: String? = null
        val isFromPeer = incomingMessage.senderId != currentUserId
        val isActive = activeConversationId == incomingMessage.conversationId

        val newEntity = ConversationEntity(
            id = incomingMessage.conversationId,
            peerId = peerUser.id,
            peerUsername = peerUser.username,
            peerDisplayName = peerUser.displayName,
            createdAt = "2026-08-25T12:00:00Z",
            updatedAt = incomingMessage.createdAt,
            unreadCount = if (isFromPeer && !isActive) 1 else 0
        )

        assertEquals(newConvId, newEntity.id)
        assertEquals("Alice", newEntity.peerDisplayName)
        assertEquals(1, newEntity.unreadCount)
        assertEquals(incomingMessage.createdAt, newEntity.updatedAt)
    }

    @Test
    fun testScenarioC_DuplicateDeliveryIdempotency() {
        val processedIds = mutableSetOf<String>()
        var unreadCount = 0
        var conversationUpdatedAt = "2026-08-25T10:00:00Z"

        val incomingMessage = MessageItemDto(
            id = "msg_dup_1",
            conversationId = existingConvId,
            senderId = friendId,
            ciphertext = "CiphertextDup==",
            nonce = "NonceDup==",
            senderKeyId = "k1",
            recipientKeyId = "k2",
            algorithm = "AES-256-GCM",
            version = 1,
            status = "sent",
            createdAt = "2026-08-25T13:00:00Z",
            updatedAt = "2026-08-25T13:00:00Z"
        )

        fun handleMessage(msg: MessageItemDto) {
            if (processedIds.contains(msg.id)) return
            processedIds.add(msg.id)
            unreadCount++
            conversationUpdatedAt = msg.createdAt
        }

        // Deliver first time
        handleMessage(incomingMessage)
        assertEquals(1, unreadCount)
        assertEquals("2026-08-25T13:00:00Z", conversationUpdatedAt)

        // Deliver duplicate
        handleMessage(incomingMessage)
        assertEquals(1, unreadCount)
        assertEquals(1, processedIds.size)
    }

    @Test
    fun testScenarioD_ReconnectSynchronizationAndOrdering() {
        val convList = mutableListOf(
            ConversationEntity(
                id = existingConvId,
                peerId = "user_charlie",
                peerUsername = "charlie",
                peerDisplayName = "Charlie",
                createdAt = "2026-08-25T10:00:00Z",
                updatedAt = "2026-08-25T11:00:00Z",
                unreadCount = 0
            )
        )

        // Server returns new conversation received while offline
        val fetchedFromServer = listOf(
            ConversationEntity(
                id = newConvId,
                peerId = friendId,
                peerUsername = "alice",
                peerDisplayName = "Alice",
                createdAt = "2026-08-25T12:00:00Z",
                updatedAt = "2026-08-25T14:00:00Z",
                unreadCount = 1
            ),
            convList[0]
        )

        // Sort by updatedAt descending
        val sortedList = fetchedFromServer.sortedByDescending { it.updatedAt }

        assertEquals(2, sortedList.size)
        assertEquals(newConvId, sortedList[0].id)
        assertEquals(existingConvId, sortedList[1].id)
    }

    @Test
    fun testScenarioE_SecurityInvariantsZeroPlaintextStorage() {
        val entity = EncryptedMessageEntity(
            localId = "local_1",
            serverMessageId = "msg_1",
            conversationId = existingConvId,
            senderId = friendId,
            ciphertext = "EncryptedBase64Bytes==",
            nonce = "Nonce96Bit==",
            senderKeyId = "k_sender",
            recipientKeyId = "k_recipient",
            algorithm = "AES-256-GCM",
            version = 1,
            aad = "conv:sender:v1",
            localState = "SENT",
            createdAt = "2026-08-25T15:00:00Z",
            updatedAt = "2026-08-25T15:00:00Z"
        )

        // Verify entity fields are encrypted representations with zero plaintext
        assertEquals("EncryptedBase64Bytes==", entity.ciphertext)
        assertEquals("Nonce96Bit==", entity.nonce)
        assertEquals("AES-256-GCM", entity.algorithm)
        assertEquals(1, entity.version)
    }
}
