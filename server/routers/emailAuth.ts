import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import * as db from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, router } from "../_core/trpc";
import { emailSettings, passwordResetTokens, users } from "../../drizzle/schema";
import { emailSettingsReady, sendEmail, sendEmailViaSettings } from "../email";
import { buildPasswordResetEmail } from "../passwordResetEmail";
import { hashPasswordResetToken, passwordResetExpiry } from "../passwordReset.logic";
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
        inviteToken: z.string().max(64).optional(),
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
        inviteToken: input.inviteToken ?? null,
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

      // A vendor might have been approved after creating a normal account.
      // Reconcile only their exact approved contact email on successful login;
      // admin/affiliate roles are intentionally never changed by this path.
      const synchronizedUser = await db.synchronizeApprovedVendorLogin(user, emailLower);
      await db.recordLoginResult(synchronizedUser.id, true);
      await setSessionCookie(ctx, synchronizedUser.openId, synchronizedUser.name ?? synchronizedUser.email ?? "");
      return { success: true } as const;
    }),

  // Always report the same accepted response so this public endpoint cannot be
  // used to enumerate which email addresses have Cabinet Dealz accounts.
  requestPasswordReset: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ input }) => {
      const emailLower = normalizeEmail(input.email);
      const user = await db.getUserByEmailLower(emailLower);
      if (!user?.email) return { accepted: true } as const;

      const dbConnection = await db.getDb();
      if (!dbConnection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Password reset is temporarily unavailable." });

      const rawToken = randomBytes(32).toString("hex");
      const now = new Date();
      const resetEmail = buildPasswordResetEmail({
        recipientName: user.name,
        token: rawToken,
        // Reset emails must always return to the live Cabinet Dealz account site,
        // never to an arbitrary request Origin header.
        origin: "https://www.cabinetdealz.com",
      });
      const [settings] = await dbConnection.select().from(emailSettings).limit(1);
      const delivery = emailSettingsReady(settings)
        ? await sendEmailViaSettings(settings, {
          to: user.email,
          subject: resetEmail.subject,
          text: resetEmail.text,
          html: resetEmail.html,
        })
        : await sendEmail({
          to: user.email,
          subject: resetEmail.subject,
          text: resetEmail.text,
          html: resetEmail.html,
        });

      if (!delivery.success) {
        console.error("[EmailAuth] Password-reset delivery failed", { userId: user.id, error: delivery.error ?? "not configured" });
        // Do not create a usable reset token if delivery did not succeed.
        return { accepted: true } as const;
      }

      await dbConnection.transaction(async (tx) => {
        // A fresh delivery invalidates every older unused email link for this account.
        await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
        await tx.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashPasswordResetToken(rawToken),
          expiresAt: passwordResetExpiry(now),
        });
      });
      return { accepted: true } as const;
    }),

  completePasswordReset: publicProcedure
    .input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/i), password: passwordSchema }))
    .mutation(async ({ input }) => {
      const dbConnection = await db.getDb();
      if (!dbConnection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Password reset is temporarily unavailable." });

      const now = new Date();
      const tokenHash = hashPasswordResetToken(input.token);
      const [token] = await dbConnection
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1);
      if (!token || token.consumedAt || token.expiresAt <= now) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That password-reset link is invalid or expired." });
      }

      await dbConnection.transaction(async (tx) => {
        // The conditional update makes the reset link single-use, including under
        // concurrent browser submissions.
        const consumed = await tx.update(passwordResetTokens)
          .set({ consumedAt: now })
          .where(and(
            eq(passwordResetTokens.id, token.id),
            isNull(passwordResetTokens.consumedAt),
            gt(passwordResetTokens.expiresAt, now),
          ));
        const affectedRows = Array.isArray(consumed)
          ? (consumed[0] as { affectedRows?: number } | undefined)?.affectedRows ?? 0
          : (consumed as unknown as { affectedRows?: number }).affectedRows ?? 0;
        if (affectedRows !== 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That password-reset link is invalid or expired." });
        }
        await tx.update(users)
          .set({
            passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
            loginMethod: "password",
            failedLoginAttempts: 0,
            lockedUntil: null,
          })
          .where(eq(users.id, token.userId));
      });
      return { success: true } as const;
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});
