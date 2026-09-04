const STORAGE_KEY = 'vyapar_expense_categories';

/**
 * Get all stored expense categories from localStorage
 */
export function getAllExpenseCategories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Error loading expense categories:', e);
    return {};
  }
}

/**
 * Save expense category by expense ID
 */
export function saveExpenseCategory(expenseId, category) {
  if (!expenseId || !category) return;
  try {
    const categories = getAllExpenseCategories();
    categories[expenseId] = category;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  } catch (e) {
    console.error('Error saving expense category:', e);
  }
}

/**
 * Get stored category for an expense ID
 */
export function getExpenseCategory(expenseId) {
  if (!expenseId) return null;
  const categories = getAllExpenseCategories();
  return categories[expenseId] || null;
}

/**
 * Format expense name with category prefix to store directly in DB
 */
export function formatExpenseNameWithCategory(category, description) {
  const cleanCat = (category || 'General & Misc').trim();
  const cleanDesc = (description || '').trim();
  
  // If description already has [Category] prefix, strip it first
  const strippedDesc = cleanDesc.replace(/^\[.*?\]\s*/, '').trim();
  return `[${cleanCat}] ${strippedDesc}`;
}

/**
 * Parse an expense record to extract category and clean display name
 */
export function parseExpenseRecord(record) {
  if (!record) return record;

  let category = record.category;
  let displayName = record.name || '';

  // Check if name has [Category] prefix
  const match = displayName.match(/^\[(.*?)\]\s*(.*)$/);
  if (match) {
    if (!category) {
      category = match[1];
    }
    displayName = match[2];
  }

  // Fallback to local storage if still no category
  if (!category && record.id) {
    const localCat = getExpenseCategory(record.id);
    if (localCat) {
      category = localCat;
    }
  }

  return {
    ...record,
    category: category || 'General & Misc',
    name: displayName,
    raw_name: record.name,
  };
}

/**
 * Parse an array of expense records
 */
export function parseExpenseRecords(records = []) {
  return records.map(parseExpenseRecord);
}
