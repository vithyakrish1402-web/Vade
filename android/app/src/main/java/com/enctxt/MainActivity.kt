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
            wsClient = app.wsClient
        )

        setContent {
            EnctxtTheme {
                val navController = rememberNavController()
                NavGraph(
                    navController = navController,
                    authViewModel = authViewModel,
                    conversationViewModel = conversationViewModel,
                    searchViewModel = searchViewModel,
                    messageViewModel = messageViewModel
                )
            }
        }
    }
}
