import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { affiliates, designPhotoRenders, kitchenDesigns, orderRequests, threeDRoomShares } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";

function userContext(id: number, role: "user" | "contractor" = "user"): TrpcContext {
  return {
    user: { id, openId: `owner-scope-${id}`, name: `Owner ${id}`, email: `owner-${id}@example.test`, role },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

function adminContext(): TrpcContext {
  return {
    user: { id: 998899, openId: "owner-scope-admin", name: "Design Administrator", email: "admin-owner-scope@example.test", role: "admin" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("saved design owner scope", () => {
	  it("permanently deletes only the authenticated creator's design in the active store", async () => {
	    const db = await getDb();
	    if (!db) return;
	    const owner = appRouter.createCaller(userContext(998811));
	    const otherUser = appRouter.createCaller(userContext(998812));
	    const saved = await owner.design.save({
	      name: "Delete owner-scoped kitchen",
	      affiliateSlug: "owner",
	      originScope: "owner",
	      roomData: { width: 120, depth: 120 },
	      placedCabinets: [],
	    });
	    const unique = `${Date.now()}-${saved.id}`;
	    const [orderInsert] = await db.insert(orderRequests).values({
	      userId: 998811,
	      kitchenDesignId: saved.id,
	      requestNumber: `DELETE-${unique}`.slice(0, 64),
	      lineItems: [],
	      itemCount: 0,
	    });
	    const orderId = Number((orderInsert as { insertId: number }).insertId);
	    const [shareInsert] = await db.insert(threeDRoomShares).values({
	      token: `delete-${unique}`.slice(0, 48),
	      kitchenDesignId: saved.id,
	      configuration: { deletedDesignTest: true },
	    });
	    const shareId = Number((shareInsert as { insertId: number }).insertId);
	    const [renderInsert] = await db.insert(designPhotoRenders).values({
	      userId: 998811,
	      kitchenDesignId: saved.id,
	      sceneSignature: `delete-${unique}`.slice(0, 191),
	      imageUrl: "https://example.test/deleted-design.jpg",
	    });
	    const renderId = Number((renderInsert as { insertId: number }).insertId);

	    try {
	      await expect(otherUser.design.remove({ id: saved.id, affiliateSlug: "owner" })).rejects.toThrow("Saved design not found");
	      await expect(owner.design.remove({ id: saved.id, affiliateSlug: "owner" })).resolves.toMatchObject({
	        deleted: true,
	        id: saved.id,
	        name: "Delete owner-scoped kitchen",
	      });
	      await expect(owner.design.byId({ id: saved.id, affiliateSlug: "owner" })).resolves.toBeNull();
	      expect((await owner.design.myDesigns({ affiliateSlug: "owner" })).some((design) => design.id === saved.id)).toBe(false);
	      expect((await db.select({ id: threeDRoomShares.id }).from(threeDRoomShares).where(eq(threeDRoomShares.id, shareId))).length).toBe(0);
	      expect((await db.select({ id: designPhotoRenders.id }).from(designPhotoRenders).where(eq(designPhotoRenders.id, renderId))).length).toBe(0);
	      expect((await db.select({ kitchenDesignId: orderRequests.kitchenDesignId }).from(orderRequests).where(eq(orderRequests.id, orderId)))[0]?.kitchenDesignId).toBeNull();
	    } finally {
	      await db.delete(designPhotoRenders).where(eq(designPhotoRenders.id, renderId));
	      await db.delete(threeDRoomShares).where(eq(threeDRoomShares.id, shareId));
	      await db.delete(orderRequests).where(eq(orderRequests.id, orderId));
	      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, saved.id));
	    }
	  });

  it("keeps a saved plan private to its authenticated creator across user and contractor roles", async () => {
    const db = await getDb();
    if (!db) return;
    const owner = appRouter.createCaller(userContext(998801));
    const contractor = appRouter.createCaller(userContext(998802, "contractor"));
    const admin = appRouter.createCaller(adminContext());
    const saved = await owner.design.save({
      name: "Owner-scoped kitchen",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    });
    const affiliateSlug = `owner-scope-${Date.now()}`;
    const affiliateInsert = await db.insert(affiliates).values({
      storeName: "Owner Scope Affiliate",
	  slug: affiliateSlug,
      email: "owner-scope-affiliate@example.test",
      referralCode: `OWNER${Date.now()}`.slice(-24),
    });
    const affiliateId = (affiliateInsert as unknown as [{ insertId: number }])[0].insertId;
    const affiliateDesignInsert = await db.insert(kitchenDesigns).values({
      userId: 998803,
      affiliateId,
      name: "Affiliate customer kitchen",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    });
    const affiliateDesignId = (affiliateDesignInsert as unknown as [{ insertId: number }])[0].insertId;
	const sameUserAffiliateInsert = await db.insert(kitchenDesigns).values({
	  userId: 998801,
	  affiliateId,
	  name: "Same user affiliate kitchen",
	  roomData: { width: 120, depth: 120 },
	  placedCabinets: [],
	});
	const sameUserAffiliateDesignId = (sameUserAffiliateInsert as unknown as [{ insertId: number }])[0].insertId;
	const crmCustomerDesignInsert = await db.insert(kitchenDesigns).values({
	  userId: 998804,
	  affiliateId: null,
	  name: "CRM customer house kitchen",
	  roomData: { width: 132, depth: 120 },
	  placedCabinets: [],
	});
	const crmCustomerDesignId = (crmCustomerDesignInsert as unknown as [{ insertId: number }])[0].insertId;
	const { id: crmDealId } = await admin.crm.create({ title: "CRM linked customer design" });
	await admin.crm.linkDesign({ dealId: crmDealId, designId: crmCustomerDesignId });

    try {
      expect((await owner.design.myDesigns()).some((design) => design.id === saved.id)).toBe(true);
      expect((await contractor.design.myDesigns()).some((design) => design.id === saved.id)).toBe(false);
      await expect(contractor.design.byId({ id: saved.id })).resolves.toBeNull();
	      // Administration keeps its all-store visibility in CRM procedures. The
	      // storefront Designer itself is always scoped, even for an admin.
	      expect((await admin.design.myDesigns()).some((design) => design.id === saved.id)).toBe(false);
	      await expect(admin.design.byId({ id: saved.id })).resolves.toBeNull();
	      expect((await admin.design.myDesigns()).some((design) => design.id === affiliateDesignId)).toBe(false);
	      await expect(admin.design.byId({ id: affiliateDesignId })).resolves.toBeNull();
	      await expect(admin.design.byId({ id: crmCustomerDesignId })).resolves.toBeNull();
	      expect((await admin.design.byId({ id: crmCustomerDesignId, affiliateSlug: "owner", crmDealId }))?.name).toBe("CRM customer house kitchen");
	      await expect(contractor.design.byId({ id: crmCustomerDesignId, affiliateSlug: "owner", crmDealId })).resolves.toBeNull();
	      await expect(owner.design.byId({ id: sameUserAffiliateDesignId, affiliateSlug: "owner" })).resolves.toBeNull();
	      expect((await owner.design.byId({ id: sameUserAffiliateDesignId, affiliateSlug }))?.name).toBe("Same user affiliate kitchen");
	      await expect(owner.design.save({
	        id: sameUserAffiliateDesignId,
	        name: "Cross-store overwrite",
	        affiliateSlug: "owner",
	        originScope: "owner",
	        roomData: { width: 120, depth: 120 },
	        placedCabinets: [],
	      })).rejects.toThrow("different store");
	      await expect(owner.design.save({
	        name: "Mismatched creator scope",
	        affiliateSlug,
	        originScope: "owner",
	        roomData: { width: 120, depth: 120 },
	        placedCabinets: [],
	      })).rejects.toThrow("created for Cabinet Dealz owner");
      const recreated = await owner.design.save({
        id: 999999999,
        name: "Recovered stale plan",
        roomData: { width: 120, depth: 120 },
        placedCabinets: [],
      });
      expect(recreated.id).not.toBe(999999999);
      expect(recreated.recoveredFromStaleId).toBe(true);
      expect((await owner.design.byId({ id: recreated.id }))?.name).toBe("Recovered stale plan");
      await expect(contractor.design.save({
        id: saved.id,
        name: "Attempted overwrite",
        roomData: { width: 120, depth: 120 },
        placedCabinets: [],
      })).rejects.toThrow("Saved design not found");
      await expect(admin.design.save({
        id: saved.id,
        name: "Administrator overwrite",
        roomData: { width: 120, depth: 120 },
        placedCabinets: [],
      })).rejects.toThrow("Saved design not found");
      await expect(contractor.design.createRemoteShareLink({ designId: saved.id })).rejects.toThrow("You can only share your own saved design");
	    } finally {
	      await admin.crm.remove({ id: crmDealId }).catch(() => {});
      const recovered = await db.select({ id: kitchenDesigns.id }).from(kitchenDesigns).where(and(eq(kitchenDesigns.userId, 998801), eq(kitchenDesigns.name, "Recovered stale plan"))).limit(1);
      if (recovered[0]) await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, recovered[0].id));
	      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, sameUserAffiliateDesignId));
	      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, affiliateDesignId));
	      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, crmCustomerDesignId));
      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, saved.id));
      await db.delete(affiliates).where(eq(affiliates.id, affiliateId));
    }
  });
});
