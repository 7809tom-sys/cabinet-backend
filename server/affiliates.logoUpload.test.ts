import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { affiliates } from "../drizzle/schema";

function adminCtx() {
  return {
    user: { id: 1, role: "admin", email: "7809tom@gmail.com", name: "Tom" },
    req: {} as never,
    res: {} as never,
  } as never;
}

// 1x1 transparent PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("affiliate logo upload", () => {
  it("uploads a logo and persists logoUrl on the targeted affiliate", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    const before = (
      await db.select().from(affiliates).where(eq(affiliates.id, mine.id)).limit(1)
    )[0];
    if (!before) return;

    try {
      const res = await caller.affiliates.uploadLogo({
        imageBase64: PNG_B64,
        contentType: "image/png",
        fileName: "my logo!.png",
        affiliateId: mine.id,
      });
      // storagePut returns a site-relative /manus-storage/... path.
      expect(res.url).toMatch(/^\/manus-storage\/affiliate-logo\//);

      const row = (
        await db.select().from(affiliates).where(eq(affiliates.id, mine.id)).limit(1)
      )[0];
      expect(row!.logoUrl).toBe(res.url);
      // Unsafe characters in the filename must not survive into the key.
      expect(res.url).not.toContain(" ");
      expect(res.url).not.toContain("!");
    } finally {
      await db
        .update(affiliates)
        .set({ logoUrl: before.logoUrl })
        .where(eq(affiliates.id, mine.id));
    }
  });

  it("rejects a non-image content type at the schema boundary", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    await expect(
      caller.affiliates.uploadLogo({
        imageBase64: PNG_B64,
        // @ts-expect-error deliberately invalid to prove the schema rejects it
        contentType: "application/pdf",
        fileName: "x.pdf",
      })
    ).rejects.toThrow();
  });

  it("rejects an empty payload", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    await expect(
      caller.affiliates.uploadLogo({ imageBase64: "", contentType: "image/png" })
    ).rejects.toThrow();
  });

  it("rejects an oversized image", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    // ~6MB of decoded bytes
    const big = Buffer.alloc(6 * 1024 * 1024, 1).toString("base64");
    await expect(
      caller.affiliates.uploadLogo({ imageBase64: big, contentType: "image/png" })
    ).rejects.toThrow(/5MB/i);
  });

  it("accepts SVG logos", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    const before = (
      await db.select().from(affiliates).where(eq(affiliates.id, mine.id)).limit(1)
    )[0];
    if (!before) return;

    try {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString("base64");
      const res = await caller.affiliates.uploadLogo({
        imageBase64: svg,
        contentType: "image/svg+xml",
        fileName: "logo.svg",
        affiliateId: mine.id,
      });
      expect(res.url).toMatch(/\.svg$/);
    } finally {
      await db
        .update(affiliates)
        .set({ logoUrl: before.logoUrl })
        .where(eq(affiliates.id, mine.id));
    }
  });
});
