import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const sizes = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md lg:max-w-lg',
  lg: 'sm:max-w-lg lg:max-w-2xl',
  xl: 'sm:max-w-xl lg:max-w-4xl',
  full: 'sm:max-w-full sm:m-4'
};

export default function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  footer = null
}) {
  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className={`relative transform rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 w-full ${sizes[size]}`}>
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                  <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-slate-900">
                    {title}
                  </Dialog.Title>
                  <button
                    type="button"
                    className="rounded-md bg-white text-slate-400 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                
                <div className="px-6 py-4">
                  {children}
                </div>
                
                {footer && (
                  <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 rounded-b-xl flex justify-end space-x-3">
                    {footer}
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
