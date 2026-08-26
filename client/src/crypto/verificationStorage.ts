import type { ContactVerification } from '@enctxt/shared';

const STORAGE_KEY = 'enctxt_verified_contacts_v1';

export function getAllVerifications(): Record<string, ContactVerification> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    // Fail closed if corrupted
    return {};
  }
}

export function getVerification(userId: string): ContactVerification | null {
  const all = getAllVerifications();
  return all[userId] || null;
}

export function saveVerification(verification: ContactVerification): void {
  try {
    const all = getAllVerifications();
    all[verification.userId] = verification;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (error) {
    console.warn('Failed to save contact verification:', error);
  }
}

export function removeVerification(userId: string): void {
  try {
    const all = getAllVerifications();
    delete all[userId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (error) {
    console.warn('Failed to remove contact verification:', error);
  }
}

export function clearAllVerifications(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
