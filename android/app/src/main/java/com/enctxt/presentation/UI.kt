package com.enctxt.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.indication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.ripple.rememberRipple
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.core.gesture.GestureRepository
import com.enctxt.core.gesture.GestureRevealManager
import com.enctxt.core.gesture.RevealState
import com.enctxt.core.privacy.ProtectedRenderMode
import com.enctxt.core.privacy.SharedPrefsProtectionStylePreference
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
import com.enctxt.presentation.components.vade.*
import com.enctxt.presentation.theme.*
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

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

    fun login(identifier: String, pass: String, rememberMe: Boolean = true) {
        if (identifier.isBlank() || pass.isBlank()) {
            _uiState.value = AuthUiState.Error("Username/email and password are required")
            return
        }
        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            when (val res = authRepository.login(LoginRequest(identifier, pass), rememberMe)) {
                is NetworkResult.Success -> {
                    sessionInitializer.initializeSession()
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
                    sessionInitializer.initializeSession()
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

    // Re-entering the same conversation screen (e.g. navigating back to it, or
    // any recomposition that re-triggers LaunchedEffect) previously stacked a
    // brand new set of these forever-running collectors on every call, with
    // nothing ever cancelling the old ones. Each leaked observer independently
    // re-decrypts the entire message list on every Room/WebSocket event,
    // which multiplies with every re-entry — this is what caused the flood of
    // duplicate GET /crypto/users/{id}/key calls (dozens of concurrent copies
    // racing to populate the same cache) and the resulting UI/send stalls.
    private var messageObserverJob: Job? = null
    private var wsListenerJob: Job? = null

    fun initializeConversation(conversationId: String, peerId: String, userId: String) {
        activeConversationId = conversationId
        activePeerId = peerId
        currentUserId = userId
        syncCoordinator.activeConversationId = conversationId
        syncCoordinator.currentUserId = userId

        messageObserverJob?.cancel()
        wsListenerJob?.cancel()

        // 1. Observe Room local encrypted cache
        messageObserverJob = viewModelScope.launch {
            messageRepository.observeRoomMessages(conversationId, peerId, userId).collect { roomList ->
                _messages.value = roomList
            }
        }

        // 2. Subscribe to WebSocket room
        wsClient.subscribe(conversationId)

        // 3. Catch-up sync from REST history and clear unread count
        viewModelScope.launch {
            _isLoading.value = true
            messageRepository.syncConversation(conversationId)
            messageRepository.markAsRead(conversationId)
            _isLoading.value = false
        }

        // 4. Listen to real-time WebSocket frames
        wsListenerJob = viewModelScope.launch {
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
        syncCoordinator.activeConversationId = null
        activeConversationId?.let { wsClient.unsubscribe(it) }
        _messages.value = emptyList() // Flush transient decrypted plaintext from memory
    }
}

// ==============================================================================
// 3. Navigation shell
// ==============================================================================

/** The three roots that carry the bottom bar. Everything else is a pushed screen. */
private val ROOT_DESTINATIONS = listOf(
    Triple("conversations", "Messages", Icons.Default.ChatBubbleOutline),
    Triple("search", "Search", Icons.Default.Search),
    Triple("profile", "Profile", Icons.Default.PersonOutline)
)

/**
 * An 82dp bar with a 4dp active dot. Every item carries an accessible name, so the selected
 * state never rests on colour alone. Drawn over the navigation inset, with content padded by
 * WindowInsets rather than a fixed value.
 */
@Composable
private fun VadeBottomBar(navController: NavController) {
    val colors = vadeColors
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.bg)
    ) {
        HorizontalDivider(color = colors.line, thickness = 1.dp)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(82.dp)
                .padding(horizontal = 34.dp)
                .padding(top = 6.dp)
        ) {
            ROOT_DESTINATIONS.forEach { (route, label, icon) ->
                val isSelected = currentDestination?.hierarchy?.any { it.route == route } == true

                // The whole cell stays the tap target, but the press indication is an
                // unbounded circular ripple centred on the icon. A bounded ripple fills the
                // cell, and on a bar with no visible cell edges a rectangular slab of grey
                // reads as a rendering glitch rather than as feedback.
                val interactionSource = remember { MutableInteractionSource() }

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clickable(
                            interactionSource = interactionSource,
                            indication = null,
                            role = Role.Tab
                        ) {
                            if (!isSelected) {
                                navController.navigate(route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        }
                        .semantics { contentDescription = label },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(VadeSpace.touchTarget)
                            .indication(
                                interactionSource = interactionSource,
                                indication = rememberRipple(bounded = false, radius = 26.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            icon,
                            contentDescription = null,
                            tint = if (isSelected) colors.text else colors.faint,
                            modifier = Modifier.size(VadeIconSize.nav)
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(4.dp)
                            .background(if (isSelected) colors.accent else Color.Transparent, CircleShape)
                    )
                }
            }
        }
    }
}

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
    cryptoRepository: CryptoRepository,
    themeController: ThemeController
) {
    val authState by authViewModel.uiState.collectAsState()
    val currentUserId = (authState as? AuthUiState.Authenticated)?.user?.id ?: ""
    val currentUser = (authState as? AuthUiState.Authenticated)?.user

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = ROOT_DESTINATIONS.any { it.first == currentRoute }

    Scaffold(
        containerColor = vadeColors.bg,
        contentColor = vadeColors.text,
        bottomBar = {
            // System back leaves chat, sheets and overlays before it leaves the app; the bar
            // only exists on the three roots, so it never offers an escape from a flow.
            AnimatedVisibility(visible = showBottomBar) {
                VadeBottomBar(navController)
            }
        }
    ) { scaffoldPadding ->
        NavHost(
            navController = navController,
            startDestination = if (authState is AuthUiState.Authenticated) "conversations" else "welcome",
            modifier = Modifier
                .fillMaxSize()
                .padding(scaffoldPadding)
        ) {
            composable("welcome") {
                WelcomeScreen(
                    onGetStarted = { navController.navigate("register") },
                    onSignIn = { navController.navigate("login") }
                )
            }

            composable("login") {
                LoginScreen(
                    viewModel = authViewModel,
                    onNavigateToRegister = { navController.navigate("register") },
                    onLoginSuccess = {
                        navController.navigate("conversations") {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }

            composable("register") {
                RegisterScreen(
                    viewModel = authViewModel,
                    onBack = { navController.popBackStack() },
                    // An account without a reveal gesture cannot read its own messages, so
                    // enrollment is part of sign-up rather than a setting to find later.
                    onRegisterSuccess = {
                        navController.navigate("gesture-enrollment?onboarding=true") {
                            popUpTo(0) { inclusive = true }
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
                    }
                )
            }

            composable("search") {
                SearchScreen(
                    viewModel = searchViewModel,
                    onStartChat = { convId, peerId, peerName ->
                        navController.navigate("conversation/$convId/$peerId/$peerName")
                    }
                )
            }

            composable("profile") {
                ProfileScreen(
                    user = currentUser,
                    userId = currentUserId,
                    gestureRepository = gestureRepository,
                    themeController = themeController,
                    onOpenGestureSettings = { navController.navigate("gesture-settings") },
                    onOpenDevices = { navController.navigate("devices") },
                    onLogout = {
                        authViewModel.logout {
                            navController.navigate("welcome") {
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
                            navController.navigate("welcome") {
                                popUpTo(0) { inclusive = true }
                            }
                        }
                    }
                )
            }

            composable("contact-security/{peerId}/{peerName}") { backStackEntry ->
                ContactSecurityScreen(
                    peerId = backStackEntry.arguments?.getString("peerId") ?: "",
                    peerName = backStackEntry.arguments?.getString("peerName") ?: "",
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
                    onChangeGesture = { navController.navigate("gesture-enrollment?onboarding=false") }
                )
            }

            composable("gesture-enrollment?onboarding={onboarding}") { backStackEntry ->
                val isOnboarding = backStackEntry.arguments?.getString("onboarding") == "true"
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
                    userId = currentUserId,
                    isOnboarding = isOnboarding,
                    onBack = {
                        if (isOnboarding) Unit else navController.popBackStack()
                    },
                    onComplete = {
                        if (isOnboarding) {
                            navController.navigate("conversations") {
                                popUpTo(0) { inclusive = true }
                            }
                        } else {
                            navController.popBackStack()
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
}

// ==============================================================================
// 4. Welcome
// ==============================================================================

@Composable
fun WelcomeScreen(onGetStarted: () -> Unit, onSignIn: () -> Unit) {
    val colors = vadeColors

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
            .padding(horizontal = 30.dp)
            .padding(bottom = 30.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("Vade", style = VadeType.displayTitle, color = colors.text)
        Text(
            "Messages nobody can read\nover your shoulder.",
            style = VadeType.body.copy(fontSize = 17.sp, lineHeight = 26.sp),
            color = colors.muted,
            modifier = Modifier.padding(top = 12.dp)
        )

        Spacer(Modifier.height(36.dp))

        listOf(
            Triple(
                Icons.Default.Lock,
                "Protected by default",
                "Nothing readable sits on your screen until you ask for it."
            ),
            Triple(
                Icons.Default.Gesture,
                "Revealed by gesture",
                "A shape only you know, drawn on the message itself."
            ),
            Triple(
                Icons.Default.VpnKey,
                "Keys stay on device",
                "Generated here, never uploaded, verifiable in person."
            )
        ).forEach { (icon, title, body) ->
            Row(
                modifier = Modifier.padding(bottom = VadeSpace.gutter),
                horizontalArrangement = Arrangement.spacedBy(VadeSpace.row)
            ) {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .background(colors.surface, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(icon, contentDescription = null, tint = colors.accentInk, modifier = Modifier.size(16.dp))
                }
                Column {
                    Text(title, style = VadeType.name, color = colors.text)
                    Text(
                        body,
                        style = VadeType.bodySmall.copy(fontSize = 13.5.sp),
                        color = colors.muted,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(18.dp))

        VadeButton(
            text = "Get started",
            onClick = onGetStarted,
            modifier = Modifier.fillMaxWidth()
        )
        Text(
            "I already have an account",
            style = VadeType.body,
            color = colors.muted,
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .clip(VadeShape.pill)
                .clickable(onClick = onSignIn, role = Role.Button)
                .padding(horizontal = 12.dp, vertical = 12.dp)
        )
    }
}

// ==============================================================================
// 5. Messages
// ==============================================================================

@Composable
fun ConversationListScreen(
    viewModel: ConversationViewModel,
    onOpenSearch: () -> Unit,
    onOpenConversation: (String, String, String) -> Unit
) {
    val colors = vadeColors
    val conversations by viewModel.cachedConversations.collectAsState(initial = emptyList())
    val isLoading by viewModel.isLoading.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                "Vade",
                style = VadeType.screenTitle,
                color = colors.text,
                modifier = Modifier.padding(
                    start = VadeSpace.screenPadding,
                    end = VadeSpace.screenPadding,
                    top = 14.dp,
                    bottom = 10.dp
                )
            )

            Row(
                modifier = Modifier
                    .padding(horizontal = VadeSpace.screenPadding)
                    .padding(bottom = 14.dp)
                    .fillMaxWidth()
                    .height(42.dp)
                    .clip(VadeShape.pill)
                    .background(colors.surface)
                    .clickable(onClick = onOpenSearch, role = Role.Button)
                    .padding(horizontal = 15.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                Icon(
                    Icons.Default.Search,
                    contentDescription = null,
                    tint = colors.muted,
                    modifier = Modifier.size(16.dp)
                )
                Text("Search", style = VadeType.body, color = colors.muted)
            }

            if (conversations.isEmpty() && !isLoading) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    EmptyState(
                        icon = Icons.Default.ChatBubbleOutline,
                        title = "No conversations yet",
                        body = "Find someone by username to start a protected conversation.",
                        action = {
                            VadeButton(
                                text = "Find someone",
                                onClick = onOpenSearch,
                                size = VadeButtonSize.Small
                            )
                        }
                    )
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(conversations, key = { it.id }) { conversation ->
                        val name = conversation.peerDisplayName.ifEmpty { conversation.peerUsername }
                        ConversationRow(
                            name = name,
                            time = formatListTime(conversation.updatedAt),
                            unreadCount = conversation.unreadCount,
                            onOpen = { onOpenConversation(conversation.id, conversation.peerId, name) }
                        )
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = onOpenSearch,
            containerColor = colors.outBg,
            contentColor = colors.outFg,
            shape = CircleShape,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = VadeSpace.screenPadding, bottom = VadeSpace.screenPadding)
                .size(54.dp)
        ) {
            Icon(Icons.Default.Add, contentDescription = "New conversation", modifier = Modifier.size(22.dp))
        }
    }
}

/** "10:42" today, "Yesterday", a weekday within the week, then a date. */
private fun formatListTime(isoTimestamp: String): String = try {
    val instant = java.time.Instant.parse(isoTimestamp)
    val zone = java.time.ZoneId.systemDefault()
    val date = instant.atZone(zone).toLocalDate()
    val today = java.time.LocalDate.now(zone)
    val daysAgo = java.time.temporal.ChronoUnit.DAYS.between(date, today)

    when {
        daysAgo <= 0L -> java.time.format.DateTimeFormatter.ofPattern("HH:mm")
            .format(instant.atZone(zone))
        daysAgo == 1L -> "Yesterday"
        daysAgo < 7L -> java.time.format.DateTimeFormatter.ofPattern("EEE").format(date)
        else -> java.time.format.DateTimeFormatter.ofPattern("d MMM").format(date)
    }
} catch (_: Exception) {
    ""
}

// ==============================================================================
// 6. Search
// ==============================================================================

@Composable
fun SearchScreen(
    viewModel: SearchViewModel,
    onStartChat: (String, String, String) -> Unit
) {
    val colors = vadeColors
    val query by viewModel.query.collectAsState()
    val results by viewModel.searchResults.collectAsState()
    val isSearching by viewModel.isSearching.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            "Search",
            style = VadeType.screenTitle,
            color = colors.text,
            modifier = Modifier.padding(
                start = VadeSpace.screenPadding,
                end = VadeSpace.screenPadding,
                top = 14.dp,
                bottom = 14.dp
            )
        )

        VadeField(
            value = query,
            onValueChange = { viewModel.onQueryChanged(it) },
            placeholder = "Name or username",
            modifier = Modifier
                .padding(horizontal = VadeSpace.screenPadding)
                .padding(bottom = 8.dp)
        )

        when {
            isSearching -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = colors.muted, strokeWidth = 2.dp)
            }

            results.isEmpty() && query.isNotBlank() -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 40.dp),
                contentAlignment = Alignment.Center
            ) {
                EmptyState(
                    icon = Icons.Default.Search,
                    title = "No one found",
                    body = "Check the spelling, or ask them for their exact username."
                )
            }

            else -> LazyColumn(modifier = Modifier.weight(1f)) {
                if (results.isNotEmpty()) {
                    item {
                        SectionLabel(
                            "Matches",
                            modifier = Modifier.padding(horizontal = VadeSpace.screenPadding, vertical = 6.dp)
                        )
                    }
                }
                items(results, key = { it.id }) { user ->
                    val name = user.displayName.ifEmpty { user.username }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(role = Role.Button) {
                                viewModel.startConversation(user) { convId, peerId, _ ->
                                    onStartChat(convId, peerId, name)
                                }
                            }
                            .heightIn(min = VadeSpace.touchTarget)
                            .padding(horizontal = VadeSpace.screenPadding, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(VadeSpace.row)
                    ) {
                        VadeAvatar(name, size = 40.dp)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                name,
                                style = VadeType.name.copy(fontSize = 15.sp),
                                color = colors.text,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text("@${user.username}", style = VadeType.rowSecondary, color = colors.muted)
                        }
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = null,
                            tint = colors.faint,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
                item {
                    Row(
                        modifier = Modifier.padding(horizontal = VadeSpace.screenPadding, vertical = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Lock,
                            contentDescription = null,
                            tint = colors.faint,
                            modifier = Modifier.size(VadeIconSize.small)
                        )
                        Text(
                            "Search covers names and usernames only.",
                            style = VadeType.bodySmall,
                            color = colors.faint
                        )
                    }
                }
            }
        }
    }
}

// ==============================================================================
// 7. Profile
// ==============================================================================

@Composable
fun ProfileScreen(
    user: UserSummary?,
    userId: String,
    gestureRepository: GestureRepository,
    themeController: ThemeController,
    onOpenGestureSettings: () -> Unit,
    onOpenDevices: () -> Unit,
    onLogout: () -> Unit
) {
    val colors = vadeColors
    val context = androidx.compose.ui.platform.LocalContext.current
    val stylePreference = remember { SharedPrefsProtectionStylePreference(context) }

    var protectionMode by remember { mutableStateOf(stylePreference.getMode(userId)) }
    var isStyleSheetOpen by remember { mutableStateOf(false) }
    var isSignOutConfirmOpen by remember { mutableStateOf(false) }

    val isGestureConfigured = remember(userId) { gestureRepository.isConfigured(userId) }
    val name = user?.displayName?.ifEmpty { user.username } ?: ""

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            "Profile",
            style = VadeType.screenTitle,
            color = colors.text,
            modifier = Modifier.padding(
                start = VadeSpace.screenPadding,
                end = VadeSpace.screenPadding,
                top = 14.dp,
                bottom = 18.dp
            )
        )

        Column(
            modifier = Modifier.padding(horizontal = VadeSpace.screenPadding),
            verticalArrangement = Arrangement.spacedBy(VadeSpace.section)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                VadeAvatar(name, size = 56.dp)
                Column {
                    Text(name, style = VadeType.name.copy(fontSize = 17.sp), color = colors.text)
                    Text("@${user?.username ?: ""}", style = VadeType.body, color = colors.muted)
                }
            }

            SettingsGroup(label = "Privacy & security") {
                SettingsRow(
                    label = "Protection style",
                    value = protectionStyleLabel(protectionMode),
                    onClick = { isStyleSheetOpen = true }
                )
                SettingsRow(
                    label = "Gesture reveal",
                    value = if (isGestureConfigured) {
                        "${GestureRevealManager.REVEAL_STROKE_COUNT} strokes · " +
                            "${GestureRevealManager.REVEAL_DURATION_SECONDS}s"
                    } else {
                        "Not set up"
                    },
                    onClick = onOpenGestureSettings
                )
                SettingsRow(label = "Devices", onClick = onOpenDevices, showDivider = false)
            }

            SettingsGroup(label = "Appearance") {
                SettingsRow(
                    label = "Theme",
                    value = themeController.preference.label,
                    onClick = { themeController.cycle() },
                    showChevron = false,
                    showDivider = false
                )
            }

            SettingsGroup(label = "About") {
                SettingsRow(label = "Version", value = "1.0.0")
                SettingsRow(
                    label = "Protocol",
                    value = "v1 · ECDH P-256 · AES-256-GCM",
                    showDivider = false
                )
            }

            Text(
                "Sign out",
                style = VadeType.body,
                color = colors.muted,
                modifier = Modifier
                    .clip(VadeShape.pill)
                    .clickable(role = Role.Button) { isSignOutConfirmOpen = true }
                    .padding(horizontal = 8.dp, vertical = 10.dp)
            )

            Spacer(Modifier.height(VadeSpace.section))
        }
    }

    if (isStyleSheetOpen) {
        VadeActionSheet(
            onDismiss = { isStyleSheetOpen = false },
            title = "Protection style",
            description = "How protected messages look on this device. Encryption is unchanged " +
                "either way, and this choice is never sent anywhere."
        ) {
            ProtectionStylePicker(
                selected = protectionMode,
                onSelect = { mode ->
                    stylePreference.setMode(userId, mode)
                    protectionMode = mode
                    isStyleSheetOpen = false
                }
            )
        }
    }

    if (isSignOutConfirmOpen) {
        ConfirmDialog(
            title = "Sign out?",
            body = "Your keys and gesture stay on this device. You will need your password to sign back in.",
            confirmLabel = "Sign out",
            onConfirm = onLogout,
            onDismiss = { isSignOutConfirmOpen = false }
        )
    }
}

// ==============================================================================
// 8. Conversation
// ==============================================================================

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
    val colors = vadeColors
    var inputText by remember { mutableStateOf("") }
    val messages by viewModel.messages.collectAsState()
    val isOnline by viewModel.isOnline.collectAsState()
    val wsState by viewModel.wsState.collectAsState()
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

    // Window-focus-loss re-protection (§40) — e.g. recents overlay, notification
    // shade. Scoped to Revealed: the gesture prompt is a Dialog, which owns its
    // own window and necessarily takes focus from the Activity, so revoking on
    // any focus loss dismissed our own prompt before a single stroke could be
    // drawn. Only Revealed puts plaintext on screen, which is what focus-loss
    // re-protection exists to hide; genuine backgrounding is still covered by
    // the ON_STOP observer above, which applies in every state.
    //
    // Keyed on the Revealed flag rather than revealState itself: the countdown
    // republishes Revealed once a second, which would otherwise restart this
    // effect every tick. Focus is deliberately awaited before arming — the
    // reveal is granted while the auth dialog's window still holds focus, and
    // focus only returns to the Activity after that window is torn down, so
    // reacting to the current value would revoke the reveal in the very frame
    // it was granted.
    val isRevealed = revealState is RevealState.Revealed
    LaunchedEffect(isRevealed, revealManager) {
        if (!isRevealed) return@LaunchedEffect
        WindowFocusMonitor.hasFocus.first { it }
        WindowFocusMonitor.hasFocus.first { !it }
        revealManager.revokeReveal()
    }

    // Layer 3 / Phase 18: FLAG_SECURE for the reveal window, cleared on re-protect, so
    // screenshots and recents previews stay protected.
    val context = androidx.compose.ui.platform.LocalContext.current
    val isSensitiveWindow = revealState is RevealState.Revealed || revealState is RevealState.Authenticating
    // Keyed on the sensitivity flag rather than on revealState: keying on the
    // state re-ran this on every transition, so Authenticating -> Revealed
    // cleared and immediately re-added FLAG_SECURE. Toggling that flag forces
    // the window surface to be recreated (observable as focus leaving and
    // re-entering the window), which would trip the focus-loss revocation above
    // and collapse the reveal the instant it was granted.
    DisposableEffect(isSensitiveWindow) {
        val activity = context as? android.app.Activity
        if (isSensitiveWindow) {
            activity?.window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            activity?.window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        }
        onDispose {
            activity?.window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    // Protection Style (Protected Text v2) — a local display preference, re-read on ON_RESUME
    // so a change made in Profile takes effect immediately upon returning to this screen.
    var protectionStyleGeneration by remember { mutableIntStateOf(0) }
    DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) protectionStyleGeneration++
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val protectionStylePreference = remember { SharedPrefsProtectionStylePreference(context) }
    val protectionMode = remember(protectionStyleGeneration, currentUserId) {
        protectionStylePreference.getMode(currentUserId)
    }

    LaunchedEffect(conversationId) {
        viewModel.initializeConversation(conversationId, peerId, currentUserId)
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    var actionsTarget by remember { mutableStateOf<MessageUiModel?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
            // The IME resizes the timeline and the composer stays pinned above it.
            .imePadding()
    ) {
        // Header: back, who you are talking to, and one line of security state. Offline takes
        // the subtitle over the verification state — a connection you do not have is the more
        // immediately useful fact, and verification is one tap away.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 4.dp, end = 12.dp, top = 6.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            VadeIconButton(
                icon = Icons.Default.ChevronLeft,
                contentDescription = "Back to conversations",
                onClick = onBack,
                diameter = 34.dp
            )
            VadeAvatar(peerName, size = 38.dp)
            Column(modifier = Modifier
                .weight(1f)
                .padding(start = 7.dp)) {
                Text(
                    peerName,
                    style = VadeType.name,
                    color = colors.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (!isOnline) {
                    Text("Offline", style = VadeType.rowSecondary.copy(fontSize = 12.sp), color = colors.muted)
                } else if (wsState != WebSocketState.CONNECTED) {
                    Text("Connecting", style = VadeType.rowSecondary.copy(fontSize = 12.sp), color = colors.muted)
                } else {
                    SecurityChip(state = contactSecurityState, inline = true)
                }
            }
            VadeIconButton(
                icon = Icons.Default.MoreVert,
                contentDescription = "Contact security",
                onClick = onOpenContactSecurity,
                diameter = 34.dp
            )
        }
        HorizontalDivider(color = colors.line, thickness = 1.dp)

        if (contactSecurityState is ContactSecurityState.KeyChanged) {
            KeyChangedBanner(
                onReview = onOpenContactSecurity,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
            )
        }

        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            items(messages, key = { it.localId }) { message ->
                MessageRow(
                    message = message,
                    revealState = revealState,
                    protectionMode = protectionMode,
                    isOffline = !isOnline,
                    onReveal = {
                        when {
                            !revealManager.isConfigured -> onOpenGestureSettings()
                            else -> revealManager.startReveal(message.localId)
                        }
                    },
                    onHide = { revealManager.hide() },
                    onLongPress = { actionsTarget = message },
                    onRetry = { viewModel.retrySend(message) }
                )
            }

            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 14.dp, bottom = 6.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Lock,
                        contentDescription = null,
                        tint = colors.faint,
                        modifier = Modifier.size(VadeIconSize.small)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text("Tap a message to reveal it", style = VadeType.bodySmall, color = colors.faint)
                }
            }
        }

        HorizontalDivider(color = colors.line, thickness = 1.dp)

        // The composer stays usable while offline — composing works and sending queues, so no
        // draft is silently lost. The placeholder says which of the two is happening.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .clip(VadeShape.pill)
                    .background(colors.surface),
                verticalAlignment = Alignment.CenterVertically
            ) {
                BasicTextFieldRow(
                    value = inputText,
                    onValueChange = { if (it.length <= 5000) inputText = it },
                    placeholder = if (isOnline) "Message" else "Message · sends when online"
                )
            }

            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(if (inputText.isNotBlank()) colors.outBg else colors.surface)
                    .clickable(enabled = inputText.isNotBlank(), role = Role.Button) {
                        viewModel.sendMessage(inputText)
                        inputText = ""
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Send,
                    contentDescription = "Send message",
                    tint = if (inputText.isNotBlank()) colors.outFg else colors.faint,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }

    // Long-press actions. Copy and forward are deliberately absent — both would move plaintext
    // outside the reveal window, which is the one thing the whole design exists to prevent.
    actionsTarget?.let { target ->
        val targetRevealed = (revealState as? RevealState.Revealed)?.messageId == target.localId
        VadeActionSheet(
            onDismiss = { actionsTarget = null },
            kicker = "Message actions",
            footnote = "Copy and forward are unavailable for protected messages."
        ) {
            if (targetRevealed) {
                ActionSheetRow(
                    label = "Hide again",
                    note = "Re-protect this message now",
                    icon = Icons.Default.VisibilityOff,
                    onClick = {
                        revealManager.hide()
                        actionsTarget = null
                    }
                )
            } else {
                ActionSheetRow(
                    label = "Reveal",
                    note = "Draw your gesture to read it",
                    icon = Icons.Default.Visibility,
                    onClick = {
                        actionsTarget = null
                        if (!revealManager.isConfigured) {
                            onOpenGestureSettings()
                        } else {
                            revealManager.startReveal(target.localId)
                        }
                    }
                )
            }
            ActionSheetRow(
                label = "Message details",
                note = "Sent · ${formatListTime(target.createdAt)} · " +
                    protectionStyleLabel(protectionMode),
                icon = Icons.Default.Info,
                onClick = { actionsTarget = null }
            )
        }
    }

    // Gesture authentication overlay — only rendered while actively authenticating or locked
    // out. Never shown for Protected/Revealed, and never displays the stored gesture.
    // The dismissed flag only hides the lockout dialog's UI — it never touches the underlying
    // countdown, which keeps running in GestureRevealManager regardless of dialog visibility.
    var lockedDialogDismissed by remember(revealState is RevealState.Locked) { mutableStateOf(false) }

    when (val current = revealState) {
        is RevealState.Authenticating -> {
            GestureRevealDialog(
                state = current,
                requiredStrokes = revealManager.requiredStrokes,
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
                GestureLockedDialog(state = current, onDismiss = { lockedDialogDismissed = true })
            }
        }
        else -> Unit
    }
}

@Composable
private fun RowScope.BasicTextFieldRow(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String
) {
    val colors = vadeColors
    Box(
        modifier = Modifier
            .weight(1f)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        if (value.isEmpty()) {
            Text(placeholder, style = VadeType.body, color = colors.muted)
        }
        androidx.compose.foundation.text.BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = VadeType.body.copy(color = colors.text),
            cursorBrush = androidx.compose.ui.graphics.SolidColor(colors.accent),
            maxLines = 4,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Message text" }
        )
    }
}

