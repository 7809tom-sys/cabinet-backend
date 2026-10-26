import { describe, expect, it } from "vitest";
import type { Affiliate } from "../../drizzle/schema";
import { PUBLIC_STOREFRONT_OMITTED_FIELDS, toAdminAffiliate, toPublicStorefront, toViewerAffiliate } from "./affiliatePrivacy";

const fullTaxId = "123456789";

function affiliate(): Affiliate {
  return {
    id: 42,
    storeName: "Secret Shop",
    slug: "secret-shop",
    contactName: "Owner Name",
    email: "owner-login@example.com",
    phone: "555-0100",
    referralCode: "SECRET",
    status: "active",
    userId: 99,
    storefrontEnabled: true,
    w9TaxId: fullTaxId,
    w9TaxIdLast4: "6789",
    w9IdDocumentUrl: "/manus-storage/affiliate-w9-id/license.jpg",
    notes: "private notes",
    setupToken: "setup-secret",
    commissionRate: "0.1000",
    publicEmail: "hello@shop.example",
    publicPhone: "555-0199",
    publicAddress: "1 Main",
    embedEnabled: false,
    embedCode: null,
    location: "Tampa",
  } as Affiliate;
}

describe("affiliate privacy DTOs", () => {
  it("returns only public storefront fields", () => {
    const dto = toPublicStorefront(affiliate());
    const serialized = JSON.stringify(dto);
    for (const field of PUBLIC_STOREFRONT_OMITTED_FIELDS) {
      expect(dto).not.toHaveProperty(field);
    }
    expect(serialized).not.toContain(fullTaxId);
    expect(serialized).not.toContain("owner-login@example.com");
    expect(serialized).not.toContain("555-0100");
    expect(serialized).not.toContain("Owner Name");
    expect(dto.publicEmail).toBe("hello@shop.example");
    expect(dto.publicPhone).toBe("555-0199");
  });

  it("hides the owner's private identity and tax ID from a team member", () => {
    const dto = toViewerAffiliate(affiliate(), { isOwner: false, accessCrm: true, accessDesigner: false });
    const serialized = JSON.stringify(dto);
    expect(dto.email).toBeNull();
    expect(dto.phone).toBeNull();
    expect(dto.contactName).toBeNull();
    expect(dto.commissionRate).toBeNull();
    expect(serialized).not.toContain(fullTaxId);
    expect(serialized).not.toContain("affiliate-w9-id");
    expect(serialized).not.toContain("setup-secret");
    expect(serialized).not.toContain("private notes");
    expect(dto).not.toHaveProperty("w9TaxId");
  });

  it("shows the owner a masked tax ID and no raw government-ID URL", () => {
    const dto = toViewerAffiliate(affiliate(), { isOwner: true, accessCrm: true, accessDesigner: true });
    expect(dto.email).toBe("owner-login@example.com");
    expect(dto.w9TaxIdMasked).toBe("***-**-6789");
    expect(dto.w9TaxIdLast4).toBe("6789");
    expect(JSON.stringify(dto)).not.toContain(fullTaxId);
    expect(dto).not.toHaveProperty("w9IdDocumentUrl");
    expect(dto.hasW9IdDocument).toBe(true);
  });

  it("gives admins last four, not the full tax ID or document URL", () => {
    const dto = toAdminAffiliate(affiliate());
    expect(dto.w9TaxId).toBeNull();
    expect(dto.w9IdDocumentUrl).toBeNull();
    expect(dto.setupToken).toBeNull();
    expect(dto.hasSetupToken).toBe(true);
    expect(dto.w9TaxIdMasked).toBe("***-**-6789");
    expect(dto.hasW9IdDocument).toBe(true);
    expect(dto.notes).toBe("private notes");
    expect(JSON.stringify(dto)).not.toContain(fullTaxId);
  });
});
