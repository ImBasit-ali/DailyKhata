import { useState, useEffect, useMemo } from 'react'
import { useCompany } from '@/contexts/CompanyContext'
import { supabase } from '@/lib/supabaseClient'
import { formatCurrency, formatNumber } from '@/utils/formatters'
import { formatDateDisplay, getDateRange, todayISO } from '@/utils/dateUtils'
import { exportReport } from '@/utils/excelExport'
import { getPreviousNetBalance, getPurchasePayment } from '@/utils/balanceUtils'
import { filterActiveRecords } from '@/utils/deletedRecordsManager'
import { parseExpenseRecords } from '@/utils/expenseCategoryManager'
import {
  DocumentArrowDownIcon,
  BuildingStorefrontIcon,
  FunnelIcon,
  InformationCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function ReportsPage() {
  const { activeCompany, companies, isAllCompanies } = useCompany()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [period, setPeriod] = useState('thisMonth')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [reportData, setReportData] = useState(null)

  const companyIds = useMemo(() => {
    if (!companies || companies.length === 0) return []
    if (!isAllCompanies && activeCompany?.id) return [activeCompany.id]
    return companies.map((c) => c.id)
  }, [activeCompany, companies, isAllCompanies])

  useEffect(() => {
    if (!activeCompany && (!companies || companies.length === 0)) {
      setLoading(false)
      return
    }
    fetchReportData()

    const handleDataChanged = () => {
      fetchReportData()
    }
    window.addEventListener('dailykhata_data_changed', handleDataChanged)
    return () => {
      window.removeEventListener('dailykhata_data_changed', handleDataChanged)
    }
  }, [activeCompany, companies, isAllCompanies, period, customStart, customEnd])

  async function fetchReportData() {
    setLoading(true)
    let dateRange
    if (period === 'custom' && customStart && customEnd) {
      dateRange = { start: customStart, end: customEnd }
    } else {
      dateRange = getDateRange(period)
    }

    try {
      let txQ = supabase
        .from('cash_transactions')
        .select('*')
        .gte('date', dateRange.start)
        .lte('date', dateRange.end)
        .order('date')

      let expQ = supabase
        .from('expenses')
        .select('*')
        .gte('date', dateRange.start)
        .lte('date', dateRange.end)
        .order('date')

      let fuelQ = supabase
        .from('fuel_inventory_with_balances')
        .select('*')
        .gte('date', dateRange.start)
        .lte('date', dateRange.end)
        .order('date')

      let purQ = supabase
        .from('fuel_purchases')
        .select('*')
        .gte('date', dateRange.start)
        .lte('date', dateRange.end)
        .order('date')

      if (!isAllCompanies && activeCompany?.id) {
        txQ = txQ.eq('company_id', activeCompany.id)
        expQ = expQ.eq('company_id', activeCompany.id)
        fuelQ = fuelQ.eq('company_id', activeCompany.id)
        purQ = purQ.eq('company_id', activeCompany.id)
      } else if (companyIds.length > 0) {
        txQ = txQ.in('company_id', companyIds)
        expQ = expQ.in('company_id', companyIds)
        fuelQ = fuelQ.in('company_id', companyIds)
        purQ = purQ.in('company_id', companyIds)
      } else {
        txQ = txQ.eq('company_id', '00000000-0000-0000-0000-000000000000')
        expQ = expQ.eq('company_id', '00000000-0000-0000-0000-000000000000')
        fuelQ = fuelQ.eq('company_id', '00000000-0000-0000-0000-000000000000')
        purQ = purQ.eq('company_id', '00000000-0000-0000-0000-000000000000')
      }

      const [transactionsRes, expensesRes, fuelRes, fuelPurchasesRes] = await Promise.all([
        txQ,
        expQ,
        fuelQ,
        purQ,
      ])

      const transactions = filterActiveRecords(transactionsRes.data || [])
      const expenses = parseExpenseRecords(filterActiveRecords(expensesRes.data || []))
      const fuel = filterActiveRecords(fuelRes.data || [])
      const fuelPurchases = filterActiveRecords(fuelPurchasesRes.data || [])

      // Fuel calculations
      const petrolData = fuel.filter(f => f.fuel_type === 'petrol')
      const dieselData = fuel.filter(f => f.fuel_type === 'diesel')

      const petrolSold = petrolData.reduce((s, f) => s + Number(f.sold || 0), 0)
      const petrolSalesAmt = petrolData.reduce(
        (s, f) =>
          s +
          Number(
            Number(f.sales_amount) > 0
              ? f.sales_amount
              : Number(f.sold || 0) * Number(f.rate_per_liter || 0)
          ),
        0
      )
      const petrolAvgRate = petrolSold > 0 ? petrolSalesAmt / petrolSold : 0

      const dieselSold = dieselData.reduce((s, f) => s + Number(f.sold || 0), 0)
      const dieselSalesAmt = dieselData.reduce(
        (s, f) =>
          s +
          Number(
            Number(f.sales_amount) > 0
              ? f.sales_amount
              : Number(f.sold || 0) * Number(f.rate_per_liter || 0)
          ),
        0
      )
      const dieselAvgRate = dieselSold > 0 ? dieselSalesAmt / dieselSold : 0

      const totalFuelSales = petrolSalesAmt + dieselSalesAmt

      // General Counter / Shop Sales
      const generalSales = transactions
        .filter(t => t.tx_type === 'sale')
        .reduce((s, t) => s + Number(t.amount || 0), 0)

      // Cash Advances Received from customers
      const cashAdvances = transactions
        .filter(t => t.tx_type === 'cash_advance')
        .reduce((s, t) => s + Number(t.amount || 0), 0)

      // UNIFIED TOTAL SALES: Fuel Sales + Other General Sales + Advance Payments
      const totalSales = totalFuelSales + generalSales + cashAdvances

      // Customer credit dues cleared
      const duesPaid = transactions
        .filter(t => t.tx_type === 'due_payment')
        .reduce((s, t) => s + Number(t.amount || 0), 0)

      // Expenses breakdown
      const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
      const salaryExpenses = expenses
        .filter(e => (e.category || '').toLowerCase().includes('salar') || (e.name || '').toLowerCase().includes('salar'))
        .reduce((s, e) => s + Number(e.amount || 0), 0)
      const otherExpenses = totalExpenses - salaryExpenses

      // Fuel purchases cost
      const totalPurchases = fuelPurchases.reduce((s, p) => s + Number(p.total_cost || 0), 0)

      // Previous Net Balance (configured in Settings)
      const previousNetBalance = getPreviousNetBalance(activeCompany, companies, isAllCompanies)

      // Payments to suppliers (cash paid) vs remaining supplier dues owed
      let supplierPayments = 0
      let supplierDues = 0
      fuelPurchases.forEach(p => {
        const payment = getPurchasePayment(p)
        supplierPayments += payment.amountPaid
        supplierDues += payment.remainingBalance
      })

      // Cash purchases from cash transactions
      const cashPurchases = transactions
        .filter(t => t.tx_type === 'purchase')
        .reduce((s, t) => s + Number(t.amount || 0), 0)
      supplierPayments += cashPurchases

      // Full Net Balance: Previous Net Balance + Total Sales − Total Expenses − Supplier Payments − Dues Paid
      const netBalance = previousNetBalance + totalSales - totalExpenses - supplierPayments - duesPaid

      setReportData({
        dateRange,
        previousNetBalance,
        totalSales,
        totalFuelSales,
        generalSales,
        cashAdvances,
        totalPurchases,
        supplierPayments,
        supplierDues,
        totalExpenses,
        salaryExpenses,
        otherExpenses,
        duesPaid,
        netBalance,
        petrolOpening: petrolData.length > 0 ? Number(petrolData[0].opening_balance || 0) : 0,
        petrolClosing: petrolData.length > 0 ? Number(petrolData[petrolData.length - 1].closing_balance || 0) : 0,
        petrolSold,
        petrolAvgRate,
        dieselOpening: dieselData.length > 0 ? Number(dieselData[0].opening_balance || 0) : 0,
        dieselClosing: dieselData.length > 0 ? Number(dieselData[dieselData.length - 1].closing_balance || 0) : 0,
        dieselSold,
        dieselAvgRate,
        petrolData,
        dieselData,
        expensesData: expenses,
        transactionsData: transactions,
      })
    } catch (err) {
      console.error('Report fetch error:', err)
      toast.error('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }

  async function handleExport() {
    if (!reportData) return
    const exportName = isAllCompanies ? 'All Companies' : (activeCompany?.name || 'Company')
    try {
      await exportReport(reportData, exportName, period)
      toast.success('Report exported successfully!')
    } catch (err) {
      console.error('Export error:', err)
      toast.error('Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  // Group expenses by category for summary table
  const expensesByCategory = useMemo(() => {
    if (!reportData?.expensesData) return []
    const map = {}
    reportData.expensesData.forEach(e => {
      const cat = e.category || 'General & Misc'
      map[cat] = (map[cat] || 0) + Number(e.amount || 0)
    })
    return Object.entries(map).map(([category, amount]) => ({ category, amount }))
  }, [reportData])

  if (!activeCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <BuildingStorefrontIcon className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-600">No Company Selected</h2>
        <p className="mt-2 text-sm text-slate-400">Select a company to view reports.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-header">Financial Reports</h1>
          <p className="mt-1 text-sm text-slate-500">{activeCompany.name} — Unified Sales, Expenses, and Net Balance</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchReportData()}
            disabled={loading}
            title="Refresh Report Data"
            className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition ring-1 ring-slate-200 bg-white"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
          <button
            onClick={handleExport}
            disabled={!reportData || exporting}
            className="btn-primary"
          >
            <DocumentArrowDownIcon className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export to Excel'}
          </button>
        </div>
      </div>

      {/* Period Filter (Daily, 7 Days, 30 Days, Monthly, Yearly, Custom) */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <FunnelIcon className="h-5 w-5 text-slate-400" />
          <span className="text-xs font-semibold uppercase text-slate-500 mr-1">Period:</span>
          {[
            { key: 'today', label: 'Daily (Today)' },
            { key: 'last7', label: '7 Days' },
            { key: 'last30', label: '30 Days' },
            { key: 'thisMonth', label: 'Monthly' },
            { key: 'thisYear', label: 'Yearly' },
            { key: 'custom', label: 'Custom' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                period === p.key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}

          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="input-field w-40 text-xs"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="input-field w-40 text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-6">
              <div className="skeleton h-6 w-48 mb-4" />
              <div className="skeleton h-32 w-full" />
            </div>
          ))}
        </div>
      ) : reportData ? (
        <div className="space-y-4">
          {/* Prominent Net Balance Banner */}
          <div className="card p-4 bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 text-white shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                  Net Cash Balance (خالص بقایا)
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold mt-1 tabular-nums">
                  {formatCurrency(reportData.netBalance)}
                </h2>
              </div>
              <div className="text-xs bg-white/10 p-2.5 rounded-lg border border-white/10 text-slate-200">
                <p className="font-semibold text-white">Full Net Balance Formula:</p>
                <p className="text-[11px] mt-0.5">
                  Prev ({formatCurrency(reportData.previousNetBalance, false)}) + Sales ({formatCurrency(reportData.totalSales, false)}) − Expenses ({formatCurrency(reportData.totalExpenses, false)}) − Supplier Paid ({formatCurrency(reportData.supplierPayments, false)}) − Dues Paid ({formatCurrency(reportData.duesPaid, false)}) = <strong className="text-white">{formatCurrency(reportData.netBalance, false)}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Accounting Rule Notice */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-2.5 text-xs text-amber-900 flex items-start gap-2 shadow-xs">
            <InformationCircleIcon className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed text-[11px]">
              <strong className="text-amber-950">Accounting Rule:</strong> Purchases are excluded from Total Sales. Only fuel, counter, and customer advance payments are counted as revenue. Cash paid to suppliers is deducted from Net Balance as supplier payments, while unpaid amounts remain as supplier payables (dues). Purchases must not be entered into General Expenses to avoid double-counting.
            </div>
          </div>

          {/* Key Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total Combined Sales */}
            <div className="stat-card border-l-4 border-l-emerald-500 p-3">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Total Combined Sales (کُل آمدنی)
              </p>
              <p className="text-lg sm:text-xl font-bold text-emerald-600 mt-0.5 tabular-nums">
                {formatCurrency(reportData.totalSales)}
              </p>
              <div className="text-[11px] text-slate-400 mt-1.5 border-t border-slate-100 pt-1.5 space-y-0.5">
                <div className="flex justify-between">
                  <span>Fuel Sales:</span>
                  <span className="font-medium text-slate-600">{formatCurrency(reportData.totalFuelSales, false)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Counter / Other:</span>
                  <span className="font-medium text-slate-600">{formatCurrency(reportData.generalSales, false)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Advances Received:</span>
                  <span className="font-medium text-slate-600">{formatCurrency(reportData.cashAdvances, false)}</span>
                </div>
              </div>
            </div>

            {/* Total Expenses (with salaries split) */}
            <div className="stat-card border-l-4 border-l-rose-500 p-3">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Total Expenses (کُل اخراجات)
              </p>
              <p className="text-lg sm:text-xl font-bold text-rose-600 mt-0.5 tabular-nums">
                {formatCurrency(reportData.totalExpenses)}
              </p>
              <div className="text-[11px] text-slate-400 mt-1.5 border-t border-slate-100 pt-1.5 space-y-0.5">
                <div className="flex justify-between">
                  <span>Salaries (تنخواہیں):</span>
                  <span className="font-medium text-slate-600">{formatCurrency(reportData.salaryExpenses, false)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bills, Rent & Misc:</span>
                  <span className="font-medium text-slate-600">{formatCurrency(reportData.otherExpenses, false)}</span>
                </div>
              </div>
            </div>

            {/* Payments to Suppliers */}
            <div className="stat-card border-l-4 border-l-amber-500 p-3">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Payments to Suppliers (ادائیگی)
              </p>
              <p className="text-lg sm:text-xl font-bold text-slate-800 mt-0.5 tabular-nums">
                {formatCurrency(reportData.supplierPayments)}
              </p>
              <div className="text-[11px] text-slate-400 mt-1.5 border-t border-slate-100 pt-1.5 space-y-0.5">
                <div className="flex justify-between">
                  <span>Total Purchases Cost:</span>
                  <span className="font-medium text-slate-600">{formatCurrency(reportData.totalPurchases, false)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Supplier Dues Owed:</span>
                  <span className="font-bold text-amber-600">{formatCurrency(reportData.supplierDues, false)}</span>
                </div>
              </div>
            </div>

            {/* Customer Dues Settled */}
            <div className="stat-card border-l-4 border-l-blue-500 p-3">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Customer Dues Cleared
              </p>
              <p className="text-lg sm:text-xl font-bold text-blue-600 mt-0.5 tabular-nums">
                {formatCurrency(reportData.duesPaid)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1.5 border-t border-slate-100 pt-1.5">
                Customer debt repayments received
              </p>
            </div>
          </div>

          {/* Expense Categories Breakdown Table */}
          {expensesByCategory.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="section-header text-sm">Expenses Breakdown by Category (Salaries, Utilities, Rent, etc.)</h3>
                <span className="text-xs font-bold text-slate-700">Total: {formatCurrency(reportData.totalExpenses)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Category (زمرہ)</th>
                      <th className="table-header text-right">Total Amount (Rs)</th>
                      <th className="table-header text-right">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expensesByCategory.map((row, i) => {
                      const pct = reportData.totalExpenses > 0 ? ((row.amount / reportData.totalExpenses) * 100).toFixed(1) : 0
                      return (
                        <tr key={row.category} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="table-cell font-medium text-slate-800">{row.category}</td>
                          <td className="table-cell text-right tabular-nums font-semibold text-rose-600">{formatCurrency(row.amount)}</td>
                          <td className="table-cell text-right tabular-nums text-slate-500">{pct}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fuel Summary Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Petrol Summary */}
            <div className="card p-6">
              <h3 className="section-header flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                Petrol Summary
              </h3>
              <div className="mt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Opening Balance</span>
                  <span className="font-medium tabular-nums">{formatNumber(reportData.petrolOpening)} L</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total Sold</span>
                  <span className="font-medium tabular-nums">{formatNumber(reportData.petrolSold)} L</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Closing Balance</span>
                  <span className="font-medium tabular-nums">{formatNumber(reportData.petrolClosing)} L</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-100 pt-3">
                  <span className="text-slate-500">Weighted Avg Rate</span>
                  <span className="font-semibold text-primary-600 tabular-nums">{formatCurrency(reportData.petrolAvgRate)}/L</span>
                </div>
              </div>
            </div>

            {/* Diesel Summary */}
            <div className="card p-6">
              <h3 className="section-header flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary-500" />
                Diesel Summary
              </h3>
              <div className="mt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Opening Balance</span>
                  <span className="font-medium tabular-nums">{formatNumber(reportData.dieselOpening)} L</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total Sold</span>
                  <span className="font-medium tabular-nums">{formatNumber(reportData.dieselSold)} L</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Closing Balance</span>
                  <span className="font-medium tabular-nums">{formatNumber(reportData.dieselClosing)} L</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-100 pt-3">
                  <span className="text-slate-500">Weighted Avg Rate</span>
                  <span className="font-semibold text-primary-600 tabular-nums">{formatCurrency(reportData.dieselAvgRate)}/L</span>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Fuel Breakdown Tables */}
          {reportData.petrolData.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                <h3 className="section-header text-sm">Petrol — Daily Sales & Carry Forward</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Date</th>
                      <th className="table-header text-right">Opening (L)</th>
                      <th className="table-header text-right">Purchased (L)</th>
                      <th className="table-header text-right">Sold (L)</th>
                      <th className="table-header text-right">Rate/L</th>
                      <th className="table-header text-right">Sales (Rs)</th>
                      <th className="table-header text-right">Closing (L)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.petrolData.map((row, i) => (
                      <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="table-cell">{formatDateDisplay(row.date)}</td>
                        <td className="table-cell text-right tabular-nums">{formatNumber(row.opening_balance)}</td>
                        <td className="table-cell text-right tabular-nums text-emerald-600">{formatNumber(row.purchased)}</td>
                        <td className="table-cell text-right tabular-nums text-rose-600">{formatNumber(row.sold)}</td>
                        <td className="table-cell text-right tabular-nums">{formatCurrency(row.rate_per_liter)}</td>
                        <td className="table-cell text-right tabular-nums font-semibold">{formatCurrency(row.sales_amount)}</td>
                        <td className="table-cell text-right tabular-nums font-bold text-indigo-700">{formatNumber(row.closing_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportData.dieselData.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                <h3 className="section-header text-sm">Diesel — Daily Sales & Carry Forward</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Date</th>
                      <th className="table-header text-right">Opening (L)</th>
                      <th className="table-header text-right">Purchased (L)</th>
                      <th className="table-header text-right">Sold (L)</th>
                      <th className="table-header text-right">Rate/L</th>
                      <th className="table-header text-right">Sales (Rs)</th>
                      <th className="table-header text-right">Closing (L)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.dieselData.map((row, i) => (
                      <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="table-cell">{formatDateDisplay(row.date)}</td>
                        <td className="table-cell text-right tabular-nums">{formatNumber(row.opening_balance)}</td>
                        <td className="table-cell text-right tabular-nums text-emerald-600">{formatNumber(row.purchased)}</td>
                        <td className="table-cell text-right tabular-nums text-rose-600">{formatNumber(row.sold)}</td>
                        <td className="table-cell text-right tabular-nums">{formatCurrency(row.rate_per_liter)}</td>
                        <td className="table-cell text-right tabular-nums font-semibold">{formatCurrency(row.sales_amount)}</td>
                        <td className="table-cell text-right tabular-nums font-bold text-indigo-700">{formatNumber(row.closing_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
