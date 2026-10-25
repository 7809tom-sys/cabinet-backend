// ─────────────────────────────────────────────────────────────────────────────
// storefront.brandingForSlug — DB-aware tests.
//
// Seeds a throwaway affiliate + style-branding rows and asserts the public
// endpoint returns the white-label payload the useStorefrontBranding hook
// expects (styleNames, globalMarkupBps, categoryMarkupBps, styleMarkupBps),
// and that it returns null for unknown / disabled / inactive slugs.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { affiliates, affiliateStyleBranding } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => {}, clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function uniqueSlug(prefix: string): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1e5)}`.toLowerCase().slice(0, 60);
}

async function cleanup(affiliateId: number | null) {
  const db = await getDb();
  if (!db || affiliateId == null) return;
  await db.delete(affiliateStyleBranding).where(eq(affiliateStyleBranding.affiliateId, affiliateId));
  await db.delete(affiliates).where(eq(affiliates.id, affiliateId));
}

async function seedAffiliate(opts: {
  slug: string;
  storefrontEnabled?: boolean;
  status?: "active" | "paused" | "inactive";
  defaultMarkupBps?: number;
  categoryMarkupJson?: string | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  const ref = uniqueSlug("ref").toUpperCase();
  await db.insert(affiliates).values({
    storeName: `Test Store ${opts.slug}`,
    slug: opts.slug,
    email: `${opts.slug}@brandingtest.cabinetdealz`,
    referralCode: ref,
    status: opts.status ?? "active",
    storefrontEnabled: opts.storefrontEnabled ?? true,
    defaultMarkupBps: opts.defaultMarkupBps ?? 2000,
    categoryMarkupJson: opts.categoryMarkupJson ?? null,
  });
  const row = (await db.select().from(affiliates).where(eq(affiliates.slug, opts.slug)).limit(1))[0];
  return row.id;
}

describe("storefront.brandingForSlug", () => {
  it("returns null for an unknown slug", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.storefront.brandingForSlug({ slug: uniqueSlug("nope") });
    expect(res).toBeNull();
  });

  it("returns the white-label payload with style name + markup overrides", async () => {
    const db = await getDb();
    if (!db) return;
    const slug = uniqueSlug("brand");
    let affiliateId: number | null = null;
    try {
      affiliateId = await seedAffiliate({
        slug,
        defaultMarkupBps: 1500, // 15% global
        categoryMarkupJson: JSON.stringify({ base: 2500, wall: 1000 }),
      });
      // Two style-branding rows: one with a name + markup, one name only.
      await db.insert(affiliateStyleBranding).values([
        { affiliateId, styleId: 101, brandName: "Signature White", markupBps: 3000 },
        { affiliateId, styleId: 202, brandName: "Heritage Oak", markupBps: null },
        { affiliateId, styleId: 303, brandName: "  ", markupBps: 1200 }, // blank name omitted
      ]);

      const caller = appRouter.createCaller(publicCtx());
      const res = await caller.storefront.brandingForSlug({ slug });
      expect(res).not.toBeNull();
      expect(res!.globalMarkupBps).toBe(1500);
      expect(res!.categoryMarkupBps).toEqual({ base: 2500, wall: 1000 });
      // styleNames: blank trimmed-away
      expect(res!.styleNames[101]).toBe("Signature White");
      expect(res!.styleNames[202]).toBe("Heritage Oak");
      expect(res!.styleNames[303]).toBeUndefined();
      // styleMarkupBps: only numeric overrides present
      expect(res!.styleMarkupBps[101]).toBe(3000);
      expect(res!.styleMarkupBps[202]).toBeUndefined();
      expect(res!.styleMarkupBps[303]).toBe(1200);
    } finally {
      await cleanup(affiliateId);
    }
  });

  it("returns null when the storefront is disabled", async () => {
    const db = await getDb();
    if (!db) return;
    const slug = uniqueSlug("off");
    let affiliateId: number | null = null;
    try {
      affiliateId = await seedAffiliate({ slug, storefrontEnabled: false });
      const caller = appRouter.createCaller(publicCtx());
      const res = await caller.storefront.brandingForSlug({ slug });
      expect(res).toBeNull();
    } finally {
      await cleanup(affiliateId);
    }
  });

  it("returns null when the affiliate is inactive", async () => {
    const db = await getDb();
    if (!db) return;
    const slug = uniqueSlug("inactive");
    let affiliateId: number | null = null;
    try {
      affiliateId = await seedAffiliate({ slug, status: "inactive" });
      const caller = appRouter.createCaller(publicCtx());
      const res = await caller.storefront.brandingForSlug({ slug });
      expect(res).toBeNull();
    } finally {
      await cleanup(affiliateId);
    }
  });

  it("defaults to empty markup maps when none configured", async () => {
    const db = await getDb();
    if (!db) return;
    const slug = uniqueSlug("plain");
    let affiliateId: number | null = null;
    try {
      affiliateId = await seedAffiliate({ slug, defaultMarkupBps: 2000, categoryMarkupJson: null });
      const caller = appRouter.createCaller(publicCtx());
      const res = await caller.storefront.brandingForSlug({ slug });
      expect(res).not.toBeNull();
      expect(res!.globalMarkupBps).toBe(2000);
      expect(res!.categoryMarkupBps).toEqual({});
      expect(res!.styleNames).toEqual({});
      expect(res!.styleMarkupBps).toEqual({});
    } finally {
      await cleanup(affiliateId);
    }
  });
});
