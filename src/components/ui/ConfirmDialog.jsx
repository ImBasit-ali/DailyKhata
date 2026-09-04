import React, { useState } from 'react';
import Modal from './Modal';
import { ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
}) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const isDanger = confirmVariant === 'danger';

  const footer = (
    <>
      <button
        type="button"
        className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 sm:mt-0 sm:w-auto"
        onClick={onClose}
        disabled={loading}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        className={`inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed ${
          isDanger 
            ? 'bg-rose-600 hover:bg-rose-500 focus-visible:outline-rose-600' 
            : 'bg-indigo-600 hover:bg-indigo-500 focus-visible:outline-indigo-600'
        } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
        onClick={handleConfirm}
        disabled={loading}
      >
        {loading ? 'Processing...' : confirmLabel}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? undefined : onClose}
      title=""
      size="sm"
      footer={footer}
    >
      <div className="sm:flex sm:items-start">
        <div className={`mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full sm:mx-0 sm:h-10 sm:w-10 ${
          isDanger ? 'bg-rose-100' : 'bg-indigo-100'
        }`}>
          {isDanger ? (
            <ExclamationTriangleIcon className="h-6 w-6 text-rose-600" aria-hidden="true" />
          ) : (
            <InformationCircleIcon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          )}
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
          <h3 className="text-base font-semibold leading-6 text-slate-900">
            {title}
          </h3>
          <div className="mt-2">
            <p className="text-sm text-slate-500">
              {message}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
