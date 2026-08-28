import React from 'react';
import { ChevronLeft, MoreVertical } from 'lucide-react';
import type { ContactVerificationState, UserSummary } from '@enctxt/shared';
import type { WSConnectionStatus } from '../../services/websocket';
import { Avatar } from '../vade/Chrome';
import { SecurityChip, type SecurityState } from '../vade/SecurityChip';

export interface ChatHeaderProps {
  peer: UserSummary | undefined;
  verificationState: ContactVerificationState;
  isSecurityLoading: boolean;
  connectionStatus: WSConnectionStatus;
  onOpenSecurity: () => void;
  onBack: () => void;
}

/**
 * Back, who you are talking to, and one line of security state.
 *
 * Offline takes the subtitle over the verification state: a connection you do not have is the
 * more immediately useful fact, and the verification state is one tap away on the security
 * screen. The composer stays visible either way.
 */
export const ChatHeader: React.FC<ChatHeaderProps> = ({
  peer,
  verificationState,
  isSecurityLoading,
  connectionStatus,
  onOpenSecurity,
  onBack,
}) => {
  const state: SecurityState =
    connectionStatus === 'disconnected' ? 'offline' : (verificationState as SecurityState);

  return (
    <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-4 pb-3 pt-1.5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to conversations"
        className="-ml-1.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-text hover:bg-surface focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ChevronLeft width={20} height={20} strokeWidth={2.75} aria-hidden="true" />
      </button>

      <Avatar name={peer?.displayName ?? '?'} size={38} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-name font-bold">{peer?.displayName ?? 'Loading'}</div>
        {!isSecurityLoading && <SecurityChip state={state} variant="inline" className="mt-px" />}
      </div>

      <button
        type="button"
        onClick={onOpenSecurity}
        aria-label="Contact security"
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-text hover:bg-surface focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <MoreVertical width={19} height={19} strokeWidth={2.75} aria-hidden="true" />
      </button>
    </header>
  );
};
