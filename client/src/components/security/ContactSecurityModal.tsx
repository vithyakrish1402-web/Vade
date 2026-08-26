import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Copy,
  Check,
  Lock,
  QrCode,
  Key,
  Info,
} from 'lucide-react';
import type { ContactVerificationState } from '@enctxt/shared';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export interface ContactSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  peerUsername: string;
  peerDisplayName: string;
  verificationState: ContactVerificationState;
  safetyNumber: string | null;
  peerFingerprint: string | null;
  peerKeyId?: string;
  onVerify: () => Promise<void>;
  onUnverify: () => void;
}

export const ContactSecurityModal: React.FC<ContactSecurityModalProps> = ({
  isOpen,
  onClose,
  peerUsername,
  peerDisplayName,
  verificationState,
  safetyNumber,
  peerFingerprint,
  peerKeyId,
  onVerify,
  onUnverify,
}) => {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setShowQr(false);
    }
  }, [isOpen]);

  const handleCopy = () => {
    if (safetyNumber) {
      navigator.clipboard.writeText(safetyNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerifyClick = async () => {
    setIsVerifying(true);
    try {
      await onVerify();
      onClose();
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Encryption & Identity Verification"
      description={`Verify end-to-end encryption keys with @${peerUsername}`}
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Verification Status Header */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
          <div
            className={`p-2.5 rounded-xl border ${
              verificationState === 'verified'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : verificationState === 'key_changed'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {verificationState === 'verified' ? (
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            ) : verificationState === 'key_changed' ? (
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Shield className="w-5 h-5" aria-hidden="true" />
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-200">
              {verificationState === 'verified'
                ? 'Identity Verified'
                : verificationState === 'key_changed'
                ? 'Security Key Changed'
                : 'Identity Not Yet Verified'}
            </p>
            <p className="text-[11px] text-slate-400">
              {verificationState === 'verified'
                ? 'You have confirmed the safety numbers match.'
                : verificationState === 'key_changed'
                ? 'This contact’s encryption key has rotated since your last verification.'
                : 'Compare safety numbers to prevent man-in-the-middle attacks.'}
            </p>
          </div>
        </div>

        {/* Safety Number Display */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              <span>Safety Number</span>
            </label>
            <button
              type="button"
              onClick={() => setShowQr(!showQr)}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
            >
              <QrCode className="w-3 h-3" aria-hidden="true" />
              <span>{showQr ? 'Show Digits' : 'Show Visual'}</span>
            </button>
          </div>

          {showQr ? (
            <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col items-center justify-center space-y-2">
              <div className="w-32 h-32 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-center text-emerald-400 shadow-inner">
                <QrCode className="w-24 h-24 text-emerald-400/90" aria-hidden="true" />
              </div>
              <p className="text-[10px] text-slate-500 font-mono">Visual verification pattern</p>
            </div>
          ) : (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2 text-center">
              <p className="text-base sm:text-lg font-mono font-bold tracking-wider text-emerald-400 selection:bg-emerald-900">
                {safetyNumber || 'Generating code...'}
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                Compare this safety number with {peerDisplayName} in person or via a trusted channel. If both numbers match, your conversation is cryptographically secure.
              </p>
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            disabled={!safetyNumber}
            className="w-full"
            leftIcon={
              copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )
            }
          >
            {copied ? 'Copied to Clipboard' : 'Copy Safety Number'}
          </Button>
        </div>

        {/* Cryptographic Details */}
        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>Protocol:</span>
            </span>
            <span className="font-mono text-slate-200">v1 · AES-256-GCM · ECDH-P256</span>
          </div>

          {peerKeyId && (
            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span>Key ID:</span>
              </span>
              <span className="font-mono text-slate-200 text-[11px] truncate max-w-[180px]">
                {peerKeyId}
              </span>
            </div>
          )}

          {peerFingerprint && (
            <div className="pt-2 border-t border-slate-800/80 space-y-1">
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">
                Public Key Fingerprint (SHA-256):
              </span>
              <p className="font-mono text-[10px] text-slate-400 break-all bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                {peerFingerprint}
              </p>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="pt-2 flex items-center justify-between gap-3">
          {verificationState === 'verified' ? (
            <Button variant="danger" size="sm" onClick={onUnverify}>
              Remove Verification
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          )}

          {verificationState !== 'verified' && (
            <Button
              variant="primary"
              size="sm"
              isLoading={isVerifying}
              onClick={handleVerifyClick}
              leftIcon={<ShieldCheck className="w-4 h-4" />}
            >
              Mark as Verified
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
