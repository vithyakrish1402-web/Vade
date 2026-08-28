import React, { useId } from 'react';
import { useOverlay } from './useOverlay';
import { VadeButton } from './VadeButton';

export interface ConfirmRequest {
  title: string;
  body: string;
  /** Label on the confirming action. */
  cta: string;
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  request: ConfirmRequest | null;
  onCancel: () => void;
}

/**
 * Required for verify, unverify, revoke and delete — every security-sensitive action takes an
 * explicit confirmation before it runs.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ request, onCancel }) => {
  const containerRef = useOverlay(Boolean(request), onCancel);
  const titleId = useId();
  const bodyId = useId();

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim p-[30px] animate-fade">
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="flex w-full max-w-[380px] flex-col gap-2 rounded-dialog bg-bg p-[22px] shadow-dialog focus:outline-none"
      >
        <h2 id={titleId} className="text-lg font-bold tracking-[-0.018em]">
          {request.title}
        </h2>
        <p id={bodyId} className="text-[13.5px] leading-relaxed text-muted">
          {request.body}
        </p>
        <div className="mt-3 flex gap-[9px]">
          <VadeButton variant="outline" size="sm" block onClick={onCancel}>
            Cancel
          </VadeButton>
          <VadeButton
            variant="solid"
            size="sm"
            block
            onClick={() => {
              request.onConfirm();
              onCancel();
            }}
          >
            {request.cta}
          </VadeButton>
        </div>
      </div>
    </div>
  );
};