/**
 * One message in the timeline. While a message is revealed the meta row is replaced by the
 * countdown — the window is always visible for as long as it is open.
 */
@Composable
fun MessageRow(
    message: MessageUiModel,
    revealState: RevealState,
    protectionMode: ProtectedRenderMode,
    isOffline: Boolean,
    onReveal: () -> Unit,
    onHide: () -> Unit,
    onLongPress: () -> Unit,
    onRetry: () -> Unit
) {
    val colors = vadeColors
    val isOutgoing = message.isOutgoing
    val revealed = revealState as? RevealState.Revealed
    val isRevealedHere = revealed?.messageId == message.localId

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isOutgoing) Alignment.End else Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        when (message.decryptionState) {
            DecryptionState.DECRYPTED -> MessageBubbleSurface(
                content = message.transientPlaintext ?: "",
                messageId = message.localId,
                isOutgoing = isOutgoing,
                revealState = revealState,
                protectionMode = protectionMode,
                onReveal = onReveal,
                onLongPress = onLongPress
            )

            DecryptionState.DECRYPTION_FAILED -> Text(
                "Unable to decrypt message",
                style = VadeType.message,
                color = colors.warn,
                modifier = Modifier
                    .clip(if (isOutgoing) VadeShape.bubbleOutgoing else VadeShape.bubbleIncoming)
                    .background(colors.warnTint)
                    .padding(horizontal = 15.dp, vertical = 11.dp)
            )

            else -> Text(
                "Decrypting…",
                style = VadeType.message,
                color = colors.muted,
                modifier = Modifier
                    .clip(if (isOutgoing) VadeShape.bubbleOutgoing else VadeShape.bubbleIncoming)
                    .background(colors.surface)
                    .padding(horizontal = 15.dp, vertical = 11.dp)
            )
        }

        if (isRevealedHere && revealed != null) {
            RevealCountdown(remainingSeconds = revealed.remainingSeconds, onHide = onHide)
        } else {
            MessageMeta(
                time = formatMessageTime(message.createdAt),
                isOutgoing = isOutgoing,
                status = message.localState.toDeliveryStatus(isOffline),
                onRetry = onRetry
            )
        }
    }
}

