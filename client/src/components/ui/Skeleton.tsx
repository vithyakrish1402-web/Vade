import React from 'react';

export interface SkeletonProps {
  className?: string;
  count?: number;
}

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      className={`bg-slate-800/60 rounded-lg animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
};

export const ConversationSkeletonList: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="divide-y divide-slate-800/60 border border-slate-800/80 rounded-2xl overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 bg-slate-950/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 flex-1">
            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
            <div className="space-y-2 flex-1 max-w-[200px]">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
          </div>
          <Skeleton className="h-3 w-16 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
};

export const MessageSkeletonList: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="space-y-4 py-4">
      {Array.from({ length: count }).map((_, i) => {
        const isLeft = i % 2 === 0;
        return (
          <div
            key={i}
            className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}
          >
            <Skeleton
              className={`h-11 ${
                isLeft ? 'w-48 sm:w-64 rounded-2xl rounded-tl-xs' : 'w-56 sm:w-72 rounded-2xl rounded-tr-xs'
              }`}
            />
            <Skeleton className="h-2.5 w-14 mt-1.5 rounded" />
          </div>
        );
      })}
    </div>
  );
};
