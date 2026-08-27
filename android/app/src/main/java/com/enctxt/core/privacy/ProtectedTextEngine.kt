package com.enctxt.core.privacy

/**
 * ProtectedTextEngine — Protected Text v2 strategy dispatcher (Layer 2 Visual Privacy).
 *
 * Routes plaintext through one of the local rendering strategies:
 *
 *   ProtectedTextEngine
 *   ├── HomoglyphRenderer  (existing, unchanged)
 *   ├── IllusionRenderer   (new)
 *   └── PatternRenderer    (new, uses the local IntentClassifier)
 *
 * [ProtectedRenderMode.ADAPTIVE] is reserved for a future mode that picks a strategy
 * per-message; it is intentionally NOT implemented here (falls back to HOMOGLYPH), per spec §16.
 *
 * This is NOT cryptographic encryption. E2EE (Layer 1) handles cryptographic message
 * protection. This engine is responsible only for Layer 2 visual privacy, is pure/stateless/
 * side-effect free, and never touches the network or persists anything.
 *
 * Fail-closed contract: this function intentionally does not swallow renderer errors — callers
 * (e.g. [com.enctxt.presentation.components.ProtectedMessage]) must catch and render their own
 * safe fallback UI, never falling back to displaying plaintext.
 */
object ProtectedTextEngine {

    const val PROTECTED_RENDERER_VERSION = 2

    /**
     * Transforms plaintext into its protected representation for the given mode. Deterministic,
     * stateless, and synchronous.
     */
    fun protect(content: String, mode: ProtectedRenderMode = ProtectedRenderMode.HOMOGLYPH): String {
        if (content.isEmpty()) return ""

        return when (mode) {
            ProtectedRenderMode.HOMOGLYPH -> HomoglyphRenderer.protect(content)
            ProtectedRenderMode.ILLUSION -> IllusionRenderer.protect(content, PROTECTED_RENDERER_VERSION)
            ProtectedRenderMode.PATTERN -> PatternRenderer.protect(content, PROTECTED_RENDERER_VERSION)
            // Not implemented yet (spec §16) — use the most conservative existing mode.
            ProtectedRenderMode.ADAPTIVE -> HomoglyphRenderer.protect(content)
        }
    }
}
