import React, { useState, useEffect } from 'react';
import { GestureCanvas } from './GestureCanvas';
import { useGesture } from '../../hooks/useGesture';
import { useMessageReveal } from '../../hooks/useMessageReveal';
import { isValidStroke, type Point } from '../../utils/gestureNormalize';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Lock, Eye, AlertCircle, ShieldAlert } from 'lucide-react';

export interface GestureRevealModalProps {
  isOpen: boolean;
  targetMessageId: string | null;
  onClose: () => void;
  onRevealed: (messageId: string) => void;
  onOpenSetup?: () => void;
}

export const GestureRevealModal: React.FC<GestureRevealModalProps> = ({
  isOpen,
  targetMessageId,
  onClose,
  onRevealed,
  onOpenSetup,
}) => {
  const { isConfigured, sequenceLength, verifyStep } = useGesture();
  const { isLockedOut, lockoutRemainingSeconds, recordFailedAttempt } = useMessageReveal();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
      setFeedback(null);
      setIsError(false);
    }
  }, [isOpen]);

  if (!isOpen || !targetMessageId) return null;

  const handleClose = () => {
    setCurrentStepIndex(0);
    setFeedback(null);
    setIsError(false);
    onClose();
  };

  const handleStrokeComplete = (points: Point[]) => {
    if (isLockedOut) return;

    if (!isValidStroke(points)) {
      setFeedback('Stroke too short. Please draw a clear continuous gesture.');
      setIsError(true);
      return;
    }

    const isMatch = verifyStep(currentStepIndex, points);

    if (isMatch) {
      setIsError(false);
      if (currentStepIndex + 1 < sequenceLength) {
        setCurrentStepIndex((prev) => prev + 1);
        setFeedback(`Step ${currentStepIndex + 1} recognized! Draw gesture ${currentStepIndex + 2}.`);
      } else {
        onRevealed(targetMessageId);
        handleClose();
      }
    } else {
      setIsError(true);
      recordFailedAttempt();
      setCurrentStepIndex(0);
      setFeedback('Gesture does not match. Sequence reset to Step 1.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isConfigured ? `Reveal Message (Step ${currentStepIndex + 1} of ${sequenceLength})` : 'Gesture Not Configured'}
      maxWidth="sm"
    >
      {!isConfigured ? (
        <div className="py-6 flex flex-col items-center space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Lock className="w-7 h-7" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-bold text-slate-100">No Reveal Gesture</h4>
            <p className="text-xs text-slate-400 max-w-xs">
              You have not configured a reveal gesture sequence on this device.
            </p>
          </div>
          {onOpenSetup && (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                handleClose();
                onOpenSetup();
              }}
            >
              Set Up Gesture Sequence
            </Button>
          )}
        </div>
      ) : isLockedOut ? (
        <div className="py-6 flex flex-col items-center space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 animate-pulse">
            <ShieldAlert className="w-7 h-7" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h4 className="text-base font-bold text-slate-100">Too Many Failed Attempts</h4>
            <p className="text-xs text-rose-400 font-medium">
              Temporarily locked out. Please try again in {lockoutRemainingSeconds} seconds.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center space-y-3">
          {/* Step Progress Indicators */}
          <div className="flex items-center justify-center gap-2 pt-1">
            {Array.from({ length: sequenceLength }).map((_, idx) => (
              <div
                key={idx}
                className={`h-2 rounded-full transition-all ${
                  idx < currentStepIndex
                    ? 'w-6 bg-emerald-500'
                    : idx === currentStepIndex
                    ? 'w-6 bg-emerald-400 animate-pulse'
                    : 'w-2 bg-slate-800'
                }`}
                aria-hidden="true"
              />
            ))}
          </div>

          <p className="text-xs text-slate-300 font-medium">
            Draw gesture {currentStepIndex + 1} of {sequenceLength}
          </p>

          {/* Interactive Gesture Canvas */}
          <GestureCanvas
            onStrokeComplete={handleStrokeComplete}
            width={240}
            height={240}
            clearOnComplete={true}
            className="my-1"
          />

          {/* Feedback message */}
          <div className="min-h-[38px] flex items-center justify-center px-2">
            {feedback ? (
              <div
                role="status"
                className={`flex items-center gap-1.5 text-xs ${
                  isError ? 'text-rose-400 font-medium' : 'text-emerald-400 font-medium'
                }`}
              >
                {isError ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />
                )}
                <span>{feedback}</span>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Draw your secret gesture on the canvas above.
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
