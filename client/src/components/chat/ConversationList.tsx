import React from 'react';
import type { SingleConversationItem } from '@enctxt/shared';
import { formatConversationTime } from '../../utils/dateUtils';
import { ConversationSkeletonList } from '../ui/Skeleton';
import { Lock, MessageSquare, Search, ArrowRight, ShieldCheck } from 'lucide-react';
import { getVerification } from '../../crypto';

export interface ConversationListProps {
  conversations: SingleConversationItem[];
  isLoading: boolean;
  error: string | null;
  selectedConversationId?: string;
  onSelectConversation: (conversationId: string) => void;
  onOpenSearch: () => void;
  onRetry?: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  isLoading,
  error,
  selectedConversationId,
  onSelectConversation,
  onOpenSearch,
  onRetry,
}) => {
  if (isLoading) {
    return <ConversationSkeletonList count={4} />;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="p-5 bg-rose-950/40 border border-rose-800/50 rounded-2xl text-center space-y-3"
      >
        <p className="text-xs text-rose-300">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-colors cursor-pointer"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="py-12 px-4 flex flex-col items-center justify-center text-center space-y-3.5 bg-slate-950/40 rounded-2xl border border-slate-850">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shadow-sm">
          <MessageSquare className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-200">No conversations yet</h3>
          <p className="text-xs text-slate-400 max-w-xs">
            Start an end-to-end encrypted conversation with another user.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSearch}
          className="mt-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <Search className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Find Users</span>
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Conversation list"
      className="divide-y divide-slate-800/80 border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/30"
    >
      {conversations.map((c) => {
        const isSelected = selectedConversationId === c.id;
        const verification = getVerification(c.participant.id);
        const isVerified = Boolean(verification);

        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectConversation(c.id)}
            aria-selected={isSelected}
            className={`w-full p-4 transition-colors flex items-center justify-between cursor-pointer text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
              isSelected
                ? 'bg-slate-800/80 border-l-4 border-l-emerald-400 pl-3'
                : 'hover:bg-slate-800/40 bg-slate-950/40'
            }`}
          >
            <div className="flex items-center gap-3.5 min-w-0">
              {/* Participant Avatar */}
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-emerald-400 shrink-0 select-none shadow-sm">
                {c.participant.displayName.charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-100 group-hover:text-emerald-300 transition-colors truncate">
                    {c.participant.displayName}
                  </p>
                  {isVerified ? (
                    <span title="Verified Identity" aria-label="Verified Identity">
                      <ShieldCheck
                        className="w-3.5 h-3.5 text-emerald-400 shrink-0"
                        aria-hidden="true"
                      />
                    </span>
                  ) : null}
                </div>

                {/* Safe Zero-Plaintext Preview */}
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Lock className="w-3 h-3 text-emerald-500/70 shrink-0" aria-hidden="true" />
                  <span className="truncate font-sans text-[11px] text-slate-400">
                    Protected conversation
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 pl-2">
              <span className="text-[11px] text-slate-500 font-mono">
                {formatConversationTime(c.updatedAt)}
              </span>
              <ArrowRight
                className={`w-4 h-4 transition-transform ${
                  isSelected ? 'text-emerald-400 translate-x-0.5' : 'text-slate-600 group-hover:text-emerald-400'
                }`}
                aria-hidden="true"
              />
            </div>
          </button>
        );
      })}
    </div>
  );
};
