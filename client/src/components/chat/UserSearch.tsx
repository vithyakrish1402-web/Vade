import React, { useState, useEffect } from 'react';
import type { UserSummary } from '@enctxt/shared';
import { userService } from '../../services/userService';
import { useDebounce } from '../../hooks/useDebounce';
import { Search, Loader2, MessageSquare, User, X } from 'lucide-react';
import { Button } from '../ui/Button';

export interface UserSearchProps {
  onStartChat: (user: UserSummary) => Promise<void>;
  startChatLoadingId?: string | null;
}

export const UserSearch: React.FC<UserSearchProps> = ({
  onStartChat,
  startChatLoadingId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const debouncedSearch = useDebounce(searchTerm.trim(), 300);

  useEffect(() => {
    if (!debouncedSearch) {
      setResults([]);
      setIsLoading(false);
      setHasSearched(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    userService
      .searchUsers(debouncedSearch)
      .then((res) => {
        if (isMounted) {
          setResults(res.users);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError('Unable to search right now. Please try again.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedSearch]);

  const handleClear = () => {
    setSearchTerm('');
    setResults([]);
    setHasSearched(false);
  };

  return (
    <div className="space-y-4">
      {/* Search Input Box */}
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
          <Search className="w-4 h-4" aria-hidden="true" />
        </div>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by username or display name..."
          aria-label="Search users"
          className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
        />

        {isLoading ? (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" aria-hidden="true" />
          </div>
        ) : searchTerm ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Results List */}
      <div className="space-y-2">
        {results.length > 0 ? (
          <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
            {results.map((u) => {
              const isStarting = startChatLoadingId === u.id;
              return (
                <div
                  key={u.id}
                  className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0 select-none">
                      {u.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                        {u.displayName}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono truncate">
                        @{u.username}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onStartChat(u)}
                    isLoading={isStarting}
                    disabled={Boolean(startChatLoadingId)}
                    leftIcon={<MessageSquare className="w-3.5 h-3.5" />}
                  >
                    Start Chat
                  </Button>
                </div>
              );
            })}
          </div>
        ) : hasSearched && !isLoading ? (
          <div className="text-center py-8 text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">No users found</p>
            <p className="text-[11px] text-slate-500">Try searching for a different username.</p>
          </div>
        ) : (
          <div className="text-center py-8 text-xs text-slate-500 flex flex-col items-center gap-2">
            <User className="w-8 h-8 text-slate-700" aria-hidden="true" />
            <p>Type a username or display name to find users.</p>
          </div>
        )}
      </div>
    </div>
  );
};
