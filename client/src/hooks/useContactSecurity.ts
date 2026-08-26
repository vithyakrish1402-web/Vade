import { useState, useEffect, useCallback } from 'react';
import type { ContactVerificationState, ContactVerification } from '@enctxt/shared';
import {
  calculateKeyFingerprint,
  calculateSafetyNumber,
  getVerification,
  saveVerification,
  removeVerification,
} from '../crypto';

export interface UseContactSecurityReturn {
  verificationState: ContactVerificationState;
  peerFingerprint: string | null;
  myFingerprint: string | null;
  safetyNumber: string | null;
  verifiedAt: string | null;
  isKeyChanged: boolean;
  markAsVerified: () => Promise<void>;
  unverify: () => void;
  isLoading: boolean;
}

export function useContactSecurity(
  peerUserId: string | undefined,
  myPublicKeyBase64: string | undefined,
  peerKeyRecord: { keyId: string; publicKey: string } | null | undefined
): UseContactSecurityReturn {
  const [verificationState, setVerificationState] = useState<ContactVerificationState>('unverified');
  const [peerFingerprint, setPeerFingerprint] = useState<string | null>(null);
  const [myFingerprint, setMyFingerprint] = useState<string | null>(null);
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Recompute security state whenever keys or peer change
  useEffect(() => {
    if (!peerUserId || !peerKeyRecord || !myPublicKeyBase64) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function evaluateSecurity() {
      setIsLoading(true);
      try {
        // Calculate fingerprints and safety number
        const [myFp, peerFp, sNum] = await Promise.all([
          calculateKeyFingerprint(myPublicKeyBase64!),
          calculateKeyFingerprint(peerKeyRecord!.publicKey),
          calculateSafetyNumber(myPublicKeyBase64!, peerKeyRecord!.publicKey),
        ]);

        if (!isMounted) return;

        setMyFingerprint(myFp);
        setPeerFingerprint(peerFp);
        setSafetyNumber(sNum);

        // Check local verification storage
        const stored = getVerification(peerUserId!);
        if (stored) {
          if (stored.keyId === peerKeyRecord!.keyId) {
            setVerificationState('verified');
            setVerifiedAt(stored.verifiedAt);
          } else {
            // Key changed from the previously verified key!
            setVerificationState('key_changed');
            setVerifiedAt(null);
          }
        } else {
          setVerificationState('unverified');
          setVerifiedAt(null);
        }
      } catch (error) {
        console.warn('Error evaluating contact security:', error);
        if (isMounted) setVerificationState('unverified');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    evaluateSecurity();

    return () => {
      isMounted = false;
    };
  }, [peerUserId, peerKeyRecord?.keyId, peerKeyRecord?.publicKey, myPublicKeyBase64]);

  const markAsVerified = useCallback(async () => {
    if (!peerUserId || !peerKeyRecord || !peerFingerprint) return;

    const verification: ContactVerification = {
      userId: peerUserId,
      keyId: peerKeyRecord.keyId,
      fingerprint: peerFingerprint,
      verifiedAt: new Date().toISOString(),
    };

    saveVerification(verification);
    setVerificationState('verified');
    setVerifiedAt(verification.verifiedAt);
  }, [peerUserId, peerKeyRecord, peerFingerprint]);

  const unverify = useCallback(() => {
    if (!peerUserId) return;
    removeVerification(peerUserId);
    setVerificationState('unverified');
    setVerifiedAt(null);
  }, [peerUserId]);

  return {
    verificationState,
    peerFingerprint,
    myFingerprint,
    safetyNumber,
    verifiedAt,
    isKeyChanged: verificationState === 'key_changed',
    markAsVerified,
    unverify,
    isLoading,
  };
}
