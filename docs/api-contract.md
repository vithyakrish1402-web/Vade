# ENCTXT REST API Contract (Protocol v1)

**Status**: FROZEN FOR RELEASE CANDIDATE (v1.0.0-rc.1)  
**Base URL**: `/api`  
**Content-Type**: `application/json`  
**Authentication**: Cookie-based HttpOnly JWT Session (`enctxt_session`)

---

## 1. Authentication Endpoints (`/api/auth`)

### 1.1 User Registration
- **Method**: `POST`
- **Path**: `/api/auth/register`
- **Auth Required**: No (Rate Limited: 5 req / 15m)
- **Request Body**:
  ```json
  {
    "username": "alice",
    "email": "alice@example.com",
    "password": "Password123!",
    "displayName": "Alice Smith"
  }
  ```
- **Validation Rules**:
  - `username`: `[a-zA-Z0-9_]{3,30}`
  - `email`: Valid email format
  - `password`: `>= 8` characters, with at least 1 uppercase, 1 lowercase, 1 number, 1 special character
  - `displayName`: `1–50` characters
- **Success Response**: `201 Created`
  ```json
  {
    "authenticated": true,
    "user": {
      "id": "uuid-v4",
      "username": "alice",
      "displayName": "Alice Smith"
    }
  }
  ```
- **Sets Cookie**: `Set-Cookie: enctxt_session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/`
- **Errors**:
  - `409 Conflict` (`RESOURCE_ALREADY_EXISTS`): Username or email already registered.
  - `422 Unprocessable Entity` (`VALIDATION_FAILED`): Malformed fields.
  - `429 Too Many Requests` (`RATE_LIMITED`): Registration limit exceeded.

---

### 1.2 User Login
- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Auth Required**: No (Rate Limited: 5 req / 15m)
- **Request Body**:
  ```json
  {
    "identifier": "alice@example.com",
    "password": "Password123!"
  }
  ```
- **Success Response**: `200 OK`
  ```json
  {
    "authenticated": true,
    "user": {
      "id": "uuid-v4",
      "username": "alice",
      "displayName": "Alice Smith"
    }
  }
  ```
- **Errors**:
  - `401 Unauthorized` (`AUTHENTICATION_FAILED`): Invalid credentials.
  - `429 Too Many Requests` (`RATE_LIMITED`): Login attempt limit exceeded.

---

### 1.3 Current User Session
- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Auth Required**: No (Returns null if unauthenticated)
- **Success Response**: `200 OK`
  ```json
  {
    "authenticated": true,
    "user": {
      "id": "uuid-v4",
      "username": "alice",
      "displayName": "Alice Smith"
    }
  }
  ```

---

### 1.4 User Logout
- **Method**: `POST`
- **Path**: `/api/auth/logout`
- **Auth Required**: No (Clears session in DB if present)
- **Success Response**: `200 OK`
  ```json
  {
    "message": "Logged out successfully"
  }
  ```
- **Clears Cookie**: `Set-Cookie: enctxt_session=; Max-Age=0; Path=/`

---

## 2. User & Profile Endpoints (`/api/users`)

### 2.1 Get User Profile
- **Method**: `GET`
- **Path**: `/api/users/me`
- **Auth Required**: Yes
- **Success Response**: `200 OK`
  ```json
  {
    "id": "uuid-v4",
    "username": "alice",
    "email": "alice@example.com",
    "displayName": "Alice Smith",
    "createdAt": "2026-08-25T10:00:00.000Z"
  }
  ```

---

### 2.2 Update Profile
- **Method**: `PATCH`
- **Path**: `/api/users/me`
- **Auth Required**: Yes
- **Request Body** (Partial):
  ```json
  {
    "displayName": "Alice S.",
    "username": "alice_updated"
  }
  ```
- **Success Response**: `200 OK`

---

### 2.3 User Search
- **Method**: `GET`
- **Path**: `/api/users/search?q=<query>`
- **Auth Required**: Yes
- **Success Response**: `200 OK`
  ```json
  {
    "users": [
      {
        "id": "uuid-v4",
        "username": "bob",
        "displayName": "Bob Jones"
      }
    ]
  }
  ```

---

## 3. Conversation Endpoints (`/api/conversations`)

