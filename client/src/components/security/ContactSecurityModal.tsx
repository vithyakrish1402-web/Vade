import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Copy,
  Check,
  X,
  Lock,
  QrCode,
  Key,
  Info,
} from 'lucide-react';
import type { ContactVerificationState } from '@enctxt/shared';

interface ContactSecurityModalProps {
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

  if (!isOpen) return null;

  const handleCopy = () => {
    if (safetyNumber) {
      navigator.clipboard.writeText(safetyNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            {verificationState === 'verified' ? (
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-5 h-5" />
              </div>
            ) : verificationState === 'key_changed' ? (
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <ShieldAlert className="w-5 h-5" />
              </div>
            ) : (
              <div className="p-2 rounded-xl bg-slate-800 text-slate-400 border border-slate-700">
                <Shield className="w-5 h-5" />
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold text-slate-100">Encryption & Identity Verification</h3>
              <p className="text-xs text-slate-400">@{peerUsername}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Key Changed Warning Banner */}
          {verificationState === 'key_changed' && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-300 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 font-semibold text-amber-200">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Security key changed</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-300/90">
                {peerDisplayName}&apos;s encryption identity has changed. This can occur if they reinstalled the app,
                logged in from a new device, or reset their security key. Compare safety numbers before continuing sensitive conversations.
              </p>
            </div>
          )}

          {/* Safety Number Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Safety Number</span>
              </label>
              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
              >
                <QrCode className="w-3 h-3" />
                <span>{showQr ? 'Show Digits' : 'Show Visual'}</span>
              </button>
            </div>

            {showQr ? (
              <div className="p-6 bg-slate-950 border border-slate-800 rounded-xl flex flex-col items-center justify-center space-y-2">
                <div className="w-32 h-32 bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-center text-emerald-400">
                  <QrCode className="w-24 h-24 text-emerald-400/80" />
                </div>
                <p className="text-[10px] text-slate-500 font-mono">Visual verification pattern</p>
              </div>
            ) : (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-center">
                <p className="text-base sm:text-lg font-mono font-bold tracking-wider text-emerald-400 selection:bg-emerald-900">
                  {safetyNumber || 'Generating code...'}
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                  Compare this security code with {peerDisplayName} in person or through a trusted channel. If the numbers match, your end-to-end encrypted connection is verified.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleCopy}
              disabled={!safetyNumber}
              className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied to Clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Safety Number</span>
                </>
              )}
            </button>
          </div>

          {/* Details & Cryptographic Metadata */}
          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1">
                <Info className="w-3 h-3 text-slate-500" />
                <span>Protocol:</span>
              </span>
              <span className="font-mono text-slate-200">v1 · AES-256-GCM · ECDH-P256</span>
            </div>

            {peerKeyId && (
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1">
                  <Key className="w-3 h-3 text-slate-500" />
                  <span>Key ID:</span>
                </span>
                <span className="font-mono text-slate-200 text-[11px] truncate max-w-[180px]">
                  {peerKeyId}
                </span>
              </div>
            )}

            {peerFingerprint && (
              <div className="pt-1 border-t border-slate-800/80 space-y-1">
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">
                  Public Key Fingerprint (SHA-256):
                </span>
                <p className="font-mono text-[10px] text-slate-400 break-all bg-slate-900/80 p-2 rounded border border-slate-800">
                  {peerFingerprint}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between gap-3">
          {verificationState === 'verified' ? (
            <button
              type="button"
              onClick={onUnverify}
              className="px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-xl border border-rose-900/40 transition-colors cursor-pointer"
            >
              Remove Verification
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          {verificationState !== 'verified' && (
            <button
              type="button"
              onClick={async () => {
                await onVerify();
                onClose();
              }}
              className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all cursor-pointer flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Mark as Verified</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
