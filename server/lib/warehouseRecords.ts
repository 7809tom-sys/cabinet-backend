/**
 * Warehouse open/closed records (docs/sql/0287_warehouses_open_closed.tidb.sql).
 *
 * Until Tom runs that file, the table is missing. Every read here then reports
 * no closed ZIPs, so origin selection keeps today's behavior. Writes tell the
 * admin to run the migration instead of failing the rest of the request.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { distributors, doorStyles, warehouses } from "../../drizzle/schema";
import type { getDb } from "../db";
import { isMissingSchemaError } from "./orderCostSnapshot";
import {
  WAREHOUSES_MIGRATION_FILE,
  normalizeOriginZip,
  warehouseRowIsClosed,
} from "@shared/warehouseOpen";

const MISSING_RECHECK_MS = 60_000;

type ProbeCache = { available: boolean; checkedAt: number };
let probeCache: ProbeCache | null = null;

export function resetWarehouseTableProbeCache(): void {
  probeCache = null;
}

export class WarehouseMigrationError extends Error {
  constructor() {
    super(`Warehouse open/closed is not installed yet. Run docs/sql/${WAREHOUSES_MIGRATION_FILE} in the TiDB SQL editor, one block at a time.`);
    this.name = "WarehouseMigrationError";
  }
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function firstRow(result: unknown): Record<string, unknown> | null {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  const first = Array.isArray(rows) ? rows[0] : null;
  return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
}

export async function warehousesTableAvailable(db: Pick<Database, "execute"> | { execute?: undefined }, now: number = Date.now()): Promise<boolean> {
  if (probeCache?.available) return true;
  if (probeCache && now - probeCache.checkedAt < MISSING_RECHECK_MS) return false;
  if (typeof db.execute !== "function") return true;
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) AS tableCount
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'warehouses'
    `);
    const row = firstRow(result);
    const value = row?.tableCount ?? (row ? Object.values(row)[0] : 0);
    const available = Number(value) >= 1;
    probeCache = { available, checkedAt: now };
    return available;
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.warn("[warehouses] table probe failed; treating every warehouse as open", error);
    }
    probeCache = { available: false, checkedAt: now };
    return false;
  }
}

export type ClosedZipsByDistributor = Map<number, Set<string>>;

/**
 * Closed ZIP set per distributor. An empty map means nothing is closed,
 * including when 0287 has not been run.
 */
