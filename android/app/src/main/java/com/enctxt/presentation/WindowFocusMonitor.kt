package com.enctxt.presentation

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * App-wide window focus signal, updated from [com.enctxt.MainActivity.onWindowFocusChanged].
 *
 * Used to immediately re-protect any active gesture reveal when the window loses focus
 * (e.g. the recents/app-switcher overlay, a system dialog, or the app being backgrounded) —
 * see Phase 16 spec §40. Compose has no direct composable hook for Activity window focus, so
 * this bridges the Activity callback to a StateFlow observers can collect.
 */
object WindowFocusMonitor {
    private val _hasFocus = MutableStateFlow(true)
    val hasFocus: StateFlow<Boolean> = _hasFocus.asStateFlow()

    fun onWindowFocusChanged(hasFocus: Boolean) {
        _hasFocus.value = hasFocus
    }
}
