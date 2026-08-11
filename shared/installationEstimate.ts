export type InstallationEstimateDraftLine = {
  description: string;
  quantity: number;
  unitCost: number;
};

export type InstallationEstimateLine = InstallationEstimateDraftLine & {
  lineTotal: number;
};

export function calculateInstallationEstimate(lines: InstallationEstimateDraftLine[], taxAmount = 0) {
  const lineItems: InstallationEstimateLine[] = lines.map((line) => ({
    ...line,
    quantity: Number(line.quantity.toFixed(2)),
    unitCost: Number(line.unitCost.toFixed(2)),
    lineTotal: Number((line.quantity * line.unitCost).toFixed(2)),
  }));
  const subtotal = Number(lineItems.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2));
  const tax = Number(taxAmount.toFixed(2));
  return { lineItems, subtotal, taxAmount: tax, totalAmount: Number((subtotal + tax).toFixed(2)) };
}
