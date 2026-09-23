import crypto from "node:crypto";
import { and, eq, sql, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, cabinets, vendorLines, distributors, distributorSkus } from "../drizzle/schema";
import { ENV } from './_core/env';

/**
 * A retired duplicate keeps its historical database record, supplier price rows,
 * and order references, but its master code must never be emitted as a second
 * product when its alias mapping resolves to a canonical cabinet with a real
 * supplier source. Configuration review may deliberately keep the canonical
 * master inactive, but that must not surface a duplicate alias as falsely
 * "No linked distributor" in Cabinet Attention. Checking the target cabinet
 * (rather than only the source record) lets historic alias cycles coexist
 * temporarily without hiding their live canonical record. The retired code
 * remains discoverable through the canonical cabinet's alias map.
 */
export function isCanonicalCabinetMaster() {
  return sql`NOT EXISTS (
      SELECT 1
      FROM sku_master_aliases canonical_sku_alias
      INNER JOIN cabinets canonical_cabinet
        ON canonical_cabinet.masterCode = canonical_sku_alias.masterCode
      WHERE canonical_sku_alias.aliasCode = ${cabinets.masterCode}
        AND canonical_sku_alias.conflictStatus = 'ok'
        -- A canonical code may be deliberately retained as its own search
        -- alias (for example B15 → B15). That preserves lookup history but
        -- must never retire the canonical cabinet from public detail routes.
        AND canonical_cabinet.id <> ${cabinets.id}
        AND (
          canonical_cabinet.isActive = true
          OR canonical_cabinet.showInCatalog = true
          OR canonical_cabinet.showInDesigner = true
          OR EXISTS (
            SELECT 1
            FROM distributor_skus canonical_supplier_sku
            WHERE canonical_supplier_sku.cabinetId = canonical_cabinet.id
          )
        )
    )`;
}

/**
 * A customer-facing cabinet must have at least one live supplier source with a
 * positive list price or a positive cost from which the controlled price ladder
 * can derive a sell price. This keeps incomplete imported records visible to
 * administrators, but prevents $0.00 products from reaching Catalog, Designer,
 * cart, or invoices.
 */
export function hasPositivePublishedCabinetPrice() {
  return sql`EXISTS (
    SELECT 1
    FROM distributor_skus sellable_price
    WHERE sellable_price.cabinetId = \`cabinets\`.\`id\`
      AND sellable_price.isAvailable = true
      AND sellable_price.isPublished = true
      AND (COALESCE(sellable_price.listPrice, 0) > 0 OR COALESCE(sellable_price.yourCost, 0) > 0)
  )`;
}

// Shared public-catalog predicate: exclude inactive records, items held in admin
// "conflict", and retired duplicate masters from catalog, storefront, Designer,
// order, OCR, and price-shop queries. Each alias continues to resolve to its
// canonical active item.
export function notInConflict() {
  return and(
    eq(cabinets.isActive, true),
    ne(cabinets.conflictStatus, "conflict"),
    isCanonicalCabinetMaster(),
    hasPositivePublishedCabinetPrice(),
  );
}

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Email/password auth helpers ──────────────────────────────────────────────

export async function getUserByEmailLower(emailLower: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.emailLower, emailLower))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Create a new email/password account. Generates a synthetic openId so the row
 * coexists with Manus OAuth users (which key on the OAuth openId). The configured
 * owner email is auto-promoted to admin.
 */
export async function createEmailUser(params: {
  email: string;
  emailLower: string;
  passwordHash: string;
  name?: string | null;
  companyName?: string | null;
  inviteToken?: string | null;
}): Promise<{ id: number; openId: string } | null> {
  const db = await getDb();
  if (!db) return null;

  const openId = `email_${crypto.randomUUID()}`;
  const isOwner = params.emailLower === (ENV.ownerEmail ?? "").toLowerCase();

  // Check if this signup is via a vendor invite token
  let role: "admin" | "user" | "distributor" = isOwner ? "admin" : "user";
  let distributorId: number | null = null;

  if (params.inviteToken) {
    const [vendorLine] = await db
      .select()
      .from(vendorLines)
      .where(eq(vendorLines.inviteToken, params.inviteToken))
      .limit(1);
    if (vendorLine) {
      role = "distributor";
      // Try to find the matching distributor by name
      const [dist] = await db
        .select()
        .from(distributors)
        .where(eq(distributors.name, vendorLine.name))
        .limit(1);
      if (dist) distributorId = dist.id;
    }
  }

  await db.insert(users).values({
    openId,
    name: params.name ?? null,
    email: params.email,
    emailLower: params.emailLower,
    passwordHash: params.passwordHash,
    loginMethod: "password",
    companyName: params.companyName ?? null,
    role,
    distributorId,
    lastSignedIn: new Date(),
  });

  const created = await getUserByEmailLower(params.emailLower);
  return created ? { id: created.id, openId: created.openId } : null;
}

