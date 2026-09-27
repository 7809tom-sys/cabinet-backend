import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { vendorLines, pelicanCategoryMarkups } from "../drizzle/schema";
import { eq, like } from "drizzle-orm";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function adminCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-admin",
    email: "admin@example.com",
    name: "Test Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const caller = appRouter.createCaller(adminCtx());
const TEST_VENDOR_NAME = "__vitest_vendor__";
const TEST_CATEGORY = "Flooring";

let createdVendorId: number | null = null;
let originalFlooringBps: number | null = null;

describe("pelican.getMarkups / setMarkup", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    const [row] = await db
      .select()
      .from(pelicanCategoryMarkups)
      .where(eq(pelicanCategoryMarkups.category, TEST_CATEGORY))
      .limit(1);
    originalFlooringBps = row ? row.markupBps : null;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (originalFlooringBps !== null) {
      await caller.pelican.setMarkup({ category: TEST_CATEGORY, markupBps: originalFlooringBps });
    }
    if (createdVendorId) {
      await db.delete(vendorLines).where(eq(vendorLines.id, createdVendorId));
    }
  });

  it("returns a markup entry per active category with stats", async () => {
    const markups = await caller.pelican.getMarkups();
    expect(Array.isArray(markups)).toBe(true);
    for (const m of markups) {
      expect(typeof m.category).toBe("string");
      expect(typeof m.markupBps).toBe("number");
      expect(m.markupBps).toBeGreaterThanOrEqual(0);
      expect(typeof m.productCount).toBe("number");
    }
  });

  it("persists a new markup value and reads it back", async () => {
    const res = await caller.pelican.setMarkup({ category: TEST_CATEGORY, markupBps: 7200 });
    expect(res.success).toBe(true);
    const markups = await caller.pelican.getMarkups();
    const flooring = markups.find((m) => m.category === TEST_CATEGORY);
    // If Flooring has products it appears in the stats list with the new value.
    if (flooring) {
      expect(flooring.markupBps).toBe(7200);
      expect(flooring.isDefault).toBe(false);
    } else {
      // No flooring products — verify the row landed in the table directly.
      const db = await getDb();
      const [row] = await db!
        .select()
        .from(pelicanCategoryMarkups)
        .where(eq(pelicanCategoryMarkups.category, TEST_CATEGORY))
        .limit(1);
      expect(row?.markupBps).toBe(7200);
    }
  });
});

describe("vendors router", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(vendorLines).where(like(vendorLines.name, "__vitest_vendor__%"));
  });

  it("creates, lists, recomputes, and removes a vendor line", async () => {
    const created = await caller.vendors.upsert({
      name: TEST_VENDOR_NAME,
      sourceKey: "pelican",
      category: "Surfaces & Fixtures",
      isApproved: true,
    });
    expect(created.success).toBe(true);
    expect(created.id).toBeGreaterThan(0);
    createdVendorId = created.id!;

    const list = await caller.vendors.list();
    const found = list.find((v) => v.id === createdVendorId);
    expect(found).toBeTruthy();
    expect(found?.name).toBe(TEST_VENDOR_NAME);
    expect(found?.isApproved).toBe(true);

    // Recompute a "pelican" line — should be a valid number (0 if no Pelican
    // items have been ordered; never fabricated).
    const rec = await caller.vendors.recomputeSales({ id: createdVendorId });
    expect(rec.success).toBe(true);
    expect(typeof rec.totalSalesCents).toBe("number");
    expect(rec.totalSalesCents).toBeGreaterThanOrEqual(0);

    const removed = await caller.vendors.remove({ id: createdVendorId });
    expect(removed.success).toBe(true);
    createdVendorId = null;

    const after = await caller.vendors.list();
    expect(after.find((v) => v.name === TEST_VENDOR_NAME)).toBeUndefined();
  });

  it("leaves sales untouched for a line with no auto-attribution rule", async () => {
    const created = await caller.vendors.upsert({
      name: TEST_VENDOR_NAME + "_manual",
      sourceKey: null,
      totalSalesCents: 12345,
    });
    expect(created.success).toBe(true);
    const id = created.id!;
    const rec = await caller.vendors.recomputeSales({ id });
    expect(rec.success).toBe(true);
    expect((rec as any).autoComputed).toBe(false);
    expect(rec.totalSalesCents).toBe(12345);
    await caller.vendors.remove({ id });
  });

  it("persists source catalog and specification-book URLs for an approved vendor", async () => {
    const created = await caller.vendors.upsert({
      name: TEST_VENDOR_NAME + "_resources",
      catalogPdfUrl: "https://example.test/catalog.pdf",
      specBookPdfUrl: "https://example.test/specifications.pdf",
    });
    expect(created.success).toBe(true);

    const list = await caller.vendors.list();
    const vendor = list.find((line) => line.id === created.id);
    expect(vendor?.catalogPdfUrl).toBe("https://example.test/catalog.pdf");
    expect(vendor?.specBookPdfUrl).toBe("https://example.test/specifications.pdf");

    await caller.vendors.remove({ id: created.id! });
  });

  it("rejects a non-PDF payload before storing a vendor resource", async () => {
    const created = await caller.vendors.upsert({ name: TEST_VENDOR_NAME + "_invalid_resource" });
    await expect(
      caller.vendors.uploadResourcePdf({
        id: created.id!,
        resource: "catalog",
        fileBase64: Buffer.from("not a PDF").toString("base64"),
        contentType: "application/pdf",
        fileName: "invalid.pdf",
      })
    ).rejects.toThrow("Only a valid PDF catalog or specification book can be uploaded.");
    await caller.vendors.remove({ id: created.id! });
  });
});
