import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Send } from 'lucide-react';
import type { WSConnectionStatus } from '../../services/websocket';

export interface MessageComposerProps {
  onSendMessage: (plaintext: string) => Promise<void>;
  connectionStatus: WSConnectionStatus;
  disabled?: boolean;
}

const MAX_LENGTH = 5000;

/**
 * A pill field between two 44px circular actions, on a hairline top edge.
 *
 * The composer stays usable while offline — composing works and sending queues, so no draft is
 * silently lost. The placeholder says which of the two is happening.
 */
export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  connectionStatus,
  disabled = false,
}) => {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isOffline = connectionStatus === 'disconnected';

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [content]);

  const handleSend = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || isSending || disabled) return;

    setIsSending(true);
    setContent('');
    try {
      await onSendMessage(trimmed);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const canSend = Boolean(content.trim()) && !isSending && !disabled;

  return (
    <form
      onSubmit={handleSend}
      className="flex shrink-0 items-end gap-[9px] border-t border-line px-4 pb-2.5 pt-2"
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        aria-label="Add attachment"
        disabled
        title="Attachments are not available yet"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-text disabled:opacity-45 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Plus width={19} height={19} strokeWidth={2.75} aria-hidden="true" />
      </button>

      <div className="flex min-h-[44px] flex-1 items-center rounded-[22px] bg-surface px-4">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isOffline ? 'Message · sends when online' : 'Message'}
          rows={1}
          maxLength={MAX_LENGTH}
          disabled={disabled}
          aria-label="Message text"
          className="max-h-[120px] min-h-[24px] w-full resize-none border-0 bg-transparent py-2.5 text-[14.5px] text-text placeholder:text-muted caret-accent focus:outline-none disabled:opacity-45"
        />
        {content.length > MAX_LENGTH - 500 && (
          <span
            className={`shrink-0 pl-2 text-[11px] ${
              content.length >= MAX_LENGTH - 100 ? 'font-bold text-warn' : 'text-faint'
            }`}
          >
            {MAX_LENGTH - content.length}
          </span>
        )}
      </div>

      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-out-bg text-out-fg disabled:opacity-30 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {isSending ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
        ) : (
          <Send width={18} height={18} strokeWidth={2.75} aria-hidden="true" />
        )}
      </button>
    </form>
  );
};
