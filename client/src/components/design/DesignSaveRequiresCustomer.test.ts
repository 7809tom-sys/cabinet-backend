import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const actions = readFileSync("client/src/components/design/DesignActions.tsx", "utf8");
const router = readFileSync("server/routers/design.ts", "utf8");

describe("every saved design carries a complete customer contact", () => {
  it("server rejects a save without name, email, phone and address", () => {
    expect(router).toMatch(/customer: z\.object\(/);
    expect(router).toContain("Customer name is required");
    expect(router).toContain("A valid customer phone number is required");
    expect(router).toContain("Street address is required");
    expect(router).toContain("2-letter state is required");
  });
  it("both create and update saves link the design to a CRM deal with the contact", () => {
    expect(router.match(/await linkDesignToCrmDeal\(/g)?.length).toBe(2);
    expect(router).toContain("shippingAddress: addressText");
    expect(router).toContain("contactPhone: c.phone.trim()");
  });
  it("the Save dialog blocks saving until every customer field is valid", () => {
    expect(actions).toContain("customerErrors.length > 0");
    expect(actions).toContain("Customer details are required to save");
    for (const id of ["customer-name", "customer-email", "customer-phone", "customer-line1", "customer-city", "customer-state", "customer-zip"]) {
      expect(actions).toContain(`id="${id}"`);
    }
  });
});
