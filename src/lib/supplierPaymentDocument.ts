/**
 * Short A4 supplier payment slip (RGF) — not A5.
 */

import {
  escapeDocHtml,
  formatDocCfa,
  formatDocDateTime,
  renderCommercialHeader,
  renderPartyBlock,
  renderSignatureBoxes,
  wrapCommercialDocument,
  type CommercialClientBlock,
  type CommercialHeaderContext,
} from '@/lib/commercialDocumentHtml'
import { printCommercialDocument } from '@/lib/reportExport'
import { APP_BUSINESS_FALLBACK } from '@/lib/formatters'
import { amountInWordsFrCfa } from '@/lib/amountInWordsFr'
import { fetchBusinessSettings } from '@/hooks/useBusinessSettings'

export interface SupplierPaymentSlipContext {
  receiptNumber: string
  amountCfa: number
  methodLabel: string
  recordedAt: string
  note?: string | null
  newBalanceOwedCfa?: number | null
  supplier: CommercialClientBlock
  header?: Partial<CommercialHeaderContext>
}

export function buildSupplierPaymentSlipHtml(ctx: SupplierPaymentSlipContext): string {
  const header: CommercialHeaderContext = {
    businessName: ctx.header?.businessName ?? APP_BUSINESS_FALLBACK,
    logoUrl: ctx.header?.logoUrl ?? null,
    phone: ctx.header?.phone ?? null,
    businessAddress: ctx.header?.businessAddress ?? null,
    depotName: ctx.header?.depotName ?? null,
    depotAddress: ctx.header?.depotAddress ?? null,
  }
  const extraLines = [
    { label: 'Moyen', value: ctx.methodLabel },
  ]
  if (ctx.note?.trim()) {
    extraLines.push({ label: 'Note', value: ctx.note.trim() })
  }
  const balanceRow =
    ctx.newBalanceOwedCfa != null
      ? `<tr><td>Nouveau solde dû</td><td>${escapeDocHtml(formatDocCfa(ctx.newBalanceOwedCfa))}</td></tr>`
      : ''
  const body = `
    ${renderCommercialHeader(header, {
      title: 'Reçu de règlement fournisseur',
      numberLabel: 'N\u00b0',
      number: ctx.receiptNumber,
      dateLabel: 'Date',
      date: formatDocDateTime(ctx.recordedAt),
      extraLines,
    })}
    <div class="parties">
      ${renderPartyBlock('Fournisseur', ctx.supplier)}
      <div class="party">
        <h3>Règlement</h3>
        <p class="muted">Accusé de paiement fournisseur (A4).</p>
      </div>
    </div>
    <table class="totals" style="margin: 24px auto 12px; float: none;">
      <tr class="net"><td>Montant réglé</td><td>${escapeDocHtml(formatDocCfa(ctx.amountCfa))}</td></tr>
      ${balanceRow}
    </table>
    <p class="words">${escapeDocHtml(
      `Arrêté le présent règlement à la somme de : ${amountInWordsFrCfa(ctx.amountCfa)}.`,
    )}</p>
    ${renderSignatureBoxes('Cachet / Signature', 'Fournisseur')}
  `
  return wrapCommercialDocument({
    title: `RGF ${ctx.receiptNumber}`,
    bodyHtml: body,
    extraCss: ' body { padding-top: 14mm; padding-bottom: 14mm; } .sign { margin-top: 18px; } ',
  })
}

export function printSupplierPaymentSlip(ctx: SupplierPaymentSlipContext): void {
  printCommercialDocument(buildSupplierPaymentSlipHtml(ctx))
}

export async function reprintSupplierPaymentSlip(
  ctx: Omit<SupplierPaymentSlipContext, 'header'>,
): Promise<void> {
  const settings = await fetchBusinessSettings()
  printSupplierPaymentSlip({
    ...ctx,
    receiptNumber: ctx.receiptNumber?.trim() || '\u2014',
    header: {
      businessName: settings.business_name,
      logoUrl: settings.logo_url,
      phone: settings.phone,
      businessAddress: settings.address,
    },
  })
}
