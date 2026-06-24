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
