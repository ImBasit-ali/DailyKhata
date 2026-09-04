import React, { useState, useEffect, useMemo } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/lib/supabaseClient';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import LoadingState from '@/components/ui/LoadingState';
import TransactionToolbar from '@/components/common/TransactionToolbar';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import InvoicePreviewModal from '@/components/common/InvoicePreviewModal';
import SaleReportPrintModal from '@/components/common/SaleReportPrintModal';
import QuickAddPartyModal from '@/components/common/QuickAddPartyModal';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { formatDateDisplay, todayISO } from '@/utils/dateUtils';
import { moveToTrash } from '@/utils/trashManager';
import { filterActiveRecords, deleteRecordEntirely } from '@/utils/deletedRecordsManager';
import { getCustomerCategory } from '@/utils/customerCategoryManager';
import { getCompanyCode } from '@/utils/companyUtils';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  BuildingStorefrontIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import ExcelJS from 'exceljs';

export default function SalesPage() {
  const { activeCompany, companies, isAllCompanies } = useCompany();

  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search and Graph Toggles (Image 1)
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState('all'); // all, sale, cash_advance, due_payment, purchase
  const [modeFilter, setModeFilter] = useState('all'); // all, cash, credit
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [formData, setFormData] = useState({
    company_id: '',
    date: todayISO(),
    tx_type: 'sale',
    is_credit: false,
    customer_id: '',
    amount: '',
    description: '',
    sync_ledger: true,
  });

  // Invoice Preview Modal State (Image 2)
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Full Sale Report Print Modal State (PDF Preview)
  const [isReportPrintOpen, setIsReportPrintOpen] = useState(false);
  const [isAddPartyModalOpen, setIsAddPartyModalOpen] = useState(false);

  // Delete State
  const [deleteId, setDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const companyIds = useMemo(() => {
    if (!companies || companies.length === 0) return [];
    if (!isAllCompanies && activeCompany?.id) return [activeCompany.id];
    return companies.map((c) => c.id);
  }, [activeCompany, companies, isAllCompanies]);

  useEffect(() => {
    if (companyIds.length > 0) {
      fetchCustomers().then((custs) => {
        fetchTransactions(custs);
      });
    } else {
      setLoading(false);
    }
  }, [companyIds, typeFilter, modeFilter, startDate, endDate]);

  const fetchCustomers = async () => {
    try {
      let query = supabase
        .from('customers')
        .select('*')
        .order('name');

      if (!isAllCompanies && activeCompany?.id) {
        query = query.eq('company_id', activeCompany.id);
      } else if (companyIds.length > 0) {
        query = query.in('company_id', companyIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      const formatted = (data || []).map((c) => ({
        ...c,
        category: getCustomerCategory(c),
      }));
      setCustomers(formatted);
      return formatted;
    } catch (err) {
      console.error('Failed to load customers:', err);
      return [];
    }
  };

  const fetchTransactions = async (custsList = null) => {
    try {
      setLoading(true);
      let query = supabase
        .from('cash_transactions')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!isAllCompanies && activeCompany?.id) {
        query = query.eq('company_id', activeCompany.id);
      } else if (companyIds.length > 0) {
        query = query.in('company_id', companyIds);
      }

      if (typeFilter !== 'all') {
        query = query.eq('tx_type', typeFilter);
      }

      if (modeFilter === 'cash') {
        query = query.eq('is_credit', false);
      } else if (modeFilter === 'credit') {
        query = query.eq('is_credit', true);
      }

      if (startDate) query = query.gte('date', startDate);
      if (endDate) query = query.lte('date', endDate);

      const { data, error } = await query;
      if (error) throw error;

      // Join customer details safely on client-side
      const currentCusts = custsList || customers;
      const custMap = {};
      currentCusts.forEach((c) => {
        custMap[c.id] = c;
      });

      const activeData = filterActiveRecords(data || []);
      const formattedTxs = activeData.map((tx) => ({
        ...tx,
        customer: tx.customer_id
          ? custMap[tx.customer_id] || {
              id: tx.customer_id,
              name: 'Customer',
              code: 'C',
              category: 'Regular',
            }
          : null,
      }));

      setTransactions(formattedTxs);
    } catch (err) {
      console.error('Error fetching sales transactions:', err);
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (tx = null, isDuplicate = false) => {
    setEditingTx(isDuplicate ? null : tx);
    const targetCompanyId =
      tx?.company_id || (isAllCompanies ? companies[0]?.id : activeCompany?.id);

    if (tx) {
      setFormData({
        company_id: targetCompanyId,
        date: isDuplicate ? todayISO() : tx.date,
        tx_type: tx.tx_type,
        is_credit: !!tx.is_credit,
        customer_id: tx.customer_id || '',
        amount: String(tx.amount || ''),
        description: isDuplicate
          ? `${tx.description || ''} (Copy)`.trim()
          : tx.description || '',
        sync_ledger: false,
      });
    } else {
      setFormData({
        company_id: targetCompanyId,
        date: todayISO(),
        tx_type: 'sale',
        is_credit: false,
        customer_id: '',
        amount: '',
        description: '',
        sync_ledger: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTx(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(formData.amount);

    if (!formData.company_id) {
      toast.error('Please select a company');
      return;
    }

    if (!formData.date) {
      toast.error('Date is required');
      return;
    }

    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount greater than 0');
      return;
    }

    if (formData.is_credit && !formData.customer_id) {
      toast.error('Please select a customer for credit (ادھار) sale');
      return;
    }

    try {
      const payload = {
        company_id: formData.company_id,
        date: formData.date,
        tx_type: formData.tx_type,
        is_credit: formData.is_credit,
        customer_id: formData.customer_id || null,
        amount: numAmount,
        description: formData.description?.trim() || null,
      };

      if (editingTx) {
        const { error } = await supabase
          .from('cash_transactions')
          .update(payload)
          .eq('id', editingTx.id);
        if (error) throw error;
        toast.success('Record updated successfully');
      } else {
        const { error } = await supabase
          .from('cash_transactions')
          .insert([payload]);
        if (error) throw error;

        // Auto-update Customer Ledger
        if (formData.customer_id && formData.sync_ledger) {
          let creditAmount = 0;
          let cashAdvance = 0;
          let defaultDetail = '';

          if (formData.tx_type === 'sale' && formData.is_credit) {
            creditAmount = numAmount;
            defaultDetail = 'Credit Sale (ادھار فروخت)';
          } else if (formData.tx_type === 'cash_advance') {
            cashAdvance = numAmount;
            defaultDetail = 'Advance Payment (پیشگی وصولی)';
          } else if (formData.tx_type === 'due_payment') {
            cashAdvance = numAmount;
            defaultDetail = 'Due Payment (بقایا وصولی)';
          }

          if (creditAmount > 0 || cashAdvance > 0) {
            await supabase.from('ledger_entries').insert([
              {
                company_id: formData.company_id,
                customer_id: formData.customer_id,
                date: formData.date,
                detail: formData.description || defaultDetail,
                credit_amount: creditAmount,
                cash_advance: cashAdvance,
              },
            ]);
          }
        }

        toast.success('Transaction recorded successfully!');
      }

      handleCloseModal();
      fetchTransactions();
    } catch (err) {
      console.error('Error saving transaction:', err);
      toast.error(err.message || 'Failed to save record');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const itemToDelete = transactions.find((t) => t.id === deleteId);
      if (itemToDelete) {
        moveToTrash({
          table: 'cash_transactions',
          itemType: itemToDelete.tx_type === 'sale' ? 'Sale' : 'Advance / Payment',
          title: itemToDelete.description || `Transaction #${itemToDelete.id.slice(0, 6)}`,
          details: `Date: ${formatDateDisplay(itemToDelete.date)} - Type: ${itemToDelete.tx_type}`,
          amount: Number(itemToDelete.amount || 0),
          company_id: itemToDelete.company_id,
          originalData: itemToDelete,
        });
      }

      await deleteRecordEntirely(deleteId, 'cash_transactions');
      toast.success('Record deleted from database');
      setDeleteId(null);
      fetchTransactions();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete transaction');
    } finally {
      setIsDeleting(false);
    }
  };

  // Preview Invoice Handler (Reference Image 2)
  const handleOpenPreview = (tx) => {
    const comp = companies.find((c) => c.id === tx.company_id) || activeCompany;
    let typeName = 'General Sale';
    if (tx.tx_type === 'cash_advance') typeName = 'Advance Payment';
    else if (tx.tx_type === 'due_payment') typeName = 'Due Payment';
    else if (tx.tx_type === 'purchase') typeName = 'Purchase';

    setPreviewData({
      companyName: comp?.name || 'Vyapar Business Services',
      companyPhone: comp?.phone || '',
      companyEmail: comp?.email || '',
      billTo: tx.customer
        ? `${tx.customer.name} (${tx.customer.code})`
        : 'Walk-in / Cash Customer',
      invoiceNo: `INV-${tx.id.slice(0, 6).toUpperCase()}`,
      date: tx.date,
      items: [
        {
          name:
            tx.description ||
            `${typeName} (${tx.is_credit ? 'Credit ادھار' : 'Cash نقد'})`,
          quantity: 1,
          unit: 'Trans',
          pricePerUnit: Number(tx.amount),
          amount: Number(tx.amount),
        },
      ],
      totalAmount: Number(tx.amount),
      notes: tx.description,
    });
    setIsPreviewOpen(true);
  };

  // Search across all columns (Date, Type, Mode, Customer, Code, Description, Amount)
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase().trim();

    return transactions.filter((tx) => {
      const dateStr = formatDateDisplay(tx.date).toLowerCase();
      const typeStr = (tx.tx_type || '').toLowerCase();
      const modeStr = tx.is_credit ? 'credit ادھار' : 'cash نقد';
      const custName = (tx.customer?.name || '').toLowerCase();
      const custCode = (tx.customer?.code || '').toLowerCase();
      const descStr = (tx.description || '').toLowerCase();
      const amtStr = String(tx.amount || '');

      return (
        dateStr.includes(q) ||
        typeStr.includes(q) ||
        modeStr.includes(q) ||
        custName.includes(q) ||
        custCode.includes(q) ||
        descStr.includes(q) ||
        amtStr.includes(q)
      );
    });
  }, [transactions, searchQuery]);

  // Chart data for graph toggle
  const graphData = useMemo(() => {
    const map = {};
    filteredTransactions.forEach((tx) => {
      const d = formatDateDisplay(tx.date);
      if (!map[d]) {
        map[d] = { date: d, sales: 0, advances: 0, dues: 0 };
      }
      const amt = Number(tx.amount || 0);
      if (tx.tx_type === 'sale') map[d].sales += amt;
      else if (tx.tx_type === 'cash_advance') map[d].advances += amt;
      else if (tx.tx_type === 'due_payment') map[d].dues += amt;
    });
    return Object.values(map).reverse().slice(-14);
  }, [filteredTransactions]);

  // Export to Excel (.xls)
  const exportToExcel = async () => {
    if (filteredTransactions.length === 0) {
      toast.error('No transactions to export');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sales & Payments');

    sheet.columns = [
      { header: 'S.N.', key: 'sn', width: 8 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Type', key: 'type', width: 18 },
      { header: 'Mode', key: 'mode', width: 14 },
      { header: 'Customer / Party', key: 'customer', width: 24 },
      { header: 'Description', key: 'desc', width: 28 },
      { header: 'Amount (Rs)', key: 'amount', width: 18 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' },
    };
    sheet.getRow(1).height = 26;

    filteredTransactions.forEach((tx, idx) => {
      let typeLabel = 'Sale';
      if (tx.tx_type === 'cash_advance') typeLabel = 'Advance Payment';
      else if (tx.tx_type === 'due_payment') typeLabel = 'Due Payment';
      else if (tx.tx_type === 'purchase') typeLabel = 'Purchase';

      sheet.addRow({
        sn: idx + 1,
        date: formatDateDisplay(tx.date),
        type: typeLabel,
        mode: tx.is_credit ? 'Credit (ادھار)' : 'Cash (نقد)',
        customer: tx.customer ? tx.customer.name : 'Walk-in / Cash',
        desc: tx.description || '-',
        amount: Number(tx.amount),
      });
    });

    const totalRow = sheet.addRow([]);
    totalRow.getCell(1).value = 'TOTAL';
    totalRow.font = { bold: true };
    totalRow.getCell(7).value = {
      formula: `SUM(G2:G${filteredTransactions.length + 1})`,
    };
    totalRow.getCell(7).numFmt = '#,##0.00';

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCompany?.name || 'Company'}_Sales_${todayISO()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Excel report exported!');
  };

  // Open Full Sale Report Print Modal matching Reference PDF
  const handlePrintTable = () => {
    setIsReportPrintOpen(true);
  };

  // Summary calculations
  const totalSales = filteredTransactions
    .filter((t) => t.tx_type === 'sale')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const cashSales = filteredTransactions
    .filter((t) => t.tx_type === 'sale' && !t.is_credit)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const creditSales = filteredTransactions
    .filter((t) => t.tx_type === 'sale' && t.is_credit)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalAdvances = filteredTransactions
    .filter((t) => t.tx_type === 'cash_advance')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalDuesPaid = filteredTransactions
    .filter((t) => t.tx_type === 'due_payment')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  if (!activeCompany && (!companies || companies.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-96 p-6">
        <BuildingStorefrontIcon className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-700">No Company Selected</h2>
        <p className="mt-2 text-sm text-slate-400">
          Please select or create a company to manage sales and advances.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Sales & Advance Payments
            </h1>
            {isAllCompanies && (
              <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                All Companies
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAllCompanies ? 'All Companies' : activeCompany.name} — Record daily cash/credit sales and customer advance receipts
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleOpenModal()}
          className="btn-primary text-xs shadow-sm self-start sm:self-auto"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Record Sale / Payment
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card border-l-4 border-l-emerald-500 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total Sales (فروخت)
          </p>
          <p className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
            {formatCurrency(totalSales)}
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-1.5">
            <span>Cash: {formatCurrency(cashSales, false)}</span>
            <span className="text-amber-600 font-medium">Credit: {formatCurrency(creditSales, false)}</span>
          </div>
        </div>

        <div className="stat-card border-l-4 border-l-blue-500 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Advance Received (پیشگی)
          </p>
          <p className="text-lg sm:text-xl font-bold text-blue-600 mt-0.5 tabular-nums">
            {formatCurrency(totalAdvances)}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400 border-t border-slate-100 pt-1.5 truncate">
            Advance cash paid by customers
          </p>
        </div>

        <div className="stat-card border-l-4 border-l-amber-500 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Dues Cleared (بقایا وصولی)
          </p>
          <p className="text-lg sm:text-xl font-bold text-amber-600 mt-0.5 tabular-nums">
            {formatCurrency(totalDuesPaid)}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400 border-t border-slate-100 pt-1.5 truncate">
            Customer balance repayments
          </p>
        </div>

        <div className="stat-card border-l-4 border-l-indigo-500 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Net Cash Intake
          </p>
          <p className="text-lg sm:text-xl font-bold text-indigo-700 mt-0.5 tabular-nums">
            {formatCurrency(cashSales + totalAdvances + totalDuesPaid)}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400 border-t border-slate-100 pt-1.5 truncate">
            Cash in hand from operations
          </p>
        </div>
      </div>

      {/* Embedded Graph when toggled (Reference Image 1) */}
      {showGraph && graphData.length > 0 && (
        <div className="card p-6 border border-indigo-100 bg-gradient-to-b from-white to-slate-50/50 animate-in fade-in duration-200">
          <h3 className="text-sm font-bold text-slate-800 mb-4">
            Recent Transactions Trend (Sales, Advances & Dues)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graphData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => formatCurrency(value)}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
                <Legend />
                <Bar dataKey="sales" name="Sales (فروخت)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="advances" name="Advances (پیشگی)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="dues" name="Dues Paid" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter and Action Toolbar */}
      <div className="card p-4">
        <div className="flex flex-col gap-3">
          {/* Top Row: Type and Mode Selectors + Action Icons (Image 1) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1.5">
                <FunnelIcon className="h-4 w-4 text-slate-400" />
                Filter:
              </span>

              {/* Type selector */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-xs font-medium border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="sale">Sales Only (فروخت)</option>
                <option value="cash_advance">Advance Payments (پیشگی)</option>
                <option value="due_payment">Due Payments (بقایا وصولی)</option>
                <option value="purchase">Purchases (خریداری)</option>
              </select>

              {/* Mode selector */}
              <select
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
                className="text-xs font-medium border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="all">All Modes (Cash & Credit)</option>
                <option value="cash">Cash Only (نقد)</option>
                <option value="credit">Credit Only (ادھار)</option>
              </select>
            </div>

            {/* Header Action Icons matching Reference Image 1 (Search, Graph, XLS, Print) */}
            <TransactionToolbar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              showSearch={showSearch}
              onToggleSearch={() => setShowSearch(!showSearch)}
              showGraph={showGraph}
              onToggleGraph={() => setShowGraph(!showGraph)}
              onExportExcel={exportToExcel}
              onPrintTable={handlePrintTable}
              searchPlaceholder="Search date, type, customer, notes, amount..."
            />
          </div>

          {/* Date Range Row */}
          <div className="flex items-center gap-2 text-xs border-t border-slate-100 pt-2.5">
            <span className="text-slate-500 font-medium">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-700 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-700 focus:ring-indigo-500 focus:outline-none"
            />
            {(startDate || endDate || typeFilter !== 'all' || modeFilter !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setTypeFilter('all');
                  setModeFilter('all');
                  setSearchQuery('');
                }}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 ml-2"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Transactions Data Table */}
      {loading ? (
        <LoadingState />
      ) : filteredTransactions.length === 0 ? (
        <EmptyState
          title="No Sales or Payments Recorded"
          message={
            searchQuery
              ? 'No transactions found matching your search term.'
              : 'Record your daily cash and credit sales, advance receipts, and customer payments.'
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left divide-y divide-slate-200">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-600 tracking-wider">
                <tr>
                  <th className="px-3.5 py-2 w-12">S.N.</th>
                  <th className="px-3.5 py-2">Date</th>
                  {isAllCompanies && <th className="px-3.5 py-2">Company Code (فرم کوڈ)</th>}
                  <th className="px-3.5 py-2">Type</th>
                  <th className="px-3.5 py-2">Payment Mode</th>
                  <th className="px-3.5 py-2">Customer / Party</th>
                  <th className="px-3.5 py-2">Description</th>
                  <th className="px-3.5 py-2 text-right">Balance / Amount</th>
                  <th className="px-3.5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredTransactions.map((tx, idx) => {
                  const isSale = tx.tx_type === 'sale';
                  const isAdvance = tx.tx_type === 'cash_advance';
                  const isDue = tx.tx_type === 'due_payment';
                  const isPurchase = tx.tx_type === 'purchase';
                  const comp = companies.find((c) => c.id === tx.company_id);
                  const firmCode = getCompanyCode(comp?.name) || '-';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3.5 py-2 tabular-nums text-xs text-slate-500 font-medium">
                        {idx + 1}
                      </td>

                      <td className="px-3.5 py-2 text-xs text-slate-700 whitespace-nowrap">
                        {formatDateDisplay(tx.date)}
                      </td>

                      {isAllCompanies && (
                        <td className="px-3.5 py-2 text-xs font-mono font-bold text-indigo-700 whitespace-nowrap">
                          <span className="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-xs" title={comp?.name}>
                            {firmCode}
                          </span>
                        </td>
                      )}

                      {/* Type Badge */}
                      <td className="px-3.5 py-2 text-xs whitespace-nowrap">
                        {isSale && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Sale (فروخت)
                          </span>
                        )}
                        {isAdvance && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                            Advance (پیشگی)
                          </span>
                        )}
                        {isDue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            Due Payment (ادائیگی)
                          </span>
                        )}
                        {isPurchase && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            Purchase (خرید)
                          </span>
                        )}
                      </td>

                      {/* Cash vs Credit */}
                      <td className="px-3.5 py-2 text-xs whitespace-nowrap">
                        {tx.is_credit ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">
                            Credit (ادھار)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            Cash (نقد)
                          </span>
                        )}
                      </td>

                      {/* Customer info */}
                      <td className="px-3.5 py-2 text-xs text-slate-900 whitespace-nowrap font-medium">
                        {tx.customer ? (
                          <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                            {tx.customer.name}
                            {tx.customer.category && (
                              <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded font-medium">
                                {tx.customer.category}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic font-normal text-xs">
                            Cash / Walk-in
                          </span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="px-3.5 py-2 text-xs text-slate-600 max-w-xs truncate">
                        {tx.description || '-'}
                      </td>

                      {/* Amount / Balance column */}
                      <td className="px-3.5 py-2 text-xs text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(tx.amount)}
                      </td>

                      {/* Actions Column */}
                      <td className="px-3.5 py-2 text-xs text-right whitespace-nowrap relative overflow-visible">
                        <RowActionsMenu
                          onViewEdit={() => handleOpenModal(tx)}
                          onPreview={() => handleOpenPreview(tx)}
                          onPrint={() => handleOpenPreview(tx)}
                          onShare={() => {
                            navigator.clipboard.writeText(
                              `Transaction of ${formatCurrency(tx.amount)} on ${formatDateDisplay(tx.date)}`
                            );
                            toast.success('Transaction details copied to clipboard!');
                          }}
                          onDuplicate={() => handleOpenModal(tx, true)}
                          onDelete={() => setDeleteId(tx.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record / Edit Sale Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingTx ? 'Edit Transaction' : 'Record Sale / Payment'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company Selector (if All Companies is active) */}
          {isAllCompanies && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Company (کمپنی منتخب کریں)
              </label>
              <select
                value={formData.company_id}
                onChange={(e) =>
                  setFormData({ ...formData, company_id: e.target.value })
                }
                className="w-full border-slate-300 rounded-lg p-2 border text-sm font-semibold text-slate-800"
                required
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Transaction Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Transaction Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, tx_type: 'sale' })}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center ${
                  formData.tx_type === 'sale'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Sale (فروخت)
              </button>

              <button
                type="button"
                onClick={() =>
                  setFormData({ ...formData, tx_type: 'cash_advance', is_credit: false })
                }
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center ${
                  formData.tx_type === 'cash_advance'
                    ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Advance Payment (پیشگی)
              </button>

              <button
                type="button"
                onClick={() =>
                  setFormData({ ...formData, tx_type: 'due_payment', is_credit: false })
                }
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center ${
                  formData.tx_type === 'due_payment'
                    ? 'border-amber-600 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Due Payment (بقایا وصولی)
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, tx_type: 'purchase' })}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center ${
                  formData.tx_type === 'purchase'
                    ? 'border-rose-600 bg-rose-50 text-rose-800 ring-2 ring-rose-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                General Purchase (خرید)
              </button>
            </div>
          </div>

          {/* Date & Payment Mode (Cash vs Credit) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date
              </label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full border-slate-300 rounded-lg p-2 border text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Payment Mode
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_credit: false })}
                  className={`flex-1 py-2 px-2 text-xs font-medium rounded-lg border text-center transition ${
                    !formData.is_credit
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Cash (نقد)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_credit: true })}
                  className={`flex-1 py-2 px-2 text-xs font-medium rounded-lg border text-center transition ${
                    formData.is_credit
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Credit (ادھار)
                </button>
              </div>
            </div>
          </div>

          {/* Customer / Party Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">
                Party / Customer (پارٹی منتخب کریں)
              </label>
              <div className="flex items-center gap-2">
                {formData.is_credit && (
                  <span className="text-xs text-orange-600 font-semibold">
                    Required for Credit (ادھار)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsAddPartyModalOpen(true)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <PlusIcon className="h-3 w-3" />
                  + Add Party
                </button>
              </div>
            </div>
            <select
              value={formData.customer_id}
              onChange={(e) =>
                setFormData({ ...formData, customer_id: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-2 border text-sm focus:ring-indigo-500 focus:border-indigo-500 font-medium"
            >
              <option value="">-- General Walk-in / Cash Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.category || 'Regular'}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Amount (Rs)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full border-slate-300 rounded-lg p-2 border text-sm font-bold text-slate-800 focus:ring-indigo-500 focus:border-indigo-500"
            />
            {formData.amount && (
              <p className="text-xs text-indigo-600 mt-1 font-medium">
                {formatCurrency(formData.amount)}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description / Notes (تفصیل)
            </label>
            <input
              type="text"
              placeholder="e.g. Daily shop counter sales, advance for bulk order..."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-2 border text-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Sync to Customer Ledger Checkbox */}
          {formData.customer_id && !editingTx && (
            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-lg flex items-start gap-2">
              <input
                id="sync_ledger"
                type="checkbox"
                checked={formData.sync_ledger}
                onChange={(e) =>
                  setFormData({ ...formData, sync_ledger: e.target.checked })
                }
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="sync_ledger" className="text-xs text-indigo-900 leading-snug">
                <span className="font-semibold">Auto-update Customer Ledger:</span>{' '}
                Also add this transaction directly to this customer's ledger entry so their running balance (بقایا) updates automatically.
              </label>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-indigo-600 text-white px-5 py-2 text-sm font-semibold rounded-lg hover:bg-indigo-700 transition shadow-sm"
            >
              {editingTx ? 'Save Changes' : 'Record Transaction'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This action cannot be undone."
        isLoading={isDeleting}
      />

      {/* Full Invoice Preview Modal matching Image 2 */}
      <InvoicePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        data={previewData}
      />

      {/* Full Sale Report Print Preview matching Reference PDF */}
      <SaleReportPrintModal
        isOpen={isReportPrintOpen}
        onClose={() => setIsReportPrintOpen(false)}
        companyName={isAllCompanies ? 'Gill Petrolium Seervices' : (activeCompany?.name || 'Gill Petrolium Seervices')}
        companyPhone={activeCompany?.phone || '3297802314'}
        companyEmail={activeCompany?.email || 'basit610476@gmail.com'}
        firmName={isAllCompanies ? 'All firms' : (activeCompany?.name || 'All firms')}
        duration={
          startDate && endDate
            ? `From ${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)}`
            : 'From 01/01/2026 to 31/12/2026'
        }
        transactions={filteredTransactions}
        totalSale={totalSales}
      />

      {/* Quick Add Party Modal */}
      <QuickAddPartyModal
        isOpen={isAddPartyModalOpen}
        onClose={() => setIsAddPartyModalOpen(false)}
        defaultCompanyId={formData.company_id || (isAllCompanies ? companies[0]?.id : activeCompany?.id)}
        companies={companies}
        isAllCompanies={isAllCompanies}
        onPartyCreated={(newParty) => {
          fetchCustomers().then((updatedList) => {
            fetchTransactions(updatedList);
          });
          setFormData((prev) => ({
            ...prev,
            customer_id: newParty.id,
          }));
        }}
      />
    </div>
  );
}
