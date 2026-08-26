import React from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl text-center space-y-6">
        <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-emerald-400">
          <KeyRound className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-100">Sign In</h2>
          <p className="text-xs text-slate-400">
            Authentication infrastructure placeholder
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-left space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
            <ShieldAlert className="w-4 h-4" />
            <span>Phase 1 Architecture Boundary</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            User authentication, session tokens, and cryptographic identity generation are scheduled for <strong className="text-slate-200">Phase 2 — Authentication & User Identity</strong>.
          </p>
        </div>

        <div className="pt-2">
          <Link
            to="/"
            className="inline-block text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            ← Back to Landing Page
          </Link>
        </div>
      </div>
    </div>
  );
};
