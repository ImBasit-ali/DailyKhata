import React from 'react';
import LoadingState from './LoadingState';
import EmptyState from './EmptyState';
import { DocumentMagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function DataTable({ 
  columns, 
  data, 
  loading = false, 
  emptyMessage = "No data available", 
  emptyIcon = DocumentMagnifyingGlassIcon,
  onRowClick,
  className = ""
}) {
  if (loading) {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${className}`}>
        <LoadingState type="skeleton" rows={5} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${className}`}>
        <EmptyState 
          icon={emptyIcon} 
          title="No Data" 
          description={emptyMessage} 
        />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column.key || index}
                  scope="col"
                  className={`px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap ${
                    column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''
                  }`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {data.map((row, rowIndex) => (
              <tr 
                key={row.id || rowIndex} 
                className={`hover:bg-slate-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                onClick={() => onRowClick && onRowClick(row)}
              >
                {columns.map((column, colIndex) => (
                  <td 
                    key={column.key || colIndex} 
                    className={`px-6 py-4 text-sm text-slate-700 ${
                      column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''
                    } ${column.className || ''}`}
                  >
                    {column.render ? column.render(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
