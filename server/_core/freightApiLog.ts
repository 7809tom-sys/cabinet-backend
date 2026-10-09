// ─── Freight API call log ────────────────────────────────────────────────────
// Lightweight in-memory ring buffer that stores the last 200 freight API calls.
// Entries are written by the broker clients and readable by the admin via the
// freight.adminGetApiLogs procedure. Resets on server restart (no DB needed).

export interface FreightApiLogEntry {
  id: number;
  ts: string; // ISO timestamp
  broker: string; // "freightquote" | "globaltranz" | "worldwideexpress" | "easypost"
  fromZip: string;
  toZip: string;
  palletCount: number;
  totalWeightLbs: number;
  freightClass: string;
  accessorials: string[]; // e.g. ["RESIDENTIAL", "LIFTGATE"]
  ok: boolean;
  amountCents: number;
  carrier?: string;
  service?: string;
  error?: string;
  durationMs: number;
  /** Exact handling units sent to the carrier or prepared for the quote. */
  packages: FreightApiPackageAudit[];
}

export interface FreightApiPackageAudit {
  kind: "pallet" | "carton";
  index: number;
  label?: string | null;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLbs: number;
  contentsWeightLbs?: number;
  contentsCubicFt?: number;
  reason?: string;
}

const MAX_ENTRIES = 200;
let nextId = 1;
const entries: FreightApiLogEntry[] = [];

export function logFreightApiCall(entry: Omit<FreightApiLogEntry, "id" | "ts">): void {
  const record: FreightApiLogEntry = {
    id: nextId++,
    ts: new Date().toISOString(),
    ...entry,
  };
  entries.push(record);
  if (entries.length > MAX_ENTRIES) entries.shift();
  // Also log to console for server-side visibility.
  const status = record.ok ? `✓ $${(record.amountCents / 100).toFixed(2)}` : `✗ ${record.error ?? "error"}`;
  console.log(
    `[freight-api] ${record.broker} ${record.fromZip}→${record.toZip} ` +
    `${record.totalWeightLbs}lbs class${record.freightClass} ${status} (${record.durationMs}ms)`
  );
}

export function getFreightApiLogs(limit = 50): FreightApiLogEntry[] {
  return entries.slice(-limit).reverse(); // newest first
}
