export type CrmQuickInvoiceLine = {
  description: string;
  amount: number;
};

export type CrmQuickInvoice = {
  invoiceNumber: string;
  issuedOn: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  linkedDesignName?: string | null;
  notes?: string | null;
  lines: CrmQuickInvoiceLine[];
};

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export function crmQuickInvoiceTotal(lines: CrmQuickInvoiceLine[]): number {
  return lines.reduce((total, line) => total + Math.max(0, Number(line.amount) || 0), 0);
}

export function buildCrmQuickInvoiceHtml(invoice: CrmQuickInvoice): string {
  const total = crmQuickInvoiceTotal(invoice.lines);
  const format = (amount: number) => amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const customerContact = [invoice.customerEmail, invoice.customerPhone]
    .filter((value): value is string => Boolean(value))
    .map(escapeHtml)
    .join("<br>");
  const lineRows = invoice.lines.map((line) => `
    <tr><td>${escapeHtml(line.description)}</td><td class="amount">${format(Math.max(0, line.amount))}</td></tr>
  `).join("");

  return `<!doctype html>
  <html><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    @page { size: letter; margin: 0.55in; }
    * { box-sizing: border-box; }
    body { color: #172033; font: 13px/1.5 Arial, Helvetica, sans-serif; margin: 0; }
    .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #b5893d; padding-bottom: 18px; }
    .eyebrow { color: #80601f; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { font-size: 30px; margin: 2px 0 0; }
    .meta { color: #526074; font-size: 12px; text-align: right; }
    .customer { background: #f6f7f8; border: 1px solid #dce0e6; border-radius: 8px; margin: 24px 0; padding: 16px; }
    .customer strong { display: block; font-size: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #172033; color: white; font-size: 11px; letter-spacing: .05em; padding: 10px 12px; text-align: left; text-transform: uppercase; }
    td { border-bottom: 1px solid #dce0e6; padding: 12px; }
    .amount { text-align: right; white-space: nowrap; }
    .total { display: flex; justify-content: flex-end; gap: 28px; font-size: 18px; font-weight: 700; padding: 18px 12px; }
    .design, .notes { border-left: 3px solid #b5893d; color: #405065; margin-top: 22px; padding-left: 12px; }
    .footer { color: #6b7788; font-size: 11px; margin-top: 38px; }
  </style></head><body>
    <div class="header"><div><div class="eyebrow">Cabinet order · design · installation</div><h1>Invoice</h1></div><div class="meta"><strong>${escapeHtml(invoice.invoiceNumber)}</strong><br>Issued ${escapeHtml(invoice.issuedOn)}</div></div>
    <section class="customer"><div class="eyebrow">Bill to</div><strong>${escapeHtml(invoice.customerName)}</strong>${customerContact ? `<div>${customerContact}</div>` : ""}</section>
    <table><thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead><tbody>${lineRows}</tbody></table>
    <div class="total"><span>Total due</span><span>${format(total)}</span></div>
    ${invoice.linkedDesignName ? `<section class="design"><strong>Linked design</strong><br>${escapeHtml(invoice.linkedDesignName)}</section>` : ""}
    ${invoice.notes ? `<section class="notes"><strong>Notes</strong><br>${escapeHtml(invoice.notes)}</section>` : ""}
    <footer class="footer">This invoice was prepared from the CRM lead. Save or print this page as a PDF for the customer record.</footer>
  </body></html>`;
}

export function openCrmQuickInvoicePdf(invoice: CrmQuickInvoice): boolean {
  const printWindow = window.open("", "_blank", "width=900,height=900");
  if (!printWindow) return false;
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(buildCrmQuickInvoiceHtml(invoice));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 180);
  return true;
}
