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
const findings = read("findings_unmatched.md");

describe("DL unmatched masters SQL safety", () => {
  it("never publishes, deletes or drops; only 2 guarded 'review' UPDATEs on existing masters", () => {
    expect(code).not.toMatch(/\bDELETE\b|\bDROP\b|\bTRUNCATE\b|ALTER TABLE|CREATE TABLE/i);
    const updates = code.match(/^UPDATE [^\n]*/gm) ?? [];
    expect(updates.length).toBe(2);
    for (const u of updates) expect(u).toMatch(/^UPDATE cabinet_dealz\.cabinets SET conflictStatus = 'review'/);
    expect((code.match(/WHERE masterCode = '[^']+' AND conflictStatus = 'none';/g) ?? []).length).toBe(2);
    const writes = code.split("\n\n").filter((b) => /INSERT INTO/.test(b)).join("\n\n");
    expect(writes).not.toMatch(/isPublished\s*=\s*(1|TRUE)/i);
    expect(code).toMatch(/FALSE, 'pending'/);
  });
  it("creates 59 hidden masters (20 new + 39 flagged), all with NOT EXISTS guards", () => {
    expect((code.match(/INSERT INTO cabinet_dealz\.cabinets/g) ?? []).length).toBe(59);
    expect((code.match(/, FALSE, FALSE, FALSE, FALSE, (?:TRUE|FALSE), (?:NULL|'[^']*'), '(?:none|conflict)', /g) ?? []).length).toBe(59);
    expect((code.match(/NOT EXISTS/g) ?? []).length).toBeGreaterThanOrEqual(59 * 2 + 4 * 2);
  });
  it("gives every one of the 90 DL items a pending SKU on each style", () => {
    for (const style of ["WS", "SSA", "SSE", "LUXE-TBD"]) {
      const block = code.split("\n\n").find((b) => b.includes(`-${style}-DL`) && b.includes("INSERT INTO cabinet_dealz.distributor_skus"))!;
      expect((block.match(/ AS dlSku,/g) ?? []).length).toBe(90);
    }
  });
  it("puts DL's own description / dims / source page on the DL SKU (rule D), held not verified", () => {
    expect(sql).toMatch(/geometryWidth, geometryHeight, geometryDepth, geometrySourcePage, geometryStatus/);
    expect(sql).toMatch(/'DL Specification Book v\.11\/14\/23 p\.7' AS gPage, 'RH36 - Range Hood Cover \(DL spec book\)' AS dlName/);
    expect(sql).toMatch(/CASE WHEN m\.gPage IS NULL THEN NULL ELSE 'held' END/);
  });
});

describe("DL unmatched crosswalk", () => {
  it("keeps 200 rows, resolves all 90 targets, touches nothing else, skips nothing", () => {
    const cur = xw.split("\n"), orig = read("dl_crosswalk.orig.csv").split("\n");
    expect(cur.length).toBe(orig.length);
    expect(xw).not.toMatch(/,none,/);
    expect(cur.filter((l, i) => l !== orig[i]).length).toBe(90);
    expect(rep.trim().split("\n").length - 1).toBe(90);
    expect(xw).not.toMatch(/,skipped,|,accessory-report,/);
    expect(xw).not.toMatch(/Rich/);
  });
});

describe("Tom's final decisions (Oct 31)", () => {
  it("glass doors map to existing glass cabinets at DL's own price as-is", () => {
    expect(xw).toMatch(/^WG1530,W1530GD,nomenclature-equivalent,high,/m);
    expect(xw).toMatch(/^WDCG243012,DCW2430GD,nomenclature-equivalent,high,.*Tom confirmed Oct 31/m);
    expect(sql).toMatch(/SELECT 'WG1530' AS dlSku, 'WG1530' AS distSku, 'W1530GD' AS masterCode, 35 AS listPrice,/);
    expect(sql).toMatch(/SELECT 'WDCG243012' AS dlSku, 'WDCG243012' AS distSku, 'DCW2430GD' AS masterCode, 45 AS listPrice,/);
    expect(sql).not.toMatch(/ \+ WG\d+/);
    expect(fs.existsSync(path.join(dir, "dl_unmatched_glass_pricing.csv"))).toBe(false);
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
    for (const text of [xw, findings, sql]) expect(text).not.toMatch(/trash can pull/i);
    expect(findings).toMatch(/SP09 -> alias of SPB9\*\* \(9in Spice Base \/ Pull-Out/);
  });
  it("2DB33 is its own hidden master and is NEVER linked, aliased, substituted or cross-referenced to B33 or any regular B### base", () => {
    expect(xw).toMatch(/^2DB33,2DB33,new-master,/m);
    expect(sql).toMatch(/SELECT '2DB33', 'Drawer Base - 33"W x 34\.5"H x 24"D, 0 door\(s\), 2 drawer\(s\)[^']*', 'DL Cabinetry spec book v\.11\/14\/23', 'Base', 'Drawer Base', 33, 34\.5, 24, 'base', 0, 2, /);
    expect(sql).toMatch(/'2DB33' AS dlSku, '2DB33' AS distSku, '2DB33' AS masterCode, 263 AS listPrice/);
    // every alias / SKU line that mentions 2DB33 resolves to the 2DB33 master and nothing else
    for (const m of code.matchAll(/SELECT '2DB33' AS (?:alias|dlSku), (?:'2DB33' AS distSku, )?'([^']+)' AS masterCode/g)) expect(m[1]).toBe("2DB33");
    expect(code).not.toMatch(/AS alias, '2DB33' AS masterCode[^\n]*\n\s*UNION ALL\n\s*SELECT '(?!2DB33')[^\n]*AS alias, '2DB33'/);
    const row = xw.split("\n").find((l) => l.startsWith("2DB33,"))!;
    expect(row.split(",")[1]).toBe("2DB33");
    // no regular base master code (B33, B24FH, 3DB33 ...) appears in any 2DB33 crosswalk/report/SQL-line text
    const regular = /(?<![0-9A-Za-z])(?:B\d{2}(?:FH)?|\d?DB\d{2})(?![0-9A-Za-z])/;
    expect(row.replace(/2DB33/g, "")).not.toMatch(regular);
    for (const l of rep.split("\n").filter((x) => x.startsWith("2DB33,"))) expect(l.replace(/2DB33/g, "")).not.toMatch(regular);
    for (const l of code.split("\n").filter((x) => x.includes("'2DB33'"))) expect(l.replace(/2DB33/g, "")).not.toMatch(regular);
    expect(findings).toMatch(/never linked, aliased, substituted or cross-referenced/);
  });
  it("RH36 is an alias of RHF36 (same item), no separate master, DL SKUs under RHF36, flagged review, range hood section present", () => {
    expect(xw).toMatch(/^RH36,RHF36,alias,high,/m);
    expect(code).not.toContain("SELECT 'RH36', ");
    expect(sql).toMatch(/SELECT 'RH36' AS alias, 'RHF36' AS masterCode/);
    expect(sql).toMatch(/'RH36' AS dlSku, 'RH36' AS distSku, 'RHF36' AS masterCode, 543 AS listPrice/);
    expect(sql).toMatch(/'RH36' AS dlSku, 'RH36' AS distSku, 'RHF36' AS masterCode, 1085 AS listPrice/);
    expect(sql).toMatch(/WHERE masterCode = 'RHF36' AND conflictStatus = 'none';/);
    expect(sql).toMatch(/'RHF30', 'RHF36', 'HOOD-30', 'HOOD-36'/);
    expect(findings).toContain("## Range Hoods");
    for (const c of ["RH36", "RHF36", "RHF30", "HOOD-30", "RH-15-42"]) expect(findings).toContain(c);
    expect(code).not.toMatch(/UPDATE cabinet_dealz\.cabinets SET (?:masterCode|description)/);
  });
  it("the five medium masters follow Tom's 11:17 decisions", () => {
    for (const k of ["TUK", "SPRAYPAINT", "SM8", "REPV2796"]) expect(xw).toMatch(new RegExp(`,${k},[a-z-]+,high,`));
    expect(xw).toMatch(/^WMC3018,PWB-MOS-30-18,dimension-equivalent,medium,/m);
    const updates = (code.match(/^UPDATE [^\n]*/gm) ?? []).join("\n");
    expect(updates).not.toMatch(/TUK|SPRAYPAINT|SM8|REPV2796/);
    expect(sql).toMatch(/WMS3018[\s\S]*WOC3018/);
  });
  it("FLAT PANEL 28X96 is a field-cut hidden panel flagged for thickness and finish", () => {
    expect(sql).toContain("Field cut — panel is cut to fit on site by installer.");
    expect(sql).toMatch(/SELECT 'FLAT PANEL 28X96', .*FALSE, FALSE, FALSE, FALSE, TRUE, 'Field cut[^']*', 'conflict'/);
    expect(sql).toContain("3/4in thickness is TAKEN FROM THE 27X96 ROW");
    expect(sql).toContain("finish is NULL");
  });
});

describe("Cabinet Conflict rule (Tom, Oct 31)", () => {
  it("uses the existing conflictStatus / conflictReason / conflictedAt fields, no new flag", () => {
    expect(code).toMatch(/conflictStatus, conflictReason, conflictedAt\)/);
  });
  it("SP2436 is a flagged hidden master with Tom's reason and a pending SKU", () => {
    expect(xw).toMatch(/^SP2436,SP2436,conflict-flagged,/m);
    expect(sql).toMatch(/SELECT 'SP2436', [^\n]*'conflict', 'Issue: Likely decorative door 24x36; not found in DL spec book; confirm\./);
    expect(sql).toMatch(/'SP2436' AS dlSku, 'SP2436' AS distSku, 'SP2436' AS masterCode, 33 AS listPrice/);
  });
  it("QUARTER DOOR and every report-only item is flagged, none skipped, 49 conflict entries", () => {
    expect(xw).toMatch(/^QUARTER DOOR,QUARTER DOOR,conflict-flagged,/m);
    expect((xw.match(/,conflict-flagged,/g) ?? []).length).toBe(39);
    const conflicts = read("dl_unmatched_conflicts.csv").trim().split("\n").slice(1);
    expect(conflicts.filter((l) => l.split(",")[1] === "conflict").length).toBe(47);
    expect(conflicts.length).toBe(49);
  });
  it("SUPPLIER_ONBOARDING.md records the rules", () => {
    const doc = fs.readFileSync(path.resolve(process.cwd(), "data/distributors/SUPPLIER_ONBOARDING.md"), "utf8");
    expect(doc).toContain("Unsure items go to the Cabinet Conflict tab");
    expect(doc).toContain("Do not invent a new flag");
    for (const k of ["A. No skipping", "B. No price changes", "C. Unsure = Cabinet Conflict", "D. Naming", "E. Never cross-link unique items"]) expect(doc).toContain(k);
  });
});
