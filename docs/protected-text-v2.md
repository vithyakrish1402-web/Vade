# Protected Text v2

**Protected Text v2 is NOT encryption.** It is a local, presentation-only "Layer 2 Visual
Privacy" transform applied to already-decrypted message content on the recipient's device, to
make casual shoulder-surfing harder. All cryptographic confidentiality is provided by Layer 1
E2EE (ECDH P-256 → HKDF-SHA-256 → AES-256-GCM), which this feature does not touch in any way.
Local reveal authorization (gesture unlock, ≤8s reveal window) is Layer 3 and is also unchanged.

```
PLAINTEXT → E2EE ENCRYPTION → CIPHERTEXT → (server/network) → LOCAL DECRYPTION
    → ProtectedTextEngine (this doc) → PROTECTED UI → gesture reveal (Layer 3) → PLAINTEXT (≤8s)
```

`PROTECTED_RENDERER_VERSION = 2`. This version is independent of the E2EE protocol version
(still v1) and only changes if the rendering algorithms in this document change.

## Architecture

```
ProtectedTextEngine.protect(plaintext, mode) -> protectedText
        │
        ├── HomoglyphRenderer   (existing Layer 2 behavior, unchanged)
        ├── IllusionRenderer    (new)
        └── PatternRenderer     (new, uses IntentClassifier)
```

- `mode` ∈ `{HOMOGLYPH, ILLUSION, PATTERN, ADAPTIVE}`. `ADAPTIVE` is reserved for a future mode
  that would pick a strategy per-message; it is **not implemented** — the engine falls back to
  `HOMOGLYPH` if it's ever passed.
- Implementations: Web (`client/src/utils/protectedText/`), Android
  (`android/app/src/main/java/com/enctxt/core/privacy/`). Both are pure, stateless, synchronous,
  and never touch the network, a database, or logging.
- **Fail-closed**: the engine itself does not swallow errors. Callers
  (`ProtectedMessage.tsx` / `ProtectedMessage.kt`) catch any exception and render
  `⚠️ Unable to display protected message` — never plaintext, and never silently disabled
  protection.

## Mode 1 — HOMOGLYPH (unchanged)

The original deterministic homoglyph substitution table. See `HomoglyphRenderer.kt` /
`homoglyphRenderer.ts` for the full mapping. Behavior is byte-for-byte identical to the pre-v2
implementation; all Phase 15/16 test vectors continue to pass unmodified.

## Mode 2 — ILLUSION

Partially distorts the message (leetspeak-like) so it stays roughly readable up close but is
harder to read at a glance. Word-aware: only individual eligible letters are considered for
substitution — whitespace, newlines, tabs, punctuation, digits, emoji, non-Latin scripts, and
URL-like runs (`http://`, `https://`, `www.`) always pass through unchanged.

### Candidate table (case-insensitive lookup; letters not listed always pass through)

| Letter | Candidates (priority order) |
|---|---|
| a | `4`, `α`, `@` |
| e | `3`, `є`, `€` |
| i | `1`, `ι`, `!` |
| o | `0`, `σ`, `ο` |
| s | `5`, `ѕ`, `$` |
| t | `7`, `τ` |
| g | `9` |
| b | `8` |
| h | `ħ` |
| n | `η` |
| r | `я` |
| u | `υ` |
| c | `¢` |
| x | `×` |
| y | `γ` |

`d, f, j, k, l, m, p, q, v, w, z` are never transformed.

### Deterministic seed

```
seed = SHA-256(plaintext + ":" + PROTECTED_RENDERER_VERSION + ":" + "ILLUSION")
```

