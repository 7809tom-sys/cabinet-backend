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
  index,
  foreignKey,
  unique,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { AFFILIATE_STOREFRONT_TEMPLATE_IDS } from "../shared/affiliateStorefrontTemplates";
import type { AffiliateSocialLink } from "../shared/affiliateSocialLinks";
import type { AffiliateResourceMeta } from "../shared/affiliateResources";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  // Email/password auth (alongside Manus OAuth). emailLower is the unique login key.
  emailLower: varchar("emailLower", { length: 320 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  // Supabase Auth user id (auth.users.id, a UUID). Null until the user is linked.
  authId: varchar("authId", { length: 36 }).unique(),
  failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "distributor", "dealer", "partner", "designer", "sales_rep", "contractor"]).default("user").notNull(),
  distributorId: int("distributorId"), // set for role=distributor: which supply line this user manages
  // Every approved vendor contact can log in, including a vendor whose source
  // catalog has not been linked to a distributor line yet. This is the scoped
  // Approved Vendors record they may edit; it never grants cross-vendor access.
  approvedVendorLineId: int("approvedVendorLineId"),
  // Pricing tier the OWNER assigns after seeing the customer on the site (Tawk.to ping).
  // Drives which price column the user sees/checks out at. Default homeowner until changed.
  pricingTier: mysqlEnum("pricingTier", ["homeowner", "contractor", "wholesale"]).default("homeowner").notNull(),
  // Optional credentials captured so the owner can decide a tier (business name etc.)
  companyName: varchar("companyName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  // Storefront that created this account. Set once; never overwritten.
  // Null means the account was not opened on an affiliate store (house / direct).
  signupAffiliateId: int("signupAffiliateId"),
}, (t) => ({
  signupAffiliateIdx: index("users_signup_affiliate_idx").on(t.signupAffiliateId),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── One-time password reset links ──────────────────────────────────────────
// Only a SHA-256 digest of the email-delivered token is persisted. A reset link
// may be consumed once and expires after the short window set by emailAuth.
export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    userIndex: index("password_reset_tokens_user_idx").on(t.userId),
    expiresIndex: index("password_reset_tokens_expires_idx").on(t.expiresAt),
  }),
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// ─── Customer favorites ───────────────────────────────────────────────────────
// Favorites are scoped by storefront slug so a customer can save different
// cabinet families for the main site and for each white-label affiliate store.
export const customerFavorites = mysqlTable(
  "customer_favorites",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    storefrontSlug: varchar("storefrontSlug", { length: 160 }).notNull().default("main"),
    styleId: int("styleId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    userStoreStyleUnique: uniqueIndex("customer_favorites_user_store_style_uq").on(
      t.userId,
      t.storefrontSlug,
      t.styleId
    ),
    userStoreIndex: index("customer_favorites_user_store_idx").on(t.userId, t.storefrontSlug),
  })
);

export type CustomerFavorite = typeof customerFavorites.$inferSelect;
export type InsertCustomerFavorite = typeof customerFavorites.$inferInsert;

// One row per user/storefront records the most recent successful account sync,
// including removals where no remaining favorite row would carry a new timestamp.
export const customerFavoriteSyncs = mysqlTable(
  "customer_favorite_syncs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    storefrontSlug: varchar("storefrontSlug", { length: 160 }).notNull().default("main"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    userStoreUnique: uniqueIndex("customer_favorite_syncs_user_store_uq").on(
      t.userId,
      t.storefrontSlug
    ),
  })
);

export type CustomerFavoriteSync = typeof customerFavoriteSyncs.$inferSelect;

// ─── Customer Preferred catalog products ─────────────────────────────────────
// Product preferences are distinct from cabinet-style favorites. They retain the
// exact product identity and functional role that the Designer needs; the API
// enforces the six-product limit independently in every category.
export const customerPreferredProducts = mysqlTable(
  "customer_preferred_products",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    storefrontSlug: varchar("storefrontSlug", { length: 160 }).notNull().default("main"),
    productId: int("productId").notNull(),
    category: mysqlEnum("category", ["flooring", "countertop", "backsplash", "faucet", "sink"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    userStoreProductUnique: uniqueIndex("customer_preferred_products_user_store_product_uq").on(
      t.userId,
      t.storefrontSlug,
      t.productId,
    ),
    userStoreCategoryIndex: index("customer_preferred_products_user_store_category_idx").on(
      t.userId,
      t.storefrontSlug,
      t.category,
    ),
  }),
);

export type CustomerPreferredProduct = typeof customerPreferredProducts.$inferSelect;
export type InsertCustomerPreferredProduct = typeof customerPreferredProducts.$inferInsert;

// ─── Final photo-quality Designer renders ────────────────────────────────────
export type PhotoRenderMaterialProvenance = {
  role: "cabinet" | "countertop" | "flooring" | "backsplash" | "faucet" | "sink";
  productId: number | null;
  name: string | null;
  materialImageUrl: string | null;
};

export type PhotoRenderProvenance = {
  contractVersion: "exact-plan-v1";
  designId: number;
  designRevision: string | null;
  /** SHA-256 of the canonical persisted plan payload used to prove a current saved view. */
  planFingerprint: string;
  geometryLock: string;
  camera: { position: [number, number, number]; target: [number, number, number]; zoom: number };
  materials: PhotoRenderMaterialProvenance[];
  sourceImageHash: string;
  generationMethod: "manual-final-review-image-service" | "manual-final-review-gpt-image-2-high-v2" | "manual-final-review-deterministic-webgl-v1" | "manual-final-review-gemini-nano-banana-v1";
};

// A render is created only by an explicit final-review confirmation. The combined
// plan, presentation, selected products, and camera signature makes a prior image
// reusable while any relevant design change requires a deliberate new request.
export const designPhotoRenders = mysqlTable(
  "design_photo_renders",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    /** Optional saved-plan anchor; required for persisted administrator image-test retrieval. */
    kitchenDesignId: int("kitchenDesignId"),
    sceneSignature: varchar("sceneSignature", { length: 191 }).notNull(),
    imageUrl: varchar("imageUrl", { length: 512 }).notNull(),
    /** Immutable input audit record for renders created after exact-plan-v1. */
    provenance: json("provenance").$type<PhotoRenderProvenance | null>(),
    sourceImageHash: varchar("sourceImageHash", { length: 64 }),
    promptFingerprint: varchar("promptFingerprint", { length: 64 }),
    generationMethod: varchar("generationMethod", { length: 96 }),
    confirmedAt: timestamp("confirmedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    userSceneUnique: uniqueIndex("design_photo_renders_user_scene_uq").on(t.userId, t.sceneSignature),
    userUpdatedIndex: index("design_photo_renders_user_updated_idx").on(t.userId, t.updatedAt),
    userDesignMethodUpdatedIndex: index("design_photo_renders_user_design_method_updated_idx").on(t.userId, t.kitchenDesignId, t.generationMethod, t.updatedAt),
  }),
);

export type DesignPhotoRender = typeof designPhotoRenders.$inferSelect;

// ─── Administrator Google image-test jobs ───────────────────────────────────
// Stores only the provider interaction identifier and immutable saved-plan
// provenance needed to resume a browser-safe administrator comparison. Source
// pixels and raw provider payloads remain outside the database.
export const designGeminiImageTestJobs = mysqlTable(
  "design_gemini_image_test_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    kitchenDesignId: int("kitchenDesignId").notNull(),
    designRevision: varchar("designRevision", { length: 191 }).notNull(),
    planFingerprint: varchar("planFingerprint", { length: 64 }).notNull(),
    sceneSignature: varchar("sceneSignature", { length: 191 }).notNull(),
    interactionId: varchar("interactionId", { length: 255 }).notNull(),
    // A queued job owns a locked JPEG in storage and can be started by the
    // persistent server after the initiating browser request has returned.
    status: mysqlEnum("status", ["queued", "pending", "completed", "failed"]).notNull().default("queued"),
    retryCount: int("retryCount").notNull().default(0),
    nextRetryAt: timestamp("nextRetryAt"),
    errorMessage: varchar("errorMessage", { length: 255 }),
    imageUrl: varchar("imageUrl", { length: 512 }),
    sourceImageKey: varchar("sourceImageKey", { length: 512 }),
    provenance: json("provenance").$type<PhotoRenderProvenance>().notNull(),
    promptFingerprint: varchar("promptFingerprint", { length: 64 }).notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    interactionUnique: uniqueIndex("design_gemini_image_test_jobs_interaction_uq").on(t.interactionId),
    userDesignStatusIndex: index("design_gemini_image_test_jobs_user_design_status_idx").on(t.userId, t.kitchenDesignId, t.status, t.updatedAt),
  }),
);

export type DesignGeminiImageTestJob = typeof designGeminiImageTestJobs.$inferSelect;

// ─── Verified customer plan-image requests ──────────────────────────────────
// This table stores only the minimum lead, verification, locked-plan, and result
// state needed to control an image request. It never stores an OTP, a provider
// credential, or raw provider payloads.
export const designImageRequests = mysqlTable("design_image_requests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  kitchenDesignId: int("kitchenDesignId").notNull(),
  designRevision: varchar("designRevision", { length: 64 }).notNull(),
  planFingerprint: varchar("planFingerprint", { length: 64 }).notNull(),
  sceneSignature: varchar("sceneSignature", { length: 191 }).notNull(),
  provenance: json("provenance").$type<PhotoRenderProvenance>().notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phoneE164: varchar("phoneE164", { length: 32 }).notNull(),
  phoneHash: varchar("phoneHash", { length: 64 }).notNull(),
  consentAt: timestamp("consentAt").notNull(),
  verificationStatus: mysqlEnum("verificationStatus", ["pending", "verified", "expired", "failed", "provider_unavailable"]).notNull().default("pending"),
  verificationProvider: varchar("verificationProvider", { length: 32 }).notNull().default("twilio_verify"),
  verificationSid: varchar("verificationSid", { length: 128 }),
  verificationRequestedAt: timestamp("verificationRequestedAt"),
  verifiedAt: timestamp("verifiedAt"),
  generationStatus: mysqlEnum("generationStatus", ["blocked", "ready", "generating", "completed", "failed"]).notNull().default("blocked"),
  designPhotoRenderId: int("designPhotoRenderId"),
  imageUrl: varchar("imageUrl", { length: 512 }),
  imageReadyEmailSentAt: timestamp("imageReadyEmailSentAt"),
  // Manual AI render review: the locked plan reference board and instructions are
  // prepared only after phone verification and are attached to the same request.
  // The completed image is accepted only by an administrator after plan-integrity
  // validation, then reuses imageUrl/designPhotoRenderId for customer delivery.
  manualHandoffBoardUrl: varchar("manualHandoffBoardUrl", { length: 512 }),
  manualHandoffPrompt: text("manualHandoffPrompt"),
  manualHandoffPreparedAt: timestamp("manualHandoffPreparedAt"),
  manualHandoffEmailSentAt: timestamp("manualHandoffEmailSentAt"),
  manualHandoffCrmEventId: int("manualHandoffCrmEventId"),
  // Dedicated CRM record for internal manual image review. This connects the
  // verified request to the Image Review lane without deriving a deal from
  // customer-entered data after verification.
  crmDealId: int("crmDealId"),
  manualResultAttachedAt: timestamp("manualResultAttachedAt"),
  manualResultAttachedBy: int("manualResultAttachedBy"),
  crmDeliveredAt: timestamp("crmDeliveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  sceneSignatureUnique: uniqueIndex("design_image_requests_scene_signature_uq").on(t.sceneSignature),
  designRevisionIndex: index("design_image_requests_design_revision_idx").on(t.kitchenDesignId, t.designRevision),
  userUpdatedIndex: index("design_image_requests_user_updated_idx").on(t.userId, t.updatedAt),
  phoneStatusIndex: index("design_image_requests_phone_status_idx").on(t.phoneHash, t.verificationStatus),
  crmDealIndex: index("design_image_requests_crm_deal_idx").on(t.crmDealId),
}));

export type DesignImageRequest = typeof designImageRequests.$inferSelect;

// ─── Administrator shared notes ──────────────────────────────────────────────
// Internal coordination only. Every API path is protected by adminProcedure;
// author attribution is retained so staff can follow up on a note.
export const adminStickyNotes = mysqlTable(
  "admin_sticky_notes",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 120 }),
    body: text("body").notNull(),
    color: varchar("color", { length: 16 }).notNull().default("yellow"),
    isPinned: boolean("isPinned").notNull().default(false),
    authorId: int("authorId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    pinAndUpdatedIndex: index("admin_sticky_notes_pin_updated_idx").on(t.isPinned, t.updatedAt),
    authorIndex: index("admin_sticky_notes_author_idx").on(t.authorId),
  }),
);

export type AdminStickyNote = typeof adminStickyNotes.$inferSelect;
export type InsertAdminStickyNote = typeof adminStickyNotes.$inferInsert;

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
  // Effective landed-cost factor applied to the distributor's list price to get OUR cost.
  // It is the audit/display result of baseMultiplier × (1 + freightMultiplier).
  // The actual persisted SKU cost rounds the base cost before applying tariff/freight.
  costMultiplier: decimal("costMultiplier", { precision: 5, scale: 4 }).notNull(), // 0.30, 0.38, 0.35
  // Two-part landed-cost inputs: base is the core cost fraction of list; freight is
  // the tariff/freight rate applied to that core cost. Example: 0.23 × 1.07 = 0.2461.
  baseMultiplier: decimal("baseMultiplier", { precision: 5, scale: 4 }).default("0").notNull(),
  freightMultiplier: decimal("freightMultiplier", { precision: 5, scale: 4 }).default("0").notNull(),
  tariffRate: decimal("tariffRate", { precision: 5, scale: 4 }).default("0").notNull(),
  shippingRate: decimal("shippingRate", { precision: 5, scale: 4 }).default("0").notNull(),
  // Determines the public customer price for the line. The default retains the
  // platform's controlled cost-plus tier ladder; source_list preserves the
  // distributor's verified published list price exactly as retail.
  retailPriceBasis: mysqlEnum("retailPriceBasis", ["cost_plus_tier", "source_list"]).default("cost_plus_tier").notNull(),
  warehouseZips: json("warehouseZips").$type<string[]>(),
  // Distributor shipping overlay. The master catalog remains product truth; each
  // distributor supplies only its fulfillment location and freight policy.
  warehouseName: varchar("warehouseName", { length: 128 }),
  warehouseAddress: varchar("warehouseAddress", { length: 512 }),
  shippingRuleMode: mysqlEnum("shippingRuleMode", ["live", "fixed", "threshold"]).default("live").notNull(),
  shippingFlatFreightFeeCents: int("shippingFlatFreightFeeCents"),
  shippingFreeFreightThresholdCents: int("shippingFreeFreightThresholdCents"),
  shippingZipRates: json("shippingZipRates").$type<Array<{ zipPrefix: string; feeCents: number }>>(),
  shippingExceptions: text("shippingExceptions"),
  // Glass front policy for every glass-related catalog SKU (PG, GD, or terminal
  // G). True means the listed cabinet price includes its glass; false means the
  // cabinet/door is sold without the glass insert and the design/cart must say so.
  // Default false prevents an unverified supplier line from promising glass.
  glassIncluded: boolean("glassIncluded").default(false).notNull(),
  // Vendor inventory forecast: null intentionally means "TBD / not configured".
  // Rates are basis points (for example 6000 = 60%) and may only be edited by an admin.
  inventoryForecastCloseRateBps: int("inventoryForecastCloseRateBps"),
  inventoryForecastLowRateBps: int("inventoryForecastLowRateBps"),
  inventoryForecastHighRateBps: int("inventoryForecastHighRateBps"),
  leadTimeDays: int("leadTimeDays").default(7),
  inventoryLastSyncAt: timestamp("inventoryLastSyncAt"),
  inventoryLastSyncSource: varchar("inventoryLastSyncSource", { length: 16 }),
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
  // Approved render color and the color-gate reference. Wins over the name fallback when set.
  renderHex: varchar("renderHex", { length: 7 }),
  // raised | recessed-shaker | slab | glass. Null keeps distributor parsing.
  doorShape: varchar("doorShape", { length: 32 }),
  boxConstruction: varchar("boxConstruction", { length: 128 }),
  drawerConstruction: varchar("drawerConstruction", { length: 128 }),
  hardware: varchar("hardware", { length: 128 }),
  frameSize: varchar("frameSize", { length: 32 }),
  overlayType: varchar("overlayType", { length: 64 }),
  doorPanelType: varchar("doorPanelType", { length: 64 }),
  warehouseZip: varchar("warehouseZip", { length: 16 }),
  // Ordered private origin ZIPs for this specific cabinet line. warehouseZip
  // remains the legacy primary value for integrations that accept one origin.
  warehouseZips: json("warehouseZips").$type<string[]>(),
  shippingRate: decimal("shippingRate", { precision: 5, scale: 4 }),
  // Optional whole-order Plan B freight charge for this distributor/style.
  // It is used only when that style group's live carrier request fails;
  // Operations markup and configured Plan B accessorials apply separately.
  flatFreightFeeCents: int("flatFreightFeeCents"),
  doorSampleImageUrl: varchar("doorSampleImageUrl", { length: 512 }),
  // Separate photo of just the drawer front (no door below). Used by the
  // elevation renderer to show the correct texture on drawer bands.
  drawerSampleImageUrl: varchar("drawerSampleImageUrl", { length: 512 }),
  // True once an admin (or an approved field correction) has verified the
  // sample photo is the correct door for this style. Drives the green check.
  doorSampleVerified: boolean("doorSampleVerified").default(false).notNull(),
  // Same rule as doorSampleVerified, for the separate drawer-front photo.
  // A vendor upload does not set this; an admin verification does.
  drawerSampleVerified: boolean("drawerSampleVerified").default(false).notNull(),
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
  // Renderable, catalog-backed profile details. They drive physical 3D faces;
  // vendor sample measurements remain the source of truth for their values.
  panelConstruction: varchar("panelConstruction", { length: 24 }),       // raised, flat, slab, or glass
  bevelWidth: decimal("bevelWidth", { precision: 4, scale: 2 }),         // inset/raised panel bevel width in inches
  bevelDepth: decimal("bevelDepth", { precision: 4, scale: 2 }),         // positive panel projection (inches)
  insideEdgeProfile: varchar("insideEdgeProfile", { length: 64 }),       // ogee, bevel, square, bead, etc.
  drawerFrontType: varchar("drawerFrontType", { length: 32 }),           // five-piece-raised, five-piece-flat, slab
  grainDirection: varchar("grainDirection", { length: 64 }),             // vertical-stiles-horizontal-rails, vertical, none
  finishSheen: varchar("finishSheen", { length: 24 }),                   // satin, matte, gloss
  profileNotes: varchar("profileNotes", { length: 256 }),                // free-text e.g. "Ogee profile", "Beaded inner edge"
  profileDescription: text("profileDescription"),                        // long-form educational description shown on public Door Styles page
  // A verified manufacturer specification may describe a future/price-pending
  // finish before a sellable supplier line is published. Keep that source fact
  // visible on the Door Styles page without letting it enter Catalog or Designer.
  specificationStatus: mysqlEnum("specificationStatus", ["purchasable", "availability_pending", "coming_soon"]).default("purchasable").notNull(),
  sourceSpecification: varchar("sourceSpecification", { length: 512 }),
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

