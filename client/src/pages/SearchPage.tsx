import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Loader2, Lock, Search, X } from 'lucide-react';
import type { UserSummary } from '@enctxt/shared';
import { userService } from '../services/userService';
import { conversationService } from '../services/conversationService';
import { ApiClientError } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { getVerification } from '../crypto';
import { Avatar, BackHeader, EmptyState } from '../components/vade/Chrome';
import { SectionLabel } from '../components/vade/SettingsGroup';
import { useToast } from '../components/ui/Toast';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

/**
 * Finding someone is its own screen rather than a tab, so the search field can own the top of
 * the display and the scope note can stay visible under the results.
 */
export const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const { error: toastError } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const debouncedTerm = useDebounce(term.trim(), 300);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!debouncedTerm) {
      setResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    let isMounted = true;
    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);

    userService
      .searchUsers(debouncedTerm)
      .then((response) => {
        if (isMounted) setResults(response.users);
      })
      .catch(() => {
        if (isMounted) setSearchError('Search is unavailable right now.');
      })
      .finally(() => {
        if (isMounted) setIsSearching(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedTerm]);

  const openConversation = async (target: UserSummary) => {
    setOpeningId(target.id);
    try {
      const response = await conversationService.createOrGetConversation({ userId: target.id });
      navigate(`/app/conversations/${response.conversation.id}`);
    } catch (error) {
      toastError(
        error instanceof ApiClientError ? error.message : 'Could not open that conversation.'
      );
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <ErrorBoundary fallbackTitle="Search unavailable">
      <div className="flex min-h-0 flex-1 flex-col">
        <BackHeader onBack={() => navigate('/app')} backLabel="Back to messages" className="lg:hidden">
          <div className="flex h-[42px] flex-1 items-center gap-2.5 rounded-full border border-accent bg-surface px-[15px]">
            <Search width={16} height={16} strokeWidth={2.75} className="shrink-0 text-muted" aria-hidden="true" />
            <input
              ref={inputRef}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Name or username"
              aria-label="Search people"
              className="w-full border-0 bg-transparent text-[14.5px] text-text placeholder:text-muted caret-accent focus:outline-none"
            />
            {isSearching ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden="true" />
            ) : (
              term && (
                <button
                  type="button"
                  onClick={() => setTerm('')}
                  aria-label="Clear search"
                  className="shrink-0 cursor-pointer text-muted hover:text-text focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <X width={16} height={16} strokeWidth={2.75} aria-hidden="true" />
                </button>
              )
            )}
          </div>
        </BackHeader>

        {/* The desktop rail already provides navigation, so this column only needs the field. */}
        <div className="hidden px-section pb-4 pt-[30px] lg:block">
          <h1 className="mb-4 text-[26px] font-bold tracking-[-0.026em]">Search</h1>
          <div className="flex h-[42px] max-w-md items-center gap-2.5 rounded-full border border-accent bg-surface px-[15px]">
            <Search width={16} height={16} strokeWidth={2.75} className="shrink-0 text-muted" aria-hidden="true" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Name or username"
              aria-label="Search people"
              className="w-full border-0 bg-transparent text-[14.5px] text-text placeholder:text-muted caret-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-24">
          {results.length > 0 && <SectionLabel className="px-[22px] pt-1.5">Matches</SectionLabel>}

          {searchError && (
            <div role="alert" className="mx-[22px] rounded-card bg-warn-tint p-4 text-row text-warn">
              {searchError}
            </div>
          )}

          {results.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => openConversation(person)}
              disabled={Boolean(openingId)}
              className="flex w-full cursor-pointer items-center gap-row px-[22px] py-3 text-left hover:bg-surface disabled:opacity-60 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <Avatar name={person.displayName} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-bold tracking-[-0.012em]">
                    {person.displayName}
                  </span>
                  {getVerification(person.id) && (
                    <Check
                      width={13}
                      height={13}
                      strokeWidth={2.75}
                      className="shrink-0 text-accent"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="block truncate text-row text-muted">@{person.username}</span>
              </span>
              {openingId === person.id ? (
                <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin text-muted" aria-hidden="true" />
              ) : (
                <ChevronRight
                  width={18}
                  height={18}
                  strokeWidth={2.75}
                  className="shrink-0 text-faint"
                  aria-hidden="true"
                />
              )}
            </button>
          ))}

          {hasSearched && !isSearching && !searchError && results.length === 0 && (
            <EmptyState
              className="py-10"
              icon={<Search width={23} height={23} strokeWidth={2.75} aria-hidden="true" />}
              title="No one found"
              body="Check the spelling, or ask them for their exact username."
            />
          )}

          <div className="flex items-center gap-1.5 px-[22px] pt-4 text-meta leading-snug text-faint">
            <Lock width={12} height={12} strokeWidth={2.75} className="shrink-0" aria-hidden="true" />
            <span>Search covers names and usernames only.</span>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};
