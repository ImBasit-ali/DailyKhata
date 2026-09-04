import React, { useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import LoadingState from '@/components/ui/LoadingState';
import { formatDateDisplay } from '@/utils/dateUtils';
import { getCompanyCode } from '@/utils/companyUtils';
import toast from 'react-hot-toast';

export default function CompaniesPage() {
  const { companies, activeCompany, setActiveCompany, createCompany, addCompany, updateCompany, deleteCompany, loading } = useCompany();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [name, setName] = useState('');
  
  const [deleteId, setDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenModal = (company = null) => {
    setEditingCompany(company);
    setName(company ? company.name : '');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCompany(null);
    setName('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Company name is required');
      return;
    }
    
    try {
      if (editingCompany) {
        const { error } = await updateCompany(editingCompany.id, trimmedName);
        if (error) throw error;
      } else {
        const createFn = createCompany || addCompany;
        const { error } = await createFn(trimmedName);
        if (error) throw error;
      }
      handleCloseModal();
    } catch (err) {
      console.error('Company save error:', err);
      toast.error(err?.message || 'Operation failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const res = await deleteCompany(deleteId);
      if (res?.error) throw res.error;
      setDeleteId(null);
    } catch (err) {
      console.error('Delete company error:', err);
      toast.error(err?.message || 'Failed to delete company');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Companies</h1>
        <button
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-sm hover:bg-indigo-700 transition"
        >
          Add Company
        </button>
      </div>

      {companies.length === 0 ? (
        <EmptyState title="No companies found" message="Get started by creating your first company." />
      ) : (
        <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-slate-200">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-sm font-semibold text-slate-600">Name</th>
                <th className="px-6 py-3 text-sm font-semibold text-slate-600">Created Date</th>
                <th className="px-6 py-3 text-sm font-semibold text-slate-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {companies.map((company) => (
                <tr key={company.id} className={`hover:bg-slate-50 ${activeCompany?.id === company.id ? 'bg-indigo-50/50' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{company.name}</span>
                      <span className="font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs px-2 py-0.5 rounded font-bold" title="Firm Code">
                        {getCompanyCode(company.name)}
                      </span>
                      {activeCompany?.id === company.id && (
                        <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-medium">Active</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-sm">
                    {formatDateDisplay(company.created_at)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {activeCompany?.id !== company.id && (
                      <button
                        onClick={() => setActiveCompany(company)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-sm mr-4"
                      >
                        Set Active
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenModal(company)}
                      className="text-slate-500 hover:text-indigo-600 text-sm mr-4 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteId(company.id)}
                      className="text-slate-500 hover:text-rose-600 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingCompany ? 'Edit Company' : 'Add Company'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
              placeholder="e.g. Gill Bricks Company"
              autoFocus
            />
            {name.trim() && (
              <div className="mt-2.5 p-2.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-indigo-950">Firm Code (فرم کوڈ):</span>
                  <p className="text-[11px] text-indigo-600">Generated from 2nd & 3rd word (e.g. Gill Bricks Company → BC)</p>
                </div>
                <span className="font-mono font-black text-sm text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-300 shadow-sm">
                  {getCompanyCode(name)}
                </span>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={handleCloseModal} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">
              Cancel
            </button>
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-sm">
              {editingCompany ? 'Save Changes' : 'Add Company'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Company"
        message="Are you sure you want to delete this company? This action cannot be undone and will delete all associated data."
        isLoading={isDeleting}
      />
    </div>
  );
}
