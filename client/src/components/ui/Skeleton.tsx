import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-surface ${className}`} aria-hidden="true" />
);

export const ConversationSkeletonList: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div aria-hidden="true">
    {Array.from({ length: count }, (_, index) => (
      <div key={index} className="flex items-center gap-row border-b border-line py-row">
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2 rounded-full" />
          <Skeleton className="h-3 w-2/3 rounded-full" />
        </div>
        <Skeleton className="h-3 w-10 shrink-0 rounded-full" />
      </div>
    ))}
  </div>
);

export const MessageSkeletonList: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="flex flex-col gap-4 py-4" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => {
      const isIncoming = index % 2 === 0;
      return (
        <div key={index} className={`flex flex-col ${isIncoming ? 'items-start' : 'items-end'}`}>
          <Skeleton
            className={
              isIncoming
                ? 'h-11 w-48 rounded-[22px_22px_22px_7px] sm:w-64'
                : 'h-11 w-56 rounded-[22px_22px_7px_22px] sm:w-72'
            }
          />
          <Skeleton className="mt-1.5 h-2.5 w-14 rounded-full" />
        </div>
      );
    })}
  </div>
);
