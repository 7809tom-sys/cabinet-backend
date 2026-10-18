import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const admin = readFileSync(
  resolve(process.cwd(), "client/src/components/admin/ShippingAdmin.tsx"),
  "utf8",
);
const freight = readFileSync(
  resolve(process.cwd(), "server/routers/freight.ts"),
  "utf8",
);

describe("shipping log saved-design links", () => {
  it("renders an ordinary HTML link for an authorized saved plan in both log tables", () => {
    expect(admin).toContain("function SavedDesignLink");
    expect(admin).toContain("href={design.url}");
    expect(admin).toContain('data-testid={`freight-design-link-${design.id}`}');
    expect(admin).toContain("<TableHead className=\"text-xs\">Saved design</TableHead>");
    expect(admin).toContain("<SavedDesignLink design={r.design} />");
    expect(admin).toContain("<SavedDesignLink design={log.design} />");
    expect(admin).toContain("No saved design");
  });

  it("uses the same saved-plan route shape as the Designer and retains a link only after authorization", () => {
    expect(freight).toContain("function freightHistoryDesignPath");
    expect(freight).toContain('new URLSearchParams({ load: String(designId), preview: "3d" })');
    expect(freight).toContain("resolveAuthorizedFreightQuoteDesignId");
    expect(freight).toContain("if (!requestedDesignId || !user) return null");
    expect(freight).toContain("attachFreightHistoryDesigns");
  });
});
