import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { users, vendorLines } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { MAX_FAILED_ATTEMPTS } from "./routers/emailAuth.logic";

/** A throwaway context that captures any cookie set/cleared during the call. */
function makeCtx(hostname?: string): {
  ctx: TrpcContext;
  cookies: Array<{ name: string; value: string }>;
  cleared: Array<{ name: string; options: Record<string, unknown> }>;
} {
  const cookies: Array<{ name: string; value: string }> = [];
  const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", hostname, headers: {} } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string) => cookies.push({ name, value }),
      clearCookie: (name: string, options: Record<string, unknown>) => cleared.push({ name, options }),
    } as unknown as TrpcContext["res"],
  };
  return { ctx, cookies, cleared };
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@flowtest.cabinetdealz`;
}

async function cleanup(emailLower: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(users).where(eq(users.emailLower, emailLower));
}

describe("emailAuth signup/login flow", () => {
  it("signs up a new account, issues a session cookie, and stores a hash (not the plaintext)", async () => {
    const db = await getDb();
    if (!db) return;
    const email = uniqueEmail("signup");
    const lower = email.toLowerCase();
    try {
      const { ctx, cookies } = makeCtx();
      const caller = appRouter.createCaller(ctx);
      const res = await caller.emailAuth.signup({ email, password: "Sup3rSecret!", name: "Flow Test" });
      expect(res).toEqual({ success: true });
      expect(cookies.length).toBe(1);

      const row = (await db.select().from(users).where(eq(users.emailLower, lower)).limit(1))[0];
      expect(row).toBeDefined();
      expect(row.passwordHash).toBeTruthy();
      expect(row.passwordHash).not.toBe("Sup3rSecret!");
      expect(row.loginMethod).toBe("password");
      expect(row.role).toBe("user"); // non-owner
    } finally {
      await cleanup(lower);
    }
  });

  it("rejects a duplicate signup with the same email", async () => {
    const db = await getDb();
    if (!db) return;
    const email = uniqueEmail("dupe");
    const lower = email.toLowerCase();
    try {
      const caller = appRouter.createCaller(makeCtx().ctx);
      await caller.emailAuth.signup({ email, password: "Sup3rSecret!" });
      await expect(caller.emailAuth.signup({ email, password: "Sup3rSecret!" })).rejects.toThrow();
    } finally {
      await cleanup(lower);
    }
  });

  it("lets an approved vendor use a one-time setup link, then saves its chosen login email", async () => {
    const db = await getDb();
    if (!db) return;
    const email = uniqueEmail("supplier-setup");
    const secondEmail = uniqueEmail("supplier-setup-reuse");
    const lower = email.toLowerCase();
    const secondLower = secondEmail.toLowerCase();
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const token = `setup-${suffix}`;
    const name = `Supplier setup ${suffix}`;
    let vendorId: number | null = null;
    try {
      const inserted = await db.insert(vendorLines).values({
        name,
        isApproved: true,
        inviteToken: token,
      });
      vendorId = Number((inserted as unknown as [{ insertId: number }])[0]?.insertId ?? 0);
      expect(vendorId).toBeGreaterThan(0);

      await appRouter.createCaller(makeCtx().ctx).emailAuth.signup({
        email,
        password: "Sup3rSecret!",
        inviteToken: token,
      });

      const account = (await db.select().from(users).where(eq(users.emailLower, lower)).limit(1))[0];
      expect(account?.role).toBe("distributor");
      expect(account?.approvedVendorLineId).toBe(vendorId);

      const vendor = (await db.select().from(vendorLines).where(eq(vendorLines.id, vendorId!)).limit(1))[0];
      expect(vendor?.contactEmail).toBe(email);
      expect(vendor?.inviteToken).toBeNull();

      await expect(
        appRouter.createCaller(makeCtx().ctx).emailAuth.signup({
          email: secondEmail,
          password: "Sup3rSecret!",
          inviteToken: token,
        })
      ).rejects.toThrow(/invalid|already been used/i);
    } finally {
      await db.delete(users).where(eq(users.emailLower, lower));
      await db.delete(users).where(eq(users.emailLower, secondLower));
      if (vendorId) await db.delete(vendorLines).where(eq(vendorLines.id, vendorId));
    }
  });

  it("logs in with the correct password and rejects the wrong one", async () => {
    const db = await getDb();
    if (!db) return;
    const email = uniqueEmail("login");
    const lower = email.toLowerCase();
    try {
      const signupCaller = appRouter.createCaller(makeCtx().ctx);
      await signupCaller.emailAuth.signup({ email, password: "Right1Password" });

      // correct password → cookie issued
      const good = makeCtx();
      await appRouter.createCaller(good.ctx).emailAuth.login({ email, password: "Right1Password" });
      expect(good.cookies.length).toBe(1);

      // wrong password → throws, no cookie
      const bad = makeCtx();
      await expect(
        appRouter.createCaller(bad.ctx).emailAuth.login({ email, password: "WrongPassword" })
      ).rejects.toThrow();
      expect(bad.cookies.length).toBe(0);
    } finally {
      await cleanup(lower);
    }
  });

  it("clears only the obsolete Cabinet Dealz parent-domain session after a successful password login", async () => {
    const db = await getDb();
    if (!db) return;
    const email = uniqueEmail("legacy-parent-session");
    const lower = email.toLowerCase();
    try {
      await appRouter.createCaller(makeCtx().ctx).emailAuth.signup({ email, password: "Right1Password" });

      const login = makeCtx("www.cabinetdealz.com");
      await appRouter.createCaller(login.ctx).emailAuth.login({ email, password: "Right1Password" });

      expect(login.cookies).toHaveLength(1);
      expect(login.cleared).toContainEqual(expect.objectContaining({
        name: "app_session_id",
        options: expect.objectContaining({
          domain: ".cabinetdealz.com",
          httpOnly: true,
          path: "/",
          secure: true,
          sameSite: "none",
          maxAge: -1,
        }),
      }));

      const customAffiliateLogin = makeCtx("dealer.example.com");
      await appRouter.createCaller(customAffiliateLogin.ctx).emailAuth.login({ email, password: "Right1Password" });
      expect(customAffiliateLogin.cookies).toHaveLength(1);
      expect(customAffiliateLogin.cleared).toHaveLength(0);
    } finally {
      await cleanup(lower);
    }
  });

  it("locks the account after the max number of failed attempts", async () => {
    const db = await getDb();
    if (!db) return;
    const email = uniqueEmail("lockout");
    const lower = email.toLowerCase();
    try {
      const caller = appRouter.createCaller(makeCtx().ctx);
      await caller.emailAuth.signup({ email, password: "Right1Password" });

      // Burn through the failed attempts.
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        await expect(
          appRouter.createCaller(makeCtx().ctx).emailAuth.login({ email, password: "nope-wrong" })
        ).rejects.toThrow();
      }

      // Now even the CORRECT password is refused with a lockout error.
      await expect(
        appRouter.createCaller(makeCtx().ctx).emailAuth.login({ email, password: "Right1Password" })
      ).rejects.toThrow(/too many failed attempts/i);

      const row = (await db.select().from(users).where(eq(users.emailLower, lower)).limit(1))[0];
      expect(row.lockedUntil).not.toBeNull();
    } finally {
      await cleanup(lower);
    }
  });
});