// ─── Vendor Sample Door Measurements ─────────────────────────────────────────
// A supplier can enter the exact measurements from a physical sample door, but
// those measurements do not become Designer geometry until CabinetDealz has
// measured the delivered sample and approved the single submission below.
// `measurementData` mirrors the owner-supplied sample-door sheet so the whole
// source record is preserved without pretending that incomplete fields are true.
export const doorStyleMeasurementSubmissions = mysqlTable("door_style_measurement_submissions", {
  id: int("id").autoincrement().primaryKey(),
  styleId: int("styleId").notNull(),
  distributorId: int("distributorId").notNull(),
  vendorLineName: varchar("vendorLineName", { length: 255 }).notNull(),
  vendorStyleCode: varchar("vendorStyleCode", { length: 64 }).notNull(),
  vendorStyleName: varchar("vendorStyleName", { length: 255 }).notNull(),
  // The submitting vendor can explicitly declare that the same physical profile
  // applies to selected companion door styles in its own cabinet line.
  appliesToStyleIds: json("appliesToStyleIds").$type<number[]>().notNull(),
  measuredBy: varchar("measuredBy", { length: 255 }).notNull(),
  measuredOn: varchar("measuredOn", { length: 10 }).notNull(), // ISO YYYY-MM-DD supplied by vendor
  measurementData: json("measurementData").$type<Record<string, unknown>>().notNull(),
  citation: varchar("citation", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  submittedBy: int("submittedBy").notNull(),
  submittedByName: varchar("submittedByName", { length: 255 }),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedByName: varchar("reviewedByName", { length: 255 }),
  reviewedAt: timestamp("reviewedAt"),
  reviewNote: varchar("reviewNote", { length: 512 }),
}, (table) => [
  index("door_style_measurements_style_status_idx").on(table.styleId, table.status),
  index("door_style_measurements_distributor_status_idx").on(table.distributorId, table.status),
]);

export type DoorStyleMeasurementSubmission = typeof doorStyleMeasurementSubmissions.$inferSelect;

// In-progress sample-door sheets are separate from submissions so incomplete
// work never enters the CabinetDealz verification queue.
export const doorStyleMeasurementDrafts = mysqlTable("door_style_measurement_drafts", {
  id: int("id").autoincrement().primaryKey(),
  styleId: int("styleId").notNull(),
  distributorId: int("distributorId").notNull(),
  savedBy: int("savedBy").notNull(),
  savedByName: varchar("savedByName", { length: 255 }),
  appliesToStyleIds: json("appliesToStyleIds").$type<number[]>().notNull(),
  measuredBy: varchar("measuredBy", { length: 255 }).notNull().default(""),
  measuredOn: varchar("measuredOn", { length: 10 }).notNull(),
  measurementData: json("measurementData").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("door_style_measurement_drafts_owner_style_idx").on(table.styleId, table.distributorId, table.savedBy),
  index("door_style_measurement_drafts_owner_idx").on(table.savedBy, table.updatedAt),
]);

export type DoorStyleMeasurementDraft = typeof doorStyleMeasurementDrafts.$inferSelect;

// ─── Door Style Room Scenes ─────────────────────────────────────────────────
// Images remain in S3. This table retains only a scene's durable storage
// reference, ordering, and private verification/source details.
export const doorStyleRoomScenes = mysqlTable("door_style_room_scenes", {
  id: int("id").autoincrement().primaryKey(),
  styleId: int("styleId").notNull(),
  imageUrl: varchar("imageUrl", { length: 512 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  // Photos that share a scene name are one named room (Kitchen, Bathroom, or a custom name).
  sceneName: varchar("sceneName", { length: 128 }).default("Room").notNull(),
  sceneDescription: varchar("sceneDescription", { length: 512 }),
  sceneSortOrder: int("sceneSortOrder").default(0).notNull(),
  isCover: boolean("isCover").default(false).notNull(),
  taggedCabinetIds: json("taggedCabinetIds").$type<number[]>(),
  taggedStyleIds: json("taggedStyleIds").$type<number[]>(),
  isVerified: boolean("isVerified").default(false).notNull(),
  sourceNote: varchar("sourceNote", { length: 512 }),
  sourceDistributorId: int("sourceDistributorId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("door_style_room_scenes_style_idx").on(table.styleId, table.sortOrder),
  index("door_style_room_scenes_scene_idx").on(table.styleId, table.sceneName, table.sceneSortOrder),
]);

export type DoorStyleRoomScene = typeof doorStyleRoomScenes.$inferSelect;
export type InsertDoorStyleRoomScene = typeof doorStyleRoomScenes.$inferInsert;

// One automatic room-scene job per door style. The stored image URLs are the
// verified pair that produced the current status, so re-verifying that pair
// does not create a second scene.
export const doorStyleRoomSceneGenerations = mysqlTable("door_style_room_scene_generations", {
  id: int("id").autoincrement().primaryKey(),
  styleId: int("styleId").notNull(),
  status: mysqlEnum("status", ["pending", "generating", "ready", "failed"]).notNull().default("pending"),
  doorImageUrl: varchar("doorImageUrl", { length: 512 }).notNull(),
  drawerImageUrl: varchar("drawerImageUrl", { length: 512 }).notNull(),
  claimToken: varchar("claimToken", { length: 64 }),
  sceneId: int("sceneId"),
  imageUrl: varchar("imageUrl", { length: 512 }),
  errorMessage: varchar("errorMessage", { length: 512 }),
  attemptCount: int("attemptCount").notNull().default(0),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("door_style_room_scene_generations_style_uidx").on(table.styleId),
]);

export type DoorStyleRoomSceneGeneration = typeof doorStyleRoomSceneGenerations.$inferSelect;
export type InsertDoorStyleRoomSceneGeneration = typeof doorStyleRoomSceneGenerations.$inferInsert;

// ─── Door rendering audit ────────────────────────────────────────────────────
// Append-only. A new designer render inserts a version row and never updates
// or deletes an older one. Accept, reject, and revert are events; the current
// accepted render is the latest accepted or reverted event for that style.

export const doorRenderingAuditRuns = mysqlTable("door_rendering_audit_runs", {
  id: int("id").autoincrement().primaryKey(),
  scope: mysqlEnum("scope", ["all", "changed", "selected"]).notNull(),
  status: mysqlEnum("status", ["awaiting_renders", "scoring", "completed", "failed", "cancelled"]).notNull().default("awaiting_renders"),
  requestedBy: int("requestedBy").notNull(),
  requestedByName: varchar("requestedByName", { length: 255 }),
  renderingCommit: varchar("renderingCommit", { length: 128 }),
  styleCap: int("styleCap").notNull().default(40),
  selectedCount: int("selectedCount").notNull().default(0),
  pendingCount: int("pendingCount").notNull().default(0),
  scoredCount: int("scoredCount").notNull().default(0),
  failedCount: int("failedCount").notNull().default(0),
  flaggedCount: int("flaggedCount").notNull().default(0),
  skippedUnchangedCount: int("skippedUnchangedCount").notNull().default(0),
  skippedMissingSampleCount: int("skippedMissingSampleCount").notNull().default(0),
  errorMessage: varchar("errorMessage", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => [
  index("door_rendering_audit_runs_created_idx").on(table.createdAt),
  index("door_rendering_audit_runs_status_idx").on(table.status, table.createdAt),
]);

export type DoorRenderingAuditRun = typeof doorRenderingAuditRuns.$inferSelect;
export type InsertDoorRenderingAuditRun = typeof doorRenderingAuditRuns.$inferInsert;

export const doorRenderingAuditResults = mysqlTable("door_rendering_audit_results", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  styleId: int("styleId").notNull(),
  status: mysqlEnum("status", ["pending_render", "scoring", "scored", "failed"]).notNull().default("pending_render"),
  renderingCommit: varchar("renderingCommit", { length: 128 }),
  samplePhotoUrl: varchar("samplePhotoUrl", { length: 512 }).notNull(),
  renderImageUrl: varchar("renderImageUrl", { length: 512 }),
  versionId: int("versionId"),
  woodGrainScore: int("woodGrainScore"),
  colorScore: int("colorScore"),
  textureSheenScore: int("textureSheenScore"),
  profileEdgesScore: int("profileEdgesScore"),
  overallScore: int("overallScore"),
  acceptedOverallScore: int("acceptedOverallScore"),
  scoreDelta: int("scoreDelta"),
  verdict: mysqlEnum("verdict", ["pending", "flagged", "not_flagged", "no_baseline", "failed"]).notNull().default("pending"),
  notes: varchar("notes", { length: 512 }),
  errorMessage: varchar("errorMessage", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  scoredAt: timestamp("scoredAt"),
}, (table) => [
  uniqueIndex("door_rendering_audit_results_run_style_uq").on(table.runId, table.styleId),
  index("door_rendering_audit_results_style_idx").on(table.styleId, table.createdAt),
]);

export type DoorRenderingAuditResult = typeof doorRenderingAuditResults.$inferSelect;
export type InsertDoorRenderingAuditResult = typeof doorRenderingAuditResults.$inferInsert;

export const doorRenderingVersions = mysqlTable("door_rendering_versions", {
  id: int("id").autoincrement().primaryKey(),
  styleId: int("styleId").notNull(),
  runId: int("runId"),
  renderingCommit: varchar("renderingCommit", { length: 128 }),
  samplePhotoUrl: varchar("samplePhotoUrl", { length: 512 }).notNull(),
  renderImageUrl: varchar("renderImageUrl", { length: 512 }).notNull(),
  renderImageKey: varchar("renderImageKey", { length: 512 }),
  woodGrainScore: int("woodGrainScore").notNull(),
  colorScore: int("colorScore").notNull(),
  textureSheenScore: int("textureSheenScore").notNull(),
  profileEdgesScore: int("profileEdgesScore").notNull(),
  overallScore: int("overallScore").notNull(),
  acceptedOverallScore: int("acceptedOverallScore"),
  scoreDelta: int("scoreDelta"),
  verdict: mysqlEnum("verdict", ["flagged", "not_flagged", "no_baseline"]).notNull(),
  notes: varchar("notes", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("door_rendering_versions_style_created_idx").on(table.styleId, table.createdAt),
  index("door_rendering_versions_run_idx").on(table.runId),
]);

export type DoorRenderingVersion = typeof doorRenderingVersions.$inferSelect;
export type InsertDoorRenderingVersion = typeof doorRenderingVersions.$inferInsert;

export const doorRenderingVersionEvents = mysqlTable("door_rendering_version_events", {
  id: int("id").autoincrement().primaryKey(),
  styleId: int("styleId").notNull(),
  versionId: int("versionId").notNull(),
  action: mysqlEnum("action", ["accepted", "rejected", "reverted"]).notNull(),
  actorUserId: int("actorUserId").notNull(),
  note: varchar("note", { length: 512 }),
  previousAcceptedVersionId: int("previousAcceptedVersionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("door_rendering_version_events_style_idx").on(table.styleId, table.createdAt),
  index("door_rendering_version_events_version_idx").on(table.versionId, table.createdAt),
]);

export type DoorRenderingVersionEvent = typeof doorRenderingVersionEvents.$inferSelect;
export type InsertDoorRenderingVersionEvent = typeof doorRenderingVersionEvents.$inferInsert;

// ─── Cabinet Items (GENERIC_INFO) ─────────────────────────────────────────────

export const cabinets = mysqlTable("cabinets", {
  id: int("id").autoincrement().primaryKey(),
  masterCode: varchar("masterCode", { length: 64 }).notNull().unique(), // DB-24-3, B-24, etc.
  description: text("description").notNull(),
  descriptionSource: varchar("descriptionSource", { length: 64 }), // US Cabinet Depot, Clark & Son, Research
  /** Plain-English homeowner description (master sheet 2026-10-03, rule 13). */
  homeownerDescription: text("homeownerDescription"),
  /** Owner's original wording before the 2026-10-03 description rewrite (kept, never overwritten). */
  originalDescription: text("originalDescription"),
  category: varchar("category", { length: 64 }).notNull(), // Base, Wall, Tall, ADA, Vanity, Accessory
  subCategory: varchar("subCategory", { length: 128 }), // Drawer Base, Sink Base, etc.
  // Three decimal places preserve printed 1/8-inch supplier geometry (e.g. 15-1/8").
  width: decimal("width", { precision: 7, scale: 3 }),
  height: decimal("height", { precision: 7, scale: 3 }),
  depth: decimal("depth", { precision: 7, scale: 3 }),
  physicalWidth: decimal("physicalWidth", { precision: 7, scale: 3 }),
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
  // Maximum interior opening height in inches for built-in appliance fit.
  openingHeight: decimal("openingHeight", { precision: 5, scale: 2 }),
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
  // Catalog-item offer. Lives on the cabinet master, next to package facts,
  // because one product can have many supplier price rows. Default off so
  // existing cabinets stay on quoted freight. Not a distributor freight rule.
  freeShipping: boolean("freeShipping").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  // Conflict / Needs-Review status.
  // 'conflict' hides the product from the public catalog, storefront, and Design Tool.
  // 'review' lists it in the same admin Conflicts tab and leaves the row public.
  conflictStatus: varchar("conflictStatus", { length: 16 }).default("none").notNull(), // none | review | conflict
  conflictReason: text("conflictReason"),
  conflictedAt: timestamp("conflictedAt"),
  // Catalog columns an admin resolved in Cabinet Conflicts. Spreadsheet imports
  // skip these fields so the resolved value stays the source of truth.
  importLockedFields: json("importLockedFields").$type<string[]>(),
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
  // Admin mark for the 3D Designer product list. False by default so a new
  // row stays out of the Designer until an admin turns it on. The migration
  // backfills existing rows that already have a published price and can be
  // rendered or placed.
  designerEligible: boolean("designerEligible").default(false).notNull(),
  showIn2020: boolean("showIn2020").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  configuredAt: timestamp("configuredAt"),
  // Admin review: mark a cabinet as fully verified (all fields checked)
  configVerified: boolean("configVerified").default(false).notNull(),
  configVerifiedAt: timestamp("configVerifiedAt"),
  configVerifiedByName: varchar("configVerifiedByName", { length: 128 }),
  // Cabinet style: how the cabinet looks (closed doors vs open shelves, etc.)
  cabinetStyle: varchar("cabinetStyle", { length: 32 }).default("closedDoors"), // closedDoors | openShelf | glass | etc
  // Product type for categorization: standard cabinet, end-cap, corner, specialty, accessory
  productType: varchar("productType", { length: 32 }).default("standard"), // standard | endCap | corner | specialty | accessory
  // Door orientation for multi-door cabinets: side-by-side (horizontal) or stacked (vertical)
  doorOrientation: varchar("doorOrientation", { length: 16 }), // side-by-side | stacked | null
  // How many doors appear side-by-side in a single row (null = auto-detect from numberOfDoors)
  doorsPerRow: int("doorsPerRow"),
  // Drawer layout JSON: array of rows [{count: number, height?: number}]
  // Each row defines how many drawers are side-by-side; height is optional (equal split if omitted)
  drawerLayout: text("drawerLayout"), // JSON string, e.g. [{"count":2},{"count":1,"height":8}]
  // Panel grain direction: vertical (up/down) or horizontal (left/right)
  grainDirection: varchar("grainDirection", { length: 16 }), // vertical | horizontal | null
  // Whether this panel uses the door style image (decorative door panel vs flat plywood)
  isDecorativeDoor: boolean("isDecorativeDoor").default(false),
  // Layout spec JSON: ordered array of sections top-to-bottom
  // e.g. [{"type":"drawer","count":1},{"type":"door","count":2}]
  // Supported types: "drawer" | "door" | "shelf"
  // When null, renderer auto-detects from description/subCategory
  layoutSpec: text("layoutSpec"),
  // Generic line-drawing image from the Capital spec book (family-level, not SKU-specific)
  specImageUrl: varchar("specImageUrl", { length: 512 }),
  // Bullet-point notes from the spec book (e.g. rollout shelf weight limit, flat-pack box count)
  specNotes: text("specNotes"),
  // Face pattern for specialty open-front cabinets (wine racks, plate racks, etc.)
  // null = standard door/drawer rendering; set to override with a decorative open-face pattern
  facePattern: mysqlEnum("facePattern", ["slats", "criss-cross", "lattice", "open"]),
  // Glass door add-on: the masterCode of the separate glass door SKU that can be added to this cabinet.
  // When set, the designer shows an "Add Glass Door" button that adds this SKU to the cart
  // and toggles the glass-door rendering on the placed cabinet.
  glassDoorAddonCode: varchar("glassDoorAddonCode", { length: 64 }),
});

export type Cabinet = typeof cabinets.$inferSelect;

// ─── Cabinet Aliases ───────────────────────────────────────────────────────────────────
// When a cabinet's masterCode is changed, the old code is preserved here
// so existing designs, orders, and links that reference the old code continue to resolve.
export const cabinetAliases = mysqlTable("cabinet_aliases", {
  id: int("id").autoincrement().primaryKey(),
  cabinetId: int("cabinetId").notNull(),
  alias: varchar("alias", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uniqAlias: unique().on(t.alias),
}));

export type CabinetAlias = typeof cabinetAliases.$inferSelect;

// ─── Catalog Imports (20/20 XML) ───────────────────────────────────────────────
// Tracks all uploaded 20/20 catalog zip files, their import status, and error logs.
// One row per upload; multiple uploads from the same distributor create separate rows.
export const catalogImports = mysqlTable("catalog_imports", {
  id: int("id").autoincrement().primaryKey(),
  distributorId: int("distributorId").notNull(), // which distributor this catalog belongs to
  fileName: varchar("fileName", { length: 255 }).notNull(), // e.g., "UCDCA26_1.zip"
  fileSize: int("fileSize"), // bytes
  // Import status: pending → processing → completed | failed
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  // Counts: how many cabinets were created/updated/skipped in this import
  cabinetCount: int("cabinetCount").default(0).notNull(),
  skuCount: int("skuCount").default(0).notNull(),
  imageCount: int("imageCount").default(0).notNull(),
  // Error log: JSON array of {code, message, details} for any issues during import
  errorLog: text("errorLog"), // JSON string
  // Preserve pricing toggle: if true, existing prices are NOT overwritten during import
  preservePricing: boolean("preservePricing").default(true).notNull(),
  // Rollback capability: if true, the import can be rolled back (undoing all changes)
  isRollbackable: boolean("isRollbackable").default(true).notNull(),
  // Timestamps
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  importStartedAt: timestamp("importStartedAt"),
  importCompletedAt: timestamp("importCompletedAt"),
  uploadedByUserId: int("uploadedByUserId"),
  uploadedByName: varchar("uploadedByName", { length: 128 }),
  // Vendor-facing file archive. The bytes live in first-party storage; these
  // fields let the owning distributor download the exact file they uploaded.
  fileKey: varchar("fileKey", { length: 512 }),
  fileUrl: varchar("fileUrl", { length: 512 }),
});

export type CatalogImport = typeof catalogImports.$inferSelect;
export type InsertCatalogImport = typeof catalogImports.$inferInsert;

// ─── Vendor onboarding exceptions ────────────────────────────────────────────
// One import, then one row per spreadsheet line. Matched rows point at a
// master cabinet. Flagged rows wait for the vendor. Completed rows are the
// exceptions an admin still has to approve; reviewCabinetId is that cabinet,
// stored with conflictStatus "review" so it stays usable and is not a
// verified master.
export const vendorOnboardingImports = mysqlTable("vendor_onboarding_imports", {
  id: int("id").autoincrement().primaryKey(),
  distributorId: int("distributorId").notNull(),
  fileName: varchar("fileName", { length: 255 }),
  uploadedByUserId: int("uploadedByUserId"),
  matchedCount: int("matchedCount").default(0).notNull(),
  flaggedCount: int("flaggedCount").default(0).notNull(),
  completedCount: int("completedCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  distributorCreatedIdx: index("vendor_onboarding_imports_distributor_idx").on(t.distributorId, t.createdAt),
}));

export type VendorOnboardingImport = typeof vendorOnboardingImports.$inferSelect;
export type InsertVendorOnboardingImport = typeof vendorOnboardingImports.$inferInsert;

export const vendorOnboardingRows = mysqlTable("vendor_onboarding_rows", {
  id: int("id").autoincrement().primaryKey(),
  importId: int("importId").notNull(),
  distributorId: int("distributorId").notNull(),
  rowNumber: int("rowNumber").notNull(),
  rawSku: varchar("rawSku", { length: 128 }).notNull(),
  normalizedSku: varchar("normalizedSku", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["matched", "flagged", "completed"]).notNull(),
  flagReason: mysqlEnum("flagReason", ["unknown_sku", "ambiguous", "missing_special"]),
  missingFields: json("missingFields").$type<string[]>(),
  cabinetId: int("cabinetId"),
  masterCode: varchar("masterCode", { length: 64 }),
  matchedVia: varchar("matchedVia", { length: 16 }),
  candidateMasterCodes: json("candidateMasterCodes").$type<string[]>(),
  reviewCabinetId: int("reviewCabinetId"),
  distributorName: varchar("distributorName", { length: 128 }),
  styleName: varchar("styleName", { length: 128 }),
  colorName: varchar("colorName", { length: 64 }),
  price: decimal("price", { precision: 10, scale: 2 }),
  styleId: int("styleId"),
  skuId: int("skuId"),
  category: varchar("category", { length: 64 }),
  subCategory: varchar("subCategory", { length: 128 }),
  width: decimal("width", { precision: 7, scale: 3 }),
  height: decimal("height", { precision: 7, scale: 3 }),
  depth: decimal("depth", { precision: 7, scale: 3 }),
  description: text("description"),
  numberOfDoors: int("numberOfDoors"),
  numberOfDrawers: int("numberOfDrawers"),
  trimSupplierId: int("trimSupplierId"),
  trimHeld: boolean("trimHeld").default(false).notNull(),
  message: varchar("message", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  importRowUnique: unique("vendor_onboarding_rows_import_row_uq").on(t.importId, t.rowNumber),
  importStatusIdx: index("vendor_onboarding_rows_import_status_idx").on(t.importId, t.status),
  distributorStatusIdx: index("vendor_onboarding_rows_distributor_status_idx").on(t.distributorId, t.status),
}));

export type VendorOnboardingRow = typeof vendorOnboardingRows.$inferSelect;
export type InsertVendorOnboardingRow = typeof vendorOnboardingRows.$inferInsert;

// ─── Distributor integrations ───────────────────────────────────────────────
// One row per distributor/provider connection. Secret values are authenticated
// encrypted envelopes, never returned to the browser. Non-secret metadata is
// intentionally generic so Pelican and future distributors can use the same
// portal without schema churn.
export const distributorIntegrations = mysqlTable(
  "distributor_integrations",
  {
    id: int("id").autoincrement().primaryKey(),
    distributorId: int("distributorId").notNull(),
    integrationType: mysqlEnum("integrationType", ["inventory", "shipping"]).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    displayName: varchar("displayName", { length: 128 }).notNull(),
    baseUrl: varchar("baseUrl", { length: 512 }),
    accountNumber: varchar("accountNumber", { length: 128 }),
    clientId: varchar("clientId", { length: 255 }),
    apiKeyEncrypted: varchar("apiKeyEncrypted", { length: 2048 }),
    clientSecretEncrypted: varchar("clientSecretEncrypted", { length: 2048 }),
    username: varchar("username", { length: 255 }),
    passwordEncrypted: varchar("passwordEncrypted", { length: 2048 }),
    authHeaderName: varchar("authHeaderName", { length: 128 }),
    environment: mysqlEnum("environment", ["sandbox", "production"]).default("production").notNull(),
    isEnabled: boolean("isEnabled").default(false).notNull(),
    /** Administrator gate for customer-facing live quotes. Vendors cannot set this. */
    adminEnabled: boolean("adminEnabled").default(false).notNull(),
    lastVerifiedAt: timestamp("lastVerifiedAt"),
    lastError: varchar("lastError", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    distributorProviderUnique: uniqueIndex("distributor_integrations_dist_type_provider_uq").on(
      t.distributorId,
      t.integrationType,
      t.provider,
    ),
    distributorIndex: index("distributor_integrations_distributor_idx").on(t.distributorId),
  }),
);

export type DistributorIntegration = typeof distributorIntegrations.$inferSelect;
export type InsertDistributorIntegration = typeof distributorIntegrations.$inferInsert;

export const distributorIntegrationEvents = mysqlTable(
  "distributor_integration_events",
  {
    id: int("id").autoincrement().primaryKey(),
    integrationId: int("integrationId").notNull(),
    distributorId: int("distributorId").notNull(),
    eventType: varchar("eventType", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    message: varchar("message", { length: 512 }),
    responseMs: int("responseMs"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    integrationIndex: index("distributor_integration_events_integration_idx").on(t.integrationId, t.createdAt),
    distributorIndex: index("distributor_integration_events_distributor_idx").on(t.distributorId, t.createdAt),
  }),
);

export type DistributorIntegrationEvent = typeof distributorIntegrationEvents.$inferSelect;
export type InsertDistributorIntegrationEvent = typeof distributorIntegrationEvents.$inferInsert;

// ─── Distributor SKU Mapping ───────────────────────────────────────────────────

export const distributorSkus = mysqlTable("distributor_skus", {
  id: int("id").autoincrement().primaryKey(),
  // Pending vendor submissions may not yet be mapped to a master cabinet.
  cabinetId: int("cabinetId"),
  distributorId: int("distributorId").notNull(),
  styleId: int("styleId").notNull(),
  platformSku: varchar("platformSku", { length: 128 }).notNull().unique(), // DB24-SW-UCD
  distributorSku: varchar("distributorSku", { length: 128 }).notNull(), // 3DB24
  // Distributor-specific construction and printed geometry. Shared cabinet
  // masters remain unchanged when a supplier's construction differs.
  constructionType: varchar("constructionType", { length: 32 }), // framed | frameless
  // Source drawings may express dimensions in eighths of an inch.
  geometryWidth: decimal("geometryWidth", { precision: 7, scale: 3 }),
  geometryHeight: decimal("geometryHeight", { precision: 7, scale: 3 }),
  geometryDepth: decimal("geometryDepth", { precision: 7, scale: 3 }),
  geometryToeKickHeight: decimal("geometryToeKickHeight", { precision: 5, scale: 2 }),
  geometrySourcePage: varchar("geometrySourcePage", { length: 128 }),
  geometryStatus: varchar("geometryStatus", { length: 16 }), // verified | held
  listPrice: decimal("listPrice", { precision: 10, scale: 2 }),
  yourCost: decimal("yourCost", { precision: 10, scale: 2 }),
  adjustedListPrice: decimal("adjustedListPrice", { precision: 10, scale: 2 }),
  wholesalePrice: decimal("wholesalePrice", { precision: 10, scale: 2 }),
  contractorPrice: decimal("contractorPrice", { precision: 10, scale: 2 }),
  homeownerPrice: decimal("homeownerPrice", { precision: 10, scale: 2 }),
  // Optional vendor-fed current inventory. Null means the supplier has not
  // supplied on-hand data; zero remains a valid reported inventory level.
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
  /** Vendor-entered wholesale. Retail is this × pricing_settings.homeownerMarkupBps at read time. */
  vendorWholesale: decimal("vendorWholesale", { precision: 10, scale: 2 }),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  isPublished: boolean("isPublished").default(true).notNull(), // distributor visibility toggle
  // SKU-level image (per cabinet + door style). Falls back to door-style image, then drawing.
  imageUrl: varchar("imageUrl", { length: 512 }),
  // The original vendor upload is retained separately from the normalized
  // product art shown on the site.
  sourceImageUrl: varchar("sourceImageUrl", { length: 512 }),
  imageRerenderStatus: varchar("imageRerenderStatus", { length: 16 }), // completed | failed
  imageRerenderedAt: timestamp("imageRerenderedAt"),
  // Vendor portal: new product submission status (existing products default to 'approved')
  status: mysqlEnum("status", ["approved", "pending", "rejected"]).default("approved").notNull(),
  // PO-only fields (internal; never shown to customers)
  supplierCabinetName: varchar("supplierCabinetName", { length: 255 }), // distributor's own cabinet name on the PO
  // A source-owned unmatched item remains pending until its required description
  // and physical package details are supplied; never fabricate a master cabinet.
  supplierDescription: text("supplierDescription"),
  pkgLength: decimal("pkgLength", { precision: 6, scale: 2 }),
  pkgWidth: decimal("pkgWidth", { precision: 6, scale: 2 }),
  pkgHeight: decimal("pkgHeight", { precision: 6, scale: 2 }),
  pkgWeight: decimal("pkgWeight", { precision: 8, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  // Prevent duplicate SKU rows for the same cabinet+distributor+style combo.
  // Without this, re-importing a price list would create new rows instead of updating.
  uniqDistCabStyle: unique("dist_cab_style_uniq").on(t.distributorId, t.cabinetId, t.styleId),
}));

export type DistributorSku = typeof distributorSkus.$inferSelect;

// ─── Non-cabinet vendor products ─────────────────────────────────────────────
// These never borrow cabinet geometry, a door style, or a Designer placement.
// They support suppliers of appliances, hardware, fixtures, flooring, and other
// merchandise alongside the cabinet-catalog import path.
export const vendorProducts = mysqlTable("vendor_products", {
  id: int("id").autoincrement().primaryKey(),
  distributorId: int("distributorId").notNull(),
  vendorSku: varchar("vendorSku", { length: 128 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 128 }),
  // Source-backed product-family metadata. Only populated for suppliers that
  // provide structured variant information (currently Hardware Resources).
  // Exact vendorSku remains the purchasing, price, availability, and cart key.
  hardwareCollection: varchar("hardwareCollection", { length: 128 }),
  hardwareProductType: varchar("hardwareProductType", { length: 128 }),
  hardwareFinish: varchar("hardwareFinish", { length: 128 }),
  hardwareConfigurationKey: varchar("hardwareConfigurationKey", { length: 128 }),
  hardwareConfigurationLabel: varchar("hardwareConfigurationLabel", { length: 512 }),
  listPrice: decimal("listPrice", { precision: 10, scale: 2 }),
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
  imageUrl: varchar("imageUrl", { length: 512 }),
  pkgLength: decimal("pkgLength", { precision: 6, scale: 2 }),
  pkgWidth: decimal("pkgWidth", { precision: 6, scale: 2 }),
  pkgHeight: decimal("pkgHeight", { precision: 6, scale: 2 }),
  pkgWeight: decimal("pkgWeight", { precision: 8, scale: 2 }),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  status: mysqlEnum("status", ["approved", "pending", "rejected"]).default("pending").notNull(),
  isPublished: boolean("isPublished").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  lineSkuUnique: uniqueIndex("vendor_products_line_sku_uq").on(t.distributorId, t.vendorSku),
  lineStatusIndex: index("vendor_products_line_status_idx").on(t.distributorId, t.status),
  hardwareConfigurationIndex: index("vendor_products_hardware_configuration_idx").on(
    t.distributorId,
    t.hardwareCollection,
    t.hardwareProductType,
    t.hardwareConfigurationKey,
  ),
}));

export type VendorProduct = typeof vendorProducts.$inferSelect;

// ─── Hardware Resources commerce controls ───────────────────────────────────
// Decorative hardware is a separate product class. It receives one explicit,
// administrator-maintained consolidated parcel profile; it never reuses cabinet
// pallet assumptions or fabricates an origin, carton, or parcel charge.
export const hardwareShippingProfiles = mysqlTable("hardware_shipping_profiles", {
  id: int("id").autoincrement().primaryKey(),
  distributorId: int("distributorId").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  originZip: varchar("originZip", { length: 16 }),
  packageLengthIn: decimal("packageLengthIn", { precision: 6, scale: 2 }),
  packageWidthIn: decimal("packageWidthIn", { precision: 6, scale: 2 }),
  packageHeightIn: decimal("packageHeightIn", { precision: 6, scale: 2 }),
  packageWeightLbs: decimal("packageWeightLbs", { precision: 8, scale: 2 }),
  maxUnitsPerPackage: int("maxUnitsPerPackage"),
  standaloneShippingCents: int("standaloneShippingCents"),
  sourceReference: varchar("sourceReference", { length: 512 }),
  profileRevision: int("profileRevision").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  distributorUnique: uniqueIndex("hardware_shipping_profiles_distributor_uq").on(t.distributorId),
}));

export type HardwareShippingProfile = typeof hardwareShippingProfiles.$inferSelect;

// One immutable record is created only after a paid affiliate order is confirmed.
// It preserves the actual hardware sale base, the affiliate-selected list markup,
// and the approved 25% commission rate; later setting changes cannot rewrite it.
export const affiliateHardwareCommissionSnapshots = mysqlTable("affiliate_hardware_commission_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  orderRequestId: int("orderRequestId").notNull(),
  affiliateId: int("affiliateId").notNull(),
  hardwareMerchandiseCents: int("hardwareMerchandiseCents").notNull(),
  hardwareCostCents: int("hardwareCostCents").notNull(),
  affiliateMarkupBps: int("affiliateMarkupBps").notNull(),
  commissionRateBps: int("commissionRateBps").notNull().default(2500),
  commissionCents: int("commissionCents").notNull(),
  confirmedAt: timestamp("confirmedAt").defaultNow().notNull(),
}, (t) => ({
  orderUnique: uniqueIndex("affiliate_hardware_commission_snapshots_order_uq").on(t.orderRequestId),
  affiliateConfirmedIndex: index("affiliate_hardware_commission_snapshots_affiliate_confirmed_idx").on(t.affiliateId, t.confirmedAt),
}));

export type AffiliateHardwareCommissionSnapshot = typeof affiliateHardwareCommissionSnapshots.$inferSelect;

// ─── Cabinet Distributor Eligibility ────────────────────────────────────────
// This internal administrator-maintained relationship records that a
// distributor may carry a master cabinet. It deliberately does not infer a
// sellable SKU, door style, availability, publication state, or price.
export const cabinetDistributorEligibility = mysqlTable("cabinet_distributor_eligibility", {
  id: int("id").autoincrement().primaryKey(),
  cabinetId: int("cabinetId").notNull(),
  distributorId: int("distributorId").notNull(),
  source: varchar("source", { length: 64 }).default("Distributor catalog import").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqueCabinetDistributor: unique("cabinet_distributor_eligibility_unique").on(t.cabinetId, t.distributorId),
  cabinetLookup: index("cabinet_distributor_eligibility_cabinet_idx").on(t.cabinetId),
  distributorLookup: index("cabinet_distributor_eligibility_distributor_idx").on(t.distributorId),
}));

export type CabinetDistributorEligibility = typeof cabinetDistributorEligibility.$inferSelect;

// ─── Room Shape & Starter Layout Presets ──────────────────────────────────────
// Presets describe reusable room geometry and functional zones. They never copy
// products, pricing, or vendor SKU data from the existing catalog.
export const roomShapePresets = mysqlTable("room_shape_presets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  roomType: varchar("roomType", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  geometryTemplate: json("geometryTemplate").$type<object>().notNull(),
  defaultDimensions: json("defaultDimensions").$type<object>(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  roomTypeNameUnique: uniqueIndex("room_shape_presets_room_type_name_uq").on(t.roomType, t.name),
}));
export type RoomShapePreset = typeof roomShapePresets.$inferSelect;
export type InsertRoomShapePreset = typeof roomShapePresets.$inferInsert;

export const layoutPresets = mysqlTable("layout_presets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  roomShapePresetId: varchar("roomShapePresetId", { length: 64 }).notNull(),
  roomType: varchar("roomType", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  thumbnailUrl: varchar("thumbnailUrl", { length: 512 }),
  minimumWidth: decimal("minimumWidth", { precision: 6, scale: 2 }),
  minimumDepth: decimal("minimumDepth", { precision: 6, scale: 2 }),
  defaultRoomData: json("defaultRoomData").$type<object>(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  shapeNameUnique: uniqueIndex("layout_presets_room_shape_name_uq").on(t.roomShapePresetId, t.name),
  shapeFk: foreignKey({
    name: "lp_shape_fk",
    columns: [t.roomShapePresetId],
    foreignColumns: [roomShapePresets.id],
  }).onDelete("restrict").onUpdate("cascade"),
}));
export type LayoutPreset = typeof layoutPresets.$inferSelect;
export type InsertLayoutPreset = typeof layoutPresets.$inferInsert;

export const layoutPresetZones = mysqlTable("layout_preset_zones", {
  id: int("id").autoincrement().primaryKey(),
  layoutPresetId: varchar("layoutPresetId", { length: 64 }).notNull(),
  zoneKey: varchar("zoneKey", { length: 64 }).notNull(),
  label: varchar("label", { length: 128 }).notNull(),
  wallKey: varchar("wallKey", { length: 64 }),
  sequence: int("sequence").default(0).notNull(),
  placementType: varchar("placementType", { length: 32 }).notNull(),
  requiredCategory: varchar("requiredCategory", { length: 64 }),
  requiredSubCategory: varchar("requiredSubCategory", { length: 128 }),
  requiredProductType: varchar("requiredProductType", { length: 32 }),
  requiredCornerType: varchar("requiredCornerType", { length: 50 }),
  minWidth: decimal("minWidth", { precision: 6, scale: 2 }),
  targetWidth: decimal("targetWidth", { precision: 6, scale: 2 }),
  maxWidth: decimal("maxWidth", { precision: 6, scale: 2 }),
  minHeight: decimal("minHeight", { precision: 6, scale: 2 }),
  maxHeight: decimal("maxHeight", { precision: 6, scale: 2 }),
  minDepth: decimal("minDepth", { precision: 6, scale: 2 }),
  maxDepth: decimal("maxDepth", { precision: 6, scale: 2 }),
  isRequired: boolean("isRequired").default(true).notNull(),
  allowCustomSize: boolean("allowCustomSize").default(false).notNull(),
  preferredMasterCode: varchar("preferredMasterCode", { length: 64 }),
  matchingRules: json("matchingRules").$type<object>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  layoutZoneKeyUnique: uniqueIndex("layout_preset_zones_layout_key_uq").on(t.layoutPresetId, t.zoneKey),
  layoutSequenceIndex: index("layout_preset_zones_sequence_ix").on(t.layoutPresetId, t.sequence),
  layoutFk: foreignKey({
    name: "lpz_layout_fk",
    columns: [t.layoutPresetId],
    foreignColumns: [layoutPresets.id],
  }).onDelete("cascade").onUpdate("cascade"),
}));
export type LayoutPresetZone = typeof layoutPresetZones.$inferSelect;
export type InsertLayoutPresetZone = typeof layoutPresetZones.$inferInsert;

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
  // A non-null owner keeps affiliate-storefront designs and plans isolated from
  // the Cabinet Dealz house pipeline and attaches them to that affiliate CRM.
  affiliateId: int("affiliateId"),
  // Set when a contractor assigns this owner-scope plan to one of their customers.
  contractorCustomerId: int("contractorCustomerId"),
  name: varchar("name", { length: 256 }).notNull(),
  // Master Project grouping: several rooms (kitchen + baths + laundry) can share
  // one projectName, becoming a single job. roomLabel names the room within the
  // project ("Master Bath"), roomType drives its designer palette.
  projectName: varchar("projectName", { length: 256 }),
  roomLabel: varchar("roomLabel", { length: 256 }),
  roomType: varchar("roomType", { length: 32 }),
  roomData: json("roomData").$type<object>(), // walls, dimensions
  placedCabinets: json("placedCabinets").$type<object[]>(), // [{cabinetId, x, y, rotation, styleId}]
  designSchemaVersion: int("designSchemaVersion").default(1).notNull(),
  layoutSource: varchar("layoutSource", { length: 32 }),
  layoutPresetId: varchar("layoutPresetId", { length: 64 }),
  layoutPresetVersion: int("layoutPresetVersion"),
  // Pelican surface & fixture picks (flooring, backsplash, countertop, sink,
  // faucet) chosen in the Surfaces palette tab. Persisted so a reloaded design
  // restores its exact surfaces (cart + 3D gate + 2D render fill).
  selectedSurfaces: json("selectedSurfaces").$type<object[]>(),
  // Presentation-only cabinet/countertop swatches selected in the interactive
  // 3D view. These do not alter the ordered distributor SKU or catalog pricing.
  threeDPresentation: json("threeDPresentation").$type<object>(),
  selectedStyleId: int("selectedStyleId"),
  selectedDistributorId: int("selectedDistributorId"),
  /** Optional trim toggles and stick-count overrides. Absent on older plans. */
  trimSettings: json("trimSettings").$type<{
    crown?: boolean;
    toeKick?: boolean;
    batten?: boolean;
    lightRail?: boolean;
    valance?: boolean;
    qty?: Partial<Record<"crown" | "toeKick" | "batten" | "lightRail" | "valance", number>>;
  }>(),
  thumbnailUrl: varchar("thumbnailUrl", { length: 512 }),
  // Assisted edits keep the customer's design id. "suggested" is a designer copy
  // attached to the same project; the original row is never moved or deleted.
  recordKind: mysqlEnum("recordKind", ["customer", "suggested"]).default("customer").notNull(),
  suggestionOfDesignId: int("suggestionOfDesignId"),
  assistLabel: varchar("assistLabel", { length: 160 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  layoutPresetFk: foreignKey({
    name: "kd_layout_fk",
    columns: [t.layoutPresetId],
    foreignColumns: [layoutPresets.id],
  }).onDelete("set null").onUpdate("cascade"),
}));

// Public 3D preview links use an unguessable token and a presentation snapshot.
// The snapshot intentionally excludes user/contact details and remains separate
// from the editable saved-design record.
export const threeDRoomShares = mysqlTable("three_d_room_shares", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 48 }).notNull(),
  kitchenDesignId: int("kitchenDesignId"),
  configuration: json("configuration").$type<object>().notNull(),
  orderSubtotal: decimal("orderSubtotal", { precision: 10, scale: 2 }),
  thumbnailKey: varchar("thumbnailKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  tokenUnique: uniqueIndex("three_d_room_shares_token_uq").on(t.token),
  designFk: foreignKey({
    name: "3drs_design_fk",
    columns: [t.kitchenDesignId],
    foreignColumns: [kitchenDesigns.id],
  }).onDelete("set null").onUpdate("cascade"),
}));
export type ThreeDRoomShare = typeof threeDRoomShares.$inferSelect;
export type InsertThreeDRoomShare = typeof threeDRoomShares.$inferInsert;

