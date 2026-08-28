import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageItem } from '@enctxt/shared';
import { ChevronDown, Loader2, Lock } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { MessageSkeletonList } from '../ui/Skeleton';
import type { ProtectionMode } from '../../utils/protectedText/protectedTextEngine';
import { formatDayLabel } from '../../utils/dateUtils';

export interface MessageListProps {
  messages: MessageItem[];
  currentUserId?: string;
  peerUsername?: string;
  protectionMode: ProtectionMode;
  revealDurationMs: number;
  isOffline: boolean;
  getDecryptedText: (message: MessageItem) => string;
  isRevealed: (messageId: string) => boolean;
  getRevealExpiry: (messageId: string) => number | null;
  getRemainingRevealSeconds: (messageId: string) => number;
  onRevealRequest: (messageId: string) => void;
  onHideRequest: (messageId: string) => void;
  onLongPress: (messageId: string) => void;
  onRetryMessage: (messageId: string) => void;
  isLoading: boolean;
  isLoadingOlder: boolean;
  hasMore: boolean;
  onLoadOlder: () => void;
}

const DaySeparator: React.FC<{ label: string }> = ({ label }) => (
  <div className="self-center pb-2 pt-3 text-label uppercase text-faint">{label}</div>
);

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  peerUsername,
  protectionMode,
  revealDurationMs,
  isOffline,
  getDecryptedText,
  isRevealed,
  getRevealExpiry,
  getRemainingRevealSeconds,
  onRevealRequest,
  onHideRequest,
  onLongPress,
  onRetryMessage,
  isLoading,
  isLoadingOlder,
  hasMore,
  onLoadOlder,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isNearBottomRef = useRef(true);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const handleScroll = useCallback(() => {
    const element = scrollContainerRef.current;
    if (!element) return;

    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(!nearBottom);

    if (element.scrollTop === 0 && hasMore && !isLoadingOlder) onLoadOlder();
  }, [hasMore, isLoadingOlder, onLoadOlder]);

  useEffect(() => {
    if (isNearBottomRef.current) scrollToBottom(false);
  }, [messages, scrollToBottom]);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <MessageSkeletonList count={4} />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-11 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-faint">
          <Lock width={24} height={24} strokeWidth={2.75} aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-[15px] font-bold tracking-[-0.012em]">Protected conversation</h3>
          <p className="mt-1.5 max-w-[280px] text-row leading-normal text-muted">
            Messages with @{peerUsername} are end-to-end encrypted and stay protected on screen
            until you draw your gesture.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      role="log"
      aria-label="Message timeline"
      className="relative flex flex-1 flex-col justify-end gap-[7px] overflow-y-auto px-4 pb-2.5 pt-3.5"
    >
      {hasMore && (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={isLoadingOlder}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3.5 py-1 text-meta text-muted hover:bg-surface disabled:opacity-45 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {isLoadingOlder && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
            <span>{isLoadingOlder ? 'Loading older messages' : 'Load older messages'}</span>
          </button>
        </div>
      )}

      {messages.map((message, index) => {
        const previous = index > 0 ? messages[index - 1] : null;
        const dayLabel = formatDayLabel(message.createdAt);
        const showDay = !previous || formatDayLabel(previous.createdAt) !== dayLabel;

        return (
          <React.Fragment key={message.id}>
            {showDay && <DaySeparator label={dayLabel} />}
            <MessageBubble
              message={message}
              isMe={message.senderId === currentUserId}
              decryptedContent={getDecryptedText(message)}
              isRevealed={isRevealed(message.id)}
              revealExpiresAt={getRevealExpiry(message.id)}
              revealDurationMs={revealDurationMs}
              remainingRevealSeconds={getRemainingRevealSeconds(message.id)}
              protectionMode={protectionMode}
              isOffline={isOffline}
              onRevealClick={() => onRevealRequest(message.id)}
              onHideClick={() => onHideRequest(message.id)}
              onLongPress={() => onLongPress(message.id)}
              onRetryClick={() => onRetryMessage(message.id)}
            />
          </React.Fragment>
        );
      })}

      <div className="flex items-center gap-1.5 self-center pb-1.5 pt-3.5 text-meta text-faint">
        <Lock width={12} height={12} strokeWidth={2.75} aria-hidden="true" />
        <span>Tap a message to reveal it</span>
      </div>

      <div ref={messagesEndRef} />

      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to newest messages"
          className="sticky bottom-2 z-10 float-right flex cursor-pointer items-center gap-1.5 rounded-full bg-out-bg px-3 py-2 text-meta font-bold text-out-fg shadow-fab focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChevronDown width={16} height={16} strokeWidth={2.75} aria-hidden="true" />
          <span>New messages</span>
        </button>
      )}
    </div>
  );
};
