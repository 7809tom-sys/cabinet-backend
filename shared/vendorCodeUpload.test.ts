import { describe, expect, it } from "vitest";
import {
  buildPlatformSku,
  inferCategoryFromCode,
  newMasterCodeFrom,
  parsePrice,
  parseUploadGrid,
  planCodeUpload,
  priceChangeRatio,
  splitDelimited,
  summarizePlan,
  type PlanMaster,
  type PlanSku,
  type PlanStyle,
} from "./vendorCodeUpload";

const styles: PlanStyle[] = [
  { id: 1, styleCode: "TWP", ourName: "Torino TWP", aliasName: "Torino White", distributorName: "Alpine White" },
  { id: 2, styleCode: "TGW", ourName: "Torino TGW", aliasName: "Torino Grey", distributorName: null },
  { id: 3, styleCode: "SW", ourName: "Shaker White", aliasName: "Shaker White", distributorName: null },
  { id: 4, styleCode: "SW2", ourName: "Shaker  White", aliasName: null, distributorName: null }, // collides with id 3 once spaces are collapsed
];
const masters: PlanMaster[] = [
  { id: 10, masterCode: "B24" },
  { id: 11, masterCode: "W3030", altSku1: "W-30-30-X" },
  { id: 12, masterCode: "B30FH" },
  { id: 13, masterCode: "SB36", vendorSku: "VS-36" },
  { id: 14, masterCode: "HELD1", conflictStatus: "conflict" },
  { id: 15, masterCode: "TWIN-A" },
  { id: 16, masterCode: "TWIN-B" },
];
const links = [
  { alias: "BFH-30", masterCode: "B30FH" }, // sku_master_aliases style
  { alias: "ZQX77752", cabinetId: 10 }, // code_aliases style (by id)
  { alias: "SHARED", cabinetId: 15 },
  { alias: "SHARED", cabinetId: 16 },
  { alias: "B-24", masterCode: "B24" },
  { alias: "TWIN-B", cabinetId: 15 }, // exact master code on 16, alias on 15
];
const skus: PlanSku[] = [
  { id: 100, cabinetId: 10, styleId: 1, distributorSku: "B24", listPrice: "100.00", yourCost: null },
  { id: 101, cabinetId: null, styleId: 1, distributorSku: "NEW-77", listPrice: "5.00", yourCost: null },
];
const row = (n: number, code: string, door: string, price?: number, cost?: number) => ({ rowNumber: n, code, door, ...(price != null ? { price } : {}), ...(cost != null ? { cost } : {}) });
const plan = (rows: ReturnType<typeof row>[]) => planCodeUpload({ rows, styles, masters, links, skus });

describe("parsePrice", () => {
  it("accepts money formats and rejects junk, zero and negatives", () => {
    expect(parsePrice("$1,234.5")).toBe(1234.5);
    expect(parsePrice(" 12 ")).toBe(12);
    expect(parsePrice(99.999)).toBe(100);
    for (const bad of ["", "abc", "0", "-5", "12abc", "1e3", "NaN"]) expect(parsePrice(bad)).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });
});

