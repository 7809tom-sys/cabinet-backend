import { describe, expect, it, vi } from "vitest";
import { buildSalesDemoInvite, deliverInviteThenGrant } from "./salesDemoInvite";

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
});
