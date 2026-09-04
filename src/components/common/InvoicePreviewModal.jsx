import React, { useRef, useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { formatDateDisplay } from '@/utils/dateUtils';
import { useCompany } from '@/contexts/CompanyContext';
import toast from 'react-hot-toast';

export default function InvoicePreviewModal({
  isOpen,
  onClose,
  data = null,
}) {
  const printRef = useRef(null);
  const { activeCompany, currentCompany } = useCompany();
  const [printSettings, setPrintSettings] = useState({
    themeColor: '#4f46e5',
    printPageSize: 'A4',
    printTextSize: 'medium',
    printerType: 'regular',
    printLayout: 'layout1',
    details: {}
  });

  useEffect(() => {
    const compId = activeCompany?.id || currentCompany?.id;
    if (compId) {
      try {
        const raw = localStorage.getItem(`dailykhata_company_settings_${compId}`);
        if (raw) {
          setPrintSettings(prev => ({ ...prev, ...JSON.parse(raw) }));
        }
      } catch (e) {}
    }
  }, [activeCompany, currentCompany, isOpen]);

  if (!isOpen || !data) return null;

  const {
    billTo = 'Walk-in Customer',
    invoiceNo = 'INV-1001',
    date = new Date().toISOString().slice(0, 10),
    items = [],
    totalAmount = 0,
    notes = '',
  } = data;

  const compDetails = printSettings.details || {};
  const companyName = compDetails.name || activeCompany?.name || 'DailyKhata Business Services';
  const companyPhone = compDetails.number || '';
  const companyEmail = compDetails.email || '';
  const companyAddress = compDetails.address || '';

  const getPageWidth = () => {
    if (printSettings.printPageSize === '80mm') return '80mm';
    if (printSettings.printPageSize === '58mm') return '58mm';
    return '100%';
  };

  const getFontSize = (base) => {
    if (printSettings.printTextSize === 'small') return base - 2;
    if (printSettings.printTextSize === 'large') return base + 2;
    return base;
  };

  const themeColor = printSettings.themeColor || '#4f46e5';

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '', 'width=900,height=750');
    if (!printWindow) {
      toast.error('Please allow popups to print');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${invoiceNo}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { padding: ${printSettings.printerType === 'thermal' ? '10px' : '30px'}; color: #1e293b; background: #fff; }
            .invoice-container { max-width: ${printSettings.printerType === 'thermal' ? getPageWidth() : '800px'}; margin: 0 auto; border: ${printSettings.printerType === 'thermal' ? 'none' : '1px solid #cbd5e1'}; }
            .header-title { text-align: center; font-size: ${getFontSize(14)}px; font-weight: bold; margin-bottom: 6px; }
            .company-name { text-align: center; font-size: ${getFontSize(20)}px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
            .company-contact { text-align: center; font-size: ${getFontSize(11)}px; color: #64748b; margin-bottom: 16px; }
            .band { background: ${themeColor}; color: white; display: flex; justify-content: space-between; padding: 8px 14px; font-size: ${getFontSize(12)}px; font-weight: bold; }
            .info-row { display: flex; justify-content: space-between; padding: 8px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: ${getFontSize(12)}px; }
            table { width: 100%; border-collapse: collapse; margin-top: 0; }
            th { background: ${themeColor}; color: white; text-align: left; padding: 8px 10px; font-size: ${getFontSize(11)}px; text-transform: uppercase; }
            th.right, td.right { text-align: right; }
            td { padding: 10px; font-size: ${getFontSize(12)}px; border-bottom: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; }
            td:last-child { border-right: none; }
            .total-row { background: #f8fafc; font-weight: bold; }
            .total-row td { border-top: 2px solid #cbd5e1; font-size: ${getFontSize(13)}px; }
            @media print {
              body { padding: 0; }
              @page { size: ${printSettings.printPageSize === '80mm' ? '80mm auto' : printSettings.printPageSize === '58mm' ? '58mm auto' : printSettings.printPageSize}; margin: 5mm; }
            }
          </style>
        </head>
        <body>
          <div class="invoice-container">
            <div style="padding: 16px 20px 8px 20px;">
              <div class="header-title">Invoice</div>
              <div class="company-name">${companyName}</div>
              <div class="company-contact">
                ${companyPhone ? `Phone: ${companyPhone}<br>` : ''} 
                ${companyEmail ? `Email: ${companyEmail}<br>` : ''}
                ${companyAddress ? `Address: ${companyAddress}` : ''}
              </div>
            </div>

            <div class="band">
              <div>Bill To</div>
              <div>Invoice Details</div>
            </div>

            <div class="info-row">
              <div style="font-weight: 600; font-size: 13px;">${billTo}</div>
              <div style="text-align: right; color: #475569;">
                <div>Invoice No. : ${invoiceNo}</div>
                <div>Date : ${formatDateDisplay(date)}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 40px;">#</th>
                  <th>Item name</th>
                  <th class="right">Quantity</th>
                  <th>Unit</th>
                  <th class="right">Price/ Unit</th>
                  <th class="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td style="font-weight: 500;">${item.name}</td>
                    <td class="right">${item.quantity != null && item.quantity !== '' ? formatNumber(item.quantity) : '-'}</td>
                    <td>${item.unit || '-'}</td>
                    <td class="right">${item.pricePerUnit ? formatCurrency(item.pricePerUnit) : '-'}</td>
                    <td class="right" style="font-weight: 600;">${formatCurrency(item.amount)}</td>
                  </tr>
                `).join('')}
                <tr class="total-row">
                  <td colspan="5" class="right" style="padding-right: 15px;">TOTAL AMOUNT:</td>
                  <td class="right" style="color: #4338ca;">${formatCurrency(totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleOpenPdf = () => {
    handlePrint();
  };

  const handleSavePdf = () => {
    toast.success('In print window, select "Save as PDF" as the destination');
    handlePrint();
  };

  const handleEmailPdf = () => {
    const subject = encodeURIComponent(`Invoice ${invoiceNo} from ${companyName}`);
    const body = encodeURIComponent(
      `Dear ${billTo},\n\nPlease find details of Invoice ${invoiceNo} dated ${formatDateDisplay(date)}.\nTotal Amount: ${formatCurrency(totalAmount)}\n\nThank you,\n${companyName}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Modal Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <h2 className="text-xl font-bold text-slate-900">Preview</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100 transition"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Invoice Body (Matches Reference Image 2) */}
        <div className="p-6 max-h-[72vh] overflow-y-auto bg-slate-50/50">
          <div
            ref={printRef}
            className="bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden max-w-3xl mx-auto"
          >
            {/* Header Title */}
            <div className="pt-6 pb-4 px-6 text-center border-b border-slate-100">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-1">
                Invoice
              </p>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                {companyName}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {companyPhone ? `Phone no.: ${companyPhone}` : ''}
                {companyPhone && companyEmail ? ' | ' : ''}
                {companyEmail ? `Email: ${companyEmail}` : ''}
              </p>
            </div>

            {/* Purple Bar: Bill To & Invoice Details */}
            <div className="bg-indigo-600 text-white px-5 py-2.5 flex justify-between items-center text-xs font-bold">
              <span>Bill To</span>
              <span>Invoice Details</span>
            </div>

            {/* Party Details & Invoice No/Date */}
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-start text-xs">
              <div>
                <p className="text-sm font-bold text-slate-900">{billTo}</p>
                {notes && <p className="text-slate-500 mt-1 text-xs">{notes}</p>}
              </div>
              <div className="text-right text-slate-600 space-y-0.5 font-medium">
                <div>
                  Invoice No. : <span className="font-bold text-slate-800">{invoiceNo}</span>
                </div>
                <div>
                  Date : <span className="font-bold text-slate-800">{formatDateDisplay(date)}</span>
                </div>
              </div>
            </div>

            {/* Items Table with Blue/Indigo Header */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-indigo-500 text-white text-xs font-semibold">
                  <tr>
                    <th className="py-2.5 px-4 w-12 text-center">#</th>
                    <th className="py-2.5 px-4">Item name</th>
                    <th className="py-2.5 px-4 text-right">Quantity</th>
                    <th className="py-2.5 px-4 text-center">Unit</th>
                    <th className="py-2.5 px-4 text-right">Price/ Unit</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-center text-slate-400 font-medium">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 border-r border-slate-100">
                        {item.name}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-slate-700 border-r border-slate-100">
                        {item.quantity != null && item.quantity !== ''
                          ? formatNumber(item.quantity)
                          : '-'}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-600 border-r border-slate-100">
                        {item.unit || '-'}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-slate-700 border-r border-slate-100">
                        {item.pricePerUnit ? formatCurrency(item.pricePerUnit) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                  {/* Empty filler rows for clean invoice presentation */}
                  {items.length < 3 &&
                    [...Array(3 - items.length)].map((_, i) => (
                      <tr key={`empty-${i}`} className="h-10">
                        <td className="border-r border-slate-100"></td>
                        <td className="border-r border-slate-100"></td>
                        <td className="border-r border-slate-100"></td>
                        <td className="border-r border-slate-100"></td>
                        <td className="border-r border-slate-100"></td>
                        <td></td>
                      </tr>
                    ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr className="font-bold text-sm">
                    <td colSpan="5" className="py-3 px-4 text-right text-slate-700">
                      Total:
                    </td>
                    <td className="py-3 px-4 text-right text-indigo-700 tabular-nums font-black text-base">
                      {formatCurrency(totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Pill Buttons (Matches Image 2) */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleOpenPdf}
            className="px-5 py-2 rounded-full border border-rose-400 text-rose-600 font-semibold text-xs hover:bg-rose-50 transition shadow-sm"
          >
            Open PDF
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-5 py-2 rounded-full border border-rose-400 text-rose-600 font-semibold text-xs hover:bg-rose-50 transition shadow-sm"
          >
            Print
          </button>
          <button
            type="button"
            onClick={handleSavePdf}
            className="px-5 py-2 rounded-full border border-rose-400 text-rose-600 font-semibold text-xs hover:bg-rose-50 transition shadow-sm"
          >
            Save PDF
          </button>
          <button
            type="button"
            onClick={handleEmailPdf}
            className="px-5 py-2 rounded-full border border-rose-400 text-rose-600 font-semibold text-xs hover:bg-rose-50 transition shadow-sm"
          >
            Email PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-full bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700 transition shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
