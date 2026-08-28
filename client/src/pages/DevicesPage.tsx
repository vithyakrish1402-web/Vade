import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Monitor, Smartphone, Tablet } from 'lucide-react';
import type { DeviceListResponse, DeviceRecord } from '@enctxt/shared';
import { api } from '../services/api';
import { BackHeader } from '../components/vade/Chrome';
import { VadeButton } from '../components/vade/VadeButton';
import { ConfirmDialog, type ConfirmRequest } from '../components/vade/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { formatConversationTime } from '../utils/dateUtils';

function deviceIcon(platform: string) {
  const value = platform.toLowerCase();
  if (value.includes('tablet') || value.includes('ipad')) {
    return <Tablet width={19} height={19} strokeWidth={2.75} aria-hidden="true" />;
  }
  if (value.includes('android') || value.includes('ios') || value.includes('mobile')) {
    return <Smartphone width={19} height={19} strokeWidth={2.75} aria-hidden="true" />;
  }
  return <Monitor width={19} height={19} strokeWidth={2.75} aria-hidden="true" />;
}

/**
 * Your devices.
 *
 * Rows carry safe metadata only — what the device is and when it was last active. Key ids,
 * gesture data and message content deliberately do not appear here: this screen is often the
 * one shown to someone else while explaining the app.
 */
export const DevicesPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const fetchDevices = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await api.get<DeviceListResponse>('/devices');
      setDevices(response.devices ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load your devices.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  const revoke = async (device: DeviceRecord) => {
    setRevokingId(device.id);
    try {
      await api.post(`/devices/${device.id}/revoke`, {});
      setDevices((previous) =>
        previous.map((item) => (item.id === device.id ? { ...item, status: 'revoked' } : item))
      );
      success('Device revoked.');
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Could not revoke that device.');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <ErrorBoundary fallbackTitle="Devices unavailable">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <BackHeader onBack={() => navigate('/app/profile')} title="Your devices" backLabel="Back to profile" />

        <div className="flex flex-col gap-3.5 px-[22px] pb-28 pt-3 lg:max-w-xl">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading devices" />
            </div>
          ) : loadError ? (
            <div role="alert" className="rounded-card bg-warn-tint p-4 text-center">
              <p className="text-row text-warn">{loadError}</p>
              <VadeButton variant="outline" size="sm" className="mt-3" onClick={fetchDevices}>
                Try again
              </VadeButton>
            </div>
          ) : (
            devices.map((device, index) => {
              const isCurrent = index === 0 && device.status === 'active';
              const isRevoked = device.status === 'revoked';

              return (
                <div
                  key={device.id}
                  className={`flex items-center gap-3.5 rounded-card bg-surface p-[16px_18px] ${
                    isRevoked ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-text">
                    {deviceIcon(device.platform)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-[7px]">
                      <span className="truncate text-[15px] font-bold tracking-[-0.012em]">
                        {device.deviceName}
                      </span>
                      {isCurrent && (
                        <span className="flex h-5 shrink-0 items-center rounded-full bg-accent-tint px-2 text-[11px] font-bold text-accent-ink">
                          This device
                        </span>
                      )}
                    </div>
                    <div className="mt-px truncate text-row text-muted">
                      {isRevoked
                        ? 'Revoked'
                        : `${device.platform} · ${
                            isCurrent ? 'Active now' : `Last active ${formatConversationTime(device.lastSeenAt)}`
                          }`}
                    </div>
                  </div>

                  {/* The device you are using is never revocable — that path is signing out. */}
                  {!isRevoked && !isCurrent && (
                    <VadeButton
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 px-[13px] text-row"
                      isLoading={revokingId === device.id}
                      onClick={() =>
                        setConfirmRequest({
                          title: 'Revoke this device?',
                          body: `${device.deviceName} will lose access to your account and your encrypted messages. This cannot be undone.`,
                          cta: 'Revoke',
                          onConfirm: () => void revoke(device),
                        })
                      }
                    >
                      Revoke
                    </VadeButton>
                  )}
                </div>
              );
            })
          )}

          <p className="mt-1.5 px-0.5 text-[12.5px] leading-relaxed text-muted">
            Vade shows only what a device is and when it was last active. Keys, gestures and
            message content never appear here.
          </p>
        </div>
      </div>

      <ConfirmDialog request={confirmRequest} onCancel={() => setConfirmRequest(null)} />
    </ErrorBoundary>
  );
};
