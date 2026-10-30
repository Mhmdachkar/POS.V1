/**
 * List-page CSV/XLSX — re-exports the shared tableExport helper.
 */

export {
  LIST_EXPORT_MAX_ROWS,
  exportTable,
  exportTable as exportFilteredList,
  exportCfaInt,
  exportExcelDate,
  exportExcelSerial,
  exportOuiNon,
  resolveExportCompanyName,
  downloadStyledWorkbook,
  buildReportExportAoa,
  type ExportColumn,
  type ExportCellKind,
  type TableExportMeta,
  type TableExportRow,
  type StyledSheetSpec,
} from '@/lib/tableExport'
