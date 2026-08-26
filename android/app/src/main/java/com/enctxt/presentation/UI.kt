package com.enctxt.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.enctxt.core.network.NetworkResult
import com.enctxt.core.network.WebSocketClient
import com.enctxt.core.network.WebSocketState
import com.enctxt.core.security.FingerprintEngine
import com.enctxt.core.security.KeyStoreManager
import com.enctxt.data.model.*
import com.enctxt.data.repository.*
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

// ==============================================================================
// 1. Compose Theme & Color Palette
// ==============================================================================

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF10B981), // Emerald-500
    onPrimary = Color.Black,
    secondary = Color(0xFF334155), // Slate-700
    onSecondary = Color.White,
    background = Color(0xFF090D16), // Deep Slate-950
    onBackground = Color(0xFFF1F5F9),
    surface = Color(0xFF0F172A), // Slate-900
    onSurface = Color(0xFFE2E8F0),
    error = Color(0xFFF43F5E), // Rose-500
    onError = Color.White
)

@Composable
fun EnctxtTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}

// ==============================================================================
// 2. ViewModels
// ==============================================================================

sealed class AuthUiState {
    object Idle : AuthUiState()
    object Loading : AuthUiState()
    data class Authenticated(val user: UserSummary) : AuthUiState()
    data class Error(val message: String) : AuthUiState()
}

class AuthViewModel(
    private val authRepository: AuthRepository,
    private val cryptoRepository: CryptoRepository,
    private val sessionInitializer: SessionInitializer
) : ViewModel() {

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        checkCurrentSession()
    }

    fun checkCurrentSession() {
        viewModelScope.launch {
            when (val init = sessionInitializer.initializeSession()) {
                is SessionInitState.Success -> {
                    _uiState.value = AuthUiState.Authenticated(init.user)
                }
                else -> {
                    _uiState.value = AuthUiState.Idle
                }
            }
        }
    }

    fun login(identifier: String, pass: String) {
        if (identifier.isBlank() || pass.isBlank()) {
            _uiState.value = AuthUiState.Error("Username/email and password are required")
            return
        }
        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            when (val res = authRepository.login(LoginRequest(identifier, pass))) {
                is NetworkResult.Success -> {
                    cryptoRepository.initializeIdentityKey()
                    val user = res.data.user ?: UserSummary("id", identifier, identifier)
                    _uiState.value = AuthUiState.Authenticated(user)
                }
                is NetworkResult.Error -> {
                    _uiState.value = AuthUiState.Error(res.message)
                }
                else -> Unit
            }
        }
    }

    fun register(user: String, email: String, pass: String, name: String) {
        if (user.isBlank() || email.isBlank() || pass.isBlank()) {
            _uiState.value = AuthUiState.Error("All fields are required")
            return
        }
        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            when (val res = authRepository.register(RegisterRequest(user, email, pass, name.ifEmpty { null }))) {
                is NetworkResult.Success -> {
                    cryptoRepository.initializeIdentityKey()
                    val u = res.data.user ?: UserSummary("id", user, name.ifEmpty { user })
                    _uiState.value = AuthUiState.Authenticated(u)
                }
                is NetworkResult.Error -> {
                    _uiState.value = AuthUiState.Error(res.message)
                }
                else -> Unit
            }
        }
    }

    fun logout(onLoggedOut: () -> Unit) {
        viewModelScope.launch {
            authRepository.logout()
            _uiState.value = AuthUiState.Idle
            onLoggedOut()
        }
    }

    fun resetError() {
        if (_uiState.value is AuthUiState.Error) {
            _uiState.value = AuthUiState.Idle
        }
    }
}

class ConversationViewModel(
    private val conversationRepository: ConversationRepository
) : ViewModel() {

    val cachedConversations = conversationRepository.observeCachedConversations()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _isLoading.value = true
            conversationRepository.fetchConversations()
            _isLoading.value = false
        }
    }
}

