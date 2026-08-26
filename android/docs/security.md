# ENCTXT Android Security Architecture & Keystore Boundaries

This document details the security model, private key protection mechanisms, and privacy boundaries implemented in the **ENCTXT** Android application.

---

## 1. Android KeyStore & Private Key Isolation

> [!IMPORTANT]
> **Hardware Key Isolation Invariant**:
> Private identity keys generated on Android are stored within the `AndroidKeyStore` provider backed by hardware security modules (TEE / StrongBox where available).
> - Private keys are configured with `PURPOSE_AGREE_KEY` on curve `secp256r1` (NIST P-256).
> - Private key bytes are **never extractable or exported** from the hardware boundary.
> - The application exposes only the public key in `SubjectPublicKeyInfo` (SPKI) Base64 encoding.

---

## 2. Zero-Plaintext Local Persistence

The Room database (`EnctxtDatabase`) enforces the following storage boundaries:
- **`user_sessions`**: Stores account metadata and active session tokens.
- **`conversations`**: Stores participant user IDs and display names.
- **`encrypted_messages`**: Strictly stores the encrypted envelope (`ciphertext`, `nonce`, `senderKeyId`, `recipientKeyId`, `algorithm`, `version`, `aad`).
- **No Plaintext Message Columns**: The database contains zero plaintext message columns. Decrypted text is held only in transient memory during active visual reveals.

---

## 3. Network Security & Transport

- **Cleartext Traffic Disabled**: Defined in `res/xml/network_security_config.xml` (`cleartextTrafficPermitted="false"`). Production builds strictly reject unencrypted `http://` and `ws://` connections.
- **TLS Certificate Validation**: System certificate validation is strictly enforced; no trust-all or permissive SSL contexts exist.
- **HttpOnly Cookie Management**: The native `MemoryCookieJar` captures and transmits session cookies across HTTPS and WSS upgrade handshakes.

---

## 4. Application Lifecycle & Privacy Policies

- **Auto-Backup Disabled**: `android:allowBackup="false"` prevents local database files from entering unencrypted cloud backups.
- **Zero Sensitive Logging**: Android logs record operational event states only; plaintext, ciphertext payloads, private keys, and session secrets are never logged.
- **Screenshot Protection**: Security-sensitive visual reveal screens in future phases will apply `WindowManager.LayoutParams.FLAG_SECURE` to prevent optical and screen recording exfiltration.
