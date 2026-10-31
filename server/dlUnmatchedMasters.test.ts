import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), "data/distributors/dl-cabinetry");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const csv = (f: string) => {
  const lines = read(f).trim().split("\n");
  return lines.length - 1;
};

describe("DL unmatched masters SQL", () => {
  const sql = read("dl_unmatched_masters_tidb.sql");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const writes = code.split("\n\n").filter((b) => /INSERT INTO/.test(b)).join("\n\n");
  it("never publishes, updates or deletes", () => {
    expect(code).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i);
    expect(writes).not.toMatch(/isPublished\s*=\s*(1|TRUE)/i);
    expect(code).toMatch(/FALSE, 'pending'/);
  });
  it("creates masters hidden", () => {
    const inserts = code.match(/INSERT INTO cabinet_dealz\.cabinets/g) ?? [];
    expect(inserts.length).toBe(20);
    expect(code.match(/, FALSE, FALSE, FALSE, FALSE, (?:TRUE|FALSE), (?:NULL|'[^']*')\n/g)?.length).toBe(20);
  });
  it("guards every insert", () => {
    expect((code.match(/NOT EXISTS/g) ?? []).length).toBeGreaterThanOrEqual(25);
  });
});

describe("DL unmatched crosswalk", () => {
  it("keeps 200 rows and resolves all 90 targets", () => {
    expect(csv("dl_crosswalk.csv")).toBe(200);
    const rep = read("dl_unmatched_report.csv").trim().split("\n").length - 1;
    expect(rep).toBe(90);
  });
  it("leaves no 'none' rows and does not touch matched rows", () => {
    const cur = read("dl_crosswalk.csv").split("\n");
    const orig = read("dl_crosswalk.orig.csv").split("\n");
    expect(read("dl_crosswalk.csv")).not.toMatch(/,none,/);
    let changed = 0;
    cur.forEach((l, i) => { if (l !== orig[i]) changed++; });
    expect(changed).toBe(90);
  });
});

const codeOf = (x: string) => x.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("DL unmatched: Tom's decisions (Oct 31)", () => {
  const xw = read("dl_crosswalk.csv");
  const sql = read("dl_unmatched_masters_tidb.sql");
  const rep = read("dl_unmatched_report.csv");
  it("maps glass doors to existing glass cabinets, diagonal confirmed", () => {
    expect(xw).toMatch(/^WG1530,W1530GD,nomenclature-equivalent,high,/m);
    expect(xw).toMatch(/^WDCG243012,DCW2430GD,nomenclature-equivalent,high,.*Tom confirmed Oct 31/m);
  });
  it("prices glass as cabinet + door, never the door alone", () => {
    expect(sql).toMatch(/SELECT 'WG1530' AS dlSku, 'W1530 \+ WG1530' AS distSku, 'W1530GD' AS masterCode, 123 AS listPrice \/\* W1530 88 \+ WG1530 35 \*\//);
    expect(sql).toMatch(/'WG1530' AS dlSku, 'W1530 \+ WG1530' AS distSku, 'W1530GD' AS masterCode, 246 AS listPrice/);
    expect(sql).not.toMatch(/'WG\d+' AS dlSku, '(WG\d+)' AS distSku/);
    const g = read("dl_unmatched_glass_pricing.csv").trim().split("\n");
    expect(g.length - 1).toBe(48);
    for (const l of g.slice(1)) {
      const c = l.split(",");
      expect(Number(c[5]) + Number(c[6])).toBe(Number(c[7]));
    }
  });
  it("creates hidden W12xxGD masters with WG alias", () => {
    for (const c of ["W1230GD", "W1236GD", "W1242GD"]) {
      expect(sql).toContain(`SELECT '${c}', `);
    }
    expect(sql).toMatch(/SELECT 'WG1230' AS alias, 'W1230GD' AS masterCode/);
  });
  it("aliases SP09, BWBKT18, 2DB33 onto existing masters with no new master", () => {
    expect(xw).toMatch(/^SP09,SPB9,alias,high,/m);
    expect(xw).toMatch(/^BWBKT18,BWB18,alias,high,/m);
    expect(xw).toMatch(/^2DB33,B33,alias,high,.*Tom confirmed Oct 31, common B33/m);
    for (const c of ["SP09", "2DB33", "BWBKT18"]) expect(sql).not.toContain(`SELECT '${c}', `);
    expect(sql).toMatch(/SELECT '2DB33' AS alias, 'B33' AS masterCode/);
  });
  it("RH36 is a hidden cabinet new master, not an RHF36 alias", () => {
    expect(sql).toMatch(/SELECT 'RH36', .*FALSE, FALSE, FALSE, FALSE, FALSE, NULL\n/);
    expect(xw).toMatch(/^RH36,RH36,new-master,/m);
  });
  it("SP2436 is report-only with the spec-book lookup, FLAT PANEL is a field-cut hidden panel", () => {
    expect(xw).toMatch(/^SP2436,,accessory-report,.*NOT FOUND/m);
    expect(codeOf(sql)).not.toMatch(/SP2436/);
    expect(sql).toContain("Field cut — panel is cut to fit on site by installer.");
    expect(sql).toMatch(/SELECT 'FLAT PANEL 28X96', .*FALSE, FALSE, FALSE, FALSE, TRUE, /);
  });
  it("QUARTER DOOR stays excluded and every report row has a source", () => {
    expect(xw).toMatch(/^QUARTER DOOR,,skipped/m);
    expect(codeOf(sql)).not.toMatch(/QUARTER DOOR/);
    const rows = rep.trim().split("\n").slice(1);
    expect(rows.length).toBe(90);
    for (const l of rows) expect(l.trim().endsWith(",")).toBe(false);
  });
});
