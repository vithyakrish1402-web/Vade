package com.enctxt.core.network

import com.enctxt.BuildConfig
import org.junit.Assert.*
import org.junit.Test

class NetworkConfigTest {

    @Test
    fun `default NetworkConfig reads endpoints from BuildConfig, not hardcoded literals`() {
        val config = NetworkConfig()
        assertEquals(BuildConfig.API_BASE_URL, config.baseUrl)
        assertEquals(BuildConfig.WS_URL, config.wsUrl)
    }

    @Test
    fun `base URL and WebSocket URL schemes must correspond`() {
        // Regression guard for the exact class of bug fixed on the web client:
        // an https API paired with a plaintext ws:// (or vice versa) silently
        // breaks the moment client and server are on different hosts.
        val config = NetworkConfig()
        val isSecureHttp = config.baseUrl.startsWith("https://")
        val isSecureWs = config.wsUrl.startsWith("wss://")
        assertEquals(
            "baseUrl and wsUrl must use matching secure schemes (https<->wss, http<->ws): " +
                "baseUrl=${config.baseUrl} wsUrl=${config.wsUrl}",
            isSecureHttp,
            isSecureWs
        )
    }

    @Test
    fun `base URL always targets the REST API prefix`() {
        val config = NetworkConfig()
        assertTrue("baseUrl must target the /api prefix: ${config.baseUrl}", config.baseUrl.endsWith("/api"))
    }

    @Test
    fun `WebSocket URL always targets the ws path`() {
        val config = NetworkConfig()
        assertTrue("wsUrl must target the /ws path: ${config.wsUrl}", config.wsUrl.endsWith("/ws"))
    }
}
