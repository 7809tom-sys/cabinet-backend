import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { distributors } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function caller(user: any) {
  return appRouter.createCaller({ user } as any);
}

const ADMIN = { id: 1, role: "admin", openId: "admin1", name: "Owner", email: "owner@example.com" };
const USER = { id: 2, role: "user", openId: "u2", name: "Reg", email: "reg@example.com" };

describe("distributorAdmin.setBranding (white-label)", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      caller(null).distributorAdmin.setBranding({
        distributorId: 1,
        displayMode: "neutral",
        label: "Line A",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects non-admin callers", async () => {
    await expect(
      caller(USER).distributorAdmin.setBranding({
        distributorId: 1,
        displayMode: "branded",
        label: "ACME",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an empty label", async () => {
    await expect(
      caller(ADMIN).distributorAdmin.setBranding({
        distributorId: 1,
        displayMode: "neutral",
        label: "   ",
      }),
    ).rejects.toBeTruthy();
  });

  it("returns NOT_FOUND for a missing line", async () => {
    await expect(
      caller(ADMIN).distributorAdmin.setBranding({
        distributorId: 99999999,
        displayMode: "neutral",
        label: "Ghost Line",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("admin can switch a real line through neutral / branded / series and persist it", async () => {
    const db = await getDb();
    if (!db) return; // no DB in this env — skip the persistence assertions

    const [line] = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (!line) return; // empty catalog — nothing to brand

    const id = line.id;
    // snapshot original so we can restore it afterward
    const [orig] = await db.select().from(distributors).where(eq(distributors.id, id)).limit(1);

    // branded -> shows the real brand, whiteLabel off
    await caller(ADMIN).distributorAdmin.setBranding({
      distributorId: id,
      displayMode: "branded",
      label: "ACME Cabinetry",
      initials: "AC",
    });
    let [row] = await db.select().from(distributors).where(eq(distributors.id, id)).limit(1);
    expect(row.displayMode).toBe("branded");
    expect(row.brandName).toBe("ACME Cabinetry");
    expect(row.brandInitials).toBe("AC");
    expect(row.whiteLabel).toBe(false);

    // series -> shows a CD series, supplier stays hidden
    await caller(ADMIN).distributorAdmin.setBranding({
      distributorId: id,
      displayMode: "series",
      label: "Cabinet Dealz Elegant Series",
    });
    [row] = await db.select().from(distributors).where(eq(distributors.id, id)).limit(1);
    expect(row.displayMode).toBe("series");
    expect(row.seriesName).toBe("Cabinet Dealz Elegant Series");
    expect(row.whiteLabel).toBe(true);

    // neutral -> plain neutral label, initials auto-derived when omitted
    await caller(ADMIN).distributorAdmin.setBranding({
      distributorId: id,
      displayMode: "neutral",
      label: "Line Q",
    });
    [row] = await db.select().from(distributors).where(eq(distributors.id, id)).limit(1);
    expect(row.displayMode).toBe("neutral");
    expect(row.name).toBe("Line Q");
    expect(row.initials).toBe("LI"); // first 2 chars upper-cased
    expect(row.whiteLabel).toBe(true);

    // restore the original row so the suite is idempotent
    await db
      .update(distributors)
      .set({
        name: orig.name,
        initials: orig.initials,
        brandName: orig.brandName,
        brandInitials: orig.brandInitials,
        whiteLabel: orig.whiteLabel,
        displayMode: orig.displayMode,
        seriesName: orig.seriesName,
      })
      .where(eq(distributors.id, id));
  });
});
