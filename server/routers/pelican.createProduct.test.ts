import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const { getDbMock, state } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  state: {
    vendor: { sourceKey: "pelican" as string | null, isApproved: true, linkedDistributorIds: null as number[] | null },
    distributors: [{ id: 9, code: "PEL", isActive: true }],
    products: [] as Array<{
      id: number;
      name: string;
      slug: string;
      category: string;
      pelicanCode: string;
    }>,
    markups: [] as Array<{ category: string; markupBps: number }>,
    inserts: [] as Array<{ table: string; row: Record<string, unknown>; id: number }>,
    nextId: 1,
    insertError: null as unknown,
  },
}));

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return { ...actual, getDb: getDbMock };
});

import { appRouter } from "../routers";

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
  if (name === "pelican_products") return state.products.map((row) => ({ ...row }));
  if (name === "pelican_category_markups") return state.markups.map((row) => ({ ...row }));
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

const mosaic = {
  category: "Tile & Mosaic",
  subCategory: "Mosaic",
  name: "Hex Glass Mosaic",
};

beforeEach(() => {
  state.vendor = { sourceKey: "pelican", isApproved: true, linkedDistributorIds: null };
  state.distributors = [{ id: 9, code: "PEL", isActive: true }];
  state.products = [];
  state.markups = [];
  state.inserts = [];
  state.nextId = 1;
  state.insertError = null;
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({
    select: () => ({
      from(table: unknown) {
        return query(rowsFor(table));
      },
    }),
    insert: (table: unknown) => ({
      values: async (row: Record<string, unknown>) => {
        if (state.insertError) throw state.insertError;
        const name = getTableName(table as Parameters<typeof getTableName>[0]);
        const id = state.nextId++;
        state.inserts.push({ table: name, row, id });
        if (name === "pelican_products") {
          state.products.push({
            id,
            name: String(row.name),
            slug: String(row.slug),
            category: String(row.category),
            pelicanCode: String(row.pelicanCode),
          });
        }
        return [{ insertId: id }];
      },
    }),
  });
});

