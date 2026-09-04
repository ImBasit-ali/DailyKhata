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
import { moveToTrash } from '@/utils/trashManager';
import { filterActiveRecords, deleteRecordEntirely } from '@/utils/deletedRecordsManager';
import { getCompanyCode } from '@/utils/companyUtils';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/outline';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import ExcelJS from 'exceljs';

export default function FuelInventoryPage() {
  const { activeCompany, companies, isAllCompanies } = useCompany();
  const [fuelType, setFuelType] = useState('petrol');
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasInitialStock, setHasInitialStock] = useState(true);

  // Search and Graph (Image 1)
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formData, setFormData] = useState({
    company_id: '',
    date: todayISO(),
    sold: '',
    rate_per_liter: '',
  });

  // Invoice Preview Modal (Image 2)
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
      checkInitialStock();
      fetchInventory();
    } else {
      setLoading(false);
    }
  }, [companyIds, fuelType, startDate, endDate]);

  const checkInitialStock = async () => {
    try {
      let query = supabase
        .from('fuel_initial_stock')
        .select('*')
        .eq('fuel_type', fuelType);

      if (!isAllCompanies && activeCompany?.id) {
        query = query.eq('company_id', activeCompany.id);
      } else if (companyIds.length > 0) {
        query = query.in('company_id', companyIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      setHasInitialStock(data && data.length > 0);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchInventory = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('fuel_inventory_with_balances')
        .select('*')
        .eq('fuel_type', fuelType)
        .order('date', { ascending: false });

      if (!isAllCompanies && activeCompany?.id) {
        query = query.eq('company_id', activeCompany.id);
      } else if (companyIds.length > 0) {
        query = query.in('company_id', companyIds);
      }

      if (startDate) query = query.gte('date', startDate);
      if (endDate) query = query.lte('date', endDate);

      const { data, error } = await query;
      if (error) throw error;
      setInventory(filterActiveRecords(data || []));
    } catch (err) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (entry = null, isDuplicate = false) => {
    setEditingEntry(isDuplicate ? null : entry);
    const targetCompanyId =
      entry?.company_id || (isAllCompanies ? companies[0]?.id : activeCompany?.id);

    setFormData(
      entry
        ? {
            company_id: targetCompanyId,
            date: isDuplicate ? todayISO() : entry.date,
            sold: String(entry.sold),
            rate_per_liter: String(entry.rate_per_liter),
          }
        : {
            company_id: targetCompanyId,
            date: todayISO(),
            sold: '',
            rate_per_liter: '',
          }
    );
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const sold = parseFloat(formData.sold);
    const rate = parseFloat(formData.rate_per_liter);

    if (isNaN(sold) || isNaN(rate) || sold < 0 || rate < 0) {
      toast.error('Please enter valid numbers for sold and rate');
      return;
    }

    const salesAmount = Math.round(sold * rate * 100) / 100;

    try {
      const payload = {
        company_id: formData.company_id,
        date: formData.date,
        fuel_type: fuelType,
        sold,
        rate_per_liter: rate,
        sales_amount: salesAmount,
      };

      if (editingEntry) {
        const { error } = await supabase
          .from('fuel_inventory')
          .update(payload)
          .eq('id', editingEntry.id);
        if (error) throw error;
        toast.success('Inventory updated');
      } else {
        const { error } = await supabase.from('fuel_inventory').insert([payload]);
        if (error) throw error;
        toast.success('Daily entry saved');
      }
      setIsModalOpen(false);
      fetchInventory();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Operation failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const itemToDelete = inventory.find((i) => i.id === deleteId);
      if (itemToDelete) {
        moveToTrash({
          table: 'fuel_inventory',
          itemType: 'Fuel Reading',
          title: `${itemToDelete.fuel_type.toUpperCase()} Daily Reading`,
          details: `Date: ${formatDateDisplay(itemToDelete.date)} - Sold: ${formatNumber(itemToDelete.sold)} Ltr`,
          amount: Number(itemToDelete.sales_amount || 0),
          company_id: itemToDelete.company_id,
          originalData: itemToDelete,
        });
      }

      await deleteRecordEntirely(deleteId, 'fuel_inventory');
      toast.success('Record deleted from database');
      setDeleteId(null);
      fetchInventory();
    } catch (err) {
      toast.error('Failed to delete entry');
    }
  };

  // Preview Invoice Handler (Exact Match to Reference Image 2)
  const handleOpenPreview = (entry) => {
    const comp =
      companies.find((c) => c.id === entry.company_id) || activeCompany;
    const itemName = fuelType === 'petrol' ? 'Petrol' : 'Diesel';

    setPreviewData({
      companyName: comp?.name || 'Gill Petroleum Services',
      companyPhone: comp?.phone || '0300-1234567',
      companyEmail: comp?.email || 'basit610476@gmail.com',
      billTo: 'Daily Fuel Station Dispatch / Party B',
      invoiceNo: `INV-${entry.id.slice(0, 6).toUpperCase()}`,
      date: entry.date,
      items: [
        {
          name: itemName,
          quantity: Number(entry.sold),
          unit: 'Ltr',
          pricePerUnit: Number(entry.rate_per_liter),
          amount: Number(entry.sales_amount),
        },
      ],
      totalAmount: Number(entry.sales_amount),
      notes: `Opening: ${formatNumber(entry.opening_balance)} Ltr | Closing: ${formatNumber(entry.closing_balance)} Ltr`,
    });
    setIsPreviewOpen(true);
  };

  // Filter and search across all columns (Image 1)
  const filteredInventory = useMemo(() => {
    if (!searchQuery.trim()) return inventory;
    const q = searchQuery.toLowerCase().trim();

    return inventory.filter((e) => {
      const d = formatDateDisplay(e.date).toLowerCase();
      const open = String(e.opening_balance || '');
      const purch = String(e.purchased || '');
      const sld = String(e.sold || '');
      const rt = String(e.rate_per_liter || '');
      const sa = String(e.sales_amount || '');
      const cls = String(e.closing_balance || '');

      return (
        d.includes(q) ||
        open.includes(q) ||
        purch.includes(q) ||
        sld.includes(q) ||
        rt.includes(q) ||
        sa.includes(q) ||
        cls.includes(q)
      );
    });
  }, [inventory, searchQuery]);

  // Graph Data
  const graphData = useMemo(() => {
    return filteredInventory
      .slice(0, 14)
      .reverse()
      .map((e) => ({
        date: formatDateDisplay(e.date),
        sold: Number(e.sold || 0),
        closing: Number(e.closing_balance || 0),
      }));
  }, [filteredInventory]);

  // Export to Excel (.xls)
  const exportToExcel = async () => {
    if (filteredInventory.length === 0) {
      toast.error('No inventory records to export');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`${fuelType.toUpperCase()} Inventory`);

    sheet.columns = [
      { header: 'S.N.', key: 'sn', width: 8 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Opening (L)', key: 'opening', width: 16 },
      { header: 'Purchased (L)', key: 'purchased', width: 16 },
      { header: 'Sold (L)', key: 'sold', width: 16 },
      { header: 'Rate / L (Rs)', key: 'rate', width: 16 },
      { header: 'Sales Amount (Rs)', key: 'sales', width: 20 },
      { header: 'Closing (L)', key: 'closing', width: 16 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' },
    };
    sheet.getRow(1).height = 26;

    filteredInventory.forEach((row, idx) => {
      sheet.addRow({
        sn: idx + 1,
        date: formatDateDisplay(row.date),
        opening: Number(row.opening_balance),
        purchased: Number(row.purchased),
        sold: Number(row.sold),
        rate: Number(row.rate_per_liter),
        sales: Number(row.sales_amount),
        closing: Number(row.closing_balance),
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCompany?.name || 'Company'}_${fuelType}_${todayISO()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Fuel inventory exported to Excel!');
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
          <title>Fuel Inventory - ${compName}</title>
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
            <h3>${fuelType.toUpperCase()} Inventory Statement</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th class="right">Opening (L)</th>
                <th class="right">Purchased (L)</th>
                <th class="right">Sold (L)</th>
                <th class="right">Rate (Rs)</th>
                <th class="right">Sales (Rs)</th>
                <th class="right">Closing (L)</th>
              </tr>
            </thead>
            <tbody>
              ${filteredInventory.map(row => `
                <tr>
                  <td>${formatDateDisplay(row.date)}</td>
                  <td class="right">${formatNumber(row.opening_balance)}</td>
                  <td class="right">${row.purchased > 0 ? formatNumber(row.purchased) : '-'}</td>
                  <td class="right">${formatNumber(row.sold)}</td>
                  <td class="right">${formatCurrency(row.rate_per_liter)}</td>
                  <td class="right">${formatCurrency(Number(row.sales_amount) > 0 ? row.sales_amount : Number(row.sold || 0) * Number(row.rate_per_liter || 0))}</td>
                  <td class="right">${formatNumber(row.closing_balance)}</td>
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

  const totalSold = filteredInventory.reduce(
    (acc, row) => acc + Number(row.sold || 0),
    0
  );
  const totalSalesAmount = filteredInventory.reduce(
    (acc, row) =>
      acc +
      Number(
        Number(row.sales_amount) > 0
          ? row.sales_amount
          : Number(row.sold || 0) * Number(row.rate_per_liter || 0)
      ),
    0
  );

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Fuel Inventory & Sales
            </h1>
            {isAllCompanies && (
              <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                All Companies
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAllCompanies ? 'All Companies' : activeCompany?.name} — Track daily dip stock, sales volume, and balances
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="btn-primary text-xs shadow-sm self-start sm:self-auto flex items-center gap-1.5"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add Daily Reading
        </button>
      </div>

      {/* Fuel Type Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-6">
          <button
            onClick={() => setFuelType('petrol')}
            className={`py-2 px-1 border-b-2 font-semibold text-xs transition-colors ${
              fuelType === 'petrol'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Petrol (پٹرول)
          </button>
          <button
            onClick={() => setFuelType('diesel')}
            className={`py-2 px-1 border-b-2 font-semibold text-xs transition-colors ${
              fuelType === 'diesel'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Diesel (ڈیزل)
          </button>
        </nav>
      </div>

      {!hasInitialStock && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-2.5 rounded-r-lg">
          <div className="flex">
            <div className="ml-2">
              <p className="text-xs text-amber-700">
                Initial stock has not been set for {fuelType}.{' '}
                <Link
                  to="/settings"
                  className="font-semibold underline hover:text-amber-600"
                >
                  Configure it in Settings
                </Link>{' '}
                to calculate opening and closing balances accurately.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="stat-card border-l-4 border-l-amber-500 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">
            Total {fuelType.toUpperCase()} Sold
          </p>
          <p className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
            {formatNumber(totalSold)} Ltr
          </p>
        </div>

        <div className="stat-card border-l-4 border-l-emerald-500 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">
            Total Sales Revenue
          </p>
          <p className="text-lg sm:text-xl font-bold text-emerald-600 mt-0.5 tabular-nums">
            {formatCurrency(totalSalesAmount)}
          </p>
        </div>

        <div className="stat-card border-l-4 border-l-indigo-500 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">
            Current Closing Stock
          </p>
          <p className="text-lg sm:text-xl font-bold text-indigo-700 mt-0.5 tabular-nums">
            {filteredInventory.length > 0
              ? formatNumber(filteredInventory[0].closing_balance)
              : 0}{' '}
            Ltr
          </p>
        </div>
      </div>

      {/* Embedded Stock Trend Chart if toggled (Image 1) */}
      {showGraph && graphData.length > 0 && (
        <div className="card p-6 border border-indigo-100 animate-in fade-in duration-150">
          <h3 className="text-sm font-bold text-slate-800 mb-4">
            {fuelType.toUpperCase()} Daily Sales & Closing Stock Trend
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={graphData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => `${formatNumber(value)} Ltr`} />
                <Legend />
                <Area type="monotone" dataKey="closing" name="Closing Stock (L)" stroke="#6366f1" fill="#e0e7ff" />
                <Area type="monotone" dataKey="sold" name="Sold (L)" stroke="#f59e0b" fill="#fef3c7" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Toolbar matching Reference Image 1 */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Date:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
            />
            {(startDate || endDate || searchQuery) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setSearchQuery('');
                }}
                className="text-xs text-indigo-600 font-medium hover:underline ml-2"
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
            searchPlaceholder="Search date, sold, rate, balance..."
          />
        </div>
      </div>

      {/* Inventory Table */}
      {loading ? (
        <LoadingState />
      ) : filteredInventory.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl shadow-sm border border-slate-200 text-slate-500">
          No records found for {fuelType}.
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
                  <th className="px-3.5 py-2 text-right">Opening (L)</th>
                  <th className="px-3.5 py-2 text-right">Purchased (L)</th>
                  <th className="px-3.5 py-2 text-right">Sold (L)</th>
                  <th className="px-3.5 py-2 text-right">Rate / L (Rs)</th>
                  <th className="px-3.5 py-2 text-right">Sales Amount (Rs)</th>
                  <th className="px-3.5 py-2 text-right">Closing (L)</th>
                  <th className="px-3.5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInventory.map((row, idx) => {
                  const comp = companies.find((c) => c.id === row.company_id);
                  const firmCode = getCompanyCode(comp?.name) || '-';

                  return (
                    <tr key={row.id} className="hover:bg-slate-50 transition">
                      <td className="px-3.5 py-2 tabular-nums text-xs text-slate-500 font-medium">
                        {idx + 1}
                      </td>

                      <td className="px-3.5 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {formatDateDisplay(row.date)}
                      </td>

                      {isAllCompanies && (
                        <td className="px-3.5 py-2 text-xs font-mono font-bold text-indigo-700 whitespace-nowrap">
                          <span className="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-xs" title={comp?.name}>
                            {firmCode}
                          </span>
                        </td>
                      )}

                      <td className="px-3.5 py-2 text-right tabular-nums text-xs text-slate-500">
                        {formatNumber(row.opening_balance)}
                      </td>
                      <td className="px-3.5 py-2 text-right tabular-nums text-xs font-medium text-emerald-600">
                        {row.purchased > 0 ? formatNumber(row.purchased) : '-'}
                      </td>
                      <td className="px-3.5 py-2 text-right tabular-nums text-xs font-medium text-rose-600">
                        {formatNumber(row.sold)}
                      </td>
                      <td className="px-3.5 py-2 text-right tabular-nums text-xs text-slate-700">
                        {formatCurrency(row.rate_per_liter)}
                      </td>
                      <td className="px-3.5 py-2 text-right tabular-nums text-xs font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(
                          Number(row.sales_amount) > 0
                            ? row.sales_amount
                            : Number(row.sold || 0) * Number(row.rate_per_liter || 0)
                        )}
                      </td>
                      <td className="px-3.5 py-2 text-right tabular-nums text-xs font-bold text-indigo-700">
                        {formatNumber(row.closing_balance)}
                      </td>

                      {/* Actions matching Reference Image 1 */}
                      <td className="px-3.5 py-2 text-right whitespace-nowrap relative overflow-visible">
                        <RowActionsMenu
                          onViewEdit={() => handleOpenModal(row)}
                          onPreview={() => handleOpenPreview(row)}
                          onPrint={() => handleOpenPreview(row)}
                          onShare={() => {
                            navigator.clipboard.writeText(
                              `${fuelType.toUpperCase()} sales: ${formatNumber(row.sold)} Ltr @ ${formatCurrency(row.rate_per_liter)} = ${formatCurrency(row.sales_amount)} on ${formatDateDisplay(row.date)}`
                            );
                            toast.success('Reading copied to clipboard!');
                          }}
                          onDuplicate={() => handleOpenModal(row, true)}
                          onDelete={() => setDeleteId(row.id)}
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

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          editingEntry
            ? `Edit Daily ${fuelType.toUpperCase()} Entry`
            : `Add Daily ${fuelType.toUpperCase()} Reading`
        }
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
              Sold (Liters)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.sold}
              onChange={(e) =>
                setFormData({ ...formData, sold: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-2 border text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Rate per Liter (Rs)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.rate_per_liter}
              onChange={(e) =>
                setFormData({ ...formData, rate_per_liter: e.target.value })
              }
              className="w-full border-slate-300 rounded-lg p-2 border text-sm"
              required
            />
          </div>

          {/* Live Calculated Total Fuel Sales (Sold Liters * Rate per Liter) */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-900">
                Total {fuelType.toUpperCase()} Sales (کُل فروخت):
              </span>
              <span className="text-sm font-black text-emerald-700 tabular-nums">
                {formatCurrency(
                  (parseFloat(formData.sold) || 0) * (parseFloat(formData.rate_per_liter) || 0)
                )}
              </span>
            </div>
            <p className="text-[11px] text-emerald-600">
              Formula: {formData.sold || '0'} Ltr × Rs {formData.rate_per_liter || '0'}/L = {formatCurrency(
                (parseFloat(formData.sold) || 0) * (parseFloat(formData.rate_per_liter) || 0)
              )}
            </p>
          </div>

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
        title="Delete Reading"
        message="Are you sure you want to delete this daily inventory record?"
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
