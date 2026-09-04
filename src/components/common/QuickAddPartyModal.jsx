import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Modal from '@/components/ui/Modal';
import { saveCustomerCategory } from '@/utils/customerCategoryManager';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'Regular',
  'Commercial / Wholesale',
  'Supplier',
  'Staff / Employee',
  'VIP / Govt',
  'Other',
];

export default function QuickAddPartyModal({
  isOpen,
  onClose,
  defaultCompanyId,
  companies = [],
  isAllCompanies = false,
  onPartyCreated,
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Regular');
  const [companyId, setCompanyId] = useState(defaultCompanyId || (companies[0]?.id || ''));
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName('');
    setCategory('Regular');
    setSaving(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Party name is required');
      return;
    }

    const targetCompId = companyId || defaultCompanyId || companies[0]?.id;
    if (!targetCompId) {
      toast.error('Company is required');
      return;
    }

    setSaving(true);
    try {
      const words = name.trim().split(/\s+/).filter(Boolean);
      let baseCode = words.map((w) => w[0]).join('').toUpperCase().slice(0, 3) || 'P';
      const autoCode = `${baseCode}${Math.floor(100 + Math.random() * 900)}`;

      const payload = {
        company_id: targetCompId,
        name: name.trim(),
        code: autoCode,
        category,
      };

      let { data, error } = await supabase
        .from('customers')
        .insert([payload])
        .select();

      if (error && (error.message?.includes('category') || error.code === '42703')) {
        delete payload.category;
        const retry = await supabase.from('customers').insert([payload]).select();
        error = retry.error;
        data = retry.data;
      }

      if (error) throw error;

      const createdParty = data?.[0] || {
        ...payload,
        id: `temp-${Date.now()}`,
      };

      // Persist category
      saveCustomerCategory(createdParty.id, createdParty.code, category);

      toast.success(`Party "${name}" added successfully`);
      if (onPartyCreated) {
        onPartyCreated({ ...createdParty, category });
      }
      handleClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to add party.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New Party (نیا کھاتہ / پارٹی)">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {isAllCompanies && companies.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Company (کمپنی منتخب کریں)
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full border-slate-300 rounded-lg p-2 border text-xs font-semibold"
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
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Party / Customer Name (پارٹی کا مکمل نام)
          </label>
          <input
            type="text"
            required
            autoFocus
            placeholder="e.g. Parvez Khan / Al-Rehman Traders"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-slate-300 rounded-lg p-2.5 border text-xs font-medium focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Party Category (زمرہ / قسم)
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border-slate-300 rounded-lg p-2.5 border text-xs font-medium focus:ring-indigo-500 focus:border-indigo-500"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-sm"
          >
            {saving ? 'Saving...' : '+ Add Party'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
