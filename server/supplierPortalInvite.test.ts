import { describe, expect, it } from "vitest";
import { buildSupplierPortalInvite } from "./supplierPortalInvite";

describe("supplier portal invitation", () => {
  it("creates a private setup link scoped to the recipient and vendor", () => {
    const invite = buildSupplierPortalInvite({
      vendorName: "Skyline Cabinetry",
      recipientName: "Alex Supplier",
      recipientEmail: "alex@skyline.example",
      inviteToken: "private-token-123",
      origin: "https://www.cabinetdealz.com",
    });

    expect(invite.setupUrl).toBe("https://www.cabinetdealz.com/vendor?invite=private-token-123");
    expect(invite.subject).toContain("Skyline Cabinetry");
    expect(invite.text).toContain("alex@skyline.example");
    expect(invite.text).toContain("one-time link");
    expect(invite.html).toContain("Set up your supplier login");
  });

  it("falls back to the canonical site origin instead of trusting an invalid request origin", () => {
    const invite = buildSupplierPortalInvite({
      vendorName: "Pelican",
      recipientEmail: "supplier@pelican.example",
      inviteToken: "safe-token",
      origin: "http://untrusted.example",
    });

    expect(invite.setupUrl).toBe("https://www.cabinetdealz.com/vendor?invite=safe-token");
  });
});
