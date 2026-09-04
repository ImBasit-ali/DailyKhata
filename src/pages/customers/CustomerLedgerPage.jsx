import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/lib/supabaseClient';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LoadingState from '@/components/ui/LoadingState';
import TransactionToolbar from '@/components/common/TransactionToolbar';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import InvoicePreviewModal from '@/components/common/InvoicePreviewModal';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { formatDateDisplay, todayISO } from '@/utils/dateUtils';
import { moveToTrash } from '@/utils/trashManager';
import { filterActiveRecords, deleteRecordEntirely } from '@/utils/deletedRecordsManager';
import toast from 'react-hot-toast';
import {
  ArrowLeftIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import ExcelJS from 'exceljs';

export default function CustomerLedgerPage() {
  const params = useParams();
  const id = params.customerId || params.id;
  const navigate = useNavigate();
  const { activeCompany, companies } = useCompany();

  const [customer, setCustomer] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Graph Toggles (Image 1)
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [dateFilter, setDateFilter] = useState('');

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formData, setFormData] = useState({
    date: todayISO(),
    detail: '',
    credit_amount: '',
    cash_advance: '',
  });

  // Invoice Preview Modal (Image 2)
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Delete State
  const [deleteId, setDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchCustomerAndLedger();
    }
  }, [id, dateFilter, activeCompany]);

  const fetchCustomerAndLedger = async () => {
    try {
      setLoading(true);

      // Fetch customer
      const { data: customerData, error: custError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();

      if (custError) throw custError;
      setCustomer(customerData);

      // Fetch ledger
      let query = supabase
        .from('customer_ledger_with_balance')
        .select('*')
        .eq('customer_id', id)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

      if (dateFilter) {
        query = query.eq('date', dateFilter);
      }

      const { data: ledgerData, error: ledgerError } = await query;
      if (ledgerError) throw ledgerError;

      setLedger(filterActiveRecords(ledgerData || []));
    } catch (error) {
      console.error(error);
      toast.error('Failed to load customer ledger');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (entry = null, isDuplicate = false) => {
    setEditingEntry(isDuplicate ? null : entry);
    setFormData(
      entry
        ? {
            date: isDuplicate ? todayISO() : entry.date,
            detail: isDuplicate
              ? `${entry.detail || ''} (Copy)`.trim()
              : entry.detail || '',
            credit_amount: entry.credit_amount ? String(entry.credit_amount) : '',
            cash_advance: entry.cash_advance ? String(entry.cash_advance) : '',
          }
        : {
            date: todayISO(),
            detail: '',
            credit_amount: '',
            cash_advance: '',
          }
    );
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.credit_amount && !formData.cash_advance) {
      toast.error('Please provide either credit amount or cash advance');
      return;
    }

    try {
      const payload = {
        company_id: customer?.company_id || activeCompany?.id,
        customer_id: id,
        date: formData.date,
        detail: formData.detail,
        credit_amount: formData.credit_amount
          ? parseFloat(formData.credit_amount)
          : 0,
        cash_advance: formData.cash_advance
          ? parseFloat(formData.cash_advance)
          : 0,
      };

      if (editingEntry) {
        const { error } = await supabase
          .from('ledger_entries')
          .update(payload)
          .eq('id', editingEntry.id);
        if (error) throw error;
        toast.success('Entry updated');
      } else {
        const { error } = await supabase.from('ledger_entries').insert([payload]);
        if (error) throw error;
        toast.success('Entry added');
      }
      setIsModalOpen(false);
      fetchCustomerAndLedger();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to save entry');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const itemToDelete = ledger.find((l) => l.id === deleteId);
      if (itemToDelete) {
        moveToTrash({
          table: 'ledger_entries',
          itemType: 'Ledger Entry',
          title: itemToDelete.detail || 'Ledger Entry',
          details: `Date: ${formatDateDisplay(itemToDelete.date)} - Customer: ${customer?.name || ''}`,
          amount: Number(itemToDelete.credit_amount || itemToDelete.cash_advance || 0),
          company_id: itemToDelete.company_id || customer?.company_id,
          originalData: itemToDelete,
        });
      }

      await deleteRecordEntirely(deleteId, 'ledger_entries');
      toast.success('Record deleted from database');
      setDeleteId(null);
      fetchCustomerAndLedger();
    } catch (err) {
      toast.error('Failed to delete entry');
    } finally {
      setIsDeleting(false);
    }
  };

  // Preview Invoice Handler (Reference Image 2)
  const handleOpenPreview = (entry) => {
    const comp =
      companies.find((c) => c.id === customer?.company_id) || activeCompany;
    const isCredit = Number(entry.credit_amount || 0) > 0;
    const amount = isCredit
      ? Number(entry.credit_amount)
      : Number(entry.cash_advance);

    setPreviewData({
      companyName: comp?.name || 'DailyKhata Business Services',
      companyPhone: comp?.phone || '',
      companyEmail: comp?.email || '',
      billTo: customer
        ? `${customer.name} (${customer.code})`
        : 'Customer Account',
      invoiceNo: `LED-${entry.id.slice(0, 6).toUpperCase()}`,
      date: entry.date,
      items: [
        {
          name:
            entry.detail ||
            (isCredit ? 'Credit Sale (ادھار مال)' : 'Advance / Payment (وصولی)'),
          quantity: 1,
          unit: 'Trans',
          pricePerUnit: amount,
          amount: amount,
        },
      ],
      totalAmount: amount,
      notes: `Running Balance after transaction: ${formatCurrency(
        entry.running_balance
      )}`,
    });
    setIsPreviewOpen(true);
  };

  // Search across all columns
  const filteredLedger = useMemo(() => {
    if (!searchQuery.trim()) return ledger;
    const q = searchQuery.toLowerCase().trim();

    return ledger.filter((entry) => {
      const d = formatDateDisplay(entry.date).toLowerCase();
      const det = (entry.detail || '').toLowerCase();
      const cr = String(entry.credit_amount || '');
      const adv = String(entry.cash_advance || '');
      const bal = String(entry.running_balance || '');

      return (
        d.includes(q) ||
        det.includes(q) ||
        cr.includes(q) ||
        adv.includes(q) ||
        bal.includes(q)
      );
    });
  }, [ledger, searchQuery]);

  // Graph Data
  const graphData = useMemo(() => {
    return filteredLedger.slice(-15).map((e) => ({
      date: formatDateDisplay(e.date),
      credit: Number(e.credit_amount || 0),
      advance: Number(e.cash_advance || 0),
      balance: Number(e.running_balance || 0),
    }));
  }, [filteredLedger]);

  // Export to Excel (.xls)
  const exportToExcel = async () => {
    if (filteredLedger.length === 0) {
      toast.error('No ledger entries to export');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ledger');

    sheet.columns = [
      { header: 'S.N.', key: 'sn', width: 8 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Detail (تفصیل)', key: 'detail', width: 32 },
      { header: 'Credit (جمع / ادھار)', key: 'credit', width: 18 },
      { header: 'Cash Advance (پیشگی وصولی)', key: 'advance', width: 22 },
      { header: 'Running Balance (بقایا)', key: 'balance', width: 18 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' },
    };
    sheet.getRow(1).height = 26;

    filteredLedger.forEach((entry, idx) => {
      sheet.addRow({
        sn: idx + 1,
        date: formatDateDisplay(entry.date),
        detail: entry.detail || '-',
        credit: Number(entry.credit_amount || 0),
        advance: Number(entry.cash_advance || 0),
        balance: Number(entry.running_balance || 0),
      });
    });

    const totalRow = sheet.addRow([]);
    totalRow.getCell(1).value = 'TOTAL';
    totalRow.font = { bold: true };
    totalRow.getCell(4).value = {
      formula: `SUM(D2:D${filteredLedger.length + 1})`,
    };
    totalRow.getCell(5).value = {
      formula: `SUM(E2:E${filteredLedger.length + 1})`,
    };
    totalRow.getCell(6).value =
      filteredLedger.length > 0
        ? Number(filteredLedger[filteredLedger.length - 1].running_balance)
        : 0;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${customer?.name || 'Customer'}_Ledger_${todayISO()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Customer ledger exported to Excel!');
  };

  const handlePrintTable = () => {
    const printWindow = window.open('', '', 'width=900,height=750');
    if (!printWindow) {
      toast.error('Please allow popups to print');
      return;
    }

    const compName = customer?.company?.name || activeCompany?.name || 'DailyKhata Business Services';
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Customer Ledger - ${customer?.name || 'Customer'}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f3f4f6; }
            .right { text-align: right; }
            .header { text-align: center; margin-bottom: 20px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${compName}</h2>
            <h3>Ledger Statement: ${customer?.name || 'Customer'}</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Detail</th>
                <th class="right">Credit</th>
                <th class="right">Advance</th>
                <th class="right">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLedger.map(entry => `
                <tr>
                  <td>${formatDateDisplay(entry.date)}</td>
                  <td>${entry.detail || '-'}</td>
                  <td class="right">${entry.credit_amount ? formatCurrency(entry.credit_amount) : '-'}</td>
                  <td class="right">${entry.cash_advance ? formatCurrency(entry.cash_advance) : '-'}</td>
                  <td class="right">${formatCurrency(entry.running_balance)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const currentBalance =
    ledger.length > 0 ? Number(ledger[ledger.length - 1].running_balance) : 0;
  const totalCredit = ledger.reduce(
    (sum, l) => sum + Number(l.credit_amount || 0),
    0
  );
  const totalAdvance = ledger.reduce(
    (sum, l) => sum + Number(l.cash_advance || 0),
    0
  );

  return (
    <div className="p-4 space-y-4">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {customer?.name || 'Customer Ledger'}
              </h1>
              {customer?.category && (
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold border border-indigo-100">
                  {customer.category}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Running ledger statement & balance details
            </p>
          </div>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="btn-primary text-xs shadow-sm self-start sm:self-auto flex items-center gap-1.5"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add Ledger Entry
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="stat-card border-l-4 border-l-rose-500 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">
            Total Credit Given (کُل ادھار)
          </p>
          <p className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
            {formatCurrency(totalCredit)}
          </p>
        </div>

        <div className="stat-card border-l-4 border-l-emerald-500 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">
            Total Advances Received (کُل وصولی)
          </p>
          <p className="text-lg sm:text-xl font-bold text-emerald-600 mt-0.5 tabular-nums">
            {formatCurrency(totalAdvance)}
          </p>
        </div>

        <div className="stat-card border-l-4 border-l-indigo-500 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">
            Net Running Balance (خالص بقایا)
          </p>
          <p
            className={`text-lg sm:text-xl font-bold mt-0.5 tabular-nums ${
              currentBalance > 0
                ? 'text-rose-600'
                : currentBalance < 0
                ? 'text-emerald-600'
                : 'text-slate-900'
            }`}
          >
            {formatCurrency(currentBalance)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            {currentBalance > 0
              ? 'Receivable from customer (واجب الادا)'
              : currentBalance < 0
              ? 'Advance in hand (گاہک کی پیشگی رقم)'
              : 'Cleared (حساب صاف ہے)'}
          </p>
        </div>
      </div>

      {/* Embedded Chart if toggled (Image 1) */}
      {showGraph && graphData.length > 0 && (
        <div className="card p-6 border border-indigo-100 animate-in fade-in duration-150">
          <h3 className="text-sm font-bold text-slate-800 mb-4">
            Customer Credit vs Advance Activity
          </h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graphData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="credit" name="Credit (جمع)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="advance" name="Advance (وصولی)" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Toolbar matching Reference Image 1 */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Date:
            </span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-indigo-500 focus:outline-none"
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="text-xs text-indigo-600 font-medium hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Action Icons matching Image 1 */}
          <TransactionToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showSearch={showSearch}
            onToggleSearch={() => setShowSearch(!showSearch)}
            showGraph={showGraph}
            onToggleGraph={() => setShowGraph(!showGraph)}
            onExportExcel={exportToExcel}
            onPrintTable={handlePrintTable}
            searchPlaceholder="Search detail, amounts, balance..."
          />
        </div>
      </div>

      {/* Ledger Table */}
      {loading ? (
        <LoadingState />
      ) : filteredLedger.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl shadow-sm border border-slate-200 text-slate-500">
          No ledger entries found.
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-slate-200">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-12">
                  S.N.
                </th>
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Detail (تفصیل)
                </th>
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider text-right">
                  Credit (جمع)
                </th>
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider text-right">
                  Cash Advance (پیشگی)
                </th>
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider text-right">
                  Balance (بقایا)
                </th>
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLedger.map((entry, idx) => (
                <tr key={entry.id} className="hover:bg-slate-50 transition">
                  <td className="px-3.5 py-2 tabular-nums text-xs text-slate-500 font-medium">
                    {idx + 1}
                  </td>
                  <td className="px-3.5 py-2 text-xs text-slate-600 whitespace-nowrap">
                    {formatDateDisplay(entry.date)}
                  </td>
                  <td className="px-3.5 py-2 text-xs font-medium text-slate-900 max-w-sm truncate">
                    {entry.detail || '-'}
                  </td>
                  <td className="px-3.5 py-2 text-right tabular-nums text-xs font-medium text-slate-700">
                    {entry.credit_amount
                      ? formatCurrency(entry.credit_amount)
                      : '-'}
                  </td>
                  <td className="px-3.5 py-2 text-right tabular-nums text-xs font-medium text-emerald-600">
                    {entry.cash_advance
                      ? formatCurrency(entry.cash_advance)
                      : '-'}
                  </td>
                  <td className="px-3.5 py-2 text-right tabular-nums text-xs font-bold whitespace-nowrap">
                    <span
                      className={
                        Number(entry.running_balance) > 0
                          ? 'text-rose-600'
                          : Number(entry.running_balance) < 0
                          ? 'text-emerald-600'
                          : 'text-slate-900'
                      }
                    >
                      {formatCurrency(entry.running_balance)}
                    </span>
                  </td>

                  {/* Actions matching Image 1 */}
                  <td className="px-3.5 py-2 text-right whitespace-nowrap relative overflow-visible">
                    <RowActionsMenu
                      onViewEdit={() => handleOpenModal(entry)}
                      onPreview={() => handleOpenPreview(entry)}
                      onPrint={() => handleOpenPreview(entry)}
                      onShare={() => {
                        navigator.clipboard.writeText(
                          `Ledger entry: ${entry.detail} on ${formatDateDisplay(entry.date)}, Balance: ${formatCurrency(entry.running_balance)}`
                        );
                        toast.success('Entry copied to clipboard!');
                      }}
                      onDuplicate={() => handleOpenModal(entry, true)}
                      onDelete={() => setDeleteId(entry.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Entry Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEntry ? 'Edit Ledger Entry' : 'Add Ledger Entry'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) =>
                setFormData({ ...formData, date: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-2 border text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Detail / Description (تفصیل)
            </label>
            <input
              type="text"
              placeholder="e.g. Fuel delivery on credit, Cash installment received..."
              value={formData.detail}
              onChange={(e) =>
                setFormData({ ...formData, detail: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-2 border text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Credit (جمع / ادھار دیا)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.credit_amount}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    credit_amount: e.target.value,
                    cash_advance: e.target.value ? '' : formData.cash_advance,
                  })
                }
                className="w-full border-slate-300 rounded-lg p-2 border text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Cash Advance (پیشگی وصولی)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.cash_advance}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cash_advance: e.target.value,
                    credit_amount: e.target.value ? '' : formData.credit_amount,
                  })
                }
                className="w-full border-slate-300 rounded-lg p-2 border text-sm"
              />
            </div>
          </div>

          <p className="text-xs text-slate-400">
            * Fill Credit if you sold goods on credit, or Cash Advance if you received cash from the customer.
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 transition shadow-sm font-semibold text-sm"
            >
              {editingEntry ? 'Save Changes' : 'Save Entry'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Ledger Entry"
        message="Are you sure you want to delete this entry? Running balances will be recalculated automatically."
        isLoading={isDeleting}
      />

      {/* Invoice Preview Modal (Reference Image 2) */}
      <InvoicePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        data={previewData}
      />
    </div>
  );
}
