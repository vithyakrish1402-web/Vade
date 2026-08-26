import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { userService } from '../services/userService';
import type { UserProfile, UserSummary } from '@enctxt/shared';
import { ApiClientError } from '../services/api';
import {
  User,
  Search,
  LogOut,
  Shield,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Calendar,
  Mail,
  UserCheck,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, logout, setUser } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Fetch full profile
  const fetchProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const data = await userService.getProfile();
      setProfile(data);
      setEditDisplayName(data.displayName);
      setEditUsername(data.username);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setProfileError(err.message);
      } else {
        setProfileError('Failed to load profile.');
      }
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Handle Profile Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditLoading(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      const updated = await userService.updateProfile({
        displayName: editDisplayName.trim() || undefined,
        username: editUsername.trim() || undefined,
      });

      setProfile(updated);
      setUser({
        id: updated.id,
        username: updated.username,
        displayName: updated.displayName,
      });
      setEditSuccess('Profile updated successfully!');
      setIsEditing(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditError(err.message);
      } else {
        setEditError('Failed to update profile.');
      }
    } finally {
      setEditLoading(false);
    }
  };

  // Handle Search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const res = await userService.searchUsers(searchQuery.trim());
      setSearchResults(res.users);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSearchError(err.message);
      } else {
        setSearchError('Search failed.');
      }
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Shield className="w-3 h-3" />
            <span>Authenticated Session Active</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">
            Welcome, {user?.displayName || user?.username}
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            Username: @{user?.username} &bull; ID: {user?.id}
          </p>
        </div>

        <button
          onClick={() => logout()}
          className="self-start sm:self-center px-4 py-2 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-700/50 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer shadow"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Log Out</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: User Profile (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                User Identity & Profile
              </h2>
              {!isEditing && (
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setEditSuccess(null);
                    setEditError(null);
                  }}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors text-xs flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}
            </div>

            {profileLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              </div>
            ) : profileError ? (
              <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300">
                {profileError}
              </div>
            ) : isEditing ? (
              /* Profile Edit Form */
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                {editError && (
                  <div className="p-2.5 bg-rose-950/40 border border-rose-800/50 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    disabled={editLoading}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    disabled={editLoading}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={editLoading}
                    className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {editLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    disabled={editLoading}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              /* Profile Details View */
              <div className="space-y-3.5">
                {editSuccess && (
                  <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/50 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span>{editSuccess}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <span className="text-[11px] uppercase font-mono text-slate-500">Display Name</span>
                  <p className="text-sm font-semibold text-slate-100">{profile?.displayName}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] uppercase font-mono text-slate-500">Username</span>
                  <p className="text-sm text-emerald-400 font-mono">@{profile?.username}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] uppercase font-mono text-slate-500 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-slate-500" /> Email Address
                  </span>
                  <p className="text-xs text-slate-300">{profile?.email}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] uppercase font-mono text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-500" /> Member Since
                  </span>
                  <p className="text-xs text-slate-400">
                    {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: User Search & Phase 3 Outlook (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* User Search Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-5">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-400" />
                User Discovery & Search
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Find other registered users by username or display name.
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by username or name..."
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
              <button
                type="submit"
                disabled={searchLoading || !searchQuery.trim()}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow"
              >
                {searchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
              </button>
            </form>

            {searchError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300">
                {searchError}
              </div>
            )}

            {/* Results List */}
            <div className="space-y-2">
              {searchResults.length > 0 ? (
                <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden">
                  {searchResults.map((u) => (
                    <div
                      key={u.id}
                      className="p-3 bg-slate-950/50 flex items-center justify-between hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400">
                          {u.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-100">{u.displayName}</p>
                          <p className="text-[11px] text-slate-400 font-mono">@{u.username}</p>
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                        <UserCheck className="w-3 h-3 text-emerald-400" />
                        <span>Registered</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : hasSearched ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  No users found matching &quot;{searchQuery}&quot;
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-slate-600">
                  Enter a username above to search registered members
                </div>
              )}
            </div>
          </div>

          {/* Phase Boundary Preview */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2 text-xs text-slate-400">
            <h3 className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
              Next Phase Preview: Phase 3 — Conversation Architecture
            </h3>
            <p>
              With user identity established, Phase 3 will introduce direct and group conversation models,
              device keys, and cryptographic message exchange channels.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
