import type { Express, Request, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { vendorInventoryApiKeys } from "../drizzle/schema";
import { getDb } from "./db";
import { parseVendorScope } from "../shared/vendorFulfillment";
import { parseInventoryCsv, takeRateLimit, type RateBucket } from "../shared/inventorySync";
import { hashInventoryApiKey } from "./lib/vendorInventoryApiKey";
import { applyInventorySync } from "./routers/vendorInventory";

const buckets = new Map<string, RateBucket>();

/**
 * Vendor-scoped inventory sync. Bearer token is shown once at creation and
 * stored only as a sha256 hash. JSON body `{ rows: [...] }` or `{ csv: "..." }`.
 * Same validation as the portal upload: unknown SKUs are reported, not created.
 */
export function registerVendorInventorySync(app: Express) {
  app.post("/api/vendor-inventory/sync", async (req: Request, res: Response) => {
    const header = req.header("authorization") ?? "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Missing bearer token." });
    const hash = hashInventoryApiKey(token);
    if (!takeRateLimit(buckets, hash, Date.now())) {
      return res.status(429).json({ error: "Too many inventory syncs. Try again in a minute." });
    }
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Database not available." });
    const [key] = await db.select().from(vendorInventoryApiKeys).where(and(eq(vendorInventoryApiKeys.keyHash, hash), isNull(vendorInventoryApiKeys.revokedAt))).limit(1);
    if (!key) return res.status(401).json({ error: "Unknown or revoked key." });
    const scope = parseVendorScope(key.vendorScope);
    if (!scope) return res.status(403).json({ error: "Key is not scoped to a vendor." });
    const body = req.body ?? {};
    const parsed = typeof body.csv === "string"
      ? parseInventoryCsv(body.csv)
      : { rows: Array.isArray(body.rows) ? body.rows.map((row: Record<string, unknown>, index: number) => ({
          row: index + 1,
          sku: String(row.sku ?? ""),
          quantityOnHand: row.quantityOnHand == null ? null : Number(row.quantityOnHand),
          leadTimeDays: row.leadTimeDays == null ? null : Number(row.leadTimeDays),
          notes: row.notes == null ? null : String(row.notes),
          discontinued: row.discontinued == null ? null : Boolean(row.discontinued),
          backorder: row.backorder == null ? null : Boolean(row.backorder),
          minimumOrderQty: row.minimumOrderQty == null ? null : Number(row.minimumOrderQty),
          restockDate: row.restockDate == null ? null : String(row.restockDate),
          outOfStock: row.outOfStock == null ? null : Boolean(row.outOfStock),
        })) : [], issues: [] as { message: string }[] };
    if (!parsed.rows.length && parsed.issues.length) return res.status(400).json({ issues: parsed.issues });
    const result = await applyInventorySync(scope, parsed.rows, "api");
    await db.update(vendorInventoryApiKeys).set({ lastUsedAt: new Date() }).where(eq(vendorInventoryApiKeys.id, key.id));
    return res.json({
      applied: result.applicable.length,
      unknown: result.unknown,
      issues: parsed.issues,
    });
  });
}
