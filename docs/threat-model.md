# Vade Security Boundaries & Threat Model

**Version**: `1.0.0-rc.1`  
**Platforms**: Android Client (Native Kotlin / Jetpack Compose) & Web Client (TypeScript / React)  
**Security Architecture**: 4-Layer Defense-in-Depth Privacy Model

---

## 1. 4-Layer Defense-in-Depth Architecture

```text
Layer 1 — End-to-End Encryption
ECDH P-256 (Key Agreement) + HKDF-SHA-256 (KDF) + AES-256-GCM (Authenticated Encryption)
        │
        ▼
Layer 2 — Protected Message Rendering
Deterministic canonical homoglyph mapping (Zero Plaintext Display by Default)
        │
        ▼
Layer 3 — Local Gesture Reveal & Window Protection
64-point arc-length normalized gesture authorization + FLAG_SECURE window protection (≤ 8s expiration)
        │
        ▼
Layer 4 — Identity Verification & Device Trust
SHA-256 Identity Fingerprints + Lexicographical Symmetric Safety Numbers + Fail-Closed Key Change Warnings + Server Device Revocation
```

---

## 2. System Protection Boundaries & Guarantees

| Threat Vector | Defense Mechanism | System Guarantee |
|---|---|---|
| **Database Compromise** | Layer 1 (Client-Side E2EE) | PostgreSQL & Room store only ciphertext envelopes with fresh 96-bit nonces; zero plaintext is readable. |
| **Network Eavesdropping** | HTTPS/TLS 1.3 + E2EE | Dual-layer encryption prevents ISP, proxy, cellular carrier, or transit interception. |
| **Malicious Server / MITM** | Layer 4 (Identity Verification) | Users verify public key fingerprints (8×4 hex) and symmetric safety numbers (4×5 digits) out-of-band to detect key substitution. |
| **Key Rotation / Substitution** | Layer 4 (Key-Change Detection) | Any server public key change transitions contact state to `KeyChanged` with prominent warnings. Never silently re-verifies. |
| **Rogue / Stolen Devices** | Layer 4 (Device Trust) | Authoritative device listing and server-enforced revocation (`POST /api/devices/:id/revoke`). |
| **Shoulder Surfing** | Layer 2 (Protected Rendering) | Messages render as visual homoglyphs on screen by default across timelines and previews. |
| **Unauthorized Screen Reading** | Layer 3 (Gesture Reveal) | Plaintext is temporarily revealed for only ≤ 8 seconds via local gesture authorization. |
| **Background / App Switching** | Layer 3 (Auto Re-Protection) | Plaintexts immediately re-protect on `ON_STOP`, window focus loss, navigation away, or lockout. |
| **Screen Capture & Recents Leaks** | Layer 3 (FLAG_SECURE) | Android window dynamically enables `FLAG_SECURE` during reveal, blocking screenshots, screen recording, and recent-app previews. |
| **Local Device Key Theft** | Android Keystore | Private EC keys are generated and protected hardware-backed in Android Keystore with `PURPOSE_AGREE_KEY`. |
| **Gesture Template Theft** | Encrypted Preferences | Stored gesture templates and verification records use AES-256-GCM encrypted local storage with fail-closed deserialization. |

---

## 3. Explicit Security Boundaries & Limitations

> [!WARNING]
> **End-to-End Encryption Threat Boundary**:
> End-to-end encryption guarantees message confidentiality and authenticity in transit and at rest on servers and databases. It does NOT guarantee client hardware integrity or protect against compromised host operating systems.

### 3.1 E2EE Security Boundary (Layer 1)
- **Implemented Cryptography**: `ECDH P-256` identity key agreement + `HKDF-SHA-256` key derivation + `AES-256-GCM` with 128-bit authentication tags and AAD context binding (`conversationId:senderId:v1`).
- **Accurate Claims Invariant**: Vade does NOT claim Signal-equivalent Double Ratchet ratcheting, per-message forward secrecy, or post-quantum resistance, as those mechanisms are not part of Protocol v1.

### 3.2 Key Verification Security Boundary (Layer 4)
- **Fingerprint Verification**: Cryptographic identity fingerprints (SHA-256 SPKI) and safety numbers significantly reduce public-key substitution (MITM) risk.
- **Limitation**: Fingerprint verification does NOT guarantee recipient device integrity, OS trustworthiness, or identity authenticity outside the out-of-band verification channel.

### 3.3 Gesture Reveal Security Boundary (Layer 3)
- **Local Reveal Authorization**: Gesture recognition is a local authorization gate designed to protect against visual observation, casual snooping, and shoulder surfing.
- **Limitation**: Gesture recognition is NOT a cryptographic key derivation function, account password, or proof of identity against root access.

### 3.4 Device Trust Security Boundary (Layer 4)
- **Device Management**: Identifies registered active devices associated with a user account.
- **Limitation**: Device registration does NOT attest to hardware integrity, firmware security, or absence of device-level malware.

---

## 4. Explicit Non-Protections (Endpoint Limitations)

The Vade security model explicitly does **NOT** defend against:
1. **Compromised Operating Systems & Rootkits**: Malware with root/kernel privileges capable of reading process memory directly.
2. **Keyloggers & Hardware Loggers**: Input logged before client-side encryption.
3. **Malicious Accessibility Services & Overlay Injection**: Sideloaded malicious accessibility apps with screen reading privileges.
4. **Physical Compromise of an Unlocked Device**: Direct physical user impersonation while the device is in active unlocked possession.
5. **Optical & External Camera Capture**: Physical cameras recording the display during an authorized ≤ 8-second temporary reveal.
6. **Recipient Intentional Exfiltration**: A verified recipient manually transcribing or forwarding decrypted messages.
