package com.enctxt

import com.enctxt.data.model.EncryptedEnvelopeDto
import com.enctxt.data.model.RegisterRequest
import com.enctxt.data.model.WSClientMessage
import com.enctxt.data.model.WSServerMessage
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SerializationTest {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    @Test
    fun testEnvelopeSerialization() {
        val envelope = EncryptedEnvelopeDto(
            version = 1,
            algorithm = "AES-256-GCM",
            keyAgreement = "ECDH-P256",
            senderKeyId = "k_123",
            recipientKeyId = "k_456",
            nonce = "nonce_bytes",
            ciphertext = "ct_bytes",
            aad = "conv:sender:v1"
        )

        val serialized = json.encodeToString(envelope)
        assertTrue(serialized.contains("\"version\":1"))
        assertTrue(serialized.contains("\"algorithm\":\"AES-256-GCM\""))

        val deserialized = json.decodeFromString<EncryptedEnvelopeDto>(serialized)
        assertEquals(envelope, deserialized)
    }

    @Test
    fun testWebSocketFrameSerialization() {
        val clientMsg = WSClientMessage(type = "subscribe", conversationId = "conv-123")
        val serializedClient = json.encodeToString(clientMsg)
        assertTrue(serializedClient.contains("\"type\":\"subscribe\""))

        val serverMsgJson = """{"type":"authenticated","userId":"user-789"}"""
        val parsedServerMsg = json.decodeFromString<WSServerMessage>(serverMsgJson)
        assertEquals("authenticated", parsedServerMsg.type)
        assertEquals("user-789", parsedServerMsg.userId)
    }

    @Test
    fun testRegisterRequestSerialization() {
        val req = RegisterRequest(
            username = "alice",
            email = "alice@example.com",
            password = "SecretPassword123!",
            displayName = "Alice Smith"
        )
        val serialized = json.encodeToString(req)
        assertTrue(serialized.contains("\"username\":\"alice\""))
    }
}
