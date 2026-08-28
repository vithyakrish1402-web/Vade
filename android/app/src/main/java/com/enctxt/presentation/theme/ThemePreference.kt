package com.enctxt.presentation.theme

import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

enum class ThemePreference(val label: String) {
    Light("Light"),
    Dark("Dark"),
    System("System")
}

/**
 * The appearance choice, on this device only.
 *
 * Deliberately unencrypted SharedPreferences: it holds no key material and no message content,
 * and it has to be readable before the session exists so the first frame is drawn on the right
 * ground.
 */
class ThemePreferenceStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun get(): ThemePreference = when (prefs.getString(KEY, null)) {
        "light" -> ThemePreference.Light
        "dark" -> ThemePreference.Dark
        else -> ThemePreference.System
    }

    fun set(preference: ThemePreference) {
        prefs.edit().apply {
            when (preference) {
                ThemePreference.Light -> putString(KEY, "light")
                ThemePreference.Dark -> putString(KEY, "dark")
                ThemePreference.System -> remove(KEY)
            }
        }.apply()
    }

    private companion object {
        const val PREFS_NAME = "vade_appearance"
        const val KEY = "theme"
    }
}

/** Holds the current preference and resolves it against the system setting. */
class ThemeController(private val store: ThemePreferenceStore) {
    var preference by mutableStateOf(store.get())
        private set

    fun set(next: ThemePreference) {
        preference = next
        store.set(next)
    }

    /** Cycles light → dark → system, for the single-row Appearance control. */
    fun cycle() {
        set(
            when (preference) {
                ThemePreference.Light -> ThemePreference.Dark
                ThemePreference.Dark -> ThemePreference.System
                ThemePreference.System -> ThemePreference.Light
            }
        )
    }

    @Composable
    fun isDark(): Boolean = when (preference) {
        ThemePreference.Light -> false
        ThemePreference.Dark -> true
        ThemePreference.System -> isSystemInDarkTheme()
    }
}

@Composable
fun rememberThemeController(context: Context): ThemeController =
    remember(context) { ThemeController(ThemePreferenceStore(context)) }
