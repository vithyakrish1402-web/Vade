import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft } from 'lucide-react';
import { useGesture } from '../hooks/useGesture';
import { useProtectionStyle } from '../hooks/useProtectionStyle';
import { DEFAULT_REVEAL_DURATION_MS } from '../hooks/useMessageReveal';
import { REVEAL_STROKE_COUNT } from '../components/gesture/GestureRevealModal';
import { compareEnrolledGestures } from '../utils/gestureRecognizer';
import { isDistinctiveShape, type Point } from '../utils/gestureNormalize';
import { GesturePad, GesturePips, isMemorableStroke } from '../components/vade/GesturePad';
import { ProtectionStylePicker, styleLabel } from '../components/vade/ProtectionStylePicker';
import { VadeButton } from '../components/vade/VadeButton';
import { useToast } from '../components/ui/Toast';

type Stage = 'intro' | 'draw' | 'confirm' | 'style' | 'done';

const STAGE_ORDER: Stage[] = ['intro', 'draw', 'confirm', 'style', 'done'];

const PROGRESS: Record<Stage, { width: string; label: string }> = {
  intro: { width: '20%', label: '1 of 4' },
  draw: { width: '40%', label: '2 of 4' },
  confirm: { width: '60%', label: '3 of 4' },
  style: { width: '80%', label: '4 of 4' },
  done: { width: '100%', label: 'Done' },
};

/** After three failed confirmations, offer a fresh start rather than more of the same. */
const MAX_CONFIRM_ATTEMPTS = 3;

export interface GestureEnrollmentPageProps {
  /** Where to go once the gesture is saved. */
  completeHref?: string;
  /** Where the back chevron goes from the first step. */
  exitHref?: string;
}

/**
 * The four-step enrollment: understand, draw, confirm, choose a style.
 *
 * The shape must be repeated once within tolerance before anything is saved — a single sample
 * is not enough to enroll something the user will have to reproduce under pressure. Raw
 * coordinates stay in memory; only the normalised template is persisted, and only locally.
 */
