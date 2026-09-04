import { supabase } from '@/lib/supabaseClient';

const TRASH_STORAGE_KEY = 'dailykhata_trash_records';

/**
 * Get all items in the Trash / Recycle Bin.
 * Can filter by company_id or return all if isAllCompanies is true.
 */
export function getTrashItems(companyId = null, isAllCompanies = true) {
  try {
    const raw = localStorage.getItem(TRASH_STORAGE_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];

    if (isAllCompanies || !companyId) {
      return items;
    }
    return items.filter((it) => it.company_id === companyId);
  } catch (err) {
    console.error('Error reading trash items:', err);
    return [];
  }
}

/**
 * Move an item to trash.
 * @param {Object} itemData
 *   - table: string ('expenses', 'cash_transactions', 'customers', 'ledger_entries', 'fuel_inventory', 'fuel_purchases')
 *   - itemType: string ('Expense', 'Sale', 'Customer', 'Ledger Entry', 'Fuel Reading', 'Fuel Arrival')
 *   - title: string
 *   - details: string
 *   - amount: number
 *   - company_id: string
 *   - originalData: Object (full database row)
 */
export function moveToTrash(itemData) {
  try {
    const current = getTrashItems(null, true);
    const newEntry = {
      trashId: 'trash_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      deletedAt: new Date().toISOString(),
      table: itemData.table,
      itemType: itemData.itemType || 'Record',
      title: itemData.title || 'Untitled',
      details: itemData.details || '',
      amount: Number(itemData.amount || 0),
      company_id: itemData.company_id,
      originalData: itemData.originalData,
    };

    const updated = [newEntry, ...current];
    localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('dailykhata_trash_updated'));
    return newEntry;
  } catch (err) {
    console.error('Error moving item to trash:', err);
  }
}

/**
 * Restore a single item from trash back to its original database table.
 */
export async function restoreItem(trashId) {
  const current = getTrashItems(null, true);
  const target = current.find((it) => it.trashId === trashId);
  if (!target) throw new Error('Trash item not found');

  // Insert back into original table
  if (target.table && target.originalData) {
    const { error } = await supabase.from(target.table).insert([target.originalData]);
    if (error) {
      console.error(`Error restoring to ${target.table}:`, error);
      throw error;
    }
  }

  // Remove from trash
  const remaining = current.filter((it) => it.trashId !== trashId);
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(remaining));

  window.dispatchEvent(new CustomEvent('dailykhata_trash_updated'));
  window.dispatchEvent(new CustomEvent('dailykhata_data_changed', { detail: { table: target.table } }));
  return target;
}

/**
 * Restore multiple items from trash.
 */
export async function restoreMultipleItems(trashIds) {
  if (!trashIds || trashIds.length === 0) return 0;
  const current = getTrashItems(null, true);
  const targets = current.filter((it) => trashIds.includes(it.trashId));

  let restoredCount = 0;
  for (const target of targets) {
    if (target.table && target.originalData) {
      const { error } = await supabase.from(target.table).insert([target.originalData]);
      if (!error) {
        restoredCount++;
      } else {
        console.error(`Failed to restore ${target.title}:`, error);
      }
    }
  }

  const remaining = current.filter((it) => !trashIds.includes(it.trashId));
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(remaining));

  window.dispatchEvent(new CustomEvent('dailykhata_trash_updated'));
  window.dispatchEvent(new CustomEvent('dailykhata_data_changed'));
  return restoredCount;
}

/**
 * Permanently delete a single item from trash.
 */
export function permanentlyDeleteItem(trashId) {
  const current = getTrashItems(null, true);
  const remaining = current.filter((it) => it.trashId !== trashId);
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new CustomEvent('dailykhata_trash_updated'));
}

/**
 * Permanently delete multiple selected items from trash.
 */
export function permanentlyDeleteMultipleItems(trashIds) {
  if (!trashIds || trashIds.length === 0) return;
  const current = getTrashItems(null, true);
  const remaining = current.filter((it) => !trashIds.includes(it.trashId));
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new CustomEvent('dailykhata_trash_updated'));
}

/**
 * Empty all items from trash (optionally scoped to company).
 */
export function emptyTrash(companyId = null) {
  if (!companyId) {
    localStorage.removeItem(TRASH_STORAGE_KEY);
  } else {
    const current = getTrashItems(null, true);
    const remaining = current.filter((it) => it.company_id !== companyId);
    localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(remaining));
  }
  window.dispatchEvent(new CustomEvent('dailykhata_trash_updated'));
}
