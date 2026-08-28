import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGesture } from '../hooks/useGesture';
import { DEFAULT_REVEAL_DURATION_MS } from '../hooks/useMessageReveal';
import { REVEAL_STROKE_COUNT } from '../components/gesture/GestureRevealModal';
import { BackHeader } from '../components/vade/Chrome';
import { SettingsGroup, SettingsRow } from '../components/vade/SettingsGroup';
import { VadeButton } from '../components/vade/VadeButton';
import { ConfirmDialog, type ConfirmRequest } from '../components/vade/ConfirmDialog';
import { GestureEnrollmentPage } from './GestureEnrollmentPage';
import { useToast } from '../components/ui/Toast';

/**
 * Gesture reveal settings.
 *
 * Re-enrolling runs the same four-step flow as sign-up rather than a shortened "change gesture"
 * path — the confirmation step is what makes an enrolled shape reproducible, and it should not
 * be skippable just because one already exists.
 */
export const GestureSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isConfigured, deleteSequence } = useGesture();
  const { success } = useToast();

  const [isEnrolling, setIsEnrolling] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  if (isEnrolling) {
    return <GestureEnrollmentPage completeHref="/app/profile/gesture" exitHref="/app/profile/gesture" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <BackHeader
        onBack={() => navigate('/app/profile')}
        title="Gesture reveal"
        backLabel="Back to profile"
      />

      <div className="flex flex-col gap-section px-[22px] pb-28 pt-3 lg:max-w-xl">
        <SettingsGroup>
          <SettingsRow label="Status" value={isConfigured ? 'Set up' : 'Not set up'} />
          <SettingsRow label="Strokes to reveal" value={REVEAL_STROKE_COUNT} />
          <SettingsRow
            label="Reveal window"
            value={`${Math.round(DEFAULT_REVEAL_DURATION_MS / 1000)} seconds`}
          />
        </SettingsGroup>

        <p className="px-0.5 text-[12.5px] leading-relaxed text-muted">
          Your gesture is stored on this device only and is never sent to the server. It is kept
          as a normalised template, not as the strokes you drew.
        </p>

        <div className="flex flex-col gap-2.5">
          <VadeButton size="md" block onClick={() => setIsEnrolling(true)}>
            {isConfigured ? 'Change gesture' : 'Set up gesture'}
          </VadeButton>

          {isConfigured && (
            <VadeButton
              variant="outline"
              size="md"
              block
              onClick={() =>
                setConfirmRequest({
                  title: 'Delete your gesture?',
                  body: 'Without a gesture you will not be able to reveal protected messages on this device until you set a new one.',
                  cta: 'Delete',
                  onConfirm: () => {
                    deleteSequence();
                    success('Gesture deleted.');
                  },
                })
              }
            >
              Delete gesture
            </VadeButton>
          )}
        </div>
      </div>

      <ConfirmDialog request={confirmRequest} onCancel={() => setConfirmRequest(null)} />
    </div>
  );
};
