import {
  mysqlTable,
  int,
  varchar,
  text,
  decimal,
  boolean,
  timestamp,
  mysqlEnum,
  uniqueIndex,
  json,
} from "drizzle-orm/mysql-core";

export const pelicanProducts = mysqlTable("pelican_products", {
  id: int("id").autoincrement().primaryKey(),
  pelicanCode: varchar("pelicanCode", { length: 191 }).notNull().unique(),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  subCategory: varchar("subCategory", { length: 128 }),
  size: varchar("size", { length: 128 }),
  listPrice: decimal("listPrice", { precision: 10, scale: 2 }),
  priceTier2: decimal("priceTier2", { precision: 10, scale: 2 }),
  priceTier3: decimal("priceTier3", { precision: 10, scale: 2 }),
  priceTier4: decimal("priceTier4", { precision: 10, scale: 2 }),
  msrp: decimal("msrp", { precision: 10, scale: 2 }),
  // Optional administrator-set customer retail price. When absent, the
  // category markup remains the pricing fallback.
  retailPrice: decimal("retailPrice", { precision: 10, scale: 2 }),
  tiered: boolean("tiered").default(false).notNull(),
  yourCost: decimal("yourCost", { precision: 10, scale: 2 }),
  vendorWholesale: decimal("vendorWholesale", { precision: 10, scale: 2 }),
  onHandQty: int("onHandQty"),
  leadTimeDays: int("leadTimeDays"),
  inventoryNotes: varchar("inventoryNotes", { length: 512 }),
  discontinued: boolean("discontinued").default(false).notNull(),
  backorder: boolean("backorder").default(false).notNull(),
  minimumOrderQty: int("minimumOrderQty"),
  restockDate: varchar("restockDate", { length: 10 }),
  outOfStock: boolean("outOfStock").default(false).notNull(),
  inventoryUpdatedAt: timestamp("inventoryUpdatedAt"),
  inventorySyncSource: varchar("inventorySyncSource", { length: 16 }),
  importLockedFields: json("importLockedFields").$type<string[]>(),
  markupPercent: decimal("markupPercent", { precision: 6, scale: 4 }),
  isPopular: boolean("isPopular").default(false).notNull(),
  popularRank: int("popularRank").default(0).notNull(),
  imageUrl: varchar("imageUrl", { length: 512 }),
  // Catalog imagery can be a retail thumbnail or a staged room. Only this
  // separately approved material-only source may be mapped onto 3D surfaces.
  materialImageUrl: varchar("materialImageUrl", { length: 512 }),
  // Shopper room-scene photo. Separate from the catalog card (imageUrl) and
  // the Designer swatch (materialImageUrl). Null until a vendor uploads one.
  // Added by hand in docs/sql/0242_pelican_room_scene_image.tidb.sql. That SQL
  // must run before deploy: list and detail queries select every column.
  roomSceneImageUrl: varchar("roomSceneImageUrl", { length: 512 }),
  showInDesigner: boolean("showInDesigner").default(true).notNull(),
  showInCatalog: boolean("showInCatalog").default(true).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  // Sq ft per box/carton — for tile, backsplash, flooring sold by the box.
  // When set, the BOM auto-calculates box qty from room area + overage.
  coverageSqFt: decimal("coverageSqFt", { precision: 8, scale: 2 }),
  // Administrator-entered, supplier/fabricator-verified maximum unsupported
  // countertop overhang for this exact material. Null means not verified.
  unsupportedOverhangLimitIn: decimal("unsupportedOverhangLimitIn", { precision: 6, scale: 3 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PelicanProduct = typeof pelicanProducts.$inferSelect;
export type InsertPelicanProduct = typeof pelicanProducts.$inferInsert;

/**
 * Carrier-ready shipment evidence for one exact Pelican catalog row/SKU.
 *
 * Product dimensions are never repurposed as carton dimensions. The evidence
 * type distinguishes supplier-provided carton facts from a clearly labeled
 * comparison estimate. Both retain a source URL/reference, but only the former
 * can be described as verified Pelican packaging.
 */
export const pelicanShippingProfiles = mysqlTable(
  "pelican_shipping_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    pelicanProductId: int("pelicanProductId").notNull(),
    originName: varchar("originName", { length: 191 }).notNull(),
    originZip: varchar("originZip", { length: 16 }).notNull(),
    transportMode: mysqlEnum("transportMode", ["parcel", "ltl"]).notNull(),
    packageLengthIn: decimal("packageLengthIn", { precision: 8, scale: 2 }).notNull(),
    packageWidthIn: decimal("packageWidthIn", { precision: 8, scale: 2 }).notNull(),
    packageHeightIn: decimal("packageHeightIn", { precision: 8, scale: 2 }).notNull(),
    packageWeightLbs: decimal("packageWeightLbs", { precision: 8, scale: 2 }).notNull(),
    /** Required for LTL profiles; blank for direct parcel profiles. */
    freightClass: varchar("freightClass", { length: 8 }),
    evidenceType: mysqlEnum("evidenceType", ["supplier_verified", "comparable_estimate"])
      .notNull()
      .default("supplier_verified"),
    /** Stable rule identifier when the profile comes from a published comparison rule. */
    comparisonRuleId: varchar("comparisonRuleId", { length: 96 }),
    sourceUrl: varchar("sourceUrl", { length: 512 }).notNull(),
    sourceReference: varchar("sourceReference", { length: 512 }).notNull(),
    verifiedAt: timestamp("verifiedAt").notNull(),
    isEnabled: boolean("isEnabled").default(false).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => ({
    oneProfilePerPelicanSku: uniqueIndex("pelican_shipping_profiles_product_uidx").on(table.pelicanProductId),
  }),
);

export type PelicanShippingProfile = typeof pelicanShippingProfiles.$inferSelect;
export type InsertPelicanShippingProfile = typeof pelicanShippingProfiles.$inferInsert;