export async function closedWarehouseZipsByDistributor(
  db: Database,
  distributorIds: readonly number[],
): Promise<ClosedZipsByDistributor> {
  const ids = Array.from(new Set(distributorIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return new Map();
  const available = await warehousesTableAvailable(db);
  if (!available) return new Map();
  try {
    const rows: Array<{ distributorId: number; zip: string; isOpen: unknown }> = await db
      .select({
        distributorId: warehouses.distributorId,
        zip: warehouses.zip,
        isOpen: warehouses.isOpen,
      })
      .from(warehouses)
      .where(inArray(warehouses.distributorId, ids));
    const closed: ClosedZipsByDistributor = new Map();
    for (const row of rows) {
      if (!warehouseRowIsClosed(row.isOpen)) continue;
      const zip = normalizeOriginZip(row.zip);
      if (!zip) continue;
      const set = closed.get(row.distributorId) ?? new Set<string>();
      set.add(zip);
      closed.set(row.distributorId, set);
    }
    return closed;
  } catch (error) {
    if (isMissingSchemaError(error)) {
      probeCache = { available: false, checkedAt: Date.now() };
      return new Map();
    }
    throw error;
  }
}

export type WarehouseAdminRow = {
  id: number | null;
  distributorId: number;
  distributorCode: string | null;
  distributorName: string | null;
  zip: string;
  name: string;
  address: string | null;
  isOpen: boolean;
  recorded: boolean;
  onOriginList: boolean;
};

type OriginDb = Database;

function distributorLabel(row: { name: string; brandName: string | null }): string {
  return row.brandName?.trim() || row.name;
}

/**
 * Recorded warehouses plus any origin ZIP that does not have a row yet.
 * An unrecorded ZIP is open. A recorded warehouse that is not on an origin
 * list (Woodland Sacramento before it is added) still appears so it can be
 * toggled without becoming selectable.
 */
export async function listWarehousesForAdmin(
  db: OriginDb,
  distributorId?: number,
): Promise<{ available: boolean; migration: string; warehouses: WarehouseAdminRow[] }> {
  const migration = WAREHOUSES_MIGRATION_FILE;
  const available = await warehousesTableAvailable(db);
  if (!available) return { available: false, migration, warehouses: [] };

  const distributorQuery = db
    .select({
      id: distributors.id,
      code: distributors.code,
      name: distributors.name,
      brandName: distributors.brandName,
      warehouseZips: distributors.warehouseZips,
    })
    .from(distributors);
  const distributorRows: Array<{
    id: number;
    code: string;
    name: string;
    brandName: string | null;
    warehouseZips: string[] | null;
  }> = distributorId
    ? await distributorQuery.where(eq(distributors.id, distributorId))
    : await distributorQuery;

  const ids = distributorRows.map((row) => row.id);
  if (ids.length === 0) return { available: true, migration, warehouses: [] };

  let styleRows: Array<{ distributorId: number; warehouseZip: string | null; warehouseZips: string[] | null }> = [];
  let recorded: Array<{
    id: number;
    distributorId: number;
    zip: string;
    name: string;
    address: string | null;
    isOpen: unknown;
  }> = [];
  try {
    styleRows = await db
      .select({
        distributorId: doorStyles.distributorId,
        warehouseZip: doorStyles.warehouseZip,
        warehouseZips: doorStyles.warehouseZips,
      })
      .from(doorStyles)
      .where(inArray(doorStyles.distributorId, ids));
    recorded = await db
      .select({
        id: warehouses.id,
        distributorId: warehouses.distributorId,
        zip: warehouses.zip,
        name: warehouses.name,
        address: warehouses.address,
        isOpen: warehouses.isOpen,
      })
      .from(warehouses)
      .where(inArray(warehouses.distributorId, ids));
  } catch (error) {
    if (isMissingSchemaError(error)) {
      probeCache = { available: false, checkedAt: Date.now() };
      return { available: false, migration, warehouses: [] };
    }
    throw error;
  }

  const origins = new Map<number, Set<string>>();
  const addOrigin = (id: number, raw: string | null | undefined) => {
    const zip = normalizeOriginZip(raw);
    if (!zip) return;
    const set = origins.get(id) ?? new Set<string>();
    set.add(zip);
    origins.set(id, set);
  };
  for (const row of distributorRows) {
    for (const zip of row.warehouseZips ?? []) addOrigin(row.id, zip);
  }
  for (const row of styleRows) {
    addOrigin(row.distributorId, row.warehouseZip);
    for (const zip of row.warehouseZips ?? []) addOrigin(row.distributorId, zip);
  }

  const byDistributor = new Map(distributorRows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const warehousesOut: WarehouseAdminRow[] = [];
  for (const row of recorded) {
    const zip = normalizeOriginZip(row.zip);
    if (!zip) continue;
    const key = `${row.distributorId}:${zip}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const distributor = byDistributor.get(row.distributorId);
    const onOriginList = origins.get(row.distributorId)?.has(zip) ?? false;
    warehousesOut.push({
      id: row.id,
      distributorId: row.distributorId,
      distributorCode: distributor?.code ?? null,
      distributorName: distributor ? distributorLabel(distributor) : null,
      zip,
      name: row.name,
      address: row.address,
      isOpen: !warehouseRowIsClosed(row.isOpen),
      recorded: true,
      onOriginList,
    });
  }
  for (const [id, zips] of Array.from(origins.entries())) {
    const distributor = byDistributor.get(id);
    for (const zip of Array.from(zips)) {
      const key = `${id}:${zip}`;
      if (seen.has(key)) continue;
      seen.add(key);
      warehousesOut.push({
        id: null,
        distributorId: id,
        distributorCode: distributor?.code ?? null,
        distributorName: distributor ? distributorLabel(distributor) : null,
        zip,
        name: `Warehouse ${zip}`,
        address: null,
        isOpen: true,
        recorded: false,
        onOriginList: true,
      });
    }
  }
  warehousesOut.sort((a, b) => a.distributorName?.localeCompare(b.distributorName ?? "") || a.zip.localeCompare(b.zip) || a.name.localeCompare(b.name));
  return { available: true, migration, warehouses: warehousesOut };
}

export async function setWarehouseOpen(
  db: Database,
  input: {
    distributorId: number;
    zip: string;
    isOpen: boolean;
    name?: string;
    address?: string | null;
  },
): Promise<WarehouseAdminRow> {
  const available = await warehousesTableAvailable(db);
  if (!available) throw new WarehouseMigrationError();
  const zip = normalizeOriginZip(input.zip);
  if (!zip) throw new Error("Warehouse ZIP must be exactly 5 digits.");
  const [distributor] = await db
    .select({
      id: distributors.id,
      code: distributors.code,
      name: distributors.name,
      brandName: distributors.brandName,
      warehouseZips: distributors.warehouseZips,
    })
    .from(distributors)
    .where(eq(distributors.id, input.distributorId))
    .limit(1);
  if (!distributor) throw new Error("Supply line not found.");

  let existing: { id: number; name: string; address: string | null } | undefined;
  try {
    const rows = await db
      .select({ id: warehouses.id, name: warehouses.name, address: warehouses.address })
      .from(warehouses)
      .where(and(eq(warehouses.distributorId, input.distributorId), eq(warehouses.zip, zip)))
      .limit(1);
    existing = rows[0];
  } catch (error) {
    if (isMissingSchemaError(error)) {
      probeCache = { available: false, checkedAt: Date.now() };
      throw new WarehouseMigrationError();
    }
    throw error;
  }

  const name = input.name?.trim() || existing?.name || `Warehouse ${zip}`;
  const address = input.address === undefined ? existing?.address ?? null : input.address?.trim() || null;
  if (existing) {
    await db.update(warehouses).set({
      isOpen: input.isOpen,
      name,
      address,
    }).where(eq(warehouses.id, existing.id));
  } else {
    await db.insert(warehouses).values({
      distributorId: input.distributorId,
      zip,
      name,
      address,
      isOpen: input.isOpen,
    });
  }

  const listed = await listWarehousesForAdmin(db, input.distributorId);
  const saved = listed.warehouses.find((row) => row.zip === zip);
  return saved ?? {
    id: existing?.id ?? null,
    distributorId: input.distributorId,
    distributorCode: distributor.code,
    distributorName: distributorLabel(distributor),
    zip,
    name,
    address,
    isOpen: input.isOpen,
    recorded: true,
    onOriginList: false,
  };
}
