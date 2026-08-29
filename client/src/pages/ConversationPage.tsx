import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Eye, EyeOff, Info, Loader2, Shield, Trash2 } from 'lucide-react';
import type { ConversationDetails } from '@enctxt/shared';
import { useAuth } from '../auth/AuthContext';
import { useConversationsContext } from '../hooks/ConversationsContext';
import { conversationService } from '../services/conversationService';
import { ApiClientError } from '../services/api';
import { useMessages } from '../hooks/useMessages';
import { useMessageReveal, DEFAULT_REVEAL_DURATION_MS } from '../hooks/useMessageReveal';
import { useProtectionStyle } from '../hooks/useProtectionStyle';
import { useContactSecurity } from '../hooks/useContactSecurity';
import { ChatHeader } from '../components/chat/ChatHeader';
import { MessageList } from '../components/chat/MessageList';
import { MessageComposer } from '../components/chat/MessageComposer';
import { GestureRevealModal } from '../components/gesture/GestureRevealModal';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { ActionSheet, ActionSheetRow } from '../components/vade/ActionSheet';
import { ConfirmDialog, type ConfirmRequest } from '../components/vade/ConfirmDialog';
import { KeyChangedBanner } from '../components/vade/KeyChangedBanner';
import { VadeButton } from '../components/vade/VadeButton';
import { styleLabel } from '../components/vade/ProtectionStylePicker';
import { formatMessageTime } from '../utils/dateUtils';

