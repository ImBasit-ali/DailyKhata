import React from 'react';
import {
  MagnifyingGlassIcon,
  ChartBarIcon,
  PrinterIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export default function TransactionToolbar({
  searchQuery = '',
  onSearchChange,
  showSearch = false,
  onToggleSearch,
  showGraph = false,
  onToggleGraph,
  onExportExcel,
  onPrintTable,
  searchPlaceholder = 'Search by any column...',
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1">
      {/* Optional Search Bar when open */}
      <div className="flex-1 max-w-sm">
        {showSearch && (
          <div className="relative animate-in fade-in slide-in-from-top-1 duration-150">
            <MagnifyingGlassIcon className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full text-xs pl-8 pr-7 py-1 border border-slate-300 rounded-lg shadow-sm focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange && onSearchChange('')}
                className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action Icons matching Image 1 (Search, Graph, XLS, Print) */}
      <div className="flex items-center gap-1 ml-auto">
        {/* Search Icon Toggle */}
        <button
          type="button"
          onClick={onToggleSearch}
          title="Search transactions"
          className={`relative group p-1.5 rounded-lg transition-colors ${
            showSearch || searchQuery
              ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          <MagnifyingGlassIcon className="h-4 w-4" />
          <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 z-30">
            Search
          </span>
        </button>

        {/* Graph Icon Toggle */}
        {onToggleGraph && (
          <button
            type="button"
            onClick={onToggleGraph}
            title="Toggle Graph"
            className={`relative group p-1.5 rounded-lg transition-colors ${
              showGraph
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <ChartBarIcon className="h-4 w-4" />
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 z-30">
              {showGraph ? 'Hide Graph' : 'Show Graph'}
            </span>
          </button>
        )}

        {/* Excel Export Button (.xls icon matching Image 1) */}
        {onExportExcel && (
          <button
            type="button"
            onClick={onExportExcel}
            title="Export to Excel"
            className="relative group p-1 rounded-lg hover:bg-emerald-50 transition-colors text-emerald-700"
          >
            <div className="flex items-center justify-center h-6 w-6 rounded bg-emerald-600 text-white font-black text-[9px] tracking-tighter uppercase shadow-sm">
              xls
            </div>
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 z-30">
              Export Excel
            </span>
          </button>
        )}

        {/* Print Table Button */}
        {onPrintTable && (
          <button
            type="button"
            onClick={onPrintTable}
            title="Print Table"
            className="relative group p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <PrinterIcon className="h-4 w-4" />
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 z-30">
              Print Table
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
