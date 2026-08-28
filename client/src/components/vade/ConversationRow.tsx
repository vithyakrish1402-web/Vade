import React from 'react';
import { AlertTriangle, Check, Lock } from 'lucide-react';
import { Avatar } from './Chrome';

export interface ConversationRowProps {
  name: string;
  /** Preformatted — "10:42", "Yesterday", "Tue". */
  time: string;
  unreadCount: number;
  isVerified: boolean;
  /** The peer's key changed since it was verified. Flagged here as well as in the chat header. */
  isFlagged: boolean;
  onOpen: () => void;
  /** Desktop list rows are cards that carry a selected fill; mobile rows are hairline-divided. */
  variant?: 'mobile' | 'desktop';
  isSelected?: boolean;
}

/**
 * A row in the conversation list.
 *
 * The secondary line always reads "Protected conversation" — the list never decrypts a message
 * to build a preview, so there is nothing here for a shoulder to read.
 */
export const ConversationRow: React.FC<ConversationRowProps> = ({
  name,
  time,
  unreadCount,
  isVerified,
  isFlagged,
  onOpen,
  variant = 'mobile',
  isSelected = false,
}) => {
  const status = isFlagged ? 'Key changed' : isVerified ? 'Verified' : 'Unverified';
  const unreadLabel = unreadCount > 0 ? `, ${unreadCount} unread` : '';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${name}, ${status}, protected conversation, ${time}${unreadLabel}`}
      className={[
        'flex w-full cursor-pointer items-center gap-row text-left focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
        variant === 'desktop'
          ? `mx-3.5 mb-1 rounded-[18px] px-3.5 py-row ${isSelected ? 'bg-surface' : 'hover:bg-surface'}`
          : 'border-b border-line px-[22px] py-row hover:bg-surface',
      ].join(' ')}
    >
      <Avatar name={name} size={variant === 'desktop' ? 42 : 44} className={variant === 'desktop' ? 'bg-surface-2' : ''} />

      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-name font-bold">{name}</span>
          {isVerified && !isFlagged && (
            <Check
              width={13}
              height={13}
              strokeWidth={2.75}
              className="shrink-0 text-accent"
              aria-hidden="true"
            />
          )}
          {isFlagged && (
            <AlertTriangle
              width={13}
              height={13}
              strokeWidth={2.75}
              className="shrink-0 text-warn"
              aria-hidden="true"
            />
          )}
        </span>
        <span className="flex items-center gap-1.5 text-row text-muted">
          <Lock width={12} height={12} strokeWidth={2.75} className="shrink-0" aria-hidden="true" />
          <span>Protected conversation</span>
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs text-faint">{time}</span>
        {unreadCount > 0 && (
          <span
            className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-meta font-bold text-white"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </span>
    </button>
  );
};
