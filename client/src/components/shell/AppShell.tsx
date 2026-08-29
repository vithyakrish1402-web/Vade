import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, Search, User } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { ConversationsProvider, useConversationsContext } from '../../hooks/ConversationsContext';
import { getVerification } from '../../crypto';
import { formatConversationTime } from '../../utils/dateUtils';
import { Avatar, BottomNav } from '../vade/Chrome';
import { ConversationRow } from '../vade/ConversationRow';
import { ConversationSkeletonList } from '../ui/Skeleton';
import { MessageNotificationBar } from '../ui/MessageNotificationBar';

const RAIL_ITEMS = [
  { to: '/app', label: 'Messages', Icon: MessageCircle, end: true },
  { to: '/app/search', label: 'Search', Icon: Search, end: false },
  { to: '/app/profile', label: 'Profile', Icon: User, end: false },
];

/** 96px icon rail — the desktop stand-in for the bottom bar. */
const DesktopRail: React.FC = () => {
  const { user } = useAuth();

  return (
    <nav
      aria-label="Primary"
      className="hidden w-24 shrink-0 flex-col items-center gap-section border-r border-line pb-[22px] pt-[26px] lg:flex"
    >
      <div className="text-[19px] font-bold tracking-[-0.03em]">V</div>
      <div className="flex flex-col items-center gap-2">
        {RAIL_ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) =>
              `flex h-[46px] w-[46px] items-center justify-center rounded-2xl focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                isActive ? 'bg-surface text-text' : 'text-faint hover:text-text'
              }`
            }
          >
            <Icon width={21} height={21} strokeWidth={2.75} aria-hidden="true" />
          </NavLink>
        ))}
      </div>
      <div className="mt-auto">
        <Avatar name={user?.displayName ?? '?'} size={38} />
      </div>
    </nav>
  );
};

/** 352px conversation pane, always beside the content on desktop. */
const DesktopListPane: React.FC = () => {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  const { conversations, isLoading, unreadCounts } = useConversationsContext();

  return (
    <div className="hidden w-[352px] shrink-0 flex-col border-r border-line lg:flex">
      <div className="px-section pb-4 pt-[30px]">
        <h1 className="text-[26px] font-bold tracking-[-0.026em]">Messages</h1>
      </div>
      <div className="px-section pb-gutter">
        <button
          type="button"
          onClick={() => navigate('/app/search')}
          className="flex h-[42px] w-full cursor-pointer items-center gap-2.5 rounded-full bg-surface px-[15px] text-[14.5px] text-muted focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Search width={16} height={16} strokeWidth={2.75} aria-hidden="true" />
          <span>Search</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pb-5">
        {isLoading ? (
          <div className="px-3.5">
            <ConversationSkeletonList count={5} />
          </div>
        ) : (
          conversations.map((conversation) => {
            const verification = getVerification(conversation.participant.id);
            return (
              <ConversationRow
                key={conversation.id}
                variant="desktop"
                isSelected={conversation.id === conversationId}
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
    </div>
  );
};

/**
 * The signed-in shell.
 *
 * Below the desktop breakpoint this is a single pane with the bottom bar; from `lg` up it
 * becomes the three-pane layout — rail, list, content. The conversation list is not squeezed
 * into a narrow column at intermediate widths; it simply stops being a permanent pane.
 */
const AppShellInner: React.FC = () => {
  const location = useLocation();

  // The chat screen manages its own scrolling and pins its composer, so the bottom bar is
  // hidden there — system back (or the header chevron) leaves the thread instead.
  const isChat = /^\/app\/conversations\/[^/]+/.test(location.pathname);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-bg text-text">
      <MessageNotificationBar />
      <DesktopRail />
      <DesktopListPane />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className={`flex min-h-0 flex-1 flex-col ${isChat ? '' : 'lg:pb-0'}`}>
          <Outlet />
        </div>
        {!isChat && <BottomNav />}
      </div>
    </div>
  );
};

export const AppShell: React.FC = () => (
  <ConversationsProvider>
    <AppShellInner />
  </ConversationsProvider>
);
