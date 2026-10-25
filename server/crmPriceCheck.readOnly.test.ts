import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// The weekly CRM price check is REPORT ONLY. These source checks fail the build if
// anyone ever adds a write to the check scripts.
const dir = path.resolve(import.meta.dirname, "../scripts/crm-price-check");
const files = fs.readdirSync(dir).filter((f) => /\.(mts|py|sh)$/.test(f));

describe("weekly CRM price check stays read-only", () => {
  it("has the expected scripts", () => {
    expect(files).toEqual(expect.arrayContaining(["export-deals.mts", "snapshot.mts", "read-totals.py", "build-report.py", "run-check.sh"]));
  });

  for (const f of files) {
    it(`${f} contains no database writes`, () => {
      const src = fs.readFileSync(path.join(dir, f), "utf8")
        .split("\n").filter((l) => !/^\s*(\/\/|#)/.test(l)).join("\n");
      expect(src).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|TRUNCATE|ALTER\s+TABLE)\b/i);
      // Drizzle write builders only apply to the TypeScript scripts (Python dict.update() is harmless).
      if (f.endsWith(".mts")) expect(src).not.toMatch(/\.(insert|update|delete)\(/);
    });
  }

  it("blocks save / lead / order / email calls while reading designs", () => {
    const src = fs.readFileSync(path.join(dir, "read-totals.py"), "utf8");
    for (const proc of ["design.captureLead", "design.save", "orders.submit", "crm.sendEmail"]) expect(src).toContain(proc.replace(".", "\\."));
  });

  it("authenticates the browser with a Supabase session, not a retired cookie, and has no machine-specific paths", () => {
    const exportDeals = fs.readFileSync(path.join(dir, "export-deals.mts"), "utf8");
    expect(exportDeals).toContain("SUPABASE_JWT_SECRET");
    expect(exportDeals).toContain("session.json");
    expect(exportDeals).not.toContain("createSessionToken");
    const reader = fs.readFileSync(path.join(dir, "read-totals.py"), "utf8");
    expect(reader).toContain("add_init_script");
    expect(reader).not.toContain("app_session_id");
    for (const f of files) {
      expect(fs.readFileSync(path.join(dir, f), "utf8")).not.toContain("/home/ubuntu");
    }
  });

  it("starts the private server with the view log switched off", () => {
    expect(fs.readFileSync(path.join(dir, "run-check.sh"), "utf8")).toContain("CD_SKIP_VIEW_LOG=1");
  });
});
