# ENCTXT WebSocket Protocol Contract (Protocol v1)

**Status**: FROZEN FOR RELEASE CANDIDATE (v1.0.0-rc.1)  
**Endpoint**: `wss://<host>/ws` (or `ws://<host>/ws` in local development)  
**Authentication**: HttpOnly Session Cookie (`enctxt_session`) on HTTP Upgrade Handshake  
**Maximum Frame Size**: 64 KB (65,536 bytes)  
**Heartbeat**: 30-second ping/pong interval

---

## 1. Connection & Handshake

1. Client opens WebSocket connection to `/ws` with standard credentials/cookies.
2. Server validates session cookie during HTTP upgrade.
3. If valid, server sends `{ "type": "authenticated", "userId": "<uuid>" }`.
4. If unauthenticated, client remains connected but must issue explicit `{ "type": "auth", "token": "<jwt>" }` before subscribing.

---

## 2. Client-to-Server Messages (`WSClientMessage`)

### 2.1 Heartbeat Ping
```json
{ "type": "ping" }
```

### 2.2 Explicit Token Auth (Optional)
```json
{ "type": "auth", "token": "<jwt_session_token>" }
```

### 2.3 Subscribe to Conversation Room
```json
{ "type": "subscribe", "conversationId": "conv-uuid-v4" }
```
- **Authorization**: User must be a verified member of the conversation. Otherwise, server responds with error `FORBIDDEN`.

### 2.4 Unsubscribe from Conversation Room
```json
{ "type": "unsubscribe", "conversationId": "conv-uuid-v4" }
```

### 2.5 Acknowledge Message Delivery
```json
{
  "type": "message.delivered",
  "conversationId": "conv-uuid-v4",
  "messageId": "msg-uuid-v4"
}
```

### 2.6 Acknowledge Message Read
```json
{
  "type": "message.read",
  "conversationId": "conv-uuid-v4",
  "messageId": "msg-uuid-v4"
}
```

---

## 3. Server-to-Client Messages (`WSServerMessage`)

### 3.1 Heartbeat Pong
```json
{ "type": "pong" }
```

### 3.2 Authentication Acknowledgment
```json
{ "type": "authenticated", "userId": "user-uuid-v4" }
```

### 3.3 Subscription Acknowledgment
```json
{ "type": "subscribed", "conversationId": "conv-uuid-v4" }
```

### 3.4 Unsubscription Acknowledgment
```json
{ "type": "unsubscribed", "conversationId": "conv-uuid-v4" }
```

### 3.5 New Encrypted Message Event (`message.created`)
Broadcast to all conversation members upon message creation:
```json
{
  "type": "message.created",
  "conversationId": "conv-uuid-v4",
  "message": {
    "id": "msg-uuid-v4",
    "conversationId": "conv-uuid-v4",
    "senderId": "sender-uuid-v4",
    "ciphertext": "Base64EncryptedCiphertext==",
    "nonce": "Base6496BitIV==",
    "senderKeyId": "k_sender_uuid",
    "recipientKeyId": "k_recipient_uuid",
    "algorithm": "AES-256-GCM",
    "version": 1,
    "aad": "conv-uuid:sender-uuid:v1",
    "createdAt": "2026-08-25T10:30:00.000Z",
    "updatedAt": "2026-08-25T10:30:00.000Z"
  }
}
```

### 3.6 Delivery Status Update (`message.delivered`)
```json
{
  "type": "message.delivered",
  "conversationId": "conv-uuid-v4",
  "messageId": "msg-uuid-v4",
  "deliveredAt": "2026-08-25T10:30:02.000Z"
}
```

### 3.7 Read Receipt Update (`message.read`)
```json
{
  "type": "message.read",
  "conversationId": "conv-uuid-v4",
  "messageId": "msg-uuid-v4",
  "readAt": "2026-08-25T10:30:05.000Z",
  "readBy": "recipient-uuid-v4"
}
```

### 3.8 Error Frame
```json
{
  "type": "error",
  "message": "Not authorized for this conversation",
  "code": "FORBIDDEN"
}
```

---

## 4. Reconnection & Catchup Flow

1. On network disconnect, client initiates exponential backoff reconnect (1s, 2s, 4s, max 10s).
2. Upon connection re-establishment, client re-authenticates and re-subscribes to active conversation rooms.
3. Client issues `GET /api/conversations/:id/messages?limit=50` to fetch missed messages.
4. Client decrypts envelopes locally in memory and deduplicates by `message.id`.
