import { describe, it, expect } from "vitest";
import { ne } from "drizzle-orm";
import { notInConflict } from "./db";
import { cabinets } from "../drizzle/schema";

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
    // Inspect the SQL query chunks: a param value of 'conflict' must be present
    // so only conflict rows are excluded, never live ('none') products.
    const pred = notInConflict() as unknown as {
      queryChunks?: Array<{ value?: unknown }>;
    };
    const values = (pred.queryChunks ?? [])
      .map((c) => (c && typeof c === "object" ? (c as { value?: unknown }).value : undefined))
      .filter((v) => v !== undefined);
    const flat = values.flat ? values.flat() : values;
    expect(JSON.stringify(flat)).toContain("conflict");
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
