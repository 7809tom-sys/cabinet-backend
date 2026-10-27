import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const design = readFileSync(new URL("./routers/design.ts", import.meta.url), "utf8");
const orders = readFileSync(new URL("./routers/orders.ts", import.meta.url), "utf8");
const crm = readFileSync(new URL("./routers/crm.ts", import.meta.url), "utf8");

describe("affiliate pipeline hooks", () => {
  it("attaches designer leads in the owning affiliate pipeline", () => {
    expect(design).toContain("ensureAffiliatePipelineDeal");
    expect(design).toContain('match: "email"');
    expect(design).toContain("affiliateId,");
  });

  it("attaches submitted orders with their affiliate id and dedupes on the order", () => {
    expect(orders).toContain("ensureAffiliatePipelineDeal");
    expect(orders).toContain('match: "order"');
    expect(orders).toContain("affiliateId,");
  });

  it("keeps storefront quotes on the design's affiliate pipeline", () => {
    expect(crm).toContain("affiliateId: design.affiliateId");
  });
});
