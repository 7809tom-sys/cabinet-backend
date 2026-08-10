import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { affiliates } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// The seeded "First Class" affiliate is linked by this email.
const PARTNER = { id: 99999, email: "firstclassfcd@yahoo.com" };

function partnerCtx(): TrpcContext {
  return {
    user: {
      id: PARTNER.id,
      openId: "o-partner",
      name: "First Class",
      email: PARTNER.email,
      role: "partner",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 12345,
      openId: "o-admin",
      name: "Admin",
      email: "admin-savetest@cabinetdealz.com",
      role: "admin",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

async function readRow(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(affiliates).where(eq(affiliates.id, id)).limit(1);
  return rows[0] ?? null;
}

describe("affiliate storefront save persistence", () => {
  it("updateMyStorefront persists tagline, colors, fonts and radius", async () => {
    const db = await getDb();
    if (!db) return; // empty DB env — skip
    const caller = appRouter.createCaller(partnerCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    const before = await readRow(mine.id);
    if (!before) return;

    try {
      await caller.affiliates.updateMyStorefront({
        tagline: "SAVE TEST TAGLINE",
        primaryColor: "#123456",
        accentColor: "#abcdef",
        fontFamily: "Lato",
        headingFont: "Montserrat",
        buttonRadius: "9999px",
      });
      const after = await readRow(mine.id);
      expect(after!.tagline).toBe("SAVE TEST TAGLINE");
      expect(after!.primaryColor).toBe("#123456");
      expect(after!.accentColor).toBe("#abcdef");
      expect(after!.fontFamily).toBe("Lato");
      expect(after!.headingFont).toBe("Montserrat");
      expect(after!.buttonRadius).toBe("9999px");
    } finally {
      await db
        .update(affiliates)
        .set({
          tagline: before.tagline,
          primaryColor: before.primaryColor,
          accentColor: before.accentColor,
          fontFamily: before.fontFamily,
          headingFont: before.headingFont,
          buttonRadius: before.buttonRadius,
        })
        .where(eq(affiliates.id, mine.id));
    }
  });

  it("updateMyStorefront can clear a field back to null", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    const before = await readRow(mine.id);
    if (!before) return;

    try {
      await caller.affiliates.updateMyStorefront({ tagline: "TEMP" });
      expect((await readRow(mine.id))!.tagline).toBe("TEMP");
      await caller.affiliates.updateMyStorefront({ tagline: null });
      expect((await readRow(mine.id))!.tagline).toBeNull();
    } finally {
      await db
        .update(affiliates)
        .set({ tagline: before.tagline })
        .where(eq(affiliates.id, mine.id));
    }
  });

  it("adminUpdate persists branding fields for an arbitrary affiliate", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(affiliates).limit(1);
    if (rows.length === 0) return;
    const target = rows[0];
    const caller = appRouter.createCaller(adminCtx());

    try {
      await caller.affiliates.adminUpdate({
        id: target.id,
        tagline: "ADMIN SAVE TEST",
        serviceArea: "Test Service Area",
        yearsInBusiness: 17,
      });
      const after = await readRow(target.id);
      expect(after!.tagline).toBe("ADMIN SAVE TEST");
      expect(after!.serviceArea).toBe("Test Service Area");
      expect(after!.yearsInBusiness).toBe(17);
    } finally {
      await db
        .update(affiliates)
        .set({
          tagline: target.tagline,
          serviceArea: target.serviceArea,
          yearsInBusiness: target.yearsInBusiness,
        })
        .where(eq(affiliates.id, target.id));
    }
  });

  it("adminUpdate persists storeName changes", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(affiliates).limit(1);
    if (rows.length === 0) return;
    const target = rows[0];
    const caller = appRouter.createCaller(adminCtx());

    try {
      await caller.affiliates.adminUpdate({ id: target.id, storeName: "Save Test Store" });
      expect((await readRow(target.id))!.storeName).toBe("Save Test Store");
    } finally {
      await db
        .update(affiliates)
        .set({ storeName: target.storeName })
        .where(eq(affiliates.id, target.id));
    }
  });

  it("admin updateMyStorefront with affiliateId targets that exact affiliate, not the first row", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(affiliates).orderBy(affiliates.id);
    if (rows.length < 2) return; // need at least two affiliates to prove targeting
    const first = rows[0];
    const second = rows[1];
    const caller = appRouter.createCaller(adminCtx());

    try {
      await caller.affiliates.updateMyStorefront({
        affiliateId: second.id,
        tagline: "TARGETED SECOND",
      });
      const afterSecond = await readRow(second.id);
      const afterFirst = await readRow(first.id);
      // The intended affiliate changed...
      expect(afterSecond!.tagline).toBe("TARGETED SECOND");
      // ...and the first row was NOT collaterally modified.
      expect(afterFirst!.tagline).toBe(first.tagline);
    } finally {
      await db
        .update(affiliates)
        .set({ tagline: second.tagline })
        .where(eq(affiliates.id, second.id));
      await db
        .update(affiliates)
        .set({ tagline: first.tagline })
        .where(eq(affiliates.id, first.id));
    }
  });

  it("admin updateMyStorefront rejects an unknown affiliateId", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.affiliates.updateMyStorefront({ affiliateId: 999999999, tagline: "nope" })
    ).rejects.toThrow();
  });

  it("updateMyStorefront persists a storeName change for the partner's own store", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    const before = await readRow(mine.id);
    if (!before) return;
    try {
      await caller.affiliates.updateMyStorefront({ storeName: "Partner Renamed Store" });
      expect((await readRow(mine.id))!.storeName).toBe("Partner Renamed Store");
    } finally {
      await db
        .update(affiliates)
        .set({ storeName: before.storeName })
        .where(eq(affiliates.id, mine.id));
    }
  });
});
