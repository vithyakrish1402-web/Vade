package com.enctxt

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.navigation.compose.rememberNavController
import com.enctxt.presentation.*
import com.enctxt.presentation.theme.ThemeController
import com.enctxt.presentation.theme.ThemePreferenceStore
import com.enctxt.presentation.theme.VadeTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge with transparent system bars; the bottom bar draws over the
        // navigation inset and content is padded by WindowInsets rather than by fixed values.
        // The icon colour is re-applied from the app's own theme below — see applyBarStyle.
        enableEdgeToEdge()

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

        val themeStore = ThemePreferenceStore(this)

        setContent {
            val themeController = remember { ThemeController(themeStore) }
            val isDark = themeController.isDark()

            // Vade's theme is independent of the system's, so the system bar icons have to
            // follow the app. SystemBarStyle.auto() reads the *system* dark-mode setting,
            // which left light icons on a light ground whenever the two disagreed — the clock
            // and status icons were invisible.
            LaunchedEffect(isDark) { applyBarStyle(isDark) }

            VadeTheme(darkTheme = isDark) {
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
                    cryptoRepository = app.cryptoRepository,
                    themeController = themeController
                )
            }
        }
    }

    private fun applyBarStyle(isDark: Boolean) {
        val style = if (isDark) {
            SystemBarStyle.dark(TRANSPARENT)
        } else {
            SystemBarStyle.light(TRANSPARENT, TRANSPARENT)
        }
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Drives immediate re-protection of any active gesture reveal (Phase 16 spec §40).
        WindowFocusMonitor.onWindowFocusChanged(hasFocus)
    }

    private companion object {
        const val TRANSPARENT = android.graphics.Color.TRANSPARENT
    }
}