export const ConversationPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setActiveConversationId, markConversationRead, fetchConversations } = useConversationsContext();

  useEffect(() => {
    if (conversationId) {
      setActiveConversationId(conversationId);
      markConversationRead(conversationId);
    }
    return () => {
      setActiveConversationId(null);
    };
  }, [conversationId, setActiveConversationId, markConversationRead]);

  const [conversation, setConversation] = useState<ConversationDetails | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const [conversationError, setConversationError] = useState<string | null>(null);

  const [revealTargetId, setRevealTargetId] = useState<string | null>(null);
  const [actionsTargetId, setActionsTargetId] = useState<string | null>(null);
  const [detailsTargetId, setDetailsTargetId] = useState<string | null>(null);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const {
    isRevealed,
    getRevealExpiry,
    getRemainingRevealSeconds,
    revealMessage,
    hideMessage,
    isLockedOut,
    lockoutRemainingSeconds,
    recordFailedAttempt,
  } = useMessageReveal();

  const { mode: protectionMode } = useProtectionStyle();

  const otherParticipant = conversation?.participants.find((participant) => participant.id !== user?.id);

  const {
    messages,
    getDecryptedText,
    myPublicKeyBase64,
    peerKeyRecord,
    isLoading: areMessagesLoading,
    isLoadingOlder,
    hasMore,
    connectionStatus,
    sendMessage,
    retryMessage,
    deleteMessage,
    loadOlderMessages,
  } = useMessages(conversationId, user?.id, otherParticipant?.id);

  const { verificationState, isKeyChanged, isLoading: isSecurityLoading } = useContactSecurity(
    otherParticipant?.id,
    myPublicKeyBase64,
    peerKeyRecord
  );

  useEffect(() => {
    if (!conversationId) return;
    let isMounted = true;

    (async () => {
      setIsLoadingConversation(true);
      setConversationError(null);
      try {
        const data = await conversationService.getConversation(conversationId);
        if (isMounted) setConversation(data.conversation);
      } catch (error) {
        if (!isMounted) return;
        if (error instanceof ApiClientError) {
          setConversationError(
            error.status === 404 || error.status === 403
              ? 'This conversation is not available.'
              : error.message
          );
        } else {
          setConversationError('Could not load this conversation. Check your connection.');
        }
      } finally {
        if (isMounted) setIsLoadingConversation(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [conversationId]);

  const securityHref = `/app/conversations/${conversationId}/security`;

  const handleClearChat = () => {
    if (!conversationId) return;
    setConfirmRequest({
      title: 'Clear this chat?',
      body: 'This removes the message history from your view and takes it off your conversation list until a new message arrives. It has no effect on the other person\'s copy.',
      cta: 'Clear chat',
      onConfirm: async () => {
        try {
          await conversationService.clearConversation(conversationId);
          await fetchConversations();
          navigate('/app');
        } catch {
          // Non-fatal — the conversation stays visible; the user can retry from the menu.
        }
      },
    });
  };

  const actionsTarget = useMemo(
    () => messages.find((message) => message.id === actionsTargetId) ?? null,
    [messages, actionsTargetId]
  );
  const detailsTarget = useMemo(
    () => messages.find((message) => message.id === detailsTargetId) ?? null,
    [messages, detailsTargetId]
  );

  if (isLoadingConversation) {
    return (
      <div className="flex min-h-[60vh] flex-1 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted" aria-label="Loading conversation" />
      </div>
    );
  }

  if (conversationError) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-7 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warn-tint text-warn">
          <AlertTriangle width={26} height={26} strokeWidth={2.75} aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-[17px] font-bold tracking-[-0.016em]">Conversation unavailable</h2>
          <p className="mt-1.5 text-sm leading-normal text-muted">{conversationError}</p>
        </div>
        <VadeButton size="md" onClick={() => navigate('/app')}>
          Back to messages
        </VadeButton>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallbackTitle="Conversation error"
      fallbackMessage="Something went wrong in this conversation."
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatHeader
          peer={otherParticipant}
          verificationState={verificationState}
          isSecurityLoading={isSecurityLoading}
          connectionStatus={connectionStatus}
          onOpenMenu={() => setIsHeaderMenuOpen(true)}
          onBack={() => navigate('/app')}
        />

        {isKeyChanged && (
          <KeyChangedBanner onReview={() => navigate(securityHref)} className="mx-4 mt-3" />
        )}

        <MessageList
          messages={messages}
          currentUserId={user?.id}
          peerUsername={otherParticipant?.username}
          protectionMode={protectionMode}
          revealDurationMs={DEFAULT_REVEAL_DURATION_MS}
          isOffline={connectionStatus === 'disconnected'}
          getDecryptedText={getDecryptedText}
          isRevealed={isRevealed}
          getRevealExpiry={getRevealExpiry}
          getRemainingRevealSeconds={getRemainingRevealSeconds}
          onRevealRequest={setRevealTargetId}
          onHideRequest={hideMessage}
          onLongPress={setActionsTargetId}
          onRetryMessage={retryMessage}
          isLoading={areMessagesLoading}
          isLoadingOlder={isLoadingOlder}
          hasMore={hasMore}
          onLoadOlder={loadOlderMessages}
        />

        <MessageComposer onSendMessage={sendMessage} connectionStatus={connectionStatus} />
      </div>

      <GestureRevealModal
        isOpen={Boolean(revealTargetId)}
        targetMessageId={revealTargetId}
        onClose={() => setRevealTargetId(null)}
        onRevealed={(messageId) => revealMessage(messageId)}
        onOpenSetup={() => navigate('/app/profile/gesture')}
        isLockedOut={isLockedOut}
        lockoutRemainingSeconds={lockoutRemainingSeconds}
        onFailedAttempt={recordFailedAttempt}
      />

      {/*
        Long-press actions. Copy and forward are deliberately absent — both would move
        plaintext outside the reveal window, which is the one thing the whole design exists
        to prevent.
      */}
      <ActionSheet
        isOpen={Boolean(actionsTarget)}
        onClose={() => setActionsTargetId(null)}
        kicker="Message actions"
        footnote={<span>Copy and forward are unavailable for protected messages.</span>}
      >
        {actionsTarget && isRevealed(actionsTarget.id) ? (
          <ActionSheetRow
            icon={<EyeOff width={19} height={19} strokeWidth={2.75} aria-hidden="true" />}
            label="Hide again"
            note="Re-protect this message now"
            onClick={() => {
              hideMessage(actionsTarget.id);
              setActionsTargetId(null);
            }}
          />
        ) : (
          <ActionSheetRow
            icon={<Eye width={19} height={19} strokeWidth={2.75} aria-hidden="true" />}
            label="Reveal"
            note="Draw your gesture to read it"
            onClick={() => {
              setRevealTargetId(actionsTarget?.id ?? null);
              setActionsTargetId(null);
            }}
          />
        )}
        <ActionSheetRow
          icon={<Info width={19} height={19} strokeWidth={2.75} aria-hidden="true" />}
          label="Message details"
          note="Sent, delivered, protection style"
          onClick={() => {
            setDetailsTargetId(actionsTarget?.id ?? null);
            setActionsTargetId(null);
          }}
        />
        {actionsTarget && actionsTarget.senderId === user?.id && !actionsTarget.deletedAt && (
          <ActionSheetRow
            icon={<Trash2 width={19} height={19} strokeWidth={2.75} aria-hidden="true" />}
            label="Delete for everyone"
            note="Removes it from this chat on both sides"
            tone="warn"
            onClick={() => {
              const targetId = actionsTarget.id;
              setActionsTargetId(null);
              setConfirmRequest({
                title: 'Delete this message?',
                body: 'This removes it for everyone in the conversation. This cannot be undone.',
                cta: 'Delete',
                onConfirm: () => deleteMessage(targetId),
              });
            }}
          />
        )}
      </ActionSheet>

      <ActionSheet
        isOpen={isHeaderMenuOpen}
        onClose={() => setIsHeaderMenuOpen(false)}
        kicker="Conversation options"
      >
        <ActionSheetRow
          icon={<Shield width={19} height={19} strokeWidth={2.75} aria-hidden="true" />}
          label="Contact security"
          note="Verify identity, view safety number"
          onClick={() => {
            setIsHeaderMenuOpen(false);
            navigate(securityHref);
          }}
        />
        <ActionSheetRow
          icon={<Trash2 width={19} height={19} strokeWidth={2.75} aria-hidden="true" />}
          label="Clear chat"
          note="Remove history from your view only"
          tone="warn"
          onClick={() => {
            setIsHeaderMenuOpen(false);
            handleClearChat();
          }}
        />
      </ActionSheet>

      <ConfirmDialog request={confirmRequest} onCancel={() => setConfirmRequest(null)} />

      <ActionSheet
        isOpen={Boolean(detailsTarget)}
        onClose={() => setDetailsTargetId(null)}
        title="Message details"
      >
        {detailsTarget && (
          <dl className="flex flex-col gap-2.5 text-[13.5px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Sent</dt>
              <dd className="font-bold">{formatMessageTime(detailsTarget.createdAt)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Status</dt>
              <dd className="font-bold capitalize">{detailsTarget.status ?? 'sent'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Protection style</dt>
              <dd className="font-bold">{styleLabel(protectionMode)}</dd>
            </div>
          </dl>
        )}
      </ActionSheet>
    </ErrorBoundary>
  );
};
