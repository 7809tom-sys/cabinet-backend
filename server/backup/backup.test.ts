import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error plain .mjs helper
import { chicagoDate, snapshotDay, groupForDay, planRotation, safeRelPath, joinInside, parseEnvText, parseArgs } from "../../scripts/backup/lib.mjs";

describe("backup helpers (no network)", () => {
  it("uses America/Chicago dates", () => {
    expect(chicagoDate(new Date("2026-11-24T05:30:00Z"))).toBe("2026-11-23"); // 11:30 PM CST
    expect(chicagoDate(new Date("2026-11-24T06:30:00Z"))).toBe("2026-11-24");
  });
  it("numbers snapshot days with today as day 1", () => {
    expect(snapshotDay("2026-11-23", "2026-11-23")).toBe(1);
    expect(snapshotDay("2026-11-22", "2026-11-23")).toBe(2);
    expect(snapshotDay("2026-10-25", "2026-11-23")).toBe(30);
    expect(snapshotDay("2026-10-24", "2026-11-23")).toBe(31);
  });
  it("groups days 1-30, 31-60, 61-90 and older", () => {
    expect([1, 30].map(groupForDay)).toEqual(["days-01-30", "days-01-30"]);
    expect([31, 60].map(groupForDay)).toEqual(["days-31-60", "days-31-60"]);
    expect([61, 90].map(groupForDay)).toEqual(["days-61-90", "days-61-90"]);
    expect(groupForDay(91)).toBe("older-than-90");
    expect(groupForDay(0)).toBe("future");
  });
  it("plans rotation, ignoring non-date folders", () => {
    const today = "2026-11-23";
    const plan = planRotation(["2026-11-23", "2026-10-20", "2026-09-01", "2026-08-01", "2026-01-01", "notes", "2026-12-01"], today);
    expect(plan["days-01-30"].map((s: any) => s.name)).toEqual(["2026-11-23"]);
    expect(plan["days-31-60"].map((s: any) => s.name)).toEqual(["2026-10-20"]);
    expect(plan["days-61-90"].map((s: any) => s.name)).toEqual(["2026-09-01"]);
    expect(plan["older-than-90"].map((s: any) => s.name)).toEqual(["2026-08-01", "2026-01-01"]);
    expect(plan.future.map((s: any) => s.name)).toEqual(["2026-12-01"]);
    expect(plan.ignored).toEqual(["notes"]);
  });
  it("sanitises object paths and blocks escapes", () => {
    expect(safeRelPath("a/../b/c:d?.png")).toBe("a/_/b/c_d_.png");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bk-"));
    expect(() => joinInside(root, "..", "x")).toThrow();
    expect(() => joinInside(root, "daily", "2026-01-01")).not.toThrow();
  });
  it("parses env files and args without needing real keys", () => {
    expect(parseEnvText('A=1\nB="two" # c\n# x\nC=three # note')).toEqual({ A: "1", B: "two", C: "three" });
    expect(parseArgs(["--dest", "E:\\x", "--prune"])).toMatchObject({ dest: "E:\\x", prune: true });
  });
  it("prune deletes only old date folders on the dest (integration with temp dir)", async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "bk-"));
    for (const d of ["2026-11-23", "2026-08-01", "keepme"]) fs.mkdirSync(path.join(dest, "daily", d), { recursive: true });
    const { spawnSync } = await import("node:child_process");
    const script = path.resolve(process.cwd(), "scripts/backup/rotate-backups.mjs");
    let r = spawnSync("node", [script, "--dest", dest, "--today", "2026-11-23"], { encoding: "utf8" });
    expect(r.stdout).toContain("would remove");
    expect(fs.existsSync(path.join(dest, "daily", "2026-08-01"))).toBe(true);
    expect(fs.readFileSync(path.join(dest, "INDEX.txt"), "utf8")).toContain("days-01-30");
    r = spawnSync("node", [script, "--dest", dest, "--today", "2026-11-23", "--prune"], { encoding: "utf8" });
    expect(fs.existsSync(path.join(dest, "daily", "2026-08-01"))).toBe(false);
    expect(fs.existsSync(path.join(dest, "daily", "2026-11-23"))).toBe(true);
    expect(fs.existsSync(path.join(dest, "daily", "keepme"))).toBe(true);
  });
});

describe("retention beyond 90 days", () => {
  it("keeps days 91..retention in their own group", () => {
    const plan = planRotation(["2026-11-23", "2026-07-01", "2026-01-01"], "2026-11-23", 180);
    expect(plan["days-91-plus"].map((s: any) => s.name)).toEqual(["2026-07-01"]);
    expect(plan["older-than-90"].map((s: any) => s.name)).toEqual(["2026-01-01"]);
  });
});
