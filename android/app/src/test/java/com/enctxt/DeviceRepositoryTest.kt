package com.enctxt

import com.enctxt.core.network.ApiClient
import com.enctxt.core.network.NetworkResult
import com.enctxt.data.model.DeviceDto
import com.enctxt.data.model.DeviceListResponse
import com.enctxt.data.model.RegisterDeviceRequest
import com.enctxt.data.model.RevokeDeviceResponse
import com.enctxt.data.repository.DeviceRepository
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class DeviceRepositoryTest {

    private class FakeDeviceApiClient : ApiClient() {
        var getDevicesHandler: (suspend () -> NetworkResult<DeviceListResponse>)? = null
        var registerDeviceHandler: (suspend (RegisterDeviceRequest) -> NetworkResult<DeviceDto>)? = null
        var revokeDeviceHandler: (suspend (String) -> NetworkResult<RevokeDeviceResponse>)? = null

        override suspend fun getDevices(): NetworkResult<DeviceListResponse> {
            return getDevicesHandler?.invoke()
                ?: NetworkResult.Success(DeviceListResponse(emptyList()))
        }

        override suspend fun registerDevice(request: RegisterDeviceRequest): NetworkResult<DeviceDto> {
            return registerDeviceHandler?.invoke(request)
                ?: NetworkResult.Error("UNHANDLED", "Register not handled", 500)
        }

        override suspend fun revokeDevice(deviceId: String): NetworkResult<RevokeDeviceResponse> {
            return revokeDeviceHandler?.invoke(deviceId)
                ?: NetworkResult.Error("UNHANDLED", "Revoke not handled", 500)
        }
    }

    private lateinit var apiClient: FakeDeviceApiClient
    private lateinit var repository: DeviceRepository

    @Before
    fun setUp() {
        apiClient = FakeDeviceApiClient()
        repository = DeviceRepository(apiClient)
    }

    @Test
    fun `listDevices maps DTOs and correctly flags isCurrentDevice`() = runTest {
        val currentKeyId = "k_current_device_123"
        val devices = listOf(
            DeviceDto(
                id = "dev-1",
                deviceName = "Pixel 8",
                platform = "android",
                keyId = currentKeyId,
                status = "active",
                lastSeenAt = "2026-08-26T12:00:00Z",
                createdAt = "2026-08-20T10:00:00Z"
            ),
            DeviceDto(
                id = "dev-2",
                deviceName = "Chrome Web",
                platform = "web",
                keyId = "k_web_device_456",
                status = "active",
                lastSeenAt = "2026-08-25T15:00:00Z",
                createdAt = "2026-08-15T08:00:00Z"
            )
        )

        apiClient.getDevicesHandler = {
            NetworkResult.Success(DeviceListResponse(devices))
        }

        val result = repository.listDevices(currentKeyId)
        assertTrue(result is NetworkResult.Success)
        val records = (result as NetworkResult.Success).data
        assertEquals(2, records.size)

        val dev1 = records.first { it.id == "dev-1" }
        assertTrue("dev-1 must match currentKeyId", dev1.isCurrentDevice)
        assertEquals("Pixel 8", dev1.deviceName)

        val dev2 = records.first { it.id == "dev-2" }
        assertFalse("dev-2 must not match currentKeyId", dev2.isCurrentDevice)
    }

    @Test
    fun `registerDevice invokes apiClient with device details`() = runTest {
        val expectedDto = DeviceDto(
            id = "new-dev-1",
            deviceName = "My Android Phone",
            platform = "android",
            keyId = "k_new_key_1",
            status = "active"
        )

        var capturedRequest: RegisterDeviceRequest? = null
        apiClient.registerDeviceHandler = { req ->
            capturedRequest = req
            NetworkResult.Success(expectedDto)
        }

        val result = repository.registerDevice(
            deviceName = "My Android Phone",
            platform = "android",
            keyId = "k_new_key_1"
        )
        assertTrue(result is NetworkResult.Success)
        assertEquals("new-dev-1", (result as NetworkResult.Success).data.id)
        assertEquals("My Android Phone", capturedRequest?.deviceName)
        assertEquals("android", capturedRequest?.platform)
        assertEquals("k_new_key_1", capturedRequest?.keyId)
    }

    @Test
    fun `revokeDevice handles success response`() = runTest {
        apiClient.revokeDeviceHandler = { id ->
            NetworkResult.Success(RevokeDeviceResponse(success = true, revokedDeviceId = id))
        }

        val result = repository.revokeDevice("dev-to-revoke")
        assertTrue(result is NetworkResult.Success)
        val success = result as NetworkResult.Success
        assertTrue(success.data.success)
        assertEquals("dev-to-revoke", success.data.revokedDeviceId)
    }

    @Test
    fun `revokeDevice maps 403 Forbidden with safe user-facing message`() = runTest {
        apiClient.revokeDeviceHandler = {
            NetworkResult.Error(
                code = "FORBIDDEN",
                message = "Forbidden",
                statusCode = 403
            )
        }

        val result = repository.revokeDevice("other-user-dev")
        assertTrue(result is NetworkResult.Error)
        val err = result as NetworkResult.Error
        assertEquals(403, err.statusCode)
        assertEquals("You are not authorized to revoke this device", err.message)
    }

    @Test
    fun `revokeDevice handles 401 Unauthorized safely`() = runTest {
        apiClient.revokeDeviceHandler = {
            NetworkResult.Error(
                code = "UNAUTHORIZED",
                message = "Unauthorized",
                statusCode = 401
            )
        }

        val result = repository.revokeDevice("dev-1")
        assertTrue(result is NetworkResult.Error)
        val err = result as NetworkResult.Error
        assertEquals(401, err.statusCode)
        assertEquals("Session expired. Please log in again.", err.message)
    }

    @Test
    fun `revokeDevice rejects blank device ID`() = runTest {
        val result = repository.revokeDevice("   ")
        assertTrue(result is NetworkResult.Error)
        assertEquals(400, (result as NetworkResult.Error).statusCode)
    }
}
