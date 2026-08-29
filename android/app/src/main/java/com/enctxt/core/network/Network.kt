package com.enctxt.core.network

import com.enctxt.BuildConfig
import com.enctxt.data.model.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

// ==============================================================================
// 1. Network Configuration & Result Sealed Class
// ==============================================================================

data class NetworkConfig(
    val baseUrl: String = BuildConfig.API_BASE_URL,
    val wsUrl: String = BuildConfig.WS_URL,
    val connectTimeoutSeconds: Long = 10,
    val readTimeoutSeconds: Long = 30
)

sealed class NetworkResult<out T> {
    data class Success<out T>(val data: T) : NetworkResult<T>()
    data class Error(val code: String, val message: String, val statusCode: Int? = null) : NetworkResult<Nothing>()
    object Loading : NetworkResult<Nothing>()
}

// ==============================================================================
// 2. Cookie Management for Session Authentications
// ==============================================================================

class MemoryCookieJar : CookieJar {
    private val cookieStore = ConcurrentHashMap<String, MutableList<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val hostCookies = cookieStore.getOrPut(url.host) { mutableListOf() }
        cookies.forEach { newCookie ->
            hostCookies.removeAll { it.name == newCookie.name }
            hostCookies.add(newCookie)
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val validCookies = mutableListOf<Cookie>()
        cookieStore[url.host]?.let { list ->
            val now = System.currentTimeMillis()
            list.removeAll { it.expiresAt < now }
            validCookies.addAll(list)
        }
        return validCookies
    }

    fun getSessionCookie(cookieName: String = "enctxt_session"): Cookie? {
        return cookieStore.values.flatten().find { it.name == cookieName }
    }

    /** Injects a cookie recovered from persistent "remember me" storage, ahead of any request. */
    fun restoreCookie(host: String, name: String, value: String, expiresAt: Long) {
        val cookie = Cookie.Builder()
            .name(name)
            .value(value)
            .domain(host)
            .path("/")
            .expiresAt(expiresAt)
            .build()
        val hostCookies = cookieStore.getOrPut(host) { mutableListOf() }
        hostCookies.removeAll { it.name == name }
        hostCookies.add(cookie)
    }

    fun clear() {
        cookieStore.clear()
    }
}

// ==============================================================================
// 3. Centralized REST API Client (Conforming to docs/api-contract.md)
// ==============================================================================

