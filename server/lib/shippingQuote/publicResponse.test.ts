import { describe, expect, it } from "vitest";
import { redactVendorLineForClient } from "../../../shared/shippingQuote";
import { publicShippingQuotes } from "./assemble";

describe("customer shipping quote payload", () => {
  it("returns the source label and leaves the secret and quote URL out", () => {
    const payload = publicShippingQuotes([{
      ok: true,
      vendorScope: "dist:4",
      vendorName: "Example Supply",
      itemIndexes: [0],
      source: "vendor_live",
      sourceLabel: "Vendor live quote",
      estimate: false,
      options: [{ carrier: "Example", method: "Ground", costCents: 1200, transitDays: 3, expiresAt: null }],
      note: null,
    }]);
    expect(payload[0]).toMatchObject({ source: "vendor_live", sourceLabel: "Vendor live quote", estimate: false });
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(JSON.stringify(payload)).not.toContain("https://");
  });

  it("drops an encrypted vendor secret before the admin vendor list is returned", () => {
    const row = redactVendorLineForClient({
      id: 1,
      name: "Pelican",
      shippingQuoteSecretEncrypted: "cabinetdealz:distributor-integration:v1:hidden",
      shippingQuoteUrl: "https://quotes.example.test/rate",
    });
    expect(row.hasShippingQuoteSecret).toBe(true);
    expect(row).not.toHaveProperty("shippingQuoteSecretEncrypted");
    expect(JSON.stringify(row)).not.toContain("hidden");
  });
});