export async function recordLoginResult(
  userId: number,
  ok: boolean,
  lockedUntil?: Date | null
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (ok) {
    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastSignedIn: new Date() })
      .where(eq(users.id, userId));
  } else {
    await db
      .update(users)
      .set({ failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`, lockedUntil: lockedUntil ?? null })
      .where(eq(users.id, userId));
  }
}

export async function setPasswordHash(userId: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// ─── Pricing & Margins ────────────────────────────────────────────────────────
import { pricingSettings, type PricingSettings } from "../drizzle/schema";

const DEFAULT_PRICING_SETTINGS = {
  globalMarkupBps: 10000,
  homeownerMarkupBps: 10000,
  contractorMarkupBps: 10000,
  wholesaleMarkupBps: 10000,
};

// Read the single pricing-settings row, seeding defaults if the table is empty.
// Falls back to in-memory defaults when no DB is configured (local tooling/tests).
export async function getPricingSettings(): Promise<
  Pick<
    PricingSettings,
    | "globalMarkupBps"
    | "homeownerMarkupBps"
    | "contractorMarkupBps"
    | "wholesaleMarkupBps"
  >
> {
  const db = await getDb();
  if (!db) return { ...DEFAULT_PRICING_SETTINGS };
  const rows = await db.select().from(pricingSettings).limit(1);
  if (rows.length === 0) {
    await db.insert(pricingSettings).values({ ...DEFAULT_PRICING_SETTINGS });
    return { ...DEFAULT_PRICING_SETTINGS };
  }
  const r = rows[0];
  return {
    globalMarkupBps: r.globalMarkupBps,
    homeownerMarkupBps: r.homeownerMarkupBps,
    contractorMarkupBps: r.contractorMarkupBps,
    wholesaleMarkupBps: r.wholesaleMarkupBps,
  };
}

export async function updatePricingSettings(
  patch: Partial<
    Pick<
      PricingSettings,
      | "globalMarkupBps"
      | "homeownerMarkupBps"
      | "contractorMarkupBps"
      | "wholesaleMarkupBps"
    >
  >,
  updatedByOpenId?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(pricingSettings).limit(1);
  const values = { ...patch, updatedByOpenId: updatedByOpenId ?? null };
  if (rows.length === 0) {
    await db.insert(pricingSettings).values({ ...DEFAULT_PRICING_SETTINGS, ...values });
  } else {
    await db.update(pricingSettings).set(values).where(eq(pricingSettings.id, rows[0].id));
  }
}

/**
 * Synchronize the stored wholesale, contractor, and homeowner/retail columns
 * with the current tier markups. Public storefront pricing is already derived
 * at read time, but administration, exports, and legacy workflows also read
 * these persisted columns and must see the same numbers.
 *
 * Cost is deliberately taken only from the durable source columns — `yourCost`
 * (the distributor multiplier result), `adjustedListPrice`, or `listPrice`.
 * A previously calculated wholesale sell price is never used as the next base,
 * so repeated recalculations cannot compound a markup.
 */
export type TierPriceRecalculation = {
  /** All SKU rows whose durable cost can be re-priced. */
  updated: number;
  /** Rows whose homeowner/contractor/wholesale values were refreshed from cost. */
  costPlusTier: number;
  /** Retained only for backward-compatible audit responses; markup rules now apply to every tier. */
  sourceListRetail: number;
  /** Rows without a durable cost/list input; intentionally never given an invented price. */
  skippedUnpriced: number;
  /** Public rows made unavailable because a verified source price/cost is absent. */
  unpublishedUnpriced: number;
};

export async function recalculateStoredTierPrices(
  settings?: Pick<
    PricingSettings,
    "homeownerMarkupBps" | "contractorMarkupBps" | "wholesaleMarkupBps"
  >,
): Promise<TierPriceRecalculation> {
  const db = await getDb();
  if (!db) {
    return {
      updated: 0,
      costPlusTier: 0,
      sourceListRetail: 0,
      skippedUnpriced: 0,
      unpublishedUnpriced: 0,
    };
  }
  const activeSettings = settings ?? await getPricingSettings();
  const homeownerMultiplier = Number(activeSettings.homeownerMarkupBps) / 10000;
  const contractorMultiplier = Number(activeSettings.contractorMarkupBps) / 10000;
  const wholesaleMultiplier = Number(activeSettings.wholesaleMarkupBps) / 10000;
  const durableCost = sql`COALESCE(${distributorSkus.yourCost}, ${distributorSkus.adjustedListPrice}, ${distributorSkus.listPrice})`;
  const hasAuthorizedBase = sql`${durableCost} IS NOT NULL AND ${durableCost} > 0`;
  const lacksAuthorizedBase = sql`${durableCost} IS NULL OR ${durableCost} <= 0`;
  const [audit] = await db
    .select({
      updated: sql<number>`SUM(CASE WHEN ${hasAuthorizedBase} THEN 1 ELSE 0 END)`,
      sourceListRetail: sql<number>`0`,
      skippedUnpriced: sql<number>`SUM(CASE WHEN ${lacksAuthorizedBase} THEN 1 ELSE 0 END)`,
      unpublishedUnpriced: sql<number>`SUM(CASE WHEN ${lacksAuthorizedBase} AND (${distributorSkus.isAvailable} = 1 OR ${distributorSkus.isPublished} = 1) THEN 1 ELSE 0 END)`,
    })
    .from(distributorSkus)
    ;

  const updated = Number(audit?.updated ?? 0);
  const sourceListRetail = Number(audit?.sourceListRetail ?? 0);
  const skippedUnpriced = Number(audit?.skippedUnpriced ?? 0);
  const unpublishedUnpriced = Number(audit?.unpublishedUnpriced ?? 0);

  await db
    .update(distributorSkus)
    .set({
      wholesalePrice: sql`ROUND(${durableCost} * ${wholesaleMultiplier}, 2)`,
      contractorPrice: sql`ROUND(${durableCost} * ${contractorMultiplier}, 2)`,
      homeownerPrice: sql`ROUND(${durableCost} * ${homeownerMultiplier}, 2)`,
    })
    .where(hasAuthorizedBase);

  // Customer-facing inventory cannot be active/published without a verified
  // source cost/list basis. Preserve the source record for audit and future
  // pricing, but remove it from every sellable surface instead of exposing $0
  // or a guessed price.
  await db
    .update(distributorSkus)
    .set({ isAvailable: false, isPublished: false })
    .where(lacksAuthorizedBase);

  return {
    updated,
    costPlusTier: Math.max(0, updated - sourceListRetail),
    sourceListRetail,
    skippedUnpriced,
    unpublishedUnpriced,
  };
}

// ─── Platform fee system (price ladder + order fee stack) ──────────────────────
import {
  platformPricingSettings,
  type PlatformPricingSettingsRow,
} from "../drizzle/schema";
import {
  DEFAULT_PRICING_SETTINGS as DEFAULT_FEE_SETTINGS,
  type PlatformPricingSettings,
} from "../shared/pricing";

type FeeSettingKeys =
  | "wholesaleMarkupBps"
  | "affiliateMarkupBps"
  | "retailMarkupBps"
  | "damageFeeBps"
  | "techFeeBps"
  | "techFeeCapCents"
  | "cardFeeBps";

// Read the single platform-fee-settings row, seeding defaults if empty. Falls
// back to the in-memory engine defaults when no DB is configured (tests/tooling).
export async function getPlatformPricingSettings(): Promise<PlatformPricingSettings> {
  const db = await getDb();
  if (!db) return { ...DEFAULT_FEE_SETTINGS };
  const rows = await db.select().from(platformPricingSettings).limit(1);
  if (rows.length === 0) {
    await db.insert(platformPricingSettings).values({ ...DEFAULT_FEE_SETTINGS });
    return { ...DEFAULT_FEE_SETTINGS };
  }
  const r = rows[0];
  return {
    wholesaleMarkupBps: r.wholesaleMarkupBps,
    affiliateMarkupBps: r.affiliateMarkupBps,
    retailMarkupBps: r.retailMarkupBps,
    damageFeeBps: r.damageFeeBps,
    techFeeBps: r.techFeeBps,
    techFeeCapCents: r.techFeeCapCents,
    cardFeeBps: r.cardFeeBps,
  };
}

export async function updatePlatformPricingSettings(
  patch: Partial<Pick<PlatformPricingSettingsRow, FeeSettingKeys>>,
  updatedByOpenId?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(platformPricingSettings).limit(1);
  const values = { ...patch, updatedByOpenId: updatedByOpenId ?? null };
  if (rows.length === 0) {
    await db.insert(platformPricingSettings).values({ ...DEFAULT_FEE_SETTINGS, ...values });
  } else {
    await db.update(platformPricingSettings).set(values).where(eq(platformPricingSettings.id, rows[0].id));
  }
}


// ─── Split Pantry bundles ───────────────────────────────────────────────────
// A Split Pantry is a top wall cabinet (W-series) stacked on a tall bottom wall
// cabinet (UCB-series). The pantry_bundles table pairs the two part master codes
// per distributor + door style + width + total height. We price a bundle by
// summing the two REAL part SKUs' tier prices (the stored bundle price columns
// were seeded equal across tiers and are not authoritative), so a Split Pantry
// prices exactly like adding its two parts individually.
import { pantryBundles, doorStyles } from "../drizzle/schema";
import { inArray } from "drizzle-orm";

export type SplitPantryPartPrices = {
  masterCode: string;
  description: string;
  distributorSku: string | null;
  listPrice: string | null;
  adjustedListPrice: string | null;
  wholesalePrice: string | null;
  contractorPrice: string | null;
  homeownerPrice: string | null;
  yourCost: string | null;
  retailPriceBasis: "cost_plus_tier" | "source_list";
};

export type SplitPantryBundleRow = {
  platformSku: string;
  distributorId: number;
  styleId: number;
  width: number;
  totalHeight: number;
  topSku: string;
  bottomSku: string;
  top: SplitPantryPartPrices | null;
  bottom: SplitPantryPartPrices | null;
};

// Fetch the real part-SKU price rows for a set of (distributor, style, masterCode).
async function loadPartPrices(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  distributorId: number,
  styleId: number,
  masterCodes: string[],
): Promise<Map<string, SplitPantryPartPrices>> {
  const map = new Map<string, SplitPantryPartPrices>();
  if (masterCodes.length === 0) return map;
  const rows = await db
    .select({
      masterCode: cabinets.masterCode,
      description: cabinets.description,
      distributorSku: distributorSkus.distributorSku,
      listPrice: distributorSkus.listPrice,
      adjustedListPrice: distributorSkus.adjustedListPrice,
      wholesalePrice: distributorSkus.wholesalePrice,
      contractorPrice: distributorSkus.contractorPrice,
      homeownerPrice: distributorSkus.homeownerPrice,
      yourCost: distributorSkus.yourCost,
      retailPriceBasis: distributors.retailPriceBasis,
    })
    .from(distributorSkus)
    .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
    .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
    .where(
      and(
        eq(distributorSkus.distributorId, distributorId),
        eq(distributorSkus.styleId, styleId),
        inArray(cabinets.masterCode, masterCodes),
      ),
    );
  for (const r of rows) {
    map.set(r.masterCode, r as SplitPantryPartPrices);
  }
  return map;
}

/** All split-pantry bundles for one door style, with real part prices attached. */
export async function getSplitPantriesByStyle(styleId: number): Promise<SplitPantryBundleRow[]> {
  const db = await getDb();
  if (!db) return [];
  const bundles = await db
    .select()
    .from(pantryBundles)
    .where(eq(pantryBundles.styleId, styleId));
  if (bundles.length === 0) return [];
  const distributorId = bundles[0].distributorId;
  const codes = Array.from(
    new Set(bundles.flatMap((b) => [b.topSku, b.bottomSku])),
  );
  const parts = await loadPartPrices(db, distributorId, styleId, codes);
  return bundles.map((b) => ({
    platformSku: b.platformSku,
    distributorId: b.distributorId,
    styleId: b.styleId,
    width: b.width,
    totalHeight: b.totalHeight,
    topSku: b.topSku,
    bottomSku: b.bottomSku,
    top: parts.get(b.topSku) ?? null,
    bottom: parts.get(b.bottomSku) ?? null,
  }));
}

/** One split-pantry bundle by its platform SKU, with real part prices attached. */
export async function getSplitPantryBySku(platformSku: string): Promise<SplitPantryBundleRow | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(pantryBundles)
    .where(eq(pantryBundles.platformSku, platformSku))
    .limit(1);
  const b = rows[0];
  if (!b) return null;
  const parts = await loadPartPrices(db, b.distributorId, b.styleId, [b.topSku, b.bottomSku]);
  return {
    platformSku: b.platformSku,
    distributorId: b.distributorId,
    styleId: b.styleId,
    width: b.width,
    totalHeight: b.totalHeight,
    topSku: b.topSku,
    bottomSku: b.bottomSku,
    top: parts.get(b.topSku) ?? null,
    bottom: parts.get(b.bottomSku) ?? null,
  };
}

/** Door styles that actually have split-pantry bundles (for gating UI entry points). */
export async function getSplitPantryStyleIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ styleId: pantryBundles.styleId })
    .from(pantryBundles)
    .groupBy(pantryBundles.styleId);
  return rows.map((r) => r.styleId);
}

/** Resolve a door style row (id, code, label) for split-pantry presentation. */
export async function getDoorStyleById(styleId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(doorStyles).where(eq(doorStyles.id, styleId)).limit(1);
  return rows[0] ?? null;
}
