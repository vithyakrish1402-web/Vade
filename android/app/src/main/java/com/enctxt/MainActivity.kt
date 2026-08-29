package com.enctxt

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.core.content.ContextCompat
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

        // Android 13+ requires this at runtime before the app can post anything — without it,
        // the OS silently disables notifications for the app (surfacing as "blocked" in
        // Settings) rather than prompting on its own. Asked for once, right after sign-in,
        // mirroring when the web client asks for browser notification permission.
        val notificationPermissionLauncher = registerForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { /* no-op: SystemNotifier checks the grant state itself before every notify() */ }

        // Confirmed on-device: Doze kills the message-delivery WebSocket within ~9 seconds of
        // backgrounding without this exemption, silently breaking both notifications and unread
        // counts. Asked once, right after sign-in, same as the notification permission above.
        val batteryOptimizationLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { /* no-op: nothing to react to either way — the OS dialog handles the outcome */ }

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
            syncCoordinator = app.syncCoordinator,
            conversationRepository = app.conversationRepository
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

            val authState by authViewModel.uiState.collectAsState()
            LaunchedEffect(authState) {
                if (authState !is AuthUiState.Authenticated) return@LaunchedEffect
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return@LaunchedEffect
                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    android.Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                }

                val powerManager = getSystemService(PowerManager::class.java)
                if (powerManager?.isIgnoringBatteryOptimizations(packageName) == false) {
                    batteryOptimizationLauncher.launch(
                        Intent(
                            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:$packageName")
                        )
                    )
                }
            }

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
