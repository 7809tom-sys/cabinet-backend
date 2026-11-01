import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getTableName } from "drizzle-orm";
import sharp from "sharp";

const { getDbMock, storagePutMock, state } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  storagePutMock: vi.fn(),
  state: {
    vendor: { sourceKey: "pelican" as string | null, isApproved: true, linkedDistributorIds: null as number[] | null },
    distributors: [{ id: 9, code: "PEL", isActive: true }],
    product: null as null | {
      id: number;
      imageUrl: string | null;
      materialImageUrl: string | null;
      roomSceneImageUrl: string | null;
      listPrice: string | null;
      category?: string;
      name?: string;
      description?: string;
      slug?: string;
      isActive?: boolean;
      showInCatalog?: boolean;
    },
    updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
    uploads: [] as Array<{ key: string; data: Buffer; contentType: string; url: string }>,
  },
}));

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return { ...actual, getDb: getDbMock };
});

vi.mock("../storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage")>();
  return { ...actual, storagePut: storagePutMock };
});

import { appRouter } from "../routers";

const ORIGINAL_CATALOG = "https://cdn.example/catalog-lifestyle.jpg";
const ORIGINAL_DESIGNER = "/manus-storage/pelican/products/42/original-swatch.webp";
const ORIGINAL_ROOM = "/manus-storage/pelican/products/42/original-room.webp";
const UPLOADED_CATALOG = "/manus-storage/pelican/products/42/1730000000000-abcd1234.webp";

function ctx(user: Record<string, unknown> | null) {
  return { user, req: { protocol: "https", headers: {} }, res: { clearCookie() {} } } as never;
}

const pelicanVendor = {
  id: 5,
  openId: "pelican-vendor",
  name: "Pelican",
  email: "orders@pelican.test",
  role: "distributor",
  distributorId: 9,
  approvedVendorLineId: 3,
};

function caller(user: Record<string, unknown> | null = pelicanVendor) {
  return appRouter.createCaller(ctx(user));
}

function rowsFor(table: unknown): unknown[] {
  const name = getTableName(table as Parameters<typeof getTableName>[0]);
  if (name === "vendor_lines") return [{ ...state.vendor }];
  if (name === "distributors") return state.distributors.map((row) => ({ ...row }));
  if (name === "pelican_products") return state.product ? [{ ...state.product }] : [];
  return [];
}

