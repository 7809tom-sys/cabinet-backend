// Plans and delivers one distributor's portion of an order. The database
// wrapper records the outcome; a failure here never throws to order creation.

export type DistributorEmailStatus = "pending" | "sent" | "failed" | "no_email";

export type DistributorEmailLine = {
  sku: string;
  description: string;
  doorStyle: string | null;
  qty: number;
};

export type DistributorPortion = {
  distributorId: number;
  distributorName: string;
  orderEmail: string | null;
  ccEmails: string[];
  lines: DistributorEmailLine[];
};

export type DistributorEmailRecord = {
  distributorId: number;
  distributorName: string;
  status: DistributorEmailStatus;
  sentAt: string | null;
  sentTo: string | null;
  error: string | null;
};

export type DistributorEmailSummary = {
  distributorEmailStatus: DistributorEmailStatus;
  distributorEmailSentAt: string | null;
  distributorEmailTo: string | null;
  distributorEmailError: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function usableEmail(value: string | null | undefined): string | null {
  const email = value?.trim() ?? "";
  return email.length > 0 && email.length <= 320 && EMAIL_PATTERN.test(email) ? email : null;
}

export type AssignableLine = DistributorEmailLine & {
  distributorId?: number | null;
  cabinetId?: number | null;
  styleId?: number | null;
};

export function assignLinesToDistributors(
  lines: AssignableLine[],
  skuDistributor: Map<string, number>,
  fallbackDistributorId: number | null,
): Map<number, AssignableLine[]> {
  const groups = new Map<number, AssignableLine[]>();
  const push = (distributorId: number, line: AssignableLine) => {
    const bucket = groups.get(distributorId) ?? [];
    bucket.push(line);
    groups.set(distributorId, bucket);
  };
  for (const line of lines) {
    const explicit = line.distributorId != null && line.distributorId > 0 ? line.distributorId : null;
    const skuKey = line.cabinetId && line.styleId ? `${line.cabinetId}-${line.styleId}` : null;
    const fromSku = skuKey ? skuDistributor.get(skuKey) ?? null : null;
    const distributorId = explicit ?? fromSku ?? fallbackDistributorId;
    if (distributorId == null) continue;
    push(distributorId, line);
  }
  return groups;
}

export function parseCcEmails(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (value ?? "").split(/[,;]+/)) {
    const email = usableEmail(part);
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export function composeDistributorOrderEmail(input: {
  orderNumber: string;
  orderDate: string;
  customerName: string | null;
  shipTo: string[];
  distributorName: string;
  lines: DistributorEmailLine[];
  poNumber: string | null;
  notes: string | null;
}): { subject: string; text: string } {
  const lines = input.lines.length
    ? input.lines.map((line) => {
      const style = line.doorStyle ? ` · ${line.doorStyle}` : "";
      return `- ${line.qty} x ${line.sku || "SKU"} — ${line.description || "Item"}${style}`;
    })
    : ["- No line items were assigned to this distributor."];
  const text = [
    `Purchase order for ${input.distributorName}`,
    "",
    `Order number: ${input.orderNumber}`,
    `Date: ${input.orderDate}`,
    input.poNumber ? `PO number: ${input.poNumber}` : null,
    input.customerName ? `Customer: ${input.customerName}` : null,
    "",
    "Ship to:",
    ...(input.shipTo.length ? input.shipTo : ["No ship-to address was stored on this order."]),
    "",
    "Line items:",
    ...lines,
    "",
    input.notes ? `Notes: ${input.notes}` : null,
    "Cabinet Dealz",
  ].filter((line): line is string => line != null).join("\n");
  return {
    subject: `Purchase Order ${input.orderNumber} — Cabinet Dealz`,
    text,
  };
}

export function summarizeDistributorEmails(records: DistributorEmailRecord[]): DistributorEmailSummary {
  if (records.length === 0) {
    return {
      distributorEmailStatus: "pending",
      distributorEmailSentAt: null,
      distributorEmailTo: null,
      distributorEmailError: null,
    };
  }
  const sent = records.filter((row) => row.status === "sent");
  const failed = records.filter((row) => row.status === "failed");
  const missing = records.filter((row) => row.status === "no_email");
  const status: DistributorEmailStatus = failed.length
    ? "failed"
    : sent.length
      ? "sent"
      : missing.length
        ? "no_email"
        : "pending";
  const sentAt = sent.map((row) => row.sentAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const sentTo = records.map((row) => row.sentTo).filter((value): value is string => Boolean(value)).join(", ") || null;
  const error = [
    ...failed.map((row) => `${row.distributorName}: ${row.error || "Email failed"}`),
    ...missing.map((row) => `${row.distributorName}: no order email set`),
  ].join("; ") || null;
  return {
    distributorEmailStatus: status,
    distributorEmailSentAt: status === "sent" ? sentAt : null,
    distributorEmailTo: sentTo,
    distributorEmailError: status === "sent" && !failed.length && !missing.length ? null : error,
  };
}

export async function deliverDistributorEmails(input: {
  portions: DistributorPortion[];
  prior: DistributorEmailRecord[];
  force: boolean;
  now?: Date;
  send: (portion: DistributorPortion) => Promise<{ ok: boolean; error?: string }>;
}): Promise<DistributorEmailRecord[]> {
  const priorById = new Map(input.prior.map((row) => [row.distributorId, row]));
  const now = (input.now ?? new Date()).toISOString();
  const results: DistributorEmailRecord[] = [];
  for (const portion of input.portions) {
    const previous = priorById.get(portion.distributorId);
    if (previous?.status === "sent" && !input.force) {
      results.push(previous);
      continue;
    }
    const email = usableEmail(portion.orderEmail);
    if (!email) {
      results.push({
        distributorId: portion.distributorId,
        distributorName: portion.distributorName,
        status: "no_email",
        sentAt: null,
        sentTo: null,
        error: "No order email set",
      });
      continue;
    }
    try {
      const sent = await input.send({ ...portion, orderEmail: email });
      const cc = portion.ccEmails.filter((value) => value.toLowerCase() !== email.toLowerCase());
      if (!sent.ok) {
        results.push({
          distributorId: portion.distributorId,
          distributorName: portion.distributorName,
          status: "failed",
          sentAt: null,
          sentTo: [email, ...cc].join(", "),
          error: sent.error || "Email failed",
        });
        continue;
      }
      results.push({
        distributorId: portion.distributorId,
        distributorName: portion.distributorName,
        status: "sent",
        sentAt: now,
        sentTo: [email, ...cc].join(", "),
        error: null,
      });
    } catch (error) {
      results.push({
        distributorId: portion.distributorId,
        distributorName: portion.distributorName,
        status: "failed",
        sentAt: null,
        sentTo: email,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
