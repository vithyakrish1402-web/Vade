import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { DeviceListResponse, DeviceRecord } from '@enctxt/shared';
import { Laptop, Smartphone, Globe, ShieldAlert, Loader2, Check, AlertCircle, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

export const DeviceManagement: React.FC = () => {
  const { success, error: toastError } = useToast();
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeDevice, setConfirmRevokeDevice] = useState<DeviceRecord | null>(null);

  const fetchDevices = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<DeviceListResponse>('/devices');
      setDevices(res.devices || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load devices.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleConfirmRevoke = async () => {
    if (!confirmRevokeDevice) return;

    const deviceId = confirmRevokeDevice.id;
    setRevokingId(deviceId);
    try {
      await api.post(`/devices/${deviceId}/revoke`, {});
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, status: 'revoked' } : d))
      );
      setConfirmRevokeDevice(null);
      success('Device revoked successfully.');
    } catch (err: any) {
      toastError(err.message || 'Failed to revoke device.');
    } finally {
      setRevokingId(null);
    }
  };

  const getDeviceIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('android') || p.includes('ios') || p.includes('mobile')) {
      return <Smartphone className="w-5 h-5 text-emerald-400" aria-hidden="true" />;
    }
    if (p.includes('mac') || p.includes('windows') || p.includes('linux')) {
      return <Laptop className="w-5 h-5 text-emerald-400" aria-hidden="true" />;
    }
    return <Globe className="w-5 h-5 text-emerald-400" aria-hidden="true" />;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
      <div>
        <h3 className="text-sm font-bold text-slate-100">Registered Devices & Sessions</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Manage devices authorized for your end-to-end encrypted identity.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400 font-mono">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-500" aria-hidden="true" />
          <span>Loading devices...</span>
        </div>
      ) : devices.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">
          No registered devices found.
        </div>
      ) : (
        <div className="space-y-2.5">
          {devices.map((device, idx) => (
            <div
              key={device.id}
              className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                device.status === 'revoked'
                  ? 'bg-slate-950/40 border-slate-850 opacity-60'
                  : 'bg-slate-950/80 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
                  {getDeviceIcon(device.platform)}
                </div>

                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {device.deviceName}
                    </span>
                    {idx === 0 && device.status === 'active' && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <Check className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>This Device</span>
                      </span>
                    )}
                    {device.status === 'revoked' && (
                      <span className="text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                        Revoked
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-500 font-mono truncate">
                    Key: {device.keyId.substring(0, 14)}... • Last seen:{' '}
                    {new Date(device.lastSeenAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {device.status === 'active' && idx !== 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmRevokeDevice(device)}
                  className="text-rose-400 hover:text-rose-300 hover:border-rose-700/50"
                  leftIcon={<ShieldAlert className="w-3.5 h-3.5" />}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Accessible Revoke Confirmation Modal */}
      <Modal
        isOpen={Boolean(confirmRevokeDevice)}
        onClose={() => setConfirmRevokeDevice(null)}
        title="Revoke Device?"
        description="This device will lose access to your account and end-to-end encrypted messaging."
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <div className="p-3 bg-rose-950/30 border border-rose-800/40 rounded-xl text-xs text-rose-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" aria-hidden="true" />
            <p>
              Revoking <strong>{confirmRevokeDevice?.deviceName}</strong> cannot be undone. You will need to sign in again to register a new session.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmRevokeDevice(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={Boolean(revokingId)}
              onClick={handleConfirmRevoke}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Confirm Revocation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
