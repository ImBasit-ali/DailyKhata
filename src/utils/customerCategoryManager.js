const STORAGE_KEY = 'dailykhata_customer_categories';

/**
 * Get all stored customer categories
 */
export function getAllCustomerCategories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Error loading customer categories:', e);
    return {};
  }
}

/**
 * Save customer category by ID and code
 */
export function saveCustomerCategory(customerId, code, category) {
  if (!category) return;
  try {
    const categories = getAllCustomerCategories();
    if (customerId) categories[customerId] = category;
    if (code) categories[code.toUpperCase()] = category;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  } catch (e) {
    console.error('Error saving customer category:', e);
  }
}

/**
 * Retrieve category for a given customer object
 */
export function getCustomerCategory(customer) {
  if (!customer) return 'Regular';
  const categories = getAllCustomerCategories();
  if (customer.id && categories[customer.id]) {
    return categories[customer.id];
  }
  if (customer.code && categories[customer.code.toUpperCase()]) {
    return categories[customer.code.toUpperCase()];
  }
  return customer.category || 'Regular';
}
