import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { DeviceListResponse, DeviceRecord } from '@enctxt/shared';
import { Laptop, Smartphone, Globe, ShieldAlert, Loader2, Check, AlertCircle } from 'lucide-react';

export const DeviceManagement: React.FC = () => {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

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

  const handleRevoke = async (deviceId: string) => {
    if (!window.confirm('Are you sure you want to revoke this device? It will no longer be authorized for encrypted communication.')) {
      return;
    }

    setRevokingId(deviceId);
    try {
      await api.post(`/devices/${deviceId}/revoke`, {});
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, status: 'revoked' } : d))
      );
    } catch (err: any) {
      alert(err.message || 'Failed to revoke device.');
    } finally {
      setRevokingId(null);
    }
  };

  const getDeviceIcon = (platform: string) => {
    if (platform.toLowerCase().includes('android') || platform.toLowerCase().includes('ios') || platform.toLowerCase().includes('mobile')) {
      return <Smartphone className="w-5 h-5 text-emerald-400" />;
    }
    if (platform.toLowerCase().includes('mac') || platform.toLowerCase().includes('windows') || platform.toLowerCase().includes('linux')) {
      return <Laptop className="w-5 h-5 text-emerald-400" />;
    }
    return <Globe className="w-5 h-5 text-emerald-400" />;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-100">Registered Devices & Sessions</h3>
          <p className="text-xs text-slate-400">
            Manage devices authorized for your end-to-end encrypted identity.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400 font-mono">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
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
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                device.status === 'revoked'
                  ? 'bg-slate-950/40 border-slate-850 opacity-60'
                  : 'bg-slate-950/80 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                  {getDeviceIcon(device.platform)}
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-200">
                      {device.deviceName}
                    </span>
                    {idx === 0 && device.status === 'active' && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <Check className="w-2.5 h-2.5" />
                        <span>This Device</span>
                      </span>
                    )}
                    {device.status === 'revoked' && (
                      <span className="text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                        Revoked
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-500 font-mono">
                    Key: {device.keyId.substring(0, 14)}... • Last seen: {new Date(device.lastSeenAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {device.status === 'active' && idx !== 0 && (
                <button
                  type="button"
                  onClick={() => handleRevoke(device.id)}
                  disabled={revokingId === device.id}
                  className="px-3 py-1 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/30 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                >
                  {revokingId === device.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ShieldAlert className="w-3 h-3" />
                  )}
                  <span>Revoke</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
