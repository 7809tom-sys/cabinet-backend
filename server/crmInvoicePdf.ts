import PDFDocument from "pdfkit";

export type CrmInvoicePdfLine = {
  description: string;
  amount: number;
  kind?: "charge" | "included";
};

export type CrmInvoiceBrand = {
  storeName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
};

export type CrmInvoicePdfInput = {
  invoiceNumber: string;
  issuedOn: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  linkedDesignName?: string | null;
  notes?: string | null;
  lines: CrmInvoicePdfLine[];
  brand: CrmInvoiceBrand;
};

const safeHex = (value: string | null | undefined, fallback: string) => /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : fallback;
const money = (amount: number) => Math.max(0, Number(amount) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const totalOf = (lines: CrmInvoicePdfLine[]) => lines.reduce((total, line) => total + (line.kind === "included" ? 0 : Math.max(0, Number(line.amount) || 0)), 0);
const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

async function loadBrandLogo(logoUrl: string | null | undefined): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    const url = new URL(logoUrl);
    const host = url.hostname.toLowerCase();
    const privateIpv4 = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    if (url.protocol !== "https:" || host === "localhost" || host.endsWith(".localhost") || privateIpv4) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || contentLength > 2_000_000) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= 2_000_000 ? bytes : null;
  } catch {
    return null;
  }
}

export function buildCrmInvoiceEmailHtml(input: CrmInvoicePdfInput): string {
  const primary = safeHex(input.brand.primaryColor, "#172033");
  const accent = safeHex(input.brand.accentColor, "#B5893D");
  const total = money(totalOf(input.lines));
  const logo = input.brand.logoUrl ? `<img src="${escapeHtml(input.brand.logoUrl)}" alt="${escapeHtml(input.brand.storeName)}" style="display:block;max-height:52px;max-width:200px;margin:0 0 12px;" />` : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#172033;max-width:640px;margin:0 auto;padding:24px;">
    <div style="border-bottom:3px solid ${accent};padding-bottom:16px;">
      ${logo}
      <div style="font-size:22px;font-weight:700;color:${primary};">${escapeHtml(input.brand.storeName)}</div>
      <div style="margin-top:4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${accent};">Cabinet order · design · installation</div>
    </div>
    <h1 style="font-size:24px;margin:24px 0 8px;">Your invoice is ready</h1>
    <p style="margin:0 0 16px;line-height:1.55;">Hello ${escapeHtml(input.customerName)}, your invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> is attached as a PDF.</p>
    <div style="border:1px solid #dce0e6;border-radius:8px;padding:16px;background:#f7f8fa;">
      <div style="font-size:12px;color:#526074;">TOTAL DUE</div>
      <div style="font-size:24px;font-weight:700;color:${primary};">${total}</div>
      ${input.linkedDesignName ? `<div style="margin-top:8px;font-size:13px;color:#526074;">Linked design: ${escapeHtml(input.linkedDesignName)}</div>` : ""}
    </div>
    <p style="font-size:13px;color:#526074;line-height:1.55;margin-top:20px;">Please keep the attached PDF for your records.</p>
  </div>`;
}

export async function createCrmInvoicePdf(input: CrmInvoicePdfInput): Promise<Buffer> {
  const primary = safeHex(input.brand.primaryColor, "#172033");
  const accent = safeHex(input.brand.accentColor, "#B5893D");
  const logo = await loadBrandLogo(input.brand.logoUrl);
  const doc = new PDFDocument({ size: "LETTER", margin: 48, info: { Title: input.invoiceNumber, Author: input.brand.storeName } });
  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });

  if (logo) {
    try {
      doc.image(logo, 48, 42, { fit: [170, 52] });
    } catch {
      // Keep the invoice branded by name and color when the stored logo is unsupported.
    }
  }
  const nameX = logo ? 238 : 48;
  doc.fillColor(primary).fontSize(18).font("Helvetica-Bold").text(input.brand.storeName, nameX, 48, { width: 250 });
  doc.fillColor(accent).fontSize(9).font("Helvetica-Bold").text("CABINET ORDER · DESIGN · INSTALLATION", nameX, 73, { width: 300 });
  doc.moveTo(48, 110).lineTo(564, 110).lineWidth(2.5).strokeColor(accent).stroke();
  doc.fillColor(primary).fontSize(26).font("Helvetica-Bold").text("Invoice", 48, 126);
  doc.fillColor("#526074").fontSize(10).font("Helvetica").text(input.invoiceNumber, 420, 130, { align: "right", width: 144 });
  doc.text(`Issued ${input.issuedOn}`, 420, 145, { align: "right", width: 144 });

  doc.roundedRect(48, 184, 516, 72, 7).fillAndStroke("#F6F7F8", "#DCE0E6");
  doc.fillColor("#526074").fontSize(9).font("Helvetica-Bold").text("BILL TO", 62, 198);
  doc.fillColor(primary).fontSize(14).font("Helvetica-Bold").text(input.customerName, 62, 213);
  doc.fillColor("#526074").fontSize(10).font("Helvetica").text([input.customerEmail, input.customerPhone].filter(Boolean).join(" · "), 62, 233);

  let y = 284;
  doc.rect(48, y, 516, 25).fill(primary);
  doc.fillColor("#FFFFFF").fontSize(9).font("Helvetica-Bold").text("DESCRIPTION", 62, y + 8);
  doc.text("AMOUNT", 455, y + 8, { width: 94, align: "right" });
  y += 25;
  for (const line of input.lines) {
    const included = line.kind === "included";
    doc.fillColor(included ? "#526074" : primary).fontSize(included ? 9 : 11).font("Helvetica").text(line.description, 62, y + 11, { width: 340 });
    doc.font(included ? "Helvetica" : "Helvetica-Bold").text(included ? "Included" : money(line.amount), 455, y + 11, { width: 94, align: "right" });
    doc.moveTo(48, y + 34).lineTo(564, y + 34).lineWidth(0.5).strokeColor("#DCE0E6").stroke();
    y += 35;
  }
  doc.fillColor(primary).fontSize(15).font("Helvetica-Bold").text("Total due", 355, y + 20, { width: 95, align: "right" });
  doc.text(money(totalOf(input.lines)), 455, y + 20, { width: 94, align: "right" });
  y += 62;
  if (input.linkedDesignName) {
    doc.fillColor(accent).rect(48, y, 3, 34).fill();
    doc.fillColor(primary).fontSize(10).font("Helvetica-Bold").text("Linked design", 62, y + 3);
    doc.font("Helvetica").text(input.linkedDesignName, 62, y + 17);
    y += 48;
  }
  if (input.notes) {
    doc.fillColor(accent).rect(48, y, 3, 34).fill();
    doc.fillColor(primary).fontSize(10).font("Helvetica-Bold").text("Notes", 62, y + 3);
    doc.font("Helvetica").text(input.notes, 62, y + 17, { width: 480 });
  }
  doc.end();
  return complete;
}
