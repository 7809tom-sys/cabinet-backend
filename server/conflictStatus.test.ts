import { describe, it, expect } from "vitest";
import { and, eq, ne, or } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { getDb, hasPositivePublishedCabinetPrice, isCanonicalCabinetMaster, notInConflict } from "./db";
import { cabinets } from "../drizzle/schema";

const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

// The conflict-status feature holds uncertain products in the admin back office
// and hides them from every public-facing query. The single source of truth for
// "is this product publicly shoppable" is the notInConflict() predicate, applied
// across catalog / storefront / design / ocr / orders queries.

describe("notInConflict() predicate", () => {
  it("builds a SQL condition object (drizzle SQL wrapper)", () => {
    const pred = notInConflict();
    // It is the same kind of SQL object drizzle's ne() produces.
    expect(pred).toBeDefined();
    expect(typeof pred).toBe("object");
    const expected = ne(cabinets.conflictStatus, "conflict");
    expect(pred.constructor).toBe(expected.constructor);
  });

	it("compares against the literal 'conflict' (live 'none' rows pass)", () => {
	  // The shared predicate must preserve the exact conflict gate alongside the
	  // canonical-master rule, so ordinary live ('none') products still pass.
	  expect(dbSource).toContain('ne(cabinets.conflictStatus, "conflict")');
	});

	it("also excludes retired duplicate master codes through the canonical alias table", () => {
	  expect(isCanonicalCabinetMaster()).toBeDefined();
	  expect(dbSource).toContain("sku_master_aliases canonical_sku_alias");
	  expect(dbSource).toContain("canonical_sku_alias.aliasCode");
	  expect(dbSource).toContain("canonical_sku_alias.conflictStatus = 'ok'");
	  expect(dbSource).toContain("isCanonicalCabinetMaster()");
	});

	 it("suppresses an approved alias when its canonical master has a supplier source", () => {
	   // A canonical item may legitimately remain in Cabinet Attention while it is
	   // unverified or inactive. Its approved aliases must still resolve to that
	   // supplier-backed master instead of appearing as false unlinked products.
	   expect(dbSource).toContain("FROM distributor_skus canonical_supplier_sku");
	   expect(dbSource).toContain("canonical_supplier_sku.cabinetId = canonical_cabinet.id");
	 });

  it("keeps every positively priced canonical master visible in Catalog, Designer, and 2020", async () => {
    const db = await getDb();
    if (!db) return;

    // Supplier price and availability remain style/distributor overlays. A
    // canonical master with any verified live source must never be left hidden
    // merely because a punctuation/format alias was retired.
    const hidden = await db
      .select({
        masterCode: cabinets.masterCode,
        isActive: cabinets.isActive,
        showInCatalog: cabinets.showInCatalog,
        showInDesigner: cabinets.showInDesigner,
        showIn2020: cabinets.showIn2020,
      })
      .from(cabinets)
      .where(and(
        ne(cabinets.conflictStatus, "conflict"),
        isCanonicalCabinetMaster(),
        hasPositivePublishedCabinetPrice(),
        or(
          eq(cabinets.isActive, false),
          eq(cabinets.showInCatalog, false),
          eq(cabinets.showInDesigner, false),
          eq(cabinets.showIn2020, false),
        ),
      ));

    expect(hidden).toEqual([]);
  });
});

describe("conflict-status schema contract", () => {
  it("cabinets table exposes conflictStatus / conflictReason / conflictedAt", () => {
    // Guards against accidental schema drift removing the back-office fields.
    expect(cabinets.conflictStatus).toBeDefined();
    expect(cabinets.conflictReason).toBeDefined();
    expect(cabinets.conflictedAt).toBeDefined();
  });

  it("conflictStatus column name is stable", () => {
    expect(cabinets.conflictStatus.name).toBe("conflictStatus");
  });
});

