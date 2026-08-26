import React from 'react';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { ShieldCheck, Lock, EyeOff } from 'lucide-react';
import { Link } from 'react-router-dom';

export const LandingPage: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12">
      <div className="max-w-3xl w-full text-center space-y-8">
        {/* Hero Section */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Phase 1 — Project Foundation</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-100">
            Private Chat
          </h1>

          <p className="text-xl sm:text-2xl text-slate-400 font-light max-w-xl mx-auto">
            Welcome
          </p>

          <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
            A privacy-focused text communication platform designed with visual protection, 
            gesture-based reveal, and end-to-end security architecture.
          </p>
        </div>

        {/* Feature Cards (Foundation Preview) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto text-left">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-slate-800 text-slate-300">
              <Lock className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Layer 1: Security
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Cryptographic security and secure client-server communication channels.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-slate-800 text-slate-300">
              <EyeOff className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Layer 2: Visual Privacy
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Protected display and gesture-based temporary plaintext reveal.
              </p>
            </div>
          </div>
        </div>

        {/* Live System Connectivity Panel */}
        <div className="flex flex-col items-center pt-2">
          <ConnectionStatus detailed={true} />
        </div>

        {/* Quick Links */}
        <div className="flex items-center justify-center gap-4 pt-2">
          <Link
            to="/login"
            className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium transition-colors border border-slate-700"
          >
            Sign In Placeholder
          </Link>
          <Link
            to="/register"
            className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-lg shadow-emerald-950"
          >
            Get Started Placeholder
          </Link>
        </div>
      </div>
    </div>
  );
};
