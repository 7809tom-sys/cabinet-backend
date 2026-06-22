import { z } from "zod";

export const BCRYPT_ROUNDS = 10;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export const emailSchema = z
  .string()
  .trim()
  .email("Please enter a valid email address")
  .max(320);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Given the current stored failed-attempt count (before this failure), decide
 * whether the account should now be locked, and until when.
 */
export function computeLockout(
  currentFailedAttempts: number,
  now: number = Date.now()
): { willLock: boolean; lockedUntil: Date | null } {
  const willLock = currentFailedAttempts + 1 >= MAX_FAILED_ATTEMPTS;
  return {
    willLock,
    lockedUntil: willLock ? new Date(now + LOCKOUT_MS) : null,
  };
}

/** Whether a lockedUntil timestamp is still in effect at `now`. */
export function isLocked(
  lockedUntil: Date | null | undefined,
  now: number = Date.now()
): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now);
}

/** Minutes remaining (rounded up) on an active lockout. */
export function lockoutMinutesRemaining(
  lockedUntil: Date,
  now: number = Date.now()
): number {
  return Math.max(0, Math.ceil((lockedUntil.getTime() - now) / 60000));
}
