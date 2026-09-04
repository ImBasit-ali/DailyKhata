import React from 'react';
import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from '@heroicons/react/20/solid';

const colorStyles = {
  primary: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    iconText: 'text-indigo-600'
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-600'
  },
  rose: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    iconBg: 'bg-rose-100',
    iconText: 'text-rose-600'
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600'
  },
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-600'
  }
};

export default function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  trendValue, 
  color = 'primary',
  className = ""
}) {
  const styles = colorStyles[color] || colorStyles.primary;

  const getTrendIcon = () => {
    if (trend === 'up') return <ArrowUpIcon className="self-center flex-shrink-0 h-3 w-3 text-emerald-500" aria-hidden="true" />;
    if (trend === 'down') return <ArrowDownIcon className="self-center flex-shrink-0 h-3 w-3 text-rose-500" aria-hidden="true" />;
    return <MinusIcon className="self-center flex-shrink-0 h-3 w-3 text-slate-400" aria-hidden="true" />;
  };

  const getTrendColor = () => {
    if (trend === 'up') return 'text-emerald-600';
    if (trend === 'down') return 'text-rose-600';
    return 'text-slate-500';
  };

  return (
    <div className={`overflow-hidden rounded-xl bg-white p-3.5 shadow-sm border border-slate-200/80 ${className}`}>
      <div className="flex items-center">
        {Icon && (
          <div className={`flex-shrink-0 rounded-lg p-2 ${styles.iconBg}`}>
            <Icon className={`h-4 w-4 ${styles.iconText}`} aria-hidden="true" />
          </div>
        )}
        <div className={`ml-3 w-0 flex-1 ${!Icon ? 'ml-0' : ''}`}>
          <dt className="truncate text-xs font-semibold uppercase text-slate-500 tracking-wider">{title}</dt>
          <dd className="mt-0.5 flex items-baseline">
            <div className={`text-base sm:text-lg font-bold tabular-nums ${styles.text}`}>{value}</div>
            
            {trend && trendValue && (
              <div className={`ml-2 flex items-baseline text-xs font-semibold ${getTrendColor()}`}>
                {getTrendIcon()}
                <span className="sr-only">{trend === 'up' ? 'Increased by' : trend === 'down' ? 'Decreased by' : 'No change'}</span>
                {trendValue}
              </div>
            )}
          </dd>
          {subtitle && (
            <dd className="mt-0.5 text-[11px] text-slate-400 truncate" title={subtitle}>{subtitle}</dd>
          )}
        </div>
      </div>
    </div>
  );
}