The seed is used **only** to pick among approved visual substitutions — never as encryption or
authentication material, never a substitute for the AES-GCM nonce, and never part of the E2EE
protocol. Web computes this with a dependency-free synchronous SHA-256 implementation
(`sha256.ts`, verified against Node's `crypto` module); Android uses `java.security.MessageDigest`.

### Selection algorithm

For the *j*-th eligible letter encountered in the message (0-indexed, counting only letters that
have a candidate table entry):

1. `b = seed[j mod 32]` (unsigned byte, 0–255).
2. Transform this occurrence if `b mod 100 < 65` (`TRANSFORM_THRESHOLD = 65`).
3. If transforming, pick `candidates[(b div 100) mod candidates.length]`.
4. Numeral/symbol substitutes apply regardless of input letter case (`'A'` and `'a'` both → `4`).

`TRANSFORM_THRESHOLD = 65` was chosen so the overall fraction of **total characters** changed
lands in the spec's target band of roughly 20–45% for normal prose (verified against the test
vector corpus — see `illusionRenderer.test.ts` / `IllusionRendererTest.kt`).

### Examples (actual engine output, `PROTECTED_RENDERER_VERSION = 2`)

| Plaintext | Illusion |
|---|---|
| `meet me at the station` | `m€є7 m3 47 th€ 57a7ion` |
| `Are you coming tonight?` | `Ar3 γ0u c0m!ηg toηi9ħτ?` |

More vectors: `docs/test-vectors/protected-text-v2-test-vectors.json`.

## Mode 3 — PATTERN

Shows only a coarse, locally-classified intent hint — never the plaintext, never anything
beyond a single coarse category name.

### Intent categories & classifier

`URGENT, QUESTION, TIME, LOCATION, REQUEST, NEGATION, AFFIRMATION, GREETING, FAREWELL,
ACKNOWLEDGEMENT, GENERAL` (fallback default).

Classification is a local, deterministic, **first-match-wins** heuristic against this fixed
priority order (identical on both platforms):

1. **URGENT** — contains `urgent`, `emergency`, `asap`, `right now`, `immediately`, `help me`, or
   has 2+ `!` characters.
2. **QUESTION** — ends with `?`, or the first word is an interrogative starter (`who, what, when,
   where, why, how, can, could, would, should, is, are, do, does, did, will`).
3. **GREETING** — starts with `hello, hi, hey, good morning, good afternoon, good evening, yo,
   hola`.
4. **TIME** — contains a day/time-of-day word (`today, tomorrow, tonight, yesterday, morning,
   afternoon, evening, noon, midnight`, weekday names) or matches `\d{1,2}(:\d{2})?\s?(am|pm)`.
5. **LOCATION** — contains a location word (`station, airport, address, location, near, building,
   office, home, street, road, avenue, mall, park, restaurant, meet me at`).
6. **REQUEST** — contains `please, can you, could you, would you, send me, give me, help me with`.
7. **NEGATION** — contains `don't, doesn't, not, never, no, nope, can't, won't` (whole-word match).
8. **AFFIRMATION** — contains `yes, yeah, yep, sure, affirmative, agreed, absolutely`.
9. **FAREWELL** — contains `bye, goodbye, see you, take care, farewell, later`.
10. **ACKNOWLEDGEMENT** — contains `got it, noted, understood, roger, thanks, thank you, ack, ok,
    okay`.
11. **GENERAL** — fallback when nothing above matches.

All keyword matching is whole-word/whole-phrase (regex `\b...\b`), not naive substring
containment, so short keywords like "no" or "ok" don't false-positive inside unrelated words
("numbers", "look"). **False positives are acceptable and expected** — privacy takes priority
over classification accuracy, and no ML or external service is used.

### Grammar (fixed, never encodes plaintext)

```
PREFIX + " " + VISUAL_TOKEN + " · " + INTENT_SYMBOL + " · " + VISUAL_TOKEN
```

- `PREFIX` ∈ `{⟐, ◈, ❖, ✦}`, chosen from `seed[0] mod 4`.
- Each `VISUAL_TOKEN` is 3 characters drawn deterministically from a fixed decorative alphabet
  (`qwΜηєℓ7Xv4Ζσ9τяkPb`) using `seed` bytes — pure filler, never derived from message content
  beyond the seed.
- `INTENT_SYMBOL` is a fixed 1-character lookup per category:

  | Category | Symbol |
  |---|---|
  | URGENT | `‼` |
  | QUESTION | `?` |
  | TIME | `○` |
  | LOCATION | `⟐` |
  | REQUEST | `→` |
  | NEGATION | `-` |
  | AFFIRMATION | `+` |
  | GREETING | `~` |
  | FAREWELL | `»` |
  | ACKNOWLEDGEMENT | `✓` |
  | GENERAL | `•` |

