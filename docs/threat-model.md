# ENCTXT Security Boundaries & Threat Model

**Version**: `1.0.0-rc.1`  
**Evaluation Standard**: 4-Layer Defense-in-Depth Privacy Model

---

## 1. System Protection Boundaries

| Threat Vector | Defense Mechanism | System Guarantee |
|---|---|---|
| **Database Compromise** | Layer 1 (Client-Side E2EE) | Database stores only ciphertext envelopes; zero plaintext is readable. |
| **Network Eavesdropping** | HTTPS/TLS 1.3 + E2EE | Dual-layer encryption prevents ISP, proxy, or transit interception. |
| **Malicious Server / MITM** | Layer 4 (Identity Verification) | Users verify public key fingerprints and symmetric safety numbers out-of-band to detect key substitution. |
| **Shoulder Surfing** | Layer 2 (Visual Protection) | Messages appear as deterministic visual homoglyphs on screen by default. |
| **Unauthorized Screen Reading** | Layer 3 (Gesture Reveal) | Plaintext is temporarily unlocked for only 8 seconds via gesture authorization. |
| **Background / Tab Switching** | Auto Re-Protection | Plaintexts immediately re-protect on window blur, tab change, or logout. |
| **Server-Side Key Compromise** | Client-Isolated Keys | Private keys are generated and stored exclusively in client-side IndexedDB / Keystore. |

---

## 2. Explicit Non-Protections (Endpoint Limitations)

> [!WARNING]
> **End-to-End Encryption Threat Boundary**:
> End-to-end encryption protects message confidentiality in transit and at rest on servers/databases. It does NOT protect against a compromised client device.

The ENCTXT security model explicitly does **NOT** defend against:
1. **Compromised Operating Systems & Rootkits**: Malware with kernel/root privileges can read process memory.
2. **Keyloggers & Hardware Loggers**: Input logged before client-side encryption.
3. **Malicious Browser Extensions**: Extensions with broad DOM/storage permissions.
4. **Screen Recording & Optical Capture**: External camera recording during an 8-second temporary reveal.
5. **Physical Access to an Unlocked Device**: Direct physical user impersonation.
6. **Recipient Intentional Exfiltration**: A recipient manually recording or forwarding decrypted text.

---

## 3. Cryptographic & Protocol Claims Invariant

- **Implemented Protocol**: `ECDH P-256` identity key agreement + `HKDF-SHA-256` key derivation + `AES-256-GCM` with 128-bit authentication tags and AAD context binding.
- **Accurate Claims Policy**: ENCTXT makes no claim of Double Ratchet ratcheting, per-message forward secrecy, or post-quantum resistance, as those mechanisms are not part of Protocol v1.