// ─── Saved Design Layout Resolution ───────────────────────────────────────────
// Normalized audit records for the preset that started a design and the exact
// real distributor SKU that resolved each functional starter-layout zone.
export const designLayoutInstances = mysqlTable("design_layout_instances", {
  id: int("id").autoincrement().primaryKey(),
  kitchenDesignId: int("kitchenDesignId").notNull(),
  roomShapePresetId: varchar("roomShapePresetId", { length: 64 }),
  roomShapeVersion: int("roomShapeVersion"),
  layoutPresetId: varchar("layoutPresetId", { length: 64 }),
  layoutPresetVersion: int("layoutPresetVersion"),
  source: mysqlEnum("source", ["wizard", "manual", "image_import", "consultant", "bundle"])
    .default("manual").notNull(),
  resolutionStatus: mysqlEnum("resolutionStatus", ["draft", "partially_resolved", "resolved", "needs_review"])
    .default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  designUnique: uniqueIndex("design_layout_instances_design_uq").on(t.kitchenDesignId),
  // Preserve the accepted name already created by the partial migration.
  designFk: foreignKey({
    name: "design_layout_instances_kitchenDesignId_kitchen_designs_id_fk",
    columns: [t.kitchenDesignId],
    foreignColumns: [kitchenDesigns.id],
  }).onDelete("cascade").onUpdate("cascade"),
  shapeFk: foreignKey({
    name: "dli_shape_fk",
    columns: [t.roomShapePresetId],
    foreignColumns: [roomShapePresets.id],
  }).onDelete("restrict").onUpdate("cascade"),
  layoutFk: foreignKey({
    name: "dli_layout_fk",
    columns: [t.layoutPresetId],
    foreignColumns: [layoutPresets.id],
  }).onDelete("restrict").onUpdate("cascade"),
}));
export type DesignLayoutInstance = typeof designLayoutInstances.$inferSelect;
export type InsertDesignLayoutInstance = typeof designLayoutInstances.$inferInsert;