`seed = SHA-256(plaintext + ":" + PROTECTED_RENDERER_VERSION + ":" + "PATTERN")` — same scheme as
Illusion, different mode string, so Illusion and Pattern never share a seed for the same message.

### Example (actual engine output)

`Are you coming tonight?` → `✦ PPP · ? · 7Xk` (classified `QUESTION`, symbol `?`; `PPP`/`7Xk` are
decorative seed-derived filler with no relationship to the message content beyond the seed).

## Cross-platform requirement

Web and Android **must** produce byte-identical `protect()` output and identical
`classifyIntent()`/`IntentClassifier.classify()` results for the same input. This is enforced by
`docs/test-vectors/protected-text-v2-test-vectors.json` — a single JSON file (generated from the
canonical Web engine) consumed directly by both test suites:

- Web: `client/test/protectedTextV2Vectors.test.ts` (loads the file from disk via `fs`).
- Android: `ProtectedTextV2CrossPlatformTest.kt` (loads it from the test classpath — the module's
  `build.gradle.kts` adds `docs/test-vectors` as a test resource directory, so there is no
  hand-copied duplicate).

The vector file covers all 23 required categories: empty string, single word, normal sentence,
question, greeting, request, location, time, urgent, affirmation, negation, multiline, tabs,
punctuation, numbers, emoji, Hindi, Chinese, Japanese, Korean, Arabic, accented Latin, and a
5000-character message — each rendered in all three modes.

## Local preferences ("Protection Style")

A per-user, **local-only, client-side** display preference (Classic/Illusion/Pattern), never
synchronized through the server:

- Web: `localStorage`, key `enctxt_protection_style_${userId}` (mirrors the existing
  `gestureStorage.ts` pattern). See `protectionStylePreference.ts`.
- Android: plain `SharedPreferences` file `protected_text_prefs` (not `EncryptedSharedPreferences`
  — unlike the gesture sequence, a rendering-style choice is not sensitive data). See
  `ProtectionStylePreference.kt`.

Surfaced in Settings as **"Protection Style"** with three plain-language options (Classic /
Illusion / Pattern) and no technical jargon (no mention of "encryption", "seed", "hash", or
"intent classifier" in the UI).

## Privacy guarantees (unchanged invariants)

| Surface | Contents |
|---|---|
| Server / network / database | Ciphertext only — no protected text, illusion text, intent, rendering mode, or rendering seed is ever sent |
| IndexedDB / local key storage | Existing private-key storage only (unchanged) |
| Gesture / verification storage | Encrypted local storage only (unchanged) |
| Protected rendering & classified intent | Transient memory only, recomputed on demand, never persisted |
| Clipboard | No message-copy feature exists on either platform (unchanged) — nothing to leak |
| Notifications | No notification system exists on either platform (unchanged) — nothing to leak |

## Security limitations

- This is a **visual deterrent**, not a security boundary. Anyone who can dictionary-match the
  candidate table (documented right here) can manually reverse ILLUSION text; that is expected
  and acceptable — it is not meant to resist a motivated, informed attacker, only casual
  shoulder-surfing.
- PATTERN mode's intent classification is coarse by design and may occasionally be wrong (a
  message can plausibly match more than one category); this is explicitly acceptable per the
  design goal of privacy over accuracy.
- The rendering seed is derived from the plaintext itself, so two messages with identical text
  render identically. This is intended (stability while displayed) and does not weaken E2EE,
  since the ciphertext for each message is still unique (fresh nonce, per-message AAD).

## Failure behavior

Any renderer exception (Web or Android) is caught at the UI layer and replaced with
`⚠️ Unable to display protected message`. The engine never falls back to displaying plaintext and
never silently disables protection.

## Accessibility

Screen readers announce the currently *visible* representation — the protected string while
protected, the real content only while genuinely revealed (post-gesture, ≤8s) — matching the
on-screen text exactly on both platforms.