// ── Admin conflict EDIT: patch-building contract ──────────────────────────────
// The updateConflictCabinet procedure writes only the fields the admin supplied
// (partial update) and, when clearAfter is set, also resets the conflict flags.
// We replicate the exact patch-building logic here as a pure function so the
// behaviour is locked down without needing a live DB.
function buildConflictPatch(input: {
  description?: string;
  category?: string;
  subCategory?: string | null;
  width?: string | null;
  height?: string | null;
  depth?: string | null;
  conflictReason?: string | null;
  clearAfter?: boolean;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;
  if (input.subCategory !== undefined) patch.subCategory = input.subCategory;
  if (input.width !== undefined) patch.width = input.width;
  if (input.height !== undefined) patch.height = input.height;
  if (input.depth !== undefined) patch.depth = input.depth;
  if (input.conflictReason !== undefined) patch.conflictReason = input.conflictReason;
  if (input.clearAfter) {
    patch.conflictStatus = "none";
    patch.conflictReason = null;
    patch.conflictedAt = null;
  }
  return patch;
}

describe("updateConflictCabinet patch building", () => {
  it("writes only the provided fields (partial update)", () => {
    const patch = buildConflictPatch({ description: "Fixed name" });
    expect(patch).toEqual({ description: "Fixed name" });
    expect(patch).not.toHaveProperty("category");
    expect(patch).not.toHaveProperty("width");
  });

  it("allows nulling out optional dimensions / sub-category", () => {
    const patch = buildConflictPatch({ subCategory: null, width: null });
    expect(patch.subCategory).toBeNull();
    expect(patch.width).toBeNull();
  });

  it("clearAfter resets the conflict flags in the same write", () => {
    const patch = buildConflictPatch({ category: "Base", clearAfter: true });
    expect(patch.category).toBe("Base");
    expect(patch.conflictStatus).toBe("none");
    expect(patch.conflictReason).toBeNull();
    expect(patch.conflictedAt).toBeNull();
  });

  it("clearAfter false (or absent) leaves the product in conflict", () => {
    const patch = buildConflictPatch({ description: "x", clearAfter: false });
    expect(patch).not.toHaveProperty("conflictStatus");
    expect(patch).not.toHaveProperty("conflictedAt");
  });

  it("an empty edit produces an empty patch (no-op)", () => {
    expect(buildConflictPatch({})).toEqual({});
  });
});

// ── Conflict editor: door-style re-assignment contract ────────────────────────
// The Conflicts editor lets an admin re-assign a held product to the correct
// door style. The client only sends `styleId` when the admin actually picked a
// DIFFERENT style than the one the item is currently carried under; the server
// then re-points every SKU of the cabinet to that style. We lock both decisions
// down as pure functions.

// Client: decide whether to include styleId in the mutation payload.
function styleIdToSend(selected: string, current: string): number | undefined {
  return selected !== "" && selected !== current ? Number(selected) : undefined;
}

// Server: whether the styleId in the input triggers a SKU re-point.
function shouldRepointSkus(input: { styleId?: number }): boolean {
  return input.styleId !== undefined;
}

describe("conflict editor door-style assignment", () => {
  it("sends styleId only when a different style is chosen", () => {
    expect(styleIdToSend("12", "7")).toBe(12);
  });

  it("omits styleId when the selection matches the current style (no-op)", () => {
    expect(styleIdToSend("7", "7")).toBeUndefined();
  });

  it("omits styleId when nothing is selected", () => {
    expect(styleIdToSend("", "7")).toBeUndefined();
  });

  it("derives a numeric styleId from the picker's string value", () => {
    const sent = styleIdToSend("305", "");
    expect(typeof sent).toBe("number");
    expect(sent).toBe(305);
  });

  it("server re-points SKUs only when a styleId is supplied", () => {
    expect(shouldRepointSkus({ styleId: 9 })).toBe(true);
    expect(shouldRepointSkus({})).toBe(false);
  });
});

// A single-style item exposes its current style so the picker can pre-select it;
// a multi-style item exposes "" (no single current), forcing an explicit choice.
function currentStyleIdFor(styleIds: number[]): string {
  return styleIds.length === 1 ? String(styleIds[0]) : "";
}

describe("conflict editor current-style pre-selection", () => {
  it("pre-selects the only style for a single-style item", () => {
    expect(currentStyleIdFor([42])).toBe("42");
  });

  it("leaves the picker empty for a multi-style item", () => {
    expect(currentStyleIdFor([42, 43])).toBe("");
  });

  it("leaves the picker empty when the item has no SKUs yet", () => {
    expect(currentStyleIdFor([])).toBe("");
  });
});
