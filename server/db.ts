import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

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
