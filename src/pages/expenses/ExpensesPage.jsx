import React, { useState, useEffect, useMemo } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/lib/supabaseClient';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LoadingState from '@/components/ui/LoadingState';
import TransactionToolbar from '@/components/common/TransactionToolbar';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import InvoicePreviewModal from '@/components/common/InvoicePreviewModal';
import QuickAddPartyModal from '@/components/common/QuickAddPartyModal';
import { formatCurrency } from '@/utils/formatters';
import { formatDateDisplay, todayISO } from '@/utils/dateUtils';
import { moveToTrash } from '@/utils/trashManager';
import { filterActiveRecords, deleteRecordEntirely } from '@/utils/deletedRecordsManager';
import { getCompanyCode } from '@/utils/companyUtils';
import {
  saveExpenseCategory,
  formatExpenseNameWithCategory,
  parseExpenseRecords,
} from '@/utils/expenseCategoryManager';
import toast from 'react-hot-toast';
import { FunnelIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import ExcelJS from 'exceljs';

const EXPENSE_CATEGORIES = [
  'Salaries',
  'Utilities (Electricity, Gas, Water)',
  'Rent',
  'Repairs & Maintenance',
  'Fuel & Generator',
  'Tea & Refreshment',
  'Office Supplies',
  'Taxes & Fees',
  'General & Misc',
  'Other',
];

export default function ExpensesPage() {
  const { activeCompany, companies, isAllCompanies } = useCompany();
  const [expenses, setExpenses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Graph Toggles (Image 1)
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formData, setFormData] = useState({
    company_id: '',
    date: todayISO(),
    category: 'Salaries',
    customer_code: '',
    name: '',
    amount: '',
  });

  // Invoice Preview Modal (Image 2)
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAddPartyOpen, setIsAddPartyOpen] = useState(false);

  const [deleteId, setDeleteId] = useState(null);

  const companyIds = useMemo(() => {
    if (!companies || companies.length === 0) return [];
    if (!isAllCompanies && activeCompany?.id) return [activeCompany.id];
    return companies.map((c) => c.id);
  }, [activeCompany, companies, isAllCompanies]);

  useEffect(() => {
    if (companyIds.length > 0) {
      fetchCustomers();
      fetchExpenses();
    } else {
      setLoading(false);
    }
  }, [companyIds, startDate, endDate]);

  const fetchCustomers = async () => {
    try {
      let query = supabase
        .from('customers')
        .select('code, name, company_id')
        .order('code');

      if (!isAllCompanies && activeCompany?.id) {
        query = query.eq('company_id', activeCompany.id);
      } else if (companyIds.length > 0) {
        query = query.in('company_id', companyIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!isAllCompanies && activeCompany?.id) {
        query = query.eq('company_id', activeCompany.id);
      } else if (companyIds.length > 0) {
        query = query.in('company_id', companyIds);
      }

      if (startDate) query = query.gte('date', startDate);
      if (endDate) query = query.lte('date', endDate);

      const { data, error } = await query;
      if (error) throw error;
      const activeRecords = filterActiveRecords(data || []);
      const parsedRecords = parseExpenseRecords(activeRecords);
      setExpenses(parsedRecords);
    } catch (err) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (entry = null, isDuplicate = false) => {
    setEditingEntry(isDuplicate ? null : entry);
    const targetCompanyId =
      entry?.company_id || (isAllCompanies ? companies[0]?.id : activeCompany?.id);
    const targetComp = companies.find((c) => c.id === targetCompanyId) || activeCompany;
    const defaultFirmCode = getCompanyCode(targetComp?.name) || '';

    setFormData(
      entry
        ? {
            company_id: targetCompanyId,
            date: isDuplicate ? todayISO() : entry.date,
            category: entry.category || 'General & Misc',
            customer_code: entry.customer_code || defaultFirmCode,
            name: isDuplicate
              ? `${entry.name || ''} (Copy)`.trim()
              : entry.name,
            amount: String(entry.amount),
          }
        : {
            company_id: targetCompanyId,
            date: todayISO(),
            category: 'Salaries',
            customer_code: defaultFirmCode,
            name: '',
            amount: '',
          }
    );
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(formData.amount || 0);

    if (!formData.company_id) {
      toast.error('Please select a company');
      return;
    }

    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!formData.name.trim()) {
      toast.error('Expense description / name is required');
      return;
    }

    try {
      const selectedCategory = formData.category || 'General & Misc';
      const dbStoredName = formatExpenseNameWithCategory(selectedCategory, formData.name);

      const payload = {
        company_id: formData.company_id,
        date: formData.date,
        category: selectedCategory,
        customer_code: formData.customer_code
          ? formData.customer_code.trim().toUpperCase()
          : null,
        name: dbStoredName,
        amount: numAmount,
      };

      if (editingEntry) {
        saveExpenseCategory(editingEntry.id, selectedCategory);
        let { error } = await supabase
          .from('expenses')
          .update(payload)
          .eq('id', editingEntry.id);
        if (error && (error.message?.includes('category') || error.code === '42703')) {
          delete payload.category;
          const retry = await supabase
            .from('expenses')
            .update(payload)
            .eq('id', editingEntry.id);
          error = retry.error;
        }
        if (error) throw error;
        toast.success('Expense updated');
      } else {
        let { data: newExp, error } = await supabase.from('expenses').insert([payload]).select();
        if (error && (error.message?.includes('category') || error.code === '42703')) {
          delete payload.category;
          const retry = await supabase.from('expenses').insert([payload]).select();
          error = retry.error;
          newExp = retry.data;
        }
        if (error) throw error;
        const createdId = newExp?.[0]?.id;
        if (createdId) {
          saveExpenseCategory(createdId, selectedCategory);
        }
        toast.success('Expense added');
      }
      setIsModalOpen(false);
      fetchExpenses();
    } catch (err) {
      console.error('Error saving expense:', err);
      toast.error(err.message || 'Failed to save expense');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const itemToDelete = expenses.find((e) => e.id === deleteId);
      if (itemToDelete) {
        moveToTrash({
          table: 'expenses',
          itemType: 'Expense',
          title: itemToDelete.name || 'Expense',
          details: `Date: ${formatDateDisplay(itemToDelete.date)} - Category: ${itemToDelete.category || 'General'}`,
          amount: Number(itemToDelete.amount || 0),
          company_id: itemToDelete.company_id,
          originalData: itemToDelete,
        });
      }

      await deleteRecordEntirely(deleteId, 'expenses');
      toast.success('Record deleted from database');
      setDeleteId(null);
      fetchExpenses();
    } catch (err) {
      toast.error('Failed to delete expense');
    }
  };

  // Preview Invoice Handler (Reference Image 2)
  const handleOpenPreview = (expense) => {
    const comp =
      companies.find((c) => c.id === expense.company_id) || activeCompany;

    setPreviewData({
      companyName: comp?.name || 'DailyKhata Business Services',
      companyPhone: comp?.phone || '',
      companyEmail: comp?.email || '',
      billTo: (expense.customer_code || getCompanyCode(comp?.name))
        ? `Firm Code: ${expense.customer_code || getCompanyCode(comp?.name)}`
        : 'Expense Voucher / General Payee',
      invoiceNo: `EXP-${expense.id.slice(0, 6).toUpperCase()}`,
      date: expense.date,
      items: [
        {
          name: `${expense.name} (${expense.category || 'General'})`,
          quantity: 1,
          unit: 'Expense',
          pricePerUnit: Number(expense.amount),
          amount: Number(expense.amount),
        },
      ],
      totalAmount: Number(expense.amount),
      notes: `Category: ${expense.category || 'General'} | Firm Code: ${
        expense.customer_code || getCompanyCode(comp?.name) || '-'
      }`,
    });
    setIsPreviewOpen(true);
  };

  // Filter and Search across all columns (Image 1)
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesCustomer =
        !customerFilter || e.customer_code === customerFilter;
      const matchesCategory =
        categoryFilter === 'all' ||
        (e.category || 'General & Misc') === categoryFilter;

      if (!matchesCustomer || !matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const d = formatDateDisplay(e.date).toLowerCase();
      const cat = (e.category || '').toLowerCase();
      const code = (e.customer_code || '').toLowerCase();
      const name = (e.name || '').toLowerCase();
      const amt = String(e.amount || '');

      return (
        d.includes(q) ||
        cat.includes(q) ||
        code.includes(q) ||
        name.includes(q) ||
        amt.includes(q)
      );
    });
  }, [expenses, customerFilter, categoryFilter, searchQuery]);

  const totalFiltered = filteredExpenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  // Group by category for summaries
  const categoryTotals = useMemo(() => {
    const totals = {};
    expenses.forEach((e) => {
      const cat = e.category || 'General & Misc';
      totals[cat] = (totals[cat] || 0) + Number(e.amount || 0);
    });
    return totals;
  }, [expenses]);

  // Chart data for graph toggle
  const graphData = useMemo(() => {
    return Object.entries(categoryTotals).map(([cat, amount]) => ({
      category: cat.split('(')[0].trim(),
      amount,
    }));
  }, [categoryTotals]);

  // Export to Excel (.xls matching Image 1)
  const exportExpensesToExcel = async () => {
    if (filteredExpenses.length === 0) {
      toast.error('No expenses to export');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Expenses');

    sheet.columns = [
      { header: 'S.N.', key: 'sn', width: 8 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Category', key: 'category', width: 24 },
      { header: 'Firm Code', key: 'code', width: 16 },
      { header: 'Description', key: 'name', width: 30 },
      { header: 'Amount (Rs)', key: 'amount', width: 18 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' },
    };
    sheet.getRow(1).height = 26;

    filteredExpenses.forEach((exp, idx) => {
      const comp = companies.find((c) => c.id === exp.company_id);
      sheet.addRow({
        sn: idx + 1,
        date: formatDateDisplay(exp.date),
        category: exp.category || 'General & Misc',
        code: exp.customer_code || getCompanyCode(comp?.name) || '-',
        name: exp.name,
        amount: Number(exp.amount),
      });
    });

    const totalRow = sheet.addRow([]);
    totalRow.getCell(1).value = 'TOTAL';
    totalRow.font = { bold: true };
    totalRow.getCell(6).value = {
      formula: `SUM(F2:F${filteredExpenses.length + 1})`,
    };
    totalRow.getCell(6).numFmt = '#,##0.00';

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCompany?.name || 'Company'}_Expenses_${todayISO()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Expenses exported to Excel!');
  };

  const handlePrintTable = () => {
    const printWindow = window.open('', '', 'width=900,height=750');
    if (!printWindow) {
      toast.error('Please allow popups to print');
      return;
    }

    const compName = activeCompany?.name || 'DailyKhata Business Services';
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Expenses Statement - ${compName}</title>
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
            <h3>Expenses & Salaries Statement</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Firm Code</th>
                <th>Description</th>
                <th class="right">Amount (Rs)</th>
              </tr>
            </thead>
            <tbody>
              ${filteredExpenses.map(exp => `
                <tr>
                  <td>${formatDateDisplay(exp.date)}</td>
                  <td>${exp.category || 'General'}</td>
                  <td>${exp.customer_code || '-'}</td>
                  <td>${exp.name}</td>
                  <td class="right">${formatCurrency(exp.amount)}</td>
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

  const getCategoryBadgeColor = (category) => {
    switch (category) {
      case 'Salaries':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Utilities (Electricity, Gas, Water)':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Rent':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Repairs & Maintenance':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'Fuel & Generator':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Tea & Refreshment':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  if (!activeCompany && (!companies || companies.length === 0)) {
    return (
      <div className="p-6 text-slate-500">
        Please select or create a company first.
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
              Expenses & Salaries
            </h1>
            {isAllCompanies && (
              <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                All Companies
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAllCompanies ? 'All Companies' : activeCompany.name} — Categorized business expenditures, salaries, and party costs
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="btn-primary text-xs shadow-sm flex items-center gap-1.5 self-start sm:self-auto"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add Expense / Salary
        </button>
      </div>

      {/* Top Category Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
        {['Salaries', 'Utilities (Electricity, Gas, Water)', 'Rent', 'Repairs & Maintenance', 'Other'].map(
          (cat) => {
            const sum =
              cat === 'Other'
                ? Object.entries(categoryTotals)
                    .filter(
                      ([k]) =>
                        ![
                          'Salaries',
                          'Utilities (Electricity, Gas, Water)',
                          'Rent',
                          'Repairs & Maintenance',
                        ].includes(k)
                    )
                    .reduce((acc, [, val]) => acc + val, 0)
                : categoryTotals[cat] || 0;

            return (
              <div key={cat} className="stat-card p-2.5">
                <p
                  className="text-[10px] font-bold uppercase text-slate-500 truncate tracking-wider"
                  title={cat}
                >
                  {cat.split('(')[0]}
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-900 mt-0.5 tabular-nums">
                  {formatCurrency(sum)}
                </p>
              </div>
            );
          }
        )}
      </div>

      {/* Embedded Graph when toggled (Image 1) */}
      {showGraph && graphData.length > 0 && (
        <div className="card p-6 border border-indigo-100 animate-in fade-in duration-200">
          <h3 className="text-sm font-bold text-slate-800 mb-4">
            Expenses by Category
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graphData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="amount" name="Expense (Rs)" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="card p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                <FunnelIcon className="h-4 w-4 text-slate-400" />
                Filter:
              </span>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="border border-slate-300 rounded-lg text-xs p-1.5 bg-white text-slate-700 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="all">All Categories</option>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {/* Firm Code Filter */}
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="border border-slate-300 rounded-lg text-xs p-1.5 bg-white text-slate-700 focus:ring-indigo-500 focus:outline-none font-medium"
              >
                <option value="">All Firm Codes (تمام فرم کوڈز)</option>
                {companies.map((c) => {
                  const fCode = getCompanyCode(c.name);
                  return (
                    <option key={c.id} value={fCode}>
                      {fCode} — {c.name}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Header Action Icons matching Image 1 */}
            <TransactionToolbar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              showSearch={showSearch}
              onToggleSearch={() => setShowSearch(!showSearch)}
              showGraph={showGraph}
              onToggleGraph={() => setShowGraph(!showGraph)}
              onExportExcel={exportExpensesToExcel}
              onPrintTable={handlePrintTable}
              searchPlaceholder="Search category, payee, description, amount..."
            />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2 text-xs border-t border-slate-100 pt-2.5">
            <span className="text-slate-500 font-medium">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-300 rounded-lg text-xs p-1.5"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-300 rounded-lg text-xs p-1.5"
            />
            {(startDate ||
              endDate ||
              customerFilter ||
              categoryFilter !== 'all' ||
              searchQuery) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setCustomerFilter('');
                  setCategoryFilter('all');
                  setSearchQuery('');
                }}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 ml-2"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      {loading ? (
        <LoadingState />
      ) : filteredExpenses.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl shadow-sm border border-slate-200 text-slate-500">
          No expenses found matching the criteria.
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-slate-200">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <span className="font-semibold text-slate-700 text-sm">
              Expenses List ({filteredExpenses.length})
            </span>
            <span className="text-sm font-bold text-slate-900">
              Total: {formatCurrency(totalFiltered)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left divide-y divide-slate-200">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-600 tracking-wider">
                <tr>
                  <th className="px-3.5 py-2 w-12">S.N.</th>
                  <th className="px-3.5 py-2">Date</th>
                  {isAllCompanies && <th className="px-3.5 py-2">Company Code (فرم کوڈ)</th>}
                  <th className="px-3.5 py-2">Category (زمرہ)</th>
                  <th className="px-3.5 py-2">Firm Code (فرم کوڈ)</th>
                  <th className="px-3.5 py-2">Description</th>
                  <th className="px-3.5 py-2 text-right">Amount (Rs)</th>
                  <th className="px-3.5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((expense, idx) => {
                  const comp = companies.find((c) => c.id === expense.company_id);
                  const firmCode = expense.customer_code || getCompanyCode(comp?.name) || '-';

                  return (
                    <tr key={expense.id} className="hover:bg-slate-50">
                      <td className="px-3.5 py-2 tabular-nums text-xs text-slate-500 font-medium">
                        {idx + 1}
                      </td>

                      <td className="px-3.5 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {formatDateDisplay(expense.date)}
                      </td>

                      {isAllCompanies && (
                        <td className="px-3.5 py-2 text-xs font-mono font-bold text-indigo-700 whitespace-nowrap">
                          <span className="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-xs" title={comp?.name}>
                            {getCompanyCode(comp?.name) || '-'}
                          </span>
                        </td>
                      )}

                      <td className="px-3.5 py-2 text-xs whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getCategoryBadgeColor(
                            expense.category
                          )}`}
                        >
                          {expense.category || 'General & Misc'}
                        </span>
                      </td>

                      <td className="px-3.5 py-2 text-xs whitespace-nowrap">
                        <span className="font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-xs font-bold">
                          {firmCode}
                        </span>
                      </td>

                      <td className="px-3.5 py-2 text-xs text-slate-800 font-medium max-w-sm truncate">
                        {expense.name}
                      </td>

                      <td className="px-3.5 py-2 text-xs text-right font-bold text-rose-600 tabular-nums whitespace-nowrap">
                        {formatCurrency(expense.amount)}
                      </td>

                      {/* Actions matching Reference Image 1 */}
                      <td className="px-3.5 py-2 text-right whitespace-nowrap relative overflow-visible">
                        <RowActionsMenu
                          onViewEdit={() => handleOpenModal(expense)}
                          onPreview={() => handleOpenPreview(expense)}
                          onPrint={() => handleOpenPreview(expense)}
                          onShare={() => {
                            navigator.clipboard.writeText(
                              `Expense: ${expense.name} (${formatCurrency(expense.amount)}) on ${formatDateDisplay(expense.date)}`
                            );
                            toast.success('Expense copied to clipboard!');
                          }}
                          onDuplicate={() => handleOpenModal(expense, true)}
                          onDelete={() => setDeleteId(expense.id)}
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

      {/* Add / Edit Expense Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEntry ? 'Edit Expense' : 'Add Expense / Salary'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company Selector (if All Companies is selected) */}
          {isAllCompanies && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Company (کمپنی منتخب کریں)
              </label>
              <select
                value={formData.company_id}
                onChange={(e) => {
                  const compId = e.target.value;
                  const cObj = companies.find((c) => c.id === compId);
                  const fCode = getCompanyCode(cObj?.name) || '';
                  setFormData({
                    ...formData,
                    company_id: compId,
                    customer_code: fCode,
                  });
                }}
                className="w-full border-slate-300 rounded-lg p-2 border text-sm font-semibold"
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
              Expense Category (زمرہ)
            </label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-2 border text-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Party / Payee Selection with + Add Party button */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">
                Party / Payee (پارٹی / کھاتہ دار)
              </label>
              <button
                type="button"
                onClick={() => setIsAddPartyOpen(true)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <PlusIcon className="h-3 w-3" />
                + Add Party
              </button>
            </div>
            <select
              value={formData.customer_id || ''}
              onChange={(e) => {
                const selectedCust = customers.find((c) => c.id === e.target.value);
                setFormData({
                  ...formData,
                  customer_id: e.target.value,
                  name: selectedCust && !formData.name ? `${formData.category}: ${selectedCust.name}` : formData.name,
                });
              }}
              className="w-full border-slate-300 rounded-lg p-2 border text-sm font-medium focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">-- General / Cash Expense (No Specific Party) --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.category || 'Regular'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">
                Firm / Company Code (فرم کوڈ)
              </label>
              <span className="text-[11px] text-slate-500 font-mono">
                Rule: 2nd & 3rd word (e.g. Gill Bricks Company → BC)
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. BC"
                value={formData.customer_code}
                onChange={(e) =>
                  setFormData({ ...formData, customer_code: e.target.value.toUpperCase() })
                }
                className="w-1/2 border-slate-300 rounded-lg p-2 border text-sm uppercase font-mono font-bold text-indigo-700 bg-indigo-50/40"
              />
              <select
                value={formData.customer_code}
                onChange={(e) =>
                  setFormData({ ...formData, customer_code: e.target.value })
                }
                className="w-1/2 border-slate-300 rounded-lg p-2 border text-sm font-medium"
              >
                <option value="">Select Firm Code...</option>
                {companies.map((c) => {
                  const fCode = getCompanyCode(c.name);
                  return (
                    <option key={c.id} value={fCode}>
                      {fCode} — {c.name}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description / Expense Name
            </label>
            <input
              type="text"
              placeholder="e.g. Staff Salary Parvez, Electricity Bill, Generator..."
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-2 border text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Amount (Rs)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) =>
                setFormData({ ...formData, amount: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-2 border text-sm font-bold text-slate-800"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-indigo-600 text-white px-5 py-2 text-sm font-semibold rounded-lg hover:bg-indigo-700 transition shadow-sm"
            >
              {editingEntry ? 'Save Changes' : 'Save Expense'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Expense"
        message="Are you sure you want to delete this expense record?"
      />

      {/* Invoice Preview Modal (Reference Image 2) */}
      <InvoicePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        data={previewData}
      />

      {/* Quick Add Party Modal */}
      <QuickAddPartyModal
        isOpen={isAddPartyOpen}
        onClose={() => setIsAddPartyOpen(false)}
        defaultCompanyId={formData.company_id || (isAllCompanies ? companies[0]?.id : activeCompany?.id)}
        companies={companies}
        isAllCompanies={isAllCompanies}
        onPartyCreated={(newParty) => {
          fetchCustomers();
          setFormData((prev) => ({
            ...prev,
            customer_id: newParty.id,
            name: !prev.name ? `${prev.category}: ${newParty.name}` : prev.name,
          }));
        }}
      />
    </div>
  );
}
