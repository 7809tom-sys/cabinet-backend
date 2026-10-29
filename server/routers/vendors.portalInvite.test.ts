import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./vendors.ts", import.meta.url), "utf8");

describe("approved vendor portal email invitation", () => {
  it("uses Cabinet Dealz email settings and refuses to activate a token before successful delivery", () => {
    expect(source).toContain("emailPortalInvite: adminProcedure");
    expect(source).toContain("resendConfigured()");
    expect(source).toContain("sendEmail({");
    expect(source).toContain("Email sending is not configured. Set RESEND_API_KEY and ORDER_EMAIL_FROM");
    expect(source).toContain("if (!delivery.success)");
    const deliveryIndex = source.indexOf("const delivery = await sendEmail");
    const persistenceIndex = source.indexOf("inviteToken: token", deliveryIndex);
    expect(deliveryIndex).toBeGreaterThan(-1);
    expect(persistenceIndex).toBeGreaterThan(deliveryIndex);
  });

  it("builds an invitation from the exact approved vendor record and never requires a catalog source line", () => {
    expect(source).toContain("buildSupplierPortalInvite");
    expect(source).toContain("vendorName: vendor.name");
    expect(source).toContain("recipientEmail: input.toEmail");
    expect(source).not.toContain("distributorId: input.toEmail");
  });
});
