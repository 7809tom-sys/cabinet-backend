import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { affiliates, distributorSkus, users } from "../drizzle/schema";
import { getDb, getPlatformPricingSettings } from "./db";
import { resolveAffiliateAccess } from "./lib/affiliateAccess";
import { canViewAffiliatePrivateCost } from "./lib/affiliatePrivateCost";
import { appRouter } from "./routers";
import { priceLadder } from "../shared/pricing";
import { affiliateCabinetDetailHref } from "../client/src/lib/affiliateCabinetDetailRoute";
import { PriceCard } from "../client/src/pages/CabinetDetail";

describe("affiliate owner private pricing", () => {
  let createdOwnerId: number | null = null;
  let restoredAffiliateId: number | null = null;
  let previousAffiliateUserId: number | null = null;

  afterEach(async () => {
    if (!createdOwnerId || !restoredAffiliateId) return;
    const db = await getDb();
    if (!db) return;
    await db
      .update(affiliates)
      .set({ userId: previousAffiliateUserId })
      .where(eq(affiliates.id, restoredAffiliateId));
    await db.delete(users).where(eq(users.id, createdOwnerId));
    createdOwnerId = null;
    restoredAffiliateId = null;
    previousAffiliateUserId = null;
  });

  it("uses the exact affiliate catalog-card record and authorizes its private cost only for the matching owner", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();

    const [affiliate] = await db!
      .select({ id: affiliates.id, email: affiliates.email, slug: affiliates.slug, userId: affiliates.userId })
      .from(affiliates)
      .where(eq(affiliates.slug, "reaves-way-cabinet-shop"))
      .limit(1);
    expect(affiliate).toBeTruthy();

    let [owner] = await db!
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(affiliate!.userId ? eq(users.id, affiliate!.userId) : eq(users.email, affiliate!.email))
      .limit(1);

    // The public affiliate record may legitimately exist before its real owner
    // has completed password or OAuth onboarding. Create a temporary linked
    // owner only for this verification, then restore the production record in
    // afterEach. This exercises the exact runtime owner rule without inventing
    // a real customer credential or making the test depend on seed users.
    if (!owner) {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
      const fixtureEmail = `affiliate-owner-${affiliate!.id}-${suffix}@example.test`;
      const inserted = await db!.insert(users).values({
        openId: `affiliate_owner_${suffix}`,
        name: "Affiliate owner verification fixture",
        email: fixtureEmail,
        emailLower: fixtureEmail,
        role: "partner",
        loginMethod: "test",
      });
      createdOwnerId = Number((inserted as unknown as [{ insertId: number }])[0]?.insertId ?? 0);
      expect(createdOwnerId).toBeGreaterThan(0);
      restoredAffiliateId = affiliate!.id;
      previousAffiliateUserId = affiliate!.userId ?? null;
      await db!
        .update(affiliates)
        .set({ userId: createdOwnerId })
        .where(eq(affiliates.id, affiliate!.id));
      [owner] = await db!
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, createdOwnerId))
        .limit(1);
    }
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

    const publicCaller = appRouter.createCaller({} as any);
    const family = await publicCaller.doorStyles.familyCatalog({ styleId: 330005 });
    const catalogCard = family.items.find((item) => item.cabinetId === 9390110);
    expect(catalogCard).toEqual(expect.objectContaining({
      id: 9390110,
      cabinetId: 9390110,
      masterCode: "W-1230",
    }));

    const detailHref = affiliateCabinetDetailHref({
      slug: affiliate!.slug,
      masterCode: catalogCard!.masterCode,
      styleId: 330005,
      cabinetId: catalogCard!.cabinetId,
    });
    expect(detailHref).toBe(
      "/store/reaves-way-cabinet-shop/catalog/W-1230?style=330005&cabinetId=9390110",
    );
    const routedCabinetId = Number(new URL(detailHref, "https://example.test").searchParams.get("cabinetId"));
    const detailRecord = await publicCaller.cabinets.byId({ id: routedCabinetId });
    expect(detailRecord).toEqual(expect.objectContaining({
      id: catalogCard!.cabinetId,
      masterCode: catalogCard!.masterCode,
    }));

    const caller = appRouter.createCaller({ user: owner } as any);
    const exactRecordStyles = await caller.pricing.stylesForCabinet({
      cabinetId: detailRecord!.id,
      affiliateSlug: affiliate!.slug,
    });
    const ownerStyle = exactRecordStyles.find((style) => style.affiliateCost != null);
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
    expect(ownerStyle!.affiliateCost).toBe(expectedAffiliateCost);
    expect(ownerStyle!.affiliateCost).not.toBe(rawPriceRow!.yourCost);
    expect(ownerStyle!.yourCost).toBeNull();

    // Render the private card from the exact cabinet record reached by the
    // branded card URL. This covers the user-visible label, sell tier, and
    // margin—not only the raw tRPC data that feeds the route.
    const affiliateMarkup = renderToStaticMarkup(
      createElement(PriceCard, { row: ownerStyle!, tier: "homeowner", viewerRole: "affiliate-owner" }),
    );
    const sellPrice = Number(ownerStyle!.homeownerPrice);
    const affiliateCost = Number(ownerStyle!.affiliateCost);
    const marginDollars = Math.round((sellPrice - affiliateCost) * 100) / 100;
    const marginPct = Math.round((marginDollars / sellPrice) * 1000) / 10;
    expect(affiliateMarkup).toContain("Affiliate Cost");
    expect(affiliateMarkup).toContain("Sells At (Homeowner)");
    expect(affiliateMarkup).toContain("Margin");
    expect(affiliateMarkup).toContain(`$${affiliateCost.toFixed(2)}`);
    expect(affiliateMarkup).toContain(`$${marginDollars.toFixed(2)} (${marginPct}%)`);
    expect(affiliateMarkup).not.toContain("My Cost");

    const customerStyles = await publicCaller.pricing.stylesForCabinet({
      cabinetId: catalogCard!.cabinetId,
      affiliateSlug: affiliate!.slug,
    });
    const customerStyle = customerStyles.find((style) => style.platformSku === ownerStyle!.platformSku);
    expect(customerStyle).toBeTruthy();
    expect(customerStyle!.yourCost).toBeNull();
    expect(customerStyle!.affiliateCost).toBeNull();

    const [admin] = await db!
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    expect(admin).toBeTruthy();

    const adminCaller = appRouter.createCaller({ user: admin } as any);
    const adminStyles = await adminCaller.pricing.stylesForCabinet({
      cabinetId: 9390110,
      affiliateSlug: affiliate!.slug,
    });
    const adminStyle = adminStyles.find((style) => style.platformSku === ownerStyle!.platformSku);
    expect(adminStyle).toBeTruthy();
    expect(adminStyle!.yourCost).toBe(rawPriceRow!.yourCost);
    expect(adminStyle!.affiliateCost).toBeNull();
    const adminMarkup = renderToStaticMarkup(
      createElement(PriceCard, { row: adminStyle!, tier: "homeowner", viewerRole: "admin" }),
    );
    expect(adminMarkup).toContain("My Cost");
    expect(adminMarkup).toContain("Sells At (Homeowner)");
    expect(adminMarkup).toContain("Margin");
    expect(adminMarkup).not.toContain("Affiliate Cost");
  });
});
