import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, MessageSquare, KeyRound, UserPlus, LayoutDashboard, LogOut, User } from 'lucide-react';
import { ConnectionStatus } from './ConnectionStatus';
import { useAuth } from '../auth/AuthContext';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 text-slate-100 hover:text-emerald-400 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold tracking-tight text-base leading-none">Private Chat</span>
            <span className="text-[10px] uppercase font-mono text-emerald-500 tracking-wider">enctxt</span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              isActive('/')
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Home
          </Link>

          {isAuthenticated ? (
            <>
              <Link
                to="/app"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isActive('/app')
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </Link>

              <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block"></div>

              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono">
                <User className="w-3 h-3 text-emerald-400" />
                <span>@{user?.username}</span>
              </div>

              <button
                onClick={() => logout()}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors flex items-center gap-1 cursor-pointer"
                title="Log Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isActive('/login')
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Sign In
              </Link>

              <Link
                to="/register"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isActive('/register')
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Register
              </Link>
            </>
          )}
        </nav>

        {/* Connection status */}
        <div className="hidden sm:flex items-center">
          <ConnectionStatus />
        </div>
      </div>
    </header>
  );
};
