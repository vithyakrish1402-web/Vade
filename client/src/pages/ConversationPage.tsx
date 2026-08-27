import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { conversationService } from '../services/conversationService';
import { useMessages } from '../hooks/useMessages';
import { useMessageReveal } from '../hooks/useMessageReveal';
import { useProtectionStyle } from '../hooks/useProtectionStyle';
import { useContactSecurity } from '../hooks/useContactSecurity';
import { useGesture } from '../hooks/useGesture';
import type { ConversationDetails } from '@enctxt/shared';
import { ApiClientError } from '../services/api';
import { ChatHeader } from '../components/chat/ChatHeader';
import { MessageList } from '../components/chat/MessageList';
import { MessageComposer } from '../components/chat/MessageComposer';
import { GestureRevealModal } from '../components/gesture/GestureRevealModal';
import { GestureSequenceSetup } from '../components/gesture/GestureSequenceSetup';
import { ContactSecurityModal } from '../components/security/ContactSecurityModal';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { Button } from '../components/ui/Button';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';

export const ConversationPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isConfigured: isGestureConfigured } = useGesture();

  const [conversation, setConversation] = useState<ConversationDetails | null>(null);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState<string | null>(null);

  // Gesture reveal state
  const [revealModalTargetId, setRevealModalTargetId] = useState<string | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  // Reveal hook
  const {
    isRevealed,
    getRemainingRevealSeconds,
    revealMessage,
    hideMessage,
  } = useMessageReveal();

  const { mode: protectionMode } = useProtectionStyle();

  const otherParticipant = conversation?.participants.find((p) => p.id !== user?.id);

  // Message hook with E2EE and real-time synchronization
  const {
    messages,
    getDecryptedText,
    myPublicKeyBase64,
    peerKeyRecord,
    isLoading: messagesLoading,
    isLoadingOlder,
    hasMore,
    connectionStatus,
    sendMessage,
    retryMessage,
    loadOlderMessages,
  } = useMessages(conversationId, user?.id, otherParticipant?.id);

  // Contact Security & Key Verification Hook
  const {
    verificationState,
    peerFingerprint,
    safetyNumber,
    isKeyChanged,
    isLoading: isSecurityLoading,
    markAsVerified,
    unverify,
  } = useContactSecurity(otherParticipant?.id, myPublicKeyBase64, peerKeyRecord);

  // Fetch Conversation metadata
  useEffect(() => {
    if (!conversationId) return;

    const fetchDetails = async () => {
      setConvLoading(true);
      setConvError(null);
      try {
        const data = await conversationService.getConversation(conversationId);
        setConversation(data.conversation);
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.status === 404 || err.status === 403) {
            setConvError('Conversation not found or access is unauthorized.');
          } else {
            setConvError(err.message);
          }
        } else {
          setConvError('Failed to load conversation. Please check your connection.');
        }
      } finally {
        setConvLoading(false);
      }
    };

    fetchDetails();
  }, [conversationId]);

  if (convLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" aria-hidden="true" />
          <p className="text-xs text-slate-400 font-mono">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (convError) {
    return (
      <div className="flex-1 max-w-lg mx-auto px-4 py-16 w-full flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-950/50 border border-rose-800/60 flex items-center justify-center text-rose-400">
          <AlertCircle className="w-7 h-7" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-slate-100">Unable to Access Conversation</h2>
          <p className="text-xs text-rose-300 leading-relaxed">{convError}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/app')}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          Return to Workspace
        </Button>
      </div>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="Conversation Error" fallbackMessage="An error occurred in this chat conversation.">
      <div className="flex-1 max-w-5xl mx-auto px-2 sm:px-6 py-2 sm:py-4 w-full flex flex-col h-[calc(100vh-4.5rem)]">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col flex-1 overflow-hidden">
          {/* Chat Header */}
          <ChatHeader
            peer={otherParticipant}
            verificationState={verificationState}
            isSecurityLoading={isSecurityLoading}
            isKeyChanged={isKeyChanged}
            connectionStatus={connectionStatus}
            isGestureConfigured={isGestureConfigured}
            onOpenSecurityModal={() => setIsSecurityModalOpen(true)}
            onOpenGestureSetup={() => setIsSetupOpen(true)}
            onBack={() => navigate('/app')}
          />

          {/* Message Timeline */}
          <MessageList
            messages={messages}
            currentUserId={user?.id}
            peerUsername={otherParticipant?.username}
            protectionMode={protectionMode}
            getDecryptedText={getDecryptedText}
            isRevealed={isRevealed}
            getRemainingRevealSeconds={getRemainingRevealSeconds}
            onRevealRequest={(msgId) => setRevealModalTargetId(msgId)}
            onHideRequest={(msgId) => hideMessage(msgId)}
            onRetryMessage={(msgId) => retryMessage(msgId)}
            isLoading={messagesLoading}
            isLoadingOlder={isLoadingOlder}
            hasMore={hasMore}
            onLoadOlder={loadOlderMessages}
          />

          {/* Message Composer */}
          <MessageComposer
            onSendMessage={sendMessage}
            connectionStatus={connectionStatus}
          />
        </div>

        {/* Security & Verification Dialog Modal */}
        {otherParticipant && (
          <ContactSecurityModal
            isOpen={isSecurityModalOpen}
            onClose={() => setIsSecurityModalOpen(false)}
            peerUsername={otherParticipant.username}
            peerDisplayName={otherParticipant.displayName}
            verificationState={verificationState}
            safetyNumber={safetyNumber}
            peerFingerprint={peerFingerprint}
            peerKeyId={peerKeyRecord?.keyId}
            onVerify={markAsVerified}
            onUnverify={unverify}
          />
        )}

        {/* Gesture Reveal Modal Dialog */}
        <GestureRevealModal
          isOpen={Boolean(revealModalTargetId)}
          targetMessageId={revealModalTargetId}
          onClose={() => setRevealModalTargetId(null)}
          onRevealed={(messageId) => revealMessage(messageId)}
          onOpenSetup={() => setIsSetupOpen(true)}
        />

        {/* Gesture Enrollment Wizard Modal */}
        <GestureSequenceSetup
          isOpen={isSetupOpen}
          onClose={() => setIsSetupOpen(false)}
        />
      </div>
    </ErrorBoundary>
  );
};
