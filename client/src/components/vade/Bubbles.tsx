import React, { useMemo } from 'react';
import { protect, type ProtectionMode } from '../../utils/protectedText/protectedTextEngine';

/** 22px all round with a 7px tail corner on the sender's side. No tails, no shadows. */
const OUT_RADIUS = 'rounded-[22px_22px_7px_22px]';
const IN_RADIUS = 'rounded-[22px_22px_22px_7px]';

/** 80% of the pane on mobile, 60% from the desktop breakpoint up. */
const WIDTH = 'max-w-[80%] lg:max-w-[60%]';

const SHARED = 'px-[15px] py-[11px] text-message break-words whitespace-pre-wrap';

interface ProtectedBubbleProps {
  content: string;
  mode: ProtectionMode;
  isMe: boolean;
  onReveal: () => void;
  onLongPress: () => void;
}

/**
 * A message in its protected form. This component never receives a "show plaintext" flag —
 * plaintext lives only in `RevealedBubble`, so there is exactly one place it can render.
 *
 * Fail-closed: if the renderer throws, the bubble says so rather than falling back to the
 * plaintext it was given.
 */
export const ProtectedBubble: React.FC<ProtectedBubbleProps> = ({
  content,
  mode,
  isMe,
  onReveal,
  onLongPress,
}) => {
  const rendered = useMemo(() => {
    try {
      return protect(content, mode);
    } catch (error) {
      console.error('Protected text rendering failed:', error);
      return null;
    }
  }, [content, mode]);

  if (rendered === null) {
    return (
      <div
        role="alert"
        className={`${SHARED} ${WIDTH} ${isMe ? OUT_RADIUS : IN_RADIUS} border border-warn bg-warn-tint text-warn`}
      >
        Unable to display protected message
      </div>
    );
  }

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    onLongPress();
  };

  return (
    <button
      type="button"
      onClick={onReveal}
      onContextMenu={handleContextMenu}
      // Screen readers get the action, never the plaintext. The visible protected text is
      // decorative for them — it is a rendering of the message, not its content.
      aria-label="Protected message, activate to reveal"
      className={`${SHARED} ${WIDTH} ${isMe ? OUT_RADIUS : IN_RADIUS} ${
        isMe ? 'bg-out-bg text-out-fg' : 'bg-surface text-text'
      } cursor-pointer text-left focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      <span aria-hidden="true">{rendered}</span>
    </button>
  );
};

interface RevealedBubbleProps {
  plaintext: string;
  isMe: boolean;
  remainingSeconds: number;
  onLongPress: () => void;
}

/**
 * The only component in the app that renders decrypted message text.
 *
 * It is mounted solely inside an active, gesture-authorised reveal window. There is no
 * transition on the way in or out — plaintext is never animated, so no motion can extend the
 * exposure.
 */
export const RevealedBubble: React.FC<RevealedBubbleProps> = ({
  plaintext,
  isMe,
  remainingSeconds,
  onLongPress,
}) => {
  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    onLongPress();
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      role="group"
      aria-label={`Revealed message, ${remainingSeconds} seconds remaining`}
      className={`${SHARED} ${WIDTH} ${isMe ? OUT_RADIUS : IN_RADIUS} ${
        isMe ? 'bg-out-bg text-out-fg' : 'bg-surface text-text'
      } tracking-normal outline outline-[1.5px] outline-offset-2 outline-accent`}
    >
      {plaintext}
    </div>
  );
};
