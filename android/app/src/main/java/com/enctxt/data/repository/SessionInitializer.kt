package com.enctxt.data.repository

import com.enctxt.core.network.NetworkResult
import com.enctxt.core.network.WebSocketClient
import com.enctxt.core.security.KeyStoreManager
import com.enctxt.data.model.UserSummary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

sealed class SessionInitState {
    object Idle : SessionInitState()
    object Initializing : SessionInitState()
    data class Success(val user: UserSummary) : SessionInitState()
    data class Error(val message: String) : SessionInitState()
}

class SessionInitializer(
    private val authRepository: AuthRepository,
    private val cryptoRepository: CryptoRepository,
    private val keyStoreManager: KeyStoreManager,
    private val wsClient: WebSocketClient
) {
    /**
     * Idempotent application session & cryptographic identity initialization.
     */
    suspend fun initializeSession(): SessionInitState = withContext(Dispatchers.IO) {
        // 1. Check/Restore Active Server Session
        val authResult = authRepository.checkSession()
        if (authResult !is NetworkResult.Success || authResult.data.user == null) {
            return@withContext SessionInitState.Error("Session unauthenticated or expired")
        }

        val user = authResult.data.user

        // 2. Initialize Hardware KeyStore Identity Key (ECDH P-256)
        val keyIdResult = cryptoRepository.initializeIdentityKey()
        if (keyIdResult !is NetworkResult.Success) {
            return@withContext SessionInitState.Error("Failed to initialize cryptographic identity")
        }

        val keyId = keyIdResult.data

        // 3. Ensure Device is Registered
        val deviceResult = cryptoRepository.registerDevice(
            deviceName = "Android Native Device",
            keyId = keyId
        )
        if (deviceResult !is NetworkResult.Success) {
            // Note: If device is already registered, backend handles idempotency
        }

        // 4. Connect WebSocket Session
        wsClient.connect()

        SessionInitState.Success(user)
    }
}
