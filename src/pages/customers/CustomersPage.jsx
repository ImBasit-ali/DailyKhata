import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/lib/supabaseClient';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import LoadingState from '@/components/ui/LoadingState';
import TransactionToolbar from '@/components/common/TransactionToolbar';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import InvoicePreviewModal from '@/components/common/InvoicePreviewModal';
import { formatCurrency } from '@/utils/formatters';
import { formatDateDisplay, todayISO } from '@/utils/dateUtils';
import { moveToTrash } from '@/utils/trashManager';
import { filterActiveRecords, deleteRecordEntirely } from '@/utils/deletedRecordsManager';
import { saveCustomerCategory, getCustomerCategory } from '@/utils/customerCategoryManager';
import { getCompanyCode } from '@/utils/companyUtils';
import toast from 'react-hot-toast';
import { FunnelIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import ExcelJS from 'exceljs';

const CUSTOMER_CATEGORIES = [
  'Regular',
  'Commercial / Wholesale',
  'Supplier',
  'Staff / Employee',
  'VIP / Govt',
  'Other',
];

export default function CustomersPage() {
  const { activeCompany, companies, isAllCompanies } = useCompany();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Search & Graph Toggles (Image 1)
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    company_id: '',
    name: '',
    code: '',
    category: 'Regular',
  });

  // Invoice Preview Modal (Image 2)
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const [deleteId, setDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const companyIds = useMemo(() => {
    if (!companies || companies.length === 0) return [];
    if (!isAllCompanies && activeCompany?.id) return [activeCompany.id];
    return companies.map((c) => c.id);
  }, [activeCompany, companies, isAllCompanies]);

  useEffect(() => {
    if (companyIds.length > 0) {
      fetchCustomers();
    } else {
      setLoading(false);
    }
  }, [companyIds]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);

      let custQuery = supabase
        .from('customers')
        .select('*')
        .order('name');

      let ledgerQuery = supabase
        .from('customer_ledger_with_balance')
        .select('customer_id, running_balance, date, created_at')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!isAllCompanies && activeCompany?.id) {
        custQuery = custQuery.eq('company_id', activeCompany.id);
        ledgerQuery = ledgerQuery.eq('company_id', activeCompany.id);
      } else if (companyIds.length > 0) {
        custQuery = custQuery.in('company_id', companyIds);
        ledgerQuery = ledgerQuery.in('company_id', companyIds);
      }

      const [custRes, ledgerRes] = await Promise.all([custQuery, ledgerQuery]);

      if (custRes.error) throw custRes.error;

      const latestLedgers = ledgerRes.data || [];
      const activeCustomers = filterActiveRecords(custRes.data || []);
      const customerMap = activeCustomers.map((c) => {
        const ledger = latestLedgers.find((l) => l.customer_id === c.id);
        const resolvedCategory = getCustomerCategory(c);
        return {
          ...c,
          category: resolvedCategory,
          balance: ledger ? ledger.running_balance : 0,
        };
      });

      setCustomers(customerMap);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (customer = null, isDuplicate = false) => {
    setEditingCustomer(isDuplicate ? null : customer);
    const targetCompanyId =
      customer?.company_id || (isAllCompanies ? companies[0]?.id : activeCompany?.id);

    setFormData(
      customer
        ? {
            company_id: targetCompanyId,
            name: isDuplicate ? `${customer.name} (Copy)` : customer.name,
            code: isDuplicate ? `${customer.code}2` : customer.code,
            category: customer.category || 'Regular',
          }
        : {
            company_id: targetCompanyId,
            name: '',
            code: '',
            category: 'Regular',
          }
    );
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Party name is required');
      return;
    }

    if (!formData.company_id) {
      toast.error('Please select a company');
      return;
    }

    try {
      const selectedCat = formData.category || 'Regular';
      const words = formData.name.trim().split(/\s+/).filter(Boolean);
      let baseCode = words.map((w) => w[0]).join('').toUpperCase().slice(0, 3) || 'P';
      const autoCode =
        (editingCustomer ? editingCustomer.code : '') ||
        formData.code?.trim().toUpperCase() ||
        `${baseCode}${Math.floor(100 + Math.random() * 900)}`;

      const payload = {
        company_id: formData.company_id,
        name: formData.name.trim(),
        code: autoCode,
        category: selectedCat,
      };

      if (editingCustomer) {
        saveCustomerCategory(editingCustomer.id, payload.code, selectedCat);
        let { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', editingCustomer.id);
        if (error && (error.message?.includes('category') || error.code === '42703')) {
          delete payload.category;
          const retry = await supabase
            .from('customers')
            .update(payload)
            .eq('id', editingCustomer.id);
          error = retry.error;
        }
        if (error) throw error;
        toast.success('Party updated successfully');
      } else {
        let { data: newCust, error } = await supabase.from('customers').insert([payload]).select();
        if (error && (error.message?.includes('category') || error.code === '42703')) {
          delete payload.category;
          const retry = await supabase.from('customers').insert([payload]).select();
          error = retry.error;
          newCust = retry.data;
        }
        if (error) throw error;
        const createdId = newCust?.[0]?.id;
        saveCustomerCategory(createdId, payload.code, selectedCat);
        toast.success('Party added successfully');
      }
      handleCloseModal();
      fetchCustomers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Operation failed. Check if code is unique.');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const itemToDelete = customers.find((c) => c.id === deleteId);
      if (itemToDelete) {
        moveToTrash({
          table: 'customers',
          itemType: 'Party',
          title: itemToDelete.name,
          details: `Code: ${itemToDelete.code} - Category: ${itemToDelete.category || 'Regular'}`,
          amount: Number(itemToDelete.balance || 0),
          company_id: itemToDelete.company_id,
          originalData: itemToDelete,
        });
      }

      await deleteRecordEntirely(deleteId, 'customers');
      toast.success('Party deleted from database');
      setDeleteId(null);
      fetchCustomers();
    } catch (err) {
      toast.error('Failed to delete party');
    } finally {
      setIsDeleting(false);
    }
  };

  // Preview Invoice / Statement Handler (Reference Image 2)
  const handleOpenPreview = (customer) => {
    const comp =
      companies.find((c) => c.id === customer.company_id) || activeCompany;
    const balance = Number(customer.balance || 0);

    setPreviewData({
      companyName: comp?.name || 'Vyapar Business Services',
      companyPhone: comp?.phone || '',
      companyEmail: comp?.email || '',
      billTo: `${customer.name} (Code: ${customer.code})`,
      invoiceNo: `STMT-${customer.code}`,
      date: todayISO(),
      items: [
        {
          name: `Current Account Balance (${customer.category || 'Regular'})`,
          quantity: 1,
          unit: 'Account',
          pricePerUnit: Math.abs(balance),
          amount: Math.abs(balance),
        },
      ],
      totalAmount: Math.abs(balance),
      notes:
        balance > 0
          ? 'Receivable Debt from Customer (بقایا واجب الادا)'
          : balance < 0
          ? 'Customer Advance Balance (پیشگی جمع)'
          : 'Account Cleared (حساب صاف)',
    });
    setIsPreviewOpen(true);
  };

  // Filter customers by category and search across all columns (Image 1)
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesCategory =
        selectedCategory === 'all' || c.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const code = (c.code || '').toLowerCase();
      const name = (c.name || '').toLowerCase();
      const cat = (c.category || '').toLowerCase();
      const bal = String(c.balance || '');

      return (
        code.includes(q) ||
        name.includes(q) ||
        cat.includes(q) ||
        bal.includes(q)
      );
    });
  }, [customers, selectedCategory, searchQuery]);

  // Graph Data
  const graphData = useMemo(() => {
    return filteredCustomers
      .filter((c) => Number(c.balance || 0) !== 0)
      .slice(0, 10)
      .map((c) => ({
        name: `${c.code} (${c.name.slice(0, 10)})`,
        balance: Number(c.balance || 0),
      }));
  }, [filteredCustomers]);

  // Export to Excel (.xls)
  const exportToExcel = async () => {
    if (filteredCustomers.length === 0) {
      toast.error('No customers to export');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customers');

    sheet.columns = [
      { header: 'S.N.', key: 'sn', width: 8 },
      ...(isAllCompanies ? [{ header: 'Company Code', key: 'company_code', width: 16 }] : []),
      { header: 'Party / Customer Name', key: 'name', width: 28 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Running Balance (Rs)', key: 'balance', width: 22 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' },
    };
    sheet.getRow(1).height = 26;

    filteredCustomers.forEach((c, idx) => {
      const comp = companies.find((cp) => cp.id === c.company_id);
      sheet.addRow({
        sn: idx + 1,
        ...(isAllCompanies ? { company_code: getCompanyCode(comp?.name) || '-' } : {}),
        name: c.name,
        category: c.category || 'Regular',
        balance: Number(c.balance || 0),
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCompany?.name || 'Company'}_Customers_${todayISO()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Customers list exported to Excel!');
  };

  const handlePrintTable = () => {
    const printWindow = window.open('', '', 'width=900,height=750');
    if (!printWindow) {
      toast.error('Please allow popups to print');
      return;
    }

    const compName = activeCompany?.name || 'Vyapar Business Services';
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Customers & Accounts - ${compName}</title>
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
            <h3>Customers & Accounts Statement</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Customer / Party Name</th>
                <th>Category</th>
                <th class="right">Running Balance (Rs)</th>
              </tr>
            </thead>
            <tbody>
              ${filteredCustomers.map(c => `
                <tr>
                  <td>${c.name}</td>
                  <td>${c.category || 'Regular'}</td>
                  <td class="right">${formatCurrency(c.balance || 0)}</td>
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

  const getCategoryBadgeClass = (category) => {
    switch (category) {
      case 'Commercial / Wholesale':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Supplier':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Staff / Employee':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'VIP / Govt':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Regular':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  if (!activeCompany && (!companies || companies.length === 0)) {
    return (
      <EmptyState
        title="No Active Company"
        message="Please select or create a company first."
      />
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              Customers & Accounts
            </h1>
            {isAllCompanies && (
              <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                All Companies
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAllCompanies ? 'All Companies' : activeCompany.name} — Manage categorized customer accounts and running balances
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="btn-primary text-xs shadow-sm self-start sm:self-auto flex items-center gap-1.5"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add Party
        </button>
      </div>

      {/* Embedded Chart if toggled (Image 1) */}
      {showGraph && graphData.length > 0 && (
        <div className="card p-6 border border-indigo-100 animate-in fade-in duration-150">
          <h3 className="text-sm font-bold text-slate-800 mb-4">
            Top Customer Outstanding Balances
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graphData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="balance" name="Balance (Rs)" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter and Action Toolbar */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold uppercase text-slate-500">
              Category:
            </span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs font-medium border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">All Categories ({customers.length})</option>
              {CUSTOMER_CATEGORIES.map((cat) => {
                const count = customers.filter((c) => c.category === cat).length;
                return (
                  <option key={cat} value={cat}>
                    {cat} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Action Icons matching Reference Image 1 */}
          <TransactionToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showSearch={showSearch}
            onToggleSearch={() => setShowSearch(!showSearch)}
            showGraph={showGraph}
            onToggleGraph={() => setShowGraph(!showGraph)}
            onExportExcel={exportToExcel}
            onPrintTable={handlePrintTable}
            searchPlaceholder="Search customer, code, category, balance..."
          />
        </div>
      </div>

      {/* Customers List */}
      {loading ? (
        <LoadingState />
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          title="No parties found"
          message={
            searchQuery || selectedCategory !== 'all'
              ? 'No parties match your search or filter.'
              : 'Add a party to get started.'
          }
          actionLabel="Add Party"
          onAction={() => handleOpenModal()}
        />
      ) : (
        <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-slate-200">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-12">
                  S.N.
                </th>
                {isAllCompanies && (
                  <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Company Code (فرم کوڈ)
                  </th>
                )}
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider text-right">
                  Running Balance (بقایا)
                </th>
                <th className="px-3.5 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.map((customer, idx) => {
                const comp = companies.find((c) => c.id === customer.company_id);
                const firmCode = getCompanyCode(comp?.name) || '-';

                return (
                  <tr
                    key={customer.id}
                    className="hover:bg-slate-50 cursor-pointer transition"
                    onClick={() => navigate(`/customers/${customer.id}/ledger`)}
                  >
                    <td className="px-3.5 py-2 tabular-nums text-xs text-slate-500 font-medium">
                      {idx + 1}
                    </td>

                    {isAllCompanies && (
                      <td className="px-3.5 py-2 text-xs font-mono font-bold text-indigo-700 whitespace-nowrap">
                        <span className="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-xs" title={comp?.name}>
                          {firmCode}
                        </span>
                      </td>
                    )}

                    <td className="px-3.5 py-2 text-xs font-medium text-slate-900">
                      {customer.name}
                    </td>

                    <td className="px-3.5 py-2 text-xs">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getCategoryBadgeClass(
                          customer.category
                        )}`}
                      >
                        {customer.category || 'Regular'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                      <span
                        className={
                          Number(customer.balance) > 0
                            ? 'text-rose-600'
                            : Number(customer.balance) < 0
                            ? 'text-emerald-600'
                            : 'text-slate-700'
                        }
                      >
                        {formatCurrency(customer.balance)}
                      </span>
                    </td>

                    {/* Actions matching Reference Image 1 */}
                    <td
                      className="px-6 py-4 text-right whitespace-nowrap relative overflow-visible"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RowActionsMenu
                        onViewEdit={() => handleOpenModal(customer)}
                        onPreview={() => handleOpenPreview(customer)}
                        onPrint={() => handleOpenPreview(customer)}
                        onShare={() => {
                          navigator.clipboard.writeText(
                            `Customer: ${customer.name} (${customer.code}) - Balance: ${formatCurrency(customer.balance)}`
                          );
                          toast.success('Customer details copied to clipboard!');
                        }}
                        onDuplicate={() => handleOpenModal(customer, true)}
                        onDelete={() => setDeleteId(customer.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Party Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCustomer ? 'Edit Party' : 'Add Party'}
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
                onChange={(e) =>
                  setFormData({ ...formData, company_id: e.target.value })
                }
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
              Party / Customer Name (پارٹی کا نام)
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
              placeholder="e.g. Parvez Khan / Al-Rehman Traders"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Party Category (پارٹی کی قسم / زمرہ)
            </label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border text-sm font-medium"
            >
              {CUSTOMER_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 transition shadow-sm font-semibold text-sm"
            >
              {editingCustomer ? 'Save Changes' : 'Add Party'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Customer"
        message="Are you sure you want to delete this customer? All ledger entries will be lost."
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
