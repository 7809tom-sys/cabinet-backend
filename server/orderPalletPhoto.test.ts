/**
 * Pallet photo on ship.
 *
 * Safety: no storage bucket or database is contacted. The upload path is a
 * stub and reads use an in-memory execute().
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canAccessOrderPalletPhoto,
  palletPhotoKey,
  parsePalletPhotoDataUrl,
  readPalletPhotos,
} from "./lib/orderPalletPhoto";

// Minimal real headers so the signature sniffing has something to bite on.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0x20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0x20)]);

function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

describe("pallet photo bytes", () => {
  it("accepts a JPEG and a PNG and reports their real content type", () => {
    expect(parsePalletPhotoDataUrl(dataUrl("image/jpeg", JPEG))).toMatchObject({ contentType: "image/jpeg", extension: "jpg" });
    expect(parsePalletPhotoDataUrl(dataUrl("image/png", PNG))).toMatchObject({ contentType: "image/png", extension: "png" });
  });

  it("rejects a payload that is not an image even when labelled one", () => {
    const notAnImage = Buffer.from("this is plainly not an image file at all");
    expect(() => parsePalletPhotoDataUrl(dataUrl("image/png", notAnImage))).toThrow(/not a readable/);
  });

  it("rejects a non-image data URL, an empty body, and oversized bytes", () => {
    expect(() => parsePalletPhotoDataUrl("data:text/plain;base64,aGVsbG8=")).toThrow(/JPEG, PNG, or WebP/);
    // An empty payload never reaches the size check; it fails the format check.
    expect(() => parsePalletPhotoDataUrl("data:image/png;base64,")).toThrow();
    expect(() => parsePalletPhotoDataUrl(dataUrl("image/png", Buffer.from([0x00])))).toThrow(/not a readable/);
    const huge = Buffer.concat([JPEG, Buffer.alloc(9 * 1024 * 1024, 0x20)]);
    expect(() => parsePalletPhotoDataUrl(dataUrl("image/jpeg", huge))).toThrow(/too large/);
  });

  it("puts each order's photo under its own key", () => {
    const key = palletPhotoKey(42, "jpg", "abc123");
    expect(key.startsWith("order-pallet-photos/42/")).toBe(true);
    expect(key.endsWith(".jpg")).toBe(true);
    // A key built from an id or name can never escape its order folder.
    const hostile = palletPhotoKey(42, "png", "../../etc/passwd");
    expect(hostile.startsWith("order-pallet-photos/42/")).toBe(true);
    expect(hostile).not.toContain("..");
  });
});

describe("who may attach a pallet photo", () => {
  const order = { id: 7, userId: 21, affiliateId: 3, distributorId: 9 };

  it("allows an admin anywhere", () => {
    expect(canAccessOrderPalletPhoto({ id: 1, role: "admin" }, order)).toBe(true);
  });

  it("allows the routed distributor only", () => {
    expect(canAccessOrderPalletPhoto({ id: 2, role: "distributor", distributorId: 9 }, order)).toBe(true);
    expect(canAccessOrderPalletPhoto({ id: 2, role: "distributor", distributorId: 10 }, order)).toBe(false);
    expect(canAccessOrderPalletPhoto({ id: 2, role: "distributor" }, order, { linkedDistributorIds: [9] })).toBe(true);
  });

  it("allows the store that took the order, including its team", () => {
    expect(canAccessOrderPalletPhoto({ id: 3, role: "affiliate" }, order, { affiliateIds: [3] })).toBe(true);
    expect(canAccessOrderPalletPhoto({ id: 3, role: "affiliate" }, order, { affiliateIds: [4] })).toBe(false);
  });

  it("allows the customer who placed the order and nobody else", () => {
    expect(canAccessOrderPalletPhoto({ id: 21, role: "customer" }, order)).toBe(true);
    expect(canAccessOrderPalletPhoto({ id: 22, role: "customer" }, order)).toBe(false);
    expect(canAccessOrderPalletPhoto(null, order)).toBe(false);
  });

  it("does not leak one store's photo to another store's staff", () => {
    expect(canAccessOrderPalletPhoto({ id: 5, role: "affiliate" }, { id: 8, affiliateId: 4, distributorId: null }, { affiliateIds: [3] })).toBe(false);
  });
});

describe("pallet photo reads", () => {
  it("returns nulls, not an error, when the column is missing", async () => {
    const execute = vi.fn(async () => { throw new Error("Unknown column 'palletPhotoUrl' in 'field list'"); });
    const map = await readPalletPhotos({ execute }, [7]);
    expect(map.get(7)).toBeUndefined();
    expect(map.size).toBe(0);
  });

  it("reads the URL and uploader for each order", async () => {
    const execute = vi.fn(async () => [[
      { id: 7, palletPhotoUrl: "/manus-storage/order-pallet-photos/7/a.jpg", palletPhotoUploadedAt: new Date("2026-11-05T02:00:00.000Z"), palletPhotoUploadedBy: "Dana" },
      { id: 8, palletPhotoUrl: null, palletPhotoUploadedAt: null, palletPhotoUploadedBy: null },
    ]]);
    const map = await readPalletPhotos({ execute }, [7, 8]);
    expect(map.get(7)).toEqual({
      url: "/manus-storage/order-pallet-photos/7/a.jpg",
      uploadedAt: "2026-11-05T02:00:00.000Z",
      uploadedBy: "Dana",
    });
    expect(map.get(8)).toEqual({ url: null, uploadedAt: null, uploadedBy: null });
  });

  it("does no query at all with no orders", async () => {
    const execute = vi.fn(async () => []);
    await readPalletPhotos({ execute }, []);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("pallet photo wiring", () => {
  const orders = readFileSync(resolve(process.cwd(), "server/routers/orders.ts"), "utf8");
  const detail = readFileSync(resolve(process.cwd(), "server/lib/adminOrderRead.ts"), "utf8");

  it("exposes the upload on the scoped order procedure", () => {
    expect(orders).toContain("uploadPalletPhoto: protectedProcedure");
    expect(orders).toContain("canAccessOrderPalletPhoto(");
    expect(orders).toContain("storeOrderPalletPhoto(");
    // The scope is checked before anything is written.
    expect(orders.indexOf("canAccessOrderPalletPhoto(")).toBeLessThan(orders.indexOf("storeOrderPalletPhoto("));
  });

  it("returns the photo from the admin order detail", () => {
    expect(detail).toContain("readPalletPhotos(db, [order.id])");
    expect(detail).toContain("palletPhoto: palletPhotos.get(order.id) ?? null");
  });

  it("returns the photo to the customer's own order read", () => {
    const byId = orders.slice(orders.indexOf("byId: publicProcedure"), orders.indexOf("myRequests: protectedProcedure"));
    expect(byId).toContain("readPalletPhotoForOrder(db, order.id)");
  });

  it("ships the columns as SQL Tom runs himself", () => {
    const tidb = readFileSync(resolve(process.cwd(), "docs/sql/0247_order_pallet_photo.tidb.sql"), "utf8");
    expect(tidb).toContain("cabinet_dealz.order_requests");
    for (const column of ["palletPhotoUrl", "palletPhotoUploadedAt", "palletPhotoUploadedBy"]) {
      expect(tidb).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    expect(tidb).not.toContain("--> statement-breakpoint");
    const journal = readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8");
    expect(journal).toContain("0233_order_pallet_photo");
  });
});
