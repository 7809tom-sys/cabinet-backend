import { and, eq } from "drizzle-orm";
import { distributors, distributorSkus, vendorLines } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * U.S. Cabinet Depot's approved vendor profile (`vendor_lines`) administers
 * catalog lines (`distributors`) through `sourceKey` plus `linkedDistributorIds`.
 * AEF and Madison are those catalog lines. Madison is the owner's name for the
 * framed Madison line; frameless cabinets already live on distributor code AEF
 * ("US Cabinet Depot Frameless") when that row exists.
 *
 * This runs on process start so a deploy links the rows without a manual write.
 * It only inserts a missing AEF or Madison distributor, and it only updates the
 * U.S. Cabinet Depot vendor row. Other vendors are left untouched.
 */

const OFFICIAL_VENDOR_RANK = [
  "us cabinet depot",
  "u.s. cabinet depot",
  "u.s. cabinet depot (uscd)",
] as const;

const USCD_CODES = new Set(["USCD", "UCD"]);
const MADISON_CODES = new Set(["MADISON", "MAD"]);

export type CatalogLineRecord = {
  id: number;
  code: string;
  name: string;
  brandName: string | null;
  isActive: boolean;
  costMultiplier?: string | null;
  baseMultiplier?: string | null;
  freightMultiplier?: string | null;
  tariffRate?: string | null;
  shippingRate?: string | null;
  retailPriceBasis?: "cost_plus_tier" | "source_list" | null;
};

export type VendorLineRecord = {
  id: number;
  name: string;
  sourceKey: string | null;
  linkedDistributorIds: unknown;
  isApproved: boolean;
};

export type PlannedCatalogLine = {
  role: "AEF" | "Madison";
  action: "link" | "create";
  distributorId: number | null;
  code: string;
  name: string;
  brandName: string | null;
  mapping: string | null;
};

export type UsCabinetDepotLinePlan = {
  blocked: string | null;
  vendorId: number | null;
  vendorName: string;
  createVendor: boolean;
  /** Written only when the vendor has no source key. An existing key is kept. */
  sourceKeyToSet: string | null;
  lines: PlannedCatalogLine[];
  /** Known distributor ids to store. Created lines are added after insert. */
  linkedDistributorIds: number[];
  notes: string[];
};

export type UsCabinetDepotLineResult = {
  applied: boolean;
  skipped: string | null;
  vendorId: number | null;
  vendorName: string | null;
  vendorCreated: boolean;
  createdDistributorCodes: string[];
  linkedDistributorIds: number[];
  mappings: string[];
  notes: string[];
};

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function codeOf(line: CatalogLineRecord): string {
  return line.code.trim().toUpperCase();
}

