import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  HomeIcon, 
  BuildingOfficeIcon, 
  BanknotesIcon,
  UserGroupIcon, 
  BeakerIcon,
  DocumentTextIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Companies', href: '/companies', icon: BuildingOfficeIcon },
  { name: 'Sales & Advances', href: '/sales', icon: BanknotesIcon },
  { name: 'Customers/Ledger', href: '/customers', icon: UserGroupIcon },
  { name: 'Fuel Inventory', href: '/fuel', icon: BeakerIcon },
  { name: 'Fuel Purchases', href: '/fuel/purchases', icon: DocumentTextIcon },
  { name: 'Expenses', href: '/expenses', icon: DocumentTextIcon },
  { name: 'Bulk Actions', href: '/bulk-actions', icon: DocumentTextIcon },
  { name: 'Reports', href: '/reports', icon: ChartBarIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
  { name: 'Recycle Bin', href: '/recycle-bin', icon: DocumentTextIcon },
];

export default function Sidebar({ sidebarOpen, setSidebarOpen }) {
  const { user, signOut } = useAuth();
  const { activeCompany, currentCompany } = useCompany();
  const selectedCompany = activeCompany || currentCompany;

  return (
    <>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} aria-hidden="true"></div>
          <div className="fixed inset-y-0 left-0 flex w-full max-w-xs flex-col bg-slate-900 pb-4 pt-5">
            <div className="absolute right-0 top-0 -mr-12 pt-2">
              <button
                type="button"
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sr-only">Close sidebar</span>
                <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
              </button>
            </div>
            <div className="flex shrink-0 items-center px-4">
              <h1 className="text-2xl font-bold text-white tracking-tight">Vyapar</h1>
            </div>
            <div className="mt-5 h-0 flex-1 overflow-y-auto">
              <nav className="space-y-1 px-2">
                {navigation.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `group flex items-center rounded-md px-2 py-2 text-base font-medium ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`
                    }
                  >
                    <item.icon className="mr-4 h-6 w-6 flex-shrink-0" aria-hidden="true" />
                    {item.name}
                  </NavLink>
                ))}
              </nav>
            </div>
            <div className="flex shrink-0 border-t border-slate-700 p-4">
              <div className="group block shrink-0 w-full">
                <div className="flex items-center w-full">
                  <div>
                    <div className="h-9 w-9 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
                      {user?.email?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-medium text-white truncate max-w-[150px]">{user?.email}</p>
                    <p className="text-xs font-medium text-slate-400 group-hover:text-slate-300">View profile</p>
                  </div>
                  <button
                    onClick={signOut}
                    className="ml-auto text-slate-400 hover:text-white p-1 rounded-md"
                    title="Sign out"
                  >
                    <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col bg-slate-900">
          <div className="flex h-16 shrink-0 items-center bg-slate-900 px-4 border-b border-slate-800">
            <h1 className="text-2xl font-bold text-white tracking-tight">Vyapar</h1>
          </div>
          {selectedCompany && (
            <div className="px-4 py-3 bg-slate-800 border-b border-slate-700">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Current Company</p>
              <p className="text-sm font-medium text-white truncate" title={selectedCompany.name}>
                {selectedCompany.name}
              </p>
            </div>
          )}
          <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
            <nav className="mt-2 flex-1 space-y-1 px-2">
              {navigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) =>
                    `group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`
                  }
                >
                  <item.icon className="mr-3 h-5 w-5 flex-shrink-0" aria-hidden="true" />
                  {item.name}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 border-t border-slate-700 p-4">
            <div className="group block w-full shrink-0">
              <div className="flex items-center w-full">
                <div>
                  <div className="h-9 w-9 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                </div>
                <div className="ml-3 flex-1 overflow-hidden">
                  <p className="text-sm font-medium text-white truncate">{user?.email}</p>
                </div>
                <button
                  onClick={signOut}
                  className="ml-auto text-slate-400 hover:text-white p-1.5 rounded-md hover:bg-slate-800 transition-colors"
                  title="Sign out"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