@OptIn(FlowPreview::class)
class SearchViewModel(
    private val userRepository: UserRepository,
    private val conversationRepository: ConversationRepository
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _searchResults = MutableStateFlow<List<UserSummary>>(emptyList())
    val searchResults: StateFlow<List<UserSummary>> = _searchResults.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    init {
        viewModelScope.launch {
            _query
                .debounce(300)
                .filter { it.trim().length >= 2 }
                .distinctUntilChanged()
                .collect { q ->
                    _isSearching.value = true
                    when (val res = userRepository.searchUsers(q)) {
                        is NetworkResult.Success -> _searchResults.value = res.data
                        else -> _searchResults.value = emptyList()
                    }
                    _isSearching.value = false
                }
        }
    }

    fun onQueryChanged(newQuery: String) {
        _query.value = newQuery
        if (newQuery.isBlank()) {
            _searchResults.value = emptyList()
        }
    }

    fun startConversation(user: UserSummary, onConversationReady: (String, String, String) -> Unit) {
        viewModelScope.launch {
            when (val res = conversationRepository.createConversation(user.id)) {
                is NetworkResult.Success -> {
                    onConversationReady(res.data.id, user.id, user.displayName.ifEmpty { user.username })
                }
                else -> Unit
            }
        }
    }
}

class MessageViewModel(
    private val messageRepository: MessageRepository,
    private val wsClient: WebSocketClient
) : ViewModel() {

    private val _messages = MutableStateFlow<List<MessageUiModel>>(emptyList())
    val messages: StateFlow<List<MessageUiModel>> = _messages.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _isSending = MutableStateFlow(false)
    val isSending: StateFlow<Boolean> = _isSending.asStateFlow()

    val wsState: StateFlow<WebSocketState> = wsClient.connectionState

    private var activeConversationId: String? = null
    private var activePeerId: String? = null
    private var currentUserId: String? = null

    fun initializeConversation(conversationId: String, peerId: String, userId: String) {
        activeConversationId = conversationId
        activePeerId = peerId
        currentUserId = userId

        // Subscribe to WebSocket room
        wsClient.subscribe(conversationId)

        // Load message history
        loadHistory()

        // Listen for incoming WebSocket messages
        viewModelScope.launch {
            wsClient.serverEvents.collect { event ->
                if (event.conversationId == conversationId) {
                    when (event.type) {
                        "message.created" -> {
                            event.message?.let { dto ->
                                if (_messages.value.none { it.id == dto.id }) {
                                    val uiModel = messageRepository.decryptDtoToUiModel(dto, conversationId, peerId, userId)
                                    _messages.value = _messages.value + uiModel
                                    // Mark conversation read
                                    messageRepository.markAsRead(conversationId)
                                }
                            }
                        }
                        "message.delivered" -> {
                            _messages.value = _messages.value.map { msg ->
                                if (msg.id == event.messageId && msg.deliveryState == DeliveryState.SENT) {
                                    msg.copy(deliveryState = DeliveryState.DELIVERED)
                                } else msg
                            }
                        }
                        "message.read" -> {
                            _messages.value = _messages.value.map { msg ->
                                msg.copy(deliveryState = DeliveryState.READ)
                            }
                        }
                    }
                }
            }
        }
    }

    fun loadHistory() {
        val convId = activeConversationId ?: return
        val peerId = activePeerId ?: return
        val userId = currentUserId ?: return

        viewModelScope.launch {
            _isLoading.value = true
            when (val res = messageRepository.fetchMessageHistory(convId, peerId, userId)) {
                is NetworkResult.Success -> {
                    _messages.value = res.data
                    messageRepository.markAsRead(convId)
                }
                else -> Unit
            }
            _isLoading.value = false
        }
    }

    fun sendMessage(plaintext: String) {
        val convId = activeConversationId ?: return
        val peerId = activePeerId ?: return
        val userId = currentUserId ?: return
        if (plaintext.isBlank() || plaintext.length > 5000) return

        viewModelScope.launch {
            _isSending.value = true
            when (val res = messageRepository.sendEncryptedMessage(convId, peerId, userId, plaintext.trim())) {
                is NetworkResult.Success -> {
                    _messages.value = _messages.value + res.data
                }
                else -> Unit
            }
            _isSending.value = false
        }
    }

    override fun onCleared() {
        super.onCleared()
        activeConversationId?.let { wsClient.unsubscribe(it) }
    }
}

