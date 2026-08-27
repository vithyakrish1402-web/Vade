/**
 * Local Protection Style Preference Storage
 *
 * Persists the user's chosen rendering mode (Classic/Illusion/Pattern) locally in
 * `localStorage`, mirroring the pattern already used by `gestureStorage.ts`.
 *
 * SECURITY & PRIVACY NOTICE:
 * - This preference is strictly LOCAL ONLY.
 * - It is a UI/rendering choice, never sent to the backend, never stored in cookies, and never
 *   transmitted in WebSocket frames — it does not need to be synchronized across devices.
 */

import type { ProtectionMode } from './protectedTextEngine';

export const CURRENT_PREFERENCE_VERSION = 1;
const STORAGE_PREFIX = 'enctxt_protection_style_';

const VALID_MODES: ProtectionMode[] = ['HOMOGLYPH', 'ILLUSION', 'PATTERN'];

interface StoredProtectionStyle {
  version: number;
  mode: ProtectionMode;
}

function getStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/**
 * Reads the user's stored protection style preference. Falls back to 'HOMOGLYPH' (the existing
 * "Classic" behavior) if nothing is stored or the stored value is invalid/corrupted.
 */
export function getProtectionStyle(userId: string): ProtectionMode {
  if (!userId) return 'HOMOGLYPH';

  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return 'HOMOGLYPH';

    const parsed = JSON.parse(raw) as StoredProtectionStyle;
    if (parsed && VALID_MODES.includes(parsed.mode)) {
      return parsed.mode;
    }
    return 'HOMOGLYPH';
  } catch {
    return 'HOMOGLYPH';
  }
}

/**
 * Saves the user's protection style preference locally.
 */
export function setProtectionStyle(userId: string, mode: ProtectionMode): boolean {
  if (!userId || !VALID_MODES.includes(mode)) return false;

  try {
    const data: StoredProtectionStyle = { version: CURRENT_PREFERENCE_VERSION, mode };
    localStorage.setItem(getStorageKey(userId), JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Failed to save protection style preference to local storage:', error);
    return false;
  }
}
