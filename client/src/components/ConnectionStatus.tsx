import React from 'react';
import { useHealthCheck } from '../hooks/useHealthCheck';
import { RefreshCw, CheckCircle2, AlertCircle, Database } from 'lucide-react';

interface ConnectionStatusProps {
  detailed?: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ detailed = false }) => {
  const { data, isLoading, error, isConnected, checkHealth } = useHealthCheck(10000);

  if (detailed) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            System Connectivity
          </h3>
          <button
            onClick={() => checkHealth()}
            disabled={isLoading}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="space-y-3">
          {/* API Health */}
          <div className="flex items-center justify-between py-2 border-b border-slate-800/80">
            <span className="text-sm text-slate-300">Backend API</span>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Backend: Connected ✓
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle className="w-3.5 h-3.5" />
                Disconnected ✗
              </span>
            )}
          </div>

          {/* Database Health */}
          <div className="flex items-center justify-between py-2 border-b border-slate-800/80">
            <span className="text-sm text-slate-300 flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-slate-400" />
              PostgreSQL
            </span>
            {data?.database === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Connected
              </span>
            ) : data?.database === 'unreachable' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertCircle className="w-3.5 h-3.5" />
                Unreachable
              </span>
            ) : (
              <span className="text-xs text-slate-500">Unknown</span>
            )}
          </div>

          {/* Uptime / Version */}
          {data && (
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>Uptime: {data.uptime ?? 0}s</span>
              <span>v{data.version || '0.1.0'}</span>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="mt-2 p-2.5 bg-rose-950/40 border border-rose-800/50 rounded-lg text-xs text-rose-300">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Compact badge
  return (
    <div className="inline-flex items-center gap-2 text-xs">
      {isConnected ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          Backend: Connected ✓
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
          Backend: Offline
        </span>
      )}
    </div>
  );
};
