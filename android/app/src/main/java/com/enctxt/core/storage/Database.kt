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
    val updatedAt: String
)

@Entity(
    tableName = "encrypted_messages",
    indices = [
        Index(value = ["conversationId", "createdAt"]),
        Index(value = ["senderId"])
    ]
)
data class EncryptedMessageEntity(
    @PrimaryKey val id: String,
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

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertConversations(conversations: List<ConversationEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertConversation(conversation: ConversationEntity)

    @Query("DELETE FROM conversations")
    suspend fun clearAll()
}

@Dao
interface MessageDao {
    @Query("SELECT * FROM encrypted_messages WHERE conversationId = :conversationId ORDER BY createdAt ASC")
    fun observeMessages(conversationId: String): Flow<List<EncryptedMessageEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: EncryptedMessageEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessages(messages: List<EncryptedMessageEntity>)

    @Query("DELETE FROM encrypted_messages WHERE conversationId = :conversationId")
    suspend fun deleteConversationMessages(conversationId: String)
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
    version = 1,
    exportSchema = false
)
abstract class EnctxtDatabase : RoomDatabase() {
    abstract fun sessionDao(): SessionDao
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao
}
