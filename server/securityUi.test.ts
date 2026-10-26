import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../client/src/pages/AffiliateDashboard.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../client/src/components/admin/AffiliatesAdmin.tsx", import.meta.url), "utf8");
const qbo = readFileSync(new URL("../client/src/components/admin/QuickBooksAdmin.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("./routers/orders.ts", import.meta.url), "utf8");

describe("security UI and alias gate", () => {
  it("shows a masked tax ID and a signed government-ID link", () => {
    expect(dashboard).toContain("w9IdDocumentLink.fetch");
    expect(dashboard).toContain("hasIdDocument");
    expect(dashboard).not.toContain("w9.w9IdDocumentUrl");
    expect(dashboard).not.toContain("setIdPreview(data.url)");
    expect(admin).toContain("adminW9IdDocumentLink.fetch");
    expect(admin).toContain("a.w9TaxIdMasked");
    expect(admin).not.toContain("a.w9IdDocumentUrl");
  });

  it("sends the admin session when starting QuickBooks OAuth", () => {
    expect(qbo).toContain('Accept: "application/json"');
    expect(qbo).toContain("Authorization: `Bearer ${token}`");
    expect(qbo).not.toContain('window.location.href = "/api/qbo/connect"');
  });

  it("requires an admin to save a code alias", () => {
    expect(orders).toContain("saveAlias: adminProcedure");
  });
});
