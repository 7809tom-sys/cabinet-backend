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
    expect(inserts.length).toBe(17);
    expect(code.match(/FALSE, FALSE, FALSE, FALSE, FALSE\n/g)?.length).toBe(17);
  });
  it("guards every insert", () => {
    expect((code.match(/NOT EXISTS/g) ?? []).length).toBeGreaterThanOrEqual(21);
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

describe("DL unmatched: Tom's decisions", () => {
  const xw = read("dl_crosswalk.csv");
  const sql = read("dl_unmatched_masters_tidb.sql");
  it("maps glass doors to existing glass cabinets and leaves WG12xx unmapped", () => {
    expect(xw).toMatch(/^WG1530,W1530GD,/m);
    expect(xw).toMatch(/^WDCG243012,DCW2430GD,/m);
    expect(xw).toMatch(/^WG1230,,accessory-report/m);
    expect(sql).not.toMatch(/SELECT 'WG\d+', '[^']*', 'Glass/);
  });
  it("resolves SP09 and BWBKT18 as aliases of existing masters, no SP09 new master", () => {
    expect(xw).toMatch(/^SP09,SPB9,alias,high,/m);
    expect(xw).toMatch(/^BWBKT18,BWB18,alias,high,/m);
    expect(sql).not.toMatch(/INSERT INTO cabinet_dealz\.cabinets[^;]*'SP09'/);
    expect(sql).toMatch(/SELECT 'SP09' AS alias, 'SPB9' AS masterCode/);
  });
  it("keeps the open questions excluded", () => {
    for (const c of ["QUARTER DOOR", "SP2436"]) expect(xw).toMatch(new RegExp(`^${c},,skipped`, "m"));
    expect(sql).not.toMatch(/QUARTER DOOR|SP2436|FLAT PANEL/);
  });
});