function query(rows: unknown[]) {
  const builder = {
    where() { return builder; },
    orderBy() { return builder; },
    groupBy() { return builder; },
    offset() { return builder; },
    limit() { return builder; },
    then(resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return builder;
}

let png = "";
let widePng = "";
let jpeg = "";

function pixel(data: Buffer, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

async function pngFromRgba(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number],
) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

beforeAll(async () => {
  png = (await sharp({ create: { width: 32, height: 24, channels: 3, background: { r: 12, g: 80, b: 140 } } }).png().toBuffer()).toString("base64");
  widePng = (await sharp({ create: { width: 5000, height: 20, channels: 3, background: { r: 210, g: 170, b: 140 } } }).png().toBuffer()).toString("base64");
  jpeg = (await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toBuffer()).toString("base64");
});

beforeEach(() => {
  state.vendor = { sourceKey: "pelican", isApproved: true, linkedDistributorIds: null };
  state.distributors = [{ id: 9, code: "PEL", isActive: true }];
  state.product = { id: 42, imageUrl: ORIGINAL_CATALOG, materialImageUrl: ORIGINAL_DESIGNER, roomSceneImageUrl: ORIGINAL_ROOM, listPrice: "20.00" };
  state.updates = [];
  state.uploads = [];
  storagePutMock.mockReset();
  storagePutMock.mockImplementation(async (key: string, data: Buffer, contentType: string) => {
    const url = `/manus-storage/${key}`;
    state.uploads.push({ key, data: Buffer.from(data), contentType, url });
    return { key, url };
  });
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({
    select: () => ({
      from(table: unknown) {
        return query(rowsFor(table));
      },
    }),
    selectDistinct: () => ({
      from(table: unknown) {
        return query(rowsFor(table));
      },
    }),
    update: (table: unknown) => ({
      set(patch: Record<string, unknown>) {
        return {
          where: async () => {
            const name = getTableName(table as Parameters<typeof getTableName>[0]);
            state.updates.push({ table: name, patch });
            if (name === "pelican_products" && state.product) Object.assign(state.product, patch);
            return [{ affectedRows: 1 }];
          },
        };
      },
    }),
  });
});

describe("pelican.uploadProductImage", () => {
  it("rejects a signed-out caller before storing anything", async () => {
    await expect(caller(null).pelican.uploadProductImage({ id: 42, dataBase64: png, contentType: "image/png" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(state.uploads).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("rejects a customer account", async () => {
    await expect(caller({ ...pelicanVendor, role: "user" }).pelican.uploadProductImage({ id: 42, dataBase64: png, contentType: "image/png" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.uploads).toHaveLength(0);
  });

  it("rejects a distributor who is not linked to a vendor", async () => {
    await expect(caller({ ...pelicanVendor, distributorId: null, approvedVendorLineId: null }).pelican.uploadProductImage({
      id: 42, dataBase64: png, contentType: "image/png",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.uploads).toHaveLength(0);
  });

  it("rejects an approved vendor that is not Pelican", async () => {
    state.vendor = { sourceKey: "acme", isApproved: true, linkedDistributorIds: null };
    state.distributors = [{ id: 9, code: "ACME", isActive: true }];
    await expect(caller().pelican.uploadProductImage({ id: 42, dataBase64: png, contentType: "image/png" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "This catalog is only available to the Pelican vendor." });
    expect(state.uploads).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("rejects an unapproved Pelican vendor record", async () => {
    state.vendor = { sourceKey: "pelican", isApproved: false, linkedDistributorIds: null };
    state.distributors = [{ id: 9, code: "ACME", isActive: true }];
    await expect(caller().pelican.uploadProductImage({ id: 42, dataBase64: png, contentType: "image/png" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.uploads).toHaveLength(0);
  });

  it("accepts the legacy PEL supply line", async () => {
    state.distributors = [{ id: 9, code: "PEL", isActive: true }];
    const result = await caller({ ...pelicanVendor, approvedVendorLineId: null }).pelican.uploadProductImage({
      id: 42, dataBase64: png, contentType: "image/png", target: "designer",
    });
    expect(result.materialImageUrl).toBe(result.url);
    expect(result.imageUrl).toBe(ORIGINAL_CATALOG);
  });

  it("lets an administrator upload for an existing item", async () => {
    const result = await caller({ ...pelicanVendor, role: "admin" }).pelican.uploadProductImage({
      id: 42, dataBase64: png, contentType: "image/png", target: "designer",
    });
    expect(result.materialImageUrl).toBe(result.url);
  });

  it("does not store a photo for a missing item", async () => {
    state.product = null;
    await expect(caller().pelican.uploadProductImage({ id: 42, dataBase64: png, contentType: "image/png" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.uploads).toHaveLength(0);
  });

  it("rejects a content type other than jpeg, png, or webp", async () => {
    await expect(caller().pelican.uploadProductImage({ id: 42, dataBase64: png, contentType: "image/gif" as "image/png" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.uploads).toHaveLength(0);
  });

  it("rejects a decoded image larger than 10 MB", async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 7).toString("base64");
    await expect(caller().pelican.uploadProductImage({ id: 42, dataBase64: oversized, contentType: "image/png" }))
      .rejects.toThrow(/10 MB or smaller/);
    expect(state.uploads).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("rejects bytes that are not an image", async () => {
    await expect(caller().pelican.uploadProductImage({
      id: 42,
      dataBase64: Buffer.from("not-a-photo").toString("base64"),
      contentType: "image/png",
    })).rejects.toThrow(/could not be read|do not match/);
    expect(state.uploads).toHaveLength(0);
  });

  it("rejects a file whose bytes do not match the declared type", async () => {
    await expect(caller().pelican.uploadProductImage({ id: 42, dataBase64: png, contentType: "image/jpeg" }))
      .rejects.toThrow(/do not match the declared file type/);
    expect(state.uploads).toHaveLength(0);
  });

  it("stores the provided photo as webp and writes both columns when target is omitted", async () => {
    const result = await caller().pelican.uploadProductImage({
      id: 42,
      dataBase64: `data:image/png;base64,${png}`,
      contentType: "image/png",
    });
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0].key).toMatch(/^pelican\/products\/42\/\d+-[a-f0-9]{8}\.webp$/);
    expect(state.uploads[0].contentType).toBe("image/webp");
    const meta = await sharp(state.uploads[0].data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(24);
    expect(result.width).toBe(32);
    expect(result.height).toBe(24);
    expect(result.url).toBe(`/manus-storage/${state.uploads[0].key}`);
    expect(result.materialImageUrl).toBe(result.url);
    expect(result.imageUrl).toBe(result.url);
    expect(state.updates).toEqual([{
      table: "pelican_products",
      patch: { materialImageUrl: result.url, imageUrl: result.url },
    }]);
  });

  it("crops a uniform white frame and keeps transparency inside the photo", async () => {
    const framed = await pngFromRgba(100, 80, (x, y) => {
      const innerX = x - 10;
      const innerY = y - 10;
      const inside = innerX >= 0 && innerY >= 0 && innerX < 80 && innerY < 60;
      if (!inside) return [255, 255, 255, 255];
      if (innerX >= 20 && innerX < 28 && innerY >= 16 && innerY < 24) return [0, 0, 0, 0];
      return [180, 30, 30, 255];
    });
    const designer = await caller().pelican.uploadProductImage({
      id: 42,
      dataBase64: framed.toString("base64"),
      contentType: "image/png",
      target: "designer",
    });
    const catalog = await caller().pelican.uploadProductImage({
      id: 42,
      dataBase64: framed.toString("base64"),
      contentType: "image/png",
      target: "catalog",
    });
    expect(designer).toMatchObject({ width: 80, height: 60, materialImageUrl: designer.url, imageUrl: ORIGINAL_CATALOG });
    expect(catalog).toMatchObject({ width: 80, height: 60, imageUrl: catalog.url, materialImageUrl: designer.url });
    for (const stored of state.uploads) {
      const raw = await sharp(stored.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(raw.info.width).toBe(80);
      expect(raw.info.height).toBe(60);
      const corner = pixel(raw.data, raw.info.width, 0, 0);
      expect(corner[0]).toBeGreaterThan(140);
      expect(corner[1]).toBeLessThan(80);
      expect(corner[2]).toBeLessThan(80);
      expect(corner[3]).toBe(255);
      const hole = pixel(raw.data, raw.info.width, 24, 20);
      expect(hole[3]).toBe(0);
    }
  });

  it("leaves a photo with no white frame at its original dimensions", async () => {
    const plain = await pngFromRgba(48, 36, () => [12, 80, 140, 255]);
    const result = await caller().pelican.uploadProductImage({
      id: 42,
      dataBase64: plain.toString("base64"),
      contentType: "image/png",
      target: "both",
    });
    expect(result.width).toBe(48);
    expect(result.height).toBe(36);
    const raw = await sharp(state.uploads[0].data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(raw.info.width).toBe(48);
    expect(raw.info.height).toBe(36);
    const corner = pixel(raw.data, raw.info.width, 0, 0);
    expect(corner[0]).toBeLessThan(40);
    expect(corner[2]).toBeGreaterThan(100);
  });

  it("keeps the untrimmed photo when the white frame would remove more than 40% of a side", async () => {
    const mostlyFrame = await pngFromRgba(100, 100, (x, y) => (
      x >= 46 && x < 54 && y >= 46 && y < 54 ? [20, 20, 20, 255] : [255, 255, 255, 255]
    ));
    const result = await caller().pelican.uploadProductImage({
      id: 42,
      dataBase64: mostlyFrame.toString("base64"),
      contentType: "image/png",
      target: "designer",
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    const raw = await sharp(state.uploads[0].data).raw().toBuffer({ resolveWithObject: true });
    expect(raw.info.width).toBe(100);
    expect(raw.info.height).toBe(100);
  });

  it("downscales the long edge to 4096px before storing", async () => {
    await caller().pelican.uploadProductImage({ id: 42, dataBase64: widePng, contentType: "image/png", target: "both" });
    const meta = await sharp(state.uploads[0].data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(4096);
    expect(meta.height).toBeLessThanOrEqual(4096);
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(4096);
  });

  it("writes only the Designer photo when target is designer", async () => {
    const result = await caller().pelican.uploadProductImage({
      id: 42, dataBase64: jpeg, contentType: "image/jpeg", target: "designer", alsoSetCatalogImage: true,
    });
    expect(result.materialImageUrl).toBe(result.url);
    expect(result.imageUrl).toBe(ORIGINAL_CATALOG);
    expect(state.updates[0].patch).toEqual({ materialImageUrl: result.url });
    expect(state.product?.imageUrl).toBe(ORIGINAL_CATALOG);
  });

  it("writes only the catalog photo when target is catalog", async () => {
    const result = await caller().pelican.uploadProductImage({
      id: 42, dataBase64: png, contentType: "image/png", target: "catalog", useAsDesignerPhoto: true,
    });
    expect(result.imageUrl).toBe(result.url);
    expect(result.materialImageUrl).toBe(ORIGINAL_DESIGNER);
    expect(state.updates[0].patch).toEqual({ imageUrl: result.url });
    expect(state.product?.materialImageUrl).toBe(ORIGINAL_DESIGNER);
  });

  it("writes both columns when target is both, even if the flags say otherwise", async () => {
    const result = await caller().pelican.uploadProductImage({
      id: 42,
      dataBase64: png,
      contentType: "image/png",
      target: "both",
      useAsDesignerPhoto: false,
      alsoSetCatalogImage: false,
    });
    expect(state.updates[0].patch).toEqual({ materialImageUrl: result.url, imageUrl: result.url });
  });

  it("leaves both columns unchanged when the flags opt out and target is omitted", async () => {
    const result = await caller().pelican.uploadProductImage({
      id: 42,
      dataBase64: png,
      contentType: "image/png",
      useAsDesignerPhoto: false,
      alsoSetCatalogImage: false,
    });
    expect(result.url).toMatch(/^\/manus-storage\/pelican\/products\/42\//);
    expect(result.materialImageUrl).toBe(ORIGINAL_DESIGNER);
    expect(result.imageUrl).toBe(ORIGINAL_CATALOG);
    expect(state.updates).toHaveLength(0);
  });

  it("uses a new storage key for every upload", async () => {
    await caller().pelican.uploadProductImage({ id: 42, dataBase64: png, contentType: "image/png", target: "designer" });
    await caller().pelican.uploadProductImage({ id: 42, dataBase64: jpeg, contentType: "image/jpeg", target: "catalog" });
    expect(state.uploads[0].key).not.toBe(state.uploads[1].key);
  });
});

describe("pelican.updateProduct materialImageUrl", () => {
  const base = {
    id: 42,
    name: "Calacatta",
    description: "Quartz slab",
    imageUrl: "https://cdn.example/pasted.jpg",
    yourCost: 12,
    retailPrice: 40,
  };

  it("saves an optional Designer image without requiring it", async () => {
    await caller().pelican.updateProduct({
      ...base,
      materialImageUrl: "/manus-storage/pelican/products/42/vendor-swatch.webp",
    });
    expect(state.updates[0].patch).toMatchObject({
      materialImageUrl: "/manus-storage/pelican/products/42/vendor-swatch.webp",
      imageUrl: "https://cdn.example/pasted.jpg",
    });

    state.updates = [];
    await caller().pelican.updateProduct(base);
    expect(state.updates[0].patch).not.toHaveProperty("materialImageUrl");
  });

  it("clears the Designer image with null and rejects a non-http address", async () => {
    await caller().pelican.updateProduct({ ...base, materialImageUrl: null });
    expect(state.updates[0].patch.materialImageUrl).toBeNull();

    state.updates = [];
    await expect(caller().pelican.updateProduct({ ...base, materialImageUrl: "javascript:alert(1)" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.updates).toHaveLength(0);
  });

  it("uses the same Pelican vendor gate as the other product edits", async () => {
    state.vendor = { sourceKey: "acme", isApproved: true, linkedDistributorIds: null };
    state.distributors = [{ id: 9, code: "ACME", isActive: true }];
    await expect(caller().pelican.updateProduct({ ...base, materialImageUrl: "https://cdn.example/swatch.jpg" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.updates).toHaveLength(0);
  });
});

describe("pelican.updateProduct imageUrl", () => {
  const base = {
    id: 42,
    name: "Calacatta",
    description: "Quartz slab",
    yourCost: 12,
    retailPrice: 40,
  };

  it("keeps an uploaded catalog photo when imageUrl is omitted", async () => {
    state.product = { ...state.product!, imageUrl: UPLOADED_CATALOG };
    await caller().pelican.updateProduct({ ...base, name: "Calacatta Oro" });
    expect(state.updates[0].patch).not.toHaveProperty("imageUrl");
    expect(state.updates[0].patch).toMatchObject({ name: "Calacatta Oro" });
    expect(state.product?.imageUrl).toBe(UPLOADED_CATALOG);
  });

  it("saves a stored /manus-storage path", async () => {
    const stored = "/manus-storage/pelican/products/42/vendor.webp";
    await caller().pelican.updateProduct({ ...base, imageUrl: stored });
    expect(state.updates[0].patch.imageUrl).toBe(stored);
    expect(state.product?.imageUrl).toBe(stored);
  });

  it("updates the catalog photo from an http URL", async () => {
    state.product = { ...state.product!, imageUrl: UPLOADED_CATALOG };
    await caller().pelican.updateProduct({ ...base, imageUrl: "https://cdn.example/new-catalog.jpg" });
    expect(state.updates[0].patch.imageUrl).toBe("https://cdn.example/new-catalog.jpg");
    expect(state.product?.imageUrl).toBe("https://cdn.example/new-catalog.jpg");
  });

  it("rejects an invalid image string and leaves the upload in place", async () => {
    state.product = { ...state.product!, imageUrl: UPLOADED_CATALOG };
    await expect(caller().pelican.updateProduct({ ...base, imageUrl: "not a url" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.updates).toHaveLength(0);
    expect(state.product?.imageUrl).toBe(UPLOADED_CATALOG);
  });

  it("clears the catalog photo with null, matching materialImageUrl", async () => {
    state.product = { ...state.product!, imageUrl: UPLOADED_CATALOG };
    await caller().pelican.updateProduct({ ...base, imageUrl: null });
    expect(state.updates[0].patch.imageUrl).toBeNull();
    expect(state.product?.imageUrl).toBeNull();
  });
});

describe("pelican room scene photo", () => {
  const base = {
    id: 42,
    name: "Calacatta",
    description: "Quartz slab",
    yourCost: 12,
    retailPrice: 40,
  };

  it("writes only roomSceneImageUrl when target is roomScene", async () => {
    const result = await caller().pelican.uploadProductImage({
      id: 42,
      dataBase64: png,
      contentType: "image/png",
      target: "roomScene",
      useAsDesignerPhoto: true,
      alsoSetCatalogImage: true,
    });
    expect(result.url).toMatch(/^\/manus-storage\/pelican\/products\/42\/.+\.webp$/);
    expect(result.roomSceneImageUrl).toBe(result.url);
    expect(result.imageUrl).toBe(ORIGINAL_CATALOG);
    expect(result.materialImageUrl).toBe(ORIGINAL_DESIGNER);
    expect(state.uploads[0].contentType).toBe("image/webp");
    expect((await sharp(state.uploads[0].data).metadata()).format).toBe("webp");
    expect(state.updates[0].patch).toEqual({ roomSceneImageUrl: result.url });
    expect(state.product?.imageUrl).toBe(ORIGINAL_CATALOG);
    expect(state.product?.materialImageUrl).toBe(ORIGINAL_DESIGNER);
  });

  it("crops a room-scene photo with the same white-frame pipeline", async () => {
    const framed = await pngFromRgba(100, 80, (x, y) => {
      const innerX = x - 10;
      const innerY = y - 10;
      const inside = innerX >= 0 && innerY >= 0 && innerX < 80 && innerY < 60;
      if (!inside) return [255, 255, 255, 255];
      return [180, 30, 30, 255];
    });
    const result = await caller().pelican.uploadProductImage({
      id: 42,
      dataBase64: framed.toString("base64"),
      contentType: "image/png",
      target: "roomScene",
    });
    expect(result).toMatchObject({ width: 80, height: 60, roomSceneImageUrl: result.url });
    expect(state.updates[0].patch).toEqual({ roomSceneImageUrl: result.url });
    expect(state.product?.imageUrl).toBe(ORIGINAL_CATALOG);
    expect(state.product?.materialImageUrl).toBe(ORIGINAL_DESIGNER);
  });

  it("leaves the room scene unchanged when imageUrl is omitted and when target is not roomScene", async () => {
    await caller().pelican.updateProduct(base);
    expect(state.updates[0].patch).not.toHaveProperty("roomSceneImageUrl");
    expect(state.product?.roomSceneImageUrl).toBe(ORIGINAL_ROOM);

    state.updates = [];
    await caller().pelican.uploadProductImage({ id: 42, dataBase64: png, contentType: "image/png", target: "catalog" });
    expect(state.updates[0].patch).toEqual({ imageUrl: state.uploads[0].url });
    expect(state.product?.roomSceneImageUrl).toBe(ORIGINAL_ROOM);
  });

  it("saves an http URL or a /manus-storage path and clears with null", async () => {
    await caller().pelican.updateProduct({
      ...base,
      roomSceneImageUrl: "https://cdn.example/room.jpg",
    });
    expect(state.updates[0].patch.roomSceneImageUrl).toBe("https://cdn.example/room.jpg");

    state.updates = [];
    const stored = "/manus-storage/pelican/products/42/room-scene.webp";
    await caller().pelican.updateProduct({ ...base, roomSceneImageUrl: stored });
    expect(state.updates[0].patch.roomSceneImageUrl).toBe(stored);
    expect(state.product?.imageUrl).toBe(ORIGINAL_CATALOG);

    state.updates = [];
    await caller().pelican.updateProduct({ ...base, roomSceneImageUrl: null });
    expect(state.updates[0].patch.roomSceneImageUrl).toBeNull();
    expect(state.product?.roomSceneImageUrl).toBeNull();
  });

  it("rejects an invalid room-scene string without writing", async () => {
    await expect(caller().pelican.updateProduct({ ...base, roomSceneImageUrl: "javascript:alert(1)" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.updates).toHaveLength(0);
    expect(state.product?.roomSceneImageUrl).toBe(ORIGINAL_ROOM);
  });

  it("returns roomSceneImageUrl from the vendor list and the product pages", async () => {
    state.product = {
      ...state.product!,
      category: "Quartz Slabs (Countertops)",
      name: "Calacatta",
      description: "Quartz slab",
      slug: "calacatta",
      isActive: true,
      showInCatalog: true,
    };
    const list = await caller().pelican.adminList({ limit: 10, offset: 0 });
    expect(list.items[0]?.roomSceneImageUrl).toBe(ORIGINAL_ROOM);
    const detail = await caller(null).pelican.bySlug({ slug: "calacatta" });
    expect(detail?.roomSceneImageUrl).toBe(ORIGINAL_ROOM);
    const page = await caller(null).pelican.byCategory({ category: "Quartz Slabs (Countertops)", scope: "catalog", limit: 10, offset: 0 });
    expect(page.items[0]?.roomSceneImageUrl).toBe(ORIGINAL_ROOM);
  });

  it("keeps the same Pelican vendor gate for a room-scene upload", async () => {
    state.vendor = { sourceKey: "acme", isApproved: true, linkedDistributorIds: null };
    state.distributors = [{ id: 9, code: "ACME", isActive: true }];
    await expect(caller().pelican.uploadProductImage({ id: 42, dataBase64: png, contentType: "image/png", target: "roomScene" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.uploads).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });
});

describe("pelican roomSceneImageUrl column", () => {
  const schema = readFileSync(new URL("../../drizzle/pelicanSchema.ts", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../../docs/sql/0242_pelican_room_scene_image.tidb.sql", import.meta.url), "utf8");

  it("is a nullable varchar(512) on pelican_products, not a door-style column", () => {
    expect(schema).toContain('roomSceneImageUrl: varchar("roomSceneImageUrl", { length: 512 }),');
    expect(schema).not.toContain('roomSceneImageUrl: varchar("roomSceneImageUrl", { length: 512 }).notNull()');
  });

  it("has a by-hand TiDB file: one statement per numbered block, then COMMIT and SELECT 'COMMITTED'", () => {
    expect(sql).toContain("ALTER TABLE cabinet_dealz.pelican_products ADD COLUMN IF NOT EXISTS roomSceneImageUrl VARCHAR(512) NULL;");
    const blocks = sql.split(/^-- \d+\n/m).slice(1);
    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      const statements = block.split("\n").filter((line) => !line.startsWith("--")).join("\n").split(";").map((part) => part.trim()).filter(Boolean);
      expect(statements).toHaveLength(1);
    }
    expect(sql).toContain("COMMIT;");
    expect(sql).toContain("SELECT 'COMMITTED';");
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });
});
