import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { userService } from '../services/userService';
import { conversationService } from '../services/conversationService';
import type { UserProfile, UserSummary, ConversationSummary } from '@enctxt/shared';
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
  MessageSquare,
  Lock,
  Plus,
  MessagesSquare,
  ShieldAlert,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, logout, setUser } = useAuth();

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
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<ConversationSummary | null>(null);
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
      if (data.conversations.length > 0 && !selectedConv) {
        setSelectedConv(data.conversations[0]);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setConvError(err.message);
      } else {
        setConvError('Failed to load conversations.');
      }
    } finally {
      setConvLoading(false);
    }
  }, [selectedConv]);

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

  // Start / Open 1-to-1 conversation
  const handleStartChat = async (targetUser: UserSummary) => {
    setStartChatLoadingId(targetUser.id);
    try {
      const conv = await conversationService.createDirectConversation({
        recipientId: targetUser.id,
      });

      // Update conversations list
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conv.id);
        if (exists) return prev;
        return [conv, ...prev];
      });

      setSelectedConv(conv);
      setActiveTab('conversations');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSearchError(err.message);
      } else {
        setSearchError('Could not create conversation.');
      }
    } finally {
      setStartChatLoadingId(null);
    }
  };

  return (
    <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">
      {/* Top Header Bar */}
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
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

      {/* Main Workspace Layout */}
      {activeTab === 'conversations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[550px]">
          {/* Left Panel: Conversation List (4 cols) */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <MessagesSquare className="w-4 h-4 text-emerald-400" />
                Conversations
              </h2>
              <button
                onClick={() => setActiveTab('search')}
                className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>New Chat</span>
              </button>
            </div>

            {convLoading ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              </div>
            ) : convError ? (
              <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300">
                {convError}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-300">No conversations yet</p>
                  <p className="text-[11px] text-slate-500">
                    Search for users to establish a 1-to-1 conversation.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('search')}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition-colors shadow"
                >
                  Find Users
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
                {conversations.map((c) => {
                  const partner = c.otherParticipant;
                  const isSelected = selectedConv?.id === c.id;

                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedConv(c)}
                      className={`w-full p-3 rounded-xl text-left transition-colors flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800 border border-slate-700 shadow-sm'
                          : 'bg-slate-950/40 hover:bg-slate-800/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400">
                          {partner?.displayName?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-200">
                            {partner?.displayName || partner?.username}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono">@{partner?.username}</p>
                        </div>
                      </div>

                      <span className="text-[10px] text-slate-500">
                        {new Date(c.updatedAt).toLocaleDateString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Panel: Selected Conversation Window (8 cols) */}
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col justify-between">
            {selectedConv ? (
              <div className="space-y-6">
                {/* Conversation Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-emerald-400">
                      {selectedConv.otherParticipant?.displayName?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">
                        {selectedConv.otherParticipant?.displayName}
                      </h3>
                      <p className="text-xs text-slate-400 font-mono">
                        @{selectedConv.otherParticipant?.username} &bull; 1-to-1 Direct Channel
                      </p>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Lock className="w-3 h-3" />
                    <span>Channel Verified</span>
                  </div>
                </div>

                {/* Conversation Body & Phase 3 Milestone Card */}
                <div className="py-8 space-y-6 max-w-xl mx-auto text-center">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                    <MessagesSquare className="w-7 h-7" />
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-lg font-bold text-slate-100">
                      1-to-1 Conversation Channel Established
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      You and <strong className="text-slate-200">@{selectedConv.otherParticipant?.username}</strong> have an authorized 1-to-1 communication session.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-left space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                      <ShieldAlert className="w-4 h-4 text-emerald-400" />
                      <span>Phase 3 Architecture Ready</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Real-time message packets, persistence, and end-to-end cryptographic encapsulation are scheduled for <strong className="text-slate-200">Phase 4 — Messaging & Real-Time Transport</strong>.
                    </p>
                  </div>

                  <div className="pt-2 flex justify-center gap-4 text-[11px] text-slate-500 font-mono">
                    <span>Conversation ID: {selectedConv.id}</span>
                    <span>&bull;</span>
                    <span>Type: {selectedConv.type}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-slate-500 space-y-2">
                <MessageSquare className="w-8 h-8 text-slate-600" />
                <p className="text-xs">Select a conversation from the left to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Discovery & Search Tab */}
      {activeTab === 'search' && (
        <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-400" />
              User Discovery & 1-to-1 Chat Starter
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Search for other registered members to establish a 1-to-1 conversation.
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
                      <span>Chat</span>
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
                Type a username or display name to find users
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Profile Tab */}
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
      )}
    </div>
  );
};
