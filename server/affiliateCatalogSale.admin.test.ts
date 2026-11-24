import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctx(role: "user" | "admin" | null): TrpcContext {
  return {
    user: role == null ? null : { id: 1, openId: "admin-open", name: "Admin", email: "admin@example.com", role } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("affiliate catalog sale admin endpoints", () => {
  it("rejects non-admins from setting Pelican and hardware affiliate prices", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.pelican.setAffiliateSalePrice({ id: 1, affiliateSalePrice: 12 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.pelican.setMarkup({ category: "Flooring", markupBps: 1000, affiliateMarkupBps: 500 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.hardware.setAffiliateMarkup({ category: "Pulls", affiliateMarkupBps: 1000 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.hardware.setAffiliateSalePrice({ id: 1, affiliateSalePrice: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const user = appRouter.createCaller(ctx("user"));
    await expect(user.hardware.getAffiliateMarkups()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
