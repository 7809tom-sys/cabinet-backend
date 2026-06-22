import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import * as db from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, router } from "../_core/trpc";
import {
  BCRYPT_ROUNDS,
  computeLockout,
  emailSchema,
  isLocked,
  lockoutMinutesRemaining,
  normalizeEmail,
  passwordSchema,
} from "./emailAuth.logic";

/** Issue the same JWT session cookie the OAuth flow uses, keyed on the user's openId. */
async function setSessionCookie(
  ctx: { req: any; res: any },
  openId: string,
  name: string
): Promise<void> {
  const token = await sdk.signSession(
    { openId, appId: process.env.VITE_APP_ID ?? "", name },
    { expiresInMs: ONE_YEAR_MS }
  );
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

export const emailAuthRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        password: passwordSchema,
        name: z.string().trim().max(120).optional(),
        companyName: z.string().trim().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const emailLower = normalizeEmail(input.email);
      const existing = await db.getUserByEmailLower(emailLower);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists. Please sign in instead.",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
      const created = await db.createEmailUser({
        email: input.email.trim(),
        emailLower,
        passwordHash,
        name: input.name ?? null,
        companyName: input.companyName ?? null,
      });

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create account. Please try again.",
        });
      }

      await setSessionCookie(ctx, created.openId, input.name ?? input.email.trim());
      return { success: true } as const;
    }),

  login: publicProcedure
    .input(z.object({ email: emailSchema, password: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const emailLower = normalizeEmail(input.email);
      const user = await db.getUserByEmailLower(emailLower);

      // Uniform error so we don't reveal whether the email exists.
      const invalid = () =>
        new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });

      if (!user || !user.passwordHash) {
        // Still run a hash to keep timing roughly constant.
        await bcrypt.compare(input.password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv");
        throw invalid();
      }

      if (isLocked(user.lockedUntil)) {
        const mins = lockoutMinutesRemaining(user.lockedUntil as Date);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
        });
      }

      const ok = await bcrypt.compare(input.password, user.passwordHash);
      if (!ok) {
        const { lockedUntil } = computeLockout(user.failedLoginAttempts ?? 0);
        await db.recordLoginResult(user.id, false, lockedUntil);
        throw invalid();
      }

      await db.recordLoginResult(user.id, true);
      await setSessionCookie(ctx, user.openId, user.name ?? user.email ?? "");
      return { success: true } as const;
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});
