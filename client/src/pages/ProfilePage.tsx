import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserProfile } from '@enctxt/shared';
import { useAuth } from '../auth/AuthContext';
import { userService } from '../services/userService';
import { ApiClientError } from '../services/api';
import { useProtectionStyle } from '../hooks/useProtectionStyle';
import { useGesture } from '../hooks/useGesture';
import { THEME_LABELS, useTheme } from '../theme/ThemeProvider';
import { DEFAULT_REVEAL_DURATION_MS } from '../hooks/useMessageReveal';
import { REVEAL_STROKE_COUNT } from '../components/gesture/GestureRevealModal';
import { Avatar } from '../components/vade/Chrome';
import { SettingsGroup, SettingsRow } from '../components/vade/SettingsGroup';
import { ActionSheet } from '../components/vade/ActionSheet';
import { ConfirmDialog, type ConfirmRequest } from '../components/vade/ConfirmDialog';
import { ProtectionStylePicker, styleLabel } from '../components/vade/ProtectionStylePicker';
import { VadeButton } from '../components/vade/VadeButton';
import { VadeField } from '../components/vade/VadeField';
import { useToast } from '../components/ui/Toast';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

const REVEAL_SECONDS = Math.round(DEFAULT_REVEAL_DURATION_MS / 1000);

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, setUser } = useAuth();
  const { success, error: toastError } = useToast();
  const { preference, cyclePreference } = useTheme();
  const { mode, setMode } = useProtectionStyle();
  const { isConfigured: isGestureConfigured } = useGesture();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isStyleSheetOpen, setIsStyleSheetOpen] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    let isMounted = true;
    userService
      .getProfile()
      .then((data) => {
        if (!isMounted) return;
        setProfile(data);
        setDisplayName(data.displayName);
      })
      .catch(() => {
        if (isMounted) toastError('Could not load your profile.');
      });
    return () => {
      isMounted = false;
    };
  }, [toastError]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) return;

    setIsSaving(true);
    try {
      const updated = await userService.updateProfile({ displayName: trimmed });
      setProfile(updated);
      setUser({ id: updated.id, username: updated.username, displayName: updated.displayName });
      setIsEditing(false);
      success('Profile updated.');
    } catch (error) {
      toastError(error instanceof ApiClientError ? error.message : 'Could not update your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const name = profile?.displayName ?? user?.displayName ?? '';
  const username = profile?.username ?? user?.username ?? '';

  return (
    <ErrorBoundary fallbackTitle="Profile unavailable">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="px-[22px] pb-[18px] pt-3.5">
          <h1 className="text-title font-bold">Profile</h1>
        </div>

        <div className="flex flex-col gap-section px-[22px] pb-28 lg:max-w-xl">
          {isEditing ? (
            <form onSubmit={saveProfile} className="flex flex-col gap-3">
              <VadeField
                label="Display name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={isSaving}
                required
              />
              <div className="flex gap-2.5">
                <VadeButton type="submit" size="sm" isLoading={isSaving}>
                  Save
                </VadeButton>
                <VadeButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => {
                    setDisplayName(name);
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </VadeButton>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-3.5">
              <Avatar name={name} size={56} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[17px] font-bold tracking-[-0.014em]">{name}</div>
                <div className="truncate text-[13.5px] text-muted">@{username}</div>
              </div>
              <VadeButton variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                Edit
              </VadeButton>
            </div>
          )}

          <SettingsGroup label="Privacy &amp; security">
            <SettingsRow
              label="Protection style"
              value={styleLabel(mode)}
              onClick={() => setIsStyleSheetOpen(true)}
            />
            <SettingsRow
              label="Gesture reveal"
              value={
                isGestureConfigured
                  ? `${REVEAL_STROKE_COUNT} strokes · ${REVEAL_SECONDS}s`
                  : 'Not set up'
              }
              onClick={() => navigate('/app/profile/gesture')}
            />
            <SettingsRow label="Devices" onClick={() => navigate('/app/profile/devices')} />
          </SettingsGroup>

          <SettingsGroup label="Appearance">
            <SettingsRow
              label="Theme"
              value={THEME_LABELS[preference]}
              onClick={cyclePreference}
              chevron={false}
            />
          </SettingsGroup>

          <SettingsGroup label="About">
            <SettingsRow label="Version" value="1.0.0" />
            <SettingsRow
              label="Protocol"
              value="v1 · ECDH P-256 · AES-256-GCM"
            />
          </SettingsGroup>

          <button
            type="button"
            onClick={() =>
              setConfirmRequest({
                title: 'Sign out?',
                body: 'Your keys and gesture stay on this device. You will need your password to sign back in.',
                cta: 'Sign out',
                onConfirm: () => {
                  void logout();
                  navigate('/');
                },
              })
            }
            className="self-start cursor-pointer p-0.5 text-[14.5px] text-muted hover:text-text focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Sign out
          </button>
        </div>
      </div>

      <ActionSheet
        isOpen={isStyleSheetOpen}
        onClose={() => setIsStyleSheetOpen(false)}
        title="Protection style"
        description="How protected messages look on this device. Encryption is unchanged either way, and this choice is never sent anywhere."
      >
        <ProtectionStylePicker
          value={mode}
          onChange={(next) => {
            setMode(next);
            setIsStyleSheetOpen(false);
          }}
        />
      </ActionSheet>

      <ConfirmDialog request={confirmRequest} onCancel={() => setConfirmRequest(null)} />
    </ErrorBoundary>
  );
};