describe("pelican.createProduct", () => {
  it("rejects a signed-out caller before inserting", async () => {
    await expect(caller(null).pelican.createProduct(mosaic)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a customer account", async () => {
    await expect(caller({ ...pelicanVendor, role: "user" }).pelican.createProduct(mosaic))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a distributor who is not linked to a vendor", async () => {
    await expect(caller({ ...pelicanVendor, distributorId: null, approvedVendorLineId: null }).pelican.createProduct(mosaic))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects an approved vendor that is not Pelican", async () => {
    state.vendor = { sourceKey: "acme", isApproved: true, linkedDistributorIds: null };
    state.distributors = [{ id: 9, code: "ACME", isActive: true }];
    await expect(caller().pelican.createProduct(mosaic))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "This catalog is only available to the Pelican vendor." });
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects an unapproved Pelican vendor record", async () => {
    state.vendor = { sourceKey: "pelican", isApproved: false, linkedDistributorIds: null };
    state.distributors = [{ id: 9, code: "ACME", isActive: true }];
    await expect(caller().pelican.createProduct(mosaic)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.inserts).toHaveLength(0);
  });

  it("accepts the legacy PEL supply line", async () => {
    const result = await caller({ ...pelicanVendor, approvedVendorLineId: null }).pelican.createProduct(mosaic);
    expect(result.id).toBe(1);
    expect(result.slug).toBe("hex-glass-mosaic");
  });

  it("lets an administrator create without being the Pelican vendor and without storing an owner", async () => {
    state.vendor = { sourceKey: "acme", isApproved: true, linkedDistributorIds: null };
    state.distributors = [{ id: 4, code: "ACME", isActive: true }];
    const result = await caller({
      ...pelicanVendor,
      role: "admin",
      distributorId: null,
      approvedVendorLineId: null,
      openId: "not-a-hardcoded-owner",
    }).pelican.createProduct({ ...mosaic, listPrice: 10 });

    expect(result).toMatchObject({
      id: 1,
      pelicanCode: "hex-glass-mosaic",
      slug: "hex-glass-mosaic",
      sellPrice: 15.5,
      markupBps: 5500,
    });
    expect(state.inserts[0]?.row).not.toHaveProperty("openId");
    expect(state.inserts[0]?.row).not.toHaveProperty("userId");
    expect(state.inserts[0]?.row).not.toHaveProperty("ownerId");
    expect(JSON.stringify(state.inserts[0]?.row)).not.toContain("not-a-hardcoded-owner");
  });

  it("inserts a catalog row with portal defaults and returns the new id", async () => {
    const result = await caller().pelican.createProduct({
      ...mosaic,
      description: "  2x2 glass  ",
      size: "12 x 12",
      listPrice: 20,
      msrp: 40,
      coverageSqFt: 12.5,
    });

    expect(result).toEqual({
      id: 1,
      pelicanCode: "hex-glass-mosaic",
      slug: "hex-glass-mosaic",
      name: "Hex Glass Mosaic",
      description: "2x2 glass",
      category: "Tile & Mosaic",
      subCategory: "Mosaic",
      size: "12 x 12",
      listPrice: "20.00",
      msrp: "40.00",
      coverageSqFt: "12.50",
      isActive: true,
      showInCatalog: true,
      showInDesigner: true,
      sellPrice: 31,
      markupBps: 5500,
    });
    expect(state.inserts[0]).toMatchObject({
      table: "pelican_products",
      id: 1,
      row: {
        pelicanCode: "hex-glass-mosaic",
        slug: "hex-glass-mosaic",
        description: "2x2 glass",
        isActive: true,
        showInCatalog: true,
        showInDesigner: true,
      },
    });
    expect(state.inserts[0]?.row.yourCost).toBeUndefined();
    expect(state.inserts[0]?.row.retailPrice).toBeUndefined();
  });

  it("uses a saved category markup instead of the built-in default", async () => {
    state.markups = [{ category: "Tile & Mosaic", markupBps: 2000 }];
    const result = await caller().pelican.createProduct({ ...mosaic, listPrice: 10 });
    expect(result.sellPrice).toBe(12);
    expect(result.markupBps).toBe(2000);
  });

  it("does not mark up MSRP when there is no list price", async () => {
    const result = await caller().pelican.createProduct({ ...mosaic, msrp: 80 });
    expect(result.listPrice).toBeNull();
    expect(result.msrp).toBe("80.00");
    expect(result.sellPrice).toBeNull();
    expect(result.markupBps).toBe(5500);
  });

  it("keeps an omitted description empty and an omitted size blank", async () => {
    const result = await caller().pelican.createProduct(mosaic);
    expect(result.description).toBe("");
    expect(result.size).toBeNull();
    expect(result.listPrice).toBeNull();
    expect(result.coverageSqFt).toBeNull();
    expect(result.sellPrice).toBeNull();
  });

  it("stores explicit visibility flags", async () => {
    const result = await caller().pelican.createProduct({
      ...mosaic,
      isActive: false,
      showInCatalog: false,
      showInDesigner: true,
    });
    expect(result.isActive).toBe(false);
    expect(result.showInCatalog).toBe(false);
    expect(result.showInDesigner).toBe(true);
  });

  it("keeps a vendor SKU and generates one when the SKU is blank", async () => {
    const provided = await caller().pelican.createProduct({ ...mosaic, pelicanCode: "Pel-200" });
    expect(provided.pelicanCode).toBe("Pel-200");

    const generated = await caller().pelican.createProduct({
      ...mosaic,
      name: "Penny Round",
      pelicanCode: "  ",
    });
    expect(generated.id).toBe(2);
    expect(generated.pelicanCode).toBe("penny-round");
    expect(generated.slug).toBe("penny-round");
  });

  it("rejects the same name in the same category", async () => {
    state.products = [{ id: 7, name: "Glass Mosaic", slug: "glass-mosaic", category: "Tile & Mosaic", pelicanCode: "GL-1" }];
    await expect(caller().pelican.createProduct({ ...mosaic, name: "glass   mosaic" }))
      .rejects.toMatchObject({
        code: "CONFLICT",
        message: 'A product named "glass   mosaic" already exists in Tile & Mosaic. Edit that item instead of adding another.',
      });
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a different name that would reuse the category slug", async () => {
    state.products = [{ id: 7, name: "Blue Glass Tile", slug: "blue-glass", category: "Tile & Mosaic", pelicanCode: "BG-1" }];
    await expect(caller().pelican.createProduct({ ...mosaic, name: "Blue Glass" }))
      .rejects.toMatchObject({
        code: "CONFLICT",
        message: 'A product in Tile & Mosaic already uses the catalog link "blue-glass". Choose a different name.',
      });
    expect(state.inserts).toHaveLength(0);
  });

  it("allows the same name in another category and keeps the slug unique", async () => {
    state.products = [{ id: 7, name: "Hex Mosaic", slug: "hex-mosaic", category: "Flooring", pelicanCode: "HEX-1" }];
    const result = await caller().pelican.createProduct({ ...mosaic, name: "Hex Mosaic" });
    expect(result.slug).toBe("hex-mosaic-2");
    expect(result.pelicanCode).toBe("hex-mosaic");
    expect(result.category).toBe("Tile & Mosaic");
  });

  it("rejects a SKU that already exists, ignoring letter case", async () => {
    state.products = [{ id: 7, name: "Other", slug: "other", category: "Flooring", pelicanCode: "PEL-100" }];
    await expect(caller().pelican.createProduct({ ...mosaic, pelicanCode: "pel-100" }))
      .rejects.toMatchObject({
        code: "CONFLICT",
        message: 'A product with SKU "pel-100" already exists. Use a different SKU or edit that item.',
      });
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a name that cannot become a catalog link", async () => {
    await expect(caller().pelican.createProduct({ ...mosaic, name: "---" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a missing category, name, or subcategory before inserting", async () => {
    await expect(caller().pelican.createProduct({ ...mosaic, subCategory: "  " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().pelican.createProduct({ category: "Tile & Mosaic", subCategory: "Mosaic" } as never))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.inserts).toHaveLength(0);
  });

  it("turns a unique-index collision into a clear conflict", async () => {
    state.insertError = Object.assign(new Error("wrapped"), { cause: { errno: 1062, message: "Duplicate entry 'hex-glass-mosaic' for key 'slug'" } });
    await expect(caller().pelican.createProduct(mosaic)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "A product with this name, catalog link, or SKU already exists. Edit that item instead of adding another.",
    });
  });

  it("reports a database outage without inserting", async () => {
    getDbMock.mockResolvedValue(null);
    await expect(caller().pelican.createProduct(mosaic))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(state.inserts).toHaveLength(0);
  });
});