private fun MessageLocalState.toDeliveryStatus(isOffline: Boolean): MessageDeliveryStatus = when (this) {
    MessageLocalState.READ -> MessageDeliveryStatus.Read
    MessageLocalState.DELIVERED -> MessageDeliveryStatus.Delivered
    MessageLocalState.SENT -> MessageDeliveryStatus.Sent
    MessageLocalState.FAILED -> MessageDeliveryStatus.Failed
    MessageLocalState.PENDING_SEND -> MessageDeliveryStatus.Queued
    MessageLocalState.SENDING -> if (isOffline) MessageDeliveryStatus.Queued else MessageDeliveryStatus.Sending
    else -> MessageDeliveryStatus.Sending
}

private fun formatMessageTime(isoTimestamp: String): String = try {
    java.time.format.DateTimeFormatter.ofPattern("HH:mm")
        .format(java.time.Instant.parse(isoTimestamp).atZone(java.time.ZoneId.systemDefault()))
} catch (_: Exception) {
    ""
}

// ==============================================================================
// 9. Login & Register
// ==============================================================================

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onNavigateToRegister: () -> Unit,
    onLoginSuccess: () -> Unit
) {
    val colors = vadeColors
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var rememberMe by remember { mutableStateOf(true) }
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState) {
        if (uiState is AuthUiState.Authenticated) onLoginSuccess()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
            .padding(horizontal = 30.dp)
            .padding(bottom = 40.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("Vade", style = VadeType.displayTitle, color = colors.text)
        Text(
            "Private messaging,\nredesigned.",
            style = VadeType.body.copy(fontSize = 16.sp, lineHeight = 24.sp),
            color = colors.muted,
            modifier = Modifier.padding(top = 10.dp, bottom = 34.dp)
        )

        VadeField(
            value = identifier,
            onValueChange = { identifier = it },
            placeholder = "Username or email",
            modifier = Modifier.padding(bottom = 12.dp)
        )
        VadeField(
            value = password,
            onValueChange = { password = it },
            placeholder = "Password",
            isPassword = true,
            isError = uiState is AuthUiState.Error,
            supportingText = (uiState as? AuthUiState.Error)?.message
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .padding(top = 14.dp)
                .clip(RoundedCornerShape(8.dp))
                .clickable(role = Role.Checkbox) { rememberMe = !rememberMe }
                .padding(vertical = 6.dp)
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(20.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (rememberMe) colors.accent else Color.Transparent)
                    .border(1.5.dp, if (rememberMe) colors.accent else colors.line, RoundedCornerShape(6.dp))
            ) {
                if (rememberMe) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(13.dp)
                    )
                }
            }
            Text(
                "Remember me",
                style = VadeType.body.copy(fontSize = 14.sp),
                color = colors.text,
                modifier = Modifier.padding(start = 10.dp)
            )
        }

        VadeButton(
            text = "Continue",
            onClick = { viewModel.login(identifier.trim(), password, rememberMe) },
            enabled = identifier.isNotBlank() && password.isNotBlank(),
            isLoading = uiState is AuthUiState.Loading,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 10.dp)
        )

        Text(
            "Create account",
            style = VadeType.name,
            color = colors.accentInk,
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .padding(top = 28.dp)
                .clip(VadeShape.pill)
                .clickable(onClick = onNavigateToRegister, role = Role.Button)
                .padding(horizontal = 12.dp, vertical = 10.dp)
        )
    }
}

