/**
 * Format a number as PKR currency with thousand separators
 * Uses Pakistani/Indian numbering: 1,00,000
 * @param {number} amount
 * @param {boolean} showSymbol - Whether to prefix with "Rs"
 * @returns {string}
 */
export function formatCurrency(amount, showSymbol = true) {
  if (amount == null || isNaN(amount)) return showSymbol ? 'Rs 0.00' : '0.00'

  const num = Number(amount)
  const isNegative = num < 0
  const absNum = Math.abs(num)

  // Format with 2 decimal places
  const parts = absNum.toFixed(2).split('.')
  let integerPart = parts[0]
  const decimalPart = parts[1]

  // Pakistani/Indian numbering: first group of 3, then groups of 2
  if (integerPart.length > 3) {
    const lastThree = integerPart.slice(-3)
    const remaining = integerPart.slice(0, -3)
    // Add commas every 2 digits for the remaining part
    const formatted = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    integerPart = formatted + ',' + lastThree
  }

  const formattedNum = `${isNegative ? '-' : ''}${integerPart}.${decimalPart}`
  return showSymbol ? `Rs ${formattedNum}` : formattedNum
}

/**
 * Format a number with thousand separators (no currency symbol)
 * @param {number} num
 * @param {number} decimals
 * @returns {string}
 */
export function formatNumber(num, decimals = 2) {
  if (num == null || isNaN(num)) return '0'
  return Number(num).toLocaleString('en-PK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Parse a formatted number string back to a number
 * @param {string} str
 * @returns {number}
 */
export function parseFormattedNumber(str) {
  if (!str) return 0
  return Number(String(str).replace(/,/g, ''))
}
