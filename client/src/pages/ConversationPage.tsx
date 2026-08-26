import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { conversationService } from '../services/conversationService';
import { useMessages } from '../hooks/useMessages';
import { useMessageReveal } from '../hooks/useMessageReveal';
import { useContactSecurity } from '../hooks/useContactSecurity';
import { useGesture } from '../hooks/useGesture';
import type { ConversationDetails } from '@enctxt/shared';
import { ApiClientError } from '../services/api';
import { ProtectedMessage } from '../components/messages/ProtectedMessage';
import { GestureRevealModal } from '../components/gesture/GestureRevealModal';
import { GestureSequenceSetup } from '../components/gesture/GestureSequenceSetup';
import { ContactSecurityModal } from '../components/security/ContactSecurityModal';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Send,
  Check,
  CheckCheck,
  Clock,
  RotateCcw,
  ChevronDown,
  Eye,
  EyeOff,
  Shield,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

export const ConversationPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isConfigured } = useGesture();

  const [conversation, setConversation] = useState<ConversationDetails | null>(null);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState<string | null>(null);

  // Message composition state
  const [inputContent, setInputContent] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Gesture reveal state
  const [revealModalTargetId, setRevealModalTargetId] = useState<string | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  // Reveal hook
  const { isRevealed, revealMessage, hideMessage } = useMessageReveal();

  const otherParticipant = conversation?.participants.find((p) => p.id !== user?.id);

  // Message hook with E2EE
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
    markAsVerified,
    unverify,
  } = useContactSecurity(otherParticipant?.id, myPublicKeyBase64, peerKeyRecord);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

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
          setConvError(err.message);
        } else {
          setConvError('Failed to load conversation details.');
        }
      } finally {
        setConvLoading(false);
      }
    };

    fetchDetails();
  }, [conversationId]);

  // Handle scroll detection
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(!nearBottom);

    // If scrolled to top and has more, load older
    if (el.scrollTop === 0 && hasMore && !isLoadingOlder) {
      loadOlderMessages();
    }
  };

  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // Scroll on new messages if near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom(false);
    }
  }, [messages]);

  // Handle send
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = inputContent.trim();
    if (!content) return;

    setInputContent('');
    await sendMessage(content);
    scrollToBottom(true);
  };

  // Enter to send (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (convLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (convError) {
    return (
      <div className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-950/50 border border-rose-800/60 flex items-center justify-center text-rose-400">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-100">Unable to Access Conversation</h2>
          <p className="text-xs text-rose-300">{convError}</p>
        </div>
        <button
          onClick={() => navigate('/app')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-colors border border-slate-700 cursor-pointer"
        >
          ← Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-4 w-full flex flex-col h-[calc(100vh-7rem)]">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col flex-1 overflow-hidden">
        {/* Chat Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400">
              {otherParticipant?.displayName?.charAt(0).toUpperCase() || 'U'}
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>{otherParticipant?.displayName}</span>
              </h2>
              <div className="flex items-center gap-2">
                <p className="text-[11px] text-slate-400 font-mono">
                  @{otherParticipant?.username}
                </p>

                {/* Interactive Security Verification Badge */}
                <button
                  type="button"
                  onClick={() => setIsSecurityModalOpen(true)}
                  className={`inline-flex items-center gap-1 text-[10px] font-sans px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                    verificationState === 'verified'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                      : verificationState === 'key_changed'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25 animate-pulse'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                  title="Click to view safety number and verify cryptographic identity"
                >
                  {verificationState === 'verified' ? (
                    <>
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>Verified</span>
                    </>
                  ) : verificationState === 'key_changed' ? (
                    <>
                      <ShieldAlert className="w-3 h-3 text-amber-400" />
                      <span>Key Changed</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-3 h-3 text-slate-400" />
                      <span>Unverified</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Header Actions: Connection & Gesture Status */}
          <div className="flex items-center gap-2">
            {!isConfigured && (
              <button
                type="button"
                onClick={() => setIsSetupOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors cursor-pointer"
                title="Configure gesture reveal sequence"
              >
                <Shield className="w-3 h-3" />
                <span>Setup Gesture</span>
              </button>
            )}

            {connectionStatus === 'connected' ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Connected</span>
              </div>
            ) : connectionStatus === 'reconnecting' ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                <span>Reconnecting...</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Offline</span>
              </div>
            )}
          </div>
        </div>

        {/* Key Change Warning Banner */}
        {isKeyChanged && (
          <div className="px-5 py-2.5 bg-amber-950/60 border-b border-amber-700/50 flex items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Security Alert:</strong> @{otherParticipant?.username}&apos;s encryption identity has changed.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSecurityModalOpen(true)}
              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg font-medium transition-colors border border-amber-500/30 cursor-pointer shrink-0"
            >
              Verify Code
            </button>
          </div>
        )}

        {/* Message Area Timeline */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 bg-slate-950/40 relative"
        >
          {/* Older messages loading trigger */}
          {hasMore && (
            <div className="flex justify-center pb-2">
              <button
                onClick={loadOlderMessages}
                disabled={isLoadingOlder}
                className="px-3 py-1 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isLoadingOlder && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>{isLoadingOlder ? 'Loading older messages...' : 'Load older messages'}</span>
              </button>
            </div>
          )}

          {messagesLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-24 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <p className="text-xs text-slate-500 font-mono">Loading encrypted messages...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shadow">
                <ShieldCheck className="w-6 h-6 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-300">End-to-End Encrypted Chat</p>
                <p className="text-[11px] text-slate-500 max-w-xs">
                  Messages are end-to-end encrypted with @{otherParticipant?.username}. No one outside this chat can read them.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === user?.id;
              const revealed = isRevealed(msg.id);
              const decryptedContent = getDecryptedText(msg);

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
                >
                  <div className="relative max-w-[85%] sm:max-w-[70%]">
                    {/* Message Bubble */}
                    <div
                      className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm break-words whitespace-pre-wrap ${
                        isMe
                          ? revealed
                            ? 'bg-emerald-700 text-white rounded-tr-xs ring-2 ring-emerald-400/40'
                            : 'bg-emerald-600 text-white rounded-tr-xs'
                          : revealed
                          ? 'bg-slate-700 text-white rounded-tl-xs border border-emerald-500/40 ring-2 ring-emerald-500/20'
                          : 'bg-slate-800 text-slate-100 rounded-tl-xs border border-slate-700/60'
                      }`}
                    >
                      <ProtectedMessage
                        content={decryptedContent}
                        displayMode={revealed ? 'revealed' : 'protected'}
                      />
                    </div>

                    {/* Reveal Action Pill / Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (revealed) {
                          hideMessage(msg.id);
                        } else {
                          setRevealModalTargetId(msg.id);
                        }
                      }}
                      className={`absolute ${
                        isMe ? '-left-8' : '-right-8'
                      } top-1/2 -translate-y-1/2 p-1.5 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer ${
                        revealed
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 opacity-100'
                          : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700'
                      }`}
                      title={revealed ? 'Click to hide plaintext' : 'Draw gesture to reveal message'}
                    >
                      {revealed ? (
                        <EyeOff className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Message Meta: Timestamp & Delivery Status */}
                  <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-slate-500 font-mono">
                    {revealed && (
                      <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                        Revealed
                      </span>
                    )}

                    <span>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    {isMe && (
                      <span className="flex items-center gap-0.5">
                        {msg.status === 'sending' ? (
                          <span title="Sending...">
                            <Clock className="w-3 h-3 text-slate-400 animate-pulse" />
                          </span>
                        ) : msg.status === 'failed' ? (
                          <button
                            onClick={() => retryMessage(msg.id)}
                            className="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-sans font-medium cursor-pointer"
                            title="Failed to send. Click to retry"
                          >
                            <AlertCircle className="w-3 h-3" />
                            <span>Retry</span>
                            <RotateCcw className="w-2.5 h-2.5" />
                          </button>
                        ) : msg.status === 'read' ? (
                          <span title="Read">
                            <CheckCheck className="w-3 h-3 text-emerald-400" />
                          </span>
                        ) : msg.status === 'delivered' ? (
                          <span title="Delivered">
                            <CheckCheck className="w-3 h-3 text-slate-400" />
                          </span>
                        ) : (
                          <span title="Sent">
                            <Check className="w-3 h-3 text-slate-400" />
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          <div ref={messagesEndRef} />

          {/* Floating Jump to Bottom Button */}
          {showScrollBottom && (
            <button
              onClick={() => scrollToBottom(true)}
              className="absolute bottom-4 right-6 p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg border border-emerald-400/30 transition-transform cursor-pointer"
              title="Jump to latest messages"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Message Composer */}
        <form
          onSubmit={handleSend}
          className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/80 backdrop-blur-sm"
        >
          <div className="flex items-end gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-2 focus-within:border-emerald-500 transition-colors">
            <textarea
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type an encrypted message... (Press Enter to send)"
              rows={1}
              maxLength={5000}
              className="flex-1 bg-transparent border-0 resize-none text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none max-h-32 min-h-[36px] py-1.5 px-2"
            />

            <div className="flex items-center gap-2 shrink-0 pb-1 pr-1">
              {inputContent.length > 3500 && (
                <span className="text-[10px] text-slate-500 font-mono">
                  {inputContent.length}/5000
                </span>
              )}

              <button
                type="submit"
                disabled={!inputContent.trim()}
                className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-30 transition-all cursor-pointer shadow flex items-center justify-center"
                title="Send Encrypted Message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Contact Security & Key Verification Modal */}
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

      {/* Gesture Reveal Modal Overlay */}
      <GestureRevealModal
        isOpen={Boolean(revealModalTargetId)}
        targetMessageId={revealModalTargetId}
        onClose={() => setRevealModalTargetId(null)}
        onRevealed={(messageId) => revealMessage(messageId)}
        onOpenSetup={() => setIsSetupOpen(true)}
      />

      {/* Gesture Enrollment Modal */}
      <GestureSequenceSetup
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
      />
    </div>
  );
};
