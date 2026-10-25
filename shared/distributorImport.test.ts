import { describe, it, expect } from "vitest";
import {
  splitCsvLine,
  parseDistributorCsv,
  parseMoney,
  parseDimension,
  validateImport,
  IMPORT_TEMPLATE_CSV,
} from "./distributorImport";

describe("splitCsvLine", () => {
  it("splits simple cells", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });
  it("handles quoted commas", () => {
    expect(splitCsvLine('B-24,"24"" Double, Door",Base')).toEqual([
      "B-24",
      '24" Double, Door',
      "Base",
    ]);
  });
});

describe("parseMoney / parseDimension", () => {
  it("strips $ and commas", () => {
    expect(parseMoney("$1,310.00")).toBe(1310);
  });
  it("returns null for blank", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });
  it("returns NaN for garbage", () => {
    expect(Number.isNaN(parseMoney("abc") as number)).toBe(true);
  });
  it("parses inch dimensions", () => {
    expect(parseDimension('34.5"')).toBe(34.5);
    expect(parseDimension("24in")).toBe(24);
  });
});

describe("parseDistributorCsv", () => {
  it("maps header aliases to canonical keys", () => {
    const parsed = parseDistributorCsv(
      'Item,Product Name,Type,List Price\nB-24,"24in Base",Base,310'
    );
    expect(parsed.columns).toContain("masterCode");
    expect(parsed.columns).toContain("description");
    expect(parsed.columns).toContain("category");
    expect(parsed.columns).toContain("listPrice");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].cells.masterCode).toBe("B-24");
    expect(parsed.rows[0].cells.description).toBe("24in Base");
  });
  it("collects unknown headers", () => {
    const parsed = parseDistributorCsv("Code,Color,Notes\nB-24,White,hello");
    expect(parsed.unknownHeaders).toContain("Color");
    expect(parsed.unknownHeaders).toContain("Notes");
  });
  it("parses the shipped template cleanly", () => {
    const parsed = parseDistributorCsv(IMPORT_TEMPLATE_CSV);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[1].cells.masterCode).toBe("W-30-30");
    expect(parsed.rows[0].cells.description).toContain("Double Door");
  });
});

describe("validateImport", () => {
  it("flags missing master code column as fatal", () => {
    const parsed = parseDistributorCsv("Description\nhello");
    const { fatalErrors } = validateImport(parsed);
    expect(fatalErrors.length).toBeGreaterThan(0);
  });
  it("flags missing content columns as fatal", () => {
    const parsed = parseDistributorCsv("Code\nB-24");
    const { fatalErrors } = validateImport(parsed);
    expect(fatalErrors.join(" ")).toMatch(/Description or a Price/);
  });
  it("detects duplicate codes and invalid prices", () => {
    const parsed = parseDistributorCsv(
      "Code,Description,List Price\nB-24,a,10\nB-24,b,oops"
    );
    const { rowResults } = validateImport(parsed);
    expect(rowResults[1].ok).toBe(false);
    expect(rowResults[1].errors.join(" ")).toMatch(/Duplicate|Invalid/);
  });
  it("warns on unknown category but stays ok", () => {
    const parsed = parseDistributorCsv(
      "Code,Description,Category\nB-24,a,Frobnicator"
    );
    const { rowResults } = validateImport(parsed);
    expect(rowResults[0].ok).toBe(true);
    expect(rowResults[0].warnings.join(" ")).toMatch(/Unknown category/);
  });
});
