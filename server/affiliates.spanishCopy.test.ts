// ─────────────────────────────────────────────────────────────────────────────
// Per-affiliate Spanish hero copy (taglineEs / aboutTextEs) — DB-aware tests.
//
// Seeds a throwaway affiliate linked to a partner user, then exercises
// affiliates.updateMyStorefront to persist Spanish copy and asserts that
// affiliates.bySlug surfaces taglineEs/aboutTextEs for the storefront to read.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { affiliates } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function uniqueSlug(prefix: string): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1e5)}`.toLowerCase().slice(0, 60);
}

const PARTNER_ID = 770001;

function partnerCtx(email: string): TrpcContext {
  return {
    user: {
      id: PARTNER_ID,
      openId: "o-es-partner",
      name: "ES Partner",
      email,
      role: "partner",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

async function cleanup(affiliateId: number | null) {
  const db = await getDb();
  if (!db || affiliateId == null) return;
  await db.delete(affiliates).where(eq(affiliates.id, affiliateId));
}

async function seedAffiliate(slug: string, email: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  const ref = uniqueSlug("ref").toUpperCase();
  await db.insert(affiliates).values({
    storeName: `ES Store ${slug}`,
    slug,
    email,
    referralCode: ref,
    status: "active",
    storefrontEnabled: true,
    userId: PARTNER_ID, // link so resolveMyAffiliate matches by userId
    tagline: "Beautiful Kitchens, Built Around You.",
    aboutText: "We design kitchens homeowners love.",
  });
  const row = (await db.select().from(affiliates).where(eq(affiliates.slug, slug)).limit(1))[0];
  return row.id;
}

describe("per-affiliate Spanish hero copy", () => {
  it("persists taglineEs/aboutTextEs and surfaces them via bySlug", async () => {
    const db = await getDb();
    if (!db) return; // empty DB env — skip
    const slug = uniqueSlug("estore");
    const email = `${slug}@escopytest.cabinetdealz`;
    let id: number | null = null;
    try {
      id = await seedAffiliate(slug, email);
      const caller = appRouter.createCaller(partnerCtx(email));

      await caller.affiliates.updateMyStorefront({
        taglineEs: "Hermosas cocinas, hechas para usted.",
        aboutTextEs: "Diseñamos cocinas que los propietarios adoran.",
      });

      const pub = await caller.affiliates.bySlug({ slug });
      expect(pub).not.toBeNull();
      expect(pub!.taglineEs).toBe("Hermosas cocinas, hechas para usted.");
      expect(pub!.aboutTextEs).toBe("Diseñamos cocinas que los propietarios adoran.");
      // English copy is untouched (fallback source stays intact)
      expect(pub!.tagline).toBe("Beautiful Kitchens, Built Around You.");
      expect(pub!.aboutText).toBe("We design kitchens homeowners love.");
    } finally {
      await cleanup(id);
    }
  });

  it("leaves ES copy null when not provided (storefront falls back to EN)", async () => {
    const db = await getDb();
    if (!db) return;
    const slug = uniqueSlug("estore");
    const email = `${slug}@escopytest.cabinetdealz`;
    let id: number | null = null;
    try {
      id = await seedAffiliate(slug, email);
      const caller = appRouter.createCaller(partnerCtx(email));
      const pub = await caller.affiliates.bySlug({ slug });
      expect(pub).not.toBeNull();
      expect(pub!.taglineEs).toBeNull();
      expect(pub!.aboutTextEs).toBeNull();
    } finally {
      await cleanup(id);
    }
  });
});
