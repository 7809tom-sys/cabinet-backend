import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const portal = readFileSync("client/src/pages/VendorPortal.tsx", "utf8");
const panel = readFileSync("client/src/components/vendor/VendorCodeUpload.tsx", "utf8");
const router = readFileSync("server/routers/vendorCodeUpload.ts", "utf8");
const appRouter = readFileSync("server/routers.ts", "utf8");

describe("vendor Upload by code wiring", () => {
  it("puts an 'Upload by code' button on My Catalog and passes the admin's chosen line", () => {
    expect(portal).toContain('import { VendorCodeUpload } from "@/components/vendor/VendorCodeUpload"');
    expect(portal).toMatch(/Upload by code/);
    expect(portal).toMatch(/<VendorCodeUpload distributorId=\{adminDistId\}/);
  });
  it("always previews before saving, and the save button states the count", () => {
    expect(panel).toMatch(/vendorCodeUpload\.preview\.useMutation/);
    expect(panel).toMatch(/vendorCodeUpload\.commit\.useMutation/);
    expect(panel).toMatch(/Save \{summary\.added \+ summary\.updated\} change/);
    expect(panel).toMatch(/disabled=\{!canSave\}/);
  });
  it("reads .xlsx on demand rather than shipping the reader with the portal", () => {
    expect(panel).toMatch(/await import\("xlsx"\)/);
    expect(panel).not.toMatch(/^import .* from "xlsx"/m);
  });
  it("registers the router and keeps it behind the distributor guard with a server-side re-plan", () => {
    expect(appRouter).toMatch(/vendorCodeUpload: vendorCodeUploadRouter/);
    expect(router.match(/distributorProcedure/g)?.length).toBeGreaterThanOrEqual(3);
    expect(router).not.toMatch(/publicProcedure|protectedProcedure/);
    // commit plans from the raw rows itself; it never accepts a client-made plan
    expect(router).toMatch(/commit: distributorProcedure[\s\S]*planCodeUpload\(/);
  });
  it("creates new masters hidden and never publishes uploaded SKUs", () => {
    expect(router).toMatch(/showInCatalog: false/);
    expect(router).toMatch(/showInDesigner: false/);
    expect(router).toMatch(/status: "pending"/);
    expect(router).toMatch(/isPublished: false/);
  });
});
