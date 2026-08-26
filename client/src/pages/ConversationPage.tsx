import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { conversationService } from '../services/conversationService';
import type { ConversationDetails } from '@enctxt/shared';
import { ApiClientError } from '../services/api';
import { ArrowLeft, Loader2, AlertCircle, Lock, MessageSquare } from 'lucide-react';

export const ConversationPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [conversation, setConversation] = useState<ConversationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await conversationService.getConversation(conversationId);
        setConversation(data.conversation);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to load conversation.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [conversationId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-950/50 border border-rose-800/60 flex items-center justify-center text-rose-400">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-100">Unable to Access Conversation</h2>
          <p className="text-xs text-rose-300">{error}</p>
        </div>
        <button
          onClick={() => navigate('/app')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-colors border border-slate-700"
        >
          ← Return to Dashboard
        </button>
      </div>
    );
  }

  const otherParticipant = conversation?.participants.find((p) => p.id !== user?.id);

  return (
    <div className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-6 w-full flex flex-col h-[calc(100vh-8rem)]">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col flex-1 overflow-hidden">
        {/* Header: Back arrow + Other Participant Identity */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50 backdrop-blur-sm">
          <div className="flex items-center gap-3.5">
            <Link
              to="/app"
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-emerald-400">
              {otherParticipant?.displayName?.charAt(0).toUpperCase() || 'U'}
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>{otherParticipant?.displayName}</span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">@{otherParticipant?.username}</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Lock className="w-3 h-3" />
            <span className="hidden sm:inline">1-to-1 Channel</span>
          </div>
        </div>

        {/* Message Area Placeholder (Section 26) */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 bg-slate-950/30">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shadow">
            <MessageSquare className="w-7 h-7 text-emerald-500" />
          </div>

          <div className="space-y-1 max-w-sm">
            <h3 className="text-base font-bold text-slate-200">Messages coming soon</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              1-to-1 channel verified between you and @{otherParticipant?.username}.
              Message transport, packet encryption, and real-time delivery are scheduled for Phase 4.
            </p>
          </div>

          <div className="text-[10px] text-slate-600 font-mono border border-slate-800/80 px-3 py-1 rounded-lg">
            Channel ID: {conversation?.id}
          </div>
        </div>

        {/* Message Input Composer Placeholder (Section 26) */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
          <div className="relative flex items-center">
            <input
              type="text"
              disabled
              placeholder="Message input coming soon"
              className="w-full pl-4 pr-12 py-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-slate-500 placeholder-slate-600 cursor-not-allowed select-none"
            />
            <div className="absolute right-3 text-slate-600 text-xs font-mono">Phase 4</div>
          </div>
        </div>
      </div>
    </div>
  );
};
