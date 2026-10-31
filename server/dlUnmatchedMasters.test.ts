import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), "data/distributors/dl-cabinetry");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const codeOf = (x: string) => x.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const sql = read("dl_unmatched_masters_tidb.sql");
const code = codeOf(sql);
const xw = read("dl_crosswalk.csv");
const rep = read("dl_unmatched_report.csv");

describe("DL unmatched masters SQL safety", () => {
  it("never publishes, deletes or drops; only guarded 'review' UPDATEs on existing masters", () => {
    expect(code).not.toMatch(/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i);
    const updates = code.match(/^UPDATE [^\n]*/gm) ?? [];
    expect(updates.length).toBe(5);
    for (const u of updates) expect(u).toMatch(/^UPDATE cabinet_dealz\.cabinets SET conflictStatus = 'review'/);
    expect((code.match(/WHERE masterCode = '[^']+' AND conflictStatus = 'none';/g) ?? []).length).toBe(5);
    const writes = code.split("\n\n").filter((b) => /INSERT INTO/.test(b)).join("\n\n");
    expect(writes).not.toMatch(/isPublished\s*=\s*(1|TRUE)/i);
    expect(code).toMatch(/FALSE, 'pending'/);
  });
  it("creates 60 hidden masters (21 new + 39 report-only)", () => {
    expect((code.match(/INSERT INTO cabinet_dealz\.cabinets/g) ?? []).length).toBe(60);
    expect((code.match(/, FALSE, FALSE, FALSE, FALSE, (?:TRUE|FALSE), (?:NULL|'[^']*'), '(?:none|conflict)', /g) ?? []).length).toBe(60);
  });
  it("guards every insert", () => {
    expect((code.match(/NOT EXISTS/g) ?? []).length).toBeGreaterThanOrEqual(60 * 2 + 4 * 2);
  });
  it("gives every one of the 90 DL items a pending SKU on each style", () => {
    for (const style of ["WS", "SSA", "SSE", "LUXE-TBD"]) {
      const block = code.split("\n\n").find((b) => b.includes(`-${style}-DL`) && b.includes("INSERT INTO cabinet_dealz.distributor_skus"))!;
      expect((block.match(/ AS dlSku,/g) ?? []).length).toBe(90);
    }
  });
});

describe("DL unmatched crosswalk", () => {
  it("keeps 200 rows, resolves all 90 targets, touches nothing else", () => {
    const cur = xw.split("\n"), orig = read("dl_crosswalk.orig.csv").split("\n");
    expect(cur.length).toBe(orig.length);
    expect(xw).not.toMatch(/,none,/);
    expect(cur.filter((l, i) => l !== orig[i]).length).toBe(90);
    expect(rep.trim().split("\n").length - 1).toBe(90);
    expect(xw).not.toMatch(/,skipped,/);
  });
});

describe("Tom's decisions (Oct 31)", () => {
  it("maps glass doors to existing glass cabinets, diagonal confirmed", () => {
    expect(xw).toMatch(/^WG1530,W1530GD,nomenclature-equivalent,high,/m);
    expect(xw).toMatch(/^WDCG243012,DCW2430GD,nomenclature-equivalent,high,.*Tom confirmed Oct 31/m);
  });
  it("prices glass as cabinet + door, never the door alone", () => {
    expect(sql).toMatch(/'WG1530' AS dlSku, 'W1530 \+ WG1530' AS distSku, 'W1530GD' AS masterCode, 123 AS listPrice, 0 AS noCt \/\* W1530 88 \+ WG1530 35 \*\//);
    expect(sql).toMatch(/'WG1530' AS dlSku, 'W1530 \+ WG1530' AS distSku, 'W1530GD' AS masterCode, 246 AS listPrice/);
    const g = read("dl_unmatched_glass_pricing.csv").trim().split("\n");
    expect(g.length - 1).toBe(48);
    for (const l of g.slice(1)) {
      const c = l.split(",");
      expect(Number(c[5]) + Number(c[6])).toBe(Number(c[7]));
    }
  });
  it("creates hidden W12xxGD masters with WG alias", () => {
    for (const c of ["W1230GD", "W1236GD", "W1242GD"]) expect(sql).toContain(`SELECT '${c}', `);
    expect(sql).toMatch(/SELECT 'WG1230' AS alias, 'W1230GD' AS masterCode/);
  });
  it("SP09 and BWBKT18 alias existing masters; SP09 is a spice pull-out, never 'trash can'", () => {
    expect(xw).toMatch(/^SP09,SPB9,alias,high,/m);
    expect(xw).toMatch(/^BWBKT18,BWB18,alias,high,/m);
    for (const c of ["SP09", "BWBKT18"]) expect(code).not.toContain(`SELECT '${c}', `);
    expect(sql).toMatch(/SELECT 'SP09' AS alias, 'SPB9' AS masterCode/);
    expect(xw.match(/^SP09,[^\n]*/m)![0]).not.toMatch(/trash can/i);
    expect(read("findings_unmatched.md").match(/SP09 = SPB9[^\n]*/)![0]).not.toMatch(/trash can pull/i);
  });
  it("2DB33 is its own hidden master (0 doors, 2 drawers, DL prices), with no B33 alias or SKUs", () => {
    expect(xw).toMatch(/^2DB33,2DB33,new-master,/m);
    expect(sql).toMatch(/SELECT '2DB33', 'Drawer Base Cabinet - 33"W x 34\.5"H x 24"D, 0 door\(s\), 2 drawer\(s\)[^']*', 'DL Cabinetry spec book v\.11\/14\/23', 'Base', 'Drawer Base', 33, 34\.5, 24, 'base', 0, 2, /);
    expect(sql).toMatch(/'2DB33' AS dlSku, '2DB33' AS distSku, '2DB33' AS masterCode, 263 AS listPrice/);
    expect(sql).toMatch(/'2DB33' AS dlSku, '2DB33' AS distSku, '2DB33' AS masterCode, 526 AS listPrice/);
    expect(code).not.toMatch(/'2DB33' AS alias, 'B33'/);
    expect(code).not.toMatch(/'2DB33' AS dlSku, '[^']*' AS distSku, 'B33'/);
  });
  it("RH36 is a hidden cabinet new master, not an RHF36 alias", () => {
    expect(sql).toMatch(/SELECT 'RH36', .*FALSE, FALSE, FALSE, FALSE, FALSE, NULL, '(none|conflict)'/);
    expect(xw).toMatch(/^RH36,RH36,new-master,/m);
  });
  it("FLAT PANEL 28X96 is a field-cut hidden panel flagged in conflict", () => {
    expect(sql).toContain("Field cut — panel is cut to fit on site by installer.");
    expect(sql).toMatch(/SELECT 'FLAT PANEL 28X96', .*FALSE, FALSE, FALSE, FALSE, TRUE, 'Field cut[^']*', 'conflict'/);
  });
});

describe("Cabinet Conflict rule (Tom, Oct 31)", () => {
  it("uses the existing conflictStatus / conflictReason / conflictedAt fields, no new flag", () => {
    expect(code).toMatch(/conflictStatus, conflictReason, conflictedAt\)/);
    expect(code).not.toMatch(/ALTER TABLE|CREATE TABLE/i);
  });
  it("SP2436 is a flagged hidden master with Tom's reason and a pending SKU", () => {
    expect(xw).toMatch(/^SP2436,SP2436,conflict-flagged,/m);
    expect(sql).toMatch(/SELECT 'SP2436', [^\n]*'conflict', 'Issue: Likely decorative door 24x36; not found in DL spec book; confirm\./);
    expect(sql).toMatch(/'SP2436' AS dlSku, 'SP2436' AS distSku, 'SP2436' AS masterCode, 33 AS listPrice/);
  });
  it("QUARTER DOOR and every report-only item is flagged, none skipped", () => {
    expect(xw).toMatch(/^QUARTER DOOR,QUARTER DOOR,conflict-flagged,/m);
    expect((xw.match(/,conflict-flagged,/g) ?? []).length).toBe(39);
    const conflicts = read("dl_unmatched_conflicts.csv").trim().split("\n").slice(1);
    expect(conflicts.filter((l) => l.split(",")[1] === "conflict").length).toBe(47);
    expect(conflicts.filter((l) => l.startsWith("")).length).toBe(52);
  });
  it("SUPPLIER_ONBOARDING.md records the rule", () => {
    const doc = fs.readFileSync(path.resolve(process.cwd(), "data/distributors/SUPPLIER_ONBOARDING.md"), "utf8");
    expect(doc).toContain("Unsure items go to the Cabinet Conflict tab");
    expect(doc).toContain("conflictStatus");
    expect(doc).toContain("Do not invent a new flag");
  });
});
