import React, { useState, useEffect } from 'react';
import { GestureCanvas } from './GestureCanvas';
import { useGesture } from '../../hooks/useGesture';
import { useMessageReveal } from '../../hooks/useMessageReveal';
import { isValidStroke, type Point } from '../../utils/gestureNormalize';
import { X, Lock, Eye, AlertCircle, ShieldAlert } from 'lucide-react';

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

  // Reset state when opening
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
      setFeedback('Stroke too short. Please draw a clear shape.');
      setIsError(true);
      return;
    }

    const isMatch = verifyStep(currentStepIndex, points);

    if (isMatch) {
      setIsError(false);
      if (currentStepIndex + 1 < sequenceLength) {
        // Advance to next gesture in sequence
        setCurrentStepIndex((prev) => prev + 1);
        setFeedback(`Step ${currentStepIndex + 1} recognized! Draw gesture ${currentStepIndex + 2}.`);
      } else {
        // Complete sequence matched!
        onRevealed(targetMessageId);
        handleClose();
      }
    } else {
      // Sequence mismatch
      setIsError(true);
      recordFailedAttempt();
      setCurrentStepIndex(0);
      setFeedback('Incorrect gesture. Sequence reset to Step 1.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-200 rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {!isConfigured ? (
          <div className="py-6 flex flex-col items-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Lock className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-100">No Reveal Gesture</h3>
              <p className="text-xs text-slate-400 max-w-xs">
                You have not configured a reveal gesture sequence on this device.
              </p>
            </div>
            {onOpenSetup && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onOpenSetup();
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-lg mt-2"
              >
                Set Up Gesture Now
              </button>
            )}
          </div>
        ) : isLockedOut ? (
          <div className="py-6 flex flex-col items-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-100">Temporarily Locked</h3>
              <p className="text-xs text-rose-400 font-medium">
                Too many failed attempts. Try again in {lockoutRemainingSeconds}s.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header & Steps */}
            <div className="space-y-2 mb-3 w-full">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <Eye className="w-3.5 h-3.5" />
                <span>Step {currentStepIndex + 1} of {sequenceLength}</span>
              </div>
              <h3 className="text-base font-bold text-slate-100">
                Draw Gesture {currentStepIndex + 1}
              </h3>

              {/* Progress Dots */}
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
                  />
                ))}
              </div>
            </div>

            {/* Interactive Canvas */}
            <GestureCanvas
              onStrokeComplete={handleStrokeComplete}
              width={240}
              height={240}
              clearOnComplete={true}
              className="my-2"
            />

            {/* Feedback / Status */}
            <div className="min-h-[38px] flex items-center justify-center mt-2 px-2 text-center">
              {feedback ? (
                <div
                  className={`flex items-center gap-1.5 text-xs ${
                    isError ? 'text-rose-400 font-medium' : 'text-emerald-400 font-medium'
                  }`}
                >
                  {isError ? (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  ) : (
                    <Eye className="w-4 h-4 shrink-0 text-emerald-400" />
                  )}
                  <span>{feedback}</span>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Draw gesture {currentStepIndex + 1} to authorize reveal.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
