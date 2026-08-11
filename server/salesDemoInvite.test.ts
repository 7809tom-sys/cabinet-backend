import { describe, expect, it, vi } from "vitest";
import { buildSalesDemoInvite, deliverInviteThenGrant, isSalesDemoAffiliateTarget, SALES_DEMO_AFFILIATE_SLUG, SALES_DEMO_TEAM_ACCESS } from "./salesDemoInvite";

describe("Sales Demo invitation", () => {
  it("creates candidate links scoped only to the Sales Demo affiliate", () => {
    const invite = buildSalesDemoInvite({
      recipientName: "Alex",
      audience: "affiliate_candidate",
      origin: "https://www.cabinetdealz.com/",
    });

    expect(invite.storefrontUrl).toBe("https://www.cabinetdealz.com/store/sales-demo?ref=SALESDEMO");
    expect(invite.designerUrl).toBe("https://www.cabinetdealz.com/design?affiliate=sales-demo&ref=SALESDEMO");
    expect(invite.orderUrl).toBe("https://www.cabinetdealz.com/store/sales-demo/order?ref=SALESDEMO");
    expect(invite.text).toContain("does not include First Class");
  });

  it("does not grant training access when delivery fails", async () => {
    const grant = vi.fn();
    const result = await deliverInviteThenGrant({
      deliver: async () => ({ success: false, error: "SMTP unavailable" }),
      grant,
    });

    expect(result).toEqual({ success: false, error: "SMTP unavailable" });
    expect(grant).not.toHaveBeenCalled();
  });

  it("delivers before granting Sales Demo access", async () => {
    const calls: string[] = [];
    const result = await deliverInviteThenGrant({
      deliver: async () => { calls.push("deliver"); return { success: true }; },
      grant: async () => { calls.push("grant"); },
    });

    expect(result.success).toBe(true);
    expect(calls).toEqual(["deliver", "grant"]);
  });

  it("uses CRM and designer permissions for the Sales Demo salesperson role only", () => {
    expect(SALES_DEMO_TEAM_ACCESS).toEqual({
      role: "salesperson",
      accessCrm: true,
      accessDesigner: true,
      isActive: true,
    });
  });

  it("recognizes only the isolated Sales Demo affiliate as a valid invitation target", () => {
    expect(SALES_DEMO_AFFILIATE_SLUG).toBe("sales-demo");
    expect(isSalesDemoAffiliateTarget("sales-demo")).toBe(true);
    expect(isSalesDemoAffiliateTarget("firstclass")).toBe(false);
    expect(isSalesDemoAffiliateTarget("reaves-way-cabinet-shop")).toBe(false);
  });
});
