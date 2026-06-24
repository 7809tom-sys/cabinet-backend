import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
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
  role: mysqlEnum("role", ["user", "admin", "distributor", "dealer", "partner"]).default("user").notNull(),
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
  costMultiplier: decimal("costMultiplier", { precision: 5, scale: 4 }).notNull(), // 0.30, 0.38, 0.35
  tariffRate: decimal("tariffRate", { precision: 5, scale: 4 }).default("0").notNull(),
  shippingRate: decimal("shippingRate", { precision: 5, scale: 4 }).default("0").notNull(),
  warehouseZips: json("warehouseZips").$type<string[]>(),
  leadTimeDays: int("leadTimeDays").default(7),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Distributor = typeof distributors.$inferSelect;

// ─── Door Styles ──────────────────────────────────────────────────────────────

export const doorStyles = mysqlTable("door_styles", {
  id: int("id").autoincrement().primaryKey(),
  distributorId: int("distributorId").notNull(),
  styleCode: varchar("styleCode", { length: 32 }).notNull(), // ASP, SW, GR
  ourName: varchar("ourName", { length: 128 }).notNull(), // Lumina White (white-label brand name)
  distributorName: varchar("distributorName", { length: 128 }).notNull(), // Aspen White
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
  roomSceneImageUrl: varchar("roomSceneImageUrl", { length: 512 }),
  thumbnailImageUrl: varchar("thumbnailImageUrl", { length: 512 }),
  // Admin merchandising (80/20): which styles get pushed in the Featured row.
  // featuredRank orders them (lower = first); UI enforces a max of 30 featured.
  isFeatured: boolean("isFeatured").default(false).notNull(),
  featuredRank: int("featuredRank").default(0).notNull(),
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
  hingeSide: varchar("hingeSide", { length: 16 }), // left, right, both, none
  doorSwingClearance: decimal("doorSwingClearance", { precision: 5, scale: 2 }),
  toeKickHeight: decimal("toeKickHeight", { precision: 5, scale: 2 }),
  stackingAllowed: boolean("stackingAllowed").default(false),
  isCornerCabinet: boolean("isCornerCabinet").default(false),
  cornerSide: varchar("cornerSide", { length: 16 }), // left, right
  fillerRequired: boolean("fillerRequired").default(false),
  // Blind corner specific
  openingWidth: decimal("openingWidth", { precision: 5, scale: 2 }),
  minPull: decimal("minPull", { precision: 5, scale: 2 }),
  maxPull: decimal("maxPull", { precision: 5, scale: 2 }),
  // 2D graphic
  graphicType: varchar("graphicType", { length: 64 }), // base_1door, wall_2door, etc.
  // Catalog line-art image (20/20 catalog renders, keyed by code). Falls back to code-drawn SVG.
  catalogImageUrl: varchar("catalogImageUrl", { length: 512 }),
  // Packaging
  pkgLength: decimal("pkgLength", { precision: 6, scale: 2 }),
  pkgWidth: decimal("pkgWidth", { precision: 6, scale: 2 }),
  pkgHeight: decimal("pkgHeight", { precision: 6, scale: 2 }),
  isActive: boolean("isActive").default(true).notNull(),
  // Conflict / Needs-Review status. When 'conflict', the product is held in the
  // admin back office only and hidden from the public catalog, storefront and
  // the Design Tool palette until an admin reviews and clears it. Used for
  // products whose identity/spec we are unsure about (e.g. skin/panel SKUs).
  conflictStatus: varchar("conflictStatus", { length: 16 }).default("none").notNull(), // none | conflict
  conflictReason: text("conflictReason"),
  conflictedAt: timestamp("conflictedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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
  source: mysqlEnum("source", ["ocr", "csv", "design", "manual"]).default("manual").notNull(),
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
  confirmedAt: timestamp("confirmedAt"),
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
  aboutText: text("aboutText"), // "about this store" blurb on storefront
  serviceArea: varchar("serviceArea", { length: 256 }), // e.g. "Sarasota County & surrounding"
  yearsInBusiness: int("yearsInBusiness"),
  facebookUrl: varchar("facebookUrl", { length: 512 }),
  instagramUrl: varchar("instagramUrl", { length: 512 }),
  storefrontEnabled: boolean("storefrontEnabled").default(true).notNull(),
  // Storefront layout template variant
  template: mysqlEnum("template", ["classic", "showcase", "minimal", "craftsman"]).default("classic").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Affiliate = typeof affiliates.$inferSelect;
export type InsertAffiliate = typeof affiliates.$inferInsert;

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

// ─── Build-an-Order code aliases ───────────────────────────────────────────────
// Remembers a human's manual "Fix"/swap choice so an unrecognized order code
// resolves automatically next time. Keyed by the CANONICALIZED raw code (uppercase
// alphanumerics only) so spacing/dash/case variants of the same token collapse to
// one entry. The mapping always points at a real cabinet; the admin retains the
// ability to override or re-point it later.
export const codeAliases = mysqlTable("code_aliases", {
  id: int("id").autoincrement().primaryKey(),
  rawCodeCanon: varchar("rawCodeCanon", { length: 128 }).notNull().unique(),
  rawCodeSample: varchar("rawCodeSample", { length: 128 }).notNull(),
  cabinetId: int("cabinetId").notNull(),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

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
  // Placeholder for a future live carrier/broker API key (e.g. Freightquote / C.H.
  // Robinson). When set + provider!="estimator", the live provider is used.
  liveProvider: varchar("liveProvider", { length: 64 }).default("estimator").notNull(),
  liveApiKey: varchar("liveApiKey", { length: 255 }),
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
