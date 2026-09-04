import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  PrinterIcon,
  ArrowUpRightIcon,
  EllipsisVerticalIcon,
  PencilSquareIcon,
  EyeIcon,
  DocumentArrowDownIcon,
  DocumentDuplicateIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function RowActionsMenu({
  onViewEdit,
  onPreview,
  onPrint,
  onShare,
  onDuplicate,
  onDelete,
  itemName = 'Record',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const handleDefaultShare = () => {
    if (onShare) {
      onShare();
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard!');
    } else {
      toast.success('Share initiated');
    }
  };

  const openAtButton = (e) => {
    e?.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 180;
    const menuHeight = 220;

    // Prefer placing to the left-top of the button
    let x = rect.left - menuWidth - 6;
    if (x < 10) {
      x = Math.min(window.innerWidth - menuWidth - 10, rect.right + 6);
    }

    let y = rect.top - 4;
    if (y + menuHeight > window.innerHeight - 10) {
      y = Math.max(10, window.innerHeight - menuHeight - 10);
    }

    setMenuPos({ x, y });
    setIsOpen(true);
  };

  const openAtCursor = (clientX, clientY) => {
    const menuWidth = 180;
    const menuHeight = 220;

    let x = clientX;
    let y = clientY;

    if (x + menuWidth > window.innerWidth - 10) {
      x = Math.max(10, window.innerWidth - menuWidth - 10);
    }
    if (y + menuHeight > window.innerHeight - 10) {
      y = Math.max(10, window.innerHeight - menuHeight - 10);
    }

    setMenuPos({ x, y });
    setIsOpen(true);
  };

  // Listen to right-click on the entire table row!
  useEffect(() => {
    const parentRow = containerRef.current?.closest('tr');
    if (!parentRow) return;

    const handleRowContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openAtCursor(e.clientX, e.clientY);
    };

    parentRow.addEventListener('contextmenu', handleRowContextMenu);
    return () => {
      parentRow.removeEventListener('contextmenu', handleRowContextMenu);
    };
  }, []);

  // Handle clicking outside, Escape, or scrolling
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  const handleAction = (actionFn) => {
    setIsOpen(false);
    if (actionFn) actionFn();
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center gap-1.5 justify-end"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openAtCursor(e.clientX, e.clientY);
      }}
    >
      {/* 1. Quick Print Icon */}
      <button
        type="button"
        onClick={onPrint || onPreview}
        title="Print"
        className="relative group p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
      >
        <PrinterIcon className="h-4 w-4" />
        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 z-50">
          Print
        </span>
      </button>

      {/* 2. Quick Share Icon */}
      <button
        type="button"
        onClick={handleDefaultShare}
        title="Share"
        className="relative group p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
      >
        <ArrowUpRightIcon className="h-4 w-4" />
        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 z-50">
          Share
        </span>
      </button>

      {/* 3. Three Dots Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={openAtButton}
        title="More Options (Right-click row for menu)"
        className={`p-1.5 rounded-lg transition focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
          isOpen ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'
        }`}
      >
        <EllipsisVerticalIcon className="h-4 w-4" />
      </button>

      {/* 4. Portal-based Dropdown Menu Rendered Directly in document.body Outside All Divs */}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              left: `${menuPos.x}px`,
              top: `${menuPos.y}px`,
            }}
            className="z-[999999] w-44 rounded-xl bg-white p-1.5 shadow-2xl ring-1 ring-slate-900/10 border border-slate-200 divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="py-0.5">
              {/* Preview */}
              {onPreview && (
                <button
                  type="button"
                  onClick={() => handleAction(onPreview)}
                  className="group flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition text-left"
                >
                  <EyeIcon className="mr-2 h-4 w-4 text-slate-400 group-hover:text-indigo-600" />
                  Preview
                </button>
              )}

              {/* View / Edit */}
              {onViewEdit && (
                <button
                  type="button"
                  onClick={() => handleAction(onViewEdit)}
                  className="group flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition text-left"
                >
                  <PencilSquareIcon className="mr-2 h-4 w-4 text-slate-400 group-hover:text-indigo-600" />
                  View / Edit
                </button>
              )}

              {/* Open PDF */}
              {onPrint && (
                <button
                  type="button"
                  onClick={() => handleAction(onPrint)}
                  className="group flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition text-left"
                >
                  <DocumentArrowDownIcon className="mr-2 h-4 w-4 text-slate-400 group-hover:text-indigo-600" />
                  Open PDF
                </button>
              )}

              {/* Duplicate */}
              {onDuplicate && (
                <button
                  type="button"
                  onClick={() => handleAction(onDuplicate)}
                  className="group flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition text-left"
                >
                  <DocumentDuplicateIcon className="mr-2 h-4 w-4 text-slate-400 group-hover:text-indigo-600" />
                  Duplicate
                </button>
              )}

              {/* Share */}
              <button
                type="button"
                onClick={() => handleAction(handleDefaultShare)}
                className="group flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition text-left"
              >
                <ArrowUpRightIcon className="mr-2 h-4 w-4 text-slate-400 group-hover:text-indigo-600" />
                Share
              </button>
            </div>

            {/* Delete */}
            {onDelete && (
              <div className="pt-0.5 mt-0.5">
                <button
                  type="button"
                  onClick={() => handleAction(onDelete)}
                  className="group flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition text-left"
                >
                  <TrashIcon className="mr-2 h-4 w-4 text-rose-500" />
                  Delete
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
