/**
 * Write PDF HTML samples using the same structure as production print helpers.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tmp-export-verify')
mkdirSync(outDir, { recursive: true })

const salesHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sales Report</title>
<style>
  @page { margin: 14mm; }
  body { font-family: system-ui, sans-serif; color: #111; font-size: 11px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #667085; margin: 0 0 14px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; color: #667085; }
  thead { display: table-header-group; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sale-total td { font-weight: 700; background: #f9fafb; border-top: 1px solid #d0d5dd; }
  .total-row td { font-weight: 700; border-top: 2px solid #111; padding-top: 10px; }
  .muted { font-weight: 400; color: #667085; font-size: 10px; }
</style></head><body>
  <h1>Sales Report / Rapport des ventes</h1>
  <p class="sub">Date Range: 2026-09-14 → 2026-09-18 · Currency: CFA</p>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Sale / Receipt</th><th>Serial</th><th>Product</th><th>Unit</th>
        <th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>18/09/2026</td><td>DKR-1</td><td>SN-1</td><td>A</td><td>Piece</td><td class="num">1</td><td class="num">9 100 CFA</td><td class="num">9 100 CFA</td></tr>
      <tr class="sale-total"><td colspan="7">Final Sale Total / Total final — DKR-1 <span class="muted">(Admin override · calculated 9 100 CFA)</span></td><td class="num">7 000 CFA</td></tr>
      <tr><td>18/09/2026</td><td>DKR-25</td><td>SN-2</td><td>Bread</td><td>Piece</td><td class="num">1</td><td class="num">600 CFA</td><td class="num">600 CFA</td></tr>
      <tr><td>18/09/2026</td><td>DKR-25</td><td>SN-3</td><td>Tea</td><td>Piece</td><td class="num">2</td><td class="num">400 CFA</td><td class="num">800 CFA</td></tr>
      <tr class="sale-total"><td colspan="7">Final Sale Total / Total final — DKR-25</td><td class="num">1 400 CFA</td></tr>
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="7">TOTAL SALES FOR SELECTED DATE RANGE / Total des ventes</td>
        <td class="num">8 400 CFA</td>
      </tr>
    </tfoot>
  </table>
</body></html>`

const customerHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Customer Account — Fatou Diallo</title>
<style>
  @page { margin: 12mm; }
  body { font-family: system-ui, sans-serif; color: #111; font-size: 11px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 8px; border-bottom: 1px solid #d0d5dd; padding-bottom: 4px; }
  thead { display: table-header-group; }
  table.data { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 5px 6px; text-align: left; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .sale-total td { font-weight: 700; background: #f9fafb; }
  .balance { font-size: 14px; font-weight: 700; margin-top: 12px; }
</style></head><body>
  <h1>Customer Account Report / Rapport de compte client</h1>
  <h2>Summary / Résumé</h2>
  <p>Total Sales / Total des ventes: 1 400 CFA</p>
  <p>Total Returns / Total des retours: 0 CFA</p>
  <p>Total Payments / Total des paiements: 500 CFA</p>
  <p>Current Balance / Solde restant: 900 CFA</p>
  <h2>Sales / Ventes</h2>
  <table class="data">
    <thead><tr><th>Date</th><th>Sale / Receipt</th><th>Serial</th><th>Product</th><th>Unit</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr></thead>
    <tbody>
      <tr><td>10/09/2026</td><td>DKR-00000025</td><td>SN-1</td><td>Sliced Bread</td><td>Piece</td><td class="num">1</td><td class="num">600 CFA</td><td class="num">600 CFA</td></tr>
      <tr><td>10/09/2026</td><td>DKR-00000025</td><td>SN-2</td><td>Tea Biscuits</td><td>Piece</td><td class="num">2</td><td class="num">400 CFA</td><td class="num">800 CFA</td></tr>
      <tr class="sale-total"><td colspan="7">Sale Total / Total de la vente — DKR-00000025</td><td class="num">1 400 CFA</td></tr>
    </tbody>
  </table>
  <p class="balance">CURRENT BALANCE / Solde restant: 900 CFA</p>
</body></html>`

writeFileSync(join(outDir, 'Sales_Report_sample.pdf.html'), salesHtml)
writeFileSync(join(outDir, 'Customer_Fatou_sample.pdf.html'), customerHtml)

const salesFinal = (salesHtml.match(/Final Sale Total \/ Total final/g) || []).length
const custSale = (customerHtml.match(/Sale Total \/ Total de la vente — DKR-00000025/g) || []).length
console.log('PDF HTML written')
console.log('Sales Final Sale Total rows:', salesFinal, '(expect 2)')
console.log('Customer Sale Total rows:', custSale, '(expect 1)')
console.log('Bread line total is 600, not whole sale:', salesHtml.includes('600 CFA') && customerHtml.includes('600 CFA'))