export const designLayoutZoneSelections = mysqlTable("design_layout_zone_selections", {
  id: int("id").autoincrement().primaryKey(),
  designLayoutInstanceId: int("designLayoutInstanceId").notNull(),
  layoutPresetZoneId: int("layoutPresetZoneId"),
  zoneKey: varchar("zoneKey", { length: 64 }).notNull(),
  cabinetId: int("cabinetId"),
  distributorSkuId: int("distributorSkuId"),
  distributorId: int("distributorId"),
  styleId: int("styleId"),
  placedCabinetUid: varchar("placedCabinetUid", { length: 128 }),
  status: mysqlEnum("status", ["matched", "customer_selected", "needs_selection", "unavailable", "replaced", "removed"])
    .default("needs_selection").notNull(),
  matchReason: varchar("matchReason", { length: 128 }),
  matchDetails: json("matchDetails").$type<object>(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedByUserId: int("resolvedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  instanceZoneUnique: uniqueIndex("dlzs_instance_zone_uq").on(t.designLayoutInstanceId, t.zoneKey),
  distributorSkuIndex: index("dlzs_distributor_sku_ix").on(t.distributorSkuId),
  statusIndex: index("dlzs_status_ix").on(t.status),
  instanceFk: foreignKey({ name: "dlzs_instance_fk", columns: [t.designLayoutInstanceId], foreignColumns: [designLayoutInstances.id] }).onDelete("cascade").onUpdate("cascade"),
  zoneFk: foreignKey({ name: "dlzs_zone_fk", columns: [t.layoutPresetZoneId], foreignColumns: [layoutPresetZones.id] }).onDelete("set null").onUpdate("cascade"),
  cabinetFk: foreignKey({ name: "dlzs_cab_fk", columns: [t.cabinetId], foreignColumns: [cabinets.id] }).onDelete("restrict").onUpdate("cascade"),
  skuFk: foreignKey({ name: "dlzs_sku_fk", columns: [t.distributorSkuId], foreignColumns: [distributorSkus.id] }).onDelete("restrict").onUpdate("cascade"),
  distributorFk: foreignKey({ name: "dlzs_dist_fk", columns: [t.distributorId], foreignColumns: [distributors.id] }).onDelete("restrict").onUpdate("cascade"),
  styleFk: foreignKey({ name: "dlzs_style_fk", columns: [t.styleId], foreignColumns: [doorStyles.id] }).onDelete("restrict").onUpdate("cascade"),
  userFk: foreignKey({ name: "dlzs_user_fk", columns: [t.resolvedByUserId], foreignColumns: [users.id] }).onDelete("set null").onUpdate("cascade"),
}));
export type DesignLayoutZoneSelection = typeof designLayoutZoneSelections.$inferSelect;
export type InsertDesignLayoutZoneSelection = typeof designLayoutZoneSelections.$inferInsert;

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

// Affiliate-submitted leads for vendors the platform does not carry yet.
// Reviewed by an admin from Vendor Referrals, next to Approve Vendors.
export const vendorReferrals = mysqlTable(
  "vendor_referrals",
  {
    id: int("id").autoincrement().primaryKey(),
    affiliateId: int("affiliateId").notNull(),
    submittedByUserId: int("submittedByUserId").notNull(),
    vendorName: varchar("vendorName", { length: 200 }).notNull(),
    contactName: varchar("contactName", { length: 200 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    notes: text("notes"),
    status: mysqlEnum("status", ["new", "contacted", "onboarded", "declined"]).default("new").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    statusCreatedIndex: index("vendor_referrals_status_created_idx").on(table.status, table.createdAt),
    affiliateIndex: index("vendor_referrals_affiliate_idx").on(table.affiliateId),
  }),
);

export type VendorReferral = typeof vendorReferrals.$inferSelect;
export type InsertVendorReferral = typeof vendorReferrals.$inferInsert;

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
  /** Exact supplier line used for freight and fulfillment when a cart selected one. */
  distributorId?: number | null;
  /** Non-cabinet catalog products use their own verified shipping contracts. */
  productKind?: "surface" | "hardware" | "sample" | null;
  /** Back-office sample order. Not a public catalog row. */
  sampleOfferId?: number | null;
  sampleKitId?: number | null;
  /** Exact Pelican catalog row required to verify the shipment profile used for freight. */
  pelicanProductId?: number | null;
  /** Exact Hardware Resources vendor-product row; never inferred from an SKU string. */
  vendorProductId?: number | null;
  /** Server-read supplier cost at submission; retained only for hardware commission audit. */
  hardwareUnitCostCents?: number | null;
  /** Affiliate hardware list markup locked by the server at submission. */
  hardwareMarkupBps?: number | null;
  tier?: "Wholesale" | "Contractor" | "Homeowner" | null;
  matched: boolean;
  /** Present when a vendor promotion changed this line's normal sell price. */
  promoName?: string | null;
  originalUnitPrice?: number | null;
  /** Distributor SKU captured when the line was priced. */
  distributorSku?: string | null;
  /**
   * Snapshot of distributor_skus.yourCost in dollars at order time.
   * Absent when the cost was not known yet; do not treat absence as zero.
   */
  unitDistributorCost?: number | null;
};

export const orderRequests = mysqlTable("order_requests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // null for guest/email-only originators
  // Unguessable guest confirmation credential. Null on orders created before
  // this column existed; those rows are readable by the signed-in owner or an
  // admin. New rows are not backfilled.
  accessToken: varchar("accessToken", { length: 64 }),
  // A design-originated order can unlock detailed customer documents only for
  // this exact saved plan after an approved payment is recorded.
  kitchenDesignId: int("kitchenDesignId"),
  requestNumber: varchar("requestNumber", { length: 64 }).notNull().unique(),
  originatorName: varchar("originatorName", { length: 256 }),
  originatorEmail: varchar("originatorEmail", { length: 320 }),
  originatorPhone: varchar("originatorPhone", { length: 32 }),
  zip: varchar("zip", { length: 16 }), // for future location-based availability
  shippingAddressLine1: varchar("shippingAddressLine1", { length: 256 }),
  shippingAddressLine2: varchar("shippingAddressLine2", { length: 256 }),
  shippingCity: varchar("shippingCity", { length: 128 }),
  shippingState: varchar("shippingState", { length: 64 }),
  source: mysqlEnum("source", ["ocr", "csv", "design", "manual", "barcode"]).default("manual").notNull(),
  /** standard catalog orders, or sample for back-office sample and kit orders. */
  orderKind: varchar("orderKind", { length: 16 }).default("standard").notNull(),
  projectLabel: varchar("projectLabel", { length: 256 }),
  status: mysqlEnum("status", ["draft", "submitted", "confirmed", "cancelled"]).default("draft").notNull(),
  styleId: int("styleId"), // default door style applied across lines
  styleName: varchar("styleName", { length: 128 }),
  tier: mysqlEnum("tier", ["Wholesale", "Contractor", "Homeowner"]).default("Homeowner").notNull(),
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
  deliveryLocationType: mysqlEnum("deliveryLocationType", ["business", "residential"]).default("business").notNull(),
  liftgateRequired: boolean("liftgateRequired").default(false).notNull(),
  // Exact signed freight quote accepted at submission; payment reuses this
  // server-verified amount instead of accepting a customer-entered freight value.
  freightQuoteCents: int("freightQuoteCents").default(0).notNull(),
  // Distinguishes a valid signed zero-dollar/free-freight quote from no quote.
  freightQuoteVerified: boolean("freightQuoteVerified").default(false).notNull(),
  // When pickup is chosen, which distributor's pickup location was selected.
  pickupDistributorId: int("pickupDistributorId"),
  // Sales tax: 2-letter state code, rate (decimal), and computed tax amount.
  // taxAmount is stored so historical orders reflect the rate at time of order.
  taxState: varchar("taxState", { length: 2 }),
  taxRate: decimal("taxRate", { precision: 7, scale: 6 }),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }),
  // Hosted Stripe Checkout is attached to the active order-request workflow.
  // Store only Stripe resource identifiers required for webhook reconciliation;
  // the authoritative payment details remain in Stripe.
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  paidAt: timestamp("paidAt"),
  // Official order rail: payment is confirmed by Stripe, but physical
  // fulfillment cannot begin until the affiliate and distributor complete
  // their separate review steps.
  orderRailStatus: mysqlEnum("orderRailStatus", [
    "awaiting_payment",
    "affiliate_review",
    "distributor_inventory_check",
    "affiliate_invoice_review",
    "fulfillment_authorized",
  ]).default("awaiting_payment").notNull(),
  affiliateReviewedAt: timestamp("affiliateReviewedAt"),
  affiliateReviewedByUserId: int("affiliateReviewedByUserId"),
  distributorInventoryConfirmedAt: timestamp("distributorInventoryConfirmedAt"),
  distributorInvoiceReference: varchar("distributorInvoiceReference", { length: 128 }),
  distributorInvoiceAmount: decimal("distributorInvoiceAmount", { precision: 12, scale: 2 }),
  distributorInvoiceNotes: text("distributorInvoiceNotes"),
  distributorInvoiceReceivedAt: timestamp("distributorInvoiceReceivedAt"),
  affiliateInvoiceApprovedAt: timestamp("affiliateInvoiceApprovedAt"),
  affiliateInvoiceApprovedByUserId: int("affiliateInvoiceApprovedByUserId"),
  fulfillmentAuthorizedAt: timestamp("fulfillmentAuthorizedAt"),
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
}, (t) => ({
  kitchenDesignIdx: index("order_requests_kitchen_design_idx").on(t.kitchenDesignId),
  stripeSessionUnique: uniqueIndex("order_requests_stripe_session_uq").on(t.stripeSessionId),
  kitchenDesignFk: foreignKey({
    name: "order_requests_kitchen_design_fk",
    columns: [t.kitchenDesignId],
    foreignColumns: [kitchenDesigns.id],
  }).onDelete("set null").onUpdate("cascade"),
}));

