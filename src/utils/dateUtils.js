import { format, parse, isValid, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns'

/**
 * Format a date to DD-MM-YYYY for display
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateDisplay(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (!isValid(d)) return ''
  return format(d, 'dd-MM-yyyy')
}

/**
 * Format a date to YYYY-MM-DD for storage/API
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateISO(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (!isValid(d)) return ''
  return format(d, 'yyyy-MM-dd')
}

/**
 * Parse a DD-MM-YYYY string to a Date object
 * @param {string} dateStr
 * @returns {Date|null}
 */
export function parseDateDisplay(dateStr) {
  if (!dateStr) return null
  const d = parse(dateStr, 'dd-MM-yyyy', new Date())
  return isValid(d) ? d : null
}

/**
 * Get today's date as YYYY-MM-DD string
 * @returns {string}
 */
export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Get date range presets
 * @param {string} preset - 'today', 'last7', 'last30', 'thisMonth', 'lastMonth', 'thisYear'
 * @returns {{ start: string, end: string }}
 */
export function getDateRange(preset) {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')

  switch (preset) {
    case 'today':
      return { start: todayStr, end: todayStr }
    case 'last7':
      return { start: format(subDays(today, 6), 'yyyy-MM-dd'), end: todayStr }
    case 'last30':
      return { start: format(subDays(today, 29), 'yyyy-MM-dd'), end: todayStr }
    case 'thisMonth':
      return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') }
    case 'thisYear':
      return { start: format(startOfYear(today), 'yyyy-MM-dd'), end: format(endOfYear(today), 'yyyy-MM-dd') }
    default:
      return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: todayStr }
  }
}

/**
 * Format month name for display
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string}
 */
export function formatMonth(dateStr) {
  const d = new Date(dateStr)
  return isValid(d) ? format(d, 'MMMM yyyy') : ''
}
