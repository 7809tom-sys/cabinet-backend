import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  datetime,
  varchar,
  decimal,
  boolean,
  json,
  unique,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  // Email/password auth (alongside Manus OAuth). emailLower is the unique login key.
  emailLower: varchar("emailLower", { length: 320 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "distributor", "dealer", "partner", "designer", "sales_rep", "contractor"]).default("user").notNull(),
  distributorId: int("distributorId"), // set for role=distributor: which supply line this user manages
  // Pricing tier the OWNER assigns after seeing the customer on the site (Tawk.to ping).
  // Drives which price column the user sees/checks out at. Default homeowner until changed.
  pricingTier: mysqlEnum("pricingTier", ["homeowner", "contractor", "wholesale"]).default("homeowner").notNull(),
  // Optional credentials captured so the owner can decide a tier (business name etc.)
  companyName: varchar("companyName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Distributors ─────────────────────────────────────────────────────────────

export const distributors = mysqlTable("distributors", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 16 }).notNull().unique(), // UCD, CS, SK
  name: varchar("name", { length: 128 }).notNull(), // neutral label shown when white-labeled (e.g. Line A)
  initials: varchar("initials", { length: 8 }).notNull(), // neutral initials shown when white-labeled (e.g. A)
  brandName: varchar("brandName", { length: 128 }), // real supplier brand, only shown when whiteLabel = false
  brandInitials: varchar("brandInitials", { length: 8 }), // real supplier initials, only shown when whiteLabel = false
  whiteLabel: boolean("whiteLabel").default(true).notNull(), // true = hide supplier identity behind neutral label
  // Presentation model: how this line is shown to members
  displayMode: mysqlEnum("displayMode", ["neutral", "branded", "series"]).default("neutral").notNull(),
  seriesName: varchar("seriesName", { length: 128 }), // e.g. "Cabinet Dealz Elegant Series" when displayMode = series
  markupPercent: decimal("markupPercent", { precision: 6, scale: 4 }).default("0").notNull(), // price uplift applied for premium series, e.g. 0.15 = +15%
  // Effective cost multiplier applied to the distributor's list price to get OUR cost.
  // Kept as the single computed value = baseMultiplier + freightMultiplier so all read
  // paths only need this one field. Edited via the Multipliers tab (base + freight).
  costMultiplier: decimal("costMultiplier", { precision: 5, scale: 4 }).notNull(), // 0.30, 0.38, 0.35
  // Two-part breakdown of the cost multiplier so the freight/tariff portion can change
  // independently (e.g. a distributor lowers their tariff fee). base 0.23 + freight 0.07 = 0.30.
  baseMultiplier: decimal("baseMultiplier", { precision: 5, scale: 4 }).default("0").notNull(),
  freightMultiplier: decimal("freightMultiplier", { precision: 5, scale: 4 }).default("0").notNull(),
  tariffRate: decimal("tariffRate", { precision: 5, scale: 4 }).default("0").notNull(),
  shippingRate: decimal("shippingRate", { precision: 5, scale: 4 }).default("0").notNull(),
  warehouseZips: json("warehouseZips").$type<string[]>(),
  leadTimeDays: int("leadTimeDays").default(7),
  // ─── Fulfillment / order routing ───────────────────────────────────────────
  // Where confirmed purchase orders for this line are SENT. orderEmail is the
  // distributor's order-intake inbox; ccEmails is an optional comma-separated
  // list (affiliate/sales copies). fulfillmentMode selects HOW we deliver the
  // PO: a plain email, an email carrying a NetSuite-ready CSV, or (future) a
  // direct NetSuite API push once the distributor provisions credentials.
  orderEmail: varchar("orderEmail", { length: 320 }),
  ccEmails: varchar("ccEmails", { length: 1024 }),
  fulfillmentMode: mysqlEnum("fulfillmentMode", ["email", "netsuite_email", "netsuite_api"]).default("email").notNull(),
  // Opt-in NetSuite direct-API config (only used when fulfillmentMode = netsuite_api).
  // Left null until the distributor shares credentials; API push is stubbed for now.
  netsuiteAccountId: varchar("netsuiteAccountId", { length: 64 }),
  // ─── Local pickup ───────────────────────────────────────────────────────────
  // When enabled, a customer whose delivery ZIP is within pickupRadiusMiles of
  // this line's pickup warehouse is offered free local pickup instead of freight.
  pickupEnabled: boolean("pickupEnabled").default(false).notNull(),
  pickupZip: varchar("pickupZip", { length: 16 }), // origin for the pickup distance test; falls back to first warehouseZip
  pickupAddress: varchar("pickupAddress", { length: 512 }), // human-readable pickup location shown to the customer
  pickupRadiusMiles: int("pickupRadiusMiles").default(100).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  // Vendor portal: up to 8 SKU IDs the vendor picks to feature in the design tool
  designToolPicks: json("designToolPicks").$type<number[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Distributor = typeof distributors.$inferSelect;

// ─── Door Styles ──────────────────────────────────────────────────────────────

export const doorStyles = mysqlTable("door_styles", {
  id: int("id").autoincrement().primaryKey(),
  distributorId: int("distributorId").notNull(),
  styleCode: varchar("styleCode", { length: 32 }).notNull(), // ASP, SW, GR
  ourName: varchar("ourName", { length: 128 }).notNull(), // internal name (e.g. Lumina Blanc)
  aliasName: varchar("aliasName", { length: 128 }), // white-label public display name (e.g. Lumina White); shown everywhere customers see the style
  distributorName: varchar("distributorName", { length: 128 }).notNull(), // Aspen White (distributor's own name)
  doorStyle: varchar("doorStyle", { length: 64 }), // Raised Panel, Shaker, Slab
  woodSpecies: varchar("woodSpecies", { length: 64 }),
  finish: varchar("finish", { length: 128 }),
  color: varchar("color", { length: 64 }),
  boxConstruction: varchar("boxConstruction", { length: 128 }),
  drawerConstruction: varchar("drawerConstruction", { length: 128 }),
  hardware: varchar("hardware", { length: 128 }),
  frameSize: varchar("frameSize", { length: 32 }),
  overlayType: varchar("overlayType", { length: 64 }),
  doorPanelType: varchar("doorPanelType", { length: 64 }),
  warehouseZip: varchar("warehouseZip", { length: 16 }),
  shippingRate: decimal("shippingRate", { precision: 5, scale: 4 }),
  doorSampleImageUrl: varchar("doorSampleImageUrl", { length: 512 }),
  // Separate photo of just the drawer front (no door below). Used by the
  // elevation renderer to show the correct texture on drawer bands.
  drawerSampleImageUrl: varchar("drawerSampleImageUrl", { length: 512 }),
  // True once an admin (or an approved field correction) has verified the
  // sample photo is the correct door for this style. Drives the green check.
  doorSampleVerified: boolean("doorSampleVerified").default(false).notNull(),
  roomSceneImageUrl: varchar("roomSceneImageUrl", { length: 512 }),
  thumbnailImageUrl: varchar("thumbnailImageUrl", { length: 512 }),
  // Admin merchandising (80/20): which styles get pushed in the Featured row.
  // featuredRank orders them (lower = first); UI enforces a max of 30 featured.
  // featuredLabel: optional white-label display name shown publicly instead of ourName.
  // Leave null to fall back to ourName.
  isFeatured: boolean("isFeatured").default(false).notNull(),
  featuredRank: int("featuredRank").default(0).notNull(),
  featuredLabel: varchar("featuredLabel", { length: 128 }),
  // Frame profile measurements — help designers understand the visual weight of the door style.
  // All widths stored as fractional inches (e.g. 0.5 = 1/2", 3.0 = 3").
  railWidth: decimal("railWidth", { precision: 4, scale: 2 }),           // top/bottom rail width in inches
  stileWidth: decimal("stileWidth", { precision: 4, scale: 2 }),         // left/right stile width in inches
  centerRailWidth: decimal("centerRailWidth", { precision: 4, scale: 2 }), // center/mid rail (if any)
  profileNotes: varchar("profileNotes", { length: 256 }),                // free-text e.g. "Ogee profile", "Beaded inner edge"
  profileDescription: text("profileDescription"),                        // long-form educational description shown on public Door Styles page
  // Corner swatch: angled close-up photo of the door corner showing profile, grain, and color.
  // Used in Featured Door Styles section and as texture reference in the 2D designer.
  cornerSwatchImageUrl: varchar("cornerSwatchImageUrl", { length: 512 }),
  // Builder Grade line (Skyline Builder / Spring Forest "Floral" finishes):
  // ships STANDARD hardware (not soft-close) and is a lower-spec value line.
  // Drives a UI badge + hardware note so it is clearly distinguished from premium lines.
  isBuilderGrade: boolean("isBuilderGrade").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DoorStyle = typeof doorStyles.$inferSelect;

// ─── Cabinet Items (GENERIC_INFO) ─────────────────────────────────────────────

export const cabinets = mysqlTable("cabinets", {
  id: int("id").autoincrement().primaryKey(),
  masterCode: varchar("masterCode", { length: 64 }).notNull().unique(), // DB-24-3, B-24, etc.
  description: text("description").notNull(),
  descriptionSource: varchar("descriptionSource", { length: 64 }), // US Cabinet Depot, Clark & Son, Research
  category: varchar("category", { length: 64 }).notNull(), // Base, Wall, Tall, ADA, Vanity, Accessory
  subCategory: varchar("subCategory", { length: 128 }), // Drawer Base, Sink Base, etc.
  width: decimal("width", { precision: 6, scale: 2 }),
  height: decimal("height", { precision: 6, scale: 2 }),
  depth: decimal("depth", { precision: 6, scale: 2 }),
  physicalWidth: decimal("physicalWidth", { precision: 6, scale: 2 }),
  weight: decimal("weight", { precision: 8, scale: 2 }),
  // 2D/3D Design fields
  placementType: varchar("placementType", { length: 32 }), // base, wall, tall, island
  numberOfDoors: int("numberOfDoors").default(0),
  numberOfDrawers: int("numberOfDrawers").default(0),
  // Appliance opening inside the cabinet (e.g. oven cutout). Null = no opening.
  // Values: 'top' | 'middle' | 'bottom' — position of the opening relative to the cabinet height.
  openingType: varchar("openingType", { length: 16 }),
  // Height of each door panel in inches (used with openingType to calculate opening size)
  doorHeight: decimal("doorHeight", { precision: 5, scale: 2 }),
  drawerHeight: decimal("drawerHeight", { precision: 5, scale: 2 }),
  numberOfFixedShelves: int("numberOfFixedShelves"),
  numberOfAdjShelves: int("numberOfAdjShelves"),
  isNotCabinet: boolean("isNotCabinet").default(false),
  hingeSide: varchar("hingeSide", { length: 16 }), // left, right, both, none
  doorSwingClearance: decimal("doorSwingClearance", { precision: 5, scale: 2 }),
  toeKickHeight: decimal("toeKickHeight", { precision: 5, scale: 2 }),
  stackingAllowed: boolean("stackingAllowed").default(false),
  isCornerCabinet: boolean("isCornerCabinet").default(false),
  cornerSide: varchar("cornerSide", { length: 16 }), // left, right
  // Corner cabinet type: lazy-susan | blind-corner | diagonal | pie-cut | l-shape | null (standard)
  cornerType: varchar("corner_type", { length: 50 }),
  fillerRequired: boolean("fillerRequired").default(false),
  // Blind corner specific
  openingWidth: decimal("openingWidth", { precision: 5, scale: 2 }),
  minPull: decimal("minPull", { precision: 5, scale: 2 }),
  maxPull: decimal("maxPull", { precision: 5, scale: 2 }),
  // Lazy Susan specific
  shelfRadius: decimal("shelf_radius", { precision: 5, scale: 2 }),     // radius of rotating shelves in inches
  shelfCount: int("shelf_count"),                                         // number of rotating shelves (typically 2)
  // Corner cabinet shared (Lazy Susan + Diagonal)
  cabinetSquare: decimal("cabinet_square", { precision: 5, scale: 2 }), // overall square footprint in inches
  // Diagonal corner specific
  faceWidth: decimal("face_width", { precision: 5, scale: 2 }),           // width of the angled face in inches
  legWidth: decimal("leg_width", { precision: 5, scale: 2 }),             // depth of each leg in inches
  // 2D graphic
  graphicType: varchar("graphicType", { length: 64 }), // base_1door, wall_2door, etc.
  // Generic tab aliases — alternative codes this cabinet is known by across distributors
  sku: varchar("sku", { length: 128 }),         // Primary SKU (col B in Generic tab)
  vendorSku: varchar("vendorSku", { length: 128 }), // Vendor SKU (col C)
  altSku1: varchar("altSku1", { length: 128 }), // Alt SKU 1 (col D)
  altSku2: varchar("altSku2", { length: 128 }), // Alt SKU 2 (col E)
  altSku3: varchar("altSku3", { length: 128 }), // Alt SKU 3 (col F)
  // Finish & construction
  stainColor: varchar("stainColor", { length: 128 }), // Sherwin-Williams stain color name
  constructionMethod: varchar("constructionMethod", { length: 256 }), // e.g. "Framed, plywood box, dovetail drawer"
  // Catalog line-art image (20/20 catalog renders, keyed by code). Falls back to code-drawn SVG.
  catalogImageUrl: varchar("catalogImageUrl", { length: 512 }),
  roomSceneUrl: varchar("roomSceneUrl", { length: 512 }),
  // Packaging
  pkgLength: decimal("pkgLength", { precision: 6, scale: 2 }),
  pkgWidth: decimal("pkgWidth", { precision: 6, scale: 2 }),
  pkgHeight: decimal("pkgHeight", { precision: 6, scale: 2 }),
  pkgWeight: decimal("pkgWeight", { precision: 8, scale: 2 }), // packaged/shipping weight in lbs
  isActive: boolean("isActive").default(true).notNull(),
  // Conflict / Needs-Review status. When 'conflict', the product is held in the
  // admin back office only and hidden from the public catalog, storefront and
  // the Design Tool palette until an admin reviews and clears it. Used for
  // products whose identity/spec we are unsure about (e.g. skin/panel SKUs).
  conflictStatus: varchar("conflictStatus", { length: 16 }).default("none").notNull(), // none | conflict
  conflictReason: text("conflictReason"),
  conflictedAt: timestamp("conflictedAt"),
  // Price Audit: set true once the owner has checked this item's prices against
  // the master price list and confirmed they are correct. Drives the audited
  // badge in the Cost Lookup / Price Audit tool.
  priceVerified: boolean("priceVerified").default(false).notNull(),
  priceVerifiedAt: timestamp("priceVerifiedAt"),
  priceVerifiedByName: varchar("priceVerifiedByName", { length: 128 }),
  // Visibility toggles — admins control where each cabinet appears.
  // showInCatalog: visible on the public storefront catalog (default true).
  // showInDesigner: appears in the Kitchen Designer palette (default true).
  // showIn2020: included in 2020 Design export files (default true).
  showInCatalog: boolean("showInCatalog").default(true).notNull(),
  showInDesigner: boolean("showInDesigner").default(true).notNull(),
  showIn2020: boolean("showIn2020").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  configuredAt: timestamp("configuredAt"),
  // Admin review: mark a cabinet as fully verified (all fields checked)
  configVerified: boolean("configVerified").default(false).notNull(),
  configVerifiedAt: timestamp("configVerifiedAt"),
  configVerifiedByName: varchar("configVerifiedByName", { length: 128 }),
  // Door orientation for multi-door cabinets: side-by-side (horizontal) or stacked (vertical)
  doorOrientation: varchar("doorOrientation", { length: 16 }), // side-by-side | stacked | null
  // Drawer layout JSON: array of rows [{count: number, height?: number}]
  // Each row defines how many drawers are side-by-side; height is optional (equal split if omitted)
  drawerLayout: text("drawerLayout"), // JSON string, e.g. [{"count":2},{"count":1,"height":8}]
  // Panel grain direction: vertical (up/down) or horizontal (left/right)
  grainDirection: varchar("grainDirection", { length: 16 }), // vertical | horizontal | null
  // Whether this panel uses the door style image (decorative door panel vs flat plywood)
  isDecorativeDoor: boolean("isDecorativeDoor").default(false),
});

export type Cabinet = typeof cabinets.$inferSelect;

// ─── Distributor SKU Mapping ───────────────────────────────────────────────────

export const distributorSkus = mysqlTable("distributor_skus", {
  id: int("id").autoincrement().primaryKey(),
  cabinetId: int("cabinetId").notNull(),
  distributorId: int("distributorId").notNull(),
  styleId: int("styleId").notNull(),
  platformSku: varchar("platformSku", { length: 128 }).notNull().unique(), // DB24-SW-UCD
  distributorSku: varchar("distributorSku", { length: 128 }).notNull(), // 3DB24
  listPrice: decimal("listPrice", { precision: 10, scale: 2 }),
  yourCost: decimal("yourCost", { precision: 10, scale: 2 }),
  adjustedListPrice: decimal("adjustedListPrice", { precision: 10, scale: 2 }),
  wholesalePrice: decimal("wholesalePrice", { precision: 10, scale: 2 }),
  contractorPrice: decimal("contractorPrice", { precision: 10, scale: 2 }),
  homeownerPrice: decimal("homeownerPrice", { precision: 10, scale: 2 }),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  isPublished: boolean("isPublished").default(true).notNull(), // distributor visibility toggle
  // SKU-level image (per cabinet + door style). Falls back to door-style image, then drawing.
  imageUrl: varchar("imageUrl", { length: 512 }),
  // Vendor portal: new product submission status (existing products default to 'approved')
  status: mysqlEnum("status", ["approved", "pending", "rejected"]).default("approved").notNull(),
  // PO-only fields (internal; never shown to customers)
  supplierCabinetName: varchar("supplierCabinetName", { length: 255 }), // distributor's own cabinet name on the PO
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DistributorSku = typeof distributorSkus.$inferSelect;

// ─── Pantry Bundles ───────────────────────────────────────────────────────────

export const pantryBundles = mysqlTable("pantry_bundles", {
  id: int("id").autoincrement().primaryKey(),
  platformSku: varchar("platformSku", { length: 128 }).notNull().unique(),
  distributorId: int("distributorId").notNull(),
  styleId: int("styleId").notNull(),
  width: int("width").notNull(),
  totalHeight: int("totalHeight").notNull(),
  bottomSku: varchar("bottomSku", { length: 64 }).notNull(),
  topSku: varchar("topSku", { length: 64 }).notNull(),
  bottomListPrice: decimal("bottomListPrice", { precision: 10, scale: 2 }),
  topListPrice: decimal("topListPrice", { precision: 10, scale: 2 }),
  combinedListPrice: decimal("combinedListPrice", { precision: 10, scale: 2 }),
  adjustedListPrice: decimal("adjustedListPrice", { precision: 10, scale: 2 }),
  wholesalePrice: decimal("wholesalePrice", { precision: 10, scale: 2 }),
  contractorPrice: decimal("contractorPrice", { precision: 10, scale: 2 }),
  homeownerPrice: decimal("homeownerPrice", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Cart & Orders ────────────────────────────────────────────────────────────

export const carts = mysqlTable("carts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  sessionId: varchar("sessionId", { length: 128 }),
  selectedStyleId: int("selectedStyleId"),
  selectedDistributorId: int("selectedDistributorId"),
  pricingTier: mysqlEnum("pricingTier", ["Wholesale", "Contractor", "Homeowner"]).default("Homeowner").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const cartItems = mysqlTable("cart_items", {
  id: int("id").autoincrement().primaryKey(),
  cartId: int("cartId").notNull(),
  cabinetId: int("cabinetId").notNull(),
  platformSku: varchar("platformSku", { length: 128 }),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  orderNumber: varchar("orderNumber", { length: 64 }).notNull().unique(),
  distributorId: int("distributorId"),
  styleId: int("styleId"),
  pricingTier: mysqlEnum("pricingTier", ["Wholesale", "Contractor", "Homeowner"]).notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]).default("pending").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }),
  shippingCost: decimal("shippingCost", { precision: 10, scale: 2 }),
  total: decimal("total", { precision: 12, scale: 2 }),
  notes: text("notes"),
  sourceType: mysqlEnum("sourceType", ["manual", "csv_upload", "ocr_upload", "design_tool"]).default("manual"),
  // Stripe payment fields
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "failed", "refunded"]).default("pending"),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  cabinetId: int("cabinetId"),
  platformSku: varchar("platformSku", { length: 128 }),
  distributorSku: varchar("distributorSku", { length: 128 }),
  description: text("description"),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }),
  lineTotal: decimal("lineTotal", { precision: 10, scale: 2 }),
});

// ─── Kitchen Designs ──────────────────────────────────────────────────────────

export const kitchenDesigns = mysqlTable("kitchen_designs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  name: varchar("name", { length: 256 }).notNull(),
  // Master Project grouping: several rooms (kitchen + baths + laundry) can share
  // one projectName, becoming a single job. roomLabel names the room within the
  // project ("Master Bath"), roomType drives its designer palette.
  projectName: varchar("projectName", { length: 256 }),
  roomLabel: varchar("roomLabel", { length: 256 }),
  roomType: varchar("roomType", { length: 32 }),
  roomData: json("roomData").$type<object>(), // walls, dimensions
  placedCabinets: json("placedCabinets").$type<object[]>(), // [{cabinetId, x, y, rotation, styleId}]
  // Pelican surface & fixture picks (flooring, backsplash, countertop, sink,
  // faucet) chosen in the Surfaces palette tab. Persisted so a reloaded design
  // restores its exact surfaces (cart + 3D gate + 2D render fill).
  selectedSurfaces: json("selectedSurfaces").$type<object[]>(),
  selectedStyleId: int("selectedStyleId"),
  selectedDistributorId: int("selectedDistributorId"),
  thumbnailUrl: varchar("thumbnailUrl", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Subscribers / Dealer Storefronts ─────────────────────────────────────────

export const subscribers = mysqlTable("subscribers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  businessName: varchar("businessName", { length: 256 }).notNull(),
  subdomain: varchar("subdomain", { length: 64 }).unique(),
  logoUrl: varchar("logoUrl", { length: 512 }),
  primaryColor: varchar("primaryColor", { length: 16 }),
  subscriptionTier: mysqlEnum("subscriptionTier", ["basic", "professional", "enterprise"]).default("basic").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Countertop Quote Requests ─────────────────────────────────────────────────
// Countertops aren't auto-priced; a contractor submits the design + measurements
// and the team (or a supplier) quotes it back. Stored here with a status.

export const countertopQuotes = mysqlTable("countertop_quotes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // null for anonymous/email-only requests
  contactName: varchar("contactName", { length: 256 }),
  contactEmail: varchar("contactEmail", { length: 320 }).notNull(),
  contactPhone: varchar("contactPhone", { length: 32 }),
  zip: varchar("zip", { length: 16 }),
  material: varchar("material", { length: 128 }), // requested material, e.g. Quartz, Granite, Laminate
  squareFeet: decimal("squareFeet", { precision: 8, scale: 2 }).notNull(),
  linearFeet: decimal("linearFeet", { precision: 8, scale: 2 }).notNull(),
  hasIsland: boolean("hasIsland").default(false).notNull(),
  roomData: json("roomData").$type<object>(), // room dimensions snapshot
  placedCabinets: json("placedCabinets").$type<object[]>(), // layout snapshot
  notes: text("notes"),
  status: mysqlEnum("status", ["new", "quoted", "won", "lost"]).default("new").notNull(),
  quotedPrice: decimal("quotedPrice", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CountertopQuote = typeof countertopQuotes.$inferSelect;
export type InsertCountertopQuote = typeof countertopQuotes.$inferInsert;

// ─── Pro Network (installers + countertop fabricators) ─────────────────────────
// Platform-wide network shared by ALL affiliate stores. Pros apply publicly,
// the platform admin approves/rejects, and approved pros are matched to leads
// (e.g. countertop quote requests) by trade + service area. The platform tracks
// a management fee on routed jobs.

export const proApplications = mysqlTable("pro_applications", {
  id: int("id").autoincrement().primaryKey(),
  // Company / contact
  companyName: varchar("companyName", { length: 256 }).notNull(),
  contactName: varchar("contactName", { length: 256 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  website: varchar("website", { length: 512 }),
  // Trades offered: e.g. ["installation", "countertop_fabrication"]
  trades: json("trades").$type<string[]>().notNull(),
  // Materials handled (mostly for fabricators): ["Quartz","Granite","Laminate",...]
  materials: json("materials").$type<string[]>(),
  // Service area
  serviceZips: json("serviceZips").$type<string[]>(), // explicit ZIPs covered
  baseZip: varchar("baseZip", { length: 16 }), // home base ZIP
  serviceRadiusMiles: int("serviceRadiusMiles").default(50),
  // Credentials
  licenseNumber: varchar("licenseNumber", { length: 128 }),
  insured: boolean("insured").default(false).notNull(),
  yearsInBusiness: int("yearsInBusiness"),
  leadTimeDays: int("leadTimeDays"),
  notes: text("notes"),
  // Review workflow
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"), // user id of admin reviewer
  reviewedAt: timestamp("reviewedAt"),
  reviewNotes: text("reviewNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProApplication = typeof proApplications.$inferSelect;
export type InsertProApplication = typeof proApplications.$inferInsert;

// ─── Vendor Applications ────────────────────────────────────────
// Inbound applications from cabinet manufacturers / suppliers who want to become
// a vendor partner on Cabinet Dealz. Submitted from the public "Become a Vendor"
// page; reviewed by an admin in the back office.

export const vendorApplications = mysqlTable("vendor_applications", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("companyName", { length: 256 }).notNull(),
  contactName: varchar("contactName", { length: 256 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  website: varchar("website", { length: 512 }),
  // Where they are based / ship from
  headquarters: varchar("headquarters", { length: 256 }),
  // Comma-separated product categories the vendor supplies across the whole
  // home-remodel experience (Cabinets, Hardware, Countertops, Appliances,
  // Flooring, Lighting, Plumbing/Fixtures, Tile/Backsplash, Decor, Other).
  categories: varchar("categories", { length: 512 }),
  // Rough scale of their catalog so we can prioritize onboarding
  productLines: varchar("productLines", { length: 512 }), // e.g. "Shaker, Slab, Raised Panel"
  doorStyleCount: int("doorStyleCount"), // approx number of door styles they offer
  // Whether they can provide product imagery / specs
  hasCatalogImages: boolean("hasCatalogImages").default(false).notNull(),
  offersTradePricing: boolean("offersTradePricing").default(false).notNull(),
  leadTimeDays: int("leadTimeDays"),
  message: text("message"), // free-form note from the applicant
  // Review workflow (mirrors pro_applications)
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  reviewNotes: text("reviewNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VendorApplication = typeof vendorApplications.$inferSelect;
export type InsertVendorApplication = typeof vendorApplications.$inferInsert;

// ─── Trade Order Requests ──────────────────────────────────────────────────────
// Trade-only order requests (NOT a consumer checkout). Built from OCR photo
// extraction, CSV bulk import, the design tool export, or manual entry. The
// originator reviews + submits; the confirmed request is recorded here. Email-
// to-distributor (with affiliate copies) is deferred until distributor email is
// wired — for now we just persist the confirmed request.

export type OrderLineItem = {
  cabinetId: number | null; // null = unmatched/free-text line
  masterCode: string; // matched master code or the raw extracted code
  rawCode?: string; // original code as extracted/imported (pre-normalization)
  description: string;
  qty: number;
  unitPrice: number | null; // null when not priced (unmatched / no style)
  linePrice: number | null;
  doorStyle?: string | null; // chosen door-style name for this line
  styleId?: number | null;
  tier?: "Wholesale" | "Contractor" | null;
  matched: boolean;
};

export const orderRequests = mysqlTable("order_requests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // null for guest/email-only originators
  requestNumber: varchar("requestNumber", { length: 64 }).notNull().unique(),
  originatorName: varchar("originatorName", { length: 256 }),
  originatorEmail: varchar("originatorEmail", { length: 320 }),
  originatorPhone: varchar("originatorPhone", { length: 32 }),
  zip: varchar("zip", { length: 16 }), // for future location-based availability
  source: mysqlEnum("source", ["ocr", "csv", "design", "manual", "barcode"]).default("manual").notNull(),
  status: mysqlEnum("status", ["draft", "submitted", "confirmed", "cancelled"]).default("draft").notNull(),
  styleId: int("styleId"), // default door style applied across lines
  styleName: varchar("styleName", { length: 128 }),
  tier: mysqlEnum("tier", ["Wholesale", "Contractor"]).default("Contractor").notNull(),
  // Affiliate attribution: which affiliate referred this order (if any)
  affiliateId: int("affiliateId"),
  referralCode: varchar("referralCode", { length: 32 }),
  lineItems: json("lineItems").$type<OrderLineItem[]>().notNull(),
  itemCount: int("itemCount").default(0).notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  // Fulfillment: how the customer wants the order delivered. "pickup" is only
  // offered when a distributor near the delivery ZIP has pickup enabled.
  deliveryMethod: mysqlEnum("deliveryMethod", ["ship", "pickup"]).default("ship").notNull(),
  // When pickup is chosen, which distributor's pickup location was selected.
  pickupDistributorId: int("pickupDistributorId"),
  // Sales tax: 2-letter state code, rate (decimal), and computed tax amount.
  // taxAmount is stored so historical orders reflect the rate at time of order.
  taxState: varchar("taxState", { length: 2 }),
  taxRate: decimal("taxRate", { precision: 7, scale: 6 }),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }),
  // Which distributor line the confirmed PO is routed to (resolved from lines).
  distributorId: int("distributorId"),
  // Audit of the send-to-distributor action: when it was sent + to whom.
  sentToDistributorAt: timestamp("sentToDistributorAt"),
  sentToDistributorEmail: varchar("sentToDistributorEmail", { length: 1024 }),
  confirmedAt: timestamp("confirmedAt"),
  // QuickBooks Online sync: invoice ID returned by QBO after push.
  qboInvoiceId: varchar("qboInvoiceId", { length: 64 }),
  qboSyncedAt: timestamp("qboSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OrderRequest = typeof orderRequests.$inferSelect;
export type InsertOrderRequest = typeof orderRequests.$inferInsert;

// ─── Affiliates / Partner stores ───────────────────────────────────────────────
// Trade partners (cabinet/remodel stores) who refer orders to Cabinet Dealz. Each
// affiliate gets a unique referralCode + link and a branded public storefront at
// /store/:slug that mirrors the full platform experience (catalog, door styles,
// packages, design tool, build-an-order) wrapped in their branding and auto-tagged
// with their referral code. Orders carrying that code are attributed to the
// affiliate, who earns a commission on confirmed totals. An affiliate is optionally
// linked to a partner-role user account (by email) so the partner can sign in and
// manage their store + see their dashboard.

export const affiliates = mysqlTable("affiliates", {
  id: int("id").autoincrement().primaryKey(),
  // Identity
  storeName: varchar("storeName", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(), // storefront path, e.g. "firstclass"
  contactName: varchar("contactName", { length: 256 }),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  website: varchar("website", { length: 512 }),
  location: varchar("location", { length: 256 }), // city/state, e.g. "Osprey, FL"
  // Referral + commission
  referralCode: varchar("referralCode", { length: 32 }).notNull().unique(), // e.g. FIRSTCLASS
  commissionRate: decimal("commissionRate", { precision: 5, scale: 4 }).default("0.05").notNull(), // 0.05 = 5%
  status: mysqlEnum("status", ["active", "paused", "inactive"]).default("active").notNull(),
  userId: int("userId"), // linked partner-role user account (nullable until they sign in)
  // Storefront branding
  logoUrl: varchar("logoUrl", { length: 512 }),
  primaryColor: varchar("primaryColor", { length: 16 }), // hex, e.g. "#0f2a4a"
  accentColor: varchar("accentColor", { length: 16 }), // hex, e.g. "#c79a4b"
  heroImageUrl: varchar("heroImageUrl", { length: 512 }),
  tagline: varchar("tagline", { length: 256 }), // hero subheading
  taglineEs: varchar("taglineEs", { length: 256 }), // optional Spanish hero subheading
  aboutText: text("aboutText"), // "about this store" blurb on storefront
  aboutTextEs: text("aboutTextEs"), // optional Spanish "about this store" blurb
  serviceArea: varchar("serviceArea", { length: 256 }), // e.g. "Sarasota County & surrounding"
  yearsInBusiness: int("yearsInBusiness"),
  facebookUrl: varchar("facebookUrl", { length: 512 }),
  instagramUrl: varchar("instagramUrl", { length: 512 }),
  storefrontEnabled: boolean("storefrontEnabled").default(true).notNull(),
  // Storefront layout template variant
  template: mysqlEnum("template", ["classic", "showcase", "minimal", "craftsman"]).default("classic").notNull(),
  // White-label markup: default % (bps) this affiliate adds on top of their
  // affiliate cost to produce the customer-facing retail price. Per-style and
  // per-category overrides live in affiliateStyleBranding / as JSON below.
  defaultMarkupBps: int("defaultMarkupBps").default(2000).notNull(), // 20% default
  // Optional per-category markup overrides, JSON: { "base": 2500, "wall": 1500 }
  categoryMarkupJson: text("categoryMarkupJson"),
  // Annual membership: an affiliate pays a yearly fee ($1,195) to participate.
  // membershipStatus drives storefront/CRM access; the dated fields track the
  // current paid term. Detailed invoices live in affiliate_invoices.
  membershipStatus: mysqlEnum("membershipStatus", ["pending", "active", "past_due", "cancelled"]).default("pending").notNull(),
  membershipFeeCents: int("membershipFeeCents").default(119500).notNull(), // $1,195.00
  membershipPaidAt: timestamp("membershipPaidAt"),
  membershipExpiresAt: timestamp("membershipExpiresAt"),
  notes: text("notes"),
  // ─── W-9 / Tax compliance ─────────────────────────────────────────────────────
  // Affiliates must submit legal info + government ID before payouts are released.
  // w9Status: pending = not started, submitted = affiliate filled it out (awaiting admin review),
  //           verified = admin confirmed the info is valid.
  w9Status: mysqlEnum("w9Status", ["pending", "submitted", "verified"]).default("pending").notNull(),
  w9LegalName: varchar("w9LegalName", { length: 256 }),        // Legal name on tax return
  w9BusinessName: varchar("w9BusinessName", { length: 256 }),  // DBA / business name (if different)
  w9EntityType: mysqlEnum("w9EntityType", ["individual", "sole_proprietor", "llc_single", "llc_partnership", "llc_corp", "c_corp", "s_corp", "partnership", "trust", "other"]),
  w9TaxId: varchar("w9TaxId", { length: 64 }),                 // SSN or EIN (stored encrypted in practice)
  w9TaxIdType: mysqlEnum("w9TaxIdType", ["ssn", "ein"]),
  w9Address: varchar("w9Address", { length: 256 }),
  w9City: varchar("w9City", { length: 128 }),
  w9State: varchar("w9State", { length: 2 }),
  w9Zip: varchar("w9Zip", { length: 16 }),
  w9IdDocumentUrl: varchar("w9IdDocumentUrl", { length: 512 }), // S3 URL of uploaded government ID
  w9SubmittedAt: timestamp("w9SubmittedAt"),
  w9VerifiedAt: timestamp("w9VerifiedAt"),
  w9AdminNotes: text("w9AdminNotes"),                          // Admin-only notes on verification
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Affiliate = typeof affiliates.$inferSelect;
export type InsertAffiliate = typeof affiliates.$inferInsert;

// ─── Affiliate white-label per-door-style overrides ────────────────────────────
// One row per (affiliate, door style) the affiliate has customized. brandName
// renames the style on their storefront; markupBps (nullable) overrides their
// default markup for that style. Absence of a row = central name + default markup.
export const affiliateStyleBranding = mysqlTable("affiliate_style_branding", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId").notNull(),
  styleId: int("styleId").notNull(),
  brandName: varchar("brandName", { length: 256 }),
  markupBps: int("markupBps"), // null = use affiliate default / category
  // Catalog curation: affiliate can feature specific styles and upload their own room scene photo
  featured: boolean("featured").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  roomSceneUrl: text("roomSceneUrl"), // affiliate's own room scene photo for this style
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AffiliateStyleBranding = typeof affiliateStyleBranding.$inferSelect;
export type InsertAffiliateStyleBranding = typeof affiliateStyleBranding.$inferInsert;

// ─── CRM: Sales pipeline (admin) + affiliate pipeline ──────────────────────────
// A lightweight task-board / pipeline over leads & deals. A deal with
// affiliateId = NULL is a "house" deal owned by the Cabinet Dealz sales team
// (admin CRM board). A deal with a non-null affiliateId belongs to that
// affiliate's own pipeline (affiliate CRM board inside their dashboard).
// Deals can optionally reference an existing order request, pro application, or
// affiliate-store lead so the pipeline ties back to real platform activity.

export const crmDeals = mysqlTable("crm_deals", {
  id: int("id").autoincrement().primaryKey(),
  // Ownership / scope
  affiliateId: int("affiliateId"), // NULL = house/admin deal; else the owning affiliate
  ownerUserId: int("ownerUserId"), // assigned salesperson / partner user (nullable)
  // Pipeline
  title: varchar("title", { length: 256 }).notNull(), // e.g. "Kitchen remodel — J. Rivera"
  stage: mysqlEnum("stage", [
    "new",
    "contacted",
    "qualified",
    "quoted",
    "won",
    "lost",
  ]).default("new").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
  // Contact
  contactName: varchar("contactName", { length: 256 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  company: varchar("company", { length: 256 }),
  location: varchar("location", { length: 256 }),
  language: mysqlEnum("language", ["en", "es"]).default("en").notNull(), // bilingual sales support
  // Value + forecasting
  estimatedValue: decimal("estimatedValue", { precision: 12, scale: 2 }),
  // Source linkage (any may be null)
  source: mysqlEnum("source", [
    "manual",
    "order_request",
    "pro_application",
    "storefront",
    "referral",
  ]).default("manual").notNull(),
  orderRequestId: int("orderRequestId"),
  proApplicationId: int("proApplicationId"),
  referralCode: varchar("referralCode", { length: 32 }),
  // Follow-up
  nextFollowUpAt: timestamp("nextFollowUpAt"),
  notes: text("notes"),
  // Sort order within a stage column (for manual drag ordering)
  boardOrder: int("boardOrder").default(0).notNull(),
  closedAt: timestamp("closedAt"), // set when stage becomes won/lost
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CrmDeal = typeof crmDeals.$inferSelect;
export type InsertCrmDeal = typeof crmDeals.$inferInsert;

export const crmActivities = mysqlTable("crm_activities", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  authorUserId: int("authorUserId"), // who logged it
  kind: mysqlEnum("kind", ["note", "call", "email", "meeting", "stage_change", "task"]).default("note").notNull(),
  body: text("body").notNull(),
  // Optional task fields (when kind = "task")
  dueAt: timestamp("dueAt"),
  done: boolean("done").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CrmActivity = typeof crmActivities.$inferSelect;
export type InsertCrmActivity = typeof crmActivities.$inferInsert;

// ─── CRM ↔ Saved Design links ──────────────────────────────────────────────────
// A deal may have one or more saved kitchen designs attached. We snapshot the
// design name at link time so the deal still shows a sensible label even if the
// design is later renamed or removed.
export const crmDealDesigns = mysqlTable("crm_deal_designs", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  designId: int("designId").notNull(),
  designName: varchar("designName", { length: 256 }).notNull(),
  linkedByUserId: int("linkedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CrmDealDesign = typeof crmDealDesigns.$inferSelect;
export type InsertCrmDealDesign = typeof crmDealDesigns.$inferInsert;

// ─── CRM: sent-email log ────────────────────────────────────────────────────────
// One row per email sent from a deal card via the site's saved SMTP. Provides a
// durable "sent history" independent of the activity timeline, capturing exactly
// what went out (to/subject/body), who sent it, and the from-address used.
export const crmEmailLog = mysqlTable("crm_email_log", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  toEmail: varchar("toEmail", { length: 320 }).notNull(),
  fromEmail: varchar("fromEmail", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 512 }).notNull(),
  body: text("body").notNull(),
  sentByUserId: int("sentByUserId"),
  sentByName: varchar("sentByName", { length: 256 }),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
});

export type CrmEmailLog = typeof crmEmailLog.$inferSelect;
export type InsertCrmEmailLog = typeof crmEmailLog.$inferInsert;

// ─── Build-an-Order code aliases ───────────────────────────────────────────────
// Remembers a human's manual "Fix"/swap choice so an unrecognized order code
// resolves automatically next time. Keyed by the CANONICALIZED raw code (uppercase
// alphanumerics only) so spacing/dash/case variants of the same token collapse to
// one entry. The mapping always points at a real cabinet.
//
// Two-tier alias system:
//   userId = NULL  → global alias (set by admin via import preview); applies to everyone
//   userId = <id>  → per-customer alias (set by customer via OCR/order review); applies only to that user
// Customer aliases take priority over global aliases during matching.
export const codeAliases = mysqlTable(
  "code_aliases",
  {
    id: int("id").autoincrement().primaryKey(),
    rawCodeCanon: varchar("rawCodeCanon", { length: 128 }).notNull(),
    rawCodeSample: varchar("rawCodeSample", { length: 128 }).notNull(),
    cabinetId: int("cabinetId").notNull(),
    // NULL = global (admin); non-null = per-customer private alias
    userId: int("userId"),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => ({
    // Composite unique: same raw code can exist once globally (userId=NULL) and once per user
    uniqCodeUser: uniqueIndex("code_aliases_raw_user_uidx").on(t.rawCodeCanon, t.userId),
  })
);

export type CodeAlias = typeof codeAliases.$inferSelect;
export type InsertCodeAlias = typeof codeAliases.$inferInsert;

// ─── Shipping / freight estimator settings ─────────────────────────────────────
// Single-row admin configuration for the LTL freight estimator. We avoid a live
// broker/middleman by computing rates from this table; a future live-carrier API
// can replace the math behind the same procedure via the freightProvider seam.
// All money is stored in whole cents to avoid float drift; rates that are
// "$ per 100 lbs" are stored in cents per 100 lbs.
export const shippingSettings = mysqlTable("shipping_settings", {
  id: int("id").autoincrement().primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  originZip: varchar("originZip", { length: 16 }).default("").notNull(),
  // Base rate model. "per_cwt" = $ per 100 lbs (hundredweight) per zone;
  // "flat" = a flat $ per zone regardless of weight.
  rateModel: mysqlEnum("rateModel", ["per_cwt", "flat"]).default("per_cwt").notNull(),
  handlingFeeCents: int("handlingFeeCents").default(0).notNull(),
  minChargeCents: int("minChargeCents").default(8900).notNull(),
  liftgateFeeCents: int("liftgateFeeCents").default(7500).notNull(),
  residentialFeeCents: int("residentialFeeCents").default(6500).notNull(),
  insideDeliveryFeeCents: int("insideDeliveryFeeCents").default(5000).notNull(),
  // Markup applied on top of computed freight (basis points; 1500 = 15%).
  markupBps: int("markupBps").default(1500).notNull(),
  // Optional damage-coverage surcharge on the freight subtotal (basis points).
  damageFeeBps: int("damageFeeBps").default(0).notNull(),
  // Free freight when the cart merchandise subtotal (cents) meets/exceeds this.
  // 0 (or null) disables the threshold.
  freeFreightThresholdCents: int("freeFreightThresholdCents").default(0).notNull(),
  // Fallback weight (lbs) used when a cabinet has no stored weight.
  defaultCabinetWeightLbs: decimal("defaultCabinetWeightLbs", { precision: 6, scale: 2 })
    .default("45")
    .notNull(),
  // Live carrier/broker API key (e.g. EasyPost / Shippo). When quoteMode="live"
  // and a key is present, freight is fetched live from the carrier instead of the
  // in-house estimator.
  liveProvider: varchar("liveProvider", { length: 64 }).default("estimator").notNull(), // estimator | easypost | shippo
  liveApiKey: varchar("liveApiKey", { length: 255 }),
  // Quote mode. "estimator" = in-house zone math (legacy). "live" = call the
  // carrier API for a real LTL rate; if the live call fails, freight is reported
  // as unavailable ("quoted on your order") rather than guessed.
  quoteMode: mysqlEnum("quoteMode", ["estimator", "live"]).default("estimator").notNull(),
  // Minimum freight charged for a KITCHEN-scale order (cents). A live rate that
  // comes back below this floor is raised to it. Default $800.
  kitchenFreightFloorCents: int("kitchenFreightFloorCents").default(80000).notNull(),
  // What counts as a "kitchen" for the floor: any order at/above this many
  // cabinet line-units. Small parts orders below this are NOT forced to the floor.
  kitchenMinCabinets: int("kitchenMinCabinets").default(6).notNull(),
  // 8 ft freight pallet model. Cabinets ship flat-pack, so we cube the order by
  // PACKAGED weight + cubic feet and split into pallets using these caps.
  palletLengthIn: decimal("palletLengthIn", { precision: 6, scale: 2 }).default("96").notNull(),
  palletWidthIn: decimal("palletWidthIn", { precision: 6, scale: 2 }).default("40").notNull(),
  palletHeightIn: decimal("palletHeightIn", { precision: 6, scale: 2 }).default("60").notNull(),
  palletMaxWeightLbs: decimal("palletMaxWeightLbs", { precision: 8, scale: 2 }).default("1200").notNull(),
  palletMaxCubicFt: decimal("palletMaxCubicFt", { precision: 8, scale: 2 }).default("100").notNull(),
  palletTareLbs: decimal("palletTareLbs", { precision: 6, scale: 2 }).default("50").notNull(),
  // LTL freight class used for the live quote (cabinets are typically 150–250).
  freightClass: varchar("freightClass", { length: 8 }).default("175").notNull(),
  // Fallback PACKAGED cubic feet per cabinet when its pkg dims are missing.
  defaultCabinetCubicFt: decimal("defaultCabinetCubicFt", { precision: 6, scale: 2 }).default("8").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ShippingSettings = typeof shippingSettings.$inferSelect;
export type InsertShippingSettings = typeof shippingSettings.$inferInsert;

// Maps a destination region to a freight zone + its rate. We match a shipment's
// destination ZIP by its leading digits (zipPrefix) to the most specific row.
// rateCents meaning depends on shippingSettings.rateModel (per-cwt vs flat).
export const freightZones = mysqlTable("freight_zones", {
  id: int("id").autoincrement().primaryKey(),
  zoneName: varchar("zoneName", { length: 64 }).notNull(),
  // Leading ZIP digits this zone covers, comma-separated (e.g. "0,1,2" or
  // "30,31,32"). Most digits = most specific = wins.
  zipPrefixes: varchar("zipPrefixes", { length: 255 }).notNull(),
  rateCents: int("rateCents").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FreightZone = typeof freightZones.$inferSelect;
export type InsertFreightZone = typeof freightZones.$inferInsert;

// ─── Pricing & Margins ────────────────────────────────────────────────────────
// Single-row control center for platform-wide selling margins. The base tier
// prices (wholesale/contractor/homeowner) are stored per distributor SKU; these
// settings let the owner nudge a whole tier up/down with one global markup,
// plus a global default markup used as guidance for new supply lines. All
// markups are in basis points (10000 = 0%/no change; 11500 = +15%).
export const pricingSettings = mysqlTable("pricing_settings", {
  id: int("id").autoincrement().primaryKey(),
  // Platform default markup applied to a distributor line that has no explicit
  // per-distributor override (guidance + applied to series/neutral lines).
  globalMarkupBps: int("globalMarkupBps").default(10000).notNull(),
  // Per-tier multiplier applied on top of the stored base tier price at
  // resolution time. 10000 = leave price unchanged.
  homeownerMarkupBps: int("homeownerMarkupBps").default(10000).notNull(),
  contractorMarkupBps: int("contractorMarkupBps").default(10000).notNull(),
  wholesaleMarkupBps: int("wholesaleMarkupBps").default(10000).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedByOpenId: varchar("updatedByOpenId", { length: 64 }),
});

export type PricingSettings = typeof pricingSettings.$inferSelect;
export type InsertPricingSettings = typeof pricingSettings.$inferInsert;

// ─── Platform fee system (price ladder + order fee stack) ──────────────────────
// Single-row control center for the Cabinet Dealz fee stack — distinct from
// pricing_settings (which holds per-tier multipliers). This drives shared/pricing.ts:
// the price ladder markups + the damage / tech / card fees applied to an order.
// All percentages are basis points (500 = 5%); caps are whole cents.
export const platformPricingSettings = mysqlTable("platform_pricing_settings", {
  id: int("id").autoincrement().primaryKey(),
  // Price ladder markups (compound up from internal base cost).
  wholesaleMarkupBps: int("wholesaleMarkupBps").default(1500).notNull(), // base → wholesale
  affiliateMarkupBps: int("affiliateMarkupBps").default(500).notNull(), // wholesale → affiliate (~5%)
  retailMarkupBps: int("retailMarkupBps").default(2500).notNull(), // affiliate → suggested retail
  // Order fee stack.
  damageFeeBps: int("damageFeeBps").default(100).notNull(), // 1% of cabinet subtotal, every order
  techFeeBps: int("techFeeBps").default(1000).notNull(), // 10% of cabinet subtotal
  techFeeCapCents: int("techFeeCapCents").default(10000).notNull(), // capped at $100
  cardFeeBps: int("cardFeeBps").default(400).notNull(), // 4% on final total, card only (ACH waives)
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedByOpenId: varchar("updatedByOpenId", { length: 64 }),
});

export type PlatformPricingSettingsRow = typeof platformPricingSettings.$inferSelect;
export type InsertPlatformPricingSettings = typeof platformPricingSettings.$inferInsert;


// ─── Affiliate payouts (weekly batches) ───────────────────────────────────────
// Each row is one weekly payout batch for one affiliate. The admin "Payouts"
// view groups confirmed order requests by ISO week (see shared/earnings.ts),
// shows what each affiliate is owed, and lets the team mark a week issued/paid.
// amountCents is the commission owed for that week, snapshotted at creation so
// later order edits don't retroactively change a settled payout.
export const affiliatePayouts = mysqlTable("affiliate_payouts", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId").notNull(),
  weekKey: varchar("weekKey", { length: 12 }).notNull(), // ISO week, e.g. "2026-W26"
  weekStart: datetime("weekStart").notNull(), // Monday 00:00 UTC of the ISO week (datetime: supports far-future week anchors beyond the 2038 timestamp limit)
  amountCents: int("amountCents").notNull(), // commission owed for the week
  orderCount: int("orderCount").default(0).notNull(),
  status: mysqlEnum("status", ["pending", "issued", "paid"]).default("pending").notNull(),
  method: varchar("method", { length: 32 }), // e.g. "check", "ach"
  reference: varchar("reference", { length: 128 }), // check #, ACH ref, etc.
  note: text("note"),
  issuedAt: timestamp("issuedAt"),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AffiliatePayout = typeof affiliatePayouts.$inferSelect;
export type InsertAffiliatePayout = typeof affiliatePayouts.$inferInsert;


// ─── Cost / Price change audit log ─────────────────────────────────────────────
// Every admin correction made through the Cost Lookup / Verify tool is recorded
// here so price changes are traceable (who changed what, old -> new, when). One
// row per field changed per save. Values are stored as strings to mirror the
// decimal columns they came from (null = field was blank/unset).
export const costChangeLog = mysqlTable("cost_change_log", {
  id: int("id").autoincrement().primaryKey(),
  skuId: int("skuId").notNull(), // distributor_skus.id that was edited
  cabinetId: int("cabinetId").notNull(),
  masterCode: varchar("masterCode", { length: 64 }).notNull(), // snapshot for easy reading
  field: varchar("field", { length: 32 }).notNull(), // yourCost | listPrice | wholesalePrice | contractorPrice | homeownerPrice
  oldValue: varchar("oldValue", { length: 32 }), // previous value (null if unset)
  newValue: varchar("newValue", { length: 32 }), // new value (null if cleared)
  changedByOpenId: varchar("changedByOpenId", { length: 64 }),
  changedByName: varchar("changedByName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CostChangeLogRow = typeof costChangeLog.$inferSelect;
export type InsertCostChangeLog = typeof costChangeLog.$inferInsert;


// ─── Authorize.Net payment settings ───────────────────────────────────────────
// Single-row control center for the merchant's Authorize.Net credentials. Card
// data NEVER touches our server: the browser tokenizes the card with Accept.js
// using the public clientKey, and the server charges the resulting opaque
// "payment nonce" with the apiLoginId + transactionKey. The environment toggle
// selects the Authorize.Net sandbox vs production gateway endpoint.
export const paymentSettings = mysqlTable("payment_settings", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 32 }).default("authorizenet").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  environment: mysqlEnum("environment", ["sandbox", "production"]).default("sandbox").notNull(),
  // API Login ID (public-ish merchant identifier).
  apiLoginId: varchar("apiLoginId", { length: 64 }),
  // Transaction Key — SECRET, server-side only, never returned to the client.
  transactionKey: varchar("transactionKey", { length: 64 }),
  // Public Client Key — safe to expose to the browser for Accept.js tokenization.
  clientKey: varchar("clientKey", { length: 128 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedByOpenId: varchar("updatedByOpenId", { length: 64 }),
});

export type PaymentSettings = typeof paymentSettings.$inferSelect;
export type InsertPaymentSettings = typeof paymentSettings.$inferInsert;

// ─── Payment transactions ──────────────────────────────────────────────────────
// One row per charge attempt against an order request. Charges happen ONLY after
// a freight quote has been attached, so amountCents = merchandise + fees + freight
// (the customer pays 100% upfront). We store the Authorize.Net transaction id and
// the result, plus snapshot amounts, but never any raw card data (PCI-friendly).
export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  orderRequestId: int("orderRequestId").notNull(),
  requestNumber: varchar("requestNumber", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 32 }).default("authorizenet").notNull(),
  environment: mysqlEnum("environment", ["sandbox", "production"]).default("sandbox").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "declined", "error", "refunded"]).default("pending").notNull(),
  // Amount actually charged (cents) and its component breakdown (snapshot).
  amountCents: int("amountCents").notNull(),
  merchandiseCents: int("merchandiseCents").default(0).notNull(),
  feesCents: int("feesCents").default(0).notNull(),
  freightCents: int("freightCents").default(0).notNull(),
  // Authorize.Net response.
  transactionId: varchar("transactionId", { length: 64 }), // gateway transId
  authCode: varchar("authCode", { length: 32 }),
  responseCode: varchar("responseCode", { length: 8 }), // 1=approved,2=declined,3=error,4=held
  avsResultCode: varchar("avsResultCode", { length: 8 }),
  cardLast4: varchar("cardLast4", { length: 4 }), // safe display only
  cardType: varchar("cardType", { length: 24 }),
  message: text("message"), // human-readable result / error text
  // Who paid.
  payerName: varchar("payerName", { length: 256 }),
  payerEmail: varchar("payerEmail", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;


// ─── Design leads ───────────────────────────────────────────────────────────
// One row per "Launch Designer" entry. The email gate captures a contact even
// if the visitor never saves a design or requests a quote, so reps always have
// someone to follow up with. Email is required; name + phone are optional (we
// keep the gate low-friction). userId is set when a logged-in user launches.
export const designLeads = mysqlTable("design_leads", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // null for guest/email-only launches
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 256 }),
  phone: varchar("phone", { length: 32 }),
  roomType: varchar("roomType", { length: 32 }), // kitchen/bath/etc. if known at launch
  source: varchar("source", { length: 64 }).default("designer_launch").notNull(),
  dealId: int("dealId"), // the HOUSE crm deal auto-created from this lead (null until created)
  // Light de-dupe / engagement counters so repeat launches update one record.
  launchCount: int("launchCount").default(1).notNull(),
  lastLaunchAt: timestamp("lastLaunchAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DesignLead = typeof designLeads.$inferSelect;
export type InsertDesignLead = typeof designLeads.$inferInsert;

// ─── Door style sample-photo corrections ────────────────────────────────────
// Two-way door photo tool: a field user (or admin) submits a real photo of a
// known door style to correct the on-file sample. Admin submissions apply to
// the live sample immediately and are logged here as "approved"; non-admin
// submissions land as "pending" for an admin to approve/reject. We keep the
// previous image so a correction can be undone.
export const doorStyleCorrections = mysqlTable("door_style_corrections", {
  id: int("id").autoincrement().primaryKey(),
  styleId: int("styleId").notNull(), // door_styles.id this correction targets
  imageUrl: varchar("imageUrl", { length: 512 }).notNull(), // new sample (S3 /manus-storage/..)
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  previousImageUrl: varchar("previousImageUrl", { length: 512 }), // for undo/history
  note: varchar("note", { length: 512 }), // optional submitter note
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  submittedBy: int("submittedBy").notNull(), // users.id
  submittedByName: varchar("submittedByName", { length: 256 }),
  reviewedBy: int("reviewedBy"), // users.id of the admin who approved/rejected
  reviewedAt: timestamp("reviewedAt"),
  reviewNote: varchar("reviewNote", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DoorStyleCorrection = typeof doorStyleCorrections.$inferSelect;
export type InsertDoorStyleCorrection = typeof doorStyleCorrections.$inferInsert;


// ─── Professional designer scheduling ───────────────────────────────────────────
// A designer (role = "designer" or "admin") publishes bookable time slots. A
// customer in the Design Tool taps "Get a professional designer", picks an open
// slot, and books it. Booking claims the slot and spawns a CRM deal so the
// internal team manages the consultation from the existing pipeline.

export const designerAvailability = mysqlTable("designer_availability", {
  id: int("id").autoincrement().primaryKey(),
  designerUserId: int("designerUserId").notNull(), // FK -> users.id (role designer/admin)
  designerName: varchar("designerName", { length: 256 }), // snapshot for display
  // Slot window, stored UTC.
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  // "video" (default) or "phone" or "in_person".
  mode: mysqlEnum("mode", ["video", "phone", "in_person"]).default("video").notNull(),
  // open = bookable, booked = claimed, blocked = manually closed by the designer.
  status: mysqlEnum("status", ["open", "booked", "blocked"]).default("open").notNull(),
  notes: varchar("notes", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DesignerAvailability = typeof designerAvailability.$inferSelect;
export type InsertDesignerAvailability = typeof designerAvailability.$inferInsert;

export const designConsultations = mysqlTable("design_consultations", {
  id: int("id").autoincrement().primaryKey(),
  slotId: int("slotId").notNull(), // FK -> designer_availability.id
  designerUserId: int("designerUserId").notNull(),
  designerName: varchar("designerName", { length: 256 }),
  // Requesting customer (may be a guest who only gave name/email/phone).
  customerUserId: int("customerUserId"), // nullable for guests
  customerName: varchar("customerName", { length: 256 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }),
  // Optional saved design the customer wants to review with the designer.
  designId: int("designId"),
  designName: varchar("designName", { length: 256 }),
  // Scheduling window (snapshotted from the slot, UTC).
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  mode: mysqlEnum("mode", ["video", "phone", "in_person"]).default("video").notNull(),
  topic: varchar("topic", { length: 1000 }), // what the customer wants help with
  status: mysqlEnum("status", ["requested", "confirmed", "completed", "cancelled"]).default("requested").notNull(),
  // CRM linkage created at booking time.
  dealId: int("dealId"),
  // Read-only "share live with customer" follow link token + voice meeting URL.
  shareToken: varchar("shareToken", { length: 40 }),
  meetingUrl: varchar("meetingUrl", { length: 1000 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DesignConsultation = typeof designConsultations.$inferSelect;
export type InsertDesignConsultation = typeof designConsultations.$inferInsert;


// ─── Affiliate membership invoices ──────────────────────────────────────────────
// Each affiliate annual membership term produces an invoice. The affiliate pays
// it by Stripe (when enabled) or via the owner's own credit-card processing
// (recorded as an external/manual payment). One "open" invoice at a time per
// affiliate; paying it activates/extends the membership term.
export const affiliateInvoices = mysqlTable("affiliate_invoices", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId").notNull(),
  // Human-friendly invoice number, e.g. "AFF-2026-0007".
  invoiceNumber: varchar("invoiceNumber", { length: 32 }).notNull().unique(),
  description: varchar("description", { length: 256 }).default("Annual affiliate membership").notNull(),
  amountCents: int("amountCents").default(119500).notNull(), // $1,195.00
  status: mysqlEnum("status", ["open", "paid", "void"]).default("open").notNull(),
  // How it was paid once status = paid.
  paymentMethod: mysqlEnum("paymentMethod", ["stripe", "external_card", "manual", "none"]).default("none").notNull(),
  paymentRef: varchar("paymentRef", { length: 256 }), // Stripe id / last4 / memo
  // Membership term this invoice covers (snapshotted on payment).
  periodStart: timestamp("periodStart"),
  periodEnd: timestamp("periodEnd"),
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  paidAt: timestamp("paidAt"),
  paidByUserId: int("paidByUserId"), // admin who recorded a manual/external payment
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AffiliateInvoice = typeof affiliateInvoices.$inferSelect;
export type InsertAffiliateInvoice = typeof affiliateInvoices.$inferInsert;

// ─── Sales-rep commissions ──────────────────────────────────────────────────────
// A sales rep earns a flat one-time commission ($400) when a CRM deal they own
// is marked "won". One commission row per deal (idempotent on dealId). Status
// moves pending -> paid when the owner pays the rep out.
export const salesCommissions = mysqlTable("sales_commissions", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull().unique(), // one commission per won deal
  repUserId: int("repUserId").notNull(), // the deal owner at win time
  repName: varchar("repName", { length: 256 }),
  amountCents: int("amountCents").default(40000).notNull(), // $400.00 flat
  status: mysqlEnum("status", ["pending", "paid", "void"]).default("pending").notNull(),
  dealTitle: varchar("dealTitle", { length: 256 }),
  wonAt: timestamp("wonAt").defaultNow().notNull(),
  paidAt: timestamp("paidAt"),
  paidByUserId: int("paidByUserId"),
  notes: varchar("notes", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesCommission = typeof salesCommissions.$inferSelect;
export type InsertSalesCommission = typeof salesCommissions.$inferInsert;

// ─── Site-wide settings ─────────────────────────────────────────────────────
// A single-row key/value store for global admin-controlled settings.
// pricingVisibility controls who can see pricing on the storefront:
//   "public"      → everyone (guests + logged-in users)
//   "logged_in"   → only authenticated users (any role)
//   "dealer"      → only users with role dealer, wholesale, contractor, or admin
//   "admin"       → only admins (owner)
//   "hidden"      → nobody sees pricing (RFQ mode)
export const siteSettings = mysqlTable("site_settings", {
  id: int("id").autoincrement().primaryKey(),
  pricingVisibility: mysqlEnum("pricingVisibility", [
    "public",
    "logged_in",
    "dealer",
    "admin",
    "hidden",
  ])
    .default("public")
    .notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SiteSettings = typeof siteSettings.$inferSelect;
export type InsertSiteSettings = typeof siteSettings.$inferInsert;

// ─── Email / SMTP settings ────────────────────────────────────────────────────
// Stored in DB so admins can configure without touching env vars.
// smtpPass is write-only (never returned to the client).
export const emailSettings = mysqlTable("email_settings", {
  id: int("id").autoincrement().primaryKey(),
  smtpHost: varchar("smtpHost", { length: 255 }).default("").notNull(),
  smtpPort: int("smtpPort").default(465).notNull(),
  smtpUser: varchar("smtpUser", { length: 255 }).default("").notNull(),
  smtpPass: varchar("smtpPass", { length: 255 }).default("").notNull(),
  smtpFrom: varchar("smtpFrom", { length: 255 }).default("").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailSettings = typeof emailSettings.$inferSelect;
export type InsertEmailSettings = typeof emailSettings.$inferInsert;

// ─── Site branding settings ───────────────────────────────────────────────────
export const brandingSettings = mysqlTable("branding_settings", {
  id: int("id").autoincrement().primaryKey(),
  siteName: varchar("siteName", { length: 128 }).default("Cabinet Dealz").notNull(),
  logoUrl: varchar("logoUrl", { length: 512 }).default("").notNull(),
  faviconUrl: varchar("faviconUrl", { length: 512 }).default("").notNull(),
  primaryColor: varchar("primaryColor", { length: 16 }).default("#1a2b4a").notNull(),
  accentColor: varchar("accentColor", { length: 16 }).default("#c9a227").notNull(),
  tagline: varchar("tagline", { length: 255 }).default("").notNull(),
  supportEmail: varchar("supportEmail", { length: 255 }).default("").notNull(),
  supportPhone: varchar("supportPhone", { length: 64 }).default("").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BrandingSettings = typeof brandingSettings.$inferSelect;
export type InsertBrandingSettings = typeof brandingSettings.$inferInsert;

// ─── Notification settings ────────────────────────────────────────────────────
export const notificationSettings = mysqlTable("notification_settings", {
  id: int("id").autoincrement().primaryKey(),
  // Comma-separated email addresses for each event type
  onNewOrder: varchar("onNewOrder", { length: 1024 }).default("").notNull(),
  onNewDesignLead: varchar("onNewDesignLead", { length: 1024 }).default("").notNull(),
  onNewQuoteRequest: varchar("onNewQuoteRequest", { length: 1024 }).default("").notNull(),
  onNewProApplication: varchar("onNewProApplication", { length: 1024 }).default("").notNull(),
  onNewConsultation: varchar("onNewConsultation", { length: 1024 }).default("").notNull(),
  onNewAffiliate: varchar("onNewAffiliate", { length: 1024 }).default("").notNull(),
  // Global toggle — if false, no notification emails are sent
  enabled: boolean("enabled").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert;

// ─── Cabinet Images (admin-uploaded product photos) ───────────────────────────
// Admin can upload a product image per cabinet master code.
// When present, this image replaces the auto-generated SVG line drawing
// in the catalog detail page and designer palette thumbnail.
export const cabinetImages = mysqlTable("cabinet_images", {
  id: int("id").autoincrement().primaryKey(),
  cabinetCode: varchar("cabinetCode", { length: 32 }).notNull().unique(), // e.g. "CDB-36"
  s3Key: varchar("s3Key", { length: 512 }).notNull(),
  s3Url: varchar("s3Url", { length: 1024 }).notNull(),
  uploadedBy: int("uploadedBy"), // userId of the admin who uploaded
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type CabinetImage = typeof cabinetImages.$inferSelect;
export type InsertCabinetImage = typeof cabinetImages.$inferInsert;

// ─── Pelican per-category markups ─────────────────────────────────────────────
// Admin-configurable markup applied on top of a Pelican product's cost
// (pelican_products.listPrice = cost). Sell price = cost × (1 + markupBps/10000).
// One row per Pelican category. Nothing hardcoded — all editable in
// Admin → Pricing & Margins.
export const pelicanCategoryMarkups = mysqlTable("pelican_category_markups", {
  id: int("id").autoincrement().primaryKey(),
  category: varchar("category", { length: 64 }).notNull().unique(),
  markupBps: int("markupBps").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedByOpenId: varchar("updatedByOpenId", { length: 64 }),
});
export type PelicanCategoryMarkup = typeof pelicanCategoryMarkups.$inferSelect;
export type InsertPelicanCategoryMarkup = typeof pelicanCategoryMarkups.$inferInsert;

// ─── Approved Vendors (supply-line scorecard) ──────────────────────────────────
// Tracks each approved supply line with approval status, contact info, and
// lifetime sales. totalSalesCents is rolled up from confirmed orders.
export const vendorLines = mysqlTable("vendor_lines", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 191 }).notNull().unique(),
  sourceKey: varchar("sourceKey", { length: 64 }),
  category: varchar("category", { length: 128 }).default("").notNull(),
  contactName: varchar("contactName", { length: 191 }).default("").notNull(),
  contactEmail: varchar("contactEmail", { length: 255 }).default("").notNull(),
  contactPhone: varchar("contactPhone", { length: 64 }).default("").notNull(),
  isApproved: boolean("isApproved").default(true).notNull(),
  totalSalesCents: int("totalSalesCents").default(0).notNull(),
  salesUpdatedAt: timestamp("salesUpdatedAt"),
  notes: text("notes"),
  inviteToken: varchar("inviteToken", { length: 64 }).unique(),
  inviteCreatedAt: timestamp("inviteCreatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type VendorLine = typeof vendorLines.$inferSelect;
export type InsertVendorLine = typeof vendorLines.$inferInsert;

// Stores guided Surfaces & Fixtures selections and the on-demand AI kitchen preview render.
export const surfacePreviews = mysqlTable("surface_previews", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 191 }),
  selections: json("selections"),
  previewUrl: varchar("previewUrl", { length: 512 }),
  // "preview" = a one-off AI render snapshot; "profile" = the customer's saved
  // Surfaces & Fixtures selection they can explicitly load into the Design Tool.
  kind: mysqlEnum("kind", ["preview", "profile"]).default("preview").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SurfacePreview = typeof surfacePreviews.$inferSelect;
export type InsertSurfacePreview = typeof surfacePreviews.$inferInsert;

// ─── CRM webhook outbox ────────────────────────────────────────────────────────
// Durable record of every business event that should reach an external CRM
// (Zapier / Make / GoHighLevel / HubSpot / any webhook). We ALWAYS persist the
// event here first, then attempt delivery to CRM_WEBHOOK_URL. If delivery fails
// (or no URL is configured yet) the row remains as the source of truth and can
// be retried, so no lead / design / order is ever lost. Each event is tagged
// with the white-label affiliate/dealer it belongs to (affiliateId NULL = the
// house / Cabinet Dealz pipeline).
export const crmEvents = mysqlTable("crm_events", {
  id: int("id").autoincrement().primaryKey(),
  // "lead" | "design_saved" | "order_submitted" (kept as a string for forward
  // compatibility so new event kinds don't require a migration).
  eventType: varchar("eventType", { length: 48 }).notNull(),
  // White-label attribution.
  affiliateId: int("affiliateId"), // NULL = house / Cabinet Dealz
  referralCode: varchar("referralCode", { length: 32 }),
  dealerName: varchar("dealerName", { length: 256 }), // resolved display name at send time
  // Who / what the event is about.
  userId: int("userId"),
  contactName: varchar("contactName", { length: 256 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  // The full JSON payload that was (or will be) POSTed to the webhook.
  payload: json("payload"),
  // Delivery bookkeeping.
  status: mysqlEnum("status", ["pending", "sent", "failed", "skipped"]).default("pending").notNull(),
  attempts: int("attempts").default(0).notNull(),
  lastError: text("lastError"),
  responseStatus: int("responseStatus"),
  deliveredAt: timestamp("deliveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CrmEvent = typeof crmEvents.$inferSelect;
export type InsertCrmEvent = typeof crmEvents.$inferInsert;

// ─── Vendor Promotions ──────────────────────────────────────────────────────
// A promotion set by a distributor/vendor. Can target specific SKUs, an entire
// door style, or a category. Discount is either a percentage off or a fixed
// sale price. Optional date range for time-limited promos.
export const vendorPromotions = mysqlTable("vendor_promotions", {
  id: int("id").autoincrement().primaryKey(),
  distributorId: int("distributorId").notNull(),
  name: varchar("name", { length: 256 }).notNull(), // e.g. "Summer Sale 20% Off Shaker"
  // Target: at least one of these should be set. If skuIds is set, it targets those specific SKUs.
  // If styleId is set, it targets all SKUs of that door style. If category is set, targets that category.
  // Multiple can be combined (e.g. styleId + category = that style in that category only).
  skuIds: json("skuIds"), // number[] — specific distributor_skus.id values
  styleId: int("styleId"), // targets all SKUs of this door style
  category: varchar("category", { length: 128 }), // e.g. "Base Cabinets", "Wall Cabinets"
  // Discount
  discountType: mysqlEnum("discountType", ["percent", "fixed_price"]).notNull(),
  discountValue: decimal("discountValue", { precision: 10, scale: 2 }).notNull(), // % amount or fixed price
  // Date range (null = no limit)
  startsAt: timestamp("startsAt"),
  endsAt: timestamp("endsAt"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type VendorPromotion = typeof vendorPromotions.$inferSelect;
export type InsertVendorPromotion = typeof vendorPromotions.$inferInsert;

// ─── Product Gallery Images ─────────────────────────────────────────────────
// Multiple gallery images per SKU, uploaded by the vendor. The primary image
// is stored on distributorSkus.imageUrl; these are additional gallery shots.
export const productGalleryImages = mysqlTable("product_gallery_images", {
  id: int("id").autoincrement().primaryKey(),
  skuId: int("skuId").notNull(), // distributor_skus.id
  distributorId: int("distributorId").notNull(),
  s3Key: varchar("s3Key", { length: 512 }).notNull(),
  s3Url: varchar("s3Url", { length: 1024 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  caption: varchar("caption", { length: 256 }),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type ProductGalleryImage = typeof productGalleryImages.$inferSelect;
export type InsertProductGalleryImage = typeof productGalleryImages.$inferInsert;


// ─── Product view tracking (vendor analytics) ────────────────────────────────
// Lightweight page-view tracking for vendor-facing analytics. Each row records
// one product detail page view with the distributor it belongs to so vendors
// can see how many hits their products get.
export const productViews = mysqlTable("product_views", {
  id: int("id").autoincrement().primaryKey(),
  distributorId: int("distributorId").notNull(),
  cabinetId: int("cabinetId"), // nullable — could be a pelican product view
  skuId: int("skuId"), // distributor_skus.id if applicable
  pelicanProductId: int("pelicanProductId"), // pelican_products.id if applicable
  pageSlug: varchar("pageSlug", { length: 256 }).notNull(), // e.g. "/cabinets/B12"
  referrer: varchar("referrer", { length: 512 }),
  userAgent: varchar("userAgent", { length: 512 }),
  viewedAt: timestamp("viewedAt").defaultNow().notNull(),
});

export type ProductView = typeof productViews.$inferSelect;
export type InsertProductView = typeof productViews.$inferInsert;


// ─── AI Service Requests ─────────────────────────────────────────────────────
// Tracks vendor AI catalog service requests: upload, estimate, approval, processing, completion.
export const aiServiceRequests = mysqlTable("ai_service_requests", {
  id: int("id").autoincrement().primaryKey(),
  distributorId: int("distributorId").notNull(),
  userId: int("userId").notNull(),
  serviceType: varchar("serviceType", { length: 100 }).notNull(),
  fileName: varchar("fileName", { length: 255 }),
  fileKey: varchar("fileKey", { length: 512 }),
  fileUrl: varchar("fileUrl", { length: 1024 }),
  fileSizeBytes: int("fileSizeBytes"),
  details: text("details"),
  estimatedSkus: int("estimatedSkus"),
  estimatedHours: decimal("estimatedHours", { precision: 5, scale: 2 }),
  estimatedCost: decimal("estimatedCost", { precision: 8, scale: 2 }),
  actualHours: decimal("actualHours", { precision: 5, scale: 2 }),
  actualCost: decimal("actualCost", { precision: 8, scale: 2 }),
  status: mysqlEnum("status", ["pending", "estimated", "approved", "processing", "completed", "cancelled"]).default("pending").notNull(),
  approvedAt: timestamp("approvedAt"),
  completedAt: timestamp("completedAt"),
  adminNotes: text("adminNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiServiceRequest = typeof aiServiceRequests.$inferSelect;
export type InsertAiServiceRequest = typeof aiServiceRequests.$inferInsert;

// ─── QuickBooks Online OAuth tokens ─────────────────────────────────────────
// Single-row table storing the connected QBO company's OAuth2 tokens.
// Upserted on every successful OAuth callback (id=1 always).
export const qboTokens = mysqlTable("qbo_tokens", {
  id: int("id").autoincrement().primaryKey(),
  realmId: varchar("realmId", { length: 64 }).notNull(), // QBO company ID
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken").notNull(),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt").notNull(),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt").notNull(),
  environment: varchar("environment", { length: 16 }).default("production").notNull(),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type QboTokens = typeof qboTokens.$inferSelect;
export type InsertQboTokens = typeof qboTokens.$inferInsert;

// ─── Measure Sessions (AR Tape Measure ↔ Design Tool bridge) ─────────────────
export const measureSessions = mysqlTable("measure_sessions", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["pending", "completed", "consumed"]).default("pending").notNull(),
  measurements: text("measurements"), // JSON array of WallMeasurement objects
  expiresAt: timestamp("expiresAt").notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MeasureSession = typeof measureSessions.$inferSelect;
export type InsertMeasureSession = typeof measureSessions.$inferInsert;

// ─── Media Library ────────────────────────────────────────────────────────────
export const mediaLibrary = mysqlTable("media_library", {
  id: int("id").autoincrement().primaryKey(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  filename: varchar("filename", { length: 255 }),
  mimeType: varchar("mimeType", { length: 128 }),
  sizeBytes: int("sizeBytes"),
  uploadedBy: int("uploadedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MediaLibraryItem = typeof mediaLibrary.$inferSelect;
export type InsertMediaLibraryItem = typeof mediaLibrary.$inferInsert;

// ─── Page Content (CMS for editable text blocks) ─────────────────────────────
export const pageContent = mysqlTable("page_content", {
  id: int("id").autoincrement().primaryKey(),
  pageKey: varchar("pageKey", { length: 128 }).notNull(),
  field: varchar("field", { length: 128 }).notNull(),
  value: text("value"),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PageContent = typeof pageContent.$inferSelect;
export type InsertPageContent = typeof pageContent.$inferInsert;

// ─── Distributor Cabinet Overrides ───────────────────────────────────────────
// Per-distributor dimension/spec overrides on top of the master cabinet record.
// e.g. Skyline's BBC36 has a different physical width than the master.
// null fields = use master value; non-null = use this override for that distributor.
export const distributorCabinetOverrides = mysqlTable(
  "distributor_cabinet_overrides",
  {
    id: int("id").autoincrement().primaryKey(),
    distributorId: int("distributorId").notNull(),
    cabinetId: int("cabinetId").notNull(),
    // Overrideable dimension fields (null = use master value)
    width: decimal("width", { precision: 6, scale: 2 }),
    height: decimal("height", { precision: 6, scale: 2 }),
    depth: decimal("depth", { precision: 6, scale: 2 }),
    physicalWidth: decimal("physicalWidth", { precision: 6, scale: 2 }),
    weight: decimal("weight", { precision: 8, scale: 2 }),
    pkgLength: decimal("pkgLength", { precision: 6, scale: 2 }),
    pkgWidth: decimal("pkgWidth", { precision: 6, scale: 2 }),
    pkgHeight: decimal("pkgHeight", { precision: 6, scale: 2 }),
    pkgWeight: decimal("pkgWeight", { precision: 8, scale: 2 }),
    imageUrl: varchar("imageUrl", { length: 1024 }),  // line-specific catalog image override
    note: text("note"),
    updatedBy: int("updatedBy"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    uniq: unique().on(t.distributorId, t.cabinetId),
  })
);
export type DistributorCabinetOverride = typeof distributorCabinetOverrides.$inferSelect;
export type InsertDistributorCabinetOverride = typeof distributorCabinetOverrides.$inferInsert;

// ─── Category Aliases ─────────────────────────────────────────────────────────
// Maps raw distributor category strings to universal platform categories.
// Used during XLSX import to normalize distributor-specific names.
// distributorId = null means the alias applies globally (all distributors).

export const categoryAliases = mysqlTable(
  "category_aliases",
  {
    id: int("id").autoincrement().primaryKey(),
    // The raw string from the distributor spreadsheet (case-insensitive match)
    rawCategory: varchar("rawCategory", { length: 128 }).notNull(),
    // The normalized platform category (Base, Wall, Tall, Vanity, ADA, Accessory, Corner, Specialty)
    platformCategory: varchar("platformCategory", { length: 64 }).notNull(),
    // Optional: scope to a specific distributor. NULL = global (applies to all).
    distributorId: int("distributorId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("category_aliases_raw_dist_uniq").on(t.rawCategory, t.distributorId),
  })
);

export type CategoryAlias = typeof categoryAliases.$inferSelect;
export type InsertCategoryAlias = typeof categoryAliases.$inferInsert;

// ─── Storefront Banners ────────────────────────────────────────────────────────
// Admin-managed promotional / holiday banners displayed at the top of the
// storefront. Only one banner can be active at a time. Admins pre-create banners
// for different holidays and switch the active one with a single toggle.
export const banners = mysqlTable("banners", {
  id: int("id").autoincrement().primaryKey(),
  // Display content
  title: varchar("title", { length: 256 }).notNull(),
  subtitle: varchar("subtitle", { length: 512 }),
  ctaText: varchar("ctaText", { length: 128 }), // call-to-action button label
  ctaUrl: varchar("ctaUrl", { length: 512 }), // call-to-action button destination
  // Styling
  backgroundColor: varchar("backgroundColor", { length: 32 }).default("#1e3a5f").notNull(),
  textColor: varchar("textColor", { length: 32 }).default("#ffffff").notNull(),
  // Emoji or icon prefix shown before the title (e.g. "🎄" or "🇺🇸")
  emoji: varchar("emoji", { length: 16 }),
  // Activation — only one banner should be active at a time
  isActive: boolean("isActive").default(false).notNull(),
  // Optional date window; null = no restriction (always show when active)
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  // Internal label to help admins identify the banner (e.g. "July 4th 2025")
  label: varchar("label", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Banner = typeof banners.$inferSelect;
export type InsertBanner = typeof banners.$inferInsert;

// ─── Affiliate Banner Schedules ───────────────────────────────────────────────
// Each affiliate can schedule their own promotional banners (holiday, sale, etc.)
// independently from the main site banners. Multiple schedules can exist; the
// storefront shows the one whose date window is currently active.
export const affiliateBannerSchedules = mysqlTable("affiliate_banner_schedules", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliate_id").notNull(),
  message: text("message").notNull(),
  holidayKey: varchar("holiday_key", { length: 64 }),
  startDate: varchar("start_date", { length: 10 }).notNull(), // YYYY-MM-DD
  endDate: varchar("end_date", { length: 10 }).notNull(),     // YYYY-MM-DD
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type AffiliateBannerSchedule = typeof affiliateBannerSchedules.$inferSelect;
export type InsertAffiliateBannerSchedule = typeof affiliateBannerSchedules.$inferInsert;

// ─── Affiliate Promo Discounts ────────────────────────────────────────────────
// Discount badges affiliates can attach to specific door styles or categories
// on their storefront (e.g. "10% Off", "Labor Day Sale").
export const affiliatePromoDiscounts = mysqlTable("affiliate_promo_discounts", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId").notNull(),
  label: varchar("label", { length: 128 }).notNull(),
  targetType: varchar("targetType", { length: 32 }).notNull().default("style"),
  targetId: int("targetId"),
  discountBps: int("discountBps").default(0).notNull(),
  startsAt: timestamp("startsAt"),
  endsAt: timestamp("endsAt"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AffiliatePromoDiscount = typeof affiliatePromoDiscounts.$inferSelect;
export type InsertAffiliatePromoDiscount = typeof affiliatePromoDiscounts.$inferInsert;

// ─── Master SKU Alias Program ─────────────────────────────────────────────────
// Maps secondary/alias SKU codes to a canonical master code so that different
// supplier codes for the same cabinet resolve to one product record.

export const skuMasterAliases = mysqlTable("sku_master_aliases", {
  id: int("id").autoincrement().primaryKey(),
  // The secondary code that should resolve to the master
  aliasCode: varchar("aliasCode", { length: 64 }).notNull().unique(),
  // The canonical master code this alias points to
  masterCode: varchar("masterCode", { length: 64 }).notNull(),
  // Optional notes about why this alias was created
  notes: text("notes"),
  // Conflict status: 'ok' = clean mapping, 'conflict' = alias appeared in multiple roles
  conflictStatus: mysqlEnum("conflictStatus", ["ok", "conflict"]).default("ok").notNull(),
  // Audit trail
  createdBy: int("createdBy"), // user id of admin who approved the merge
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SkuMasterAlias = typeof skuMasterAliases.$inferSelect;
export type InsertSkuMasterAlias = typeof skuMasterAliases.$inferInsert;

// AI-generated duplicate suggestions awaiting human review
export const skuMergeSuggestions = mysqlTable("sku_merge_suggestions", {
  id: int("id").autoincrement().primaryKey(),
  // The code that looks like a duplicate (candidate alias)
  aliasCode: varchar("aliasCode", { length: 64 }).notNull(),
  // The code it should map to (candidate master)
  masterCode: varchar("masterCode", { length: 64 }).notNull(),
  // 0-100 similarity score from the AI
  similarityScore: int("similarityScore").notNull(),
  // Human-readable explanation from the AI
  reason: text("reason"),
  // pending = awaiting review, approved = merged, dismissed = false positive
  status: mysqlEnum("status", ["pending", "approved", "dismissed"]).default("pending").notNull(),
  // Who reviewed it and when
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SkuMergeSuggestion = typeof skuMergeSuggestions.$inferSelect;
export type InsertSkuMergeSuggestion = typeof skuMergeSuggestions.$inferInsert;

// Configurable matching rules that guide the AI similarity detection
export const skuMatchingRules = mysqlTable("sku_matching_rules", {
  id: int("id").autoincrement().primaryKey(),
  ruleName: varchar("ruleName", { length: 128 }).notNull(),
  description: text("description"),
  // Weight 1-10: how much this rule contributes to the overall similarity score
  weight: int("weight").default(5).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SkuMatchingRule = typeof skuMatchingRules.$inferSelect;
export type InsertSkuMatchingRule = typeof skuMatchingRules.$inferInsert;

// ─── Cabinet Categories & Sub-Categories ─────────────────────────────────────
// Admin-managed list of categories and sub-categories for cabinetry.
// Replaces hardcoded arrays so the admin can add/edit/remove from the UI.

export const cabinetCategories = mysqlTable("cabinet_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CabinetCategory = typeof cabinetCategories.$inferSelect;
export type InsertCabinetCategory = typeof cabinetCategories.$inferInsert;

export const cabinetSubCategories = mysqlTable("cabinet_sub_categories", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(), // FK to cabinet_categories.id
  name: varchar("name", { length: 128 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CabinetSubCategory = typeof cabinetSubCategories.$inferSelect;
export type InsertCabinetSubCategory = typeof cabinetSubCategories.$inferInsert;


// ─── AI-generated 3D cabinet previews (cached per cabinet + door style) ──────
// When a shopper taps a cabinet on the product detail page, we generate a
// photorealistic 3D render in their chosen door style/color. Results are cached
// here so the same combination never regenerates.
export const cabinet3dPreviews = mysqlTable("cabinet_3d_previews", {
  id: int("id").autoincrement().primaryKey(),
  cabinetId: int("cabinetId").notNull(),       // FK to cabinets.id
  styleId: int("styleId").notNull(),           // FK to door_styles.id
  imageUrl: varchar("imageUrl", { length: 512 }).notNull(), // S3 URL of the generated image
  prompt: text("prompt"),                       // The prompt used (for debugging/regeneration)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Cabinet3dPreview = typeof cabinet3dPreviews.$inferSelect;
export type InsertCabinet3dPreview = typeof cabinet3dPreviews.$inferInsert;
