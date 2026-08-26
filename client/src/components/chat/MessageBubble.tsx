import React from 'react';
import type { MessageItem } from '@enctxt/shared';
import { ProtectedMessage } from '../messages/ProtectedMessage';
import { formatMessageTime } from '../../utils/dateUtils';
import { Eye, EyeOff, Clock, Check, CheckCheck, AlertCircle, RotateCcw } from 'lucide-react';

export interface MessageBubbleProps {
  message: MessageItem;
  isMe: boolean;
  decryptedContent: string;
  isRevealed: boolean;
  remainingRevealSeconds?: number;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onRevealClick: () => void;
  onHideClick: () => void;
  onRetryClick?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(
  ({
    message,
    isMe,
    decryptedContent,
    isRevealed,
    remainingRevealSeconds,
    isFirstInGroup = true,
    isLastInGroup = true,
    onRevealClick,
    onHideClick,
    onRetryClick,
  }) => {
    // Bubble border radius grouping logic
    const getBorderRadius = () => {
      if (isMe) {
        if (isFirstInGroup && isLastInGroup) return 'rounded-2xl rounded-tr-xs';
        if (isFirstInGroup) return 'rounded-2xl rounded-tr-xs rounded-br-md';
        if (isLastInGroup) return 'rounded-2xl rounded-tr-md rounded-br-xs';
        return 'rounded-2xl rounded-r-md';
      } else {
        if (isFirstInGroup && isLastInGroup) return 'rounded-2xl rounded-tl-xs';
        if (isFirstInGroup) return 'rounded-2xl rounded-tl-xs rounded-bl-md';
        if (isLastInGroup) return 'rounded-2xl rounded-tl-md rounded-bl-xs';
        return 'rounded-2xl rounded-l-md';
      }
    };

    return (
      <div
        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group ${
          isLastInGroup ? 'mb-2.5' : 'mb-1'
        }`}
      >
        <div className="relative max-w-[85%] sm:max-w-[72%]">
          {/* Message Content Bubble */}
          <div
            className={`px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-sm break-words whitespace-pre-wrap transition-all ${getBorderRadius()} ${
              isMe
                ? isRevealed
                  ? 'bg-emerald-700 text-white ring-2 ring-emerald-400/50'
                  : 'bg-emerald-600 text-white'
                : isRevealed
                ? 'bg-slate-700 text-white border border-emerald-500/40 ring-2 ring-emerald-500/30'
                : 'bg-slate-800 text-slate-100 border border-slate-700/60'
            }`}
          >
            <ProtectedMessage
              content={decryptedContent}
              displayMode={isRevealed ? 'revealed' : 'protected'}
            />
          </div>

          {/* Reveal / Hide Action Pill */}
          <button
            type="button"
            onClick={isRevealed ? onHideClick : onRevealClick}
            aria-label={isRevealed ? 'Hide revealed message' : 'Draw gesture to reveal message'}
            className={`absolute ${
              isMe ? '-left-9' : '-right-9'
            } top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-opacity cursor-pointer focus:opacity-100 ${
              isRevealed
                ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-700/60 opacity-100'
                : 'bg-slate-800/90 text-slate-400 hover:text-slate-200 border border-slate-700 opacity-0 group-hover:opacity-100'
            }`}
            title={isRevealed ? 'Click to hide plaintext' : 'Draw gesture to reveal message'}
          >
            {isRevealed ? (
              <EyeOff className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            ) : (
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Message Meta: Timestamp & Delivery Status */}
        {isLastInGroup && (
          <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-slate-500 font-mono select-none">
            {isRevealed && (
              <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                Revealed {remainingRevealSeconds ? `· ${remainingRevealSeconds}s` : ''}
              </span>
            )}

            <span>{formatMessageTime(message.createdAt)}</span>

            {isMe && (
              <span className="flex items-center gap-0.5 ml-0.5">
                {message.status === 'sending' ? (
                  <span title="Sending..." aria-label="Sending">
                    <Clock className="w-3 h-3 text-slate-400 animate-pulse" aria-hidden="true" />
                  </span>
                ) : message.status === 'failed' ? (
                  <button
                    type="button"
                    onClick={onRetryClick}
                    className="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-sans font-medium cursor-pointer"
                    title="Failed to send. Click to retry"
                  >
                    <AlertCircle className="w-3 h-3" aria-hidden="true" />
                    <span>Retry</span>
                    <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>
                ) : message.status === 'read' ? (
                  <span title="Read" aria-label="Read">
                    <CheckCheck className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                  </span>
                ) : message.status === 'delivered' ? (
                  <span title="Delivered" aria-label="Delivered">
                    <CheckCheck className="w-3 h-3 text-slate-400" aria-hidden="true" />
                  </span>
                ) : (
                  <span title="Sent" aria-label="Sent">
                    <Check className="w-3 h-3 text-slate-400" aria-hidden="true" />
                  </span>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

MessageBubble.displayName = 'MessageBubble';
