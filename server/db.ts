import crypto from "node:crypto";
import { eq, sql, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, cabinets } from "../drizzle/schema";
import { ENV } from './_core/env';

// Shared predicate: exclude products held in admin "conflict" (Needs Review)
// status from every public-facing query (catalog, storefront, Design Tool
// palette, order/ocr code matching). Conflict items live only in the admin
// back office until an admin reviews and clears them.
export function notInConflict() {
  return ne(cabinets.conflictStatus, "conflict");
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
}): Promise<{ id: number; openId: string } | null> {
  const db = await getDb();
  if (!db) return null;

  const openId = `email_${crypto.randomUUID()}`;
  const isOwner = params.emailLower === (ENV.ownerEmail ?? "").toLowerCase();

  await db.insert(users).values({
    openId,
    name: params.name ?? null,
    email: params.email,
    emailLower: params.emailLower,
    passwordHash: params.passwordHash,
    loginMethod: "password",
    companyName: params.companyName ?? null,
    role: isOwner ? "admin" : "user",
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
