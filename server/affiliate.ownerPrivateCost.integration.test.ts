import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { affiliates, distributorSkus, users } from "../drizzle/schema";
import { getDb, getPlatformPricingSettings } from "./db";
import { resolveAffiliateAccess } from "./lib/affiliateAccess";
import { canViewAffiliatePrivateCost } from "./lib/affiliatePrivateCost";
import { appRouter } from "./routers";
import { priceLadder } from "../shared/pricing";

describe("affiliate owner private pricing", () => {
  it("authorizes the existing matching Reeves Way owner only on the Reeves Way storefront", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();

    const [affiliate] = await db!
      .select({ id: affiliates.id, email: affiliates.email, slug: affiliates.slug })
      .from(affiliates)
      .where(eq(affiliates.slug, "reaves-way-cabinet-shop"))
      .limit(1);
    expect(affiliate).toBeTruthy();

    const [owner] = await db!
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.email, affiliate!.email))
      .limit(1);
    expect(owner).toBeTruthy();

    const access = await resolveAffiliateAccess(db!, owner!);
    expect(access).toEqual(expect.objectContaining({
      affiliateId: affiliate!.id,
      isOwner: true,
    }));
    expect(canViewAffiliatePrivateCost({
      isAdmin: false,
      requestedAffiliateSlug: affiliate!.slug,
      requestedAffiliateId: affiliate!.id,
      access,
    })).toBe(true);

    const caller = appRouter.createCaller({ user: owner } as any);
    const exactRecordStyles = await caller.pricing.stylesForCabinet({
      cabinetId: 9390110,
      affiliateSlug: affiliate!.slug,
    });
    const ownerStyle = exactRecordStyles.find((style) => style.yourCost != null);
    expect(ownerStyle).toBeTruthy();

    const [rawPriceRow] = await db!
      .select({ yourCost: distributorSkus.yourCost })
      .from(distributorSkus)
      .where(eq(distributorSkus.platformSku, ownerStyle!.platformSku))
      .limit(1);
    expect(rawPriceRow?.yourCost).toBeTruthy();

    const rawCents = Math.round(Number(rawPriceRow!.yourCost) * 100);
    const feeSettings = await getPlatformPricingSettings();
    const expectedAffiliateCost = (
      priceLadder(rawCents, feeSettings).affiliateCents / 100
    ).toFixed(2);
    expect(ownerStyle!.yourCost).toBe(expectedAffiliateCost);
    expect(ownerStyle!.yourCost).not.toBe(rawPriceRow!.yourCost);
  });
});
