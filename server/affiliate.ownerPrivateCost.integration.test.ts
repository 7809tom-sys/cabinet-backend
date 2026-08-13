import { describe, expect, it } from "vitest";
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
  it("uses the exact affiliate catalog-card record and authorizes its private cost only for the matching owner", async () => {
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