open class ApiClient(
    private val config: NetworkConfig = NetworkConfig(),
    private val cookieJar: MemoryCookieJar = MemoryCookieJar()
) {
    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .connectTimeout(config.connectTimeoutSeconds, TimeUnit.SECONDS)
        .readTimeout(config.readTimeoutSeconds, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    open suspend fun register(request: RegisterRequest): NetworkResult<AuthResponse> =
        executePost("/auth/register", request)

    open suspend fun login(request: LoginRequest): NetworkResult<AuthResponse> =
        executePost("/auth/login", request)

    open suspend fun getMe(): NetworkResult<AuthResponse> =
        executeGet("/auth/me")

    open suspend fun logout(): NetworkResult<LogoutResponse> {
        val res = executePost<Unit, LogoutResponse>("/auth/logout", Unit)
        cookieJar.clear()
        return res
    }

    open suspend fun getProfile(): NetworkResult<UserProfile> =
        executeGet("/users/me")

    open suspend fun searchUsers(query: String): NetworkResult<SearchUsersResponse> =
        executeGet("/users/search?q=$query")

    open suspend fun getConversations(page: Int = 1, limit: Int = 20): NetworkResult<ConversationListResponse> =
        executeGet("/conversations?page=$page&limit=$limit")

    open suspend fun getConversationDetails(id: String): NetworkResult<ConversationResponse> =
        executeGet("/conversations/$id")

    open suspend fun createConversation(userId: String): NetworkResult<CreateConversationResponse> =
        executePost("/conversations", CreateConversationRequest(userId))

    open suspend fun getMessages(
        conversationId: String,
        limit: Int = 50,
        before: String? = null
    ): NetworkResult<MessageHistoryResponse> {
        val path = if (before != null) {
            "/conversations/$conversationId/messages?limit=$limit&before=$before"
        } else {
            "/conversations/$conversationId/messages?limit=$limit"
        }
        return executeGet(path)
    }

    open suspend fun sendMessage(
        conversationId: String,
        request: SendMessageRequest
    ): NetworkResult<SendMessageResponse> =
        executePost("/conversations/$conversationId/messages", request)

    open suspend fun markConversationRead(conversationId: String): NetworkResult<Unit> =
        executePost("/conversations/$conversationId/read", Unit)

    open suspend fun publishIdentityKey(request: PublishKeyRequest): NetworkResult<Unit> =
        executePost("/crypto/identity", request)

    open suspend fun getUserPublicKey(userId: String): NetworkResult<PublicKeyResponse> =
        executeGet("/crypto/users/$userId/key")

    open suspend fun registerDevice(request: RegisterDeviceRequest): NetworkResult<DeviceDto> =
        executePost("/devices/register", request)

    open suspend fun getDevices(): NetworkResult<DeviceListResponse> =
        executeGet("/devices")

    open suspend fun revokeDevice(deviceId: String): NetworkResult<RevokeDeviceResponse> =
        executePost("/devices/$deviceId/revoke", Unit)

    open suspend fun getHealth(): NetworkResult<HealthResponse> =
        executeGet("/health")

    open suspend fun getReadiness(): NetworkResult<ReadinessResponse> =
        executeGet("/health/ready")

    private suspend inline fun <reified T> executeGet(path: String): NetworkResult<T> =
        withContext(Dispatchers.IO) {
            try {
                val request = Request.Builder()
                    .url(config.baseUrl + path)
                    .get()
                    .build()

                executeRequest(request)
            } catch (e: Exception) {
                NetworkResult.Error("NETWORK_ERROR", e.message ?: "Connection failure")
            }
        }

    private suspend inline fun <reified REQ, reified RES> executePost(path: String, body: REQ): NetworkResult<RES> =
        withContext(Dispatchers.IO) {
            try {
                val jsonBody = if (body is Unit) "{}" else json.encodeToString(body)
                val request = Request.Builder()
                    .url(config.baseUrl + path)
                    .post(jsonBody.toRequestBody(jsonMediaType))
                    .build()

                executeRequest(request)
            } catch (e: Exception) {
                NetworkResult.Error("NETWORK_ERROR", e.message ?: "Connection failure")
            }
        }

    private inline fun <reified T> executeRequest(request: Request): NetworkResult<T> {
        val response = okHttpClient.newCall(request).execute()
        val responseBody = response.body?.string() ?: ""

        return if (response.isSuccessful) {
            if (T::class == Unit::class) {
                @Suppress("UNCHECKED_CAST")
                NetworkResult.Success(Unit as T)
            } else {
                val parsed = json.decodeFromString<T>(responseBody)
                NetworkResult.Success(parsed)
            }
        } else {
            val errorDetail = try {
                val errResponse = json.decodeFromString<ApiErrorResponse>(responseBody)
                errResponse.error
            } catch (_: Exception) {
                ApiErrorDetail("HTTP_${response.code}", response.message.ifEmpty { "Request failed" })
            }
            NetworkResult.Error(errorDetail.code, errorDetail.message, response.code)
        }
    }

    fun getCookieJar(): MemoryCookieJar = cookieJar

    /** Re-injects a "remember me" cookie recovered from encrypted storage, against this build's configured host. */
    fun restoreSessionCookie(name: String, value: String, expiresAt: Long) {
        val host = config.baseUrl.toHttpUrl().host
        cookieJar.restoreCookie(host, name, value, expiresAt)
    }
}

// ==============================================================================
// 4. Native WebSocket Client (Conforming to docs/websocket-protocol.md)
// ==============================================================================

enum class WebSocketState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
    FAILED
}

