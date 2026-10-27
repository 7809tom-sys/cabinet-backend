import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const priceShop = readFileSync(new URL("./priceShop.ts", import.meta.url), "utf8");
const designAssist = readFileSync(new URL("./designAssist.ts", import.meta.url), "utf8");
const customerAccount = readFileSync(new URL("./customerAccount.ts", import.meta.url), "utf8");

describe("customer feature routers stay isolated", () => {
  it("saves a kitchen package as a copy and does not update the source design", () => {
    const body = priceShop.slice(priceShop.indexOf("saveDesignAsPackage:"), priceShop.indexOf("refreshBundlePrices:"));
    expect(body).toContain("planKitchenPackageCopy");
    expect(body).not.toContain("update(kitchenDesigns)");
    expect(body).not.toContain("delete(kitchenDesigns)");
    expect(body).toContain("updatesSourceDesign");
  });

  it("does not delete a customer design from assisted editing", () => {
    expect(designAssist).not.toContain("delete(kitchenDesigns)");
    expect(designAssist).toContain("planAssistedRevision");
    expect(designAssist).toContain("planSuggestedCopy");
  });

  it("deletes a project only through the customer account owner check", () => {
    expect(customerAccount).toContain("canEditCustomerProject");
    expect(customerAccount).not.toContain("decideAssistAccess");
  });
});