### 3.1 Create or Fetch 1-to-1 Conversation
- **Method**: `POST`
- **Path**: `/api/conversations`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "userId": "peer-user-uuid"
  }
  ```
- **Semantics**: Uses deterministic sorted direct key (`min(idA, idB):max(idA, idB)`). Returns existing conversation if already created.
- **Success Response**: `200 OK` or `201 Created`
  ```json
  {
    "conversation": {
      "id": "conv-uuid-v4",
      "createdAt": "2026-08-25T10:00:00.000Z",
      "updatedAt": "2026-08-25T10:00:00.000Z",
      "participants": [
        { "id": "alice-id", "username": "alice", "displayName": "Alice Smith" },
        { "id": "bob-id", "username": "bob", "displayName": "Bob Jones" }
      ]
    }
  }
  ```

---

### 3.2 List Active Conversations
- **Method**: `GET`
- **Path**: `/api/conversations`
- **Auth Required**: Yes
- **Privacy Guarantee**: Returns safe participant metadata only. **Zero-plaintext previews**.
- **Success Response**: `200 OK`
  ```json
  {
    "conversations": [
      {
        "id": "conv-uuid-v4",
        "participant": {
          "id": "bob-id",
          "username": "bob",
          "displayName": "Bob Jones"
        },
        "createdAt": "2026-08-25T10:00:00.000Z",
        "updatedAt": "2026-08-25T10:30:00.000Z"
      }
    ]
  }
  ```

---

### 3.3 Get Conversation Details
- **Method**: `GET`
- **Path**: `/api/conversations/:id`
- **Auth Required**: Yes (Must be participant)
- **Errors**: `403 Forbidden` if requester is not a member.

---

## 4. Encrypted Messaging Endpoints (E2EE)

### 4.1 Send Encrypted Message
- **Method**: `POST`
- **Path**: `/api/conversations/:id/messages`
- **Auth Required**: Yes (Must be participant)
- **Request Body (Encrypted Envelope)**:
  ```json
  {
    "ciphertext": "Base64EncryptedPayload==",
    "nonce": "Base6496BitIV==",
    "senderKeyId": "k_uuid-v4",
    "recipientKeyId": "k_uuid-v4",
    "algorithm": "AES-256-GCM",
    "version": 1,
    "aad": "conv-uuid:sender-uuid:v1"
  }
  ```
- **Validation**:
  - `ciphertext`: Base64 string, max length 64KB
  - `nonce`: Base64 string (96-bit IV)
  - `version`: integer, strictly `1`
  - `algorithm`: strictly `"AES-256-GCM"`
- **Server Behavior**: Persists ciphertext envelope to database and broadcasts WebSocket event to room members. **Server NEVER receives or logs plaintext**.
- **Success Response**: `201 Created`
  ```json
  {
    "message": {
      "id": "msg-uuid-v4",
      "conversationId": "conv-uuid-v4",
      "senderId": "alice-id",
      "ciphertext": "Base64EncryptedPayload==",
      "nonce": "Base6496BitIV==",
      "senderKeyId": "k_uuid-v4",
      "recipientKeyId": "k_uuid-v4",
      "algorithm": "AES-256-GCM",
      "version": 1,
      "aad": "conv-uuid:sender-uuid:v1",
      "createdAt": "2026-08-25T10:30:00.000Z",
      "updatedAt": "2026-08-25T10:30:00.000Z"
    }
  }
  ```

---

### 4.2 Retrieve Encrypted History
- **Method**: `GET`
- **Path**: `/api/conversations/:id/messages?limit=50&before=<timestamp>`
- **Auth Required**: Yes (Must be participant)
- **Success Response**: `200 OK`
  ```json
  {
    "messages": [ ... ],
    "hasMore": false
  }
  ```

---

### 4.3 Mark Conversation Read
- **Method**: `POST`
- **Path**: `/api/conversations/:id/read`
- **Auth Required**: Yes (Must be participant)
- **Success Response**: `200 OK`

---

## 5. PKI & Identity Key Endpoints (`/api/crypto`)

### 5.1 Publish / Rotate Identity Public Key
- **Method**: `POST`
- **Path**: `/api/crypto/identity`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "keyId": "k_uuid-v4",
    "publicKey": "Base64EncodedSPKIPublicKey==",
    "algorithm": "ECDH-P256"
  }
  ```
- **Success Response**: `200 OK`

---

### 5.2 Retrieve User Public Key
- **Method**: `GET`
- **Path**: `/api/crypto/users/:userId/key`
- **Auth Required**: Yes
- **Success Response**: `200 OK`
  ```json
  {
    "userId": "user-uuid",
    "keyId": "k_uuid-v4",
    "publicKey": "Base64EncodedSPKIPublicKey==",
    "algorithm": "ECDH-P256",
    "status": "active",
    "createdAt": "2026-08-25T10:00:00.000Z"
  }
  ```

---

## 6. Device Management Endpoints (`/api/devices`)

### 6.1 List User Devices
- **Method**: `GET`
- **Path**: `/api/devices`
- **Auth Required**: Yes

---

### 6.2 Register Device Identity
- **Method**: `POST`
- **Path**: `/api/devices/register`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "deviceName": "Chrome on Windows",
    "platform": "web",
    "keyId": "k_uuid-v4"
  }
  ```

---

### 6.3 Revoke Device
- **Method**: `POST`
- **Path**: `/api/devices/:id/revoke`
- **Auth Required**: Yes (Owner only)

---

## 7. System Health & Readiness Endpoints (`/api/health`)

### 7.1 Liveness Probe
- **Method**: `GET`
- **Path**: `/api/health`
- **Auth Required**: No
- **Response**: `200 OK` `{"status": "ok", "uptime": 1234, "version": "1.0.0-rc.1"}`

---

### 7.2 Readiness Probe
- **Method**: `GET`
- **Path**: `/api/health/ready`
- **Auth Required**: No
- **Response**: `200 OK` (if DB reachable) / `503 Service Unavailable` (if DB disconnected)
