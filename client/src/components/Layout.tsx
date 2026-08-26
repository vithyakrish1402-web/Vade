import React from 'react';
import { Navbar } from './Navbar';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-black">
      <Navbar />
      <main className="flex-1 flex flex-col">{children}</main>
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Private Chat (enctxt) — Phase 1: Project Foundation</span>
          <span className="font-mono text-[11px] text-slate-600">Privacy & Security First</span>
        </div>
      </footer>
    </div>
  );
};
