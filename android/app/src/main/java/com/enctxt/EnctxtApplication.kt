package com.enctxt

import android.app.Application
import androidx.room.Room
import com.enctxt.core.gesture.EncryptedGestureStorage
import com.enctxt.core.gesture.GestureRepository
import com.enctxt.core.network.ApiClient
import com.enctxt.core.network.ConnectivityMonitor
import com.enctxt.core.network.NetworkConfig
import com.enctxt.core.network.WebSocketClient
import com.enctxt.core.security.EncryptedSessionCookieStore
import com.enctxt.core.security.KeyStoreManager
import com.enctxt.core.storage.EnctxtDatabase
import com.enctxt.core.sync.SyncCoordinator
import com.enctxt.data.repository.*

class EnctxtApplication : Application() {

    lateinit var database: EnctxtDatabase
        private set

    lateinit var apiClient: ApiClient
        private set

    lateinit var wsClient: WebSocketClient
        private set

    lateinit var connectivityMonitor: ConnectivityMonitor
        private set

    lateinit var keyStoreManager: KeyStoreManager
        private set

    lateinit var syncCoordinator: SyncCoordinator
        private set

    lateinit var gestureRepository: GestureRepository
        private set

    lateinit var contactSecurityRepository: ContactSecurityRepository
        private set

    lateinit var deviceRepository: DeviceRepository
        private set

    lateinit var authRepository: AuthRepository
        private set

    lateinit var userRepository: UserRepository
        private set

    lateinit var conversationRepository: ConversationRepository
        private set

    lateinit var cryptoRepository: CryptoRepository
        private set

    lateinit var messageRepository: MessageRepository
        private set

    lateinit var sessionInitializer: SessionInitializer
        private set

    override fun onCreate() {
        super.onCreate()

        // 1. Initialize Room Database (Zero Plaintext Invariant)
        database = Room.databaseBuilder(
            applicationContext,
            EnctxtDatabase::class.java,
            "enctxt_native.db"
        )
            .addMigrations(
                EnctxtDatabase.MIGRATION_1_2,
                EnctxtDatabase.MIGRATION_2_3,
                EnctxtDatabase.MIGRATION_1_3
            )
            .fallbackToDestructiveMigration()
            .fallbackToDestructiveMigrationOnDowngrade()
            .build()

        // 2. Initialize networking & security primitives
        val networkConfig = NetworkConfig()
        apiClient = ApiClient(config = networkConfig)
        wsClient = WebSocketClient(config = networkConfig, cookieJar = apiClient.getCookieJar())
        connectivityMonitor = ConnectivityMonitor(applicationContext)
        keyStoreManager = KeyStoreManager()

        // 3. Sync coordinator
        syncCoordinator = SyncCoordinator(apiClient, wsClient, database)

        // 3b. Layer 3 gesture reveal — local-only, never touches apiClient/database/network.
        gestureRepository = GestureRepository(EncryptedGestureStorage(applicationContext))

        // 3c. Layer 4 verification storage & device management — local-only encrypted prefs for verifications.
        val verificationStorage = com.enctxt.core.security.EncryptedVerificationStorage(applicationContext)
        contactSecurityRepository = ContactSecurityRepository(verificationStorage, apiClient)
        deviceRepository = DeviceRepository(apiClient)

        // 4. Initialize repositories
        authRepository = AuthRepository(apiClient, database, EncryptedSessionCookieStore(applicationContext))
        userRepository = UserRepository(apiClient)
        conversationRepository = ConversationRepository(apiClient, database)
        syncCoordinator.conversationRepository = conversationRepository
        cryptoRepository = CryptoRepository(apiClient, keyStoreManager)
        messageRepository = MessageRepository(apiClient, database, cryptoRepository, syncCoordinator)

        // 5. Session Initializer
        sessionInitializer = SessionInitializer(
            authRepository = authRepository,
            cryptoRepository = cryptoRepository,
            keyStoreManager = keyStoreManager,
            wsClient = wsClient
        )
    }
}
