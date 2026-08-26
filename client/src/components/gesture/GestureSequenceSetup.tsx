import React, { useState } from 'react';
import { GestureCanvas } from './GestureCanvas';
import { useGesture } from '../../hooks/useGesture';
import { compareEnrolledGestures } from '../../utils/gestureRecognizer';
import { isValidStroke, type Point } from '../../utils/gestureNormalize';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ShieldCheck, AlertCircle, CheckCircle } from 'lucide-react';

export interface GestureSequenceSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type StepPhase = 'draw' | 'confirm';

export const GestureSequenceSetup: React.FC<GestureSequenceSetupProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { saveSequence } = useGesture();

  const [totalSteps, setTotalSteps] = useState(3);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [phase, setPhase] = useState<StepPhase>('draw');

  const [firstDrawing, setFirstDrawing] = useState<Point[] | null>(null);
  const [confirmedSteps, setConfirmedSteps] = useState<Point[][]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  if (!isOpen) return null;

  const resetAll = () => {
    setCurrentStepIndex(0);
    setPhase('draw');
    setFirstDrawing(null);
    setConfirmedSteps([]);
    setStatusMessage(null);
    setIsError(false);
    setIsComplete(false);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleStrokeComplete = (points: Point[]) => {
    if (!isValidStroke(points)) {
      setStatusMessage('Stroke too short. Please draw a clear continuous gesture.');
      setIsError(true);
      return;
    }

    setIsError(false);

    if (phase === 'draw') {
      // Completed first drawing of this step
      setFirstDrawing(points);
      setPhase('confirm');
      setStatusMessage('Now redraw the same gesture to confirm.');
    } else {
      // Confirmation attempt
      if (!firstDrawing) {
        setPhase('draw');
        return;
      }

      const isMatch = compareEnrolledGestures(firstDrawing, points);

      if (isMatch) {
        // Step confirmed
        const updatedSteps = [...confirmedSteps, firstDrawing];
        setConfirmedSteps(updatedSteps);
        setFirstDrawing(null);

        if (currentStepIndex + 1 < totalSteps) {
          // Advance to next step
          setCurrentStepIndex((prev) => prev + 1);
          setPhase('draw');
          setStatusMessage(`Step ${currentStepIndex + 1} confirmed! Now draw gesture ${currentStepIndex + 2}.`);
        } else {
          // All steps completed!
          const saved = saveSequence(updatedSteps);
          if (saved) {
            setIsComplete(true);
            setStatusMessage('Gesture sequence saved locally on this device.');
            if (onSuccess) onSuccess();
          } else {
            setStatusMessage('Failed to save gesture sequence.');
            setIsError(true);
          }
        }
      } else {
        // Confirmation failed
        setStatusMessage('Gestures did not match closely enough. Please redraw this step.');
        setIsError(true);
        setFirstDrawing(null);
        setPhase('draw');
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        isComplete
          ? 'Gesture Setup Complete'
          : `Create Gesture Sequence (Step ${currentStepIndex + 1} of ${totalSteps})`
      }
      maxWidth="sm"
    >
      {isComplete ? (
        <div className="py-6 flex flex-col items-center space-y-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-8 h-8" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-bold text-slate-100">Gesture Configured</h4>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Your {totalSteps}-step reveal sequence is saved locally in your browser. You can now temporarily reveal protected messages.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={handleClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center space-y-3">
          {/* Progress Indicators */}
          <div className="flex items-center justify-center gap-2 pt-1">
            {Array.from({ length: totalSteps }).map((_, idx) => (
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
            {phase === 'draw'
              ? `Draw gesture ${currentStepIndex + 1}`
              : `Redraw gesture ${currentStepIndex + 1} to confirm`}
          </p>

          {/* Interactive Canvas */}
          <GestureCanvas
            onStrokeComplete={handleStrokeComplete}
            width={240}
            height={240}
            clearOnComplete={false}
            className="my-1"
          />

          {/* Feedback message */}
          <div className="min-h-[38px] flex items-center justify-center px-2">
            {statusMessage ? (
              <div
                role="status"
                className={`flex items-center gap-1.5 text-xs ${
                  isError ? 'text-rose-400 font-medium' : 'text-slate-300'
                }`}
              >
                {isError ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />
                ) : (
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />
                )}
                <span>{statusMessage}</span>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Draw any shape or symbol in one continuous stroke.
              </p>
            )}
          </div>

          {/* Step count selector on step 1 before first draw */}
          {currentStepIndex === 0 && phase === 'draw' && !firstDrawing && (
            <div className="flex items-center justify-between w-full pt-3 border-t border-slate-800/80 text-xs text-slate-400">
              <span>Steps in sequence:</span>
              <div className="flex items-center gap-1.5">
                {[2, 3, 4, 5].map((len) => (
                  <button
                    key={len}
                    type="button"
                    onClick={() => setTotalSteps(len)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      totalSteps === len
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {len}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
