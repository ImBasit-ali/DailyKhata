import ExcelJS from 'exceljs'

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF4F46E5' },
}

const HEADER_FONT = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
  name: 'Calibri',
}

const BORDER_STYLE = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
}

const TOTAL_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' },
}

const TOTAL_FONT = {
  bold: true,
  size: 11,
  name: 'Calibri',
}

const CURRENCY_FORMAT = '#,##0.00'
const NUMBER_FORMAT = '#,##0.00'

function styleHeaderRow(worksheet, columnCount) {
  const headerRow = worksheet.getRow(1)
  headerRow.font = HEADER_FONT
  headerRow.fill = HEADER_FILL
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 28

  for (let i = 1; i <= columnCount; i++) {
    headerRow.getCell(i).border = BORDER_STYLE
  }
}

function styleDataRows(worksheet, startRow, endRow, columnCount) {
  for (let r = startRow; r <= endRow; r++) {
    const row = worksheet.getRow(r)
    for (let c = 1; c <= columnCount; c++) {
      row.getCell(c).border = BORDER_STYLE
    }
    // Alternate row colors
    if (r % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      }
    }
  }
}

function addTotalRow(worksheet, label, columnCount, sumColumns, dataStartRow, dataEndRow) {
  const totalRowNum = dataEndRow + 1
  const totalRow = worksheet.addRow([])
  totalRow.getCell(1).value = label
  totalRow.font = TOTAL_FONT
  totalRow.fill = TOTAL_FILL

  sumColumns.forEach(colNum => {
    const colLetter = String.fromCharCode(64 + colNum)
    totalRow.getCell(colNum).value = {
      formula: `SUM(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})`,
    }
    totalRow.getCell(colNum).numFmt = CURRENCY_FORMAT
  })

  for (let c = 1; c <= columnCount; c++) {
    totalRow.getCell(c).border = {
      top: { style: 'medium', color: { argb: 'FF4F46E5' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'medium', color: { argb: 'FF4F46E5' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    }
  }

  return totalRowNum
}

function autoWidth(worksheet) {
  worksheet.columns.forEach(column => {
    let maxLength = 10
    column.eachCell({ includeEmpty: true }, cell => {
      const cellLength = cell.value ? String(cell.value).length : 0
      if (cellLength > maxLength) {
        maxLength = cellLength
      }
    })
    column.width = Math.min(maxLength + 4, 40)
  })
}

function triggerDownload(buffer, filename) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
}

/**
 * Export fuel inventory data to Excel
 */
export async function exportFuelInventory(data, companyName, fuelType, dateRange) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Vyapar'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(`${fuelType.charAt(0).toUpperCase() + fuelType.slice(1)} Inventory`)

  sheet.columns = [
    { header: 'S.N.', key: 'sn', width: 8 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Opening (L)', key: 'opening_balance', width: 15 },
    { header: 'Purchased (L)', key: 'purchased', width: 15 },
    { header: 'Sold (L)', key: 'sold', width: 12 },
    { header: 'Rate/L (Rs)', key: 'rate_per_liter', width: 14 },
    { header: 'Sales (Rs)', key: 'sales_amount', width: 16 },
    { header: 'Closing (L)', key: 'closing_balance', width: 15 },
  ]

  styleHeaderRow(sheet, 8)

  data.forEach((row, idx) => {
    sheet.addRow({
      sn: idx + 1,
      date: row.date,
      opening_balance: Number(row.opening_balance),
      purchased: Number(row.purchased),
      sold: Number(row.sold),
      rate_per_liter: Number(row.rate_per_liter),
      sales_amount: Number(row.sales_amount),
      closing_balance: Number(row.closing_balance),
    })
  })

  const dataStart = 2
  const dataEnd = data.length + 1
  styleDataRows(sheet, dataStart, dataEnd, 8)

  // Format number columns
  for (let r = dataStart; r <= dataEnd; r++) {
    sheet.getRow(r).getCell(3).numFmt = NUMBER_FORMAT
    sheet.getRow(r).getCell(4).numFmt = NUMBER_FORMAT
    sheet.getRow(r).getCell(5).numFmt = NUMBER_FORMAT
    sheet.getRow(r).getCell(6).numFmt = CURRENCY_FORMAT
    sheet.getRow(r).getCell(7).numFmt = CURRENCY_FORMAT
    sheet.getRow(r).getCell(8).numFmt = NUMBER_FORMAT
  }

  // Total row with SUM formulas
  addTotalRow(sheet, 'TOTAL', 8, [4, 5, 7], dataStart, dataEnd)

  autoWidth(sheet)

  const buffer = await workbook.xlsx.writeBuffer()
  const dateStr = dateRange ? `${dateRange.start}_to_${dateRange.end}` : new Date().toISOString().slice(0, 10)
  triggerDownload(buffer, `${companyName}_${fuelType}_inventory_${dateStr}.xlsx`)
}

/**
 * Export customer ledger to Excel
 */
export async function exportCustomerLedger(data, companyName, customerName) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Vyapar'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(`${customerName} Ledger`)

  sheet.columns = [
    { header: 'S.N.', key: 'sn', width: 8 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Detail', key: 'detail', width: 30 },
    { header: 'Credit / جمع (Rs)', key: 'credit_amount', width: 18 },
    { header: 'Cash Advance (Rs)', key: 'cash_advance', width: 18 },
    { header: 'Balance / بقایا (Rs)', key: 'running_balance', width: 20 },
  ]

  styleHeaderRow(sheet, 6)

  data.forEach((row, idx) => {
    sheet.addRow({
      sn: idx + 1,
      date: row.date,
      detail: row.detail || '',
      credit_amount: Number(row.credit_amount),
      cash_advance: Number(row.cash_advance),
      running_balance: Number(row.running_balance),
    })
  })

  const dataStart = 2
  const dataEnd = data.length + 1
  styleDataRows(sheet, dataStart, dataEnd, 6)

  for (let r = dataStart; r <= dataEnd; r++) {
    sheet.getRow(r).getCell(4).numFmt = CURRENCY_FORMAT
    sheet.getRow(r).getCell(5).numFmt = CURRENCY_FORMAT
    sheet.getRow(r).getCell(6).numFmt = CURRENCY_FORMAT
  }

  addTotalRow(sheet, 'TOTAL', 6, [4, 5], dataStart, dataEnd)

  autoWidth(sheet)

  const buffer = await workbook.xlsx.writeBuffer()
  triggerDownload(buffer, `${companyName}_${customerName}_ledger.xlsx`)
}

/**
 * Export expenses to Excel
 */
export async function exportExpenses(data, companyName, dateRange) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Vyapar'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Expenses')

  sheet.columns = [
    { header: 'S.N.', key: 'sn', width: 8 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Firm Code', key: 'customer_code', width: 16 },
    { header: 'Description', key: 'name', width: 30 },
    { header: 'Amount (Rs)', key: 'amount', width: 16 },
  ]

  styleHeaderRow(sheet, 5)

  // Sort by customer_code then date
  const sorted = [...data].sort((a, b) => {
    if (a.customer_code !== b.customer_code) return (a.customer_code || '').localeCompare(b.customer_code || '')
    return a.date.localeCompare(b.date)
  })

  let currentCode = null
  let sn = 0

  sorted.forEach((row) => {
    // Add subtotal row when code changes
    if (currentCode !== null && row.customer_code !== currentCode) {
      const subtotalRow = sheet.addRow([])
      subtotalRow.getCell(3).value = `Subtotal: ${currentCode}`
      subtotalRow.font = TOTAL_FONT
      subtotalRow.fill = TOTAL_FILL
      const codeTotal = sorted
        .filter(r => r.customer_code === currentCode)
        .reduce((sum, r) => sum + Number(r.amount), 0)
      subtotalRow.getCell(5).value = codeTotal
      subtotalRow.getCell(5).numFmt = CURRENCY_FORMAT
    }

    currentCode = row.customer_code
    sn++

    sheet.addRow({
      sn,
      date: row.date,
      customer_code: row.customer_code || '-',
      name: row.name || '',
      amount: Number(row.amount),
    })
  })

  // Final subtotal
  if (currentCode !== null) {
    const subtotalRow = sheet.addRow([])
    subtotalRow.getCell(3).value = `Subtotal: ${currentCode}`
    subtotalRow.font = TOTAL_FONT
    subtotalRow.fill = TOTAL_FILL
    const codeTotal = sorted
      .filter(r => r.customer_code === currentCode)
      .reduce((sum, r) => sum + Number(r.amount), 0)
    subtotalRow.getCell(5).value = codeTotal
    subtotalRow.getCell(5).numFmt = CURRENCY_FORMAT
  }

  // Grand total
  const grandTotal = data.reduce((sum, r) => sum + Number(r.amount), 0)
  const grandRow = sheet.addRow([])
  grandRow.getCell(3).value = 'GRAND TOTAL'
  grandRow.font = { ...TOTAL_FONT, size: 12 }
  grandRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
  grandRow.getCell(5).value = grandTotal
  grandRow.getCell(5).numFmt = CURRENCY_FORMAT

  autoWidth(sheet)

  const buffer = await workbook.xlsx.writeBuffer()
  const dateStr = dateRange ? `${dateRange.start}_to_${dateRange.end}` : new Date().toISOString().slice(0, 10)
  triggerDownload(buffer, `${companyName}_expenses_${dateStr}.xlsx`)
}

/**
 * Export full report (daily/monthly/yearly) to Excel
 */
export async function exportReport(reportData, companyName, period) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Vyapar'
  workbook.created = new Date()

  // Summary sheet
  const summary = workbook.addWorksheet('Summary')
  summary.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value (Rs)', key: 'value', width: 20 },
  ]
  styleHeaderRow(summary, 2)

  const summaryRows = [
    { metric: 'Previous Net Balance (Opening / Carried Over)', value: reportData.previousNetBalance || 0 },
    { metric: '', value: '' },
    { metric: 'Total Combined Sales (Revenue)', value: reportData.totalSales || 0 },
    { metric: '  - Fuel Sales', value: reportData.totalFuelSales || 0 },
    { metric: '  - Counter / General Sales', value: reportData.generalSales || 0 },
    { metric: '  - Cash Advances Received from Customers', value: reportData.cashAdvances || 0 },
    { metric: '', value: '' },
    { metric: 'Total Expenses (All Categories)', value: reportData.totalExpenses || 0 },
    { metric: '  - Salaries Expense', value: reportData.salaryExpenses || 0 },
    { metric: '  - Other Operating Expenses (Rent, Bills, etc.)', value: reportData.otherExpenses || 0 },
    { metric: '', value: '' },
    { metric: 'Payments to Suppliers (Purchases Cash Paid)', value: reportData.supplierPayments || 0 },
    { metric: 'Supplier Dues Remaining (Payable Owed)', value: reportData.supplierDues || 0 },
    { metric: 'Dues Paid to Customers (Cash Out)', value: reportData.duesPaid || 0 },
    { metric: '', value: '' },
    { metric: 'NET CASH BALANCE (Prev + Sales − Expenses − Supplier Paid − Dues Paid)', value: reportData.netBalance || 0 },
    { metric: '', value: '' },
    { metric: 'Total Fuel Purchases Delivery Cost', value: reportData.totalPurchases || 0 },
    { metric: 'Note: Purchases are excluded from Sales. Deducted as supplier payments.', value: '' },
    { metric: '', value: '' },
    { metric: 'Petrol - Opening (L)', value: reportData.petrolOpening || 0 },
    { metric: 'Petrol - Closing (L)', value: reportData.petrolClosing || 0 },
    { metric: 'Petrol - Total Sold (L)', value: reportData.petrolSold || 0 },
    { metric: 'Petrol - Weighted Avg Rate', value: reportData.petrolAvgRate || 0 },
    { metric: '', value: '' },
    { metric: 'Diesel - Opening (L)', value: reportData.dieselOpening || 0 },
    { metric: 'Diesel - Closing (L)', value: reportData.dieselClosing || 0 },
    { metric: 'Diesel - Total Sold (L)', value: reportData.dieselSold || 0 },
    { metric: 'Diesel - Weighted Avg Rate', value: reportData.dieselAvgRate || 0 },
  ]

  summaryRows.forEach(row => {
    const addedRow = summary.addRow(row)
    if (row.metric && typeof row.value === 'number') {
      addedRow.getCell(2).numFmt = CURRENCY_FORMAT
    }
  })

  styleDataRows(summary, 2, summaryRows.length + 1, 2)
  autoWidth(summary)

  // Fuel sheets (if data exists)
  if (reportData.petrolData?.length > 0) {
    addFuelSheet(workbook, 'Petrol', reportData.petrolData)
  }
  if (reportData.dieselData?.length > 0) {
    addFuelSheet(workbook, 'Diesel', reportData.dieselData)
  }

  // Expenses sheet
  if (reportData.expensesData?.length > 0) {
    const expSheet = workbook.addWorksheet('Expenses')
    expSheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Category', key: 'category', width: 22 },
      { header: 'Firm Code', key: 'customer_code', width: 14 },
      { header: 'Description', key: 'name', width: 30 },
      { header: 'Amount (Rs)', key: 'amount', width: 16 },
    ]
    styleHeaderRow(expSheet, 5)
    reportData.expensesData.forEach(row => {
      const addedRow = expSheet.addRow({
        date: row.date,
        category: row.category || 'General & Misc',
        customer_code: row.customer_code || '-',
        name: row.name,
        amount: Number(row.amount),
      })
      addedRow.getCell(5).numFmt = CURRENCY_FORMAT
    })
    const ds = 2, de = reportData.expensesData.length + 1
    styleDataRows(expSheet, ds, de, 5)
    addTotalRow(expSheet, 'TOTAL', 5, [5], ds, de)
    autoWidth(expSheet)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  triggerDownload(buffer, `${companyName}_report_${period}.xlsx`)
}

