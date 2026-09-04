import React from 'react';

export default function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  actionLabel, 
  onAction,
  className = ""
}) {
  return (
    <div className={`text-center py-12 px-4 ${className}`}>
      {Icon && (
        <Icon className="mx-auto h-12 w-12 text-slate-300 mb-4" aria-hidden="true" />
      )}
      <h3 className="mt-2 text-sm font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
