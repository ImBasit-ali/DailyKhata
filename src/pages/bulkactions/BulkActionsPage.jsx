import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useCompany } from '@/contexts/CompanyContext'
import { formatDateDisplay, getDateRange } from '@/utils/dateUtils'
import { formatCurrency } from '@/utils/formatters'
import { filterActiveRecords, deleteRecordEntirely } from '@/utils/deletedRecordsManager'
import DataTable from '@/components/ui/DataTable'
import { PrinterIcon, ShareIcon, TrashIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function BulkActionsPage() {
  const { activeCompany, companies, isAllCompanies } = useCompany()
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterMode, setFilterMode] = useState('all') // mapped to firm for now, or just dummy
  const [searchQuery, setSearchQuery] = useState('')

  const fetchRecords = async () => {
    setLoading(true)
    
    try {
      let cashQ = supabase.from('cash_transactions').select('*')
      let expQ = supabase.from('expenses').select('*')
      let purQ = supabase.from('fuel_purchases').select('*')

      if (startDate) {
         cashQ = cashQ.gte('date', startDate)
         expQ = expQ.gte('date', startDate)
         purQ = purQ.gte('date', startDate)
      }
      if (endDate) {
         cashQ = cashQ.lte('date', endDate)
         expQ = expQ.lte('date', endDate)
         purQ = purQ.lte('date', endDate)
      }

      if (!isAllCompanies && activeCompany?.id) {
        cashQ = cashQ.eq('company_id', activeCompany.id)
        expQ = expQ.eq('company_id', activeCompany.id)
        purQ = purQ.eq('company_id', activeCompany.id)
      }

      const [cashRes, expRes, purRes] = await Promise.all([cashQ, expQ, purQ])

      const cashList = filterActiveRecords(cashRes.data || []).map(r => ({...r, _table: 'cash_transactions'}))
      const expList = filterActiveRecords(expRes.data || []).map(r => ({...r, _table: 'expenses', tx_type: 'expense', name: r.category || r.name}))
      const purList = filterActiveRecords(purRes.data || []).map(r => ({...r, _table: 'fuel_purchases', tx_type: 'fuel_purchase', name: r.supplier_name, amount: r.total_cost}))

      let allRecords = [...cashList, ...expList, ...purList]

      if (filterType !== 'all') {
        allRecords = allRecords.filter(r => r.tx_type === filterType)
      }

      allRecords.sort((a, b) => new Date(b.date) - new Date(a.date))
      
      if (searchQuery) {
        const lowerQ = searchQuery.toLowerCase()
        allRecords = allRecords.filter(r => 
          (r.name && r.name.toLowerCase().includes(lowerQ)) ||
          (r.ref_no && r.ref_no.toLowerCase().includes(lowerQ)) ||
          (r.tx_type && r.tx_type.toLowerCase().includes(lowerQ))
        )
      }
      
      setRecords(allRecords)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [activeCompany, isAllCompanies, startDate, endDate, filterType, filterMode])
  
  useEffect(() => {
    const delay = setTimeout(() => fetchRecords(), 500)
    return () => clearTimeout(delay)
  }, [searchQuery])

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedIds(new Set(records.map(r => r.id)))
    else setSelectedIds(new Set())
  }

  const handleSelectOne = (id) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedIds(newSet)
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm('Are you sure you want to delete selected records?')) return;
    
    const toastId = toast.loading('Deleting records...');
    try {
      for (const id of selectedIds) {
        const rec = records.find(r => r.id === id)
        if (rec) await deleteRecordEntirely(rec.id, rec._table)
      }
      toast.success('Records deleted successfully', { id: toastId });
      setSelectedIds(new Set())
      fetchRecords()
    } catch (e) {
      console.error(e)
      toast.error('Failed to delete records', { id: toastId });
    }
  }

  const handlePrintSelected = () => {
    if (records.length === 0) {
      toast.error('No transactions available to print');
      return;
    }
    const printWindow = window.open('', '', 'width=900,height=750');
    if (!printWindow) {
      alert('Please allow popups to print');
      return;
    }
    const compName = activeCompany?.name || 'DailyKhata Business Services';
    const selectedRecords = selectedIds.size > 0 
      ? records.filter(r => selectedIds.has(r.id))
      : records;

    printWindow.document.write(`
      <html>
        <head>
          <title>Bulk Actions Print - ${compName}</title>
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
            <h3>Selected Transactions</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Ref No.</th>
                <th>Name</th>
                <th>Type</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${selectedRecords.map(r => `
                <tr>
                  <td>${formatDateDisplay(r.date)}</td>
                  <td>${r.ref_no || '--'}</td>
                  <td>${r.name || 'Unknown'}</td>
                  <td>${r.tx_type || 'Unknown'}</td>
                  <td class="right">${formatCurrency(r.amount || 0)}</td>
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
  }

  const handleAction = (actionName) => {
    if (records.length === 0) {
      toast.error(`No transactions available for ${actionName}`);
    } else {
      toast.success(`${actionName} feature coming soon!`);
    }
  }

  const columns = [
    {
      label: (
        <input 
          type="checkbox" 
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          checked={records.length > 0 && selectedIds.size === records.length}
          onChange={handleSelectAll}
        />
      ),
      key: 'checkbox',
      render: (_, row) => (
        <input 
          type="checkbox"
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          checked={selectedIds.has(row.id)}
          onChange={() => handleSelectOne(row.id)}
        />
      ),
      className: 'w-10 text-center'
    },
    { label: 'DATE', key: 'date', render: (_, r) => formatDateDisplay(r.date) },
    { label: 'REF. NO', key: 'ref_no', render: (_, r) => r.ref_no || '--' },
    { label: 'NAME', key: 'name', render: (_, r) => r.name || 'Unknown' },
    { label: 'TYPE', key: 'tx_type', render: (_, r) => {
      let type = r.tx_type || 'Unknown'
      if (type === 'sale') return 'Sale'
      if (type === 'purchase') return 'Purchase (Cash)'
      if (type === 'expense') return 'Expense'
      if (type === 'fuel_purchase') return 'Fuel Purchase'
      if (type === 'due_payment') return 'Due Payment'
      if (type === 'cash_advance') return 'Cash Advance'
      return type
    }},
    { label: 'TOTAL', key: 'amount', render: (_, r) => formatCurrency(r.amount || 0), align: 'right' },
    { label: 'RECEIVED/PAID', key: 'received', render: () => formatCurrency(0), align: 'right', className: 'text-gray-400' }, 
    { label: 'BALANCE', key: 'balance', render: (_, r) => formatCurrency(r.amount || 0), align: 'right', className: 'text-gray-400' },
    {
      label: '',
      key: 'actions',
      render: () => <button className="text-gray-400 hover:text-gray-600">⋮</button>,
      className: 'w-10 text-center'
    }
  ]

  return (
    <div className="space-y-4">
      <h1 className="page-header text-gray-700">Bulk Actions</h1>

      {/* Modern Filter Card matching screenshot */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
        {/* Top Row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-gray-500 font-semibold text-xs tracking-wider uppercase">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              FILTER:
            </div>
            
            <select 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 min-w-[140px] focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              <option value="all">All Types</option>
              <option value="sale">Sales</option>
              <option value="purchase">Purchases (Cash)</option>
              <option value="expense">Expenses</option>
              <option value="fuel_purchase">Fuel Purchases</option>
              <option value="due_payment">Due Payments</option>
              <option value="cash_advance">Cash Advances</option>
            </select>
            
            <select 
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 min-w-[200px] focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              <option value="all">All Modes (Cash & Credit)</option>
              <option value="cash">Cash Only</option>
              <option value="credit">Credit Only</option>
            </select>
          </div>
          
          <div className="flex items-center gap-3 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 hover:text-gray-600 cursor-pointer">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <svg onClick={() => handleAction('Graph')} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 hover:text-gray-600 cursor-pointer">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <button onClick={() => handleAction('Excel')} className="bg-[#107c41] text-white rounded px-2 py-0.5 text-xs font-bold shadow-sm hover:bg-green-700">XLS</button>
            <PrinterIcon className="w-5 h-5 hover:text-gray-600 cursor-pointer" onClick={handlePrintSelected} />
          </div>
        </div>
        
        {/* Bottom Row */}
        <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
          <span className="text-gray-500 text-sm font-medium">Date Range:</span>
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-indigo-500" 
            />
            <span className="text-gray-400 text-sm">to</span>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-indigo-500" 
            />
          </div>
        </div>
      </div>

      <div className="card bg-white border border-gray-200">
        <div className="p-4 border-b flex items-center justify-between bg-white">
          <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">TRANSACTIONS</h3>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-500">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
            </span>
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 min-w-[250px]"
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          data={records}
          keyField="id"
          loading={loading}
          className="border-0 shadow-none rounded-none"
        />

        <div className="p-4 border-t flex justify-end gap-3 bg-gray-50/50">
          <button
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0}
            className="btn-danger rounded-lg px-6 py-1.5 flex items-center gap-2 disabled:opacity-50 text-sm"
          >
            <TrashIcon className="h-4 w-4" /> Delete Selected
          </button>
        </div>
      </div>
    </div>
  )
}