function addFuelSheet(workbook, fuelType, data) {
  const sheet = workbook.addWorksheet(fuelType)
  sheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Opening (L)', key: 'opening_balance', width: 15 },
    { header: 'Purchased (L)', key: 'purchased', width: 15 },
    { header: 'Sold (L)', key: 'sold', width: 12 },
    { header: 'Rate/L (Rs)', key: 'rate_per_liter', width: 14 },
    { header: 'Sales (Rs)', key: 'sales_amount', width: 16 },
    { header: 'Closing (L)', key: 'closing_balance', width: 15 },
  ]
  styleHeaderRow(sheet, 7)
  data.forEach(row => {
    const addedRow = sheet.addRow({
      date: row.date,
      opening_balance: Number(row.opening_balance),
      purchased: Number(row.purchased),
      sold: Number(row.sold),
      rate_per_liter: Number(row.rate_per_liter),
      sales_amount: Number(row.sales_amount),
      closing_balance: Number(row.closing_balance),
    })
    addedRow.getCell(2).numFmt = NUMBER_FORMAT
    addedRow.getCell(3).numFmt = NUMBER_FORMAT
    addedRow.getCell(4).numFmt = NUMBER_FORMAT
    addedRow.getCell(5).numFmt = CURRENCY_FORMAT
    addedRow.getCell(6).numFmt = CURRENCY_FORMAT
    addedRow.getCell(7).numFmt = NUMBER_FORMAT
  })
  const ds = 2, de = data.length + 1
  styleDataRows(sheet, ds, de, 7)
  addTotalRow(sheet, 'TOTAL', 7, [3, 4, 6], ds, de)

  // Weighted average rate row
  const totalSales = data.reduce((s, r) => s + Number(r.sales_amount), 0)
  const totalSold = data.reduce((s, r) => s + Number(r.sold), 0)
  const avgRate = totalSold > 0 ? totalSales / totalSold : 0
  const avgRow = sheet.addRow([])
  avgRow.getCell(1).value = 'Weighted Avg Rate/L'
  avgRow.font = TOTAL_FONT
  avgRow.getCell(5).value = avgRate
  avgRow.getCell(5).numFmt = CURRENCY_FORMAT

  autoWidth(sheet)
}