class WebSocketClient(
    private val config: NetworkConfig = NetworkConfig(),
    private val cookieJar: MemoryCookieJar = MemoryCookieJar()
) : WebSocketListener() {

    private val json = Json { ignoreUnknownKeys = true }
    private val _connectionState = MutableStateFlow(WebSocketState.DISCONNECTED)
    val connectionState: StateFlow<WebSocketState> = _connectionState.asStateFlow()

    private val _serverEvents = MutableSharedFlow<WSServerMessage>(extraBufferCapacity = 64)
    val serverEvents: SharedFlow<WSServerMessage> = _serverEvents.asSharedFlow()

    private var webSocket: WebSocket? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var heartbeatJob: Job? = null
    private var reconnectAttempt = 0
    private var shouldReconnect = true

    private val subscribedRooms = ConcurrentHashMap.newKeySet<String>()

    fun connect() {
        shouldReconnect = true
        if (_connectionState.value == WebSocketState.CONNECTED || _connectionState.value == WebSocketState.CONNECTING) {
            return
        }

        _connectionState.value = WebSocketState.CONNECTING

        val client = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()

        val request = Request.Builder()
            .url(config.wsUrl)
            .build()

        webSocket = client.newWebSocket(request, this)
    }

    fun disconnect() {
        shouldReconnect = false
        stopHeartbeat()
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        _connectionState.value = WebSocketState.DISCONNECTED
    }

    fun subscribe(conversationId: String) {
        subscribedRooms.add(conversationId)
        send(WSClientMessage(type = "subscribe", conversationId = conversationId))
    }

    fun unsubscribe(conversationId: String) {
        subscribedRooms.remove(conversationId)
        send(WSClientMessage(type = "unsubscribe", conversationId = conversationId))
    }

    fun sendDeliveryReceipt(conversationId: String, messageId: String) {
        send(WSClientMessage(type = "message.delivered", conversationId = conversationId, messageId = messageId))
    }

    fun sendReadReceipt(conversationId: String, messageId: String) {
        send(WSClientMessage(type = "message.read", conversationId = conversationId, messageId = messageId))
    }

    fun send(message: WSClientMessage) {
        val payload = json.encodeToString(message)
        webSocket?.send(payload)
    }

    override fun onOpen(webSocket: WebSocket, response: Response) {
        _connectionState.value = WebSocketState.CONNECTED
        reconnectAttempt = 0
        startHeartbeat()

        // Resubscribe to active conversation rooms after reconnect
        subscribedRooms.forEach { convId ->
            send(WSClientMessage(type = "subscribe", conversationId = convId))
        }
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
        try {
            val message = json.decodeFromString<WSServerMessage>(text)
            scope.launch { _serverEvents.emit(message) }
        } catch (_: Exception) {
            // Ignore malformed frames safely without crashing
        }
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
        webSocket.close(1000, null)
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        stopHeartbeat()
        _connectionState.value = WebSocketState.DISCONNECTED
        if (shouldReconnect) {
            scheduleReconnect()
        }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        stopHeartbeat()
        _connectionState.value = WebSocketState.FAILED
        if (shouldReconnect) {
            scheduleReconnect()
        }
    }

    private fun startHeartbeat() {
        stopHeartbeat()
        heartbeatJob = scope.launch {
            while (isActive && _connectionState.value == WebSocketState.CONNECTED) {
                delay(30000) // 30s heartbeat
                send(WSClientMessage(type = "ping"))
            }
        }
    }

    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    private fun scheduleReconnect() {
        scope.launch {
            _connectionState.value = WebSocketState.RECONNECTING
            reconnectAttempt++
            val delayMs = minOf(10000L, (1000L * (1 shl (reconnectAttempt - 1))))
            delay(delayMs)
            connect()
        }
    }
}
