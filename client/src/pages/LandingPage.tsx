import React from 'react';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { ShieldCheck, Lock, EyeOff, Sparkles, ArrowRight, ShieldAlert, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';

export const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12">
      <div className="max-w-3xl w-full text-center space-y-10">
        {/* Hero Section */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Phase 9 — Production UX & Application Polish</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-100">
            Private Chat
          </h1>

          <p className="text-lg sm:text-xl text-slate-300 font-light max-w-xl mx-auto leading-relaxed">
            Messages are encrypted end-to-end and protected from casual screen viewing.
          </p>

          <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            Your conversations stay visually protected on screen until you intentionally reveal them using your custom gesture sequence.
          </p>
        </div>

        {/* 3 Main Privacy Layers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          {/* Layer 1: E2EE */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Lock className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                1. End-to-End Encryption
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Keys are negotiated locally via ECDH-P256 and messages are encrypted with AES-256-GCM. The server never reads your messages.
              </p>
            </div>
          </div>

          {/* Layer 2: Protected Rendering */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <EyeOff className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                2. Protected Rendering
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Messages are visually obscured on screen to prevent shoulder surfing in public spaces and workspaces.
              </p>
            </div>
          </div>

          {/* Layer 3: Gesture Reveal */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                3. Gesture Reveal
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Draw your secret multi-step gesture to temporarily reveal plaintext. Messages automatically re-protect after 8 seconds or on window blur.
              </p>
            </div>
          </div>
        </div>

        {/* Honest Security Disclaimer */}
        <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-850 text-left max-w-xl mx-auto flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[11px] text-slate-500 leading-relaxed">
            <strong>Security Boundary:</strong> Visual screen protection reduces casual shoulder-surfing risk. No client-side system can protect against an untrusted device, malware, hardware keyloggers, or physical recording.
          </p>
        </div>

        {/* Live Connectivity */}
        <div className="flex flex-col items-center">
          <ConnectionStatus detailed={true} />
        </div>

        {/* CTA Buttons */}
        <div className="flex items-center justify-center gap-3 pt-2">
          {isAuthenticated ? (
            <Link to="/app">
              <Button variant="primary" size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Go to Workspace
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button variant="secondary" size="md" leftIcon={<KeyRound className="w-4 h-4" />}>
                  Sign In
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
