import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Plus, Search } from 'lucide-react';
import { useConversationsContext } from '../hooks/ConversationsContext';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { getVerification } from '../crypto';
import { formatConversationTime } from '../utils/dateUtils';
import { ConversationRow } from '../components/vade/ConversationRow';
import { EmptyState } from '../components/vade/Chrome';
import { VadeButton } from '../components/vade/VadeButton';
import { ConversationSkeletonList } from '../components/ui/Skeleton';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

/** Offline and reconnecting both keep the list interactive — only the banner changes. */
const CONNECTION_BANNERS: Partial<Record<string, string>> = {
  connecting: 'Connecting — messages will send once the connection is up.',
  reconnecting: 'Reconnecting — messages will send when the connection returns.',
  disconnected: 'Offline. You can still read and write; nothing sends yet.',
};

export const MessagesPage: React.FC = () => {
  const navigate = useNavigate();
  const { conversations, isLoading, error, fetchConversations, unreadCounts } = useConversationsContext();
  const connectionStatus = useConnectionStatus();

  const banner = CONNECTION_BANNERS[connectionStatus];

  return (
    <ErrorBoundary fallbackTitle="Messages unavailable">
      {/* Desktop keeps the list in the shell pane, so this route only fills the content column. */}
      <div className="hidden min-h-0 flex-1 flex-col items-center justify-center gap-3.5 px-11 text-center lg:flex">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-faint">
          <MessageCircle width={26} height={26} strokeWidth={2.75} aria-hidden="true" />
        </div>
        <div>
          <div className="text-[17px] font-bold tracking-[-0.016em]">No conversation selected</div>
          <p className="mt-1.5 text-sm text-muted">Pick a conversation, or find someone new.</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="shrink-0 px-[22px] pb-2.5 pt-3.5">
          <h1 className="text-title font-bold">Vade</h1>
        </div>

        <div className="shrink-0 px-[22px] pb-3.5 pt-1">
          <button
            type="button"
            onClick={() => navigate('/app/search')}
            className="flex h-[42px] w-full cursor-pointer items-center gap-2.5 rounded-full bg-surface px-[15px] text-[14.5px] text-muted focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Search width={16} height={16} strokeWidth={2.75} aria-hidden="true" />
            <span>Search</span>
          </button>
        </div>

        {banner && (
          <div
            role="status"
            className="mx-[22px] mb-3 flex shrink-0 items-center gap-2.5 rounded-2xl bg-surface px-3.5 py-2.5"
          >
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-warn" aria-hidden="true" />
            <span className="text-[12.5px] leading-snug text-muted">{banner}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pb-24">
          {isLoading ? (
            <div className="px-[22px]">
              <ConversationSkeletonList count={5} />
            </div>
          ) : error ? (
            <div role="alert" className="mx-[22px] rounded-card bg-warn-tint p-4 text-center">
              <p className="text-row text-warn">{error}</p>
              <VadeButton variant="outline" size="sm" className="mt-3" onClick={fetchConversations}>
                Try again
              </VadeButton>
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              className="pt-16"
              icon={<MessageCircle width={26} height={26} strokeWidth={2.75} aria-hidden="true" />}
              title="No conversations yet"
              body="Find someone by username to start a protected conversation."
              action={
                <VadeButton size="sm" onClick={() => navigate('/app/search')}>
                  Find someone
                </VadeButton>
              }
            />
          ) : (
            conversations.map((conversation) => {
              const verification = getVerification(conversation.participant.id);
              return (
                <ConversationRow
                  key={conversation.id}
                  name={conversation.participant.displayName}
                  time={formatConversationTime(conversation.updatedAt)}
                  unreadCount={unreadCounts[conversation.id] || 0}
                  isVerified={Boolean(verification)}
                  isFlagged={false}
                  onOpen={() => navigate(`/app/conversations/${conversation.id}`)}
                />
              );
            })
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/app/search')}
          aria-label="New conversation"
          className="absolute bottom-[104px] right-[22px] flex h-[54px] w-[54px] cursor-pointer items-center justify-center rounded-full bg-out-bg text-out-fg shadow-fab focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Plus width={22} height={22} strokeWidth={2.75} aria-hidden="true" />
        </button>
      </div>
    </ErrorBoundary>
  );
};