// ==============================================================================
// 3. Compose Navigation & Screens
// ==============================================================================

@Composable
fun NavGraph(
    navController: androidx.navigation.NavHostController,
    authViewModel: AuthViewModel,
    conversationViewModel: ConversationViewModel,
    searchViewModel: SearchViewModel,
    messageViewModel: MessageViewModel
) {
    val authState by authViewModel.uiState.collectAsState()

    NavHost(
        navController = navController,
        startDestination = if (authState is AuthUiState.Authenticated) "conversations" else "login"
    ) {
        composable("login") {
            LoginScreen(
                viewModel = authViewModel,
                onNavigateToRegister = { navController.navigate("register") },
                onLoginSuccess = {
                    navController.navigate("conversations") {
                        popUpTo("login") { inclusive = true }
                    }
                }
            )
        }

        composable("register") {
            RegisterScreen(
                viewModel = authViewModel,
                onNavigateToLogin = { navController.popBackStack() },
                onRegisterSuccess = {
                    navController.navigate("conversations") {
                        popUpTo("register") { inclusive = true }
                    }
                }
            )
        }

        composable("conversations") {
            ConversationListScreen(
                viewModel = conversationViewModel,
                onOpenSearch = { navController.navigate("search") },
                onOpenConversation = { convId, peerId, peerName ->
                    navController.navigate("conversation/$convId/$peerId/$peerName")
                },
                onLogout = {
                    authViewModel.logout {
                        navController.navigate("login") {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                }
            )
        }

        composable("search") {
            SearchScreen(
                viewModel = searchViewModel,
                onBack = { navController.popBackStack() },
                onStartChat = { convId, peerId, peerName ->
                    navController.navigate("conversation/$convId/$peerId/$peerName") {
                        popUpTo("search") { inclusive = true }
                    }
                }
            )
        }

        composable("conversation/{convId}/{peerId}/{peerName}") { backStackEntry ->
            val convId = backStackEntry.arguments?.getString("convId") ?: ""
            val peerId = backStackEntry.arguments?.getString("peerId") ?: ""
            val peerName = backStackEntry.arguments?.getString("peerName") ?: ""
            val currentUserId = (authState as? AuthUiState.Authenticated)?.user?.id ?: ""

            ConversationScreen(
                conversationId = convId,
                peerId = peerId,
                peerName = peerName,
                currentUserId = currentUserId,
                viewModel = messageViewModel,
                onBack = { navController.popBackStack() }
            )
        }
    }
}

// ==============================================================================
// 4. Conversation List Screen
// ==============================================================================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationListScreen(
    viewModel: ConversationViewModel,
    onOpenSearch: () -> Unit,
    onOpenConversation: (String, String, String) -> Unit,
    onLogout: () -> Unit
) {
    val conversations by viewModel.cachedConversations.collectAsState(initial = emptyList())
    val isLoading by viewModel.isLoading.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Shield, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("ENCTXT", fontWeight = FontWeight.Bold)
                    }
                },
                actions = {
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.ExitToApp, contentDescription = "Log Out")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onOpenSearch,
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = Color.Black
            ) {
                Icon(Icons.Default.Add, contentDescription = "Start Conversation")
            }
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (conversations.isEmpty() && !isLoading) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(Icons.Default.ChatBubbleOutline, contentDescription = null, tint = Color.Gray, modifier = Modifier.size(56.dp))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("No Conversations Yet", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                    Text("Tap '+' below to start an encrypted chat", fontSize = 13.sp, color = Color.Gray)
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(conversations, key = { it.id }) { conv ->
                        ConversationItemRow(
                            conversation = conv,
                            onClick = { onOpenConversation(conv.id, conv.peerId, conv.peerDisplayName.ifEmpty { conv.peerUsername }) }
                        )
                        HorizontalDivider(color = Color(0xFF1E293B))
                    }
                }
            }
        }
    }
}

