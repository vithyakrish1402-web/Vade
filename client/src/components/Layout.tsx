import React, { useMemo } from 'react';
import { Navbar } from './Navbar';
import { ToastProvider } from './ui/Toast';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { checkBrowserCapabilities } from '../utils/browserCapabilities';
import { AlertCircle, Shield } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const browserCaps = useMemo(() => checkBrowserCapabilities(), []);

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-black">
        {/* Browser Security Compatibility Warning */}
        {!browserCaps.isSupported && (
          <div
            role="alert"
            className="px-4 py-3 bg-amber-950/90 border-b border-amber-600/50 text-amber-200 text-xs flex items-center justify-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <span>
              <strong>Unsupported Browser:</strong> {browserCaps.errorMessage}
            </span>
          </div>
        )}

        <Navbar />

        <main className="flex-1 flex flex-col">
          <ErrorBoundary fallbackTitle="Application Error" fallbackMessage="An error occurred while loading this view.">
            {children}
          </ErrorBoundary>
        </main>

        <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500 bg-slate-950/60">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
              <span>Private Chat (enctxt) — Phase 9: Production UX & Application Polish</span>
            </div>
            <span className="font-mono text-[11px] text-slate-600">Privacy, Integrity & Accessibility First</span>
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
};
