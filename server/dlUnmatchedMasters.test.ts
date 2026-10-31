import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { onboardingConflictLevel, ONBOARDING_CONFLICT_STATUS } from "../shared/onboardingConflicts";

const dir = path.resolve(process.cwd(), "data/distributors/dl-cabinetry");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const codeOf = (x: string) => x.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const sql = read("dl_unmatched_masters_tidb.sql");
const code = codeOf(sql);
const xw = read("dl_crosswalk.csv");
const rep = read("dl_unmatched_report.csv");
const findings = read("findings_unmatched.md");
const PUBLISH_MARK = "-- PUBLISH SECTION. Tom runs this by hand";
const [insertPart, publishPart] = sql.split(PUBLISH_MARK);
const insertCode = codeOf(insertPart);
const publishCode = codeOf(publishPart ?? "");

describe("DL unmatched masters SQL safety", () => {
  it("H: no DELETE (or row-removal) anywhere in this PR's SQL files or scripts", () => {
    const files = fs.readdirSync(dir).filter((f) => /\.(sql|py)$/.test(f));
    expect(files).toContain("dl_unmatched_masters_tidb.sql");
    for (const f of files) {
      if (f === "dl_distributor_setup_tidb.sql" || f === "dl_go_live_tidb.sql" || f === "gen_sql.py" || f === "build_dl.py") continue; // pre-existing files outside this PR
      expect(read(f), f).not.toMatch(/\bDELETE\b|\bDROP\b|\bTRUNCATE\b|\bREPLACE INTO\b/i);
    }
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(fs.readFileSync(path.resolve(process.cwd(), "shared/onboardingConflicts.ts"), "utf8")).not.toMatch(/\bDELETE\b/i);
  });
  it("INSERT part: nothing published, only 30 guarded 'review' UPDATEs on existing masters", () => {
    expect(insertCode).not.toMatch(/isPublished\s*=\s*(1|TRUE)/i);
    expect(insertCode).not.toMatch(/ALTER TABLE|CREATE TABLE/i);
    const updates = insertCode.match(/^UPDATE [^\n]*/gm) ?? [];
    expect(updates.length).toBe(30);
    for (const u of updates) expect(u).toMatch(/^UPDATE cabinet_dealz\.cabinets SET conflictStatus = 'review'/);
    expect((insertCode.match(/WHERE masterCode = '[^']+' AND conflictStatus = 'none';/g) ?? []).length).toBe(30);
    expect(insertCode).toMatch(/FALSE, 'pending'/);
  });
  it("F/G: a clearly labeled PUBLISH SECTION publishes this PR's DL SKUs and new masters, scoped to distributor 450001 and this PR's codes", () => {
    expect(publishPart).toBeDefined();
    expect(sql).toMatch(/=+\n-- PUBLISH SECTION\. Tom runs this by hand/);
    const updates = publishCode.match(/^UPDATE [^\n]*\n[^\n]*/gm) ?? [];
    expect(updates.length).toBe(5);
    const skuUpdates = updates.filter((u) => u.includes("distributor_skus"));
    expect(skuUpdates.length).toBe(4);
    let total = 0;
    for (const u of skuUpdates) {
      expect(u).toContain("SET status = 'approved', isPublished = TRUE");
      expect(u).toContain("WHERE distributorId = 450001 AND status = 'pending' AND isPublished = 0 AND platformSku IN (");
      total += (u.match(/'[^']+-DL'/g) ?? []).length;
    }
    expect(total).toBe(360);
    const masters = updates.find((u) => u.includes("cabinet_dealz.cabinets"))!;
    expect(masters).toContain("SET isActive = TRUE, showInDesigner = TRUE, showInCatalog = TRUE, showIn2020 = TRUE");
    expect((masters.match(/'[^']+'/g) ?? []).length).toBe(59);
    // one statement per numbered block
    for (const blk of publishPart!.split(/\n(?=-- Block \d+:)/).slice(1)) expect((blk.match(/;\s*$/gm) ?? []).length).toBeGreaterThanOrEqual(1);
  });
  it("creates 59 unpublished masters, flagged 'review' (published AND flagged once the publish section runs), all NOT EXISTS guarded", () => {
    expect((insertCode.match(/INSERT INTO cabinet_dealz\.cabinets/g) ?? []).length).toBe(59);
    expect((insertCode.match(/, FALSE, FALSE, FALSE, FALSE, (?:TRUE|FALSE), (?:NULL|'[^']*'), 'review', '/g) ?? []).length).toBe(59);
    expect(insertCode).not.toMatch(/'conflict', '/);
    expect((code.match(/NOT EXISTS/g) ?? []).length).toBeGreaterThanOrEqual(59 * 2 + 4 * 2);
  });
  it("gives every one of the 90 DL items a pending SKU on each style", () => {
    for (const style of ["WS", "SSA", "SSE", "LUXE-TBD"]) {
      const block = insertCode.split("\n\n").find((b) => b.includes(`-${style}-DL`) && b.includes("INSERT INTO cabinet_dealz.distributor_skus"))!;
      expect((block.match(/ AS dlSku,/g) ?? []).length).toBe(90);
    }
  });
  it("I / D: new masters keep DL's nominal dims, and DL's own description / dims / page sit on the DL SKU, held not verified", () => {
    expect(sql).toMatch(/geometryWidth, geometryHeight, geometryDepth, geometrySourcePage, geometryStatus/);
    expect(sql).toMatch(/'DL Specification Book v\.11\/14\/23 p\.7' AS gPage, 'RH36 - Range Hood Cover \(DL spec book\)' AS dlName/);
    expect(sql).toMatch(/CASE WHEN m\.gPage IS NULL THEN NULL ELSE 'held' END/);
    expect(sql).toMatch(/SELECT 'W2118', [^\n]*, 21, 18, 12, 'wall'/);
  });
});

describe("publish blocks are safe after the DL go-live script", () => {
  it("SKU blocks only touch pending, unpublished SKUs of this PR and never write a price column", () => {
    const skuUpdates = publishCode.match(/^UPDATE cabinet_dealz\.distributor_skus[^\n]*\n[^\n]*/gm) ?? [];
    expect(skuUpdates.length).toBe(4);
    for (const u of skuUpdates) {
      expect(u).toContain("SET status = 'approved', isPublished = TRUE");
      expect(u).toContain("status = 'pending' AND isPublished = 0");
      expect(u).not.toMatch(/listPrice|yourCost|wholesalePrice|contractorPrice|homeownerPrice|adjustedListPrice/i);
    }
  });
  it("master block skips masters that are already fully published; a read-only 96A reports already-live SKUs", () => {
    expect(publishCode).toContain("AND (isActive = 0 OR showInDesigner = 0 OR showInCatalog = 0 OR showIn2020 = 0);");
    expect(publishPart).toContain("-- Block 96A (read-only");
    expect(publishCode).toMatch(/SELECT COUNT\(\*\) AS this_pr_skus_already_live/);
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
    const updates = (insertCode.match(/^UPDATE [^\n]*\n[^\n]*/gm) ?? []).join("\n");
    expect(updates).not.toMatch(/masterCode = '(TUK|SPRAYPAINT|SM8|REPV2796)'/);
    expect(sql).toMatch(/WMS3018[\s\S]*WOC3018/);
  });
  it("FLAT PANEL 28X96 is a field-cut hidden panel flagged for thickness and finish", () => {
    expect(sql).toContain("Field cut — panel is cut to fit on site by installer.");
    expect(sql).toMatch(/SELECT 'FLAT PANEL 28X96', .*FALSE, FALSE, FALSE, FALSE, TRUE, 'Field cut[^']*', 'review'/);
    expect(sql).toContain("3/4in thickness is TAKEN FROM THE 27X96 ROW");
    expect(sql).toContain("finish is NULL");
  });
});

describe("C: the generator creates Cabinet Conflict entries automatically (all 200 DL rows)", () => {
  const parse = (text: string) => {
    const lines = text.trim().split("\n"); const out: Record<string, string>[] = [];
    // crosswalk has quoted multi-comma fields: tiny CSV parser
    const rows: string[][] = []; let cur: string[] = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === ",") { cur.push(f); f = ""; } else if (c === "\n") { cur.push(f); rows.push(cur); cur = []; f = ""; } else f += c;
    }
    if (f || cur.length) { cur.push(f); rows.push(cur); }
    const head = rows[0];
    for (const r of rows.slice(1)) if (r.length >= head.length) out.push(Object.fromEntries(head.map((h, i) => [h, r[i]])));
    void lines; return out;
  };
  const rows = parse(xw);
  const conflicts = parse(read("dl_unmatched_conflicts.csv"));
  const flaggedMasters = new Set(conflicts.map((c) => c.masterCode));
  it("parses all 200 DL rows", () => { expect(rows.length).toBe(200); });
  it("every row the shared rule flags has a conflict entry on its master, with no manual step", () => {
    expect(ONBOARDING_CONFLICT_STATUS).toBe("review");
    let flagged = 0;
    for (const r of rows) {
      const level = onboardingConflictLevel({ supplierSku: r.dlSku, masterCode: r.masterCode, matchType: r.matchType, confidence: r.confidence });
      if (level === null) continue;
      flagged++;
      expect(flaggedMasters.has(r.masterCode || r.dlSku), `${r.dlSku} -> ${r.masterCode}`).toBe(true);
    }
    expect(flagged).toBeGreaterThanOrEqual(88);
    // and the SQL really carries each entry
    for (const m of flaggedMasters) {
      const q = `'${m.replace(/'/g, "''")}'`;
      expect(sql.includes(`WHERE masterCode = ${q} AND conflictStatus = 'none';`) || sql.includes(`SELECT ${q}, `), m).toBe(true);
    }
    expect(conflicts.length).toBe(89);
    expect(conflicts.every((c) => c.conflictStatus === "review")).toBe(true);
    expect(conflicts.filter((c) => c.kind !== "existing master").length).toBe(59);
  });
  it("rows the rule leaves unflagged are high-confidence mappings only", () => {
    for (const r of rows) {
      if (onboardingConflictLevel({ supplierSku: r.dlSku, masterCode: r.masterCode, matchType: r.matchType, confidence: r.confidence }) === null) {
        expect(r.confidence.toLowerCase()).toBe("high");
      }
    }
  });
});

describe("Cabinet Conflict rule (Tom, Oct 31)", () => {
  it("uses the existing conflictStatus / conflictReason / conflictedAt fields, no new flag", () => {
    expect(code).toMatch(/conflictStatus, conflictReason, conflictedAt\)/);
  });
  it("SP2436 is a flagged master with Tom's reason and a pending SKU", () => {
    expect(xw).toMatch(/^SP2436,SP2436,conflict-flagged,/m);
    expect(sql).toMatch(/SELECT 'SP2436', [^\n]*'review', 'Issue: Likely decorative door 24x36; not found in DL spec book; confirm\./);
    expect(sql).toMatch(/'SP2436' AS dlSku, 'SP2436' AS distSku, 'SP2436' AS masterCode, 33 AS listPrice/);
  });
  it("QUARTER DOOR and every report-only item is flagged, none skipped", () => {
    expect(xw).toMatch(/^QUARTER DOOR,QUARTER DOOR,conflict-flagged,/m);
    expect((xw.match(/,conflict-flagged,/g) ?? []).length).toBe(39);
  });
  it("SUPPLIER_ONBOARDING.md records the rules A-I", () => {
    const doc = fs.readFileSync(path.resolve(process.cwd(), "data/distributors/SUPPLIER_ONBOARDING.md"), "utf8");
    expect(doc).toContain("Unsure items go to the Cabinet Conflict tab");
    expect(doc).toContain("Do not invent a new flag");
    for (const k of ["A. No skipping", "B. No price changes", "C. Unsure = Cabinet Conflict", "C (automatic)", "D. Naming", "E. Never cross-link unique items", "F. Everything is published", "G. No unpublished masters", "H. Never delete automatically", "I. Nominal dimensions"]) expect(doc).toContain(k);
  });
});
