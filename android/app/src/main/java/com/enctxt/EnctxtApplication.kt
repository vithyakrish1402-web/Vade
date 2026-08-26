package com.enctxt

import android.app.Application
import androidx.room.Room
import com.enctxt.core.network.ApiClient
import com.enctxt.core.network.NetworkConfig
import com.enctxt.core.network.WebSocketClient
import com.enctxt.core.security.KeyStoreManager
import com.enctxt.core.storage.EnctxtDatabase
import com.enctxt.data.repository.*

class EnctxtApplication : Application() {

    lateinit var database: EnctxtDatabase
        private set

    lateinit var apiClient: ApiClient
        private set

    lateinit var wsClient: WebSocketClient
        private set

    lateinit var keyStoreManager: KeyStoreManager
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

        // 1. Initialize local Room database (Zero-Plaintext Invariant)
        database = Room.databaseBuilder(
            applicationContext,
            EnctxtDatabase::class.java,
            "enctxt_native.db"
        ).build()

        // 2. Initialize networking & security primitives
        val networkConfig = NetworkConfig()
        apiClient = ApiClient(config = networkConfig)
        wsClient = WebSocketClient(config = networkConfig, cookieJar = apiClient.getCookieJar())
        keyStoreManager = KeyStoreManager()

        // 3. Initialize repositories
        authRepository = AuthRepository(apiClient, database)
        userRepository = UserRepository(apiClient)
        conversationRepository = ConversationRepository(apiClient, database)
        cryptoRepository = CryptoRepository(apiClient, keyStoreManager)
        messageRepository = MessageRepository(apiClient, database, cryptoRepository)

        // 4. Session Initializer
        sessionInitializer = SessionInitializer(
            authRepository = authRepository,
            cryptoRepository = cryptoRepository,
            keyStoreManager = keyStoreManager,
            wsClient = wsClient
        )
    }
}
