package com.enctxt

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.navigation.compose.rememberNavController
import com.enctxt.presentation.*

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = application as EnctxtApplication

        val authViewModel = AuthViewModel(
            authRepository = app.authRepository,
            cryptoRepository = app.cryptoRepository,
            sessionInitializer = app.sessionInitializer
        )

        val conversationViewModel = ConversationViewModel(
            conversationRepository = app.conversationRepository
        )

        val searchViewModel = SearchViewModel(
            userRepository = app.userRepository,
            conversationRepository = app.conversationRepository
        )

        val messageViewModel = MessageViewModel(
            messageRepository = app.messageRepository,
            wsClient = app.wsClient,
            connectivityMonitor = app.connectivityMonitor,
            syncCoordinator = app.syncCoordinator
        )

        setContent {
            EnctxtTheme {
                val navController = rememberNavController()
                NavGraph(
                    navController = navController,
                    authViewModel = authViewModel,
                    conversationViewModel = conversationViewModel,
                    searchViewModel = searchViewModel,
                    messageViewModel = messageViewModel,
                    gestureRepository = app.gestureRepository,
                    contactSecurityRepository = app.contactSecurityRepository,
                    deviceRepository = app.deviceRepository,
                    cryptoRepository = app.cryptoRepository
                )
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Drives immediate re-protection of any active gesture reveal (Phase 16 spec §40).
        WindowFocusMonitor.onWindowFocusChanged(hasFocus)
    }
}
