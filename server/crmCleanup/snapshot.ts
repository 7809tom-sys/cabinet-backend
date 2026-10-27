import { createHash } from "node:crypto";
import type { CleanupPlan } from "./plan";

export type Stamp = { id: number; updatedAt: string };

export type CanonicalSnapshot = {
  v: 1;
  keepUserIds: number[];
  alsoDeleteUserIds: number[];
  deleteSupabaseAuth: boolean;
  deleteUsers: Stamp[];
  deleteOrders: Stamp[];
  deleteLegacyOrders: Stamp[];
  deleteDeals: Stamp[];
  deleteChildren: { table: string; id: number; updatedAt: string }[];
  deleteStripe: Stamp[];
  deleteEstimates: Stamp[];
  unlinks: { table: string; id: number; field: string; updatedAt: string }[];
  supabaseAuthIds: string[];
};

export class SnapshotMismatchError extends Error {
  readonly code = "SNAPSHOT_MISMATCH" as const;
  constructor() {
    super("The CRM data changed since this preview. Build a new preview before deleting.");
    this.name = "SnapshotMismatchError";
  }
}

function stamps(rows: { id: number; updatedAt: string; action: "delete" | "keep" }[]): Stamp[] {
  return rows
    .filter((row) => row.action === "delete")
    .map((row) => ({ id: row.id, updatedAt: row.updatedAt }))
    .sort((a, b) => a.id - b.id);
}

export function canonicalSnapshot(plan: CleanupPlan): CanonicalSnapshot {
  const children = plan.children
    .filter((row) => row.action === "delete")
    .map((row) => ({ table: row.table, id: row.id, updatedAt: row.updatedAt }))
    .sort((a, b) => a.table.localeCompare(b.table) || a.id - b.id);
  const authIds = plan.users
    .filter((user) => user.action === "delete" && user.authId)
    .map((user) => user.authId as string)
    .sort();
  return {
    v: 1,
    keepUserIds: [...plan.keepUserIds],
    alsoDeleteUserIds: [...plan.alsoDeleteUserIds],
    deleteSupabaseAuth: plan.deleteSupabaseAuth,
    deleteUsers: stamps(plan.users),
    deleteOrders: stamps(plan.orderRequests),
    deleteLegacyOrders: stamps(plan.legacyOrders),
    deleteDeals: stamps(plan.deals),
    deleteChildren: children,
    deleteStripe: stamps(plan.stripeRecords),
    deleteEstimates: stamps(plan.estimates),
    unlinks: [...plan.unlinks].sort((a, b) => a.table.localeCompare(b.table) || a.field.localeCompare(b.field) || a.id - b.id),
    supabaseAuthIds: plan.deleteSupabaseAuth ? authIds : [],
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort((a, b) => a[0].localeCompare(b[0]));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashSnapshot(snapshot: CanonicalSnapshot): string {
  return createHash("sha256").update(stableJson(snapshot)).digest("hex");
}

export function evaluateConfirm(
  stored: CanonicalSnapshot,
  recomputed: CanonicalSnapshot,
): { ok: true } | { ok: false; code: "SNAPSHOT_MISMATCH" } {
  if (hashSnapshot(stored) !== hashSnapshot(recomputed)) return { ok: false, code: "SNAPSHOT_MISMATCH" };
  return { ok: true };
}

export function assertSnapshotMatch(stored: CanonicalSnapshot, recomputed: CanonicalSnapshot): void {
  const result = evaluateConfirm(stored, recomputed);
  if (!result.ok) throw new SnapshotMismatchError();
}
