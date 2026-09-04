import React, { useState, useEffect, useMemo } from 'react';
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
import { getPurchasePayment, savePurchasePayment } from '@/utils/balanceUtils';
import { moveToTrash } from '@/utils/trashManager';
import { filterActiveRecords, deleteRecordEntirely } from '@/utils/deletedRecordsManager';
import { getCompanyCode } from '@/utils/companyUtils';
import toast from 'react-hot-toast';
import { PlusIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import ExcelJS from 'exceljs';

export default function FuelPurchasesPage() {
  const { activeCompany, companies, isAllCompanies } = useCompany();
  const [purchases, setPurchases] = useState([]);
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
    company_id: '',
    date: todayISO(),
    fuel_type: 'petrol',
    supplier_name: '',
    quantity_liters: '',
    price_per_liter: '',
    payment_type: 'cash', // 'cash' | 'credit'
    amount_paid: '',
  });

  // Invoice Preview Modal
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const [deleteId, setDeleteId] = useState(null);

  const companyIds = useMemo(() => {
    if (!companies || companies.length === 0) return [];
    if (!isAllCompanies && activeCompany?.id) return [activeCompany.id];
    return companies.map((c) => c.id);
  }, [activeCompany, companies, isAllCompanies]);

  useEffect(() => {
    if (companyIds.length > 0) {
      fetchPurchases();
    } else {
      setLoading(false);
    }
  }, [companyIds, dateFilter]);

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('fuel_purchases')
        .select('*')
        .order('date', { ascending: false });

      if (!isAllCompanies && activeCompany?.id) {
        query = query.eq('company_id', activeCompany.id);
      } else if (companyIds.length > 0) {
        query = query.in('company_id', companyIds);
      }

      if (dateFilter) query = query.eq('date', dateFilter);

      const { data, error } = await query;
      if (error) throw error;
      setPurchases(filterActiveRecords(data || []));
    } catch (err) {
      toast.error('Failed to load purchases');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (entry = null, isDuplicate = false) => {
    setEditingEntry(isDuplicate ? null : entry);
    const targetCompanyId =
      entry?.company_id || (isAllCompanies ? companies[0]?.id : activeCompany?.id);

    const payment = entry ? getPurchasePayment(entry) : null;
    const isCredit = payment ? payment.remainingBalance > 0 : false;

    setFormData(
      entry
        ? {
            company_id: targetCompanyId,
            date: isDuplicate ? todayISO() : entry.date,
            fuel_type: entry.fuel_type,
            supplier_name: isDuplicate
              ? `${entry.supplier_name || ''} (Copy)`.trim()
              : entry.supplier_name || '',
            quantity_liters: String(entry.quantity_liters),
            price_per_liter: String(entry.price_per_liter),
            payment_type: isCredit ? 'credit' : 'cash',
            amount_paid: payment ? String(payment.amountPaid) : '',
          }
        : {
            company_id: targetCompanyId,
            date: todayISO(),
            fuel_type: 'petrol',
            supplier_name: '',
            quantity_liters: '',
            price_per_liter: '',
            payment_type: 'cash',
            amount_paid: '',
          }
    );
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const q = parseFloat(formData.quantity_liters || 0);
      const p = parseFloat(formData.price_per_liter || 0);

      if (isNaN(q) || isNaN(p) || q <= 0 || p <= 0) {
        toast.error('Please enter valid quantity and price');
        return;
      }

      const totalCost = q * p;
      const amountPaid = formData.payment_type === 'cash'
        ? totalCost
        : Math.min(totalCost, Math.max(0, parseFloat(formData.amount_paid || 0)));
      const remainingBalance = Math.max(0, totalCost - amountPaid);

      const basePayload = {
        company_id: formData.company_id,
        date: formData.date,
        fuel_type: formData.fuel_type,
        supplier_name: formData.supplier_name?.trim() || null,
        quantity_liters: q,
        price_per_liter: p,
        total_cost: totalCost,
      };

      let savedId = editingEntry?.id;

      if (editingEntry) {
        // Try updating with amount_paid and remaining_balance if columns exist
        const { error: updateErr } = await supabase
          .from('fuel_purchases')
          .update({
            ...basePayload,
            amount_paid: amountPaid,
            remaining_balance: remainingBalance,
          })
          .eq('id', editingEntry.id);

        if (updateErr) {
          // Fallback if columns don't exist in Supabase yet
          const { error: fallbackErr } = await supabase
            .from('fuel_purchases')
            .update(basePayload)
            .eq('id', editingEntry.id);
          if (fallbackErr) throw fallbackErr;
        }
        toast.success('Purchase updated');
      } else {
        // Try inserting with amount_paid and remaining_balance
        const { data: insertedData, error: insertErr } = await supabase
          .from('fuel_purchases')
          .insert([{
            ...basePayload,
            amount_paid: amountPaid,
            remaining_balance: remainingBalance,
          }])
          .select('id');

        if (insertErr) {
          // Fallback if columns don't exist in Supabase yet
          const { data: fallbackData, error: fallbackErr } = await supabase
            .from('fuel_purchases')
            .insert([basePayload])
            .select('id');
          if (fallbackErr) throw fallbackErr;
          savedId = fallbackData?.[0]?.id;
        } else {
          savedId = insertedData?.[0]?.id;
        }
        toast.success('Purchase logged');
      }

      // Persist payment details to storage and cache
      if (savedId) {
        await savePurchasePayment(savedId, amountPaid, remainingBalance);
      }

      setIsModalOpen(false);
      fetchPurchases();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Operation failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const itemToDelete = purchases.find((p) => p.id === deleteId);
      if (itemToDelete) {
        moveToTrash({
          table: 'fuel_purchases',
          itemType: 'Fuel Purchase',
          title: `${itemToDelete.fuel_type.toUpperCase()} - ${itemToDelete.supplier_name || 'Depot'}`,
          details: `Date: ${formatDateDisplay(itemToDelete.date)} - Quantity: ${formatNumber(itemToDelete.quantity_liters)} Ltr`,
          amount: Number(itemToDelete.total_cost || 0),
          company_id: itemToDelete.company_id,
          originalData: itemToDelete,
        });
      }

      await deleteRecordEntirely(deleteId, 'fuel_purchases');
      toast.success('Record deleted from database');
      setDeleteId(null);
      fetchPurchases();
    } catch (err) {
      toast.error('Failed to delete purchase');
    }
  };

  // Preview Invoice Handler
  const handleOpenPreview = (purchase) => {
    const comp =
      companies.find((c) => c.id === purchase.company_id) || activeCompany;
    const itemName = `${purchase.fuel_type.toUpperCase()} Purchase Delivery`;
    const payment = getPurchasePayment(purchase);

    setPreviewData({
      companyName: comp?.name || 'Gill Petroleum Services',
      companyPhone: comp?.phone || '',
      companyEmail: comp?.email || '',
      billTo: purchase.supplier_name
        ? `Supplier: ${purchase.supplier_name}`
        : 'Fuel Supplier / Depot',
      invoiceNo: `PUR-${purchase.id.slice(0, 6).toUpperCase()}`,
      date: purchase.date,
      items: [
        {
          name: itemName,
          quantity: Number(purchase.quantity_liters),
          unit: 'Ltr',
          pricePerUnit: Number(purchase.price_per_liter),
          amount: Number(purchase.total_cost),
        },
      ],
      totalAmount: Number(purchase.total_cost),
      amountPaid: payment.amountPaid,
      balanceDue: payment.remainingBalance,
      notes: `Supplier: ${purchase.supplier_name || 'Direct Depot Supply'} | Paid: ${formatCurrency(payment.amountPaid)} | Due: ${formatCurrency(payment.remainingBalance)}`,
    });
    setIsPreviewOpen(true);
  };

  // Filter and search across all columns
  const filteredPurchases = useMemo(() => {
    if (!searchQuery.trim()) return purchases;
    const q = searchQuery.toLowerCase().trim();

    return purchases.filter((p) => {
      const d = formatDateDisplay(p.date).toLowerCase();
      const ft = (p.fuel_type || '').toLowerCase();
      const supp = (p.supplier_name || '').toLowerCase();
      const qty = String(p.quantity_liters || '');
      const price = String(p.price_per_liter || '');
      const tot = String(p.total_cost || '');

      return (
        d.includes(q) ||
        ft.includes(q) ||
        supp.includes(q) ||
        qty.includes(q) ||
        price.includes(q) ||
        tot.includes(q)
      );
    });
  }, [purchases, searchQuery]);

  // Graph Data
  const graphData = useMemo(() => {
    const map = {};
    filteredPurchases.slice(0, 14).forEach((p) => {
      const d = formatDateDisplay(p.date);
      if (!map[d]) map[d] = { date: d, petrolCost: 0, dieselCost: 0 };
      if (p.fuel_type === 'petrol') map[d].petrolCost += Number(p.total_cost || 0);
      else map[d].dieselCost += Number(p.total_cost || 0);
    });
    return Object.values(map);
  }, [filteredPurchases]);

  // Export to Excel (.xls)
  const exportToExcel = async () => {
    if (filteredPurchases.length === 0) {
      toast.error('No purchases to export');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Fuel Purchases');

    sheet.columns = [
      { header: 'S.N.', key: 'sn', width: 8 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Fuel Type', key: 'type', width: 16 },
      { header: 'Supplier', key: 'supplier', width: 24 },
      { header: 'Quantity (L)', key: 'quantity', width: 18 },
      { header: 'Price / L (Rs)', key: 'price', width: 18 },
      { header: 'Total Cost (Rs)', key: 'cost', width: 20 },
      { header: 'Paid to Supplier (Rs)', key: 'paid', width: 20 },
      { header: 'Supplier Due (Rs)', key: 'due', width: 20 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' },
    };
    sheet.getRow(1).height = 26;

    filteredPurchases.forEach((p, idx) => {
      const payment = getPurchasePayment(p);
      sheet.addRow({
        sn: idx + 1,
        date: formatDateDisplay(p.date),
        type: p.fuel_type.toUpperCase(),
        supplier: p.supplier_name || '-',
        quantity: Number(p.quantity_liters),
        price: Number(p.price_per_liter),
        cost: Number(p.total_cost),
        paid: payment.amountPaid,
        due: payment.remainingBalance,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCompany?.name || 'Company'}_Fuel_Purchases_${todayISO()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Purchases exported to Excel!');
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
          <title>Fuel Purchases - ${compName}</title>
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
            <h3>Fuel Purchases Statement</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Fuel Type</th>
                <th>Supplier</th>
                <th class="right">Quantity (L)</th>
                <th class="right">Price (Rs)</th>
                <th class="right">Total Cost (Rs)</th>
                <th class="right">Paid (Rs)</th>
                <th class="right">Due (Rs)</th>
              </tr>
            </thead>
            <tbody>
              ${filteredPurchases.map(p => {
                const payment = getPurchasePayment(p);
                return `
                  <tr>
                    <td>${formatDateDisplay(p.date)}</td>
                    <td>${p.fuel_type.toUpperCase()}</td>
                    <td>${p.supplier_name || '-'}</td>
                    <td class="right">${formatNumber(p.quantity_liters)}</td>
                    <td class="right">${formatCurrency(p.price_per_liter)}</td>
                    <td class="right">${formatCurrency(p.total_cost)}</td>
                    <td class="right">${formatCurrency(payment.amountPaid)}</td>
                    <td class="right">${formatCurrency(payment.remainingBalance)}</td>
                  </tr>
                `;
              }).join('')}
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

  // KPI Calculations
  const purchaseStats = useMemo(() => {
    let quantity = 0;
    let cost = 0;
    let paid = 0;
    let remaining = 0;

    filteredPurchases.forEach((p) => {
      quantity += Number(p.quantity_liters || 0);
      cost += Number(p.total_cost || 0);
      const payment = getPurchasePayment(p);
      paid += payment.amountPaid;
      remaining += payment.remainingBalance;
    });

    return { quantity, cost, paid, remaining };
  }, [filteredPurchases]);

  // Live modal computed values
  const modalQuantity = parseFloat(formData.quantity_liters || 0);
  const modalPrice = parseFloat(formData.price_per_liter || 0);
  const modalTotalCost = !isNaN(modalQuantity) && !isNaN(modalPrice) ? modalQuantity * modalPrice : 0;
  const modalPaid = formData.payment_type === 'cash'
    ? modalTotalCost
    : Math.min(modalTotalCost, Math.max(0, parseFloat(formData.amount_paid || 0)));
  const modalRemaining = Math.max(0, modalTotalCost - modalPaid);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Fuel Purchases & Arrivals
            </h1>
            {isAllCompanies && (
              <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                All Companies
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAllCompanies ? 'All Companies' : activeCompany?.name} — Log fuel tanker deliveries, supplier payments, and payables
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="btn-primary text-xs shadow-sm self-start sm:self-auto flex items-center gap-1.5"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Log Fuel Arrival
        </button>
      </div>

      {/* Accounting Rule Notice */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5 shadow-sm">
        <InformationCircleIcon className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <p className="font-bold text-amber-950">
            Accounting Rule: Purchases Excluded from Total Sales
          </p>
          <p className="text-[11px] text-amber-800 mt-0.5">
            Purchases are money going out and are <strong>never added to Total Sales</strong>. Cash payments to suppliers are deducted from Net Balance as supplier payments, while unpaid balances remain as supplier payables (dues). Do not re-enter fuel purchases under General Expenses to prevent double-counting.
          </p>
        </div>
      </div>

      {/* Summary KPI Cards (4 Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card border-l-4 border-l-blue-500 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">
            Total Fuel Received
          </p>
          <p className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
            {formatNumber(purchaseStats.quantity)} Ltr
          </p>
        </div>

        <div className="stat-card border-l-4 border-l-slate-600 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">
            Total Purchase Cost
          </p>
          <p className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
            {formatCurrency(purchaseStats.cost)}
          </p>
        </div>

        <div className="stat-card border-l-4 border-l-rose-500 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">
            Paid to Suppliers (نقد)
          </p>
          <p className="text-base sm:text-lg font-bold text-rose-600 mt-0.5 tabular-nums">
            {formatCurrency(purchaseStats.paid)}
          </p>
        </div>

        <div className="stat-card border-l-4 border-l-amber-500 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">
            Supplier Dues (بقایا واجب الادا)
          </p>
          <p className="text-base sm:text-lg font-bold text-amber-600 mt-0.5 tabular-nums">
            {formatCurrency(purchaseStats.remaining)}
          </p>
        </div>
      </div>

      {/* Embedded Chart if toggled (Image 1) */}
      {showGraph && graphData.length > 0 && (
        <div className="card p-4 border border-indigo-100 animate-in fade-in duration-150">
          <h3 className="text-xs font-bold text-slate-800 mb-3">
            Recent Purchases Cost Trend
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graphData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="petrolCost" name="Petrol Cost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="dieselCost" name="Diesel Cost" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Toolbar matching Reference Image 1 */}
      <div className="card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Filter Date:</span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="text-slate-400 hover:text-slate-600 text-xs underline"
              >
                Clear
              </button>
            )}
          </div>

          <TransactionToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showSearch={showSearch}
            onToggleSearch={() => setShowSearch(!showSearch)}
            showGraph={showGraph}
            onToggleGraph={() => setShowGraph(!showGraph)}
            onExportExcel={exportToExcel}
            onPrintTable={handlePrintTable}
            searchPlaceholder="Search supplier, fuel type, cost..."
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingState />
      ) : filteredPurchases.length === 0 ? (
        <div className="bg-white p-8 text-center rounded-xl shadow-sm border border-slate-200 text-xs text-slate-500">
          No fuel purchases recorded.
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left divide-y divide-slate-200">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-600 tracking-wider">
                <tr>
                  <th className="px-3.5 py-2 w-12">S.N.</th>
                  <th className="px-3.5 py-2">Date</th>
                  {isAllCompanies && <th className="px-3.5 py-2">Company Code (فرم کوڈ)</th>}
                  <th className="px-3.5 py-2">Fuel Type</th>
                  <th className="px-3.5 py-2">Supplier</th>
                  <th className="px-3.5 py-2 text-right">Quantity (L)</th>
                  <th className="px-3.5 py-2 text-right">Price / L (Rs)</th>
                  <th className="px-3.5 py-2 text-right">Total Cost (Rs)</th>
                  <th className="px-3.5 py-2 text-right">Paid (Rs)</th>
                  <th className="px-3.5 py-2 text-right">Due (Rs)</th>
                  <th className="px-3.5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPurchases.map((purchase, idx) => {
                  const comp = companies.find((c) => c.id === purchase.company_id);
                  const firmCode = getCompanyCode(comp?.name) || '-';
                  const payment = getPurchasePayment(purchase);

                  return (
                    <tr key={purchase.id} className="hover:bg-slate-50 transition">
                      <td className="px-3.5 py-2 tabular-nums text-xs text-slate-500 font-medium">
                        {idx + 1}
                      </td>

                      <td className="px-3.5 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {formatDateDisplay(purchase.date)}
                      </td>

                      {isAllCompanies && (
                        <td className="px-3.5 py-2 text-xs font-mono font-bold text-indigo-700 whitespace-nowrap">
                          <span className="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-xs" title={comp?.name}>
                            {firmCode}
                          </span>
                        </td>
                      )}

                      <td className="px-3.5 py-2 text-xs whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            purchase.fuel_type === 'petrol'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {purchase.fuel_type}
                        </span>
                      </td>

                      <td className="px-3.5 py-2 text-xs font-medium text-slate-900">
                        {purchase.supplier_name || 'Depot'}
                      </td>

                      <td className="px-3.5 py-2 text-right tabular-nums text-xs font-medium text-slate-700">
                        {formatNumber(purchase.quantity_liters)}
                      </td>

                      <td className="px-3.5 py-2 text-right tabular-nums text-xs text-slate-700">
                        {formatCurrency(purchase.price_per_liter)}
                      </td>

                      <td className="px-3.5 py-2 text-right tabular-nums text-xs font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(purchase.total_cost)}
                      </td>

                      <td className="px-3.5 py-2 text-right tabular-nums text-xs font-medium text-rose-600 whitespace-nowrap">
                        {formatCurrency(payment.amountPaid)}
                      </td>

                      <td className="px-3.5 py-2 text-right tabular-nums text-xs font-bold whitespace-nowrap">
                        {payment.remainingBalance > 0 ? (
                          <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            {formatCurrency(payment.remainingBalance)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Paid</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-2 text-right whitespace-nowrap relative overflow-visible">
                        <RowActionsMenu
                          onViewEdit={() => handleOpenModal(purchase)}
                          onPreview={() => handleOpenPreview(purchase)}
                          onPrint={() => handleOpenPreview(purchase)}
                          onShare={() => {
                            navigator.clipboard.writeText(
                              `Fuel arrival: ${purchase.fuel_type.toUpperCase()} ${formatNumber(purchase.quantity_liters)} Ltr for ${formatCurrency(purchase.total_cost)} on ${formatDateDisplay(purchase.date)}`
                            );
                            toast.success('Arrival record copied to clipboard!');
                          }}
                          onDuplicate={() => handleOpenModal(purchase, true)}
                          onDelete={() => setDeleteId(purchase.id)}
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

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEntry ? 'Edit Fuel Purchase' : 'Log Fuel Purchase & Supplier Payment'}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Company Selector (if All Companies is selected) */}
          {isAllCompanies && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Company (کمپنی منتخب کریں)
              </label>
              <select
                value={formData.company_id}
                onChange={(e) =>
                  setFormData({ ...formData, company_id: e.target.value })
                }
                className="w-full border-slate-300 rounded-lg p-1.5 border text-xs"
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
            <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) =>
                setFormData({ ...formData, date: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-1.5 border text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Fuel Type
            </label>
            <select
              value={formData.fuel_type}
              onChange={(e) =>
                setFormData({ ...formData, fuel_type: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-1.5 border text-xs"
            >
              <option value="petrol">Petrol (پٹرول)</option>
              <option value="diesel">Diesel (ڈیزل)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Supplier / Depot Name
            </label>
            <input
              type="text"
              placeholder="e.g. Shell Depot, PSO..."
              value={formData.supplier_name}
              onChange={(e) =>
                setFormData({ ...formData, supplier_name: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-1.5 border text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Quantity (Liters)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.quantity_liters}
                onChange={(e) =>
                  setFormData({ ...formData, quantity_liters: e.target.value })
                }
                className="w-full border-slate-300 rounded-lg p-1.5 border text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Price per Liter (Rs)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.price_per_liter}
                onChange={(e) =>
                  setFormData({ ...formData, price_per_liter: e.target.value })
                }
                className="w-full border-slate-300 rounded-lg p-1.5 border text-xs"
                required
              />
            </div>
          </div>

          {/* Payment Mode Selection: Full Cash vs Credit / Due */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
            <label className="block text-xs font-bold text-slate-800">
              Payment to Supplier (سپلائر ادائیگی)
            </label>

            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="payment_type"
                  value="cash"
                  checked={formData.payment_type === 'cash'}
                  onChange={() => setFormData({ ...formData, payment_type: 'cash' })}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium text-slate-700">Full Cash Paid (پوری رقم ادا)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="payment_type"
                  value="credit"
                  checked={formData.payment_type === 'credit'}
                  onChange={() => setFormData({ ...formData, payment_type: 'credit' })}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium text-slate-700">Partial / Supplier Due (ادھار / بقایا)</span>
              </label>
            </div>

            {formData.payment_type === 'credit' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Cash Amount Paid Now (Rs)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount_paid}
                  onChange={(e) => setFormData({ ...formData, amount_paid: e.target.value })}
                  className="w-full border-slate-300 rounded-lg p-1.5 border text-xs font-bold font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            )}

            {/* Live Calculation Preview */}
            <div className="text-[11px] border-t border-slate-200/80 pt-2 space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Total Delivery Cost:</span>
                <span className="font-bold text-slate-900">{formatCurrency(modalTotalCost)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>Cash Paid to Supplier:</span>
                <span className="font-bold">{formatCurrency(modalPaid)}</span>
              </div>
              <div className="flex justify-between text-amber-600 font-bold">
                <span>Remaining Balance Owed (Due):</span>
                <span>{formatCurrency(modalRemaining)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary text-xs"
            >
              {editingEntry ? 'Save Changes' : 'Log Purchase'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Fuel Purchase"
        message="Are you sure you want to delete this purchase record?"
      />

      {/* Invoice Preview Modal */}
      <InvoicePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        data={previewData}
      />
    </div>
  );
}
