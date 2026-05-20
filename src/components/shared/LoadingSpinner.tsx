import React from 'react';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullscreen?: boolean;
}

export function LoadingSpinner({ size = 'md', message, fullscreen }: Props) {
  const sz = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' }[size];

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={`${sz} border-2 border-surface-700 border-t-primary-500 rounded-full animate-spin`} />
      {message && <p className="text-sm text-zinc-400 animate-pulse">{message}</p>}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 bg-surface-900 z-50 flex items-center justify-center">
        {spinner}
      </div>
    );
  }
  return spinner;
}

export function SkeletonCard() {
  return (
    <div className="bg-surface-800 rounded-xl p-5 animate-pulse">
      <div className="h-5 bg-surface-700 rounded w-3/4 mb-3" />
      <div className="h-4 bg-surface-700 rounded w-1/2 mb-4" />
      <div className="flex gap-2">
        <div className="h-6 bg-surface-700 rounded-full w-16" />
        <div className="h-6 bg-surface-700 rounded-full w-20" />
      </div>
    </div>
  );
}
