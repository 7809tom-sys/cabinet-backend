import { describe, it, expect } from "vitest";
import { parsePriceAuditQuery } from "./priceAuditLookup";

describe("parsePriceAuditQuery", () => {
  it("returns null for empty / whitespace input", () => {
    expect(parsePriceAuditQuery("")).toBeNull();
    expect(parsePriceAuditQuery("   ")).toBeNull();
  });

  it("treats a bare integer as a queue-number (id) lookup", () => {
    expect(parsePriceAuditQuery("123")).toEqual({ kind: "id", id: 123 });
    expect(parsePriceAuditQuery("1")).toEqual({ kind: "id", id: 1 });
  });

  it("treats a #-prefixed integer as a queue-number (id) lookup", () => {
    expect(parsePriceAuditQuery("#123")).toEqual({ kind: "id", id: 123 });
    expect(parsePriceAuditQuery("  #7  ")).toEqual({ kind: "id", id: 7 });
  });

  it("treats a model / master code as a code lookup (uppercased)", () => {
    expect(parsePriceAuditQuery("b24")).toEqual({ kind: "code", code: "B24" });
    expect(parsePriceAuditQuery("DB-24-3")).toEqual({ kind: "code", code: "DB-24-3" });
    expect(parsePriceAuditQuery(" sb36 ")).toEqual({ kind: "code", code: "SB36" });
  });

  it("does not treat alphanumeric codes as ids even if they start with digits", () => {
    expect(parsePriceAuditQuery("24B")).toEqual({ kind: "code", code: "24B" });
    expect(parsePriceAuditQuery("3DW")).toEqual({ kind: "code", code: "3DW" });
  });

  it("rejects zero / negative as id and falls back to code", () => {
    expect(parsePriceAuditQuery("0")).toEqual({ kind: "code", code: "0" });
  });
});
