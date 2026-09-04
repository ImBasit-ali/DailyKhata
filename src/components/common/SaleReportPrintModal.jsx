import React, { useRef } from 'react';
import { XMarkIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { formatDateDisplay, todayISO } from '@/utils/dateUtils';
import toast from 'react-hot-toast';

export default function SaleReportPrintModal({
  isOpen,
  onClose,
  companyName = 'Gill Petrolium Seervices',
  companyPhone = '3297802314',
  companyEmail = 'basit610476@gmail.com',
  firmName = 'All firms',
  duration = '',
  transactions = [],
  totalSale = 0,
}) {
  const printRef = useRef(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '', 'width=950,height=800');
    if (!printWindow) {
      toast.error('Please allow popups to print report');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sale Report - ${firmName}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
            body { padding: 30px; color: #0f172a; background: #fff; font-size: 12px; }
            .report-container { max-width: 900px; margin: 0 auto; }
            .header-center { text-align: center; margin-bottom: 20px; }
            .company-name { font-size: 22px; font-weight: 800; color: #000; margin-bottom: 4px; }
            .company-contact { font-size: 11px; color: #334155; margin-bottom: 12px; }
            .report-title { font-size: 20px; font-weight: 900; text-decoration: underline; text-underline-offset: 4px; margin-bottom: 16px; }
            .meta-section { margin-bottom: 16px; font-size: 13px; }
            .meta-line { margin-bottom: 6px; }
            .meta-bold { font-weight: 800; font-size: 14px; }
            table.main-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            table.main-table th { background: #f1f5f9; color: #0f172a; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 6px 8px; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; }
            table.main-table th.right { text-align: right; }
            .tx-group { border-bottom: 1px solid #94a3b8; padding-bottom: 12px; margin-bottom: 12px; page-break-inside: avoid; }
            .tx-summary-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; font-weight: 700; font-size: 11.5px; background: #fafafa; }
            .items-subtable { width: 96%; margin: 6px auto 8px auto; border-collapse: collapse; border: 1px solid #e2e8f0; }
            .items-subtable th { background: #f8fafc; font-size: 10px; padding: 4px 6px; border: 1px solid #cbd5e1; font-weight: 700; }
            .items-subtable td { padding: 5px 8px; border: 1px solid #e2e8f0; font-size: 11px; }
            .items-subtable td.right, .items-subtable th.right { text-align: right; }
            .subtotals-box { width: 96%; margin: 0 auto; text-align: right; font-size: 11px; line-height: 1.6; }
            .subtotal-line { display: flex; justify-content: flex-end; gap: 20px; font-weight: 600; }
            .grand-total { font-size: 20px; font-weight: 900; text-align: right; margin-top: 30px; margin-bottom: 40px; }
            .footer-timestamp { font-size: 10px; color: #64748b; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
            @media print {
              body { padding: 0; }
              @page { margin: 12mm; }
            }
          </style>
        </head>
        <body>
          <div class="report-container">
            <div class="header-center">
              <div class="company-name">${companyName}</div>
              <div class="company-contact">${companyPhone ? `Phone no.: ${companyPhone}` : ''} ${companyEmail ? `Email: ${companyEmail}` : ''}</div>
              <div class="report-title">Sale Report</div>
            </div>

            <div class="meta-section">
              <div class="meta-line"><span class="meta-bold">Duration:</span> ${duration || 'All Time'}</div>
              <div class="meta-line"><span class="meta-bold">Firm:</span> ${firmName}</div>
            </div>

            <table class="main-table">
              <thead>
                <tr>
                  <th style="width: 80px;">DATE</th>
                  <th style="width: 70px;">INVOICE NO.</th>
                  <th>PARTY NAME</th>
                  <th>PARTY PHONE NO.</th>
                  <th class="right">TOTAL</th>
                  <th>PAYMENT TYPE</th>
                  <th class="right">RECEIVED / PAID</th>
                  <th class="right">BALANCE DUE</th>
                  <th>PAYMENT STATUS</th>
                </tr>
              </thead>
            </table>

            <div style="margin-top: 8px;">
              ${transactions.map((tx, idx) => {
                const amount = Number(tx.amount || 0);
                const isCredit = !!tx.is_credit;
                const received = isCredit ? 0 : amount;
                const balanceDue = isCredit ? amount : 0;
                const status = isCredit ? 'Unpaid' : 'Paid';
                const invNo = tx.invoice_no || `${idx + 1}`;
                const partyName = tx.customer ? tx.customer.name : (tx.description || 'Cash Customer');
                const partyPhone = tx.customer?.phone || '-';
                const itemName = tx.item_name || (tx.description ? tx.description.split('(')[0].trim() : (tx.tx_type === 'cash_advance' ? 'Advance Payment' : 'Sale Item'));
                const qty = tx.quantity || 1;
                const unit = tx.unit || 'Ltr';
                const rate = tx.rate || (amount / qty);

                return `
                  <div class="tx-group">
                    <div class="tx-summary-row">
                      <div style="width: 80px;">${formatDateDisplay(tx.date)}</div>
                      <div style="width: 70px;">${invNo}</div>
                      <div style="flex: 1.5; font-weight: 700;">${partyName}</div>
                      <div style="flex: 1;">${partyPhone}</div>
                      <div style="width: 100px; text-align: right;">${formatCurrency(amount)}</div>
                      <div style="width: 80px; text-align: center;">${isCredit ? 'Credit' : 'Cash'}</div>
                      <div style="width: 90px; text-align: right;">${formatCurrency(received)}</div>
                      <div style="width: 100px; text-align: right;">${formatCurrency(balanceDue)}</div>
                      <div style="width: 80px; text-align: right; color: ${isCredit ? '#dc2626' : '#16a34a'}; font-weight: 700;">${status}</div>
                    </div>

                    <table class="items-subtable">
                      <thead>
                        <tr>
                          <th style="width: 30px;">#</th>
                          <th>Item name</th>
                          <th class="right">Quantity</th>
                          <th>Unit</th>
                          <th class="right">Price/ Unit</th>
                          <th class="right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style="text-align: center;">1</td>
                          <td style="font-weight: 600;">${itemName}</td>
                          <td class="right">${formatNumber(qty)}</td>
                          <td style="text-align: center;">${unit}</td>
                          <td class="right">${formatCurrency(rate)}</td>
                          <td class="right" style="font-weight: 700;">${formatCurrency(amount)}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div class="subtotals-box">
                      <div class="subtotal-line">
                        <span>Total:</span>
                        <span style="width: 90px; text-align: right;">${formatCurrency(amount)}</span>
                      </div>
                      <div class="subtotal-line" style="color: #64748b;">
                        <span>Sub Total:</span>
                        <span style="width: 90px; text-align: right;">${formatCurrency(amount)}</span>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="grand-total">
              Total Sale: ${formatCurrency(totalSale)}
            </div>

            <div class="footer-timestamp">
              Generated on ${new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSavePdf = () => {
    toast.success('In the print dialog, choose "Save as PDF"');
    handlePrint();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <PrinterIcon className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">Sale Report Print Preview</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100 transition"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Report Preview Body (Exact Match to User's Reference PDF) */}
        <div className="p-6 max-h-[75vh] overflow-y-auto bg-slate-100/70">
          <div
            ref={printRef}
            className="bg-white border border-slate-300 rounded-lg shadow-md p-8 max-w-4xl mx-auto text-slate-900"
          >
            {/* Header: Company Name & Contact */}
            <div className="text-center pb-4">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                {companyName}
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                {companyPhone ? `Phone no.: ${companyPhone}` : ''}{' '}
                {companyEmail ? `Email: ${companyEmail}` : ''}
              </p>
              <h2 className="text-xl font-extrabold text-slate-900 underline underline-offset-4 mt-4">
                Sale Report
              </h2>
            </div>

            {/* Duration and Firm */}
            <div className="border-b border-slate-200 pb-3 mb-4 text-sm font-medium">
              <p>
                <span className="font-bold text-slate-900">Duration:</span>{' '}
                {duration || 'All Recorded Dates'}
              </p>
              <p className="mt-1">
                <span className="font-bold text-slate-900">Firm:</span> {firmName}
              </p>
            </div>

            {/* Column Headers */}
            <div className="grid grid-cols-12 gap-2 py-2 px-3 bg-slate-50 border-y border-slate-300 text-[11px] font-bold text-slate-800 uppercase">
              <div className="col-span-1">Date</div>
              <div className="col-span-1">Inv No.</div>
              <div className="col-span-2">Party Name</div>
              <div className="col-span-2">Party Phone</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1 text-center">Type</div>
              <div className="col-span-1 text-right">Received</div>
              <div className="col-span-2 text-right">Balance Due</div>
              <div className="col-span-1 text-right">Status</div>
            </div>

            {/* Rows with itemized sub-tables */}
            <div className="divide-y divide-slate-200">
              {transactions.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  No sales transactions to display in this report.
                </div>
              ) : (
                transactions.map((tx, idx) => {
                  const amount = Number(tx.amount || 0);
                  const isCredit = !!tx.is_credit;
                  const received = isCredit ? 0 : amount;
                  const balanceDue = isCredit ? amount : 0;
                  const status = isCredit ? 'Unpaid' : 'Paid';
                  const invNo = tx.invoice_no || `${idx + 1}`;
                  const partyName = tx.customer
                    ? tx.customer.name
                    : tx.description || 'Cash / Walk-in';
                  const partyPhone = tx.customer?.phone || '-';
                  const itemName =
                    tx.item_name ||
                    (tx.description
                      ? tx.description.split('(')[0].trim()
                      : tx.tx_type === 'cash_advance'
                      ? 'Advance Payment'
                      : 'Sale Item');
                  const qty = tx.quantity || 1;
                  const unit = tx.unit || 'Ltr';
                  const rate = tx.rate || amount / qty;

                  return (
                    <div key={tx.id || idx} className="py-3 text-xs">
                      {/* Summary Row */}
                      <div className="grid grid-cols-12 gap-2 px-3 py-1 font-semibold text-slate-800 bg-slate-50/50 rounded">
                        <div className="col-span-1 text-slate-600">
                          {formatDateDisplay(tx.date)}
                        </div>
                        <div className="col-span-1 font-mono text-slate-600">
                          {invNo}
                        </div>
                        <div className="col-span-2 font-bold text-slate-900 truncate">
                          {partyName}
                        </div>
                        <div className="col-span-2 text-slate-500">{partyPhone}</div>
                        <div className="col-span-1 text-right tabular-nums">
                          {formatCurrency(amount)}
                        </div>
                        <div className="col-span-1 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isCredit
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-200 text-slate-800'
                            }`}
                          >
                            {isCredit ? 'Credit' : 'Cash'}
                          </span>
                        </div>
                        <div className="col-span-1 text-right tabular-nums text-emerald-700">
                          {formatCurrency(received)}
                        </div>
                        <div className="col-span-2 text-right tabular-nums text-rose-600 font-bold">
                          {formatCurrency(balanceDue)}
                        </div>
                        <div
                          className={`col-span-1 text-right font-bold ${
                            isCredit ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {status}
                        </div>
                      </div>

                      {/* Item Details Sub-table matching Reference Image */}
                      <div className="w-11/12 mx-auto mt-2 border border-slate-200 rounded overflow-hidden">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                            <tr>
                              <th className="py-1 px-3 w-8 text-center">#</th>
                              <th className="py-1 px-3">Item name</th>
                              <th className="py-1 px-3 text-right">Quantity</th>
                              <th className="py-1 px-3 text-center">Unit</th>
                              <th className="py-1 px-3 text-right">Price/ Unit</th>
                              <th className="py-1 px-3 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            <tr>
                              <td className="py-1.5 px-3 text-center text-slate-400">
                                1
                              </td>
                              <td className="py-1.5 px-3 font-medium text-slate-800">
                                {itemName}
                              </td>
                              <td className="py-1.5 px-3 text-right tabular-nums">
                                {formatNumber(qty)}
                              </td>
                              <td className="py-1.5 px-3 text-center text-slate-500">
                                {unit}
                              </td>
                              <td className="py-1.5 px-3 text-right tabular-nums">
                                {formatCurrency(rate)}
                              </td>
                              <td className="py-1.5 px-3 text-right font-bold text-slate-900 tabular-nums">
                                {formatCurrency(amount)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Sub-total summary box */}
                      <div className="w-11/12 mx-auto text-right text-[11px] mt-1 space-y-0.5 text-slate-600 pr-1">
                        <div className="font-bold text-slate-800">
                          Total: <span className="tabular-nums">{formatCurrency(amount)}</span>
                        </div>
                        <div>
                          Sub Total: <span className="tabular-nums">{formatCurrency(amount)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Grand Total */}
            <div className="border-t-2 border-slate-400 pt-6 mt-6 text-right">
              <span className="text-xl sm:text-2xl font-black text-slate-900">
                Total Sale: {formatCurrency(totalSale)}
              </span>
            </div>

            {/* Generated Timestamp */}
            <div className="mt-8 pt-4 border-t border-slate-200 text-slate-400 text-[10px]">
              Generated on{' '}
              {new Date().toLocaleDateString('en-US', {
                month: 'short',
                day: '2-digit',
                year: 'numeric',
              })}{' '}
              at{' '}
              {new Date().toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>

        {/* Footer Pill Buttons matching reference UI */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="px-6 py-2 rounded-full border border-rose-400 text-rose-600 font-semibold text-xs hover:bg-rose-50 transition shadow-sm flex items-center gap-1.5"
          >
            <PrinterIcon className="h-4 w-4" />
            Print Report
          </button>
          <button
            type="button"
            onClick={handleSavePdf}
            className="px-6 py-2 rounded-full border border-rose-400 text-rose-600 font-semibold text-xs hover:bg-rose-50 transition shadow-sm"
          >
            Save PDF
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