describe("splitDelimited / parseUploadGrid", () => {
  it("reads a headed CSV in any column order", () => {
    const parsed = parseUploadGrid(splitDelimited("Price,Door Name,Item Code\n$12.50,Torino TWP,B24\n20,Torino TGW,W3030\n"));
    expect(parsed.headerDetected).toBe(true);
    expect(parsed.invalid).toEqual([]);
    expect(parsed.rows).toEqual([row(2, "B24", "Torino TWP", 12.5), row(3, "W3030", "Torino TGW", 20)]);
  });
  it("reads pasted spreadsheet text (tab delimited) with no header as Code, Door, Price", () => {
    const parsed = parseUploadGrid(splitDelimited("B24\tTorino TWP\t100\nW3030\tTorino TGW\t200"));
    expect(parsed.headerDetected).toBe(false);
    expect(parsed.rows.map((r) => [r.code, r.door, r.price])).toEqual([["B24", "Torino TWP", 100], ["W3030", "Torino TGW", 200]]);
  });
  it("skips an unreadable header row instead of calling it a bad data row", () => {
    const parsed = parseUploadGrid(splitDelimited("Thing,Colour of stuff,How much\nB24,Torino TWP,100"));
    expect(parsed.invalid).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.notes.join(" ")).toMatch(/header/i);
  });
  it("handles quoted commas, escaped quotes, BOM and CRLF", () => {
    const parsed = parseUploadGrid(splitDelimited('\uFEFFcode,door,price\r\n"B,24","Torino ""Pure"" White",$1,000\r\n'));
    // "$1,000" is unquoted so it splits - the row is rejected rather than misread.
    expect(parsed.rows).toEqual([]);
    expect(parsed.invalid[0].message).toMatch(/price/i);
    const ok = parseUploadGrid(splitDelimited('code,door,price\r\n"B,24","Torino ""Pure"" White","$1,000"\r\n'));
    expect(ok.rows).toEqual([row(2, "B,24", 'Torino "Pure" White', 1000)]);
  });
  it("reports every bad row with its sheet row number and keeps the good ones", () => {
    const parsed = parseUploadGrid(splitDelimited("code,door,price\nB24,Torino TWP,100\n,Torino TWP,100\nB30,,100\nB36,Torino TWP,abc\nB42,Torino TWP,\n"));
    expect(parsed.rows.map((r) => r.rowNumber)).toEqual([2]);
    expect(parsed.invalid.map((r) => r.rowNumber)).toEqual([3, 4, 5, 6]);
    expect(parsed.invalid[3].message).toMatch(/price is empty/);
  });
  it("accepts a Cost column on its own and alongside Price", () => {
    const only = parseUploadGrid(splitDelimited("code,door,cost\nB24,Torino TWP,40"));
    expect(only.rows).toEqual([row(2, "B24", "Torino TWP", undefined, 40)]);
    const both = parseUploadGrid(splitDelimited("code,door,price,cost\nB24,Torino TWP,100,40"));
    expect(both.rows).toEqual([row(2, "B24", "Torino TWP", 100, 40)]);
  });
  it("names the missing column when the header is recognisable but incomplete", () => {
    const parsed = parseUploadGrid(splitDelimited("code,price\nB24,100"));
    expect(parsed.rows).toEqual([]);
    expect(parsed.invalid[0].message).toMatch(/Door/);
  });
  it("returns nothing for an empty file", () => {
    expect(parseUploadGrid(splitDelimited("")).rows).toEqual([]);
    expect(parseUploadGrid(splitDelimited("\n\n,,\n")).rows).toEqual([]);
  });
});

