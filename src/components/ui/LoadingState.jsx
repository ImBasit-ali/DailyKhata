import React from 'react';

export default function LoadingState({ type = 'spinner', rows = 3, message = 'Loading...' }) {
  if (type === 'page') {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        {message && <p className="mt-4 text-slate-500 font-medium">{message}</p>}
      </div>
    );
  }

  if (type === 'skeleton') {
    return (
      <div className="animate-pulse flex flex-col space-y-4 w-full p-4">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex space-x-4">
            <div className="h-10 bg-slate-200 rounded w-10"></div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-slate-200 rounded w-3/4"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Default spinner
  return (
    <div className="flex justify-center items-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