@Composable
fun RegisterScreen(
    viewModel: AuthViewModel,
    onBack: () -> Unit,
    onRegisterSuccess: () -> Unit
) {
    val colors = vadeColors
    var username by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState) {
        if (uiState is AuthUiState.Authenticated) onRegisterSuccess()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
            .padding(horizontal = 30.dp)
    ) {
        VadeIconButton(
            icon = Icons.Default.ChevronLeft,
            contentDescription = "Back to sign in",
            onClick = onBack,
            diameter = 34.dp,
            modifier = Modifier.padding(top = 6.dp, start = 0.dp)
        )

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(bottom = 40.dp),
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                "Create account",
                style = VadeType.screenTitle.copy(fontSize = 32.sp),
                color = colors.text
            )
            Text(
                "Your keys are generated on this device and never leave it.",
                style = VadeType.body.copy(fontSize = 15.sp),
                color = colors.muted,
                modifier = Modifier.padding(top = 10.dp, bottom = 30.dp)
            )

            VadeField(
                value = displayName,
                onValueChange = { displayName = it },
                placeholder = "Display name",
                modifier = Modifier.padding(bottom = 12.dp)
            )
            VadeField(
                value = username,
                onValueChange = { username = it },
                placeholder = "Username",
                modifier = Modifier.padding(bottom = 12.dp)
            )
            VadeField(
                value = email,
                onValueChange = { email = it },
                placeholder = "Email",
                keyboardType = KeyboardType.Email,
                modifier = Modifier.padding(bottom = 12.dp)
            )
            VadeField(
                value = password,
                onValueChange = { password = it },
                placeholder = "Password",
                isPassword = true,
                isError = uiState is AuthUiState.Error,
                supportingText = (uiState as? AuthUiState.Error)?.message ?: "At least 8 characters."
            )

            VadeButton(
                text = "Create account",
                onClick = {
                    viewModel.register(
                        username.trim(),
                        email.trim(),
                        password,
                        displayName.trim()
                    )
                },
                enabled = username.isNotBlank() && email.isNotBlank() && password.isNotBlank(),
                isLoading = uiState is AuthUiState.Loading,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 18.dp)
            )
        }
    }
}