export const GestureEnrollmentPage: React.FC<GestureEnrollmentPageProps> = ({
  completeHref = '/app',
  exitHref = '/register',
}) => {
  const navigate = useNavigate();
  const { saveSequence } = useGesture();
  const { mode, setMode } = useProtectionStyle();
  const { error: toastError } = useToast();

  const [stage, setStage] = useState<Stage>('intro');
  const [firstStroke, setFirstStroke] = useState<Point[] | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isError, setIsError] = useState(false);

  const resetFeedback = () => {
    setFeedback('');
    setIsError(false);
  };

  const goBack = () => {
    if (stage === 'intro') {
      navigate(exitHref);
      return;
    }
    const previous = STAGE_ORDER[Math.max(0, STAGE_ORDER.indexOf(stage) - 1)];
    setStage(previous);
    resetFeedback();
  };

  const handleDrawStroke = (points: Point[]) => {
    if (!isMemorableStroke(points)) {
      setIsError(true);
      setFeedback('Too short to be memorable. Draw a longer, continuous shape.');
      return;
    }
    // Checked on the way in rather than at save time, so the user is told why on the very
    // first stroke instead of getting a generic failure after confirming.
    if (!isDistinctiveShape(points)) {
      setIsError(true);
      setFeedback('Too simple — a straight line is easy to guess. Draw a shape with at least one turn.');
      return;
    }
    setFirstStroke(points);
    setIsError(false);
    setFeedback('Gesture recorded.');
    setStage('confirm');
  };

  const handleConfirmStroke = (points: Point[]) => {
    if (!firstStroke) {
      setStage('draw');
      return;
    }

    if (!isMemorableStroke(points) || !compareEnrolledGestures(firstStroke, points)) {
      const nextAttempt = attempts + 1;
      setAttempts(nextAttempt);
      setIsError(true);
      setFeedback(
        nextAttempt >= MAX_CONFIRM_ATTEMPTS
          ? 'Still not matching. You can start over with a simpler shape.'
          : 'That did not match. Try to draw it the same way.'
      );
      return;
    }

    if (!saveSequence([firstStroke])) {
      setIsError(true);
      setFeedback('Could not save the gesture on this device.');
      toastError('Could not save your gesture. Check that this browser allows local storage.');
      return;
    }

    setAttempts(0);
    resetFeedback();
    setStage('style');
  };

  const progress = PROGRESS[stage];

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col animate-fade">
      <div className="flex shrink-0 items-center gap-2.5 px-4 pt-1.5">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="-ml-1.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-text hover:bg-surface focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChevronLeft width={20} height={20} strokeWidth={2.75} aria-hidden="true" />
        </button>
        <div
          className="h-[3px] flex-1 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuetext={progress.label}
        >
          <div
            className="h-[3px] rounded-full bg-accent transition-[width] duration-200"
            style={{ width: progress.width }}
          />
        </div>
        <span className="shrink-0 text-xs text-faint">{progress.label}</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-[22px] px-[30px] pb-[30px]">
        <div className="text-center">
          <h1 className="text-title-sm font-bold">
            {stage === 'intro'
              ? 'Set your reveal gesture'
              : stage === 'draw'
                ? 'Draw it once'
                : stage === 'confirm'
                  ? 'Now draw it again'
                  : stage === 'style'
                    ? 'How should protected text look?'
                    : 'You are set up'}
          </h1>
          <p className="mx-auto mt-2.5 max-w-[290px] text-[14.5px] leading-relaxed text-muted">
            {stage === 'intro'
              ? 'You will draw a shape to unlock any protected message. It stays on this device and is never sent anywhere.'
              : stage === 'draw'
                ? 'One continuous stroke. Something you will repeat the same way every time.'
                : stage === 'confirm'
                  ? 'Repeat the same shape so Vade knows it was deliberate.'
                  : stage === 'style'
                    ? 'Change it any time in Profile. Encryption is the same either way.'
                    : 'Tap any protected message and draw your gesture to read it.'}
          </p>
        </div>

        {(stage === 'draw' || stage === 'confirm') && (
          <>
            <GesturePad
              onStroke={stage === 'draw' ? handleDrawStroke : handleConfirmStroke}
              hasError={isError}
              size={280}
              label={
                stage === 'draw'
                  ? 'Draw your gesture in one continuous stroke.'
                  : 'Draw the same gesture again to confirm it.'
              }
            />
            <GesturePips total={2} completed={stage === 'confirm' ? 1 : 0} />
            <div
              role="status"
              className={`min-h-[20px] max-w-[290px] text-center text-row leading-snug ${
                isError ? 'text-warn' : 'text-muted'
              }`}
            >
              {feedback}
            </div>
          </>
        )}

        {stage === 'style' && (
          <div className="w-full">
            <ProtectionStylePicker value={mode} onChange={setMode} />
          </div>
        )}

        {stage === 'done' && (
          <>
            <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-accent-tint text-accent-ink">
              <Check width={38} height={38} strokeWidth={2.75} aria-hidden="true" />
            </div>
            <dl className="flex w-full flex-col gap-2.5 rounded-card bg-surface p-[16px_18px] text-[13.5px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Reveal gesture</dt>
                <dd className="font-bold">Saved on this device</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Protection style</dt>
                <dd className="font-bold">{styleLabel(mode)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Reveal window</dt>
                <dd className="font-bold">
                  {REVEAL_STROKE_COUNT} strokes · {Math.round(DEFAULT_REVEAL_DURATION_MS / 1000)}{' '}
                  seconds
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 px-[30px] pb-[26px]">
        {stage === 'intro' && (
          <VadeButton
            block
            onClick={() => {
              setStage('draw');
              resetFeedback();
            }}
          >
            Draw my gesture
          </VadeButton>
        )}

        {stage === 'style' && (
          <VadeButton block onClick={() => setStage('done')}>
            Continue
          </VadeButton>
        )}

        {stage === 'done' && (
          <VadeButton block onClick={() => navigate(completeHref)}>
            Start messaging
          </VadeButton>
        )}

        {stage === 'confirm' && (
          <button
            type="button"
            onClick={() => {
              setFirstStroke(null);
              setAttempts(0);
              resetFeedback();
              setStage('draw');
            }}
            className="cursor-pointer self-center px-2.5 py-1 text-sm text-muted hover:text-text focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Start over
          </button>
        )}
      </div>
    </div>
  );
};
