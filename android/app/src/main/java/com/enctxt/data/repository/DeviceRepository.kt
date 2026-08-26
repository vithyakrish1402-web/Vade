package com.enctxt.data.repository

import com.enctxt.core.network.ApiClient
import com.enctxt.core.network.NetworkResult
import com.enctxt.data.model.DeviceDto
import com.enctxt.data.model.DeviceRecord
import com.enctxt.data.model.RegisterDeviceRequest
import com.enctxt.data.model.RevokeDeviceResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Repository for managing registered devices and active device trust (Layer 4 — Device Trust).
 *
 * SECURITY CONTRACTS:
 * - Never transmits or logs private cryptographic keys or Keystore aliases.
 * - Server remains authoritative for revocation (handles 403/401/404 safely).
 */
class DeviceRepository(
    private val apiClient: ApiClient
) {

    /**
     * Lists all devices registered to the user's account, identifying the current Android device.
     */
    suspend fun listDevices(currentKeyId: String? = null): NetworkResult<List<DeviceRecord>> = withContext(Dispatchers.IO) {
        when (val res = apiClient.getDevices()) {
            is NetworkResult.Success -> {
                val records = res.data.devices.map { dto ->
                    DeviceRecord(
                        id = dto.id,
                        deviceName = dto.deviceName,
                        platform = dto.platform,
                        keyId = dto.keyId,
                        status = dto.status,
                        lastSeenAt = dto.lastSeenAt,
                        createdAt = dto.createdAt,
                        isCurrentDevice = (currentKeyId != null && dto.keyId == currentKeyId)
                    )
                }
                NetworkResult.Success(records)
            }
            is NetworkResult.Error -> NetworkResult.Error(res.code, res.message, res.statusCode)
            is NetworkResult.Loading -> NetworkResult.Loading
        }
    }

    /**
     * Registers the current device with its associated public key ID.
     */
    suspend fun registerDevice(
        deviceName: String = "Android Phone",
        platform: String = "android",
        keyId: String
    ): NetworkResult<DeviceDto> = withContext(Dispatchers.IO) {
        apiClient.registerDevice(
            RegisterDeviceRequest(
                deviceName = deviceName,
                platform = platform,
                keyId = keyId
            )
        )
    }

    /**
     * Revokes a registered device on the server.
     */
    suspend fun revokeDevice(deviceId: String): NetworkResult<RevokeDeviceResponse> = withContext(Dispatchers.IO) {
        if (deviceId.isBlank()) {
            return@withContext NetworkResult.Error("INVALID_DEVICE_ID", "Device ID cannot be blank", 400)
        }
        when (val res = apiClient.revokeDevice(deviceId)) {
            is NetworkResult.Success -> NetworkResult.Success(res.data)
            is NetworkResult.Error -> {
                val safeMessage = when (res.statusCode) {
                    403 -> "You are not authorized to revoke this device"
                    404 -> "Device not found"
                    401 -> "Session expired. Please log in again."
                    else -> res.message.ifEmpty { "Failed to revoke device" }
                }
                NetworkResult.Error(res.code, safeMessage, res.statusCode)
            }
            is NetworkResult.Loading -> NetworkResult.Loading
        }
    }
}
