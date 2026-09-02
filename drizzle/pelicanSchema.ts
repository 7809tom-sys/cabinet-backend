import {
  mysqlTable,
  int,
  varchar,
  text,
  decimal,
  boolean,
  timestamp,
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
  tiered: boolean("tiered").default(false).notNull(),
  yourCost: decimal("yourCost", { precision: 10, scale: 2 }),
  markupPercent: decimal("markupPercent", { precision: 6, scale: 4 }),
  isPopular: boolean("isPopular").default(false).notNull(),
  popularRank: int("popularRank").default(0).notNull(),
  imageUrl: varchar("imageUrl", { length: 512 }),
  // Catalog imagery can be a retail thumbnail or a staged room. Only this
  // separately approved material-only source may be mapped onto 3D surfaces.
  materialImageUrl: varchar("materialImageUrl", { length: 512 }),
  showInDesigner: boolean("showInDesigner").default(true).notNull(),
  showInCatalog: boolean("showInCatalog").default(true).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  // Sq ft per box/carton — for tile, backsplash, flooring sold by the box.
  // When set, the BOM auto-calculates box qty from room area + overage.
  coverageSqFt: decimal("coverageSqFt", { precision: 8, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PelicanProduct = typeof pelicanProducts.$inferSelect;
export type InsertPelicanProduct = typeof pelicanProducts.$inferInsert;
