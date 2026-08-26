import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, WifiOff } from 'lucide-react';
import type { WSConnectionStatus } from '../../services/websocket';

export interface MessageComposerProps {
  onSendMessage: (plaintext: string) => Promise<void>;
  connectionStatus: WSConnectionStatus;
  disabled?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  connectionStatus,
  disabled = false,
}) => {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isOffline = connectionStatus === 'disconnected';
  const isComposerDisabled = disabled || isOffline;

  // Auto-grow textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [content]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || isSending || isComposerDisabled) return;

    setIsSending(true);
    setContent('');
    try {
      await onSendMessage(trimmed);
    } finally {
      setIsSending(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <form
      onSubmit={handleSend}
      className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/80 backdrop-blur-md"
    >
      {isOffline && (
        <div
          role="status"
          className="mb-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center gap-2"
        >
          <WifiOff className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
          <span>You are offline. Reconnecting before sending is available.</span>
        </div>
      )}

      <div className="flex items-end gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-2 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-colors">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isOffline
              ? 'Offline — waiting for connection...'
              : 'Type an encrypted message... (Press Enter to send, Shift+Enter for newline)'
          }
          rows={1}
          maxLength={5000}
          disabled={isComposerDisabled}
          aria-label="Message text"
          className="flex-1 bg-transparent border-0 resize-none text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none max-h-32 min-h-[38px] py-2 px-2.5 disabled:opacity-50"
        />

        <div className="flex items-center gap-2 shrink-0 pb-1 pr-1">
          {content.length > 3500 && (
            <span
              className={`text-[10px] font-mono ${
                content.length >= 4900 ? 'text-rose-400 font-bold' : 'text-slate-500'
              }`}
            >
              {content.length}/5000
            </span>
          )}

          <button
            type="submit"
            disabled={!content.trim() || isComposerDisabled || isSending}
            aria-label="Send message"
            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-30 transition-all cursor-pointer shadow-sm flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            title="Send Encrypted Message"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </form>
  );
};
