import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { userService } from '../services/userService';
import { useConversations } from '../hooks/useConversations';
import { conversationService } from '../services/conversationService';
import type { UserProfile, UserSummary } from '@enctxt/shared';
import { ApiClientError } from '../services/api';
import { ConversationList } from '../components/chat/ConversationList';
import { UserSearch } from '../components/chat/UserSearch';
import { GestureSettings } from '../components/gesture/GestureSettings';
import { DeviceManagement } from '../components/security/DeviceManagement';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import {
  User,
  Search,
  LogOut,
  Shield,
  Loader2,
  Edit3,
  Calendar,
  Mail,
  MessageSquare,
  UserPlus,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  // Active Tab: 'conversations' | 'search' | 'profile'
  const [activeTab, setActiveTab] = useState<'conversations' | 'search' | 'profile'>('conversations');

  // Conversations Hook
  const {
    conversations,
    isLoading: convLoading,
    error: convError,
    fetchConversations,
  } = useConversations();

  // Profile State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Search State
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

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Handle Profile Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditLoading(true);

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
      setIsEditing(false);
      success('Profile updated successfully.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        toastError(err.message);
      } else {
        toastError('Failed to update profile.');
      }
    } finally {
      setEditLoading(false);
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
        toastError(err.message);
      } else {
        toastError('Could not start conversation.');
      }
    } finally {
      setStartChatLoadingId(null);
    }
  };

  return (
    <div className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
            <span>End-to-End Encrypted Workspace</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
            Welcome, {user?.displayName || user?.username}
          </h1>
          <p className="text-xs text-slate-400 font-mono">@{user?.username}</p>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTab('conversations')}
              aria-selected={activeTab === 'conversations'}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                activeTab === 'conversations'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Chats ({conversations.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('search')}
              aria-selected={activeTab === 'search'}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                activeTab === 'search'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Find Users</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              aria-selected={activeTab === 'profile'}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                activeTab === 'profile'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Profile & Security</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => logout()}
            className="p-2.5 bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-700/50 rounded-2xl text-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Conversations Tab */}
      {activeTab === 'conversations' && (
        <ErrorBoundary fallbackTitle="Conversation List Unavailable">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <span>Conversations</span>
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('search')}
                leftIcon={<UserPlus className="w-3.5 h-3.5" />}
              >
                Start New Chat
              </Button>
            </div>

            <ConversationList
              conversations={conversations}
              isLoading={convLoading}
              error={convError}
              onSelectConversation={(id) => navigate(`/app/conversations/${id}`)}
              onOpenSearch={() => setActiveTab('search')}
              onRetry={fetchConversations}
            />
          </div>
        </ErrorBoundary>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <ErrorBoundary fallbackTitle="User Search Unavailable">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <span>User Discovery & New Conversation</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Search users by username to start a private, end-to-end encrypted conversation.
              </p>
            </div>

            <UserSearch
              onStartChat={handleStartChat}
              startChatLoadingId={startChatLoadingId}
            />
          </div>
        </ErrorBoundary>
      )}

      {/* Profile & Security Tab */}
      {activeTab === 'profile' && (
        <ErrorBoundary fallbackTitle="Profile Settings Unavailable">
          <div className="space-y-6">
            {/* Profile Information Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span>User Profile</span>
                </h2>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                  >
                    Edit Profile
                  </Button>
                )}
              </div>

              {profileLoading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-500" aria-hidden="true" />
                </div>
              ) : profileError ? (
                <div
                  role="alert"
                  className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300"
                >
                  {profileError}
                </div>
              ) : isEditing ? (
                <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
                  <Input
                    label="Display Name"
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    disabled={editLoading}
                    required
                  />

                  <Input
                    label="Username"
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    disabled={editLoading}
                    required
                  />

                  <div className="flex items-center gap-2.5 pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={editLoading}
                    >
                      Save Changes
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={editLoading}
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-850 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold tracking-wider">
                      Display Name
                    </span>
                    <p className="text-sm font-semibold text-slate-100">{profile?.displayName}</p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-850 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold tracking-wider">
                      Username
                    </span>
                    <p className="text-sm text-emerald-400 font-mono">@{profile?.username}</p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-850 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold tracking-wider flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-500" aria-hidden="true" /> Email Address
                    </span>
                    <p className="text-xs text-slate-300">{profile?.email}</p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-850 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold tracking-wider flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" aria-hidden="true" /> Member Since
                    </span>
                    <p className="text-xs text-slate-400">
                      {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Gesture Reveal Settings */}
            <GestureSettings />

            {/* Registered Devices & Active Sessions */}
            <DeviceManagement />
          </div>
        </ErrorBoundary>
      )}
    </div>
  );
};
