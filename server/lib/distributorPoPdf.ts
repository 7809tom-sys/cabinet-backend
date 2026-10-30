import PDFDocument from "pdfkit";
import {
  CABINET_DEALZ_PO_BRAND,
  formatPoMoney,
  lineDetail,
  lineItemName,
  poLineAmount,
  type DistributorPoDocument,
  type PoParty,
} from "./distributorOrderEmail";

const NAVY = CABINET_DEALZ_PO_BRAND.navy;
const GOLD = CABINET_DEALZ_PO_BRAND.gold;
const MUTED = "#526174";
const LINE = "#d5dbe3";
const PAGE_BOTTOM = 720;

/** Same mark as client/public/favicon.svg. Inlined so the Railway bundle can draw it without the frontend tree. */
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0f1f3d"/>
  <text x="50%" y="54%" text-anchor="middle" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-weight="700" font-size="30">
    <tspan fill="#ffffff">C</tspan><tspan fill="#d9a441">D</tspan>
  </text>
</svg>`;

let logoPromise: Promise<Buffer | null> | undefined;

export function loadCabinetDealzLogo(): Promise<Buffer | null> {
  logoPromise ??= import("sharp")
    .then(({ default: sharp }) => sharp(Buffer.from(MARK_SVG)).resize(192, 192).png().toBuffer())
    .then((png) => png)
    .catch(() => null);
  return logoPromise;
}

type Pdf = InstanceType<typeof PDFDocument>;

type Column = {
  label: string;
  width: number;
  align: "left" | "right";
};

function columnsFor(showPrices: boolean): Column[] {
  if (!showPrices) {
    return [
      { label: "Qty", width: 44, align: "right" },
      { label: "SKU", width: 110, align: "left" },
      { label: "Description", width: 248, align: "left" },
      { label: "Door Style", width: 130, align: "left" },
    ];
  }
  return [
    { label: "Qty", width: 36, align: "right" },
    { label: "SKU", width: 84, align: "left" },
    { label: "Description", width: 176, align: "left" },
    { label: "Door Style", width: 96, align: "left" },
    { label: "Unit Cost", width: 70, align: "right" },
    { label: "Amount", width: 70, align: "right" },
  ];
}

function drawMark(doc: Pdf, x: number, y: number, size: number) {
  doc.save();
  doc.roundedRect(x, y, size, size, size * 0.22).fill("#0f1f3d");
  doc.font("Helvetica-Bold").fontSize(size * 0.42);
  doc.fillColor("#ffffff").text("C", x + size * 0.1, y + size * 0.28, { lineBreak: false, width: size * 0.38 });
  doc.fillColor("#d9a441").text("D", x + size * 0.46, y + size * 0.28, { lineBreak: false, width: size * 0.4 });
  doc.restore();
}

function drawFooter(doc: Pdf) {
  doc.save();
  doc.font("Helvetica").fontSize(8).fillColor("#8b95a7");
  doc.text(
    "Cabinet Dealz   ·   470 N Tamiami Trail, Osprey, FL 34229   ·   (941) 899-3288   ·   sales@cabinetdealz.com",
    40,
    746,
    { width: 532, align: "center", lineBreak: false, height: 12 },
  );
  doc.restore();
}

function partyLines(block: PoParty): string[] {
  return [block.name, ...block.lines];
}

/** Letter-size purchase order. pdfkit only — no browser — so sending stays local and quick. */
export async function createDistributorPoPdf(document: DistributorPoDocument): Promise<Buffer> {
  const logo = await loadCabinetDealzLogo();
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 36, bottom: 18, left: 40, right: 40 },
    compress: false,
    info: {
      Title: `Purchase Order ${document.orderNumber}`,
      Author: "Cabinet Dealz",
      Subject: `Purchase order for ${document.distributorName}`,
    },
  });
  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });

  const left = 40;
  const width = 532;
  let y = 0;
  let logoDrawn = false;

  const paintHeader = (continued: boolean) => {
    doc.rect(0, 0, 612, continued ? 46 : 104).fill(NAVY);
    doc.rect(0, continued ? 46 : 104, 612, 4).fill(GOLD);
    if (continued) {
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12).text(`Purchase Order ${document.orderNumber}`, left, 16, { lineBreak: false });
      doc.font("Helvetica").fontSize(9).fillColor(GOLD).text("Continued", 420, 18, { width: 152, align: "right", lineBreak: false });
      y = 68;
      return;
    }
    if (logo) {
      try {
        doc.image(logo, left, 22, { fit: [52, 52] });
        logoDrawn = true;
      } catch {
        logoDrawn = false;
      }
    }
    if (!logoDrawn) drawMark(doc, left, 24, 48);
    const nameX = left + 66;
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(18).text(CABINET_DEALZ_PO_BRAND.name, nameX, 24, { lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor("#d5dbe3");
    doc.text("470 N Tamiami Trail, Osprey, FL 34229", nameX, 48, { width: 250, lineBreak: false });
    doc.text("(941) 899-3288   ·   sales@cabinetdealz.com", nameX, 60, { width: 250, lineBreak: false });
    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(13).text("PURCHASE ORDER", 360, 28, { width: 212, align: "right", lineBreak: false });
    doc.fillColor("#ffffff").font("Helvetica").fontSize(10).text(document.orderNumber, 360, 48, { width: 212, align: "right", lineBreak: false });
    doc.fontSize(9).fillColor("#d5dbe3").text(document.orderDate, 360, 64, { width: 212, align: "right", lineBreak: false });
    y = 126;
  };

  const ensure = (needed: number) => {
    if (y + needed <= PAGE_BOTTOM) return;
    drawFooter(doc);
    doc.addPage();
    paintHeader(true);
  };

  paintHeader(false);

  const blocks: Array<{ title: string; lines: string[] }> = [
    { title: "VENDOR", lines: partyLines(document.vendor) },
    { title: "BILL TO", lines: partyLines(document.billTo) },
    { title: "SHIP TO", lines: partyLines(document.shipTo) },
  ];
  doc.font("Helvetica").fontSize(9);
  const blockHeight = 22 + Math.max(...blocks.map((block) => block.lines.length)) * 12 + 12;
  ensure(blockHeight + 8);
  const gap = 10;
  const boxWidth = (width - gap * 2) / 3;
  blocks.forEach((block, index) => {
    const x = left + index * (boxWidth + gap);
    doc.roundedRect(x, y, boxWidth, blockHeight, 4).fillAndStroke("#f7f8fa", LINE);
    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(8).text(block.title, x + 10, y + 8, { width: boxWidth - 20, lineBreak: false });
    let lineY = y + 22;
    block.lines.forEach((line, lineIndex) => {
      doc.fillColor(lineIndex === 0 ? NAVY : MUTED).font(lineIndex === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(lineIndex === 0 ? 10 : 8.5);
      doc.text(line, x + 10, lineY, { width: boxWidth - 20 });
      lineY += 12;
    });
  });
  y += blockHeight + 16;

  const facts = [
    document.poNumber ? `PO number  ${document.poNumber}` : null,
    document.customerName ? `Customer  ${document.customerName}` : null,
    document.deliveryLabel ? `Fulfillment  ${document.deliveryLabel}` : null,
  ].filter((fact): fact is string => Boolean(fact));
  if (facts.length) {
    ensure(18);
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(facts.join("      "), left, y, { width });
    y += 20;
  }

  const columns = columnsFor(document.showPrices);
  const drawTableHeader = () => {
    ensure(24);
    doc.rect(left, y, width, 22).fill(NAVY);
    let x = left;
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
    for (const column of columns) {
      doc.text(column.label.toUpperCase(), x + 6, y + 7, { width: column.width - 12, align: column.align, lineBreak: false });
      x += column.width;
    }
    y += 22;
  };
  drawTableHeader();

  const rows = document.lines.length
    ? document.lines
    : [];
  if (rows.length === 0) {
    ensure(28);
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text("No line items were assigned to this distributor.", left + 8, y + 8, { width: width - 16 });
    y += 28;
  }

  rows.forEach((line, index) => {
    const name = lineItemName(line);
    const detail = lineDetail(line, name);
    const amount = poLineAmount(line.qty, line.unitCost);
    const descriptionWidth = (columns.find((column) => column.label === "Description")?.width ?? 180) - 12;
    doc.font("Helvetica").fontSize(9);
    const nameHeight = doc.heightOfString(name || " ", { width: descriptionWidth });
    const detailHeight = detail ? doc.fontSize(8).heightOfString(detail, { width: descriptionWidth }) + 2 : 0;
    const rowHeight = Math.max(24, nameHeight + detailHeight + 12);
    if (y + rowHeight > PAGE_BOTTOM) {
      drawFooter(doc);
      doc.addPage();
      paintHeader(true);
      drawTableHeader();
    }
    if (index % 2 === 1) doc.rect(left, y, width, rowHeight).fill("#f7f8fa");
    let x = left;
    const values = [
      String(line.qty),
      line.sku || "—",
      name,
      line.doorStyle || "",
      ...(document.showPrices ? [line.unitCost != null && amount != null ? formatPoMoney(line.unitCost) : "", amount != null ? formatPoMoney(amount) : ""] : []),
    ];
    values.forEach((value, valueIndex) => {
      const column = columns[valueIndex];
      if (column.label === "Description") {
        doc.fillColor(NAVY).font("Helvetica").fontSize(9).text(name || " ", x + 6, y + 6, { width: column.width - 12 });
        if (detail) doc.fillColor(MUTED).fontSize(8).text(detail, x + 6, y + 6 + nameHeight, { width: column.width - 12 });
      } else {
        doc.fillColor(NAVY).font("Helvetica").fontSize(9).text(value, x + 6, y + 6, { width: column.width - 12, align: column.align });
      }
      x += column.width;
    });
    doc.moveTo(left, y + rowHeight).lineTo(left + width, y + rowHeight).lineWidth(0.4).strokeColor(LINE).stroke();
    y += rowHeight;
  });

  const totalRows: Array<[string, string, boolean]> = [];
  if (document.subtotal != null) totalRows.push(["Subtotal", formatPoMoney(document.subtotal), false]);
  for (const charge of document.charges) totalRows.push([charge.label, formatPoMoney(charge.amount), false]);
  if (document.total != null) totalRows.push(["Total", formatPoMoney(document.total), true]);
  if (totalRows.length) {
    ensure(totalRows.length * 18 + 8);
    y += 8;
    for (const [label, value, emphasis] of totalRows) {
      doc.font(emphasis ? "Helvetica-Bold" : "Helvetica").fontSize(emphasis ? 12 : 10).fillColor(NAVY);
      doc.text(label, left + 300, y, { width: 120, align: "right", lineBreak: false });
      doc.text(value, left + 424, y, { width: 108, align: "right", lineBreak: false });
      y += emphasis ? 20 : 16;
    }
  }

  ensure(52);
  y += 8;
  doc.rect(left, y, 3, 36).fill(GOLD);
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("Payment terms", left + 12, y + 2, { lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(document.paymentTerms, left + 12, y + 16, { width: width - 20 });
  y += 48;

  if (document.notes) {
    doc.font("Helvetica").fontSize(9);
    const notesHeight = doc.heightOfString(document.notes, { width: width - 20 });
    ensure(notesHeight + 28);
    doc.rect(left, y, 3, Math.max(36, notesHeight + 22)).fill(GOLD);
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("Notes", left + 12, y + 2, { lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(document.notes, left + 12, y + 16, { width: width - 20 });
    y += notesHeight + 28;
  }

  drawFooter(doc);
  doc.end();
  return complete;
}