export type OrderRequest = typeof orderRequests.$inferSelect;
export type InsertOrderRequest = typeof orderRequests.$inferInsert;

// Per-line distributor cost captured when the order is placed. Nullable because
// a line can be saved before a supplier cost exists. Historical rows stay empty
// until a new order writes them; readers fall back to the live catalog cost.
export const orderRequestLineCosts = mysqlTable("order_request_line_costs", {
  id: int("id").autoincrement().primaryKey(),
  orderRequestId: int("orderRequestId").notNull(),
  lineIndex: int("lineIndex").notNull(),
  sku: varchar("sku", { length: 128 }),
  itemCode: varchar("itemCode", { length: 128 }),
  unitDistributorCost: decimal("unitDistributorCost", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  orderLineUnique: uniqueIndex("order_request_line_costs_order_line_uq").on(t.orderRequestId, t.lineIndex),
}));

export type OrderRequestLineCost = typeof orderRequestLineCosts.$inferSelect;

// Order-level shipping identity and any extra discount that is not already
// baked into the line prices. All amount columns are nullable on purpose.
export const orderRequestCommerceSnapshots = mysqlTable("order_request_commerce_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  orderRequestId: int("orderRequestId").notNull(),
  shippingCarrier: varchar("shippingCarrier", { length: 120 }),
  shippingService: varchar("shippingService", { length: 160 }),
  discountAmount: decimal("discountAmount", { precision: 12, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  orderUnique: uniqueIndex("order_request_commerce_snapshots_order_uq").on(t.orderRequestId),
}));

export type OrderRequestCommerceSnapshot = typeof orderRequestCommerceSnapshots.$inferSelect;

// ─── Affiliate installation estimates ─────────────────────────────────────────
// These belong to the installing affiliate and intentionally do not feed the
// Cabinet Dealz material-order, payment, distributor, or QBO invoice pipelines.
export type InstallationEstimateLineItem = {
  description: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  costType: "labor" | "material";
};

// Customers a contractor organizes designs under. Separate from affiliate CRM
// contacts and from the homeowner user account.
export const contractorCustomers = mysqlTable("contractor_customers", {
  id: int("id").autoincrement().primaryKey(),
  contractorUserId: int("contractorUserId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  ownerIdx: index("contractor_customers_owner_idx").on(t.contractorUserId, t.name),
}));
export type ContractorCustomer = typeof contractorCustomers.$inferSelect;
export type InsertContractorCustomer = typeof contractorCustomers.$inferInsert;

// Contractor applications. Self-service rows always have userId set.
// Affiliate-submitted rows (submittedByUserId set) may have a null userId until
// that contractorEmail signs in. Approval of a linked account sets users.role
// to contractor. Rejection leaves an existing account as a customer (role user).
export const contractorAccessRequests = mysqlTable("contractor_access_requests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  submittedByUserId: int("submittedByUserId"),
  // Store that filed or received this request. Null is Cabinet Dealz (direct)
  // or a row the backfill could not assign. affiliates.userId is not unique.
  affiliateId: int("affiliateId"),
  contractorName: varchar("contractorName", { length: 256 }),
  contractorEmail: varchar("contractorEmail", { length: 320 }),
  businessName: varchar("businessName", { length: 256 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  licenseNumber: varchar("licenseNumber", { length: 64 }),
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  userStatusIdx: index("contractor_access_requests_user_idx").on(t.userId, t.status),
  emailStatusIdx: index("contractor_access_requests_email_status_idx").on(t.contractorEmail, t.status),
  submitterIdx: index("contractor_access_requests_submitter_idx").on(t.submittedByUserId),
  affiliateIdx: index("contractor_access_requests_affiliate_idx").on(t.affiliateId),
}));
export type ContractorAccessRequest = typeof contractorAccessRequests.$inferSelect;

// Kitchen cost-sheet rates saved by a contractor. Affiliates keep theirs on
// affiliates.kitchenCostDefaultsJson. The estimator reads one or the other.
export const contractorKitchenCostDefaults = mysqlTable("contractor_kitchen_cost_defaults", {
  contractorUserId: int("contractorUserId").primaryKey(),
  defaultsJson: text("defaultsJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ContractorKitchenCostDefault = typeof contractorKitchenCostDefaults.$inferSelect;

// Per-affiliate markup over cost for contractors that affiliate submitted.
// markupBps is percent-over-cost (100 = 1.00%), not the site multiplier.
// Hand-run SQL: docs/sql/0238_affiliate_contractor_markups.tidb.sql.
// One markup per store. affiliateUserId records who saved it. A login that
// owns several stores does not share one percent across all of them.
// Hand-run SQL: docs/sql/0238 creates the user-keyed table; 0239 adds affiliateId
// and replaces the primary key so two stores can each have a row.
export const affiliateContractorMarkups = mysqlTable("affiliate_contractor_markups", {
  id: int("id").autoincrement().primaryKey(),
  affiliateUserId: int("affiliateUserId").notNull(),
  affiliateId: int("affiliateId"),
  markupBps: int("markupBps").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedByUserId: int("updatedByUserId"),
}, (t) => ({
  affiliateIdx: uniqueIndex("affiliate_contractor_markups_affiliate_idx").on(t.affiliateId),
  userIdx: index("affiliate_contractor_markups_user_idx").on(t.affiliateUserId),
}));
export type AffiliateContractorMarkup = typeof affiliateContractorMarkups.$inferSelect;

export const affiliateInstallationEstimates = mysqlTable("affiliate_installation_estimates", {
  id: int("id").autoincrement().primaryKey(),
  // Null only for a contractor-owned estimate. Affiliate rows still set this.
  affiliateId: int("affiliateId"),
  contractorUserId: int("contractorUserId"),
  orderRequestId: int("orderRequestId"),
  kitchenDesignId: int("kitchenDesignId"),
  crmDealId: int("crmDealId"),
  customerName: varchar("customerName", { length: 256 }),
  customerEmail: varchar("customerEmail", { length: 320 }),
  customerPhone: varchar("customerPhone", { length: 32 }),
  shareToken: varchar("shareToken", { length: 64 }).unique(),
  status: mysqlEnum("status", ["draft", "shared", "accepted", "cancelled"]).default("draft").notNull(),
  roomType: mysqlEnum("roomType", ["Kitchen", "Bathroom", "Laundry", "Closets"]).default("Kitchen").notNull(),
  cabinetBreakdown: json("cabinetBreakdown").$type<{ base: number; wall: number; tall: number; total: number } | null>(),
  lineItems: json("lineItems").$type<InstallationEstimateLineItem[]>().notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  markupPercent: decimal("markupPercent", { precision: 7, scale: 2 }).default("0.00").notNull(),
  markupAmount: decimal("markupAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AffiliateInstallationEstimate = typeof affiliateInstallationEstimates.$inferSelect;
export type InsertAffiliateInstallationEstimate = typeof affiliateInstallationEstimates.$inferInsert;

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
  // Single-use password setup invitation. Cleared after password creation.
  setupToken: varchar("setupToken", { length: 96 }).unique(),
  setupTokenCreatedAt: timestamp("setupTokenCreatedAt"),
  // Storefront branding
  logoUrl: varchar("logoUrl", { length: 512 }),
  // Generated-image brand protection. When enabled, affiliate-owned generated
  // images receive a deterministic logo watermark in the fixed safe corner.
  watermarkEnabled: boolean("watermarkEnabled").default(false).notNull(),
  watermarkPosition: mysqlEnum("watermarkPosition", ["bottom-right"]).default("bottom-right").notNull(),
  watermarkOpacityBps: int("watermarkOpacityBps").default(7200).notNull(),
  primaryColor: varchar("primaryColor", { length: 16 }), // hex, e.g. "#0f2a4a"
  accentColor: varchar("accentColor", { length: 16 }), // hex, e.g. "#c79a4b"
  // Public storefront contact details are distinct from the affiliate owner's
  // account email so brand setup cannot affect sign-in or account ownership.
  publicEmail: varchar("publicEmail", { length: 320 }),
  publicPhone: varchar("publicPhone", { length: 32 }),
  publicAddress: varchar("publicAddress", { length: 256 }),
  heroImageUrl: varchar("heroImageUrl", { length: 512 }),
  tagline: varchar("tagline", { length: 256 }), // hero subheading
  // Typography & shape
  fontFamily: varchar("fontFamily", { length: 64 }), // body font, e.g. "Inter" | "Lato" | "Merriweather"
  headingFont: varchar("headingFont", { length: 64 }), // heading font, e.g. "Playfair Display" | "Montserrat"
  buttonRadius: varchar("buttonRadius", { length: 16 }), // e.g. "0.375rem" | "9999px" | "0px"
  // Third-party widget embed snippet (chat, reviews, booking, etc.).
  // Two-stage: the affiliate edits `embedCodeDraft` and previews it in a
  // sandboxed iframe, then explicitly publishes it into `embedCode`. Only
  // `embedCode` is ever served to storefront visitors, so a broken or
  // half-finished snippet can never take down a live store.
  embedCodeDraft: text("embedCodeDraft"),
  embedCode: text("embedCode"),
  embedEnabled: boolean("embedEnabled").default(false).notNull(),
  taglineEs: varchar("taglineEs", { length: 256 }), // optional Spanish hero subheading
  aboutText: text("aboutText"), // "about this store" blurb on storefront
  aboutTextEs: text("aboutTextEs"), // optional Spanish "about this store" blurb
  serviceArea: varchar("serviceArea", { length: 256 }), // e.g. "Sarasota County & surrounding"
  yearsInBusiness: int("yearsInBusiness"),
  facebookUrl: varchar("facebookUrl", { length: 512 }),
  instagramUrl: varchar("instagramUrl", { length: 512 }),
  // Canonical public profile list for the storefront. facebookUrl and
  // instagramUrl are mirrored from the Facebook and Instagram entries.
  socialLinks: json("socialLinks").$type<AffiliateSocialLink[] | null>(),
  // White-label presentation. Public contact is opt-in so the account email
  // and phone are never copied onto the storefront by default.
  logoDarkUrl: varchar("logoDarkUrl", { length: 512 }),
  faviconUrl: varchar("faviconUrl", { length: 512 }),
  backgroundColor: varchar("backgroundColor", { length: 16 }),
  textColor: varchar("textColor", { length: 16 }),
  footerText: text("footerText"),
  showPublicEmail: boolean("showPublicEmail").default(false).notNull(),
  showPublicPhone: boolean("showPublicPhone").default(false).notNull(),
  showPublicAddress: boolean("showPublicAddress").default(false).notNull(),
  hidePlatformBranding: boolean("hidePlatformBranding").default(false).notNull(),
  sectionLabelsJson: text("sectionLabelsJson"),
  storefrontEnabled: boolean("storefrontEnabled").default(true).notNull(),
  // Storefront layout template variant
  template: mysqlEnum("template", AFFILIATE_STOREFRONT_TEMPLATE_IDS).default("classic").notNull(),
  // White-label markup: default % (bps) this affiliate adds on top of their
  // affiliate cost to produce the customer-facing retail price. Per-style and
  // per-category overrides live in affiliateStyleBranding / as JSON below.
  defaultMarkupBps: int("defaultMarkupBps").default(2000).notNull(), // 20% default
  // Assigned affiliate buy-cost tier. Null keeps the platform affiliate markup.
  // The tier row lives in affiliate_pricing_tiers. Hand-run SQL adds the column.
  pricingTierId: int("pricingTierId"),
  // Separate list-price markup for Decorative Hardware. It never participates in
  // cabinet or surface price calculations. The baseline is the supplier list
  // price; affiliates may set an above-list value, including zero.
  hardwareMarkupBps: int("hardwareMarkupBps").default(0).notNull(),
  // Optional per-category markup overrides, JSON: { "base": 2500, "wall": 1500 }
  categoryMarkupJson: text("categoryMarkupJson"),
  // Kitchen Cost Sheet default unit prices, JSON keyed by the exact sheet row:
  // [{ description, materialUnitCost, laborUnitCost }]. These are affiliate
  // installation defaults and never alter Cabinet Dealz catalog pricing.
  kitchenCostDefaultsJson: text("kitchenCostDefaultsJson"),
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
  w9TaxId: varchar("w9TaxId", { length: 512 }),               // AES-GCM envelope; never a plaintext SSN/EIN
  w9TaxIdLast4: varchar("w9TaxIdLast4", { length: 4 }),       // display-only last four digits
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

// Admin-defined affiliate buy-cost tiers. Example rows are placeholders.
// Volume threshold is assignment guidance and is not applied automatically.
export const affiliatePricingTiers = mysqlTable("affiliate_pricing_tiers", {
  id: int("id").autoincrement().primaryKey(),
  tierCode: varchar("tierCode", { length: 64 }).notNull().unique(),
  tierName: varchar("tierName", { length: 128 }).notNull(),
  basisKind: varchar("basisKind", { length: 32 }).notNull(),
  basisPoints: int("basisPoints").notNull(),
  volumeThresholdCents: int("volumeThresholdCents"),
  examplePlaceholder: boolean("examplePlaceholder").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  activeFlag: boolean("activeFlag").default(true).notNull(),
  notesText: text("notesText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AffiliatePricingTier = typeof affiliatePricingTiers.$inferSelect;
export type InsertAffiliatePricingTier = typeof affiliatePricingTiers.$inferInsert;

// ─── Affiliate-approved imported testimonials ────────────────────────────────
// These are never created by Cabinet Dealz. Each row is copied from an
// affiliate-provided public website, retains its source URL, and remains hidden
// until the affiliate explicitly approves it for their storefront.
export const affiliateTestimonials = mysqlTable("affiliate_testimonials", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId").notNull(),
  quote: text("quote").notNull(),
  author: varchar("author", { length: 160 }),
  sourceUrl: varchar("sourceUrl", { length: 512 }).notNull(),
  isPublished: boolean("isPublished").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AffiliateTestimonial = typeof affiliateTestimonials.$inferSelect;
export type InsertAffiliateTestimonial = typeof affiliateTestimonials.$inferInsert;

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
  isEnabled: boolean("isEnabled").default(true).notNull(), // false = affiliate hides/turns off this cabinet line
  sortOrder: int("sortOrder").default(0).notNull(),
  roomSceneUrl: text("roomSceneUrl"), // affiliate's own room scene photo for this style
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AffiliateStyleBranding = typeof affiliateStyleBranding.$inferSelect;
export type InsertAffiliateStyleBranding = typeof affiliateStyleBranding.$inferInsert;

// ─── Affiliate-owned generated image cabinet ─────────────────────────────────
// The original generated file remains immutable. A watermarkedUrl is a
// separate affiliate-owned derivative and can be featured without changing the
// central supplier scene or catalog pricing.
export const affiliateGeneratedImages = mysqlTable("affiliate_generated_images", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId").notNull(),
  sourceType: mysqlEnum("sourceType", ["deterministic", "gemini"]).notNull(),
  sourceId: int("sourceId").notNull(),
  originalUrl: varchar("originalUrl", { length: 512 }).notNull(),
  watermarkedUrl: varchar("watermarkedUrl", { length: 512 }),
  featuredStyleId: int("featuredStyleId"),
  isFeatured: boolean("isFeatured").default(false).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  affiliateSourceUnique: uniqueIndex("affiliate_generated_image_source_uidx").on(t.affiliateId, t.sourceType, t.sourceId),
  affiliateCreatedIndex: index("affiliate_generated_image_created_idx").on(t.affiliateId, t.createdAt),
}));

export type AffiliateGeneratedImage = typeof affiliateGeneratedImages.$inferSelect;
export type InsertAffiliateGeneratedImage = typeof affiliateGeneratedImages.$inferInsert;

// ─── Affiliate storefront distributor curation ───────────────────────────────
// An affiliate may either leave this table empty (the backward-compatible
// "show every active cabinet line" mode), or choose the supply lines that are
// allowed on their public storefront.  This is deliberately separate from the
// per-style branding table: one distributor can have many cabinet lines, and a
// featured distributor promotes those lines without overwriting a line's own
// featured/hidden settings.
export const affiliateDistributorSelections = mysqlTable("affiliate_distributor_selections", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId").notNull(),
  distributorId: int("distributorId").notNull(),
  featured: boolean("featured").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqueAffiliateDistributor: uniqueIndex("affiliate_distributor_selection_uidx").on(t.affiliateId, t.distributorId),
  affiliateSelectionIndex: index("affiliate_distributor_selection_affiliate_idx").on(t.affiliateId),
}));

export type AffiliateDistributorSelection = typeof affiliateDistributorSelections.$inferSelect;
export type InsertAffiliateDistributorSelection = typeof affiliateDistributorSelections.$inferInsert;

// Products an affiliate has turned off for their public storefront.
// Absence of a row means the product stays visible, so existing stores do not
// change until the affiliate hides something. Style-level isEnabled on
// affiliate_style_branding still hides an entire cabinet line.
export const affiliateHiddenCatalogProducts = mysqlTable("affiliate_hidden_catalog_products", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId").notNull(),
  catalogKind: mysqlEnum("catalogKind", ["cabinet", "hardware", "surface", "closet"]).notNull(),
  productKey: varchar("productKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uniqueProduct: uniqueIndex("affiliate_hidden_catalog_product_uidx").on(t.affiliateId, t.catalogKind, t.productKey),
  affiliateKindIndex: index("affiliate_hidden_catalog_affiliate_idx").on(t.affiliateId, t.catalogKind),
}));

export type AffiliateHiddenCatalogProduct = typeof affiliateHiddenCatalogProducts.$inferSelect;
export type InsertAffiliateHiddenCatalogProduct = typeof affiliateHiddenCatalogProducts.$inferInsert;

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
  // Set when this contact belongs to a contractor's customer folder.
  contractorCustomerId: int("contractorCustomerId"),
  // Pipeline
  title: varchar("title", { length: 256 }).notNull(), // e.g. "Kitchen remodel — J. Rivera"
  stage: mysqlEnum("stage", [
    "new",
    "new_sale",
    "contacted",
    "qualified",
    "image_review",
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
    "verified_plan_image_request",
  ]).default("manual").notNull(),
  orderRequestId: int("orderRequestId"),
  // An affiliate may select one reviewed labor estimate for the deal. Its amount
  // remains an independently sourced line, but the CRM Quick PDF can present it
  // with the verified merchandise and freight in one customer-facing total.
  laborEstimateId: int("laborEstimateId"),
  proApplicationId: int("proApplicationId"),
  referralCode: varchar("referralCode", { length: 32 }),
  // Follow-up
  nextFollowUpAt: timestamp("nextFollowUpAt"),
  notes: text("notes"),
  // Sort order within a stage column (for manual drag ordering)
  boardOrder: int("boardOrder").default(0).notNull(),
  closedAt: timestamp("closedAt"), // set when stage becomes won/lost
  // Independent help flags let the team see whether a customer needs closing,
  // layout/design, or shipping-cost assistance without overwriting another need.
  needsHelpClosing: boolean("needsHelpClosing").default(false).notNull(),
  needsHelpDesigning: boolean("needsHelpDesigning").default(false).notNull(),
  needsHelpShipping: boolean("needsHelpShipping").default(false).notNull(),
  // Kitchen design price + live shipping quote synced from the Designer page.
  designValue: decimal("designValue", { precision: 12, scale: 2 }),
  shippingQuote: decimal("shippingQuote", { precision: 12, scale: 2 }),
  shippingAddress: varchar("shippingAddress", { length: 512 }),
  shippingAddressVerified: boolean("shippingAddressVerified").default(false).notNull(),
  designSyncedAt: timestamp("designSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  laborEstimateIdx: index("crm_deals_labor_estimate_idx").on(t.laborEstimateId),
  laborEstimateFk: foreignKey({
    name: "crm_deals_labor_estimate_fk",
    columns: [t.laborEstimateId],
    foreignColumns: [affiliateInstallationEstimates.id],
  }).onDelete("set null").onUpdate("cascade"),
}));

export type CrmDeal = typeof crmDeals.$inferSelect;
export type InsertCrmDeal = typeof crmDeals.$inferInsert;

// ─── Affiliate Team Members ─────────────────────────────────────────────────
// Links a user (salesperson/designer) to an affiliate so they can access that
// affiliate's CRM and design tool. The affiliate owner manages this from their
// administration panel.
export const affiliateTeamMembers = mysqlTable("affiliate_team_members", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId").notNull(),
  userId: int("userId"), // linked after the person signs in (matched by email)
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 256 }),
  role: mysqlEnum("role", ["salesperson", "designer"]).notNull(),
  accessCrm: boolean("accessCrm").default(true).notNull(),
  accessDesigner: boolean("accessDesigner").default(true).notNull(),
  // Owner-granted permission to edit Marketing Hub social links.
  accessMarketing: boolean("accessMarketing").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AffiliateTeamMember = typeof affiliateTeamMembers.$inferSelect;
export type InsertAffiliateTeamMember = typeof affiliateTeamMembers.$inferInsert;

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

// ─── Saved-design view log ──────────────────────────────────────────────────────
// One row each time a saved design is opened (customer, staff, or from the CRM).
// Rows opened again by the same viewer within 10 minutes are not logged twice.
export const designViewLog = mysqlTable("design_view_log", {
  id: int("id").autoincrement().primaryKey(),
  designId: int("designId").notNull(),
  dealId: int("dealId"),
  viewerUserId: int("viewerUserId"),
  viewerName: varchar("viewerName", { length: 256 }),
  viewerKind: varchar("viewerKind", { length: 32 }).notNull().default("owner"), // owner | crm | staff
  viewedAt: timestamp("viewedAt").defaultNow().notNull(),
});
export type DesignViewLog = typeof designViewLog.$inferSelect;
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
  distributorId: int("distributorId"),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
});

