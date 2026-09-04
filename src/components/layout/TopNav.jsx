import React, { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { Bars3Icon, ChevronDownIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { useNavigate } from 'react-router-dom';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function TopNav({ setSidebarOpen }) {
  const { user, signOut } = useAuth();
  const { companies, activeCompany, currentCompany, setActiveCompany, setCurrentCompany } = useCompany();
  const navigate = useNavigate();

  const selectedCompany = activeCompany || currentCompany;
  const changeCompany = setActiveCompany || setCurrentCompany;

  return (
    <div className="sticky top-0 z-10 flex h-16 flex-shrink-0 bg-white shadow-sm border-b border-slate-200">
      <button
        type="button"
        className="border-r border-slate-200 px-4 text-slate-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 lg:hidden"
        onClick={() => setSidebarOpen(true)}
      >
        <span className="sr-only">Open sidebar</span>
        <Bars3Icon className="h-6 w-6" aria-hidden="true" />
      </button>
      
      <div className="flex flex-1 justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex flex-1 items-center">
          {/* Company Selector */}
          <Menu as="div" className="relative ml-3">
            <div>
              <Menu.Button className="flex items-center max-w-xs rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 p-2 hover:bg-slate-50 border border-slate-200 shadow-sm transition-colors">
                <span className="sr-only">Open company menu</span>
                <BuildingOfficeIcon className="h-5 w-5 text-indigo-600 mr-2" />
                <span className="font-medium text-slate-700 truncate max-w-[150px] sm:max-w-xs">
                  {selectedCompany ? selectedCompany.name : 'Select Company'}
                </span>
                <ChevronDownIcon className="ml-2 h-4 w-4 text-slate-400" aria-hidden="true" />
              </Menu.Button>
            </div>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute left-0 z-10 mt-2 w-56 origin-top-left rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none max-h-60 overflow-y-auto">
                <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Switch Company</p>
                </div>
                {/* All Companies Option */}
                {companies.length > 0 && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => changeCompany({ id: 'all', name: 'All Companies (تمام کمپنیاں)', isAll: true })}
                        className={classNames(
                          active ? 'bg-slate-100 text-slate-900' : 'text-slate-800',
                          selectedCompany?.id === 'all' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'font-semibold',
                          'flex items-center w-full text-left px-4 py-2.5 text-sm border-b border-slate-100'
                        )}
                      >
                        <span className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></span>
                        All Companies (تمام کمپنیاں)
                      </button>
                    )}
                  </Menu.Item>
                )}
                {companies.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-500">No companies found.</div>
                ) : (
                  companies.map((company) => (
                    <Menu.Item key={company.id}>
                      {({ active }) => (
                        <button
                          onClick={() => changeCompany(company)}
                          className={classNames(
                            active ? 'bg-slate-100 text-slate-900' : 'text-slate-700',
                            selectedCompany?.id === company.id ? 'bg-indigo-50 text-indigo-700 font-medium' : '',
                            'block w-full text-left px-4 py-2 text-sm'
                          )}
                        >
                          {company.name}
                        </button>
                      )}
                    </Menu.Item>
                  ))
                )}
                <div className="border-t border-slate-100">
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => navigate('/companies')}
                        className={classNames(
                          active ? 'bg-slate-50 text-slate-900' : 'text-indigo-600',
                          'block w-full text-left px-4 py-2 text-sm font-medium'
                        )}
                      >
                        Manage Companies
                      </button>
                    )}
                  </Menu.Item>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
        
        <div className="ml-4 flex items-center md:ml-6">
          {/* Profile dropdown */}
          <Menu as="div" className="relative ml-3">
            <div>
              <Menu.Button className="flex max-w-xs items-center rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                <span className="sr-only">Open user menu</span>
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200">
                  <span className="text-indigo-800 font-medium text-sm">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
              </Menu.Button>
            </div>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-900 truncate">{user?.email}</p>
                </div>
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={() => navigate('/settings')}
                      className={classNames(
                        active ? 'bg-gray-100' : '',
                        'block px-4 py-2 text-sm text-gray-700 w-full text-left'
                      )}
                    >
                      Settings
                    </button>
                  )}
                </Menu.Item>
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={signOut}
                      className={classNames(
                        active ? 'bg-gray-100' : '',
                        'block px-4 py-2 text-sm text-gray-700 w-full text-left text-rose-600'
                      )}
                    >
                      Sign out
                    </button>
                  )}
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
    </div>
  );
}
