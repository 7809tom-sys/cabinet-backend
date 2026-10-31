import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const design = read("./routers/design.ts");
const catalog = read("./routers/catalog.ts");
const orders = read("./routers/orders.ts");
const distributorAdmin = read("./routers/distributors.ts");
const lib = read("./lib/distributorPreview.ts");
const designTool = read("../client/src/pages/DesignTool.tsx");
const lineEditor = read("../client/src/components/admin/LineBrandingEditor.tsx");
const goLiveDialog = read("../client/src/components/admin/GoLiveDialog.tsx");

describe("admin preview wiring (every distributor)", () => {
  it("decides visibility from the admin role and the supplier's isActive flag, not from a supplier code or user", () => {
    expect(lib).toContain("eq(distributors.isActive, false)");
    expect(read("../shared/distributorPreview.ts")).toContain('user?.role === "admin"');
    expect(lib).not.toMatch(/code, "DL"|userId ===|email ===/);
  });

  it("uses the shared SKU visibility rule in every Designer price and palette query that had the AEF-only preview", () => {
    expect(design.match(/skuVisibleToViewer\(adminAefPreview\)/g)?.length).toBe(3);
    expect(design).not.toContain('and(eq(distributorSkus.isPublished, false), eq(distributors.code, "AEF")),');
    expect(catalog).toContain("skuVisibleToViewer(includeAdminAefPreview)");
  });

  it("returns offline suppliers and their door styles only to admins, flagged isPreview", () => {
    expect(catalog).toContain("canSeePreviewSuppliers(ctx.user)");
    expect(catalog).toContain("isPreview: isPreviewSupplier(d)");
    expect(catalog).toContain("or(eq(doorStyles.isActive, true), eq(distributors.isActive, false))");
    expect(catalog).toContain("and(eq(doorStyles.isActive, true), eq(distributors.isActive, true))");
    expect(catalog).toContain("isPreview: isPreviewSupplier({ isActive: distributorIsActive })");
  });

  it("blocks ordering and quote submission for preview suppliers, admins included", () => {
    expect(orders).toContain("await assertNoPreviewSuppliers(db, {");
    expect(orders).toContain("distributorIds: normalizedLines.map((line) => line.distributorId)");
    expect(orders).toContain("styleIds: [input.styleId, ...normalizedLines.map((line) => line.styleId)]");
    expect(orders.indexOf("assertNoPreviewSuppliers(db")).toBeLessThan(orders.indexOf("const hardwareLines = normalizedLines"));
  });

  it("goes live through one extended toggle: terms required, one transaction, acceptance recorded", () => {
    expect(distributorAdmin.match(/setActive: adminProcedure/g)?.length).toBe(1);
    expect(distributorAdmin).toContain("acceptedTerms: z.literal(true");
    expect(distributorAdmin).toContain("db.transaction(async (tx) =>");
    expect(distributorAdmin).toContain("goLiveAcceptedByUserId: ctx.user.id");
    expect(distributorAdmin).toContain("goLiveAcceptedAt: new Date()");
    expect(distributorAdmin).toContain("goLiveTermsSnapshot");
    expect(distributorAdmin).toContain("This supplier has not gone live yet. Use Go live");
  });

  it("shows the badge on suppliers and door styles only when isPreview, and the Go live dialog only for an offline supplier", () => {
    expect((designTool.match(/isPreview && <AdminPreviewBadge/g) ?? []).length).toBe(7);
    expect(lineEditor).toContain("!d.isActive && !d.goLiveAcceptedAt");
    expect(goLiveDialog).toContain("disabled={!terms || !accepted || goLive.isPending}");
    expect(goLiveDialog).toContain("acceptedTerms: true");
  });

  it("ships a migration for the acceptance columns", () => {
    const migration = read("../drizzle/0226_distributor_go_live_acceptance.sql");
    for (const column of ["goLiveAcceptedByUserId", "goLiveAcceptedAt", "goLiveTermsVersion", "goLiveTermsSnapshot"]) {
      expect(migration).toContain(column);
      expect(read("../drizzle/schema.ts")).toContain(`"${column}"`);
    }
    expect(read("../drizzle/meta/_journal.json")).toContain("0226_distributor_go_live_acceptance");
  });
});