@Composable
fun ConversationItemRow(
    conversation: com.enctxt.core.storage.ConversationEntity,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Avatar
        Box(
            modifier = Modifier
                .size(48.dp)
                .background(MaterialTheme.colorScheme.secondary, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            val initial = conversation.peerDisplayName.take(1).uppercase()
                .ifEmpty { conversation.peerUsername.take(1).uppercase() }
            Text(initial, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        }

        Spacer(modifier = Modifier.width(16.dp))

        // Names & Zero-Plaintext Placeholder
        Column(modifier = Modifier.weight(1f)) {
            Text(
                conversation.peerDisplayName.ifEmpty { conversation.peerUsername },
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                fontSize = 16.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
            // Privacy-Safe Placeholder (Zero Plaintext Preview Invariant)
            Text(
                "🔒 Protected conversation",
                fontSize = 13.sp,
                color = Color(0xFF94A3B8),
                fontStyle = androidx.compose.ui.text.font.FontStyle.Italic
            )
        }
    }
}

// ==============================================================================
// 5. User Search Screen
// ==============================================================================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    viewModel: SearchViewModel,
    onBack: () -> Unit,
    onStartChat: (String, String, String) -> Unit
) {
    val query by viewModel.query.collectAsState()
    val results by viewModel.searchResults.collectAsState()
    val isSearching by viewModel.isSearching.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("New Conversation") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            OutlinedTextField(
                value = query,
                onValueChange = { viewModel.onQueryChanged(it) },
                label = { Text("Search by username...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            if (isSearching) {
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(results, key = { it.id }) { user ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { viewModel.startConversation(user, onStartChat) }
                                .padding(vertical = 12.dp, horizontal = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier.size(40.dp).background(MaterialTheme.colorScheme.secondary, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(user.username.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(user.displayName.ifEmpty { user.username }, fontWeight = FontWeight.SemiBold, color = Color.White)
                                Text("@${user.username}", fontSize = 12.sp, color = Color.Gray)
                            }
                        }
                        HorizontalDivider(color = Color(0xFF1E293B))
                    }
                }
            }
        }
    }
}

// ==============================================================================
// 6. Conversation & Encrypted Messaging Screen
// ==============================================================================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationScreen(
    conversationId: String,
    peerId: String,
    peerName: String,
    currentUserId: String,
    viewModel: MessageViewModel,
    onBack: () -> Unit
) {
    var inputText by remember { mutableStateOf("") }
    val messages by viewModel.messages.collectAsState()
    val isSending by viewModel.isSending.collectAsState()
    val wsState by viewModel.wsState.collectAsState()
    val listState = rememberLazyListState()

    LaunchedEffect(conversationId) {
        viewModel.initializeConversation(conversationId, peerId, currentUserId)
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(peerName, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val dotColor = if (wsState == WebSocketState.CONNECTED) Color(0xFF10B981) else Color(0xFFF59E0B)
                            Box(modifier = Modifier.size(6.dp).background(dotColor, CircleShape))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("E2EE Active", fontSize = 11.sp, color = Color(0xFF94A3B8))
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Message Timeline
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            ) {
                items(messages, key = { it.id }) { msg ->
                    MessageBubble(msg = msg)
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }

            // Message Composer
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = inputText,
                    onValueChange = { if (it.length <= 5000) inputText = it },
                    placeholder = { Text("End-to-end encrypted message...", fontSize = 13.sp) },
                    modifier = Modifier.weight(1f),
                    maxLines = 4,
                    shape = RoundedCornerShape(20.dp)
                )

                Spacer(modifier = Modifier.width(8.dp))

                IconButton(
                    onClick = {
                        if (inputText.isNotBlank() && !isSending) {
                            viewModel.sendMessage(inputText)
                            inputText = ""
                        }
                    },
                    enabled = inputText.isNotBlank() && !isSending,
                    modifier = Modifier
                        .size(44.dp)
                        .background(
                            if (inputText.isNotBlank()) MaterialTheme.colorScheme.primary else Color.DarkGray,
                            CircleShape
                        )
                ) {
                    Icon(Icons.Default.Send, contentDescription = "Send", tint = Color.Black)
                }
            }
        }
    }
}

