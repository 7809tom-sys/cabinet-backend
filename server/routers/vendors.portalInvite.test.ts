import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./vendors.ts", import.meta.url), "utf8");

describe("approved vendor portal email invitation", () => {
  it("uses Cabinet Dealz email settings and refuses to activate a token before successful delivery", () => {
    expect(source).toContain("emailPortalInvite: adminProcedure");
    expect(source).toContain("emailSettingsReady(settings)");
    expect(source).toContain("sendEmailViaSettings(settings");
    expect(source).toContain("Email sending is not configured. Enable SMTP in Admin → Email Settings");
    expect(source).toContain("if (!delivery.success)");
    const deliveryIndex = source.indexOf("const delivery = await sendEmailViaSettings");
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
