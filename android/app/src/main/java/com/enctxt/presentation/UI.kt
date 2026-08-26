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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.GestureRepository
import com.enctxt.core.gesture.GestureRevealManager
import com.enctxt.core.gesture.RevealState
import com.enctxt.core.network.ConnectivityMonitor
import com.enctxt.core.network.NetworkResult
import com.enctxt.core.network.WebSocketClient
import com.enctxt.core.network.WebSocketState
import com.enctxt.core.security.ContactSecurityState
import com.enctxt.core.security.FingerprintEngine
import com.enctxt.core.security.KeyStoreManager
import com.enctxt.core.sync.SyncCoordinator
import com.enctxt.data.model.*
import com.enctxt.data.repository.*
import com.enctxt.presentation.components.ContactSecurityScreen
import com.enctxt.presentation.components.DeviceManagementScreen
import com.enctxt.presentation.components.GestureEnrollmentScreen
import com.enctxt.presentation.components.GestureEnrollmentViewModel
import com.enctxt.presentation.components.GestureLockedDialog
import com.enctxt.presentation.components.GestureRevealDialog
import com.enctxt.presentation.components.GestureSettingsScreen
import com.enctxt.presentation.components.ProtectedMessage
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
    private val wsClient: WebSocketClient,
    private val connectivityMonitor: ConnectivityMonitor,
    private val syncCoordinator: SyncCoordinator
) : ViewModel() {

    private val _messages = MutableStateFlow<List<MessageUiModel>>(emptyList())
    val messages: StateFlow<List<MessageUiModel>> = _messages.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    val isOnline: StateFlow<Boolean> = connectivityMonitor.isOnline
    val wsState: StateFlow<WebSocketState> = wsClient.connectionState
    val isSyncing: StateFlow<Boolean> = syncCoordinator.isGlobalSyncing

    private var activeConversationId: String? = null
    private var activePeerId: String? = null
    private var currentUserId: String? = null

    fun initializeConversation(conversationId: String, peerId: String, userId: String) {
        activeConversationId = conversationId
        activePeerId = peerId
        currentUserId = userId

        // 1. Observe Room local encrypted cache
        viewModelScope.launch {
            messageRepository.observeRoomMessages(conversationId, peerId, userId).collect { roomList ->
                _messages.value = roomList
            }
        }

        // 2. Subscribe to WebSocket room
        wsClient.subscribe(conversationId)

        // 3. Catch-up sync from REST history
        viewModelScope.launch {
            _isLoading.value = true
            messageRepository.syncConversation(conversationId)
            messageRepository.markAsRead(conversationId)
            _isLoading.value = false
        }

        // 4. Listen to real-time WebSocket frames
        viewModelScope.launch {
            wsClient.serverEvents.collect { event ->
                if (event.conversationId == conversationId) {
                    messageRepository.syncConversation(conversationId)
                }
            }
        }

        // 5. Trigger offline queue flush if online
        if (isOnline.value) {
            viewModelScope.launch {
                messageRepository.flushOfflineQueue()
            }
        }
    }

    fun sendMessage(plaintext: String) {
        val convId = activeConversationId ?: return
        val peerId = activePeerId ?: return
        val userId = currentUserId ?: return
        if (plaintext.isBlank() || plaintext.length > 5000) return

        viewModelScope.launch {
            messageRepository.sendEncryptedMessage(
                conversationId = convId,
                peerId = peerId,
                currentUserId = userId,
                plaintext = plaintext.trim(),
                isOnline = isOnline.value
            )
        }
    }

    fun retrySend(msg: MessageUiModel) {
        val convId = activeConversationId ?: return
        val peerId = activePeerId ?: return
        val userId = currentUserId ?: return
        val plaintext = msg.transientPlaintext ?: return

        viewModelScope.launch {
            messageRepository.sendEncryptedMessage(
                conversationId = convId,
                peerId = peerId,
                currentUserId = userId,
                plaintext = plaintext,
                isOnline = isOnline.value
            )
        }
    }

    override fun onCleared() {
        super.onCleared()
        activeConversationId?.let { wsClient.unsubscribe(it) }
        _messages.value = emptyList() // Flush transient decrypted plaintext from memory
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
    messageViewModel: MessageViewModel,
    gestureRepository: GestureRepository,
    contactSecurityRepository: ContactSecurityRepository,
    deviceRepository: DeviceRepository,
    cryptoRepository: CryptoRepository
) {
    val authState by authViewModel.uiState.collectAsState()
    val currentUserId = (authState as? AuthUiState.Authenticated)?.user?.id ?: ""

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
                onOpenGestureSettings = { navController.navigate("gesture-settings") },
                onOpenDevices = { navController.navigate("devices") },
                onLogout = {
                    authViewModel.logout {
                        navController.navigate("login") {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                }
            )
        }

        composable("devices") {
            DeviceManagementScreen(
                deviceRepository = deviceRepository,
                cryptoRepository = cryptoRepository,
                onBack = { navController.popBackStack() },
                onCurrentDeviceRevoked = {
                    authViewModel.logout {
                        navController.navigate("login") {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                }
            )
        }

        composable("contact-security/{peerId}/{peerName}") { backStackEntry ->
            val peerId = backStackEntry.arguments?.getString("peerId") ?: ""
            val peerName = backStackEntry.arguments?.getString("peerName") ?: ""

            ContactSecurityScreen(
                peerId = peerId,
                peerName = peerName,
                currentUserId = currentUserId,
                contactSecurityRepository = contactSecurityRepository,
                cryptoRepository = cryptoRepository,
                onBack = { navController.popBackStack() }
            )
        }

        composable("gesture-settings") {
            GestureSettingsScreen(
                repository = gestureRepository,
                userId = currentUserId,
                onBack = { navController.popBackStack() },
                onChangeGesture = { navController.navigate("gesture-enrollment") }
            )
        }

        composable("gesture-enrollment") {
            val viewModel = androidx.lifecycle.viewmodel.compose.viewModel<GestureEnrollmentViewModel>(
                factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                    @Suppress("UNCHECKED_CAST")
                    override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                        return GestureEnrollmentViewModel(gestureRepository, currentUserId) as T
                    }
                }
            )
            GestureEnrollmentScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onComplete = { navController.popBackStack() }
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

            ConversationScreen(
                conversationId = convId,
                peerId = peerId,
                peerName = peerName,
                currentUserId = currentUserId,
                viewModel = messageViewModel,
                gestureRepository = gestureRepository,
                contactSecurityRepository = contactSecurityRepository,
                onBack = { navController.popBackStack() },
                onOpenGestureSettings = { navController.navigate("gesture-settings") },
                onOpenContactSecurity = { navController.navigate("contact-security/$peerId/$peerName") }
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
    onOpenGestureSettings: () -> Unit,
    onOpenDevices: () -> Unit,
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
                        Text("Vade", fontWeight = FontWeight.Bold)
                    }
                },
                actions = {
                    IconButton(onClick = onOpenDevices) {
                        Icon(Icons.Default.Devices, contentDescription = "Device Trust & Management")
                    }
                    IconButton(onClick = onOpenGestureSettings) {
                        Icon(Icons.Default.Fingerprint, contentDescription = "Reveal Gesture Settings")
                    }
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

        Column(modifier = Modifier.weight(1f)) {
            Text(
                conversation.peerDisplayName.ifEmpty { conversation.peerUsername },
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                fontSize = 16.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
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
// 6. Conversation & Encrypted Messaging Screen (Phase 14 Reliability)
// ==============================================================================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationScreen(
    conversationId: String,
    peerId: String,
    peerName: String,
    currentUserId: String,
    viewModel: MessageViewModel,
    gestureRepository: GestureRepository,
    contactSecurityRepository: ContactSecurityRepository,
    onBack: () -> Unit,
    onOpenGestureSettings: () -> Unit = {},
    onOpenContactSecurity: () -> Unit = {}
) {
    var inputText by remember { mutableStateOf("") }
    val messages by viewModel.messages.collectAsState()
    val isOnline by viewModel.isOnline.collectAsState()
    val wsState by viewModel.wsState.collectAsState()
    val isSyncing by viewModel.isSyncing.collectAsState()
    val listState = rememberLazyListState()

    // Layer 3 gesture reveal — scoped to this screen's composition lifetime so navigating away
    // always destroys reveal/auth/lockout state (Phase 16 spec §41). Never hoisted to
    // MessageViewModel, which persists across conversation navigations.
    val revealScope = rememberCoroutineScope()
    val revealManager = remember(conversationId) {
        GestureRevealManager(gestureRepository, currentUserId, revealScope)
    }
    val revealState by revealManager.state.collectAsState()
    val revealFeedback by revealManager.feedback.collectAsState()

    var contactSecurityState by remember { mutableStateOf<ContactSecurityState>(ContactSecurityState.Unverified) }
    LaunchedEffect(peerId) {
        when (val res = contactSecurityRepository.getContactSecurityState(peerId)) {
            is NetworkResult.Success -> {
                contactSecurityState = res.data
                if (res.data is ContactSecurityState.KeyChanged) {
                    revealManager.revokeReveal()
                }
            }
            else -> {}
        }
    }

    DisposableEffect(revealManager) {
        onDispose { revealManager.dispose() }
    }

    // Background / navigation-away re-protection (§38).
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, revealManager) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_STOP) revealManager.revokeReveal()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Window-focus-loss re-protection (§40) — e.g. recents overlay, system dialog.
    val hasWindowFocus by WindowFocusMonitor.hasFocus.collectAsState()
    LaunchedEffect(hasWindowFocus, revealManager) {
        if (!hasWindowFocus) revealManager.revokeReveal()
    }

    // Layer 3 / Phase 18: Screenshot & screen-capture protection (FLAG_SECURE) during sensitive reveal & gesture auth
    val context = androidx.compose.ui.platform.LocalContext.current
    DisposableEffect(revealState) {
        val activity = context as? android.app.Activity
        val isSensitive = revealState is RevealState.Revealed || revealState is RevealState.Authenticating
        if (isSensitive) {
            activity?.window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            activity?.window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        }
        onDispose {
            activity?.window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

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
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(peerName, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            Spacer(modifier = Modifier.width(6.dp))
                            when (val sec = contactSecurityState) {
                                is ContactSecurityState.Verified -> {
                                    Box(
                                        modifier = Modifier
                                            .clickable { onOpenContactSecurity() }
                                            .background(Color(0xFF064E3B), RoundedCornerShape(8.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text("Verified ✓", fontSize = 10.sp, color = Color(0xFF10B981), fontWeight = FontWeight.Bold)
                                    }
                                }
                                is ContactSecurityState.KeyChanged -> {
                                    Box(
                                        modifier = Modifier
                                            .clickable { onOpenContactSecurity() }
                                            .background(Color(0xFF881337), RoundedCornerShape(8.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text("⚠ Key Changed", fontSize = 10.sp, color = Color(0xFFFDA4AF), fontWeight = FontWeight.Bold)
                                    }
                                }
                                is ContactSecurityState.Unverified -> {
                                    Box(
                                        modifier = Modifier
                                            .clickable { onOpenContactSecurity() }
                                            .background(Color(0xFF1E293B), RoundedCornerShape(8.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text("Unverified", fontSize = 10.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.Medium)
                                    }
                                }
                                is ContactSecurityState.NoKey -> {}
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val dotColor = if (!isOnline) Color(0xFFEF4444) else if (wsState == WebSocketState.CONNECTED) Color(0xFF10B981) else Color(0xFFF59E0B)
                            Box(modifier = Modifier.size(6.dp).background(dotColor, CircleShape))
                            Spacer(modifier = Modifier.width(4.dp))
                            val statusLabel = if (!isOnline) "Offline (Queued)" else if (isSyncing) "Syncing..." else "E2EE Active"
                            Text(statusLabel, fontSize = 11.sp, color = Color(0xFF94A3B8))
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onOpenContactSecurity) {
                        val iconTint = when (contactSecurityState) {
                            is ContactSecurityState.Verified -> Color(0xFF10B981)
                            is ContactSecurityState.KeyChanged -> Color(0xFFF43F5E)
                            else -> Color(0xFF94A3B8)
                        }
                        Icon(Icons.Default.Security, contentDescription = "Contact Security", tint = iconTint)
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
            // Offline Warning Banner
            if (!isOnline) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF7F1D1D))
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("⚠️ Offline — Outgoing messages are encrypted and queued locally.", fontSize = 11.sp, color = Color.White)
                }
            }

            // In-Chat Key Changed Warning Banner (§15)
            if (contactSecurityState is ContactSecurityState.KeyChanged) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF881337))
                        .clickable { onOpenContactSecurity() }
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFF43F5E), modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("⚠ Security key changed", fontWeight = FontWeight.Bold, fontSize = 11.sp, color = Color(0xFFFDA4AF))
                            Text(
                                "$peerName's security key has changed. Messages may not be secure until you verify $peerName's new identity.",
                                fontSize = 11.sp,
                                color = Color.White
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Icon(Icons.Default.ChevronRight, contentDescription = "Verify", tint = Color(0xFFFDA4AF), modifier = Modifier.size(16.dp))
                    }
                }
            }

            // Message Timeline
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            ) {
                items(messages, key = { it.localId }) { msg ->
                    MessageBubble(
                        msg = msg,
                        onRetry = { viewModel.retrySend(msg) },
                        revealState = revealState,
                        onRevealClick = {
                            val current = revealState
                            when {
                                current is RevealState.Revealed && current.messageId == msg.localId ->
                                    revealManager.hide()
                                !revealManager.isConfigured -> onOpenGestureSettings()
                                else -> revealManager.startReveal(msg.localId)
                            }
                        }
                    )
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
                        if (inputText.isNotBlank()) {
                            viewModel.sendMessage(inputText)
                            inputText = ""
                        }
                    },
                    enabled = inputText.isNotBlank(),
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

    // Gesture authentication modal — only rendered while actively authenticating or locked out.
    // Never shown for RevealState.Protected/Revealed, and never displays the stored gesture.
    // The dismissed flag only hides the lockout dialog's UI — it never touches the underlying
    // countdown, which keeps running in GestureRevealManager regardless of dialog visibility.
    var lockedDialogDismissed by remember(revealState is RevealState.Locked) { mutableStateOf(false) }

    when (val s = revealState) {
        is RevealState.Authenticating -> {
            GestureRevealDialog(
                state = s,
                sequenceLength = revealManager.sequenceLength,
                isConfigured = revealManager.isConfigured,
                feedback = revealFeedback,
                onStroke = { points: List<GesturePoint> -> revealManager.submitStroke(points) },
                onDismiss = { revealManager.hide() },
                onOpenSetup = {
                    revealManager.hide()
                    onOpenGestureSettings()
                }
            )
        }
        is RevealState.Locked -> {
            if (!lockedDialogDismissed) {
                GestureLockedDialog(state = s, onDismiss = { lockedDialogDismissed = true })
            }
        }
        else -> Unit
    }
}

@Composable
fun MessageBubble(
    msg: MessageUiModel,
    onRetry: () -> Unit = {},
    revealState: RevealState = RevealState.Protected,
    onRevealClick: () -> Unit = {}
) {
    val isOutgoing = msg.isOutgoing

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isOutgoing) Alignment.End else Alignment.Start
    ) {
        val isRevealedHere = revealState is RevealState.Revealed && revealState.messageId == msg.localId

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
                .then(
                    if (msg.decryptionState == DecryptionState.DECRYPTED)
                        Modifier.clickable(onClick = onRevealClick)
                    else Modifier
                )
                .padding(12.dp)
        ) {
            when (msg.decryptionState) {
                DecryptionState.DECRYPTED -> {
                    Row(verticalAlignment = Alignment.Top) {
                        ProtectedMessage(
                            content = msg.transientPlaintext ?: "",
                            revealState = revealState,
                            messageId = msg.localId,
                            color = Color.White,
                            fontSize = 14.sp,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Icon(
                            imageVector = if (isRevealedHere) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = if (isRevealedHere) "Hide message" else "Reveal message with gesture",
                            tint = Color(0xFF94A3B8),
                            modifier = Modifier.size(16.dp)
                        )
                    }
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
            val (statusText, canRetry) = when (msg.localState) {
                MessageLocalState.READ -> "✓✓ Read" to false
                MessageLocalState.DELIVERED -> "✓✓ Delivered" to false
                MessageLocalState.SENT -> "✓ Sent" to false
                MessageLocalState.SENDING -> "Sending..." to false
                MessageLocalState.PENDING_SEND -> "⏳ Queued (Offline)" to false
                MessageLocalState.FAILED -> "❌ Failed (Tap to retry)" to true
                else -> "..." to false
            }

            Text(
                text = statusText,
                fontSize = 10.sp,
                color = if (canRetry) MaterialTheme.colorScheme.error else Color.Gray,
                modifier = Modifier
                    .padding(end = 4.dp)
                    .then(if (canRetry) Modifier.clickable(onClick = onRetry) else Modifier)
            )
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
        Text("Vade", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color.White)
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