describe("planCodeUpload - codes", () => {
  it("attaches a master code and an alias to the right master, tolerating punctuation and case", () => {
    const out = plan([row(2, "b-24", "Torino TGW", 90), row(3, "ZQX77752", "Torino White", 95), row(4, "BFH-30", "Torino TWP", 70), row(5, "w 30 30 x", "Torino TWP", 60), row(6, "VS-36", "Torino TWP", 80)]);
    expect(out.map((r) => [r.action, r.masterCode, r.matchedVia])).toEqual([
      ["add", "B24", "master"], // "b-24" canonicalises to B24 = the master code itself
      ["update", "B24", "alias"], // alias ZQX77752 + Torino White: that SKU already exists (id 100)
      ["add", "B30FH", "alias"],
      ["add", "W3030", "alias"],
      ["add", "SB36", "alias"],
    ]);
    expect(out.every((r) => !r.createsMaster)).toBe(true);
  });
  it("makes an unrecognised code a new master, once, even when it appears for several doors", () => {
    const out = plan([row(2, "ZZ-900", "Torino TWP", 50), row(3, "zz900", "Torino TGW", 55), row(4, "ZZ 900", "Torino TWP", 51)]);
    expect(out.map((r) => r.action)).toEqual(["add", "add", "update"]);
    expect(out[0]).toMatchObject({ matchedVia: "new", createsMaster: true, newMasterCode: "ZZ-900", newMasterCategory: "Accessory" });
    expect(out[1]).toMatchObject({ matchedVia: "new", createsMaster: false, masterCode: "ZZ-900" });
    expect(out[2].message).toMatch(/later price/);
    expect(summarizePlan(out)).toMatchObject({ added: 2, updated: 1, newMasters: 1 });
  });
  it("never creates a master from an unusable code", () => {
    const out = plan([row(2, "bad code!", "Torino TWP", 5), row(3, "ARCHIVE-9", "Torino TWP", 5), row(4, "X".repeat(70), "Torino TWP", 5)]);
    expect(out.every((r) => r.action === "error" && !r.createsMaster)).toBe(true);
  });
  it("refuses to guess when an alias points at two masters", () => {
    const out = plan([row(2, "SHARED", "Torino TWP", 10)]);
    expect(out[0]).toMatchObject({ action: "error" });
    expect(out[0].message).toMatch(/more than one master/);
  });
  it("lets an exact master code win over an alias another cabinet carries", () => {
    const out = plan([row(2, "TWIN-B", "Torino TWP", 10)]);
    expect(out[0]).toMatchObject({ action: "add", masterCode: "TWIN-B", matchedVia: "master" });
  });
  it("will not upload into a master held for review", () => {
    expect(plan([row(2, "HELD1", "Torino TWP", 10)])[0]).toMatchObject({ action: "error", masterCode: "HELD1" });
  });
});

describe("planCodeUpload - doors", () => {
  it("matches the door by our name, public name, the vendor's own name or style code, ignoring case and spacing", () => {
    const out = plan([row(2, "B30FH", "torino twp", 1), row(3, "B30FH", "TORINO WHITE", 1), row(4, "B30FH", "alpine white", 1), row(5, "B30FH", "TGW", 1), row(6, "B30FH", "Torino-Grey", 1)]);
    expect(out.map((r) => r.styleName)).toEqual(["Torino White", "Torino White", "Torino White", "Torino Grey", "Torino Grey"]);
  });
  it("rejects an unknown door with examples and an ambiguous door without choosing", () => {
    const unknown = plan([row(2, "B24", "Midnight Oak", 1)])[0];
    expect(unknown.action).toBe("error");
    expect(unknown.message).toMatch(/not a door on this line/);
    expect(unknown.message).toMatch(/Torino White/);
    expect(plan([row(3, "B24", "Shaker White", 1)])[0].message).toMatch(/more than one door/);
  });
});

describe("planCodeUpload - prices and existing items", () => {
  it("updates only when the price changes and reports old and new", () => {
    const [changed, same] = plan([row(2, "B24", "Torino TWP", 120), row(3, "B24", "Torino TWP", 100)]);
    // second row repeats the same SKU: it compares to the first row's price
    expect(changed).toMatchObject({ action: "update", oldPrice: 100, newPrice: 120, existingSkuId: 100 });
    expect(same.action).toBe("update");
    expect(plan([row(2, "B24", "Torino TWP", 100)])[0]).toMatchObject({ action: "unchanged" });
  });
  it("an alias updates the existing SKU instead of creating a twin", () => {
    const out = plan([row(2, "ZQX77752", "Torino TWP", 130), row(3, "B-24", "Torino TWP", 140)]);
    expect(out.map((r) => [r.action, r.existingSkuId])).toEqual([["update", 100], ["update", 100]]);
  });
  it("finds an earlier unmapped SKU by its own code so it is updated, not duplicated", () => {
    // SKU 101 has no cabinet; a brand-new code that matches it must update it.
    const out = planCodeUpload({ rows: [row(2, "NEW-77", "Torino TWP", 9)], styles, masters, links, skus: [{ id: 101, cabinetId: null, styleId: 1, distributorSku: "NEW-77", listPrice: "5.00" }] });
    // The item already exists on this line with no cabinet: it is linked, never duplicated.
    expect(out[0]).toMatchObject({ action: "update", existingSkuId: 101, linksOrphan: true, createsMaster: true, matchedVia: "new" });
  });
  it("a cost-only row never erases the list price and a price-only row never erases cost", () => {
    const out = plan([row(2, "B24", "Torino TWP", undefined, 40)]);
    expect(out[0]).toMatchObject({ action: "update", newPrice: null, newCost: 40, oldPrice: 100 });
  });
  it("requires a price", () => {
    expect(plan([row(2, "B24", "Torino TWP")])[0]).toMatchObject({ action: "error", message: "Needs a price." });
  });
});

