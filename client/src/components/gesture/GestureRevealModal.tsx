import React, { useEffect, useState } from 'react';
import { useGesture } from '../../hooks/useGesture';
import { GesturePad, GesturePips, isMemorableStroke } from '../vade/GesturePad';
import { useOverlay } from '../vade/useOverlay';
import type { Point } from '../../utils/gestureNormalize';

/**
 * Enrollment confirms the shape once; revealing a message requires three consecutive matching
 * strokes. A single stroke is too easy to land by accident for something that exposes plaintext.
 */
export const REVEAL_STROKE_COUNT = 3;

export interface GestureRevealModalProps {
  isOpen: boolean;
  targetMessageId: string | null;
  onClose: () => void;
  onRevealed: (messageId: string) => void;
  onOpenSetup?: () => void;
  isLockedOut: boolean;
  lockoutRemainingSeconds: number;
  onFailedAttempt: () => void;
}

/**
 * The reveal overlay: a full-bleed scrim over the thread rather than a card modal, so nothing
 * of the conversation is legible behind it while a gesture is being drawn.
 *
 * Failure says only that the gesture did not match — never how close it was, which stroke
 * diverged, or how many attempts remain.
 */
export const GestureRevealModal: React.FC<GestureRevealModalProps> = ({
  isOpen,
  targetMessageId,
  onClose,
  onRevealed,
  onOpenSetup,
  isLockedOut,
  lockoutRemainingSeconds,
  onFailedAttempt,
}) => {
  const { isConfigured, sequenceLength, verifyStep } = useGesture();
  const [completed, setCompleted] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isError, setIsError] = useState(false);
  const containerRef = useOverlay(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setCompleted(0);
      setFeedback('');
      setIsError(false);
    }
  }, [isOpen, targetMessageId]);

  if (!isOpen || !targetMessageId) return null;

  /*
   * The current design enrolls a single shape, so every stroke is checked against template 0.
   * Accounts enrolled under the older multi-step flow still have their sequence stored; those
   * are walked step by step so an existing gesture keeps working without re-enrollment.
   */
  const isLegacySequence = sequenceLength > 1;
  const required = isLegacySequence ? sequenceLength : REVEAL_STROKE_COUNT;

  const handleStroke = (points: Point[]) => {
    if (isLockedOut) return;

    if (!isMemorableStroke(points)) {
      setIsError(true);
      setFeedback('That did not match.');
      return;
    }

    const templateIndex = isLegacySequence ? completed : 0;

    if (!verifyStep(templateIndex, points)) {
      setIsError(true);
      setCompleted(0);
      onFailedAttempt();
      setFeedback('That did not match.');
      return;
    }

    const next = completed + 1;
    setIsError(false);

    if (next >= required) {
      onRevealed(targetMessageId);
      onClose();
      return;
    }

    setCompleted(next);
    setFeedback('Recognised.');
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Draw to reveal"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[rgba(8,9,10,.66)] p-7 backdrop-blur-[3px] animate-fade focus:outline-none"
    >
      {!isConfigured ? (
        <div className="flex max-w-[300px] flex-col items-center gap-4 text-center">
          <div className="text-[17px] font-bold tracking-[-0.014em] text-white">
            No reveal gesture yet
          </div>
          <p className="text-row leading-normal text-white/60">
            Set a gesture on this device before you can read protected messages.
          </p>
          {onOpenSetup && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSetup();
              }}
              className="h-12 cursor-pointer rounded-full bg-white px-6 text-[15px] font-bold text-[#0d0e0f] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Set up gesture
            </button>
          )}
        </div>
      ) : isLockedOut ? (
        <div className="flex max-w-[300px] flex-col items-center gap-2 text-center">
          <div className="text-[17px] font-bold tracking-[-0.014em] text-white">Try again shortly</div>
          <p role="status" className="text-row text-white/60">
            Reveal is paused for {lockoutRemainingSeconds}s.
          </p>
        </div>
      ) : (
        <>
          <div className="text-center">
            <div className="text-[17px] font-bold tracking-[-0.014em] text-white">Draw to reveal</div>
            <div className="mt-[3px] text-row text-white/60">
              Stroke {Math.min(completed + 1, required)} of {required}
            </div>
          </div>

          <GesturePips total={required} completed={completed} skin="overlay" />

          <GesturePad
            onStroke={handleStroke}
            hasError={isError}
            skin="overlay"
            size={272}
            label="Draw your reveal gesture in one continuous stroke."
          />

          <div
            role="status"
            className="min-h-[20px] text-center text-[12.5px]"
            style={{ color: isError ? '#f0b48a' : 'rgba(255,255,255,.6)' }}
          >
            {feedback}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        className="cursor-pointer px-3.5 py-1.5 text-[13.5px] text-white/70 hover:text-white focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Cancel
      </button>
    </div>
  );
};
