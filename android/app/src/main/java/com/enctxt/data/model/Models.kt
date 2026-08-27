package com.enctxt.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ==============================================================================
// 1. Authentication & User DTOs (docs/api-contract.md)
// ==============================================================================

@Serializable
data class RegisterRequest(
    val username: String,
    val email: String,
    val password: String,
    val displayName: String? = null
)

@Serializable
data class LoginRequest(
    val identifier: String,
    val password: String
)

@Serializable
data class UserSummary(
    val id: String,
    val username: String,
    val displayName: String
)

@Serializable
data class UserProfile(
    val id: String,
    val username: String,
    val email: String,
    val displayName: String,
    val createdAt: String? = null
)

@Serializable
data class UpdateProfileRequest(
    val displayName: String? = null,
    val username: String? = null
)

@Serializable
data class AuthResponse(
    val authenticated: Boolean,
    val user: UserSummary? = null
)

@Serializable
data class LogoutResponse(
    val message: String
)

@Serializable
data class SearchUsersResponse(
    val users: List<UserSummary>
)

// ==============================================================================
// 2. Conversation DTOs (docs/api-contract.md)
// ==============================================================================

@Serializable
data class CreateConversationRequest(
    val userId: String
)

@Serializable
data class ConversationDetails(
    val id: String,
    val directKey: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val participants: List<UserSummary>
)

@Serializable
data class ConversationResponse(
    val conversation: ConversationDetails
)

// POST /api/conversations returns a single `participant` object, not a
// `participants` list — a distinct shape from GET /api/conversations/{id}.
// Reusing ConversationResponse here throws on decode (participants is a
// required field, never present in this response), which was silently
// swallowed as a network error and made "start conversation" a no-op tap.
@Serializable
data class SingleConversationItem(
    val id: String,
    val createdAt: String,
    val updatedAt: String,
    val participant: UserSummary
)

@Serializable
data class CreateConversationResponse(
    val conversation: SingleConversationItem
)

@Serializable
data class ConversationListItem(
    val id: String,
    val participant: UserSummary,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class ConversationListResponse(
    val conversations: List<ConversationListItem>
)

// ==============================================================================
// 3. E2EE Cryptographic Envelopes & Messages (docs/api-contract.md & crypto-protocol.md)
// ==============================================================================

@Serializable
data class EncryptedEnvelopeDto(
    val version: Int = 1,
    val algorithm: String = "AES-256-GCM",
    val keyAgreement: String = "ECDH-P256",
    val senderKeyId: String,
    val recipientKeyId: String,
    val nonce: String,
    val ciphertext: String,
    val aad: String? = null
)

@Serializable
data class SendMessageRequest(
    val envelope: EncryptedEnvelopeDto,
    val tempId: String? = null
)

@Serializable
data class MessageItemDto(
    val id: String,
    val conversationId: String,
    val senderId: String,
    val ciphertext: String,
    val nonce: String,
    val senderKeyId: String,
    val recipientKeyId: String,
    val algorithm: String = "AES-256-GCM",
    val version: Int = 1,
    val aad: String? = null,
    val status: String = "sent",
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class SendMessageResponse(
    val message: MessageItemDto
)

@Serializable
data class MessageHistoryResponse(
    val messages: List<MessageItemDto>,
    val hasMore: Boolean = false
)

// ==============================================================================
// 4. PKI Public Key & Device DTOs (docs/api-contract.md)
// ==============================================================================

@Serializable
data class PublishKeyRequest(
    val keyId: String,
    val publicKey: String,
    val algorithm: String = "ECDH-P256"
)

@Serializable
data class PublicKeyResponse(
    val userId: String,
    val keyId: String,
    val publicKey: String,
    val algorithm: String = "ECDH-P256",
    val status: String = "active",
    val createdAt: String? = null
)

@Serializable
data class RegisterDeviceRequest(
    val deviceName: String,
    val platform: String = "android",
    val keyId: String
)

@Serializable
data class DeviceDto(
    val id: String,
    val deviceName: String,
    val platform: String,
    val keyId: String,
    val status: String = "active",
    val lastSeenAt: String? = null,
    val createdAt: String? = null
)

@Serializable
data class DeviceListResponse(
    val devices: List<DeviceDto>
)

@Serializable
data class RevokeDeviceResponse(
    val success: Boolean,
    val revokedDeviceId: String
)

data class DeviceRecord(
    val id: String,
    val deviceName: String,
    val platform: String,
    val keyId: String,
    val status: String = "active",
    val lastSeenAt: String? = null,
    val createdAt: String? = null,
    val isCurrentDevice: Boolean = false
)

// ==============================================================================
// 5. System Health & Error Models (docs/api-contract.md)
// ==============================================================================

@Serializable
data class HealthResponse(
    val status: String,
    val timestamp: String? = null,
    val uptime: Long? = null,
    val database: String? = null,
    val version: String? = null
)

@Serializable
data class ReadinessResponse(
    val ready: Boolean,
    val database: String,
    val timestamp: String
)

@Serializable
data class ApiErrorDetail(
    val code: String,
    val message: String,
    val details: String? = null
)

@Serializable
data class ApiErrorResponse(
    val error: ApiErrorDetail
)

// ==============================================================================
// 6. WebSocket Message Models (docs/websocket-protocol.md)
// ==============================================================================

@Serializable
data class WSClientMessage(
    val type: String,
    val token: String? = null,
    val conversationId: String? = null,
    val messageId: String? = null
)

@Serializable
data class WSServerMessage(
    val type: String,
    val userId: String? = null,
    val conversationId: String? = null,
    val messageId: String? = null,
    val message: MessageItemDto? = null,
    val deliveredAt: String? = null,
    val readAt: String? = null,
    val readBy: String? = null,
    val code: String? = null
)

// ==============================================================================
// 7. Domain & UI State Models (Zero Plaintext Persistence)
// ==============================================================================

enum class DecryptionState {
    DECRYPTED,
    DECRYPTING,
    DECRYPTION_FAILED,
    UNSUPPORTED
}

enum class MessageLocalState(val rank: Int) {
    PENDING_ENCRYPTION(0),
    ENCRYPTING(1),
    PENDING_SEND(2),
    SENDING(3),
    SENT(4),
    DELIVERED(5),
    READ(6),
    FAILED(-1);

    fun canTransitionTo(newState: MessageLocalState): Boolean {
        if (this == READ) return false // Read is terminal forward state
        if (newState == FAILED) return true // Any active state can fail
        return newState.rank >= this.rank
    }
}

data class MessageUiModel(
    val localId: String,
    val serverMessageId: String?,
    val clientTempId: String? = null,
    val conversationId: String,
    val senderId: String,
    val isOutgoing: Boolean,
    val transientPlaintext: String? = null, // In transient memory only, never saved to Room
    val decryptionState: DecryptionState = DecryptionState.DECRYPTED,
    val localState: MessageLocalState = MessageLocalState.SENT,
    val createdAt: String,
    val senderKeyId: String,
    val recipientKeyId: String
)

data class ConversationUiModel(
    val id: String,
    val peerId: String,
    val peerUsername: String,
    val peerDisplayName: String,
    val updatedAt: String,
    val previewPlaceholder: String = "Protected conversation",
    val unreadCount: Int = 0,
    val isSyncing: Boolean = false
)