describe("large price change flag", () => {
  it("flags a 50%+ move in either direction but never blocks it", () => {
    const [cut, rise, small] = plan([row(2, "B24", "Torino TWP", 40), row(3, "B24", "Torino TGW", 90), row(4, "B24", "Torino TWP", 104)]);
    // rows 2 and 4 hit the same SKU: row 4 compares to row 2's price (40 -> 104)
    expect(cut).toMatchObject({ action: "update", largeChange: true, oldPrice: 100, newPrice: 40 });
    expect(cut.message).toMatch(/Large change \(60%\)/);
    expect(rise).toMatchObject({ action: "add", largeChange: false });
    expect(small).toMatchObject({ action: "update", largeChange: true }); // 40 -> 104 is +160%
    const mild = plan([row(2, "B24", "Torino TWP", 120)])[0];
    expect(mild).toMatchObject({ action: "update", largeChange: false });
    expect(summarizePlan([mild]).largeChanges).toBe(0);
    expect(summarizePlan([cut]).largeChanges).toBe(1);
  });
  it("ratio helper handles missing and zero prices", () => {
    expect(priceChangeRatio(100, 150)).toBe(0.5);
    expect(priceChangeRatio(null, 5)).toBeNull();
    expect(priceChangeRatio(0, 5)).toBeNull();
  });
});

describe("category inference and new master spelling", () => {
  it("agrees with the real catalog families", () => {
    const cases: [string, string][] = [["W3030", "Wall"], ["WBC2430", "Wall"], ["DCW2430", "Wall"], ["B24", "Base"], ["SB36", "Base"], ["BBC45", "Base"], ["VSB30", "Vanity"], ["V3021", "Vanity"], ["T84", "Tall"], ["U1884", "Tall"], ["ADA24", "ADA"], ["F3", "Filler"], ["OF694", "Accessory"], ["VA12", "Accessory"], ["UNIV1", "Accessory"], ["12345", "Accessory"], ["TOEKICK", "Accessory"]];
    for (const [code, category] of cases) expect([code, inferCategoryFromCode(code)]).toEqual([code, category]);
  });
  it("normalises a new master's spelling", () => {
    expect(newMasterCodeFrom(" zz-900 ")).toBe("ZZ-900");
    expect(newMasterCodeFrom("z z 9")).toBe("ZZ9");
    expect(newMasterCodeFrom("")).toBeNull();
    expect(newMasterCodeFrom("-bad")).toBeNull();
  });
});

describe("buildPlatformSku", () => {
  it("is unique per door so two doors for one cabinet never collide", () => {
    const taken = new Set<string>();
    const a = buildPlatformSku("B24", "TWP", "AEF", taken, 1, "B24"); taken.add(a);
    const b = buildPlatformSku("B24", "TGW", "AEF", taken, 2, "B24"); taken.add(b);
    expect(a).toBe("B24-TWP-AEF");
    expect(b).toBe("B24-TGW-AEF");
    const c = buildPlatformSku("B24", "TWP", "AEF", taken, 1, "B24");
    expect(taken.has(c)).toBe(false);
    expect(c.length).toBeLessThanOrEqual(128);
  });
});
