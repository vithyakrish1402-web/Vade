import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, X } from 'lucide-react';
import { Avatar } from '../vade/Chrome';
import { formatConversationTime } from '../../utils/dateUtils';
import { useConversationsContext } from '../../hooks/ConversationsContext';

interface PendingItem {
  conversationId: string;
  senderId: string;
  createdAt: string;
  /** How many messages have arrived for this conversation since it started pending. */
  count: number;
}

const AUTO_DISMISS_MS = 6000;

interface NotificationDetail {
  conversationId: string;
  senderId: string;
  createdAt: string;
}

/**
 * The heads-up banner for `vade:notification` events — fired whenever a message arrives for a
 * conversation that isn't the one currently open. Mounted once in the signed-in shell so it
 * appears above the inbox, search, and profile screens alike.
 *
 * Never renders decrypted content: only the sender's known display name (or "New contact" while
 * that's still being resolved) and a generic "Sent an encrypted message" line, mirroring the
 * "Protected conversation" placeholder already used in the conversation list.
 */
export const MessageNotificationBar: React.FC = () => {
  const navigate = useNavigate();
  const { conversations } = useConversationsContext();
  const [items, setItems] = useState<PendingItem[]>([]);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAll = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setItems([]);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const { conversationId, senderId, createdAt } = (event as CustomEvent<NotificationDetail>).detail;
      setItems((prev) => {
        const existing = prev.find((item) => item.conversationId === conversationId);
        if (existing) {
          return prev.map((item) =>
            item.conversationId === conversationId ? { ...item, createdAt, count: item.count + 1 } : item
          );
        }
        return [...prev, { conversationId, senderId, createdAt, count: 1 }];
      });
    };

    window.addEventListener('vade:notification', handler);
    return () => window.removeEventListener('vade:notification', handler);
  }, []);

  useEffect(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    if (items.length === 0) return;
    dismissTimer.current = setTimeout(() => setItems([]), AUTO_DISMISS_MS);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [items]);

  if (items.length === 0) return null;

  const dismissOne = (conversationId: string) => {
    setItems((prev) => {
      const next = prev.filter((item) => item.conversationId !== conversationId);
      return next;
    });
  };

  const openConversation = (conversationId: string) => {
    clearAll();
    navigate(`/app/conversations/${conversationId}`);
  };

  if (items.length > 1) {
    const totalMessages = items.reduce((sum, item) => sum + item.count, 0);
    const mostRecent = [...items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];

    return (
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <div
          role="status"
          aria-live="polite"
          onClick={() => openConversation(mostRecent.conversationId)}
          className="pointer-events-auto flex w-full max-w-sm cursor-pointer items-center gap-2.5 rounded-card border border-line bg-surface p-3.5 shadow-float animate-rise"
        >
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-name font-bold text-text">
            +{totalMessages > 99 ? '99+' : totalMessages}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-name font-bold">
              {totalMessages} new message{totalMessages === 1 ? '' : 's'}
            </p>
            <p className="text-row text-muted">
              From {items.length} people &middot; tap to view
            </p>
          </div>
          <span className="shrink-0 text-xs text-faint">{formatConversationTime(mostRecent.createdAt)}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              clearAll();
            }}
            aria-label="Dismiss notifications"
            className="shrink-0 rounded-full p-1 text-faint opacity-70 transition-opacity hover:bg-surface-2 hover:opacity-100 hover:text-text focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X width={14} height={14} strokeWidth={2.75} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const item = items[0];
  const known = conversations.find((c) => c.id === item.conversationId);
  const name = known?.participant.displayName ?? 'New contact';
  const isNew = !known;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        onClick={() => openConversation(item.conversationId)}
        className="pointer-events-auto flex w-full max-w-sm cursor-pointer items-start gap-2.5 rounded-card border border-line bg-surface p-3.5 shadow-float animate-rise"
      >
        <div className="relative shrink-0">
          <Avatar name={name} size={38} className="bg-surface-2" />
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent"
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-name font-bold">{name}</span>
            {isNew && (
              <span className="shrink-0 rounded-full bg-accent-tint px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-accent-ink">
                New
              </span>
            )}
          </div>
          <span className="flex items-center gap-1.5 text-row text-muted">
            <Lock width={11} height={11} strokeWidth={2.75} className="shrink-0" aria-hidden="true" />
            <span>{isNew ? 'Started a conversation' : 'Sent an encrypted message'}</span>
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-xs text-faint">{formatConversationTime(item.createdAt)}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              dismissOne(item.conversationId);
            }}
            aria-label="Dismiss notification"
            className="rounded-full p-1 text-faint opacity-70 transition-opacity hover:bg-surface-2 hover:opacity-100 hover:text-text focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X width={14} height={14} strokeWidth={2.75} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
