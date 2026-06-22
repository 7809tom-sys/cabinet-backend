import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import {
  BCRYPT_ROUNDS,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  computeLockout,
  emailSchema,
  isLocked,
  lockoutMinutesRemaining,
  normalizeEmail,
  passwordSchema,
} from "./routers/emailAuth.logic";

describe("emailAuth.logic validation", () => {
  it("accepts valid emails and lowercases/trims them", () => {
    expect(emailSchema.safeParse("Foo@Example.COM").success).toBe(true);
    expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com");
  });

  it("rejects malformed emails", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("").success).toBe(false);
  });

  it("requires passwords of at least 8 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("longenough").success).toBe(true);
  });
});

describe("emailAuth.logic lockout", () => {
  it("does not lock before the max-attempt threshold", () => {
    // currentFailedAttempts is the count BEFORE this failure.
    const r = computeLockout(MAX_FAILED_ATTEMPTS - 2, 0);
    expect(r.willLock).toBe(false);
    expect(r.lockedUntil).toBeNull();
  });

  it("locks exactly on the Nth failed attempt", () => {
    const now = 1_000_000;
    const r = computeLockout(MAX_FAILED_ATTEMPTS - 1, now);
    expect(r.willLock).toBe(true);
    expect(r.lockedUntil?.getTime()).toBe(now + LOCKOUT_MS);
  });

  it("reports an active lockout and remaining minutes", () => {
    const now = 1_000_000;
    const until = new Date(now + 5 * 60 * 1000);
    expect(isLocked(until, now)).toBe(true);
    expect(isLocked(new Date(now - 1), now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
    expect(lockoutMinutesRemaining(until, now)).toBe(5);
  });

  it("rounds remaining minutes up", () => {
    const now = 0;
    expect(lockoutMinutesRemaining(new Date(61 * 1000), now)).toBe(2);
  });
});

describe("emailAuth password hashing", () => {
  it("hashes and verifies a password round-trip", async () => {
    const hash = await bcrypt.hash("7eXampleP@ss", BCRYPT_ROUNDS);
    expect(hash).not.toBe("7eXampleP@ss");
    expect(await bcrypt.compare("7eXampleP@ss", hash)).toBe(true);
    expect(await bcrypt.compare("wrong", hash)).toBe(false);
  });
});

describe("emailAuth.logout", () => {
  it("clears the session cookie", async () => {
    const cleared: { name: string; options: Record<string, unknown> }[] = [];
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string, options: Record<string, unknown>) =>
          cleared.push({ name, options }),
      } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.emailAuth.logout();
    expect(result).toEqual({ success: true });
    expect(cleared[0]?.name).toBe(COOKIE_NAME);
    expect(cleared[0]?.options).toMatchObject({ maxAge: -1, httpOnly: true });
  });
});
