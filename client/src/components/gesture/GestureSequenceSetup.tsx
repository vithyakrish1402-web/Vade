import React, { useState } from 'react';
import { GestureCanvas } from './GestureCanvas';
import { useGesture } from '../../hooks/useGesture';
import { compareEnrolledGestures } from '../../utils/gestureRecognizer';
import { isValidStroke, type Point } from '../../utils/gestureNormalize';
import { X, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

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
      setStatusMessage('Stroke too short or tap detected. Please draw a clear shape.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col items-center text-center relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-200 rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {isComplete ? (
          <div className="py-8 flex flex-col items-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-100">Gesture Configured</h3>
              <p className="text-xs text-slate-400 max-w-xs">
                Your {totalSteps}-step reveal sequence is saved on this device. You can now unlock protected messages.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-lg mt-2"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Header & Steps Progress */}
            <div className="space-y-2 mb-4 w-full">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <span>Step {currentStepIndex + 1} of {totalSteps}</span>
                <span>•</span>
                <span className="capitalize">{phase === 'draw' ? 'Draw' : 'Confirm'}</span>
              </div>
              <h3 className="text-base font-bold text-slate-100">
                {phase === 'draw'
                  ? `Draw Gesture ${currentStepIndex + 1}`
                  : `Redraw to Confirm Step ${currentStepIndex + 1}`}
              </h3>

              {/* Progress Dots */}
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
                  />
                ))}
              </div>
            </div>

            {/* Interactive Canvas */}
            <GestureCanvas
              onStrokeComplete={handleStrokeComplete}
              width={260}
              height={260}
              clearOnComplete={false}
              className="my-2"
            />

            {/* Dynamic Status / Feedback Banner */}
            <div className="min-h-[44px] flex items-center justify-center mt-2 px-2 text-center">
              {statusMessage ? (
                <div
                  className={`flex items-center gap-1.5 text-xs ${
                    isError ? 'text-rose-400 font-medium' : 'text-slate-300'
                  }`}
                >
                  {isError ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  ) : (
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                  )}
                  <span>{statusMessage}</span>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Draw any continuous shape or symbol in one stroke.
                </p>
              )}
            </div>

            {/* Sequence length selector if at step 1 before drawing */}
            {currentStepIndex === 0 && phase === 'draw' && !firstDrawing && (
              <div className="flex items-center justify-between w-full mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                <span>Sequence length:</span>
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
          </>
        )}
      </div>
    </div>
  );
};
