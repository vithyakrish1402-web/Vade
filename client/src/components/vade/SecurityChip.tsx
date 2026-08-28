import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import type { ContactVerificationState } from '@enctxt/shared';

/**
 * What the header subtitle and the chip report. `offline` is a connection state rather than a
 * verification state, but it occupies the same slot, so it lives in the same union.
 */
export type SecurityState = ContactVerificationState | 'offline';

export interface SecurityPresentation {
  label: string;
  /** Tailwind text color class. */
  color: string;
  /** Tailwind background class for the chip form. */
  chipBg: string;
  icon: 'check' | 'warning' | null;
}

/**
 * Verified is deliberately quiet — the normal case should not announce itself. Unverified has
 * no icon at all: present, not nagging. Only "Key changed" is loud, and it is ochre rather than
 * red so it reads as serious without alarm styling.
 */
export function securityPresentation(state: SecurityState): SecurityPresentation {
  switch (state) {
    case 'verified':
      return { label: 'Verified', color: 'text-accent-ink', chipBg: 'bg-accent-tint', icon: 'check' };
    case 'key_changed':
      return { label: 'Key changed', color: 'text-warn', chipBg: 'bg-warn-tint', icon: 'warning' };
    case 'offline':
      return { label: 'Offline', color: 'text-muted', chipBg: 'bg-surface', icon: null };
    default:
      return { label: 'Unverified', color: 'text-muted', chipBg: 'bg-surface', icon: null };
  }
}

interface SecurityChipProps {
  state: SecurityState;
  /** `chip` is the pill used on the contact screen; `inline` is the chat header subtitle. */
  variant?: 'chip' | 'inline';
  className?: string;
}

/**
 * Security state is announced as text — the icon is decorative, so an icon never carries the
 * meaning alone.
 */
export const SecurityChip: React.FC<SecurityChipProps> = ({ state, variant = 'chip', className = '' }) => {
  const { label, color, chipBg, icon } = securityPresentation(state);
  const iconSize = variant === 'chip' ? 13 : 12;

  const glyph =
    icon === 'check' ? (
      <Check width={iconSize} height={iconSize} strokeWidth={2.75} className="shrink-0" aria-hidden="true" />
    ) : icon === 'warning' ? (
      <AlertTriangle
        width={iconSize}
        height={iconSize}
        strokeWidth={2.75}
        className="shrink-0"
        aria-hidden="true"
      />
    ) : null;

  if (variant === 'inline') {
    return (
      <span className={`flex items-center gap-[5px] text-xs ${color} ${className}`}>
        {glyph}
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-[30px] px-[13px] rounded-full text-row font-bold ${chipBg} ${color} ${className}`}
    >
      {glyph}
      <span>{label}</span>
    </span>
  );
};
