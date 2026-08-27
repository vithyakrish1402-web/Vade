package com.enctxt.core.privacy

/**
 * Protected Text v2 rendering strategies. `ADAPTIVE` is reserved for a future mode that picks a
 * strategy per-message; it is intentionally NOT implemented (the engine falls back to
 * [HOMOGLYPH] if it's ever passed), per spec §16.
 */
enum class ProtectedRenderMode {
    HOMOGLYPH,
    ILLUSION,
    PATTERN,
    ADAPTIVE
}
