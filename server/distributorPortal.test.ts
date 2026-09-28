import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { cabinets, distributors, distributorSkus, doorStyles, vendorLines, vendorProducts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function ctxFor(user: Record<string, unknown> | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

const anonUser = ctxFor({ id: 990101, openId: "dp-user", name: "User", email: "dp-user@example.com", role: "user", distributorId: null });
const adminUser = ctxFor({ id: 990102, openId: "dp-admin", name: "Admin", email: "dp-admin@example.com", role: "admin", distributorId: null });
const unlinkedDistributor = ctxFor({ id: 990103, openId: "dp-dist", name: "Dist", email: "dp-dist@example.com", role: "distributor", distributorId: null });

describe("distributorPortal — access control", () => {
  it("rejects a plain user", async () => {
    const caller = appRouter.createCaller(anonUser);
    await expect(caller.distributorPortal.myLine()).rejects.toThrow();
  });

  it("rejects a distributor not linked to a line", async () => {
    const caller = appRouter.createCaller(unlinkedDistributor);
    await expect(caller.distributorPortal.myLine()).rejects.toThrow();
  });

  it("requires admins to pass a distributorId", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminUser);
    await expect(caller.distributorPortal.myLine()).rejects.toThrow();
  });

  it("allows an administrator to preview any selected approved supplier line", async () => {
    const db = await getDb();
    if (!db) return;
    const [line] = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (!line) return;
    const caller = appRouter.createCaller(adminUser);
    const preview = await caller.distributorPortal.myLine({ distributorId: line.id });
    expect(preview.line.id).toBe(line.id);
  });

  it("lets a linked supplier update only its own approved profile", async () => {
    const db = await getDb();
    if (!db) return;
    const [line] = await db
      .select({ id: distributors.id })
      .from(distributors)
      .where(eq(distributors.isActive, true))
      .limit(1);
    if (!line) return;

    const marker = `PROFILE_TEST_${Date.now()}`;
    const created = await db.insert(vendorLines).values({
      name: marker,
      sourceKey: `dist:${line.id}`,
      contactName: "Before",
      contactEmail: "before@example.com",
      contactPhone: "555-0000",
      isApproved: true,
    });
    const vendorId = Number((created as unknown as [{ insertId: number }])[0]?.insertId ?? 0);
    try {
      const supplier = appRouter.createCaller(ctxFor({
        id: 990105,
        openId: "dp-profile",
        name: "Profile supplier",
        email: "before@example.com",
        role: "distributor",
        distributorId: line.id,
        approvedVendorLineId: vendorId,
      }));
      const result = await supplier.distributorPortal.updateSupplierProfile({
        contactName: "Updated supplier",
        contactEmail: "updated@example.com",
        contactPhone: "555-0100",
        websiteUrl: "https://supplier.example.com",
        notes: "Updated by the linked supplier",
        catalogPdfUrl: "https://supplier.example.com/catalog.pdf",
        specBookPdfUrl: "https://supplier.example.com/specs.pdf",
      });
      expect(result).toMatchObject({ success: true, vendorId });
      const [stored] = await db
        .select({ contactName: vendorLines.contactName, contactEmail: vendorLines.contactEmail, notes: vendorLines.notes })
        .from(vendorLines)
        .where(eq(vendorLines.id, vendorId));
      expect(stored).toMatchObject({
        contactName: "Updated supplier",
        contactEmail: "updated@example.com",
        notes: "Updated by the linked supplier",
      });
	    } finally {
	      await db.delete(vendorLines).where(eq(vendorLines.id, vendorId));
	    }
	  });

	  it("lets an approved vendor without a catalog line update only its own profile", async () => {
	    const db = await getDb();
	    if (!db) return;
	    const marker = `PROFILE_ONLY_TEST_${Date.now()}`;
	    const created = await db.insert(vendorLines).values({
	      name: marker,
	      sourceKey: null,
	      contactName: "Profile-only supplier",
	      contactEmail: "profile-only@example.com",
	      contactPhone: "555-0200",
	      isApproved: true,
	    });
	    const vendorId = Number((created as unknown as [{ insertId: number }])[0]?.insertId ?? 0);
	    try {
	      const supplier = appRouter.createCaller(ctxFor({
	        id: 990106,
	        openId: "dp-profile-only",
	        name: "Profile only supplier",
	        email: "profile-only@example.com",
	        role: "distributor",
	        distributorId: null,
	        approvedVendorLineId: vendorId,
	      }));
	      const profile = await supplier.distributorPortal.supplierProfile();
	      expect(profile.vendor).toMatchObject({ id: vendorId, name: marker });
	      const result = await supplier.distributorPortal.updateSupplierProfile({
	        contactName: "Updated profile-only supplier",
	        contactEmail: "profile-only@example.com",
	        contactPhone: "555-0201",
	        websiteUrl: "",
	        notes: "Source line pending",
	        catalogPdfUrl: "",
	        specBookPdfUrl: "",
	      });
	      expect(result).toMatchObject({ success: true, vendorId });
	    } finally {
	      await db.delete(vendorLines).where(eq(vendorLines.id, vendorId));
	    }
	  });

	  it("lets an administrator preview the exact selected profile-only vendor", async () => {
	    const db = await getDb();
	    if (!db) return;
	    const marker = `ADMIN_PROFILE_ONLY_${Date.now()}`;
	    const created = await db.insert(vendorLines).values({
	      name: marker,
	      sourceKey: null,
	      contactEmail: "admin-profile-only@example.com",
	      isApproved: true,
	    });
	    const vendorId = Number((created as unknown as [{ insertId: number }])[0]?.insertId ?? 0);
	    try {
	      const admin = appRouter.createCaller(ctxFor({
	        id: 990107,
	        openId: "dp-admin-profile-only",
	        name: "Administrator",
	        email: "admin@example.com",
	        role: "admin",
	        distributorId: null,
	      }));
	      const profile = await admin.distributorPortal.supplierProfile({ approvedVendorLineId: vendorId });
	      expect(profile.vendor).toMatchObject({ id: vendorId, name: marker });
	    } finally {
	      await db.delete(vendorLines).where(eq(vendorLines.id, vendorId));
	    }
	  });
});

