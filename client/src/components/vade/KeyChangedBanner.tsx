import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface KeyChangedBannerProps {
  onReview: () => void;
  className?: string;
}

/**
 * Sits under the chat header when the peer's key no longer matches the one that was verified.
 *
 * A live region, so it is announced once when it appears. It has exactly one action and does
 * not dismiss itself — the warning persists until the safety number is compared again.
 */
export const KeyChangedBanner: React.FC<KeyChangedBannerProps> = ({ onReview, className = '' }) => (
  <div
    role="alert"
    className={`flex shrink-0 items-start gap-[11px] rounded-[18px] border border-warn bg-warn-tint p-[13px_15px] ${className}`}
  >
    <AlertTriangle
      className="mt-px shrink-0 text-warn"
      width={18}
      height={18}
      strokeWidth={2.75}
      aria-hidden="true"
    />
    <div className="min-w-0">
      <div className="text-sm font-bold tracking-[-0.01em]">Safety number changed</div>
      <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
        Verify again before you reveal anything in this conversation.
      </p>
      <button
        type="button"
        onClick={onReview}
        className="mt-[9px] inline-flex h-8 cursor-pointer items-center rounded-full bg-warn px-3.5 text-row font-bold text-bg focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warn"
      >
        Review safety number
      </button>
    </div>
  </div>
);
