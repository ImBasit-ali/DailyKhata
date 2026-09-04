import { supabase } from '@/lib/supabaseClient';

/**
 * Retrieves the configured Previous Net Balance (Opening Cash / Net Balance)
 * for a specific company or summed across all companies.
 */
export function getPreviousNetBalance(activeCompany, companies = [], isAllCompanies = false) {
  if (isAllCompanies && Array.isArray(companies)) {
    return companies.reduce((sum, c) => {
      const dbVal = Number(c?.opening_balance);
      const localVal = parseFloat(localStorage.getItem(`dailykhata_company_opening_balance_${c.id}`) || '0');
      const val = !isNaN(dbVal) && dbVal !== 0 ? dbVal : (!isNaN(localVal) ? localVal : 0);
      return sum + val;
    }, 0);
  }

  if (!activeCompany) return 0;
  const dbVal = Number(activeCompany?.opening_balance);
  const localVal = parseFloat(localStorage.getItem(`dailykhata_company_opening_balance_${activeCompany.id}`) || '0');
  return !isNaN(dbVal) && dbVal !== 0 ? dbVal : (!isNaN(localVal) ? localVal : 0);
}

/**
 * Persists Previous Net Balance to both localStorage and Supabase (if column exists).
 */
export async function savePreviousNetBalance(companyId, amount) {
  const num = parseFloat(amount || 0);
  if (!companyId) return;

  // 1. Always persist to localStorage for instant, guaranteed availability
  localStorage.setItem(`dailykhata_company_opening_balance_${companyId}`, String(num));
  window.dispatchEvent(new CustomEvent('dailykhata_data_changed'));

  // 2. Try persisting to Supabase companies table if column exists
  try {
    await supabase
      .from('companies')
      .update({ opening_balance: num })
      .eq('id', companyId);
  } catch (err) {
    // Graceful fallback if column has not been migrated yet
    console.warn('Could not persist opening_balance to companies table, using local storage cache.');
  }
}

/**
 * Retrieves the purchase payment details (Amount Paid vs Remaining Balance Owed)
 */
export function getPurchasePayment(purchase) {
  const totalCost = Number(purchase.total_cost || 0);
  
  // Check if explicitly recorded in DB
  if (purchase.amount_paid !== undefined && purchase.amount_paid !== null) {
    const paid = Number(purchase.amount_paid || 0);
    const rem = purchase.remaining_balance !== undefined && purchase.remaining_balance !== null
      ? Number(purchase.remaining_balance)
      : Math.max(0, totalCost - paid);
    return { totalCost, amountPaid: paid, remainingBalance: rem };
  }

  // Check localStorage cache
  const cachedPaid = localStorage.getItem(`dailykhata_purchase_paid_${purchase.id}`);
  if (cachedPaid !== null) {
    const paid = parseFloat(cachedPaid || '0');
    const rem = Math.max(0, totalCost - paid);
    return { totalCost, amountPaid: paid, remainingBalance: rem };
  }

  // Default: Full cash expense (paid in full upon delivery)
  return { totalCost, amountPaid: totalCost, remainingBalance: 0 };
}

/**
 * Saves purchase payment details to localStorage and tries Supabase
 */
export async function savePurchasePayment(purchaseId, amountPaid, remainingBalance) {
  const paid = parseFloat(amountPaid || 0);
  const remaining = parseFloat(remainingBalance || 0);

  if (!purchaseId) return;

  localStorage.setItem(`dailykhata_purchase_paid_${purchaseId}`, String(paid));
  localStorage.setItem(`dailykhata_purchase_remaining_${purchaseId}`, String(remaining));
  window.dispatchEvent(new CustomEvent('dailykhata_data_changed'));

  try {
    await supabase
      .from('fuel_purchases')
      .update({
        amount_paid: paid,
        remaining_balance: remaining,
      })
      .eq('id', purchaseId);
  } catch (err) {
    // Ignore if column doesn't exist
  }
}