export type CrmEmailLog = typeof crmEmailLog.$inferSelect;
export type InsertCrmEmailLog = typeof crmEmailLog.$inferInsert;

// ─── Per-affiliate CRM email ──────────────────────────────────────────────────
// One row per affiliate. smtpPass is encrypted with the same envelope as the
// platform email_settings password and is never returned to the client.
// affiliateId NULL is not used here: house mail stays on email_settings.
export const affiliateEmailSettings = mysqlTable("affiliate_email_settings", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId").notNull(),
  provider: varchar("provider", { length: 32 }).default("custom").notNull(),
  smtpHost: varchar("smtpHost", { length: 255 }).default("").notNull(),
  smtpPort: int("smtpPort").default(587).notNull(),
  smtpUser: varchar("smtpUser", { length: 255 }).default("").notNull(),
  smtpPass: text("smtpPass").notNull().default(""),
  smtpFrom: varchar("smtpFrom", { length: 320 }).default("").notNull(),
  fromName: varchar("fromName", { length: 256 }).default("").notNull(),
  replyTo: varchar("replyTo", { length: 320 }).default("").notNull(),
  signatureHtml: text("signatureHtml").notNull().default(""),
  enabled: boolean("enabled").default(false).notNull(),
  lastTestedAt: timestamp("lastTestedAt"),
  lastTestOk: boolean("lastTestOk"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  affiliateUnique: uniqueIndex("affiliate_email_settings_affiliate_uidx").on(t.affiliateId),
}));

export type AffiliateEmailSettings = typeof affiliateEmailSettings.$inferSelect;
export type InsertAffiliateEmailSettings = typeof affiliateEmailSettings.$inferInsert;

// Drafts saved from the CRM Email tab. affiliateId NULL is a house draft.
// Nothing here is sent until a person clicks Send.
export const crmEmailDrafts = mysqlTable("crm_email_drafts", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId"),
  dealId: int("dealId"),
  authorUserId: int("authorUserId"),
  toEmail: varchar("toEmail", { length: 320 }).default("").notNull(),
  subject: varchar("subject", { length: 512 }).default("").notNull(),
  bodyHtml: text("bodyHtml").notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  scopeIdx: index("crm_email_drafts_scope_idx").on(t.affiliateId, t.updatedAt),
  dealIdx: index("crm_email_drafts_deal_idx").on(t.dealId),
}));

export type CrmEmailDraft = typeof crmEmailDrafts.$inferSelect;
export type InsertCrmEmailDraft = typeof crmEmailDrafts.$inferInsert;

// Affiliate-owned templates. Built-in follow-up / quote / design templates live
// in shared code so they cannot be deleted. affiliateId NULL is a house template.
export const crmEmailTemplates = mysqlTable("crm_email_templates", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId"),
  name: varchar("name", { length: 128 }).notNull(),
  subject: varchar("subject", { length: 512 }).default("").notNull(),
  bodyHtml: text("bodyHtml").notNull().default(""),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  scopeIdx: index("crm_email_templates_scope_idx").on(t.affiliateId, t.updatedAt),
}));

export type CrmEmailTemplate = typeof crmEmailTemplates.$inferSelect;
export type InsertCrmEmailTemplate = typeof crmEmailTemplates.$inferInsert;

// File links on a deal (quotes, plans, photos). The URL is stored; bytes stay
// in existing storage. No destructive change to crm_deals.
export const crmDealFiles = mysqlTable("crm_deal_files", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  fileName: varchar("fileName", { length: 256 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1024 }).notNull(),
  uploadedByUserId: int("uploadedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  dealIdx: index("crm_deal_files_deal_idx").on(t.dealId),
}));

export type CrmDealFile = typeof crmDealFiles.$inferSelect;
export type InsertCrmDealFile = typeof crmDealFiles.$inferInsert;

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
  // Admin-managed origin template copied to newly created distributor lines.
  // It is intentionally empty until verified warehouse ZIPs are entered.
  warehouseTemplateZips: json("warehouseTemplateZips").$type<string[]>(),
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
  liveProvider: varchar("liveProvider", { length: 64 }).default("estimator").notNull(), // estimator | ups | easypost | shippo | freightquote | globaltranz | worldwideexpress
  liveApiKey: varchar("liveApiKey", { length: 255 }),
  // UPS Rating API — an OAuth client created in the UPS Developer Portal and
  // linked to the UPS profile/shipper number. Used only for direct parcel rates.
  upsClientId: varchar("upsClientId", { length: 255 }),
  upsClientSecret: varchar("upsClientSecret", { length: 255 }),
  upsAccountNumber: varchar("upsAccountNumber", { length: 64 }),
  upsEnvironment: mysqlEnum("upsEnvironment", ["sandbox", "production"]).default("sandbox"),
  // FedEx Rate API — project created in the FedEx Developer Portal (client_credentials).
  fedexClientId: varchar("fedexClientId", { length: 255 }),
  fedexClientSecret: varchar("fedexClientSecret", { length: 255 }),
  fedexAccountNumber: varchar("fedexAccountNumber", { length: 64 }),
  fedexEnvironment: mysqlEnum("fedexEnvironment", ["sandbox", "production"]).default("sandbox"),
  // Broker API credentials — stored per-broker so the admin can configure all
  // three without losing settings when switching between them.
  // Freightquote (C.H. Robinson Navisphere) — OAuth2 client_credentials
  fqClientId: varchar("fqClientId", { length: 255 }),
  fqClientSecret: varchar("fqClientSecret", { length: 255 }),
  fqAccountNumber: varchar("fqAccountNumber", { length: 64 }),
  fqEnvironment: mysqlEnum("fqEnvironment", ["sandbox", "production"]).default("sandbox"),
  // GlobalTranz — API key + basic auth
  gtzApiKey: varchar("gtzApiKey", { length: 255 }),
  gtzUsername: varchar("gtzUsername", { length: 128 }),
  gtzPassword: varchar("gtzPassword", { length: 255 }),
  gtzAccountNumber: varchar("gtzAccountNumber", { length: 64 }),
  gtzEnvironment: mysqlEnum("gtzEnvironment", ["sandbox", "production"]).default("sandbox"),
  // Worldwide Express (WWEX) — OAuth2 or legacy API key
  wwexClientId: varchar("wwexClientId", { length: 255 }),
  wwexClientSecret: varchar("wwexClientSecret", { length: 255 }),
  wwexAccountNumber: varchar("wwexAccountNumber", { length: 64 }),
  wwexUsername: varchar("wwexUsername", { length: 128 }),
  wwexPassword: varchar("wwexPassword", { length: 255 }),
  wwexEnvironment: mysqlEnum("wwexEnvironment", ["sandbox", "production"]).default("sandbox"),
  // WWEX endpoints are supplied by the account representative. Public WWEX
  // pages do not publish stable REST hosts, so we never send credentials to a
  // guessed hostname.
  wwexSandboxTokenUrl: varchar("wwexSandboxTokenUrl", { length: 512 }),
  wwexSandboxRateUrl: varchar("wwexSandboxRateUrl", { length: 512 }),
  wwexProductionTokenUrl: varchar("wwexProductionTokenUrl", { length: 512 }),
  wwexProductionRateUrl: varchar("wwexProductionRateUrl", { length: 512 }),
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
  // Standard cabinet pallets remain compact. The long pallet is reserved for
  // trim or another carton whose authoritative package/physical length is 7–8 ft.
  standardPalletLengthIn: decimal("standardPalletLengthIn", { precision: 6, scale: 2 }).default("48").notNull(),
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
  /**
   * Owner decision. When true, a vendor wholesale increase waits in the
   * upcoming-price-increase queue. Decreases and first prices still apply.
   */
  wholesaleIncreaseRequiresApproval: boolean("wholesaleIncreaseRequiresApproval").default(true).notNull(),
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
  affiliateId: int("affiliateId"), // null only for a non-affiliate designer launch
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 256 }),
  phone: varchar("phone", { length: 32 }),
  roomType: varchar("roomType", { length: 32 }), // kitchen/bath/etc. if known at launch
  source: varchar("source", { length: 64 }).default("designer_launch").notNull(),
  dealId: int("dealId"), // the owning affiliate or house CRM deal (null until created)
  affiliateSlug: varchar("affiliateSlug", { length: 255 }), // affiliate storefront slug if design came from affiliate
  // The featured cabinet line that referred this Designer launch. It is set only
  // after server-side verification that the current affiliate featured that line.
  featuredDistributorId: int("featuredDistributorId"),
  featuredStyleId: int("featuredStyleId"), // exact featured door style selected at Designer launch
  // Light de-dupe / engagement counters so repeat launches update one record.
  launchCount: int("launchCount").default(1).notNull(),
  lastLaunchAt: timestamp("lastLaunchAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DesignLead = typeof designLeads.$inferSelect;
export type InsertDesignLead = typeof designLeads.$inferInsert;

// ─── Affiliate featured-line storefront analytics ────────────────────────────
// Anonymous, first-party interaction records. The opaque session key only
// de-dupes a storefront view and never contains a customer identifier.
export const affiliateFeaturedDistributorEvents = mysqlTable("affiliate_featured_distributor_events", {
  id: int("id").autoincrement().primaryKey(),
  affiliateId: int("affiliateId").notNull(),
  distributorId: int("distributorId").notNull(),
  styleId: int("styleId"), // nullable for legacy distributor-line events; populated for featured door-style views
  eventType: mysqlEnum("eventType", ["view"]).notNull(),
  sessionKey: varchar("sessionKey", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  affiliateDistributorCreatedIndex: index("affiliate_featured_dist_event_idx").on(t.affiliateId, t.distributorId, t.createdAt),
  affiliateSessionCreatedIndex: index("affiliate_featured_session_idx").on(t.affiliateId, t.distributorId, t.sessionKey, t.createdAt),
}));

export type AffiliateFeaturedDistributorEvent = typeof affiliateFeaturedDistributorEvents.$inferSelect;

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
  // Affiliate store the customer booked through. Null is a Cabinet Dealz house
  // booking and is visible to admins only. Never taken from the client as an id.
  affiliateId: int("affiliateId"),
  // Read-only "share live with customer" follow link token + voice meeting URL.
  shareToken: varchar("shareToken", { length: 40 }),
  meetingUrl: varchar("meetingUrl", { length: 1000 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  affiliateIdx: index("design_consultations_affiliate_idx").on(table.affiliateId),
}));

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

// ─── Stripe payment history ───────────────────────────────────────────────────
// One row per Stripe payment (order checkout, affiliate membership, or any
// other charge). Webhook events and the admin backfill upsert the same row
// when they share a checkout session, payment intent, charge, or invoice id.
// Affiliates never read this table; admin procedures are the only API.
export type StripePaymentLineItem = {
  description: string;
  quantity: number;
  amountCents: number;
};

export const stripePaymentRecords = mysqlTable("stripe_payment_records", {
  id: int("id").autoincrement().primaryKey(),
  livemode: boolean("livemode").default(false).notNull(),
  stripeMode: mysqlEnum("stripeMode", ["live", "test"]).notNull(),
  checkoutSessionId: varchar("checkoutSessionId", { length: 255 }),
  paymentIntentId: varchar("paymentIntentId", { length: 255 }),
  chargeId: varchar("chargeId", { length: 255 }),
  invoiceId: varchar("invoiceId", { length: 255 }),
  customerId: varchar("customerId", { length: 255 }),
  subscriptionId: varchar("subscriptionId", { length: 255 }),
  amountCents: int("amountCents").notNull(),
  amountRefundedCents: int("amountRefundedCents").default(0).notNull(),
  currency: varchar("currency", { length: 8 }).default("usd").notNull(),
  status: mysqlEnum("status", ["paid", "refunded", "partially_refunded", "failed", "pending"]).notNull(),
  customerName: varchar("customerName", { length: 255 }),
  customerEmail: varchar("customerEmail", { length: 320 }),
  purpose: mysqlEnum("purpose", ["order", "affiliate_membership", "other"]).default("other").notNull(),
  description: text("description"),
  lineItemsJson: json("lineItemsJson").$type<StripePaymentLineItem[]>(),
  metadataJson: json("metadataJson").$type<Record<string, string>>(),
  orderRequestId: int("orderRequestId"),
  orderNumber: varchar("orderNumber", { length: 64 }),
  affiliateId: int("affiliateId"),
  affiliateInvoiceId: int("affiliateInvoiceId"),
  receiptEmail: varchar("receiptEmail", { length: 320 }),
  receiptUrl: text("receiptUrl"),
  // True only when Stripe will email a receipt: live mode and receipt_email set.
  // Test-mode charges never send that email, even when receipt_email is present.
  receiptEmailSent: boolean("receiptEmailSent").default(false).notNull(),
  // True only after an invoice.sent event. Creating an invoice is not proof
  // that Stripe emailed it.
  invoiceEmailSent: boolean("invoiceEmailSent").default(false).notNull(),
  hostedInvoiceUrl: text("hostedInvoiceUrl"),
  invoicePdfUrl: text("invoicePdfUrl"),
  stripeDashboardUrl: varchar("stripeDashboardUrl", { length: 512 }),
  occurredAt: timestamp("occurredAt").notNull(),
  lastEventId: varchar("lastEventId", { length: 255 }),
  lastEventType: varchar("lastEventType", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  sessionUnique: uniqueIndex("stripe_payment_records_session_uq").on(t.checkoutSessionId),
  paymentIntentUnique: uniqueIndex("stripe_payment_records_pi_uq").on(t.paymentIntentId),
  chargeUnique: uniqueIndex("stripe_payment_records_charge_uq").on(t.chargeId),
  invoiceUnique: uniqueIndex("stripe_payment_records_invoice_uq").on(t.invoiceId),
  affiliateOccurredIdx: index("stripe_payment_records_affiliate_occurred_idx").on(t.affiliateId, t.occurredAt),
  occurredIdx: index("stripe_payment_records_occurred_idx").on(t.occurredAt),
  statusIdx: index("stripe_payment_records_status_idx").on(t.status),
}));

