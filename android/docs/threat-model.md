# ENCTXT Android Threat Model & Security Boundaries

**Version**: `1.0.0-rc.1`  
**Platform**: Android 8.0+ (API 26–34)

---

## 1. Defended Threat Vectors on Android

| Threat Vector | Defense Mechanism | System Guarantee |
|---|---|---|
| **Server/Database Compromise** | Layer 1 (E2EE Client Encryption) | Backend and PostgreSQL store only ciphertext envelopes. |
| **Network Eavesdropping** | HTTPS / TLS 1.3 + E2EE | Dual-layer transport encryption prevents ISP/proxy interception. |
| **Cloud Backup Extraction** | Disabled Auto-Backup | `allowBackup="false"` prevents extraction via Google Drive backups. |
| **Private Key Extraction** | Android KeyStore Hardware Isolation | Private keys remain inside hardware boundary (TEE / StrongBox). |
| **Cleartext Downgrades** | Network Security Config | Android system strictly rejects cleartext `http://` and `ws://` traffic. |
| **Shoulder Surfing** | Layer 2 Visual Protection | Messages rendered as deterministic visual homoglyphs before reveal. |
| **Unauthorized Access on Background** | Instant Re-Protection | Plaintexts return to protected mode on `onPause` / app switcher. |

---

## 2. Explicit Android Non-Protections (OS & Hardware Limitations)

> [!WARNING]
> The Android security model protects communication across the network and server, but cannot defend against a compromised Android endpoint.

The application explicitly does **NOT** defend against:
1. **Rooted Devices & Kernel Exploits**: Superuser access capable of memory scraping.
2. **Accessibility Service Abuse**: Malicious apps granted Android Accessibility permissions reading screen contents.
3. **Malicious Keyboards**: Custom third-party IME keyboards capturing input prior to encryption.
4. **Physical Unlocked Access**: Direct device access while the screen is unlocked.
5. **Optical Screen Recording**: External video capture during an active reveal.
