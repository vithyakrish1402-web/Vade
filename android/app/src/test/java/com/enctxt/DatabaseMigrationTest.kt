package com.enctxt

import androidx.sqlite.db.SupportSQLiteDatabase
import com.enctxt.core.storage.EnctxtDatabase
import org.junit.Assert.*
import org.junit.Test
import java.lang.reflect.Proxy

class DatabaseMigrationTest {

    private fun createRecordingDatabase(executedStatements: MutableList<String>): SupportSQLiteDatabase {
        return Proxy.newProxyInstance(
            SupportSQLiteDatabase::class.java.classLoader,
            arrayOf(SupportSQLiteDatabase::class.java)
        ) { _, method, args ->
            if (method.name == "execSQL" && args != null && args.isNotEmpty()) {
                executedStatements.add(args[0] as String)
            }
            null
        } as SupportSQLiteDatabase
    }

    @Test
    fun testMigration2To3_AddsUnreadCountColumnSafely() {
        val executed = mutableListOf<String>()
        val db = createRecordingDatabase(executed)

        EnctxtDatabase.MIGRATION_2_3.migrate(db)

        assertEquals(1, executed.size)
        assertEquals("ALTER TABLE conversations ADD COLUMN unreadCount INTEGER NOT NULL DEFAULT 0", executed[0])
    }

    @Test
    fun testMigration1To2_AddsSyncColumnsSafely() {
        val executed = mutableListOf<String>()
        val db = createRecordingDatabase(executed)

        EnctxtDatabase.MIGRATION_1_2.migrate(db)

        assertEquals(2, executed.size)
        assertEquals("ALTER TABLE conversations ADD COLUMN lastSyncedAt INTEGER NOT NULL DEFAULT 0", executed[0])
        assertEquals("ALTER TABLE conversations ADD COLUMN lastKnownMessageId TEXT", executed[1])
    }

    @Test
    fun testMigration1To3_AddsAllColumnsSafely() {
        val executed = mutableListOf<String>()
        val db = createRecordingDatabase(executed)

        EnctxtDatabase.MIGRATION_1_3.migrate(db)

        assertEquals(3, executed.size)
        assertEquals("ALTER TABLE conversations ADD COLUMN lastSyncedAt INTEGER NOT NULL DEFAULT 0", executed[0])
        assertEquals("ALTER TABLE conversations ADD COLUMN lastKnownMessageId TEXT", executed[1])
        assertEquals("ALTER TABLE conversations ADD COLUMN unreadCount INTEGER NOT NULL DEFAULT 0", executed[2])
    }

    @Test
    fun testMigration3To4_AddsDeletedAtColumnSafely() {
        val executed = mutableListOf<String>()
        val db = createRecordingDatabase(executed)

        EnctxtDatabase.MIGRATION_3_4.migrate(db)

        assertEquals(1, executed.size)
        assertEquals("ALTER TABLE encrypted_messages ADD COLUMN deletedAt TEXT", executed[0])
    }

    @Test
    fun testMigration1To4_AddsAllColumnsSafely() {
        val executed = mutableListOf<String>()
        val db = createRecordingDatabase(executed)

        EnctxtDatabase.MIGRATION_1_4.migrate(db)

        assertEquals(4, executed.size)
        assertEquals("ALTER TABLE conversations ADD COLUMN lastSyncedAt INTEGER NOT NULL DEFAULT 0", executed[0])
        assertEquals("ALTER TABLE conversations ADD COLUMN lastKnownMessageId TEXT", executed[1])
        assertEquals("ALTER TABLE conversations ADD COLUMN unreadCount INTEGER NOT NULL DEFAULT 0", executed[2])
        assertEquals("ALTER TABLE encrypted_messages ADD COLUMN deletedAt TEXT", executed[3])
    }

    @Test
    fun testMigration2To4_AddsRemainingColumnsSafely() {
        val executed = mutableListOf<String>()
        val db = createRecordingDatabase(executed)

        EnctxtDatabase.MIGRATION_2_4.migrate(db)

        assertEquals(2, executed.size)
        assertEquals("ALTER TABLE conversations ADD COLUMN unreadCount INTEGER NOT NULL DEFAULT 0", executed[0])
        assertEquals("ALTER TABLE encrypted_messages ADD COLUMN deletedAt TEXT", executed[1])
    }
}
