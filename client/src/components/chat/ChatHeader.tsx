import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, ShieldAlert } from 'lucide-react';
import type { ContactVerificationState, UserSummary } from '@enctxt/shared';
import type { WSConnectionStatus } from '../../services/websocket';
import { SecurityBadge, ConnectionBadge } from '../ui/Badge';

export interface ChatHeaderProps {
  peer: UserSummary | undefined;
  verificationState: ContactVerificationState;
  isSecurityLoading: boolean;
  isKeyChanged: boolean;
  connectionStatus: WSConnectionStatus;
  isGestureConfigured: boolean;
  onOpenSecurityModal: () => void;
  onOpenGestureSetup: () => void;
  onBack?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  peer,
  verificationState,
  isSecurityLoading,
  isKeyChanged,
  connectionStatus,
  isGestureConfigured,
  onOpenSecurityModal,
  onOpenGestureSetup,
  onBack,
}) => {
  return (
    <header className="flex flex-col border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
        {/* Left: Back & User Info */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/app"
            onClick={onBack}
            aria-label="Back to conversations"
            className="p-2 -ml-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </Link>

          <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-emerald-400 shrink-0 select-none shadow-sm">
            {peer?.displayName?.charAt(0).toUpperCase() || 'U'}
          </div>

          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-100 truncate">
              {peer?.displayName || 'Loading...'}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-400 font-mono">
                @{peer?.username}
              </span>

              {/* Security Verification Badge */}
              <SecurityBadge
                state={verificationState}
                isLoading={isSecurityLoading}
                onClick={onOpenSecurityModal}
              />
            </div>
          </div>
        </div>

        {/* Right: Controls & Connection Status */}
        <div className="flex items-center gap-2 shrink-0">
          {!isGestureConfigured && (
            <button
              type="button"
              onClick={onOpenGestureSetup}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              title="Configure gesture reveal sequence"
            >
              <Shield className="w-3 h-3" aria-hidden="true" />
              <span>Setup Gesture</span>
            </button>
          )}

          <ConnectionBadge status={connectionStatus} />
        </div>
      </div>

      {/* Prominent Key Change Warning Banner */}
      {isKeyChanged && (
        <div
          role="alert"
          className="px-4 sm:px-5 py-2.5 bg-amber-950/70 border-t border-amber-700/40 flex items-center justify-between gap-3 text-xs text-amber-200"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <span>
              <strong>Security Alert:</strong> @{peer?.username}&apos;s encryption identity has changed.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenSecurityModal}
            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg font-medium transition-colors border border-amber-500/40 cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Review Code
          </button>
        </div>
      )}
    </header>
  );
};
