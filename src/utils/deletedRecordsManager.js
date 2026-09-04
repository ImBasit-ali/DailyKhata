import { supabase } from '@/lib/supabaseClient';

const DELETED_IDS_KEY = 'vyapar_permanently_deleted_ids';
const RECYCLE_BIN_KEY = 'vyapar_recycle_bin_records';

const INITIAL_EXCLUDED_IDS = [
  'a4fbf49d-5959-4607-9eb1-8ac4b297a36e',
];

export function getDeletedRecordIds() {
  try {
    const raw = localStorage.getItem(DELETED_IDS_KEY);
    const customDeleted = raw ? JSON.parse(raw) : [];
    return new Set([...INITIAL_EXCLUDED_IDS, ...customDeleted]);
  } catch (err) {
    return new Set(INITIAL_EXCLUDED_IDS);
  }
}

export function isRecordDeleted(id) {
  if (!id) return false;
  const deletedSet = getDeletedRecordIds();
  return deletedSet.has(id);
}

export function getRecycledRecords() {
  try {
    const raw = localStorage.getItem(RECYCLE_BIN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Renamed from deleteRecordEntirely to override its behavior
export async function deleteRecordEntirely(id, table) {
  if (!id) return;
  let record = null;
  if (table) {
    try {
      const { data } = await supabase.from(table).select('*').eq('id', id).single();
      record = data;
    } catch (e) {
      console.warn('Could not fetch record for recycle bin', e);
    }
  }

  try {
    const rawIds = localStorage.getItem(DELETED_IDS_KEY);
    const list = rawIds ? JSON.parse(rawIds) : [];
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(list));
    }

    if (record) {
      const rawBin = localStorage.getItem(RECYCLE_BIN_KEY);
      const bin = rawBin ? JSON.parse(rawBin) : [];
      if (!bin.find(r => r.id === id)) {
        bin.push({
          ...record,
          _table: table,
          _deleted_at: new Date().toISOString()
        });
        localStorage.setItem(RECYCLE_BIN_KEY, JSON.stringify(bin));
      }
    }
  } catch (e) {
    console.error('Error saving deleted record:', e);
  }

  window.dispatchEvent(new CustomEvent('vyapar_data_changed'));
}

export async function restoreRecord(id) {
  try {
    const rawIds = localStorage.getItem(DELETED_IDS_KEY);
    let list = rawIds ? JSON.parse(rawIds) : [];
    list = list.filter(i => i !== id);
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(list));

    const rawBin = localStorage.getItem(RECYCLE_BIN_KEY);
    let bin = rawBin ? JSON.parse(rawBin) : [];
    bin = bin.filter(r => r.id !== id);
    localStorage.setItem(RECYCLE_BIN_KEY, JSON.stringify(bin));
  } catch (e) {
    console.error('Error restoring record:', e);
  }
  window.dispatchEvent(new CustomEvent('vyapar_data_changed'));
}

export async function permanentlyDeleteRecord(id, table) {
  if (!id) return;

  try {
    const rawIds = localStorage.getItem(DELETED_IDS_KEY);
    let list = rawIds ? JSON.parse(rawIds) : [];
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(list));
    }
    
    const rawBin = localStorage.getItem(RECYCLE_BIN_KEY);
    let bin = rawBin ? JSON.parse(rawBin) : [];
    bin = bin.filter(r => r.id !== id);
    localStorage.setItem(RECYCLE_BIN_KEY, JSON.stringify(bin));
  } catch (e) {
    console.error('Error removing from recycle bin:', e);
  }

  if (table) {
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) {
        console.warn(`Database delete on ${table} for ${id}:`, error.message);
      }
    } catch (err) {
      console.warn(`Error executing delete on ${table}:`, err);
    }
  }
  window.dispatchEvent(new CustomEvent('vyapar_data_changed'));
}

export async function emptyRecycleBin() {
  const records = getRecycledRecords();
  for (const record of records) {
    await permanentlyDeleteRecord(record.id, record._table);
  }
}

export function filterActiveRecords(records) {
  if (!Array.isArray(records)) return [];
  const deletedSet = getDeletedRecordIds();
  return records.filter((r) => r && !deletedSet.has(r.id));
}

export async function clearAllDatabaseRecords(companyId = null) {
  const tables = [
    'cash_transactions',
    'expenses',
    'fuel_inventory',
    'fuel_purchases',
    'ledger_entries',
  ];

  for (const table of tables) {
    try {
      let q = supabase.from(table).delete();
      if (companyId) {
        q = q.eq('company_id', companyId);
      } else {
        q = q.neq('id', '00000000-0000-0000-0000-000000000000');
      }
      await q;
    } catch (err) {
      console.warn(`Clear table ${table}:`, err);
    }
  }

  window.dispatchEvent(new CustomEvent('vyapar_data_changed'));
}
