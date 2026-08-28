import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { ConversationDetails } from '@enctxt/shared';
import { useAuth } from '../auth/AuthContext';
import { conversationService } from '../services/conversationService';
import { useMessages } from '../hooks/useMessages';
import { useContactSecurity } from '../hooks/useContactSecurity';
import { Avatar, BackHeader } from '../components/vade/Chrome';
import { SectionLabel } from '../components/vade/SettingsGroup';
import { SecurityChip } from '../components/vade/SecurityChip';
import { VadeButton } from '../components/vade/VadeButton';
import { ConfirmDialog, type ConfirmRequest } from '../components/vade/ConfirmDialog';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

/** Splits a space-separated code into fixed-size lines so it can be read aloud in chunks. */
function toLines(value: string | null, perLine: number): string[] {
  if (!value) return [];
  const groups = value.split(' ');
  const lines: string[] = [];
  for (let index = 0; index < groups.length; index += perLine) {
    lines.push(groups.slice(index, index + perLine).join(' '));
  }
  return lines;
}

/**
 * Contact security, promoted from a modal to a screen — comparing a safety number is a task
 * done with another person present, not a glance at a dialog.
 *
 * Verify and unverify each go through a confirmation: both change what the rest of the app
 * tells the user about this conversation.
 */
export const ContactSecurityPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [conversation, setConversation] = useState<ConversationDetails | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    let isMounted = true;
    conversationService
      .getConversation(conversationId)
      .then((data) => {
        if (isMounted) setConversation(data.conversation);
      })
      .catch(() => {
        if (isMounted) navigate('/app');
      });
    return () => {
      isMounted = false;
    };
  }, [conversationId, navigate]);

  const peer = conversation?.participants.find((participant) => participant.id !== user?.id);

  const { myPublicKeyBase64, peerKeyRecord } = useMessages(conversationId, user?.id, peer?.id);

  const { verificationState, safetyNumber, peerFingerprint, isLoading, markAsVerified, unverify } =
    useContactSecurity(peer?.id, myPublicKeyBase64, peerKeyRecord);

  const backHref = `/app/conversations/${conversationId}`;

  if (!peer) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading contact security" />
      </div>
    );
  }

  const isVerified = verificationState === 'verified';

  return (
    <ErrorBoundary fallbackTitle="Contact security unavailable">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <BackHeader
          onBack={() => navigate(backHref)}
          title="Contact security"
          backLabel="Back to conversation"
        />

        <div className="flex flex-col gap-section px-[22px] pb-16 pt-3 lg:max-w-xl">
          <div className="flex flex-col items-center gap-3 pt-2">
            <Avatar name={peer.displayName} size={64} />
            <div className="text-center">
              <div className="text-[19px] font-bold tracking-[-0.018em]">{peer.displayName}</div>
              <div className="mt-px text-[13.5px] text-muted">@{peer.username}</div>
            </div>
            {!isLoading && <SecurityChip state={verificationState} />}
          </div>

          <div>
            <SectionLabel>Safety number</SectionLabel>
            <div className="rounded-card bg-surface p-5">
              <div className="text-center font-mono text-[19px] leading-[1.7] tracking-[0.06em]">
                {safetyNumber ? (
                  toLines(safetyNumber, 2).map((line) => <div key={line}>{line}</div>)
                ) : (
                  <span className="text-sm text-muted">Calculating…</span>
                )}
              </div>
            </div>
            <p className="mt-2.5 px-0.5 text-[12.5px] leading-relaxed text-muted">
              Read these numbers aloud with {peer.displayName} in person or over a channel you
              already trust. If they match, no one is between you.
            </p>
          </div>

          <div>
            <SectionLabel>Fingerprint</SectionLabel>
            <div className="rounded-card bg-surface p-[16px_18px] font-mono text-[13.5px] leading-[1.8] tracking-[0.04em]">
              {peerFingerprint ? (
                toLines(peerFingerprint, 4).map((line) => <div key={line}>{line}</div>)
              ) : (
                <span className="text-muted">Calculating…</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {isVerified ? (
              <VadeButton
                variant="outline"
                size="md"
                block
                onClick={() =>
                  setConfirmRequest({
                    title: 'Remove verification?',
                    body: 'This conversation stays encrypted, but Vade will stop showing it as verified until you compare safety numbers again.',
                    cta: 'Remove',
                    onConfirm: unverify,
                  })
                }
              >
                Remove verification
              </VadeButton>
            ) : (
              <VadeButton
                size="md"
                block
                disabled={!safetyNumber}
                onClick={() =>
                  setConfirmRequest({
                    title: 'Mark as verified?',
                    body: `Only do this once you have compared the safety number with ${peer.displayName} over a channel you trust.`,
                    cta: 'Mark verified',
                    onConfirm: () => void markAsVerified(),
                  })
                }
              >
                Mark as verified
              </VadeButton>
            )}
            <div className="text-center text-xs leading-normal text-faint">
              Protocol v1 · ECDH P-256 · AES-256-GCM
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog request={confirmRequest} onCancel={() => setConfirmRequest(null)} />
    </ErrorBoundary>
  );
};
