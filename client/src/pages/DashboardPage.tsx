import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { userService } from '../services/userService';
import { conversationService } from '../services/conversationService';
import type { UserProfile, UserSummary, SingleConversationItem } from '@enctxt/shared';
import { ApiClientError } from '../services/api';
import { GestureSettings } from '../components/gesture/GestureSettings';
import { DeviceManagement } from '../components/security/DeviceManagement';
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
  MessageSquare,
  ArrowRight,
  MessagesSquare,
  UserPlus,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();

  // Tab State: 'conversations' | 'search' | 'profile'
  const [activeTab, setActiveTab] = useState<'conversations' | 'search' | 'profile'>('conversations');

  // Profile State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // Conversations State
  const [conversations, setConversations] = useState<SingleConversationItem[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState<string | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [startChatLoadingId, setStartChatLoadingId] = useState<string | null>(null);

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

  // Fetch user conversations
  const fetchConversations = useCallback(async () => {
    setConvLoading(true);
    setConvError(null);
    try {
      const data = await conversationService.listConversations();
      setConversations(data.conversations);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setConvError(err.message);
      } else {
        setConvError('Failed to load conversations.');
      }
    } finally {
      setConvLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchConversations();
  }, [fetchProfile, fetchConversations]);

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

  // Start / Open 1-to-1 conversation and navigate
  const handleStartChat = async (targetUser: UserSummary) => {
    setStartChatLoadingId(targetUser.id);
    try {
      const res = await conversationService.createOrGetConversation({
        userId: targetUser.id,
      });
      navigate(`/app/conversations/${res.conversation.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSearchError(err.message);
      } else {
        setSearchError('Could not start conversation.');
      }
    } finally {
      setStartChatLoadingId(null);
    }
  };

  return (
    <div className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Shield className="w-3 h-3" />
            <span>Phase 3 — 1-to-1 Conversations</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
            Welcome, {user?.displayName || user?.username}
          </h1>
          <p className="text-xs text-slate-400 font-mono">@{user?.username}</p>
        </div>

        {/* Action Controls & Navigation Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('conversations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'conversations'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chats ({conversations.length})
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'search'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              Find Users
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Profile
            </button>
          </div>

          <button
            onClick={() => logout()}
            className="p-2 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-700/50 rounded-xl text-xs transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Conversations Tab */}
      {activeTab === 'conversations' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <MessagesSquare className="w-4 h-4 text-emerald-400" />
              Chats
            </h2>
            <button
              onClick={() => setActiveTab('search')}
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Start New Chat</span>
            </button>
          </div>

          {convLoading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-2">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
              <p className="text-xs text-slate-400 font-mono">Loading conversations...</p>
            </div>
          ) : convError ? (
            <div className="p-4 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300">
              {convError}
            </div>
          ) : conversations.length === 0 ? (
            /* Section 29: Intentional Empty State */
            <div className="py-16 flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-200">No conversations yet.</p>
                <p className="text-xs text-slate-400 max-w-sm">
                  Search for someone to start a private conversation.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('search')}
                className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition-colors shadow flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search Users</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/app/conversations/${c.id}`)}
                  className="w-full p-4 bg-slate-950/40 hover:bg-slate-800/50 transition-colors flex items-center justify-between cursor-pointer text-left group"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-emerald-400">
                      {c.participant.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-100 group-hover:text-emerald-300 transition-colors">
                        {c.participant.displayName}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">@{c.participant.username}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-400" />
              User Discovery & Start Conversation
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Search registered users by username to start a 1-to-1 conversation.
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search username or display name..."
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

          {/* Search Results */}
          <div className="space-y-2">
            {searchResults.length > 0 ? (
              <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden">
                {searchResults.map((u) => (
                  <div
                    key={u.id}
                    className="p-3.5 bg-slate-950/50 flex items-center justify-between hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400">
                        {u.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-100">{u.displayName}</p>
                        <p className="text-[11px] text-slate-400 font-mono">@{u.username}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleStartChat(u)}
                      disabled={startChatLoadingId === u.id}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow"
                    >
                      {startChatLoadingId === u.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <MessageSquare className="w-3.5 h-3.5" />
                      )}
                      <span>Start Chat</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : hasSearched ? (
              <div className="text-center py-8 text-xs text-slate-500">
                No users found matching &quot;{searchQuery}&quot;
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-slate-600">
                Search for someone by username to start a conversation
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-400" />
              User Profile
            </h2>
            {!isEditing && (
              <button
                onClick={() => {
                  setIsEditing(true);
                  setEditSuccess(null);
                  setEditError(null);
                }}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors text-xs flex items-center gap-1.5 cursor-pointer"
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
                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {editLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={editLoading}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
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

          {/* Local Device Privacy & Reveal Gesture Settings */}
          <div className="pt-2 space-y-4">
            <GestureSettings />
            <DeviceManagement />
          </div>
        </div>
      )}
    </div>
  );
};