export function normalizeDistributorIdList(value: unknown): number[] {
  const source = typeof value === "string" ? safeJson(value) : value;
  if (!Array.isArray(source)) return [];
  const ids = new Set<number>();
  for (const entry of source) {
    const id = typeof entry === "number" ? entry : Number(entry);
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  return Array.from(ids).sort((left, right) => left - right);
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sameIds(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}

function lineLabel(line: CatalogLineRecord): string {
  const brand = line.brandName?.trim();
  return brand && normalizeName(brand) !== normalizeName(line.name)
    ? `${codeOf(line)} “${line.name}” (brand “${brand}”)`
    : `${codeOf(line)} “${line.name}”`;
}

function chooseVendor(vendors: readonly VendorLineRecord[]): { vendor: VendorLineRecord | null; note: string | null } {
  const official = vendors
    .map((vendor) => ({ vendor, rank: OFFICIAL_VENDOR_RANK.indexOf(normalizeName(vendor.name) as (typeof OFFICIAL_VENDOR_RANK)[number]) }))
    .filter((entry) => entry.rank >= 0)
    .sort((left, right) => {
      if (left.vendor.isApproved !== right.vendor.isApproved) return left.vendor.isApproved ? -1 : 1;
      if (left.rank !== right.rank) return left.rank - right.rank;
      return left.vendor.id - right.vendor.id;
    });
  if (official.length === 0) return { vendor: null, note: null };
  const chosen = official[0]!.vendor;
  const note = official.length > 1
    ? `Linked catalog lines were added only to vendor “${chosen.name}” (id ${chosen.id}). Other U.S. Cabinet Depot-named vendor rows were left unchanged.`
    : null;
  return { vendor: chosen, note };
}

function findMadison(lines: readonly CatalogLineRecord[], notes: string[]): PlannedCatalogLine | { ambiguous: string } {
  const byMadisonCode = lines.filter((line) => MADISON_CODES.has(codeOf(line)));
  const madisonCode = byMadisonCode.find((line) => codeOf(line) === "MADISON") ?? byMadisonCode[0] ?? null;
  if (madisonCode) {
    return {
      role: "Madison",
      action: "link",
      distributorId: madisonCode.id,
      code: codeOf(madisonCode),
      name: madisonCode.name,
      brandName: madisonCode.brandName,
      mapping: codeOf(madisonCode) === "MADISON" && normalizeName(madisonCode.name) === "madison"
        ? null
        : `Madison maps to the existing distributor ${lineLabel(madisonCode)}. No duplicate Madison distributor was created.`,
    };
  }

  const uscd = lines.find((line) => codeOf(line) === "USCD") ?? null;
  const ucd = lines.find((line) => codeOf(line) === "UCD") ?? null;
  const framed = uscd ?? ucd;
  if (framed) {
    if (uscd && ucd) {
      notes.push(`Legacy distributor ${lineLabel(ucd)} was left unchanged. Madison uses the live ${lineLabel(uscd)} row.`);
    }
    const namedMadison = normalizeName(framed.name) === "madison" || normalizeName(framed.brandName) === "madison";
    return {
      role: "Madison",
      action: "link",
      distributorId: framed.id,
      code: codeOf(framed),
      name: framed.name,
      brandName: framed.brandName,
      mapping: namedMadison
        ? `Madison is the existing ${lineLabel(framed)} distributor. That is the owner’s name for this framed line, so no second Madison distributor was created.`
        : `Madison maps to the existing ${lineLabel(framed)} distributor, the U.S. Cabinet Depot framed line. No duplicate Madison distributor was created.`,
    };
  }

  const named = lines.filter((line) => codeOf(line) !== "AEF" && (normalizeName(line.name) === "madison" || normalizeName(line.brandName) === "madison"));
  if (named.length > 1) {
    return { ambiguous: `More than one distributor is named Madison (${named.map(lineLabel).join("; ")}). No Madison row was created or linked.` };
  }
  if (named.length === 1) {
    const line = named[0]!;
    return {
      role: "Madison",
      action: "link",
      distributorId: line.id,
      code: codeOf(line),
      name: line.name,
      brandName: line.brandName,
      mapping: `Madison maps to the existing distributor ${lineLabel(line)}. No duplicate Madison distributor was created.`,
    };
  }

  return {
    role: "Madison",
    action: "create",
    distributorId: null,
    code: "MADISON",
    name: "Madison",
    brandName: "Madison",
    mapping: null,
  };
}

function isUsCabinetDepotFrameless(line: CatalogLineRecord): boolean {
  if (codeOf(line) === "AEF") return true;
  const text = `${line.name} ${line.brandName ?? ""}`.toLowerCase();
  const frameless = text.includes("frameless");
  const cabinetDepot = text.includes("cabinet depot") || text.includes("uscd") || text.includes("altaeuro") || text.includes("alta euro");
  return frameless && cabinetDepot;
}

function findAef(
  lines: readonly CatalogLineRecord[],
  madison: PlannedCatalogLine | null,
  framelessDistributorIds: readonly number[],
): PlannedCatalogLine | { ambiguous: string } {
  const byCode = lines.find((line) => codeOf(line) === "AEF") ?? null;
  if (byCode) {
    const knownName = normalizeName(byCode.name) === "aef";
    return {
      role: "AEF",
      action: "link",
      distributorId: byCode.id,
      code: "AEF",
      name: byCode.name,
      brandName: byCode.brandName,
      mapping: knownName
        ? null
        : `AEF is the existing distributor ${lineLabel(byCode)}. No duplicate AEF distributor was created.`,
    };
  }

  const standIns = lines.filter((line) => codeOf(line) !== "AEF" && isUsCabinetDepotFrameless(line));
  const activeStandIns = standIns.filter((line) => line.isActive);
  const pool = activeStandIns.length > 0 ? activeStandIns : standIns;
  if (pool.length > 1) {
    return { ambiguous: `More than one USCD frameless distributor exists (${pool.map(lineLabel).join("; ")}). No AEF row was created.` };
  }
  if (pool.length === 1) {
    const line = pool[0]!;
    return {
      role: "AEF",
      action: "link",
      distributorId: line.id,
      code: codeOf(line),
      name: line.name,
      brandName: line.brandName,
      mapping: `AEF maps to the existing USCD frameless distributor ${lineLabel(line)}. No duplicate AEF distributor was created.`,
    };
  }

  if (madison?.distributorId != null && framelessDistributorIds.includes(madison.distributorId)) {
    return {
      role: "AEF",
      action: "link",
      distributorId: madison.distributorId,
      code: madison.code,
      name: madison.name,
      brandName: madison.brandName,
      mapping: `AEF maps to ${madison.code} “${madison.name}” because that distributor already holds USCD frameless cabinets. No separate AEF distributor was created.`,
    };
  }

  return {
    role: "AEF",
    action: "create",
    distributorId: null,
    code: "AEF",
    name: "AEF",
    brandName: "AEF",
    mapping: null,
  };
}

export function planUsCabinetDepotProductLines(input: {
  distributors: readonly CatalogLineRecord[];
  vendors: readonly VendorLineRecord[];
  framelessDistributorIds?: readonly number[];
}): UsCabinetDepotLinePlan {
  const notes: string[] = [];
  const { vendor, note } = chooseVendor(input.vendors);
  if (note) notes.push(note);
  if (vendor && !vendor.isApproved) {
    notes.push(`Vendor “${vendor.name}” is not approved. Catalog lines were linked, and sign-in stays disabled until an administrator approves it.`);
  }

  const madisonResult = findMadison(input.distributors, notes);
  if ("ambiguous" in madisonResult) {
    return {
      blocked: madisonResult.ambiguous,
      vendorId: vendor?.id ?? null,
      vendorName: vendor?.name ?? "US Cabinet Depot",
      createVendor: !vendor,
      sourceKeyToSet: null,
      lines: [],
      linkedDistributorIds: [],
      notes,
    };
  }

  const aef = findAef(input.distributors, madisonResult, input.framelessDistributorIds ?? []);
  if ("ambiguous" in aef) {
    return {
      blocked: aef.ambiguous,
      vendorId: vendor?.id ?? null,
      vendorName: vendor?.name ?? "US Cabinet Depot",
      createVendor: !vendor,
      sourceKeyToSet: null,
      lines: [],
      linkedDistributorIds: [],
      notes,
    };
  }

  const lines = [aef, madisonResult];
  for (const line of lines) {
    if (line.mapping) notes.push(line.mapping);
    if (line.action === "link" && line.distributorId != null) {
      const record = input.distributors.find((candidate) => candidate.id === line.distributorId);
      if (record && !record.isActive) {
        notes.push(`${line.role} distributor ${line.code} is inactive, so the vendor page hides it until that distributor is activated.`);
      }
    }
  }
  if (aef.distributorId != null && aef.distributorId === madisonResult.distributorId) {
    notes.push("AEF and Madison currently share one distributor record. Split them only if the owner wants a separate AEF catalog line.");
  }

  const preserved = vendor ? normalizeDistributorIdList(vendor.linkedDistributorIds) : [];
  const linked = new Set<number>(preserved);
  for (const line of lines) {
    if (line.distributorId != null) linked.add(line.distributorId);
  }
  const sourceKey = vendor?.sourceKey?.trim() ?? "";
  const primaryId = aef.distributorId ?? madisonResult.distributorId;
  const sourceKeyToSet = vendor && !sourceKey && primaryId != null ? `dist:${primaryId}` : null;
  if (vendor && sourceKey) {
    notes.push("The vendor’s existing source key was left unchanged.");
  }

  return {
    blocked: null,
    vendorId: vendor?.id ?? null,
    vendorName: vendor?.name ?? "US Cabinet Depot",
    createVendor: !vendor,
    sourceKeyToSet,
    lines,
    linkedDistributorIds: Array.from(linked).sort((left, right) => left - right),
    notes,
  };
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function multiplierSeed(lines: readonly CatalogLineRecord[]) {
  const sibling = lines.find((line) => ["USCD", "UCD", "AEF", "MADISON", "MAD"].includes(codeOf(line)) && line.costMultiplier);
  if (sibling?.costMultiplier) {
    return {
      costMultiplier: sibling.costMultiplier,
      baseMultiplier: sibling.baseMultiplier || sibling.costMultiplier,
      freightMultiplier: sibling.freightMultiplier || "0.0000",
      tariffRate: sibling.tariffRate || "0.0000",
      shippingRate: sibling.shippingRate || "0.0000",
      retailPriceBasis: sibling.retailPriceBasis || "cost_plus_tier",
    } as const;
  }
  return {
    costMultiplier: "0.3000",
    baseMultiplier: "0.3000",
    freightMultiplier: "0.0000",
    tariffRate: "0.0000",
    shippingRate: "0.0000",
    retailPriceBasis: "cost_plus_tier" as const,
  };
}

async function insertDistributor(db: Db, line: PlannedCatalogLine, seed: ReturnType<typeof multiplierSeed>): Promise<number> {
  const initials = line.code.slice(0, 8);
  try {
    await db.insert(distributors).values({
      code: line.code,
      name: line.name,
      initials,
      brandName: line.brandName,
      whiteLabel: true,
      displayMode: "neutral",
      isActive: true,
      glassIncluded: false,
      ...seed,
    });
  } catch (error) {
    const errno = (error as { errno?: number; cause?: { errno?: number } }).errno
      ?? (error as { cause?: { errno?: number } }).cause?.errno;
    if (errno !== 1062) throw error;
  }
  const [created] = await db.select({ id: distributors.id }).from(distributors).where(eq(distributors.code, line.code)).limit(1);
  if (!created) throw new Error(`Distributor ${line.code} was not created.`);
  return created.id;
}

/**
 * Idempotently link AEF and Madison to the U.S. Cabinet Depot vendor record.
 * Safe to run on every deploy. Does not write when the database is unavailable.
 */
export async function ensureUsCabinetDepotProductLines(): Promise<UsCabinetDepotLineResult> {
  const db = await getDb();
  if (!db) {
    return {
      applied: false,
      skipped: "Database unavailable",
      vendorId: null,
      vendorName: null,
      vendorCreated: false,
      createdDistributorCodes: [],
      linkedDistributorIds: [],
      mappings: [],
      notes: [],
    };
  }

  const [distributorRows, vendorRows, framelessRows] = await Promise.all([
    db.select({
      id: distributors.id,
      code: distributors.code,
      name: distributors.name,
      brandName: distributors.brandName,
      isActive: distributors.isActive,
      costMultiplier: distributors.costMultiplier,
      baseMultiplier: distributors.baseMultiplier,
      freightMultiplier: distributors.freightMultiplier,
      tariffRate: distributors.tariffRate,
      shippingRate: distributors.shippingRate,
      retailPriceBasis: distributors.retailPriceBasis,
    }).from(distributors),
    db.select({
      id: vendorLines.id,
      name: vendorLines.name,
      sourceKey: vendorLines.sourceKey,
      linkedDistributorIds: vendorLines.linkedDistributorIds,
      isApproved: vendorLines.isApproved,
    }).from(vendorLines),
    db.selectDistinct({ distributorId: distributorSkus.distributorId })
      .from(distributorSkus)
      .where(eq(distributorSkus.constructionType, "frameless")),
  ]);

  const plan = planUsCabinetDepotProductLines({
    distributors: distributorRows,
    vendors: vendorRows,
    framelessDistributorIds: framelessRows.map((row) => row.distributorId),
  });
  if (plan.blocked) {
    return {
      applied: false,
      skipped: plan.blocked,
      vendorId: plan.vendorId,
      vendorName: plan.vendorName,
      vendorCreated: false,
      createdDistributorCodes: [],
      linkedDistributorIds: [],
      mappings: [],
      notes: plan.notes,
    };
  }

  const createdDistributorCodes: string[] = [];
  const createdIds = new Map<"AEF" | "Madison", number>();
  const linked = new Set(plan.linkedDistributorIds);
  const seed = multiplierSeed(distributorRows);
  for (const line of plan.lines) {
    if (line.action === "link" && line.distributorId != null) {
      linked.add(line.distributorId);
      continue;
    }
    if (line.action !== "create") continue;
    const id = await insertDistributor(db, line, seed);
    linked.add(id);
    createdIds.set(line.role, id);
    createdDistributorCodes.push(line.code);
  }

  const idFor = (role: "AEF" | "Madison") =>
    createdIds.get(role) ?? plan.lines.find((line) => line.role === role)?.distributorId ?? null;
  const linkedDistributorIds = Array.from(linked).sort((left, right) => left - right);
  const activeSourceId = (id: number | null) => {
    if (id == null) return false;
    if (Array.from(createdIds.values()).includes(id)) return true;
    return distributorRows.find((line) => line.id === id)?.isActive !== false;
  };
  const preferredSourceId = [idFor("AEF"), idFor("Madison")].find((id) => activeSourceId(id ?? null)) ?? null;
  const existing = plan.vendorId == null ? undefined : vendorRows.find((vendor) => vendor.id === plan.vendorId);
  const sourceKey = !existing?.sourceKey?.trim() && preferredSourceId != null ? `dist:${preferredSourceId}` : null;

  let vendorId = plan.vendorId;
  let vendorCreated = false;
  if (plan.createVendor) {
    try {
      await db.insert(vendorLines).values({
        name: plan.vendorName,
        sourceKey,
        linkedDistributorIds,
        category: "Cabinets",
        isApproved: true,
      });
      vendorCreated = true;
    } catch (error) {
      const errno = (error as { errno?: number; cause?: { errno?: number } }).errno
        ?? (error as { cause?: { errno?: number } }).cause?.errno;
      if (errno !== 1062) throw error;
    }
    const [vendor] = await db
      .select({ id: vendorLines.id, sourceKey: vendorLines.sourceKey })
      .from(vendorLines)
      .where(eq(vendorLines.name, plan.vendorName))
      .limit(1);
    if (!vendor) throw new Error("U.S. Cabinet Depot vendor record was not created.");
    vendorId = vendor.id;
    if (!vendorCreated) {
      await db.update(vendorLines).set({
        linkedDistributorIds,
        ...(vendor.sourceKey?.trim() || !sourceKey ? {} : { sourceKey }),
      }).where(and(eq(vendorLines.id, vendor.id), eq(vendorLines.name, plan.vendorName)));
    }
  } else if (vendorId != null) {
    const existingIds = normalizeDistributorIdList(existing?.linkedDistributorIds);
    const patch: { linkedDistributorIds?: number[]; sourceKey?: string } = {};
    if (!sameIds(existingIds, linkedDistributorIds)) patch.linkedDistributorIds = linkedDistributorIds;
    if (sourceKey) patch.sourceKey = sourceKey;
    if (Object.keys(patch).length > 0) {
      await db.update(vendorLines).set(patch).where(and(eq(vendorLines.id, vendorId), eq(vendorLines.name, plan.vendorName)));
    }
  }

  return {
    applied: true,
    skipped: null,
    vendorId,
    vendorName: plan.vendorName,
    vendorCreated,
    createdDistributorCodes,
    linkedDistributorIds,
    mappings: plan.lines.map((line) => line.mapping).filter((mapping): mapping is string => Boolean(mapping)),
    notes: plan.notes,
  };
}
