import PDFDocument from "pdfkit";

/** One-page purchase-order PDF for a CRM distributor email. */
export async function createDistributorPoPdf(input: { title: string; text: string }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 48, info: { Title: input.title, Author: "Cabinet Dealz" } });
  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });
  doc.fillColor("#172033").fontSize(18).font("Helvetica-Bold").text(input.title);
  doc.moveDown();
  doc.fontSize(10).font("Helvetica").fillColor("#1a2b4a").text(input.text, { width: 516 });
  doc.end();
  return complete;
}
