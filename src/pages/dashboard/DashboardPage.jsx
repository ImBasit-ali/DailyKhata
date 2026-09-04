import { useState, useEffect, useMemo } from 'react'
import { useCompany } from '@/contexts/CompanyContext'
import { supabase } from '@/lib/supabaseClient'
import { formatCurrency } from '@/utils/formatters'
import { formatDateDisplay, getDateRange } from '@/utils/dateUtils'
import { filterActiveRecords } from '@/utils/deletedRecordsManager'
import { parseExpenseRecords } from '@/utils/expenseCategoryManager'
import { getPreviousNetBalance, getPurchasePayment } from '@/utils/balanceUtils'
import { BuildingStorefrontIcon, ArrowPathIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

export default function DashboardPage() {
  const { activeCompany, companies, isAllCompanies } = useCompany()
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('thisMonth')
  
  // States for KPIs
  const [reportData, setReportData] = useState(null)
  const [salesTrend, setSalesTrend] = useState([])

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
    fetchDashboardData()

    const handleDataChanged = () => {
      fetchDashboardData()
    }
    window.addEventListener('vyapar_data_changed', handleDataChanged)
    return () => {
      window.removeEventListener('vyapar_data_changed', handleDataChanged)
    }
  }, [activeCompany, companies, isAllCompanies, period])

  async function fetchDashboardData() {
    setLoading(true)
    const { start, end } = getDateRange(period)

    try {
      let cashTransQ = supabase.from('cash_transactions').select('*').gte('date', start).lte('date', end)
      let fuelQ = supabase.from('fuel_inventory_with_balances').select('*').gte('date', start).lte('date', end).order('date', { ascending: true })
      let expQ = supabase.from('expenses').select('*').gte('date', start).lte('date', end)
      let purQ = supabase.from('fuel_purchases').select('*').gte('date', start).lte('date', end)

      if (!isAllCompanies && activeCompany?.id) {
        cashTransQ = cashTransQ.eq('company_id', activeCompany.id)
        fuelQ = fuelQ.eq('company_id', activeCompany.id)
        expQ = expQ.eq('company_id', activeCompany.id)
        purQ = purQ.eq('company_id', activeCompany.id)
      } else if (companyIds.length > 0) {
        cashTransQ = cashTransQ.in('company_id', companyIds)
        fuelQ = fuelQ.in('company_id', companyIds)
        expQ = expQ.in('company_id', companyIds)
        purQ = purQ.in('company_id', companyIds)
      } else {
        cashTransQ = cashTransQ.eq('company_id', '00000000-0000-0000-0000-000000000000')
        fuelQ = fuelQ.eq('company_id', '00000000-0000-0000-0000-000000000000')
        expQ = expQ.eq('company_id', '00000000-0000-0000-0000-000000000000')
        purQ = purQ.eq('company_id', '00000000-0000-0000-0000-000000000000')
      }

      const [cashTransRes, fuelRes, expRes, purRes] = await Promise.all([cashTransQ, fuelQ, expQ, purQ])

      const transactions = filterActiveRecords(cashTransRes.data || [])
      const fuel = filterActiveRecords(fuelRes.data || [])
      const expenses = parseExpenseRecords(filterActiveRecords(expRes.data || []))
      const fuelPurchases = filterActiveRecords(purRes.data || [])

      let totalSales = 0
      const salesByDate = {}

      // Fuel Sales
      let totalFuelSales = 0;
      fuel.forEach(f => {
        const amt = Number(Number(f.sales_amount) > 0 ? f.sales_amount : Number(f.sold || 0) * Number(f.rate_per_liter || 0))
        totalSales += amt
        totalFuelSales += amt
        salesByDate[f.date] = (salesByDate[f.date] || 0) + amt
      })

      // General Sales & Advances
      let generalSales = 0;
      let cashAdvances = 0;
      let duesPaid = 0;
      let cashPurchases = 0;

      transactions.forEach(t => {
        const amt = Number(t.amount || 0)
        if (t.tx_type === 'sale') {
          totalSales += amt
          generalSales += amt
          salesByDate[t.date] = (salesByDate[t.date] || 0) + amt
        } else if (t.tx_type === 'cash_advance') {
          totalSales += amt
          cashAdvances += amt
          salesByDate[t.date] = (salesByDate[t.date] || 0) + amt
        } else if (t.tx_type === 'due_payment') {
          duesPaid += amt
        } else if (t.tx_type === 'purchase') {
          cashPurchases += amt
        }
      })

      const allDates = Object.keys(salesByDate).sort()
      setSalesTrend(allDates.map(date => ({
        date: formatDateDisplay(date),
        sales: salesByDate[date] || 0,
      })))

      const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
      const salaryExpenses = expenses.filter(e => (e.category || '').toLowerCase().includes('salar') || (e.name || '').toLowerCase().includes('salar')).reduce((s, e) => s + Number(e.amount || 0), 0)
      const otherExpenses = totalExpenses - salaryExpenses

      const totalPurchases = fuelPurchases.reduce((s, p) => s + Number(p.total_cost || 0), 0)
      let supplierPayments = cashPurchases;
      let supplierDues = 0;
      fuelPurchases.forEach(p => {
        const payment = getPurchasePayment(p)
        supplierPayments += payment.amountPaid
        supplierDues += payment.remainingBalance
      })

      const previousNetBalance = getPreviousNetBalance(activeCompany, companies, isAllCompanies)
      const netBalance = previousNetBalance + totalSales - totalExpenses - supplierPayments - duesPaid

      setReportData({
        totalSales,
        totalFuelSales,
        generalSales,
        cashAdvances,
        totalExpenses,
        salaryExpenses,
        otherExpenses,
        totalPurchases,
        supplierPayments,
        supplierDues,
        duesPaid,
        previousNetBalance,
        netBalance
      })

    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!activeCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <BuildingStorefrontIcon className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-600">No Company Selected</h2>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto mt-4 px-4">
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Dashboard</h1>
            <button
              type="button"
              onClick={() => fetchDashboardData()}
              className="p-1 mt-2 text-slate-400 hover:text-indigo-600 rounded-lg transition"
            >
              <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-sm text-slate-500">Business overview and sales trends</p>
        </div>

        <div className="relative">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="block w-40 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm bg-blue-50/50"
          >
            <option value="thisWeek">This Week</option>
            <option value="lastMonth">Last Month</option>
            <option value="thisMonth">This Month</option>
            <option value="thisQuarter">This Quarter</option>
            <option value="halfYear">Half Year</option>
            <option value="thisYear">This year</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="w-full h-96 flex items-center justify-center bg-gray-50 rounded-xl">
           <span className="text-gray-400">Loading Dashboard...</span>
        </div>
      ) : reportData ? (
        <>
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
            </div>
          </div>

          {/* Key Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Combined Sales */}
            <div className="stat-card border-l-4 border-l-emerald-500 p-4 bg-white shadow-sm rounded-xl">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Sales (کُل آمدنی)
              </p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1 tabular-nums">
                {formatCurrency(reportData.totalSales)}
              </p>
              <div className="text-xs text-slate-400 mt-2 border-t border-slate-100 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Fuel Sales:</span>
                  <span className="font-medium text-slate-600">{formatCurrency(reportData.totalFuelSales, false)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Counter / Other:</span>
                  <span className="font-medium text-slate-600">{formatCurrency(reportData.generalSales, false)}</span>
                </div>
              </div>
            </div>

            {/* Total Expenses */}
            <div className="stat-card border-l-4 border-l-rose-500 p-4 bg-white shadow-sm rounded-xl">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Expenses (اخراجات)
              </p>
              <p className="text-xl sm:text-2xl font-bold text-rose-600 mt-1 tabular-nums">
                {formatCurrency(reportData.totalExpenses)}
              </p>
              <div className="text-xs text-slate-400 mt-2 border-t border-slate-100 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Salaries:</span>
                  <span className="font-medium text-slate-600">{formatCurrency(reportData.salaryExpenses, false)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bills & Misc:</span>
                  <span className="font-medium text-slate-600">{formatCurrency(reportData.otherExpenses, false)}</span>
                </div>
              </div>
            </div>

            {/* Payments to Suppliers */}
            <div className="stat-card border-l-4 border-l-amber-500 p-4 bg-white shadow-sm rounded-xl">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Supplier Payments
              </p>
              <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1 tabular-nums">
                {formatCurrency(reportData.supplierPayments)}
              </p>
              <div className="text-xs text-slate-400 mt-2 border-t border-slate-100 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Total Purchases:</span>
                  <span className="font-medium text-slate-600">{formatCurrency(reportData.totalPurchases, false)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Dues Owed:</span>
                  <span className="font-bold text-amber-600">{formatCurrency(reportData.supplierDues, false)}</span>
                </div>
              </div>
            </div>

            {/* Customer Dues Settled */}
            <div className="stat-card border-l-4 border-l-blue-500 p-4 bg-white shadow-sm rounded-xl">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Customer Dues Cleared
              </p>
              <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1 tabular-nums">
                {formatCurrency(reportData.duesPaid)}
              </p>
              <p className="text-xs text-slate-400 mt-2 border-t border-slate-100 pt-2">
                Customer debt repayments
              </p>
            </div>
          </div>

          {/* Single Sales Trend Chart */}
          <div className="h-[400px] mt-8 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Total Sales Trend</h3>
            {salesTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={true}
                    tickLine={false}
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                  />
                  <Tooltip
                    formatter={(value) => `Rs ${value.toLocaleString()}`}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorSales)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-slate-400 border rounded-xl border-dashed">
                No sales data for this period
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
