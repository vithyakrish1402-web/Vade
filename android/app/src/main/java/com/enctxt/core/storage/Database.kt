package com.enctxt.core.storage

import androidx.room.*
import kotlinx.coroutines.flow.Flow

// ==============================================================================
// 1. Room Entities (Zero Plaintext Invariant)
// ==============================================================================

@Entity(tableName = "user_sessions")
data class UserSessionEntity(
    @PrimaryKey val userId: String,
    val username: String,
    val displayName: String,
    val email: String? = null,
    val lastActiveAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "conversations")
data class ConversationEntity(
    @PrimaryKey val id: String,
    val peerId: String,
    val peerUsername: String,
    val peerDisplayName: String,
    val createdAt: String,
    val updatedAt: String,
    val lastSyncedAt: Long = 0L,
    val lastKnownMessageId: String? = null
)

@Entity(
    tableName = "encrypted_messages",
    indices = [
        Index(value = ["conversationId", "createdAt"]),
        Index(value = ["serverMessageId"], unique = false),
        Index(value = ["clientTempId"], unique = false),
        Index(value = ["localState"])
    ]
)
data class EncryptedMessageEntity(
    @PrimaryKey val localId: String,
    val serverMessageId: String? = null,
    val clientTempId: String? = null,
    val conversationId: String,
    val senderId: String,
    val ciphertext: String,
    val nonce: String,
    val senderKeyId: String,
    val recipientKeyId: String,
    val algorithm: String = "AES-256-GCM",
    val version: Int = 1,
    val aad: String? = null,
    val localState: String = "SENT", // PENDING_SEND, SENDING, SENT, DELIVERED, READ, FAILED
    val createdAt: String,
    val updatedAt: String
)

// ==============================================================================
// 2. Room DAOs
// ==============================================================================

@Dao
interface SessionDao {
    @Query("SELECT * FROM user_sessions LIMIT 1")
    suspend fun getActiveSession(): UserSessionEntity?

    @Query("SELECT * FROM user_sessions LIMIT 1")
    fun observeActiveSession(): Flow<UserSessionEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveSession(session: UserSessionEntity)

    @Query("DELETE FROM user_sessions")
    suspend fun clearSession()
}

@Dao
interface ConversationDao {
    @Query("SELECT * FROM conversations ORDER BY updatedAt DESC")
    fun observeConversations(): Flow<List<ConversationEntity>>

    @Query("SELECT * FROM conversations WHERE id = :id LIMIT 1")
    suspend fun getConversation(id: String): ConversationEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertConversations(conversations: List<ConversationEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertConversation(conversation: ConversationEntity)

    @Query("UPDATE conversations SET lastSyncedAt = :syncedAt, lastKnownMessageId = :lastMsgId WHERE id = :convId")
    suspend fun updateSyncCursor(convId: String, syncedAt: Long, lastMsgId: String?)

    @Query("DELETE FROM conversations")
    suspend fun clearAll()
}

@Dao
interface MessageDao {
    @Query("SELECT * FROM encrypted_messages WHERE conversationId = :conversationId ORDER BY createdAt ASC")
    fun observeMessages(conversationId: String): Flow<List<EncryptedMessageEntity>>

    @Query("SELECT * FROM encrypted_messages WHERE localState = 'PENDING_SEND' ORDER BY createdAt ASC")
    suspend fun getPendingSendMessages(): List<EncryptedMessageEntity>

    @Query("SELECT * FROM encrypted_messages WHERE serverMessageId = :serverMessageId LIMIT 1")
    suspend fun getMessageByServerId(serverMessageId: String): EncryptedMessageEntity?

    @Query("SELECT * FROM encrypted_messages WHERE clientTempId = :clientTempId LIMIT 1")
    suspend fun getMessageByClientTempId(clientTempId: String): EncryptedMessageEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: EncryptedMessageEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessages(messages: List<EncryptedMessageEntity>)

    @Query("UPDATE encrypted_messages SET localState = :state, serverMessageId = :serverId, updatedAt = :updatedAt WHERE localId = :localId")
    suspend fun updateMessageState(localId: String, state: String, serverId: String?, updatedAt: String)

    @Query("UPDATE encrypted_messages SET localState = :state, updatedAt = :updatedAt WHERE serverMessageId = :serverMessageId")
    suspend fun updateDeliveryState(serverMessageId: String, state: String, updatedAt: String)

    @Query("DELETE FROM encrypted_messages WHERE localId = :localId")
    suspend fun deleteMessage(localId: String)

    @Query("DELETE FROM encrypted_messages WHERE conversationId = :conversationId")
    suspend fun deleteConversationMessages(conversationId: String)

    @Query("DELETE FROM encrypted_messages")
    suspend fun clearAllMessages()
}

// ==============================================================================
// 3. Database Singleton Definition
// ==============================================================================

@Database(
    entities = [
        UserSessionEntity::class,
        ConversationEntity::class,
        EncryptedMessageEntity::class
    ],
    version = 2,
    exportSchema = false
)
abstract class EnctxtDatabase : RoomDatabase() {
    abstract fun sessionDao(): SessionDao
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao
}
