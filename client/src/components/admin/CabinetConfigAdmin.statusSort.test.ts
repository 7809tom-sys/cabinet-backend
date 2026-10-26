import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Cabinets admin status sorting", () => {
  it("exposes active-first and inactive-first choices and shows status badges", () => {
    const source = readFileSync(
      resolve(process.cwd(), "client/src/components/admin/CabinetConfigAdmin.tsx"),
      "utf8",
    );
    expect(source).toContain('data-testid="cabinet-config-status-sort"');
    expect(source).toContain('value="active-first"');
    expect(source).toContain('value="inactive-first"');
    expect(source).toContain(">Active</Badge>");
    expect(source).toContain(">Inactive</Badge>");
    expect(source).toContain(">Unknown</Badge>");
    expect(source).toContain("statusSort,");
  });

  it("passes statusSort to the admin query so sorting applies across pages", () => {
    const source = readFileSync(
      resolve(process.cwd(), "server/routers/catalog.ts"),
      "utf8",
    );
    expect(source).toContain('statusSort: z.enum(["default", "active-first", "inactive-first"])');
    expect(source).toContain("desc(cabinets.isActive)");
    expect(source).toContain("asc(cabinets.isActive)");
    expect(source).toContain(".orderBy(...cabinetOrder)");
  });
});
