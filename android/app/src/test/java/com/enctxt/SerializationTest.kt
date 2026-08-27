package com.enctxt

import com.enctxt.data.model.ConversationResponse
import com.enctxt.data.model.CreateConversationResponse
import com.enctxt.data.model.PublicKeyResponse
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

    private val alicePublicKeySpkiBase64 =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEawMQ2rcQ7O3eTx0A3MmKjcMKOcqAuojgM68JwnxzDSpi40mxKcY2A/dWMdWvp0C3sGX/aXjlwmzMLOV+EAVJdg=="

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

    // Regression test: POST /api/conversations returns a single `participant`
    // object, while GET /api/conversations/{id} returns a `participants` list.
    // Decoding the create-endpoint's actual response against the wrong
    // (list-shaped) model throws a MissingFieldException that was silently
    // swallowed as a generic network error, making "start conversation" a
    // no-op tap with no visible error.
    @Test
    fun testCreateConversationResponseMatchesServerShape() {
        val createResponseJson = """
            {"conversation":{"id":"conv-1","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","participant":{"id":"user-2","username":"bob","displayName":"Bob"}}}
        """.trimIndent()

        val parsed = json.decodeFromString<CreateConversationResponse>(createResponseJson)
        assertEquals("conv-1", parsed.conversation.id)
        assertEquals("bob", parsed.conversation.participant.username)
    }

    // Regression test: GET /api/crypto/users/{id}/key nests the record under
    // "key". Modelling those fields flat made every peer-key fetch fail to
    // decode, so no conversation key could be derived and every message was
    // undecryptable. The pre-existing unit tests constructed the model
    // directly instead of decoding a real server payload, so they agreed with
    // the wrong shape and the mismatch reached production.
    @Test
    fun testPublicKeyResponseMatchesServerShape() {
        val serverJson = """
            {"key":{"id":"row-1","keyId":"k_abc123","userId":"user-2","publicKey":"$alicePublicKeySpkiBase64","algorithm":"ECDH-P256","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}
        """.trimIndent()

        val parsed = json.decodeFromString<PublicKeyResponse>(serverJson)
        assertEquals("k_abc123", parsed.key?.keyId)
        assertEquals("user-2", parsed.key?.userId)
        assertEquals(alicePublicKeySpkiBase64, parsed.key?.publicKey)
    }

    @Test
    fun testPublicKeyResponseToleratesMissingKey() {
        val parsed = json.decodeFromString<PublicKeyResponse>("""{"key":null}""")
        assertEquals(null, parsed.key)
    }

    @Test
    fun testConversationDetailResponseMatchesServerShape() {
        val detailResponseJson = """
            {"conversation":{"id":"conv-1","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","participants":[{"id":"user-1","username":"alice","displayName":"Alice"},{"id":"user-2","username":"bob","displayName":"Bob"}]}}
        """.trimIndent()

        val parsed = json.decodeFromString<ConversationResponse>(detailResponseJson)
        assertEquals(2, parsed.conversation.participants.size)
    }
}
