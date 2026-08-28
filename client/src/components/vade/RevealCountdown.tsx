import React, { useEffect, useState } from 'react';

interface RevealCountdownProps {
  /** Epoch ms at which the reveal window closes. */
  expiresAt: number;
  /** Full width of the window, used to scale the track fill. */
  durationMs: number;
  onHide: () => void;
}

/**
 * The row under a revealed bubble: a 26 × 3px track, the seconds remaining, and Hide.
 *
 * This ticks the *display* only. Actual re-protection is owned by `useMessageReveal`, so a
 * paused or unmounted countdown can never extend the window — the message hides on schedule
 * whether or not this component is on screen.
 */
export const RevealCountdown: React.FC<RevealCountdownProps> = ({ expiresAt, durationMs, onHide }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const remainingMs = Math.max(0, expiresAt - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const fraction = durationMs > 0 ? Math.max(0, Math.min(1, remainingMs / durationMs)) : 0;

  return (
    <div className="flex items-center gap-[9px] px-1">
      <span
        className="h-[3px] w-[26px] shrink-0 overflow-hidden rounded-full bg-line"
        aria-hidden="true"
      >
        <span
          className="block h-[3px] rounded-full bg-accent"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </span>
      <span className="text-meta font-bold text-accent-ink">Revealed · {remainingSeconds}s</span>
      <button
        type="button"
        onClick={onHide}
        className="cursor-pointer text-meta text-muted underline underline-offset-[3px] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Hide
      </button>
    </div>
  );
};