describe("distributorPortal — scoped data + visibility toggle", () => {
  it("refuses to create a second cabinet/line/style connection", async () => {
    const db = await getDb();
    if (!db) return;
    const existing = await db
      .select({
        cabinetId: distributorSkus.cabinetId,
        distributorId: distributorSkus.distributorId,
        styleId: distributorSkus.styleId,
        distributorSku: distributorSkus.distributorSku,
      })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .limit(1);
    if (!existing[0]) return;

    const caller = appRouter.createCaller(adminUser);
    await expect(
      caller.distributorPortal.submitNewProduct({
        cabinetId: existing[0].cabinetId,
        distributorId: existing[0].distributorId,
        styleId: existing[0].styleId,
        distributorSku: existing[0].distributorSku || "existing-sku",
      }),
    ).rejects.toThrow("already exists");
  });

  it("accepts an unmatched supplier SKU, stores it pending, and returns it in the catalog", async () => {
    const db = await getDb();
    if (!db) return;
    const lines = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (lines.length === 0) return;
    const lineId = lines[0].id;
    const styles = await db
      .select({ id: doorStyles.id })
      .from(doorStyles)
      .where(eq(doorStyles.distributorId, lineId))
      .limit(1);
    if (styles.length === 0) return;

    const unmatchedSku = `UNMATCHED_TEST_${Date.now()}`;
    const caller = appRouter.createCaller(adminUser);
    let skuId: number | null = null;
    try {
      const submitted = await caller.distributorPortal.submitNewProduct({
        distributorId: lineId,
        styleId: styles[0].id,
        distributorSku: unmatchedSku,
        yourCost: "8.25",
      });
      skuId = submitted.skuId;
      expect(submitted.status).toBe("pending");

      const stored = await db
        .select({ cabinetId: distributorSkus.cabinetId, status: distributorSkus.status, isPublished: distributorSkus.isPublished, yourCost: distributorSkus.yourCost, platformSku: distributorSkus.platformSku })
        .from(distributorSkus)
        .where(eq(distributorSkus.id, skuId))
        .limit(1);
      expect(stored[0]).toMatchObject({ cabinetId: null, status: "pending", isPublished: false, yourCost: "8.25" });
      expect(stored[0]?.platformSku).toMatch(/^UNMAPPED-/);

      const catalog = await caller.distributorPortal.catalog({ distributorId: lineId, search: unmatchedSku, onlyPending: true, limit: 10, offset: 0 });
      expect(catalog.total).toBe(1);
      expect(catalog.items[0]).toMatchObject({ skuId, cabinetId: null, masterCode: null, distributorSku: unmatchedSku, status: "pending" });
    } finally {
      if (skuId != null) await db.delete(distributorSkus).where(eq(distributorSkus.id, skuId));
    }
  });

  it("lets an admin draft, edit, publish, and list a standalone supplier product", async () => {
    const db = await getDb();
    if (!db) return;
    const lines = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (lines.length === 0) return;
    const lineId = lines[0].id;
    const styles = await db
      .select({ id: doorStyles.id })
      .from(doorStyles)
      .where(eq(doorStyles.distributorId, lineId))
      .limit(1);
    if (styles.length === 0) return;

    const supplierSku = `DIRECT_PRODUCT_${Date.now()}`;
    const caller = appRouter.createCaller(adminUser);
    let skuId: number | null = null;
    try {
      const drafted = await caller.distributorPortal.adminSaveProduct({
        distributorId: lineId,
        styleId: styles[0].id,
        distributorSku: supplierSku,
        supplierCabinetName: "Directly managed supplier item",
        yourCost: 11.5,
        mode: "draft",
      });
      skuId = drafted.skuId;
      expect(drafted).toMatchObject({ status: "pending", isPublished: false, cabinetId: null });

      const drafts = await caller.distributorPortal.adminProductList({
        distributorId: lineId,
        status: "pending",
        search: supplierSku,
      });
      expect(drafts.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ skuId, cabinetId: null, distributorSku: supplierSku, supplierCabinetName: "Directly managed supplier item", status: "pending", isPublished: false }),
      ]));

      const published = await caller.distributorPortal.adminSaveProduct({
        skuId,
        distributorId: lineId,
        styleId: styles[0].id,
        distributorSku: supplierSku,
        supplierCabinetName: "Updated directly managed supplier item",
        listPrice: 22.75,
        isAvailable: true,
        mode: "publish",
      });
      expect(published).toMatchObject({ skuId, status: "approved", isPublished: true, cabinetId: null });

      const publishedItems = await caller.distributorPortal.adminProductList({
        distributorId: lineId,
        status: "approved",
        search: supplierSku,
      });
      expect(publishedItems.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ skuId, cabinetId: null, distributorSku: supplierSku, supplierCabinetName: "Updated directly managed supplier item", status: "approved", isPublished: true }),
      ]));
    } finally {
      if (skuId != null) await db.delete(distributorSkus).where(eq(distributorSkus.id, skuId));
    }
  });

  it("a linked distributor sees only their line and can toggle SKU visibility", async () => {
    const db = await getDb();
    if (!db) return;

    // Pick a real line that has at least one SKU.
    const lines = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (lines.length === 0) return;
    const lineId = lines[0].id;

    const skus = await db
      .select({ id: distributorSkus.id, isPublished: distributorSkus.isPublished })
      .from(distributorSkus)
      .where(eq(distributorSkus.distributorId, lineId))
      .limit(1);
    if (skus.length === 0) return;
    const sku = skus[0];

    const distCtx = ctxFor({
      id: 990104, openId: "dp-linked", name: "Linked Dist",
      email: "dp-linked@example.com", role: "distributor", distributorId: lineId,
    });
    const caller = appRouter.createCaller(distCtx);

    const mine = await caller.distributorPortal.myLine();
    expect(mine.line.id).toBe(lineId);
    expect(mine.counts.total).toBeGreaterThan(0);

    // Catalog rows all belong to this line.
    const cat = await caller.distributorPortal.catalog({ limit: 20, offset: 0 });
    expect(cat.items.length).toBeGreaterThan(0);

    // Toggle visibility off then restore.
    const original = sku.isPublished;
    try {
      const off = await caller.distributorPortal.setVisibility({ skuId: sku.id, isPublished: false });
      expect(off.isPublished).toBe(false);
      const reread = await db
        .select({ isPublished: distributorSkus.isPublished })
        .from(distributorSkus)
        .where(eq(distributorSkus.id, sku.id))
        .limit(1);
      expect(reread[0].isPublished).toBe(false);
    } finally {
      await db.update(distributorSkus).set({ isPublished: original }).where(eq(distributorSkus.id, sku.id));
    }
  });

  it("exposes only the matching approved vendor record and its resources to a linked supplier portal", async () => {
    const db = await getDb();
    if (!db) return;
    const [line] = await db.select({ id: distributors.id, code: distributors.code }).from(distributors).limit(1);
    if (!line) return;

    const name = `__supplier_portal_profile_${Date.now()}`;
    const [inserted] = await db.insert(vendorLines).values({
      name,
      sourceKey: `dist:${line.id}`,
      category: "Cabinet",
      contactName: "Supplier Contact",
      contactEmail: "supplier@example.test",
      contactPhone: "555-0100",
      websiteUrl: "https://supplier.example.test",
      catalogPdfUrl: "https://supplier.example.test/catalog.pdf",
      specBookPdfUrl: "https://supplier.example.test/spec-book.pdf",
      isApproved: true,
    });
    const vendorId = Number((inserted as unknown as { insertId?: number }).insertId ?? 0);

    try {
      const caller = appRouter.createCaller(ctxFor({
        id: 990112, openId: "dp-supplier-profile", name: "Supplier",
        email: "supplier-portal@example.test", role: "distributor", distributorId: line.id,
      }));
      const mine = await caller.distributorPortal.myLine();
      expect(mine.approvedVendor).toMatchObject({
        name,
        contactEmail: "supplier@example.test",
        catalogPdfUrl: "https://supplier.example.test/catalog.pdf",
        specBookPdfUrl: "https://supplier.example.test/spec-book.pdf",
      });
    } finally {
      if (vendorId) await db.delete(vendorLines).where(eq(vendorLines.id, vendorId));
      else await db.delete(vendorLines).where(eq(vendorLines.name, name));
    }
  });

  it("catalog search filters at the query layer and total reflects the filter", async () => {
    const db = await getDb();
    if (!db) return;
    const lines = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (lines.length === 0) return;
    const lineId = lines[0].id;
    const distCtx = ctxFor({
      id: 990106, openId: "dp-search", name: "Search Dist",
      email: "dp-search@example.com", role: "distributor", distributorId: lineId,
    });
    const caller = appRouter.createCaller(distCtx);

      const all = await caller.distributorPortal.catalog({ limit: 500, offset: 0 });
    const mappedItem = all.items.find((item) => item.masterCode);
    if (!mappedItem) return;
    // Pick a master-code fragment from a mapped item; standalone supplier items
    // intentionally have no master code and remain visible in the vendor catalog.
    const frag = mappedItem.masterCode.slice(0, 2);
    const filtered = await caller.distributorPortal.catalog({ search: frag, limit: 500, offset: 0 });
    // total reflects the filtered set (<= unfiltered) and every row matches
    expect(filtered.total).toBeLessThanOrEqual(all.total);
    const normalizedFrag = frag.toLowerCase().replace(/[-_ ]/g, "");
    for (const it of filtered.items) {
      const hay = `${it.masterCode} ${it.description ?? ""} ${it.platformSku ?? ""} ${it.distributorSku ?? ""}`.toLowerCase();
      const normalizedHay = hay.replace(/[-_ ]/g, "");
      expect(normalizedHay.includes(normalizedFrag)).toBe(true);
    }
    expect(filtered.items.length).toBe(Math.min(filtered.total, 500));
  });

  it("orders returns only submitted orders for this line's styles", async () => {
    const db = await getDb();
    if (!db) return;
    const lines = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (lines.length === 0) return;
    const lineId = lines[0].id;
    const distCtx = ctxFor({
      id: 990107, openId: "dp-orders", name: "Orders Dist",
      email: "dp-orders@example.com", role: "distributor", distributorId: lineId,
    });
    const caller = appRouter.createCaller(distCtx);
    const rows = await caller.distributorPortal.orders({ limit: 50 });
    // shape only (data-dependent); every returned row must be submitted
    for (const r of rows) expect(r.status).toBe("submitted");
  });

	  it("a distributor cannot toggle a SKU outside their line", async () => {
    const db = await getDb();
    if (!db) return;
    const lines = await db.select({ id: distributors.id }).from(distributors).limit(2);
    if (lines.length < 2) return;
    const [lineA, lineB] = lines;

    // a SKU that belongs to line B
    const otherSku = await db
      .select({ id: distributorSkus.id })
      .from(distributorSkus)
      .where(eq(distributorSkus.distributorId, lineB.id))
      .limit(1);
    if (otherSku.length === 0) return;

    const distCtx = ctxFor({
      id: 990105, openId: "dp-a", name: "Line A Dist",
      email: "dp-a@example.com", role: "distributor", distributorId: lineA.id,
    });
    const caller = appRouter.createCaller(distCtx);
	    await expect(
	      caller.distributorPortal.setVisibility({ skuId: otherSku[0].id, isPublished: false })
	    ).rejects.toThrow();
	  });

	  it("limits featured styles and warehouse coverage to the distributor's own cabinet line", async () => {
	    const db = await getDb();
	    if (!db) return;
	    const lines = await db.select({ id: distributors.id }).from(distributors).limit(2);
	    if (lines.length < 2) return;
	    const [lineA, lineB] = lines;
	    const otherStyle = await db
	      .select({ id: doorStyles.id })
	      .from(doorStyles)
	      .where(eq(doorStyles.distributorId, lineB.id))
	      .limit(1);
	    if (!otherStyle[0]) return;

	    const ownStyleRows = await db
	      .select({ id: doorStyles.id })
	      .from(doorStyles)
	      .where(eq(doorStyles.distributorId, lineA.id));
	    const ownStyleIds = new Set(ownStyleRows.map((style) => style.id));
	    const caller = appRouter.createCaller(ctxFor({
	      id: 990108, openId: "dp-featured", name: "Featured Dist",
	      email: "dp-featured@example.com", role: "distributor", distributorId: lineA.id,
	    }));

	    const [featuredResult, shipping] = await Promise.all([
	      caller.distributorPortal.featuredStyles(),
	      caller.distributorPortal.shippingOverview(),
	    ]);
		    for (const style of featuredResult.styles) {
		      expect(ownStyleIds.has(style.id)).toBe(true);
		      expect(style.skuCount).toBeGreaterThan(0);
		      expect(style.designerCabinets.length).toBeGreaterThan(0);
		      expect(style.designerNoncompliantCabinetCount).toBeGreaterThanOrEqual(0);
		      for (const cabinet of style.designerCabinets) {
		        expect(typeof cabinet.isCompliant).toBe("boolean");
		        if (!cabinet.isCompliant) expect(typeof cabinet.reason).toBe("string");
		      }
		    }
	    expect(shipping.line.id).toBe(lineA.id);
	    for (const style of shipping.styles) expect(ownStyleIds.has(style.id)).toBe(true);

	    await expect(caller.distributorPortal.setFeaturedStyle({ styleId: otherStyle[0].id, featured: false })).rejects.toThrow("does not belong");
	  });

	  it("finds featured styles through the vendor's cabinet SKUs and categories", async () => {
	    const db = await getDb();
	    if (!db) return;
	    const [line] = await db.select({ id: distributors.id }).from(distributors).limit(1);
	    if (!line) return;
	    const caller = appRouter.createCaller(ctxFor({
	      id: 990109, openId: "dp-featured-filter", name: "Filtered Dist",
	      email: "dp-featured-filter@example.com", role: "distributor", distributorId: line.id,
	    }));
	    const initial = await caller.distributorPortal.featuredStyles();
	    const category = initial.categories[0];
	    if (!category) return;

	    const categoryFiltered = await caller.distributorPortal.featuredStyles({ categories: [category.category] });
	    for (const style of categoryFiltered.styles) {
	      expect(style.catalogCategories).toContain(category.category);
	      expect(style.matchingCabinetCount).toBeGreaterThan(0);
	    }
    const cabinet = categoryFiltered.styles.flatMap((style) => style.matchingCabinets)[0];
    if (!cabinet) return;
	    const searchFiltered = await caller.distributorPortal.featuredStyles({ search: cabinet.masterCode });
	    expect(searchFiltered.styles.length).toBeGreaterThan(0);
	    expect(searchFiltered.styles.some((style) => style.matchingCabinets.some((match) => match.masterCode === cabinet.masterCode))).toBe(true);
	  });

	  it("lets a linked vendor save its own Featured Style materials and shipping settings", async () => {
	    const db = await getDb();
	    if (!db) return;
	    const [line] = await db.select({
	      id: distributors.id,
	      warehouseName: distributors.warehouseName,
	      warehouseAddress: distributors.warehouseAddress,
	      warehouseZips: distributors.warehouseZips,
	      leadTimeDays: distributors.leadTimeDays,
	      shippingRuleMode: distributors.shippingRuleMode,
	      shippingFlatFreightFeeCents: distributors.shippingFlatFreightFeeCents,
	      shippingFreeFreightThresholdCents: distributors.shippingFreeFreightThresholdCents,
	      shippingZipRates: distributors.shippingZipRates,
	      shippingExceptions: distributors.shippingExceptions,
	      pickupEnabled: distributors.pickupEnabled,
	      pickupZip: distributors.pickupZip,
	      pickupAddress: distributors.pickupAddress,
	      pickupRadiusMiles: distributors.pickupRadiusMiles,
	    }).from(distributors).limit(1);
	    if (!line) return;
	    const caller = appRouter.createCaller(ctxFor({
	      id: 990111, openId: "dp-vendor-edit", name: "Editable Dist",
	      email: "dp-vendor-edit@example.com", role: "distributor", distributorId: line.id,
	    }));
	    const styles = await caller.distributorPortal.featuredStyles();
	    const style = styles.styles[0];
	    if (!style) return;
	    const [originalStyle] = await db.select({
	      aliasName: doorStyles.aliasName,
	      featuredLabel: doorStyles.featuredLabel,
	      profileNotes: doorStyles.profileNotes,
	    }).from(doorStyles).where(eq(doorStyles.id, style.id)).limit(1);
	    if (!originalStyle) return;

	    try {
	      await caller.distributorPortal.updateFeaturedStyleMaterials({
	        styleId: style.id,
	        aliasName: "Vendor-managed display name",
	        featuredLabel: "Vendor-managed feature",
	        profileNotes: "Vendor-managed profile note",
	      });
	      const [savedStyle] = await db.select({
	        aliasName: doorStyles.aliasName,
	        featuredLabel: doorStyles.featuredLabel,
	        profileNotes: doorStyles.profileNotes,
	      }).from(doorStyles).where(eq(doorStyles.id, style.id)).limit(1);
	      expect(savedStyle).toMatchObject({
	        aliasName: "Vendor-managed display name",
	        featuredLabel: "Vendor-managed feature",
	        profileNotes: "Vendor-managed profile note",
	      });

	      await caller.distributorPortal.updateShippingSettings({
	        warehouseName: "Vendor editing test warehouse",
	        warehouseAddress: "1 Vendor Edit Way",
	        warehouseZips: ["90210"],
	        leadTimeDays: 5,
	        shippingRuleMode: "live",
	        shippingFlatFreightFeeCents: null,
	        shippingFreeFreightThresholdCents: null,
	        shippingZipRates: [],
	        shippingExceptions: "Vendor edit test",
	        pickupEnabled: false,
	        pickupZip: null,
	        pickupAddress: null,
	        pickupRadiusMiles: null,
	      });
	      const shipping = await caller.distributorPortal.shippingOverview();
	      expect(shipping.line).toMatchObject({ warehouseName: "Vendor editing test warehouse", warehouseZips: ["90210"], leadTimeDays: 5 });
	    } finally {
	      await db.update(doorStyles).set(originalStyle).where(eq(doorStyles.id, style.id));
	      await db.update(distributors).set({
	        warehouseName: line.warehouseName,
	        warehouseAddress: line.warehouseAddress,
	        warehouseZips: line.warehouseZips,
	        leadTimeDays: line.leadTimeDays,
	        shippingRuleMode: line.shippingRuleMode,
	        shippingFlatFreightFeeCents: line.shippingFlatFreightFeeCents,
	        shippingFreeFreightThresholdCents: line.shippingFreeFreightThresholdCents,
	        shippingZipRates: line.shippingZipRates,
	        shippingExceptions: line.shippingExceptions,
	        pickupEnabled: line.pickupEnabled,
	        pickupZip: line.pickupZip,
	        pickupAddress: line.pickupAddress,
	        pickupRadiusMiles: line.pickupRadiusMiles,
	      }).where(eq(distributors.id, line.id));
	    }
	  });

	  it("keeps non-cabinet vendor imports separate, draft-first, and complete before publication", async () => {
    const db = await getDb();
    if (!db) return;
    const [line] = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (!line) return;
    const caller = appRouter.createCaller(ctxFor({
      id: 990110, openId: "dp-other-products", name: "Other Products Dist",
      email: "dp-other-products@example.com", role: "distributor", distributorId: line.id,
    }));
    const sku = `OTHER_PRODUCT_${Date.now()}`;
    let productId: number | null = null;
    try {
      const imported = await caller.distributorPortal.importVendorProducts({
        rows: [{ vendorSku: sku, name: "Supplier fixture", category: "Fixtures", yourCost: 21.5 }],
      });
      expect(imported).toMatchObject({ total: 1, created: 1, deleted: 0 });
      const listed = await caller.distributorPortal.vendorProducts({ search: sku });
      const product = listed.items.find((item) => item.vendorSku === sku);
      expect(product).toMatchObject({ name: "Supplier fixture", status: "pending", isPublished: false });
      productId = product?.id ?? null;
      expect(productId).not.toBeNull();

      await expect(caller.distributorPortal.saveVendorProduct({
        id: productId!, vendorSku: sku, name: "Supplier fixture", yourCost: 21.5, mode: "publish",
      })).rejects.toThrow("source description");

      const published = await caller.distributorPortal.saveVendorProduct({
        id: productId!, vendorSku: sku, name: "Supplier fixture", description: "Verified source fixture description",
        category: "Fixtures", yourCost: 21.5, pkgLength: 12, pkgWidth: 8, pkgHeight: 4, pkgWeight: 3,
        mode: "publish",
      });
      expect(published).toMatchObject({ id: productId, status: "approved", isPublished: true });
    } finally {
      if (productId != null) await db.delete(vendorProducts).where(eq(vendorProducts.id, productId));
    }
  });
});
