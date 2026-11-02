import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { affiliates, kitchenDesigns } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Cross-affiliate design leak.
 *
 * The Designer used to take the storefront from the slug the browser sent. A
 * design saved on store A therefore opened on store B, for every role. These
 * tests drive the real routers and assert that the request Host/Origin header
 * is what decides the store.
 */
function caller(
  host: string,
  user: { id: number; role: string; email: string | null },
  origin?: string,
) {
  const headers: Record<string, string> = { host };
  if (origin) headers.origin = origin;
  const ctx = {
    user: {
      id: user.id,
      openId: `host-scope-${user.id}`,
      name: `Host Scope ${user.id}`,
      email: user.email,
      role: user.role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
  return appRouter.createCaller(ctx);
}

const CUSTOMER = {
  name: "Host Scope Customer",
  email: "host-scope-customer@example.test",
  phone: "555-010-0177",
  address: { line1: "100 Host Street", city: "Testville", state: "FL", zip: "34201" },
};

describe("saved design store isolation by request host", () => {
  it("hides a design saved on store A from store B for owner, admin, contractor, and regular user", async () => {
    const db = await getDb();
    if (!db) return; // no database in this environment

    const stamp = Date.now();
    const slugA = `host-a-${stamp}`.slice(0, 60);
    const slugB = `host-b-${stamp}`.slice(0, 60);
    const [insertA] = await db.insert(affiliates).values({
      storeName: "Host Store A",
      slug: slugA,
      email: `host-a-${stamp}@example.test`,
      referralCode: `HSTA${String(stamp).slice(-8)}`,
    });
    const [insertB] = await db.insert(affiliates).values({
      storeName: "Host Store B",
      slug: slugB,
      email: `host-b-${stamp}@example.test`,
      referralCode: `HSTB${String(stamp).slice(-8)}`,
    });
    const affiliateA = Number((insertA as { insertId: number }).insertId);
    const affiliateB = Number((insertB as { insertId: number }).insertId);
    const hostA = `${slugA}.cabinetdealz.com`;
    const hostB = `${slugB}.cabinetdealz.com`;

    const designOwnerId = 990101;
    const adminId = 990102;
    const contractorId = 990103;
    const regularUserId = 990104;

    const ownerOnA = caller(hostA, { id: designOwnerId, role: "user", email: `host-owner-${stamp}@example.test` });

    try {
      // Saved from store A's designer, with store A's own slug in the payload.
      const saved = await ownerOnA.design.save({
        customer: CUSTOMER,
        name: "Store A kitchen",
        affiliateSlug: slugA,
        originScope: slugA,
        roomData: { width: 120, depth: 120 },
        placedCabinets: [],
      });
      expect(saved.id).toBeGreaterThan(0);

      const [stored] = await db
        .select({ affiliateId: kitchenDesigns.affiliateId })
        .from(kitchenDesigns)
        .where(eq(kitchenDesigns.id, saved.id))
        .limit(1);
      // The server stamped the host's affiliate, not the client's claim.
      expect(stored?.affiliateId).toBe(affiliateA);

      const ownerOnB = caller(hostB, { id: designOwnerId, role: "user", email: `host-owner-${stamp}@example.test` });
      const adminOnB = caller(hostB, { id: adminId, role: "admin", email: `host-admin-${stamp}@example.test` });
      const contractorOnB = caller(hostB, { id: contractorId, role: "contractor", email: `host-contractor-${stamp}@example.test` });
      const userOnB = caller(hostB, { id: regularUserId, role: "user", email: `host-user-${stamp}@example.test` });

      for (const [label, onB] of [
        ["owner", ownerOnB],
        ["admin", adminOnB],
        ["contractor", contractorOnB],
        ["regular user", userOnB],
      ] as const) {
        // The store's own slug is accepted; the host still scopes the read.
        expect(await onB.design.byId({ id: saved.id, affiliateSlug: slugB }), `${label} byId`).toBeNull();
        const list = await onB.design.myDesigns({ affiliateSlug: slugB });
        expect(list.some((design) => design.id === saved.id), `${label} myDesigns`).toBe(false);
      }

      // The owner still opens their own design on store A.
      expect((await ownerOnA.design.byId({ id: saved.id, affiliateSlug: slugA }))?.name).toBe("Store A kitchen");

      // A client slug that disagrees with the host is refused outright.
      await expect(ownerOnB.design.byId({ id: saved.id, affiliateSlug: slugA })).rejects.toThrow(/cannot open the "host-a-/);
      await expect(ownerOnB.design.save({
        customer: CUSTOMER,
        id: saved.id,
        name: "Cross-store overwrite",
        affiliateSlug: slugA,
        originScope: slugA,
        roomData: { width: 120, depth: 120 },
        placedCabinets: [],
      })).rejects.toThrow(/cannot open the "host-a-/);
      await expect(ownerOnB.design.remove({ id: saved.id, affiliateSlug: slugA })).rejects.toThrow(
        /cannot open the "host-a-/,
      );

      // An admin on store B cannot reach the design through the assist branch
      // either, even though assist otherwise grants admins every design.
      expect(await adminOnB.design.byId({ id: saved.id, affiliateSlug: slugB, assist: true })).toBeNull();
      expect(await ownerOnA.design.byId({ id: saved.id, affiliateSlug: slugA, assist: true })).toMatchObject({
        id: saved.id,
      });

      // Store B's save never lands on store A's affiliate id.
      const savedOnB = await caller(hostB, { id: designOwnerId, role: "user", email: `host-owner-${stamp}@example.test` })
        .design.save({
          customer: CUSTOMER,
          name: "Store B kitchen",
          affiliateSlug: slugB,
          originScope: slugB,
          roomData: { width: 120, depth: 120 },
          placedCabinets: [],
        });
      const [storedB] = await db
        .select({ affiliateId: kitchenDesigns.affiliateId })
        .from(kitchenDesigns)
        .where(eq(kitchenDesigns.id, savedOnB.id))
        .limit(1);
      expect(storedB?.affiliateId).toBe(affiliateB);

      // ...and the store A design stays invisible on B's list.
      const listOnB = await caller(hostB, { id: designOwnerId, role: "user", email: `host-owner-${stamp}@example.test` })
        .design.myDesigns({ affiliateSlug: slugB });
      expect(listOnB.some((design) => design.id === saved.id)).toBe(false);
      expect(listOnB.some((design) => design.id === savedOnB.id)).toBe(true);

      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, savedOnB.id));
      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, saved.id));
    } finally {
      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.affiliateId, affiliateA));
      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.affiliateId, affiliateB));
      await db.delete(affiliates).where(eq(affiliates.id, affiliateA));
      await db.delete(affiliates).where(eq(affiliates.id, affiliateB));
    }
  }, 60_000);

  it("resolves the store from the page Origin when the API is called on its own host", async () => {
    const db = await getDb();
    if (!db) return;

    const stamp = Date.now();
    const slug = `host-origin-${stamp}`.slice(0, 60);
    const [insert] = await db.insert(affiliates).values({
      storeName: "Origin Store",
      slug,
      email: `host-origin-${stamp}@example.test`,
      referralCode: `HSTO${String(stamp).slice(-8)}`,
    });
    const affiliateId = Number((insert as { insertId: number }).insertId);
    const ownerId = 990201;

    try {
      const onOrigin = caller("api.cabinetdealz.com", { id: ownerId, role: "user", email: `origin-${stamp}@example.test` }, `https://${slug}.cabinetdealz.com`);
      const saved = await onOrigin.design.save({
        customer: CUSTOMER,
        name: "Origin-scoped kitchen",
        affiliateSlug: slug,
        originScope: slug,
        roomData: { width: 96, depth: 96 },
        placedCabinets: [],
      });
      const [stored] = await db
        .select({ affiliateId: kitchenDesigns.affiliateId })
        .from(kitchenDesigns)
        .where(eq(kitchenDesigns.id, saved.id))
        .limit(1);
      expect(stored?.affiliateId).toBe(affiliateId);

      // A plain API host with no storefront Origin is the house scope, so the
      // affiliate design is not reachable through it.
      const plainApi = caller("api.cabinetdealz.com", { id: ownerId, role: "user", email: `origin-${stamp}@example.test` });
      expect(await plainApi.design.byId({ id: saved.id, affiliateSlug: "owner" })).toBeNull();

      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, saved.id));
    } finally {
      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.affiliateId, affiliateId));
      await db.delete(affiliates).where(eq(affiliates.id, affiliateId));
    }
  }, 60_000);
});