@Composable
fun MessageBubble(msg: MessageUiModel) {
    val isOutgoing = msg.isOutgoing

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isOutgoing) Alignment.End else Alignment.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 280.dp)
                .background(
                    if (isOutgoing) Color(0xFF065F46) else Color(0xFF1E293B),
                    RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (isOutgoing) 16.dp else 4.dp,
                        bottomEnd = if (isOutgoing) 4.dp else 16.dp
                    )
                )
                .padding(12.dp)
        ) {
            when (msg.decryptionState) {
                DecryptionState.DECRYPTED -> {
                    Text(
                        text = msg.transientPlaintext ?: "",
                        color = Color.White,
                        fontSize = 14.sp
                    )
                }
                DecryptionState.DECRYPTION_FAILED -> {
                    Text(
                        text = "⚠️ Unable to decrypt message",
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 13.sp,
                        fontStyle = androidx.compose.ui.text.font.FontStyle.Italic
                    )
                }
                else -> {
                    Text(
                        text = "Decrypting...",
                        color = Color.Gray,
                        fontSize = 13.sp
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(2.dp))

        // Delivery Status
        if (isOutgoing) {
            val statusText = when (msg.deliveryState) {
                DeliveryState.READ -> "✓✓ Read"
                DeliveryState.DELIVERED -> "✓✓ Delivered"
                DeliveryState.SENT -> "✓ Sent"
                DeliveryState.SENDING -> "Sending..."
                DeliveryState.FAILED -> "Failed"
            }
            Text(statusText, fontSize = 10.sp, color = Color.Gray, modifier = Modifier.padding(end = 4.dp))
        }
    }
}

// ==============================================================================
// 7. Login & Register Screens
// ==============================================================================

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onNavigateToRegister: () -> Unit,
    onLoginSuccess: () -> Unit
) {
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState) {
        if (uiState is AuthUiState.Authenticated) {
            onLoginSuccess()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(Icons.Default.Shield, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(56.dp))
        Spacer(modifier = Modifier.height(12.dp))
        Text("ENCTXT", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text("End-to-End Encrypted Private Chat", fontSize = 13.sp, color = Color.Gray)

        Spacer(modifier = Modifier.height(32.dp))

        OutlinedTextField(
            value = identifier,
            onValueChange = { identifier = it; viewModel.resetError() },
            label = { Text("Username or Email") },
            leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it; viewModel.resetError() },
            label = { Text("Password") },
            leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )

        if (uiState is AuthUiState.Error) {
            Spacer(modifier = Modifier.height(12.dp))
            Text((uiState as AuthUiState.Error).message, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = { viewModel.login(identifier, password) },
            enabled = uiState !is AuthUiState.Loading,
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
        ) {
            if (uiState is AuthUiState.Loading) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.Black)
            } else {
                Text("Sign In", fontWeight = FontWeight.Bold, color = Color.Black)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        TextButton(onClick = onNavigateToRegister) {
            Text("Don't have an account? Sign Up", color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
fun RegisterScreen(
    viewModel: AuthViewModel,
    onNavigateToLogin: () -> Unit,
    onRegisterSuccess: () -> Unit
) {
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState) {
        if (uiState is AuthUiState.Authenticated) {
            onRegisterSuccess()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Create Account", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text("Register for end-to-end encrypted messaging", fontSize = 12.sp, color = Color.Gray)

        Spacer(modifier = Modifier.height(24.dp))

        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("Username") },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email Address") },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = displayName,
            onValueChange = { displayName = it },
            label = { Text("Display Name") },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )

        if (uiState is AuthUiState.Error) {
            Spacer(modifier = Modifier.height(12.dp))
            Text((uiState as AuthUiState.Error).message, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
        }

        Spacer(modifier = Modifier.height(20.dp))

        Button(
            onClick = { viewModel.register(username, email, password, displayName) },
            enabled = uiState !is AuthUiState.Loading,
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
        ) {
            Text("Create Account", fontWeight = FontWeight.Bold, color = Color.Black)
        }

        Spacer(modifier = Modifier.height(12.dp))

        TextButton(onClick = onNavigateToLogin) {
            Text("Already have an account? Sign In", color = MaterialTheme.colorScheme.primary)
        }
    }
}
