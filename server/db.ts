import crypto from "node:crypto";
import { and, eq, isNull, or, sql, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import { InsertUser, users, cabinets, vendorLines, distributors, distributorSkus, affiliates } from "../drizzle/schema";
import { ENV } from './_core/env';
import {
  approvedVendorContactAccess,
  approvedVendorMatchesDistributor,
} from "./lib/approvedVendorAccess";
import { installMysqlPoolFreeShippingGuard, primeCabinetFreeShippingColumn } from "./lib/cabinetFreeShippingSchema";
import { linkApprovedContractorAccess } from "./lib/contractorAccessGrant";
import { isOwnerEmail, shouldPromoteOwnerToAdmin } from "./lib/ownerAdmin";
import { runSignupAffiliateStamp } from "./lib/signupAffiliateStamp";

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

// Shared public-catalog predicate: exclude inactive records and retired
// duplicate masters from catalog, storefront, Designer, order, OCR, and
// price-shop queries. Each alias continues to resolve to its canonical active
// item.
//
// Cabinet Conflict no longer hides an item. A PUBLISHED item (active, canonical,
// with a positive published price) stays usable everywhere, including the
// Designer, where admins see a dismissible notice (see
// client/src/lib/cabinetConflictNotice.ts). An item with no published price is
// still excluded by hasPositivePublishedCabinetPrice(). The name is kept so the
// many callers do not change.
export function notInConflict() {
  return and(
    eq(cabinets.isActive, true),
    isCanonicalCabinetMaster(),
    hasPositivePublishedCabinetPrice(),
  );
}

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = createPool({ uri: process.env.DATABASE_URL });
      installMysqlPoolFreeShippingGuard(pool);
      _db = drizzle(pool);
      await primeCabinetFreeShippingColumn(pool.promise());
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * An owner may authenticate through email/password and through more than one
 * OAuth provider, each with a distinct OpenID. Owner access must follow the
 * configured, normalized owner email as well as the legacy explicit OpenID.
 */
export function isOwnerIdentity(
  user: Pick<InsertUser, "openId" | "email">,
  owner: Pick<typeof ENV, "ownerOpenId" | "ownerEmail"> = ENV,
): boolean {
  const ownerOpenId = owner.ownerOpenId.trim();
  const ownerEmail = owner.ownerEmail.trim().toLowerCase();
  const email = user.email?.trim().toLowerCase() ?? "";
  return Boolean(
    (ownerOpenId && user.openId === ownerOpenId)
    || (ownerEmail && email === ownerEmail),
  );
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
    // Explicitly preserve the platform owner's access even if a provider sends
    // a default "user" role on a later OAuth identity with the same email.
    if (isOwnerIdentity(user)) {
      values.role = 'admin';
      updateSet.role = 'admin';
    } else if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
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
    // Legacy OAuth upsert. Supabase sign-in uses createEmailUser and
    // authenticateSupabaseBearer, which call the same linker. An approved
    // affiliate contractor request for this email is linked here too.
    const saved = await getUserByOpenId(user.openId);
    if (saved) await linkApprovedContractorAccess(db, saved);
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

// ─── Supabase Auth helpers ────────────────────────────────────────────────────

export async function getUserByAuthId(authId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.authId, authId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Link a users row to a Supabase auth user and record the provider that
 * actually authenticated. Never overwrites an existing different authId.
 */
export async function linkUserAuthId(
  userId: number,
  authId: string,
  loginMethod: string | null
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({
      authId,
      lastSignedIn: new Date(),
      ...(loginMethod ? { loginMethod } : {}),
    })
    .where(and(eq(users.id, userId), or(isNull(users.authId), eq(users.authId, authId))));
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
 * Resolves the one approved vendor record for an exact contact email. Its
 * distributor line is optional so an approved supplier can maintain its own
 * profile before catalog/source-line onboarding is complete.
 */
async function approvedVendorAccessForEmail(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  emailLower: string
): Promise<{ vendorLineId: number; distributorId: number | null } | null> {
  const [vendorRows, distributorRows] = await Promise.all([
    db
      .select({
        id: vendorLines.id,
        sourceKey: vendorLines.sourceKey,
        contactEmail: vendorLines.contactEmail,
        isApproved: vendorLines.isApproved,
      })
      .from(vendorLines)
      .where(eq(vendorLines.isApproved, true)),
    db
      .select({ id: distributors.id, code: distributors.code, isActive: distributors.isActive })
      .from(distributors),
  ]);

  return approvedVendorContactAccess(emailLower, vendorRows, distributorRows);
}

/**
 * Create a new email/password account. Generates a synthetic openId so the row
 * coexists with Manus OAuth users (which key on the OAuth openId). The configured
 * owner email is auto-promoted to admin.
 */
export async function createEmailUser(params: {
  email: string;
  emailLower: string;
  // Null for Supabase Auth accounts, whose credentials live in Supabase.
  passwordHash: string | null;
  name?: string | null;
  companyName?: string | null;
  inviteToken?: string | null;
  authId?: string | null;
  loginMethod?: string | null;
  /** Storefront slug from signup. "owner" and a missing store leave the column null. */
  signupStoreScope?: string | null;
}): Promise<{ id: number; openId: string } | null> {
  const db = await getDb();
  if (!db) return null;

  const openId = `email_${crypto.randomUUID()}`;
  const isOwner = isOwnerEmail(params.emailLower, ENV.ownerEmail);

  // An approved vendor's saved contact email is the vendor's self-service
  // credential. This enables every properly configured approved supplier to
  // create a password without revealing a line ID or requiring a separate
  // invitation. Owner credentials always remain administrator credentials.
  let role: "admin" | "user" | "distributor" = isOwner ? "admin" : "user";
  let distributorId: number | null = null;
  let approvedVendorLineId: number | null = null;

  if (!isOwner) {
    const approvedVendorAccess = await approvedVendorAccessForEmail(db, params.emailLower);
    if (approvedVendorAccess) {
      role = "distributor";
      distributorId = approvedVendorAccess.distributorId;
      approvedVendorLineId = approvedVendorAccess.vendorLineId;
    }
  }

  // A private, administrator-generated setup link lets any approved vendor
  // choose its own supplier-login email and password. It is intentionally a
  // one-time credential: sharing it gives only that approved supplier scope,
  // and it is cleared after the first successful account creation.
  let consumedInviteVendorLineId: number | null = null;
  if (params.inviteToken) {
    const [vendorLine] = await db
      .select()
      .from(vendorLines)
      .where(and(eq(vendorLines.inviteToken, params.inviteToken), eq(vendorLines.isApproved, true)))
      .limit(1);
    if (!vendorLine) {
      throw new Error("This supplier setup link is invalid or has already been used. Ask Cabinet Dealz for a new link.");
    }
    if (!isOwner) {
      role = "distributor";
      approvedVendorLineId = vendorLine.id;
      consumedInviteVendorLineId = vendorLine.id;
      const distributorRows = await db
        .select({ id: distributors.id, code: distributors.code, name: distributors.name, isActive: distributors.isActive })
        .from(distributors);
      const sourceMatched = distributorRows.filter((dist) =>
        dist.isActive && approvedVendorMatchesDistributor(vendorLine, dist)
      );
      const legacyNameMatched = sourceMatched.length === 0
        ? distributorRows.filter((dist) => dist.isActive && dist.name === vendorLine.name)
        : [];
      const matched = sourceMatched.length === 1 ? sourceMatched[0] : legacyNameMatched.length === 1 ? legacyNameMatched[0] : null;
      if (matched) {
        distributorId = matched.id;
      }
    }
  }

  let signupAffiliateId: number | null = null;
  const signupSlug = params.signupStoreScope?.trim().toLowerCase() ?? "";
  if (signupSlug && signupSlug !== "owner") {
    const [store] = await db.select({ id: affiliates.id, status: affiliates.status })
      .from(affiliates)
      .where(eq(affiliates.slug, signupSlug))
      .limit(1);
    if (store?.status === "active") signupAffiliateId = store.id;
  }

  await db.insert(users).values({
    openId,
    name: params.name ?? null,
    email: params.email,
    emailLower: params.emailLower,
    passwordHash: params.passwordHash,
    authId: params.authId ?? null,
    loginMethod: params.loginMethod ?? "password",
    companyName: params.companyName ?? null,
    role,
    distributorId,
    approvedVendorLineId,
    signupAffiliateId,
    lastSignedIn: new Date(),
  });

  if (consumedInviteVendorLineId !== null && params.inviteToken) {
    const [consumedVendor] = await db
      .select({ contactEmail: vendorLines.contactEmail })
      .from(vendorLines)
      .where(eq(vendorLines.id, consumedInviteVendorLineId))
      .limit(1);
    await db
      .update(vendorLines)
      .set({
        inviteToken: null,
        // Do not replace a contact email that an administrator or the supplier
        // has already recorded. A first-time setup fills the otherwise blank
        // login identity so future sign-ins no longer require the setup link.
        ...(consumedVendor?.contactEmail?.trim() ? {} : { contactEmail: params.email.trim() }),
      })
      .where(and(eq(vendorLines.id, consumedInviteVendorLineId), eq(vendorLines.inviteToken, params.inviteToken)));
  }

  const created = await getUserByEmailLower(params.emailLower);
  if (!created) return null;
  // First sign-up. If an affiliate already had this email approved, link the
  // request and grant contractor when the new role is still user. Later
  // sign-ins run the same linker from authenticateSupabaseBearer, after owner
  // and vendor role sync, so an approval that lands after signup is picked up
  // on the next sign-in without downgrading admin or affiliate.
  await linkApprovedContractorAccess(db, created);
  return { id: created.id, openId: created.openId };
}

/** Sets users.signupAffiliateId only while it is still null. A failed stamp never throws. */
export async function assignSignupAffiliateOnce(userId: number, affiliateId: number | null): Promise<void> {
  if (affiliateId == null) return;
  const db = await getDb();
  if (!db) return;
  await runSignupAffiliateStamp(() => db.update(users)
    .set({ signupAffiliateId: affiliateId })
    .where(and(eq(users.id, userId), isNull(users.signupAffiliateId))));
}

/**
 * Applies newly configured approved-vendor access to an existing ordinary
 * password account at successful sign-in. Administrative and affiliate roles
 * are never altered here, and an unresolved/ambiguous vendor contact changes
 * nothing.
 */
export async function synchronizeApprovedVendorLogin<T extends { id: number; role: string; distributorId: number | null; approvedVendorLineId?: number | null }>(
  user: T,
  emailLower: string
): Promise<T> {
  if (user.role !== "user" && user.role !== "distributor") return user;
  const db = await getDb();
  if (!db) return user;
  const approvedVendorAccess = await approvedVendorAccessForEmail(db, emailLower);
  if (!approvedVendorAccess) return user;

  if (
    user.role !== "distributor"
    || user.distributorId !== approvedVendorAccess.distributorId
    || user.approvedVendorLineId !== approvedVendorAccess.vendorLineId
  ) {
    await db.update(users).set({
      role: "distributor",
      distributorId: approvedVendorAccess.distributorId,
      approvedVendorLineId: approvedVendorAccess.vendorLineId,
    }).where(eq(users.id, user.id));
  }
  return {
    ...user,
    role: "distributor",
    distributorId: approvedVendorAccess.distributorId,
    approvedVendorLineId: approvedVendorAccess.vendorLineId,
  };
}

/**
 * The owner email is an administrator on every sign-in, not only the first
 * time the row is created. A stale non-admin row otherwise matches affiliate
 * records that reuse the same mailbox and never reaches /admin.
 */
export async function promoteOwnerAdmin<T extends { id: number; role: string }>(
  user: T,
  email: string | null | undefined,
): Promise<T> {
  if (!shouldPromoteOwnerToAdmin(user.role, email, ENV.ownerEmail)) return user;
  const db = await getDb();
  if (!db) return user;
  try {
    await db.update(users).set({ role: "admin" }).where(and(eq(users.id, user.id), ne(users.role, "admin")));
  } catch (error) {
    console.warn("[Auth] Owner admin promotion skipped", error instanceof Error ? error.message : "unknown error");
    return user;
  }
  console.info(`[Auth] Promoted user ${user.id} to admin because the email matches the configured owner`);
  return { ...user, role: "admin" };
}

// ─── Pricing & Margins ────────────────────────────────────────────────────────
import { pricingSettingAudit, pricingSettings, type PricingSettings } from "../drizzle/schema";

const DEFAULT_PRICING_SETTINGS = {
  globalMarkupBps: 10000,
  homeownerMarkupBps: 10000,
  contractorMarkupBps: 10000,
  wholesaleMarkupBps: 10000,
  wholesaleIncreaseRequiresApproval: true,
};

export type PricingSettingsView = Pick<
  PricingSettings,
  | "globalMarkupBps"
  | "homeownerMarkupBps"
  | "contractorMarkupBps"
  | "wholesaleMarkupBps"
  | "wholesaleIncreaseRequiresApproval"
> & { updatedAt: Date | null };

// Read the single pricing-settings row, seeding defaults if the table is empty.
// Falls back to in-memory defaults when no DB is configured (local tooling/tests).
// homeownerMarkupBps is the site-wide retail multiplier (10000 = ×1).
export async function getPricingSettings(): Promise<PricingSettingsView> {
  const db = await getDb();
  if (!db) return { ...DEFAULT_PRICING_SETTINGS, updatedAt: null };
  const rows = await db.select().from(pricingSettings).limit(1);
  if (rows.length === 0) {
    await db.insert(pricingSettings).values({ ...DEFAULT_PRICING_SETTINGS });
    return { ...DEFAULT_PRICING_SETTINGS, updatedAt: null };
  }
  const r = rows[0];
  return {
    globalMarkupBps: r.globalMarkupBps,
    homeownerMarkupBps: r.homeownerMarkupBps,
    contractorMarkupBps: r.contractorMarkupBps,
    wholesaleMarkupBps: r.wholesaleMarkupBps,
    wholesaleIncreaseRequiresApproval: r.wholesaleIncreaseRequiresApproval,
    updatedAt: r.updatedAt ?? null,
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
      | "wholesaleIncreaseRequiresApproval"
    >
  >,
  updatedByOpenId?: string,
  userId?: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(pricingSettings).limit(1);
  const values = { ...patch, updatedByOpenId: updatedByOpenId ?? null };
  const previous = rows[0];
  if (!previous) {
    await db.insert(pricingSettings).values({ ...DEFAULT_PRICING_SETTINGS, ...values });
  } else {
    await db.update(pricingSettings).set(values).where(eq(pricingSettings.id, previous.id));
    const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
    for (const field of Object.keys(patch) as (keyof typeof patch)[]) {
      const next = patch[field];
      const old = previous[field];
      if (next === undefined || String(old) === String(next)) continue;
      changes.push({ field, oldValue: old == null ? null : String(old), newValue: String(next) });
    }
    if (changes.length > 0) {
      await db.insert(pricingSettingAudit).values(changes.map((change) => ({
        ...change,
        userId: userId ?? null,
        openId: updatedByOpenId ?? null,
      })));
    }
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

  // Rows with a vendor wholesale keep homeowner retail = wholesale × the
  // site-wide key × the distributor's existing markupPercent. Read-time
  // sellPriceForTier uses the same formula. This only refreshes the stored
  // homeowner cache so legacy readers do not drift after a multiplier change.
  await db.execute(sql`
    UPDATE distributor_skus s
    INNER JOIN distributors d ON d.id = s.distributorId
    SET s.homeownerPrice = ROUND(s.vendorWholesale * ${homeownerMultiplier} * (1 + COALESCE(d.markupPercent, 0)), 2)
    WHERE s.vendorWholesale IS NOT NULL AND s.vendorWholesale > 0
  `);

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
  vendorWholesale?: string | null;
  vendorMarkupPercent?: string | null;
  category?: string | null;
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
      vendorWholesale: distributorSkus.vendorWholesale,
      vendorMarkupPercent: distributors.markupPercent,
      category: cabinets.category,
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
