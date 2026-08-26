package com.enctxt.core.sync

import com.enctxt.core.storage.EncryptedMessageEntity
import com.enctxt.data.model.MessageItemDto
import com.enctxt.data.model.MessageLocalState

object MessageStateReconciler {

    /**
     * Determines whether an incoming delivery state can legally advance the current local state.
     * Prevents out-of-order WebSocket frames (e.g. late delivered event) from regressing a read message.
     */
    fun reconcileDeliveryState(
        currentState: MessageLocalState,
        incomingStatus: String
    ): MessageLocalState {
        val targetState = when (incomingStatus.lowercase()) {
            "read" -> MessageLocalState.READ
            "delivered" -> MessageLocalState.DELIVERED
            "sent" -> MessageLocalState.SENT
            "failed" -> MessageLocalState.FAILED
            else -> currentState
        }

        return if (currentState.canTransitionTo(targetState)) {
            targetState
        } else {
            currentState
        }
    }

    /**
     * Merges an incoming server DTO into an existing local entity.
     * Preserves local primary key while updating authoritative server ID and timestamps.
     */
    fun mergeServerDtoWithEntity(
        existing: EncryptedMessageEntity?,
        dto: MessageItemDto,
        localIdFallback: String
    ): EncryptedMessageEntity {
        val currentLocalState = existing?.localState?.let {
            try { MessageLocalState.valueOf(it) } catch (_: Exception) { MessageLocalState.SENT }
        } ?: MessageLocalState.SENT

        val resolvedState = reconcileDeliveryState(currentLocalState, dto.status)

        return EncryptedMessageEntity(
            localId = existing?.localId ?: localIdFallback,
            serverMessageId = dto.id,
            clientTempId = existing?.clientTempId,
            conversationId = dto.conversationId,
            senderId = dto.senderId,
            ciphertext = dto.ciphertext,
            nonce = dto.nonce,
            senderKeyId = dto.senderKeyId,
            recipientKeyId = dto.recipientKeyId,
            algorithm = dto.algorithm,
            version = dto.version,
            aad = dto.aad,
            localState = resolvedState.name,
            createdAt = dto.createdAt,
            updatedAt = dto.updatedAt
        )
    }
}
