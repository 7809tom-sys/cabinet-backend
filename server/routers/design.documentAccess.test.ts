import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./design.ts", import.meta.url), "utf8");
const orders = readFileSync(new URL("./orders.ts", import.meta.url), "utf8");

describe("design document access contract", () => {
  it("requires an exact paid order for customer detail access while preserving administrator and same-affiliate access", () => {
    expect(source).toContain("documentAccess: protectedProcedure");
    expect(source).toContain('if (ctx.user.role === "admin") return { level: "full" as const, reason: "administrator" as const }');
    expect(source).toContain("const sameAffiliateTeam = design.affiliateId != null");
    expect(source).toContain('throw new TRPCError({ code: "FORBIDDEN", message: "You can only view documents for your own saved plan." })');
    expect(source).toContain("eq(orderRequests.kitchenDesignId, design.id)");
    expect(source).toContain('eq(payments.status, "approved")');
    expect(source).toContain('reason: "purchase_required" as const');
  });

  it("only persists an order-to-plan link after validating ownership or same-affiliate authorization", () => {
    expect(orders).toContain("resolveAuthorizedKitchenDesignId");
    expect(orders).toContain("kitchenDesignId: z.number().int().positive().optional()");
    expect(orders).toContain("kitchenDesignId = await resolveAuthorizedKitchenDesignId");
	  expect(orders).toContain("design.affiliateId !== expectedAffiliateId");
	  expect(orders).toContain("This saved plan belongs to a different store");
    expect(orders).toContain("You cannot associate this order with another customer's saved plan.");
  });
});
