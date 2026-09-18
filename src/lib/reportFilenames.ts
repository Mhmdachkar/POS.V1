/**
 * Safe report filenames for management exports.
 */

export function sanitizeFilenamePart(raw: string, fallback = 'Report'): string {
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
  return cleaned || fallback
}

export function salesReportFilename(
  startDate: string,
  endDate: string,
  ext: 'xlsx' | 'pdf' | 'csv',
): string {
  const range =
    startDate === endDate
      ? startDate
      : `${startDate}_to_${endDate}`
  return `Sales_Report_${range}.${ext}`
}

export function customerAccountFilename(
  customerName: string,
  ext: 'xlsx' | 'pdf' | 'csv',
): string {
  return `Customer_${sanitizeFilenamePart(customerName, 'Customer')}_Account_Report.${ext}`
}
