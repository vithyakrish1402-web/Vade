import React from 'react';
import { ShieldCheck, ShieldAlert, Shield, Loader2, WifiOff } from 'lucide-react';
import type { ContactVerificationState } from '@enctxt/shared';
import type { WSConnectionStatus } from '../../services/websocket';

export interface SecurityBadgeProps {
  state: ContactVerificationState;
  isLoading?: boolean;
  onClick?: () => void;
  className?: string;
}

export const SecurityBadge: React.FC<SecurityBadgeProps> = ({
  state,
  isLoading = false,
  onClick,
  className = '',
}) => {
  if (isLoading) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700 ${className}`}
        aria-label="Checking security status"
      >
        <Loader2 className="w-3 h-3 animate-spin text-slate-400" aria-hidden="true" />
        <span>Checking security...</span>
      </div>
    );
  }

  const badgeConfig: Record<
    ContactVerificationState,
    { label: string; icon: React.ReactNode; style: string; ariaLabel: string }
  > = {
    verified: {
      label: 'Verified',
      icon: <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" aria-hidden="true" />,
      style: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20',
      ariaLabel: 'Cryptographic identity verified',
    },
    key_changed: {
      label: 'Key Changed',
      icon: <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" />,
      style: 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25 animate-pulse',
      ariaLabel: 'Warning: Cryptographic identity has changed',
    },
    unverified: {
      label: 'Unverified',
      icon: <Shield className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />,
      style: 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200',
      ariaLabel: 'Cryptographic identity not yet verified',
    },
    revoked: {
      label: 'Revoked',
      icon: <ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" aria-hidden="true" />,
      style: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
      ariaLabel: 'Cryptographic identity revoked',
    },
  };

  const current = badgeConfig[state] || badgeConfig.unverified;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={current.ariaLabel}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${current.style} ${className}`}
        title="Click to view cryptographic safety number"
      >
        {current.icon}
        <span>{current.label}</span>
      </button>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${current.style} ${className}`}
      aria-label={current.ariaLabel}
    >
      {current.icon}
      <span>{current.label}</span>
    </span>
  );
};

export interface ConnectionBadgeProps {
  status: WSConnectionStatus;
  className?: string;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({ status, className = '' }) => {
  if (status === 'connected') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ${className}`}
        aria-label="Real-time connection status: Connected"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
        <span>Connected</span>
      </div>
    );
  }

  if (status === 'reconnecting' || status === 'connecting') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 ${className}`}
        aria-label="Real-time connection status: Reconnecting"
      >
        <Loader2 className="w-3 h-3 animate-spin text-amber-400" aria-hidden="true" />
        <span>Reconnecting...</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700 ${className}`}
      aria-label="Real-time connection status: Offline"
    >
      <WifiOff className="w-3 h-3 text-slate-500" aria-hidden="true" />
      <span>Offline</span>
    </div>
  );
};
