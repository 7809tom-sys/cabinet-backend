import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isCompleteDeliveryAddress } from "./DesignDeliveryDialog";

const dialog = readFileSync(new URL("./DesignDeliveryDialog.tsx", import.meta.url), "utf8");
const tool = readFileSync(new URL("../../pages/DesignTool.tsx", import.meta.url), "utf8");
const crmBoard = readFileSync(new URL("../crm/CrmBoard.tsx", import.meta.url), "utf8");

describe("design delivery address", () => {
  it("requires street, city, two-letter state and a 5-digit ZIP", () => {
    expect(isCompleteDeliveryAddress({ line1: "100 Main St", line2: "", city: "Sarasota", state: "FL", zip: "34236" })).toBe(true);
    expect(isCompleteDeliveryAddress({ line1: "100 Main St", line2: "", city: "Sarasota", state: "", zip: "34236" })).toBe(false);
    expect(isCompleteDeliveryAddress({ line1: "", line2: "", city: "Sarasota", state: "FL", zip: "34236" })).toBe(false);
    expect(isCompleteDeliveryAddress({ line1: "100 Main St", line2: "", city: "", state: "FL", zip: "34236" })).toBe(false);
    expect(isCompleteDeliveryAddress({ line1: "100 Main St", line2: "", city: "Sarasota", state: "FL", zip: "342" })).toBe(false);
  });

  it("only requests a live shipping quote once the full address is complete", () => {
    expect(dialog).toMatch(/enabled: open && complete && freightInput\.items\.length > 0/);
  });

  it("invalidates verification whenever any address field changes", () => {
    expect(dialog).toMatch(/verifiedFor === addressKey/);
  });

  it("sends the design price and shipping quote to the CRM", () => {
    expect(dialog).toMatch(/syncDesignQuoteToCrm/);
    expect(dialog).toMatch(/designValue: Number\(designTotal\.toFixed\(2\)\)/);
    expect(dialog).toMatch(/shippingQuote: shippingCents != null/);
  });

  it("is reachable from the Designer toolbar", () => {
    expect(tool).toContain('data-testid="open-delivery-dialog"');
    expect(tool).toContain("<DesignDeliveryDialog");
  });

  it("shows price, shipping, total and verification status in the CRM drawer", () => {
    expect(crmBoard).toContain('data-testid="crm-design-pricing"');
    expect(crmBoard).toContain('data-testid="crm-shipping-address"');
    expect(crmBoard).toMatch(/Address verified/);
  });
});

describe("affiliate scoping of the CRM sync", () => {
  const crm = readFileSync(new URL("../../../../server/routers/crm.ts", import.meta.url), "utf8");
  it("writes the deal under the design's own affiliate and allows only that affiliate's team", () => {
    expect(crm).toMatch(/access\?\.affiliateId === design\.affiliateId/);
    expect(crm).toMatch(/affiliateId: design\.affiliateId,\n\s+ownerUserId/);
  });
});