export type StripePaymentRecord = typeof stripePaymentRecords.$inferSelect;
export type InsertStripePaymentRecord = typeof stripePaymentRecords.$inferInsert;

// Processed Stripe event ids. A replayed event updates nothing a second time.
export const stripeWebhookEvents = mysqlTable("stripe_webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 255 }).notNull().unique(),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
});

export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;

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
  // GA4 Measurement IDs are public web-stream identifiers, not secrets. A
  // nullable value lets the owner disable analytics without deleting settings.
  googleAnalyticsMeasurementId: varchar("googleAnalyticsMeasurementId", { length: 32 }),
  // Null keeps the automatic door exposure (0.84, softer on a very dark stain).
  renderExposure: decimal("renderExposure", { precision: 4, scale: 2 }),
  // Null keeps the CIEDE2000 pass limit at 3.
  colorMatchDeltaE: decimal("colorMatchDeltaE", { precision: 4, scale: 2 }),
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
  // CRM help requests are routed to their own teams and start disabled until an
  // administrator deliberately configures both a recipient list and a toggle.
  onCrmDesignHelp: varchar("onCrmDesignHelp", { length: 1024 }).default("").notNull(),
  onCrmShippingHelp: varchar("onCrmShippingHelp", { length: 1024 }).default("").notNull(),
  notifyOnCrmDesignHelp: boolean("notifyOnCrmDesignHelp").default(false).notNull(),
  notifyOnCrmShippingHelp: boolean("notifyOnCrmShippingHelp").default(false).notNull(),
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
  /**
   * Active catalog lines administered under this one supplier profile. sourceKey
   * remains the primary line for backwards-compatible links and portal entry;
   * this list preserves distinct companion lines such as USCD Framed + AEF
   * Frameless without merging their SKU, price, or order identities.
   */
  linkedDistributorIds: json("linkedDistributorIds").$type<number[]>(),
  sourceKey: varchar("sourceKey", { length: 64 }),
  category: varchar("category", { length: 128 }).default("").notNull(),
  contactName: varchar("contactName", { length: 191 }).default("").notNull(),
  contactEmail: varchar("contactEmail", { length: 255 }).default("").notNull(),
  contactPhone: varchar("contactPhone", { length: 64 }).default("").notNull(),
  isApproved: boolean("isApproved").default(true).notNull(),
  /**
   * Administrator's choice for every vendor on Approve Vendors.
   * true = cabinet vendor, false = non-cabinet (Pelican is the current example),
   * null = not chosen yet. Saunders Closets is inserted unset on purpose.
   */
  isCabinetVendor: boolean("isCabinetVendor"),
  totalSalesCents: int("totalSalesCents").default(0).notNull(),
  salesUpdatedAt: timestamp("salesUpdatedAt"),
  notes: text("notes"),
  websiteUrl: varchar("websiteUrl", { length: 512 }),
  /** Source PDF catalog URL, either vendor-hosted or stored in managed file storage. */
  catalogPdfUrl: varchar("catalogPdfUrl", { length: 512 }),
  /** Source PDF specification book URL, either vendor-hosted or stored in managed file storage. */
  specBookPdfUrl: varchar("specBookPdfUrl", { length: 512 }),
  /**
   * Vendor-owned shipping codes for live quote requests. These are not the
   * site-wide estimator freight class or freight_zones rates.
   */
  shippingServiceCodes: json("shippingServiceCodes").$type<string[]>(),
  shippingFreightClass: varchar("shippingFreightClass", { length: 8 }),
  shipFromZip: varchar("shipFromZip", { length: 16 }),
  shippingQuoteProvider: mysqlEnum("shippingQuoteProvider", ["none", "http", "pelican", "carrier_ltl"]).default("none").notNull(),
  shippingQuoteUrl: varchar("shippingQuoteUrl", { length: 512 }),
  shippingQuoteAuthHeaderName: varchar("shippingQuoteAuthHeaderName", { length: 128 }),
  /** Encrypted vendor quote secret. Never selected into a client response. */
  shippingQuoteSecretEncrypted: varchar("shippingQuoteSecretEncrypted", { length: 2048 }),
  shippingQuoteAdminEnabled: boolean("shippingQuoteAdminEnabled").default(false).notNull(),
  shippingQuoteVendorEnabled: boolean("shippingQuoteVendorEnabled").default(false).notNull(),
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
  discountType: mysqlEnum("discountType", ["percent", "fixed_price", "fixed_amount"]).notNull(),
  discountValue: decimal("discountValue", { precision: 10, scale: 2 }).notNull(), // percent off, dollars off, or legacy fixed sale price
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
/**
 * Pending / reviewed requests to change a MASTER cabinet configuration.
 * "Save as master" in Cabinet Config no longer edits `cabinets` directly; it
 * files a request here. The old master value stays live everywhere until an
 * admin approves it on the Master Changes page. Approved requests keep the
 * previous values so they can be undone. Prices are never part of a request.
 */
