import { useState, useEffect } from 'react'
import { getRecycledRecords, permanentlyDeleteRecord, restoreRecord, emptyRecycleBin } from '@/utils/deletedRecordsManager'
import { useCompany } from '@/contexts/CompanyContext'
import { formatDateDisplay } from '@/utils/dateUtils'
import { formatCurrency } from '@/utils/formatters'
import DataTable from '@/components/ui/DataTable'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { TrashIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function RecycleBinPage() {
  const { activeCompany, companies, isAllCompanies } = useCompany()
  const [records, setRecords] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [isConfirmingEmpty, setIsConfirmingEmpty] = useState(false)
  const [filterPeriod, setFilterPeriod] = useState('thisMonth')
  const [filterFirm, setFilterFirm] = useState('all')

  const fetchRecords = () => {
    let recs = getRecycledRecords()
    if (!isAllCompanies && activeCompany?.id) {
      recs = recs.filter(r => r.company_id === activeCompany.id)
    }
    
    // Add sorting by deleted_at
    recs.sort((a, b) => new Date(b._deleted_at) - new Date(a._deleted_at))
    setRecords(recs)
  }

  useEffect(() => {
    fetchRecords()
    window.addEventListener('dailykhata_data_changed', fetchRecords)
    return () => window.removeEventListener('dailykhata_data_changed', fetchRecords)
  }, [activeCompany, isAllCompanies])

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(records.map(r => r.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (id) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedIds(newSet)
  }

  const handleRestoreSelected = async () => {
    if (selectedIds.size === 0) return;
    const toastId = toast.loading('Restoring records...');
    try {
      for (const id of selectedIds) {
        await restoreRecord(id)
      }
      toast.success('Records restored successfully', { id: toastId });
      setSelectedIds(new Set())
    } catch (e) {
      toast.error('Failed to restore records', { id: toastId });
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm('Are you sure you want to permanently delete selected records?')) return;
    
    const toastId = toast.loading('Deleting records permanently...');
    try {
      for (const id of selectedIds) {
        const rec = records.find(r => r.id === id)
        if (rec) {
          await permanentlyDeleteRecord(id, rec._table)
        }
      }
      toast.success('Records permanently deleted', { id: toastId });
      setSelectedIds(new Set())
    } catch (e) {
      toast.error('Failed to delete records', { id: toastId });
    }
  }

  const handleEmptyTrash = async () => {
    const toastId = toast.loading('Emptying recycle bin...');
    try {
      await emptyRecycleBin()
      setIsConfirmingEmpty(false)
      setSelectedIds(new Set())
      toast.success('Recycle bin emptied', { id: toastId });
    } catch (e) {
      toast.error('Failed to empty recycle bin', { id: toastId });
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
    { 
      label: 'DATE', 
      key: 'date',
      render: (_, r) => formatDateDisplay(r.date || r.created_at)
    },
    { label: 'REF. NO.', key: 'ref_no', render: (_, r) => r.ref_no || '--' },
    { label: 'PARTY NAME', key: 'name', render: (_, r) => r.name || r.customer_code || 'Unknown' },
    { label: 'TXN TYPE', key: 'tx_type', render: (_, r) => {
      let type = r.tx_type || r._table || 'Record'
      return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')
    }},
    { label: 'PAYMENT TYPE', key: 'payment_type', render: (_, r) => r.payment_method || r.payment_type || 'Cash' },
    { 
      label: 'AMOUNT', 
      key: 'amount',
      render: (_, r) => formatCurrency(r.amount || r.total_cost || r.sales_amount || 0),
      align: 'right'
    },
    { 
      label: 'DELETED ON', 
      key: 'deleted_on',
      render: (_, r) => formatDateDisplay(r._deleted_at, true) 
    }
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-header text-gray-700">Recycle Bin</h1>
        <button
          onClick={() => setIsConfirmingEmpty(true)}
          disabled={records.length === 0}
          className="btn-secondary flex items-center gap-2 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <TrashIcon className="h-4 w-4" />
          Empty Trash
        </button>
      </div>

      <div className="card bg-white p-4">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <select 
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="input-field py-1 text-sm w-32"
          >
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="thisQuarter">This Quarter</option>
            <option value="thisYear">This Year</option>
            <option value="custom">Custom</option>
          </select>

          {filterPeriod === 'custom' && (
            <div className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1 text-sm">
              <span className="text-gray-500 font-medium">Between</span>
              <input type="date" className="bg-transparent border-none text-sm outline-none" />
              <span className="text-gray-500">To</span>
              <input type="date" className="bg-transparent border-none text-sm outline-none" />
            </div>
          )}

          <select 
            value={filterFirm}
            onChange={(e) => setFilterFirm(e.target.value)}
            className="input-field py-1 text-sm w-36 uppercase text-gray-600"
          >
            <option value="all">All Firms</option>
            {companies?.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <DataTable
          columns={columns}
          data={records}
          keyField="id"
          emptyMessage="Recycle bin is empty"
        />

        <div className="mt-4 flex justify-end gap-3 border-t pt-4">
          <button
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0}
            className="btn-secondary px-6 py-2 disabled:opacity-50"
          >
            Delete Permanently
          </button>
          <button
            onClick={handleRestoreSelected}
            disabled={selectedIds.size === 0}
            className="bg-indigo-400 text-white hover:bg-indigo-500 rounded-md px-8 py-2 font-medium disabled:opacity-50 shadow-sm transition"
          >
            Restore
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isConfirmingEmpty}
        title="Empty Recycle Bin"
        message="Are you sure you want to permanently delete all items in the recycle bin? This action cannot be undone."
        onConfirm={handleEmptyTrash}
        onCancel={() => setIsConfirmingEmpty(false)}
        confirmText="Empty Trash"
        type="danger"
      />
    </div>
  )
}
