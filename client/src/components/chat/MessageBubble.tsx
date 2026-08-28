import React from 'react';
import type { MessageItem } from '@enctxt/shared';
import { Check, CheckCheck, Clock } from 'lucide-react';
import type { ProtectionMode } from '../../utils/protectedText/protectedTextEngine';
import { formatMessageTime } from '../../utils/dateUtils';
import { ProtectedBubble, RevealedBubble } from '../vade/Bubbles';
import { RevealCountdown } from '../vade/RevealCountdown';

export interface MessageBubbleProps {
  message: MessageItem;
  isMe: boolean;
  decryptedContent: string;
  isRevealed: boolean;
  /** Epoch ms the reveal window closes. Present only while revealed. */
  revealExpiresAt: number | null;
  revealDurationMs: number;
  remainingRevealSeconds: number;
  protectionMode: ProtectionMode;
  isOffline: boolean;
  onRevealClick: () => void;
  onHideClick: () => void;
  onLongPress: () => void;
  onRetryClick: () => void;
}

interface MetaProps {
  message: MessageItem;
  isMe: boolean;
  isOffline: boolean;
  onRetryClick: () => void;
}

/**
 * The line under a protected bubble: the time, or — while the connection is down — what
 * happened to the send. Queued and failed are words, not just icons.
 */
const MessageMeta: React.FC<MetaProps> = ({ message, isMe, isOffline, onRetryClick }) => {
  const isFailed = message.status === 'failed';
  const isQueued = isMe && !isFailed && message.status === 'sending' && isOffline;

  if (isFailed) {
    return (
      <div className="flex items-center gap-1.5 px-[5px] text-[11px] text-warn">
        <span>Not delivered</span>
        <button
          type="button"
          onClick={onRetryClick}
          className="cursor-pointer font-bold underline underline-offset-[3px] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warn"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isQueued) {
    return (
      <div className="flex items-center gap-1.5 px-[5px] text-[11px] text-faint">
        <span>Queued · sends when online</span>
        <Clock width={12} height={12} strokeWidth={2.75} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-[5px] text-[11px] text-faint">
      <span>{formatMessageTime(message.createdAt)}</span>
      {isMe &&
        (message.status === 'read' ? (
          <CheckCheck
            width={12}
            height={12}
            strokeWidth={2.75}
            className="text-accent"
            aria-label="Read"
          />
        ) : message.status === 'delivered' ? (
          <CheckCheck width={12} height={12} strokeWidth={2.75} aria-label="Delivered" />
        ) : message.status === 'sending' ? (
          <Clock width={12} height={12} strokeWidth={2.75} aria-label="Sending" />
        ) : (
          <Check width={12} height={12} strokeWidth={2.75} aria-label="Sent" />
        ))}
    </div>
  );
};

/**
 * One message in the timeline.
 *
 * The protected and revealed forms are separate components rather than one bubble with a flag,
 * so decrypted text cannot reach the protected path by accident. While a message is revealed
 * the meta row is replaced by the countdown — the window is always visible for as long as it
 * is open.
 */
export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(
  ({
    message,
    isMe,
    decryptedContent,
    isRevealed,
    revealExpiresAt,
    revealDurationMs,
    remainingRevealSeconds,
    protectionMode,
    isOffline,
    onRevealClick,
    onHideClick,
    onLongPress,
    onRetryClick,
  }) => (
    <div className={`flex flex-col gap-1.5 animate-rise ${isMe ? 'items-end' : 'items-start'}`}>
      {isRevealed ? (
        <RevealedBubble
          plaintext={decryptedContent}
          isMe={isMe}
          remainingSeconds={remainingRevealSeconds}
          onLongPress={onLongPress}
        />
      ) : (
        <ProtectedBubble
          content={decryptedContent}
          mode={protectionMode}
          isMe={isMe}
          onReveal={onRevealClick}
          onLongPress={onLongPress}
        />
      )}

      {isRevealed && revealExpiresAt !== null ? (
        <RevealCountdown
          expiresAt={revealExpiresAt}
          durationMs={revealDurationMs}
          onHide={onHideClick}
        />
      ) : (
        !isRevealed && (
          <MessageMeta
            message={message}
            isMe={isMe}
            isOffline={isOffline}
            onRetryClick={onRetryClick}
          />
        )
      )}
    </div>
  )
);

MessageBubble.displayName = 'MessageBubble';