// ─── Cabinet configuration change log ───────────────────────────────
// One row per field actually changed by an admin save, for the master row
// (scope "master", distributorId null) or for one distributor's rule
// (scope "distributor"). Old/new values are JSON-encoded so any field type
// can be shown and reverted from the Cabinet Config history panel.
export const cabinetConfigChangeLog = mysqlTable("cabinet_config_change_log", {
  id: int("id").autoincrement().primaryKey(),
  cabinetId: int("cabinetId").notNull(),
  masterCode: varchar("masterCode", { length: 64 }).notNull(),
  scope: mysqlEnum("scope", ["master", "distributor"]).notNull(),
  distributorId: int("distributorId"),
  field: varchar("field", { length: 64 }).notNull(),
  oldValueJson: text("oldValueJson"),
  newValueJson: text("newValueJson"),
  changedBy: int("changedBy"),
  changedByName: varchar("changedByName", { length: 128 }),
  revertedAt: timestamp("revertedAt"),
  revertedBy: int("revertedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CabinetConfigChangeLogRow = typeof cabinetConfigChangeLog.$inferSelect;

// ─── Cabinet recovery snapshots ─────────────────────────────────────────────
// Full copy of one master cabinet row (and its distributor rules) taken before
// an admin edit or on demand from Admin → Data Recovery, so any cabinet can be
// restored to a known-good state later. Never holds prices.
export const cabinetRecoverySnapshots = mysqlTable("cabinet_recovery_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  cabinetId: int("cabinetId").notNull(),
  masterCode: varchar("masterCode", { length: 64 }).notNull(),
  reason: varchar("reason", { length: 64 }).notNull(), // before-edit | manual | before-restore
  rowJson: text("rowJson").notNull(),
  overridesJson: text("overridesJson"),
  takenBy: int("takenBy"),
  takenByName: varchar("takenByName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  cabinetIdx: index("cabinet_recovery_snapshots_cabinet_idx").on(t.cabinetId, t.createdAt),
}));
export type CabinetRecoverySnapshotRow = typeof cabinetRecoverySnapshots.$inferSelect;

export const cabinetMasterChangeRequests = mysqlTable("cabinet_master_change_requests", {
  id: int("id").autoincrement().primaryKey(),
  cabinetId: int("cabinetId").notNull(),
  masterCode: varchar("masterCode", { length: 64 }).notNull(),
  // Distributor context the admin was working in when submitting (null = none)
  sourceDistributorId: int("sourceDistributorId"),
  submittedBy: int("submittedBy").notNull(),
  submittedByName: varchar("submittedByName", { length: 191 }),
  status: mysqlEnum("status", ["pending", "approved", "applied_to_distributor", "rejected", "undone"]).default("pending").notNull(),
  // JSON array of { field, currentValue, proposedValue } captured at submission
  changesJson: text("changesJson").notNull(),
  // JSON object of the master values replaced at approval (for Undo)
  previousValuesJson: text("previousValuesJson"),
  // JSON object of the values actually applied (after optional edit)
  appliedValuesJson: text("appliedValuesJson"),
  appliedDistributorId: int("appliedDistributorId"),
  reviewNote: text("reviewNote"),
  reviewedBy: int("reviewedBy"),
  reviewedByName: varchar("reviewedByName", { length: 191 }),
  reviewedAt: timestamp("reviewedAt"),
  undoneBy: int("undoneBy"),
  undoneAt: timestamp("undoneAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const distributorCabinetOverrides = mysqlTable(
  "distributor_cabinet_overrides",
  {
    id: int("id").autoincrement().primaryKey(),
    distributorId: int("distributorId").notNull(),
    cabinetId: int("cabinetId").notNull(),
    // Overrideable dimension fields (null = use master value)
    // Preserve distributor source geometry independently of shared master data.
    width: decimal("width", { precision: 7, scale: 3 }),
    height: decimal("height", { precision: 7, scale: 3 }),
    depth: decimal("depth", { precision: 7, scale: 3 }),
    physicalWidth: decimal("physicalWidth", { precision: 7, scale: 3 }),
    weight: decimal("weight", { precision: 8, scale: 2 }),
    pkgLength: decimal("pkgLength", { precision: 6, scale: 2 }),
    pkgWidth: decimal("pkgWidth", { precision: 6, scale: 2 }),
    pkgHeight: decimal("pkgHeight", { precision: 6, scale: 2 }),
    pkgWeight: decimal("pkgWeight", { precision: 8, scale: 2 }),
    imageUrl: varchar("imageUrl", { length: 1024 }),  // line-specific catalog image override
    // Per-distributor cabinet configuration rule (doors/drawers/shelves, corner type,
    // layout spec, opening, spec notes...). Saved from Cabinet Config "Save for
    // selected distributors". null = use the master cabinet's configuration.
    configJson: text("configJson"),
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

// ─── Two-way code equivalences ───────────────────────────────────────────────
// Undirected "same physical cabinet, different maker code" links (ERB36 <->
// BER36, FHBO9 <-> BT9). Unlike sku_master_aliases this never retires either
// code: both stay canonical, both stay in their line's palette, and the
// Designer price lookup simply widens to the whole equivalence group and uses
// whichever code the ACTIVE line actually sells. Never changes a price.
export const cabinetCodeEquivalences = mysqlTable("cabinet_code_equivalences", {
  id: int("id").autoincrement().primaryKey(),
  codeA: varchar("codeA", { length: 64 }).notNull(),
  codeB: varchar("codeB", { length: 64 }).notNull(),
  // Optional master nomenclature family tag (e.g. CORNER) for reporting.
  family: varchar("family", { length: 32 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqPair: unique("cabinet_code_equivalences_pair_unique").on(t.codeA, t.codeB),
}));
export type CabinetCodeEquivalence = typeof cabinetCodeEquivalences.$inferSelect;

// ─── Per-brand attribute overrides (master sheet 2026-10-03, rule 7) ──────────
// "Brand values override the master ONLY for that brand. Master keeps the
// nominal code dimensions." Non-price facts only: box widths, drawer counts,
// glass policy, shelf counts, native order codes. Prices are NEVER stored here.
export const cabinetBrandAttributes = mysqlTable("cabinet_brand_attributes", {
  id: int("id").autoincrement().primaryKey(),
  brand: varchar("brand", { length: 64 }).notNull(), // ALL | U.S. Cabinet Depot (USCD) | A-Line/Skyline | Faircrest
  appliesTo: varchar("appliesTo", { length: 128 }).notNull(), // master code / family / "all brands"
  attribute: varchar("attribute", { length: 64 }).notNull(), // blindCornerBoxWidth, glassIncluded, ...
  brandValue: text("brandValue").notNull(),
  masterValue: varchar("masterValue", { length: 128 }),
  source: varchar("source", { length: 191 }),
  note: text("note"),
  distributor: varchar("distributor", { length: 64 }),
  nativeCode: varchar("nativeCode", { length: 64 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CabinetBrandAttribute = typeof cabinetBrandAttributes.$inferSelect;


// ─── Designer missing-price log (Part 1) ─────────────────────────────────────
// One row per (code, store, line, style, design) the Designer could not price.
// Hit counts accumulate so the admin list stays short; resolvedAt marks a fix.
export const designMissingPriceEvents = mysqlTable("design_missing_price_events", {
  id: int("id").autoincrement().primaryKey(),
  masterCode: varchar("masterCode", { length: 64 }).notNull(),
  cabinetId: int("cabinetId"),
  storeScope: varchar("storeScope", { length: 160 }).notNull().default("owner"),
  distributorId: int("distributorId").notNull().default(0),
  styleId: int("styleId").notNull().default(0),
  designId: int("designId").notNull().default(0),
  userId: int("userId"),
  /** Codes in the equivalence group that were tried on this line (comma list). */
  triedCodes: text("triedCodes"),
  /** Whether a priced same-family alternative existed when flagged. */
  alternativeAvailable: boolean("alternativeAvailable"),
  hitCount: int("hitCount").default(1).notNull(),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().onUpdateNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: int("resolvedBy"),
}, (t) => ({
  uniqHit: unique("design_missing_price_events_hit_unique").on(t.masterCode, t.storeScope, t.distributorId, t.styleId, t.designId),
  openIndex: index("design_missing_price_events_open_idx").on(t.resolvedAt, t.lastSeenAt),
}));
export type DesignMissingPriceEvent = typeof designMissingPriceEvents.$inferSelect;

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

// ─── Learned Categorization Rules ────────────────────────────────────────────
// When an admin recategorizes an item in the admin panel, we learn the pattern
// and apply it to future uploads. These rules have the highest priority and
// can never be overridden by default categorization logic.
export const categorizationRules = mysqlTable("categorization_rules", {
  id: int("id").autoincrement().primaryKey(),
  // Pattern type: "code_prefix" (W*), "code_contains" (MOLDING), "exact_code", "dimensions"
  patternType: varchar("patternType", { length: 32 }).notNull(),
  // The pattern itself: "W", "MOLDING", "CORBEL24", etc.
  pattern: varchar("pattern", { length: 128 }).notNull(),
  // Target category this pattern should map to
  targetCategory: varchar("targetCategory", { length: 64 }).notNull(),
  // How many times this rule has been confirmed by admin actions
  confidence: int("confidence").default(1).notNull(),
  // The cabinet ID that triggered this rule (for reference)
  sourceCAbinetId: int("sourceCabinetId"),
  // Admin who created/confirmed this rule
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CategorizationRule = typeof categorizationRules.$inferSelect;
export type InsertCategorizationRule = typeof categorizationRules.$inferInsert;

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

// ─── Price Shop Snapshots ─────────────────────────────────────────────────────
// Admin-saved snapshots of the 10×10 price shop at a point in time.
// Each snapshot stores the full per-style pricing array as JSON so it can be
// recalled and compared without re-running the live query.
export const priceShopSnapshots = mysqlTable("price_shop_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),          // user-given label, e.g. "July 2026 prices"
  layoutType: varchar("layoutType", { length: 32 }).notNull().default("10x10"), // "10x10" | "19L"
  snapshotData: json("snapshotData").notNull(),               // full StyleResult[] array
  totalStyles: int("totalStyles").default(0).notNull(),
  createdBy: int("createdBy"),                                // FK to users.id (admin who saved it)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PriceShopSnapshot = typeof priceShopSnapshots.$inferSelect;
export type InsertPriceShopSnapshot = typeof priceShopSnapshots.$inferInsert;

// ─── Bundle Deals ─────────────────────────────────────────────────────────────
// Admin-curated pre-configured kitchen packages saved from the Design Tool.
// Each bundle is a named design snapshot that can be published to the storefront
// so customers can buy the full kitchen with one click.
export const bundleDeals = mysqlTable("bundle_deals", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  // The full design snapshot JSON (same shape as design drafts)
  designSnapshot: json("designSnapshot").notNull(),
  // The door style locked for this bundle
  styleId: int("styleId"),                                   // FK to door_styles.id
  styleName: varchar("styleName", { length: 200 }),
  // Pricing (computed at save time, refreshable)
  homeownerPrice: decimal("homeownerPrice", { precision: 10, scale: 2 }),
  yourCost: decimal("yourCost", { precision: 10, scale: 2 }),
  // Room dimensions (from the design)
  roomWidthInches: int("roomWidthInches"),
  roomDepthInches: int("roomDepthInches"),
  cabinetCount: int("cabinetCount").default(0).notNull(),
  // Storefront visibility
  isPublished: boolean("isPublished").default(false).notNull(),
  // Hero image (optional, generated or uploaded)
  heroImageUrl: varchar("heroImageUrl", { length: 512 }),
  // Floor plan image (auto-generated from the 2D design snapshot)
  floorPlanImageUrl: varchar("floorPlanImageUrl", { length: 512 }),
  // Ownership: who created this bundle? null = admin/global
  affiliateId: int("affiliateId"),                            // FK to affiliates.id
  distributorId: int("distributorId"),                        // FK to distributors.id
  // Vendor style lock: when set, bundle only features this vendor's cabinet lines
  lockedDistributorId: int("lockedDistributorId"),            // FK to distributors.id
  // Sort order for storefront display
  sortOrder: int("sortOrder").default(0).notNull(),
  // Copy of a saved design. The source row is never moved or updated.
  sourceDesignId: int("sourceDesignId"),
  featuredOnHome: boolean("featuredOnHome").default(false).notNull(),
  // Customer-facing amount when it differs from the snapshotted BOM sum.
  priceOverride: decimal("priceOverride", { precision: 10, scale: 2 }),
  discountAmount: decimal("discountAmount", { precision: 10, scale: 2 }),
  // BOM total at save/refresh time. Compared with live catalog prices.
  bomSnapshotTotal: decimal("bomSnapshotTotal", { precision: 10, scale: 2 }),
  lineItemsJson: json("lineItemsJson").$type<KitchenPackageLineItem[]>(),
  priceSnapshottedAt: timestamp("priceSnapshottedAt"),
  layoutLabel: varchar("layoutLabel", { length: 64 }),
  doorColor: varchar("doorColor", { length: 128 }),
  createdBy: int("createdBy"),                               // FK to users.id
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KitchenPackageLineItem = {
  label: string;
  code: string;
  category: string;
  supplier: string;
  qty: number;
  unitPrice: number | null;
  lineTotal: number | null;
  section: "cabinet" | "other";
};

export type BundleDeal = typeof bundleDeals.$inferSelect;
export type InsertBundleDeal = typeof bundleDeals.$inferInsert;

// ─── Customer projects (storefront My Account) ───────────────────────────────
// A signed-in shopper groups their own designs and quotes. Rows are owned by
// userId and attributed to the storefront affiliate so that affiliate's CRM
// can read them. Affiliates cannot edit or delete these rows.
export const customerProjects = mysqlTable("customer_projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  affiliateId: int("affiliateId"),
  name: varchar("name", { length: 256 }).notNull(),
  jobSiteAddress: varchar("jobSiteAddress", { length: 512 }),
  clientName: varchar("clientName", { length: 256 }),
  notes: text("notes"),
  status: mysqlEnum("status", ["planning", "active", "quoted", "completed", "archived"]).default("planning").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  ownerIdx: index("customer_projects_owner_idx").on(t.userId, t.affiliateId),
}));
export type CustomerProject = typeof customerProjects.$inferSelect;
export type InsertCustomerProject = typeof customerProjects.$inferInsert;

export const customerProjectDesigns = mysqlTable("customer_project_designs", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  kitchenDesignId: int("kitchenDesignId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  designUnique: uniqueIndex("customer_project_designs_design_uq").on(t.kitchenDesignId),
  projectIdx: index("customer_project_designs_project_idx").on(t.projectId),
}));
export type CustomerProjectDesign = typeof customerProjectDesigns.$inferSelect;

export const customerProjectQuotes = mysqlTable("customer_project_quotes", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  orderRequestId: int("orderRequestId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  quoteUnique: uniqueIndex("customer_project_quotes_order_uq").on(t.orderRequestId),
  projectIdx: index("customer_project_quotes_project_idx").on(t.projectId),
}));
export type CustomerProjectQuote = typeof customerProjectQuotes.$inferSelect;

// Previous design contents, written before an assisted edit so the customer
// can restore that version. A suggested copy does not overwrite this history.
export const kitchenDesignRevisions = mysqlTable("kitchen_design_revisions", {
  id: int("id").autoincrement().primaryKey(),
  kitchenDesignId: int("kitchenDesignId").notNull(),
  revisionNumber: int("revisionNumber").notNull(),
  authorUserId: int("authorUserId"),
  authorLabel: varchar("authorLabel", { length: 160 }).notNull(),
  kind: mysqlEnum("kind", ["assisted_edit", "suggested_copy", "revert"]).notNull(),
  snapshot: json("snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  designRevIdx: index("kitchen_design_revisions_design_idx").on(t.kitchenDesignId, t.revisionNumber),
}));
export type KitchenDesignRevision = typeof kitchenDesignRevisions.$inferSelect;

// In-app notices only. Assisted edits never send email.
export const customerNotices = mysqlTable("customer_notices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  affiliateId: int("affiliateId"),
  kind: mysqlEnum("kind", ["design_assisted", "design_suggested"]).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  designId: int("designId"),
  projectId: int("projectId"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("customer_notices_user_idx").on(t.userId, t.createdAt),
}));
export type CustomerNotice = typeof customerNotices.$inferSelect;

export const customerQuoteRevisions = mysqlTable("customer_quote_revisions", {
  id: int("id").autoincrement().primaryKey(),
  orderRequestId: int("orderRequestId").notNull(),
  userId: int("userId").notNull(),
  note: text("note").notNull(),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
}, (t) => ({
  orderIdx: index("customer_quote_revisions_order_idx").on(t.orderRequestId),
}));
export type CustomerQuoteRevision = typeof customerQuoteRevisions.$inferSelect;

// ─── Media Library ─────────────────────────────────────────────────────────────
// Admin-managed image library. Stores CDN URLs for images uploaded via the
// Media Library admin page. Supports folders (e.g. "Cabinet Drawings").
export const mediaImages = mysqlTable("media_images", {
  id:          int("id").primaryKey().autoincrement(),
  folder:      varchar("folder", { length: 128 }).notNull().default("General"),
  label:       varchar("label", { length: 256 }).notNull(),
  url:         varchar("url", { length: 512 }).notNull(),
  fileKey:     varchar("fileKey", { length: 512 }),           // S3/storage key
  mimeType:    varchar("mimeType", { length: 64 }),
  sizeBytes:   int("sizeBytes"),
  uploadedBy:  int("uploadedBy"),                             // FK to users.id
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
});
export type MediaImageRow = typeof mediaImages.$inferSelect;
export type InsertMediaImage = typeof mediaImages.$inferInsert;

// ─── Affiliate Literature Library ─────────────────────────────────────────────
// Administrator-managed PDFs and other sales literature prepared for affiliates.
// Files live in object storage; this table stores searchable metadata and the
// publication flag used when an affiliate-facing library is enabled.
export const affiliateLiterature = mysqlTable("affiliate_literature", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }).default("General").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  sizeBytes: int("sizeBytes"),
  isPublished: boolean("isPublished").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  uploadedBy: int("uploadedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("affiliate_literature_category_idx").on(table.category, table.sortOrder),
  index("affiliate_literature_published_idx").on(table.isPublished, table.sortOrder),
]);
export type AffiliateLiterature = typeof affiliateLiterature.$inferSelect;
export type InsertAffiliateLiterature = typeof affiliateLiterature.$inferInsert;

// Admin-managed sales education for the affiliate Marketing Hub.
// Files use the private storage prefix affiliate-resources/ and are served
// to signed-in affiliates with a signed URL, not the public media bucket.
export const affiliateResourceTypes = ["script", "guide", "video", "pdf", "social", "link"] as const;
export const affiliateResources = mysqlTable("affiliate_resources", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", affiliateResourceTypes).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  url: varchar("url", { length: 1024 }),
  fileKey: varchar("fileKey", { length: 512 }),
  filename: varchar("filename", { length: 255 }),
  mimeType: varchar("mimeType", { length: 128 }),
  sizeBytes: int("sizeBytes"),
  thumbnailKey: varchar("thumbnailKey", { length: 512 }),
  category: varchar("category", { length: 64 }).default("general").notNull(),
  metaJson: json("metaJson").$type<AffiliateResourceMeta | null>(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isPublished: boolean("isPublished").default(false).notNull(),
  featured: boolean("featured").default(false).notNull(),
  uploadedBy: int("uploadedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("affiliate_resources_type_sort_idx").on(table.type, table.sortOrder),
  index("affiliate_resources_published_idx").on(table.isPublished, table.sortOrder),
]);
export type AffiliateResource = typeof affiliateResources.$inferSelect;
export type InsertAffiliateResource = typeof affiliateResources.$inferInsert;

export const affiliateResourceProgress = mysqlTable("affiliate_resource_progress", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  resourceId: int("resourceId").notNull(),
  completed: boolean("completed").default(false).notNull(),
  progressPercent: int("progressPercent").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("affiliate_resource_progress_user_resource_uq").on(table.userId, table.resourceId),
]);
export type AffiliateResourceProgress = typeof affiliateResourceProgress.$inferSelect;

// ─── Freight quote history (permanent, never pruned) ───────────────────────
export const freightQuoteHistory = mysqlTable("freight_quote_history", {
  id: int("id").autoincrement().primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Present only when the caller supplied a saved plan that the server verified
  // they may access. Quote history never infers a plan from rate inputs.
  kitchenDesignId: int("kitchenDesignId"),
  broker: varchar("broker", { length: 40 }).notNull(),
  environment: varchar("environment", { length: 20 }),
  fromZip: varchar("fromZip", { length: 12 }).notNull(),
  toZip: varchar("toZip", { length: 12 }).notNull(),
  palletCount: int("palletCount").notNull().default(0),
  totalWeightLbs: decimal("totalWeightLbs", { precision: 10, scale: 2 }).notNull().default("0"),
  freightClass: varchar("freightClass", { length: 20 }),
  accessorials: text("accessorials"),
  ok: boolean("ok").notNull().default(false),
  amountCents: int("amountCents").notNull().default(0),
  carrier: varchar("carrier", { length: 120 }),
  service: varchar("service", { length: 160 }),
  error: text("error"),
  durationMs: int("durationMs"),
  packagesJson: text("packagesJson"),
}, (t) => ({
  kitchenDesignIdx: index("freight_quote_history_kitchen_design_idx").on(t.kitchenDesignId),
}));

// ─── Vendor order fulfillment ─────────────────────────────────────────────────
// One row per (order request, supplying vendor). A single customer order can mix
// cabinets from one distributor, Pelican surfaces/fixtures and Hardware
// Resources, and each of those vendors ships its own boxes with its own carrier
// and tracking number. vendorScope is "pelican" or "dist:<distributorId>".
export const orderShipments = mysqlTable("order_shipments", {
  id: int("id").autoincrement().primaryKey(),
  orderRequestId: int("orderRequestId").notNull(),
  vendorScope: varchar("vendorScope", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["pending", "shipped"]).default("pending").notNull(),
  carrier: varchar("carrier", { length: 64 }),
  trackingNumber: varchar("trackingNumber", { length: 128 }),
  packageCount: int("packageCount").default(1).notNull(),
  notes: varchar("notes", { length: 1000 }),
  labelPrintedAt: timestamp("labelPrintedAt"),
  shippedAt: timestamp("shippedAt"),
  shippedByUserId: int("shippedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  orderScopeUnique: uniqueIndex("order_shipments_order_scope_uq").on(t.orderRequestId, t.vendorScope),
  scopeStatusIdx: index("order_shipments_scope_status_idx").on(t.vendorScope, t.status),
}));
export type OrderShipment = typeof orderShipments.$inferSelect;

// ─── Sales forecast close-rate brackets ───────────────────────────────────────
// Placeholder defaults are seeded by the migration when the table is empty.
// Age is measured from kitchen_designs.updatedAt. maxDays null means open-ended.
export const salesForecastCloseBrackets = mysqlTable("sales_forecast_close_brackets", {
  id: int("id").autoincrement().primaryKey(),
  minDays: int("minDays").notNull(),
  maxDays: int("maxDays"),
  closePercent: int("closePercent").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const pricingSettingAudit = mysqlTable("pricing_setting_audit", {
  id: int("id").autoincrement().primaryKey(),
  field: varchar("field", { length: 64 }).notNull(),
  oldValue: varchar("oldValue", { length: 64 }),
  newValue: varchar("newValue", { length: 64 }),
  userId: int("userId"),
  openId: varchar("openId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const vendorInventoryApiKeys = mysqlTable("vendor_inventory_api_keys", {
  id: int("id").autoincrement().primaryKey(),
  vendorScope: varchar("vendorScope", { length: 32 }).notNull(),
  keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(),
  keyHash: varchar("keyHash", { length: 64 }).notNull(),
  createdByUserId: int("createdByUserId"),
  revokedAt: timestamp("revokedAt"),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  hashUnique: uniqueIndex("vendor_inventory_api_keys_hash_uq").on(t.keyHash),
  scopeIdx: index("vendor_inventory_api_keys_scope_idx").on(t.vendorScope),
}));

export const vendorPriceIncreases = mysqlTable("vendor_price_increases", {
  id: int("id").autoincrement().primaryKey(),
  vendorScope: varchar("vendorScope", { length: 32 }).notNull(),
  productTable: varchar("productTable", { length: 32 }).notNull(),
  productId: int("productId").notNull(),
  sku: varchar("sku", { length: 128 }).notNull(),
  scope: mysqlEnum("scope", ["product", "category", "style", "catalog"]).default("product").notNull(),
  currentWholesale: decimal("currentWholesale", { precision: 10, scale: 2 }),
  nextWholesale: decimal("nextWholesale", { precision: 10, scale: 2 }).notNull(),
  effectiveDate: varchar("effectiveDate", { length: 10 }),
  note: varchar("note", { length: 512 }),
  status: mysqlEnum("status", ["pending", "acknowledged", "applied", "dismissed"]).default("pending").notNull(),
  createdByUserId: int("createdByUserId"),
  reviewedByUserId: int("reviewedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
});

export const vendorAdminUpdates = mysqlTable("vendor_admin_updates", {
  id: int("id").autoincrement().primaryKey(),
  vendorScope: varchar("vendorScope", { length: 32 }).notNull(),
  type: mysqlEnum("type", ["inventory_sync", "low_stock", "price_increase", "out_of_stock"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  sku: varchar("sku", { length: 128 }),
  readAt: timestamp("readAt"),
  acknowledgedAt: timestamp("acknowledgedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const vendorCatalogEditLog = mysqlTable("vendor_catalog_edit_log", {
  id: int("id").autoincrement().primaryKey(),
  vendorScope: varchar("vendorScope", { length: 32 }).notNull(),
  productTable: varchar("productTable", { length: 32 }).notNull(),
  productId: int("productId").notNull(),
  field: varchar("field", { length: 64 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  userId: int("userId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const doorStyleSampleOffers = mysqlTable("door_style_sample_offers", {
  id: int("id").autoincrement().primaryKey(),
  distributorId: int("distributorId").notNull(),
  styleId: int("styleId").notNull(),
  available: boolean("available").default(false).notNull(),
  /** Linked existing catalog sample door. Never a newly created public cabinet. */
  catalogCabinetId: int("catalogCabinetId"),
  sampleSku: varchar("sampleSku", { length: 128 }),
  price: decimal("price", { precision: 10, scale: 2 }),
  leadTimeDays: int("leadTimeDays"),
  notes: varchar("notes", { length: 512 }),
  updatedByUserId: int("updatedByUserId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  styleUnique: uniqueIndex("door_style_sample_offers_style_uq").on(t.distributorId, t.styleId),
}));

export const sampleKits = mysqlTable("sample_kits", {
  id: int("id").autoincrement().primaryKey(),
  distributorId: int("distributorId").notNull(),
  name: varchar("name", { length: 191 }).notNull(),
  description: text("description"),
  /** Customer charge as entered, including 0 for free. Not a wholesale input. */
  price: decimal("price", { precision: 10, scale: 2 }),
  isFree: boolean("isFree").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  imageUrl: varchar("imageUrl", { length: 512 }),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const sampleKitItems = mysqlTable("sample_kit_items", {
  id: int("id").autoincrement().primaryKey(),
  kitId: int("kitId").notNull(),
  styleId: int("styleId").notNull(),
  qty: int("qty").default(1).notNull(),
}, (t) => ({
  kitStyleUnique: uniqueIndex("sample_kit_items_kit_style_uq").on(t.kitId, t.styleId),
}));

// ─── CRM cleanup (admin preview, backup, audit) ──────────────────────────────
// Preview rows store the exact id snapshot an admin reviewed. Confirm deletes
// only that snapshot, and only after a fresh read still hashes to the same plan.
// Backup rows keep a redacted JSON copy of every affected record.

export const crmCleanupPreviews = mysqlTable("crm_cleanup_previews", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").notNull(),
  planHash: varchar("planHash", { length: 64 }).notNull(),
  keepUserIdsJson: json("keepUserIdsJson").$type<number[]>().notNull(),
  alsoDeleteUserIdsJson: json("alsoDeleteUserIdsJson").$type<number[]>().notNull(),
  deleteSupabaseAuth: boolean("deleteSupabaseAuth").default(false).notNull(),
  snapshotJson: json("snapshotJson").$type<Record<string, unknown>>().notNull(),
  countsJson: json("countsJson").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

export type CrmCleanupPreview = typeof crmCleanupPreviews.$inferSelect;

export const crmCleanupAudit = mysqlTable("crm_cleanup_audit", {
  id: int("id").autoincrement().primaryKey(),
  previewId: int("previewId").notNull(),
  actorUserId: int("actorUserId").notNull(),
  actorName: varchar("actorName", { length: 256 }),
  actorEmail: varchar("actorEmail", { length: 320 }),
  status: mysqlEnum("status", ["running", "completed", "failed"]).notNull(),
  keepUserIdsJson: json("keepUserIdsJson").$type<number[]>().notNull(),
  countsJson: json("countsJson").$type<Record<string, unknown>>(),
  supabaseOptIn: boolean("supabaseOptIn").default(false).notNull(),
  supabaseDeleted: int("supabaseDeleted").default(0).notNull(),
  supabaseFailed: int("supabaseFailed").default(0).notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
}, (t) => ({
  createdIdx: index("crm_cleanup_audit_created_idx").on(t.createdAt),
}));

export type CrmCleanupAudit = typeof crmCleanupAudit.$inferSelect;

export const crmCleanupBackupRows = mysqlTable("crm_cleanup_backup_rows", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("auditId").notNull(),
  tableName: varchar("tableName", { length: 64 }).notNull(),
  rowPk: int("rowPk").notNull(),
  rowJson: json("rowJson").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  auditIdx: index("crm_cleanup_backup_rows_audit_idx").on(t.auditId),
}));

export type CrmCleanupBackupRow = typeof crmCleanupBackupRows.$inferSelect;
