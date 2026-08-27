import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { MessageItem } from '@enctxt/shared';
import { MessageBubble } from './MessageBubble';
import { MessageSkeletonList } from '../ui/Skeleton';
import type { ProtectionMode } from '../../utils/protectedText/protectedTextEngine';
import { ShieldCheck, ChevronDown, Loader2 } from 'lucide-react';

export interface MessageListProps {
  messages: MessageItem[];
  currentUserId?: string;
  peerUsername?: string;
  protectionMode?: ProtectionMode;
  getDecryptedText: (message: MessageItem) => string;
  isRevealed: (messageId: string) => boolean;
  getRemainingRevealSeconds: (messageId: string) => number;
  onRevealRequest: (messageId: string) => void;
  onHideRequest: (messageId: string) => void;
  onRetryMessage: (messageId: string) => void;
  isLoading: boolean;
  isLoadingOlder: boolean;
  hasMore: boolean;
  onLoadOlder: () => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  peerUsername,
  protectionMode = 'HOMOGLYPH',
  getDecryptedText,
  isRevealed,
  getRemainingRevealSeconds,
  onRevealRequest,
  onHideRequest,
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
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(!nearBottom);

    if (el.scrollTop === 0 && hasMore && !isLoadingOlder) {
      onLoadOlder();
    }
  }, [hasMore, isLoadingOlder, onLoadOlder]);

  // Scroll to bottom on initial load or new messages if near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom(false);
    }
  }, [messages, scrollToBottom]);

  if (isLoading) {
    return (
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        <MessageSkeletonList count={4} />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shadow-sm">
          <ShieldCheck className="w-6 h-6 text-emerald-500" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-200">End-to-End Encrypted Conversation</h3>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
            Messages are end-to-end encrypted with @{peerUsername}. Messages remain protected on your screen until unlocked with your reveal gesture.
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
      className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/40 relative space-y-1"
    >
      {/* Older messages pagination trigger */}
      {hasMore && (
        <div className="flex justify-center pb-3">
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={isLoadingOlder}
            className="px-3.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border border-slate-700/80 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isLoadingOlder && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
            <span>{isLoadingOlder ? 'Loading older messages...' : 'Load older messages'}</span>
          </button>
        </div>
      )}

      {/* Message Timeline */}
      {messages.map((msg, index) => {
        const isMe = msg.senderId === currentUserId;
        const prevMsg = index > 0 ? messages[index - 1] : null;
        const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

        const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId;
        const isLastInGroup = !nextMsg || nextMsg.senderId !== msg.senderId;

        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMe={isMe}
            decryptedContent={getDecryptedText(msg)}
            isRevealed={isRevealed(msg.id)}
            remainingRevealSeconds={getRemainingRevealSeconds(msg.id)}
            protectionMode={protectionMode}
            isFirstInGroup={isFirstInGroup}
            isLastInGroup={isLastInGroup}
            onRevealClick={() => onRevealRequest(msg.id)}
            onHideClick={() => onHideRequest(msg.id)}
            onRetryClick={() => onRetryMessage(msg.id)}
          />
        );
      })}

      <div ref={messagesEndRef} />

      {/* Floating Jump to Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to newest messages"
          className="sticky bottom-2 float-right p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg border border-emerald-400/30 transition-transform hover:scale-105 cursor-pointer z-10 flex items-center gap-1.5 text-xs font-medium"
        >
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
          <span className="pr-1 text-[11px]">New messages</span>
        </button>
      )}
    </div>
  );
};
