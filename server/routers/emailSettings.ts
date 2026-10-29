import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { emailSettings, brandingSettings, notificationSettings } from "../../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { encryptEmailSettingsPassword } from "../lib/emailSettingsCrypto";
import { resendConfigured, sendEmail } from "../email";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function adminOnly(role: string) {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
}

async function getOrCreateEmailSettings() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(emailSettings).limit(1);
  if (rows.length > 0) return rows[0];
  await db.insert(emailSettings).values({});
  const created = await db.select().from(emailSettings).limit(1);
  return created[0] ?? null;
}

async function getOrCreateBrandingSettings() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(brandingSettings).limit(1);
  if (rows.length > 0) return rows[0];
  await db.insert(brandingSettings).values({});
  const created = await db.select().from(brandingSettings).limit(1);
  return created[0] ?? null;
}

async function getOrCreateNotificationSettings() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(notificationSettings).limit(1);
  if (rows.length > 0) return rows[0];
  await db.insert(notificationSettings).values({});
  const created = await db.select().from(notificationSettings).limit(1);
  return created[0] ?? null;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const emailSettingsRouter = router({
  // ── Email Settings ──────────────────────────────────────────────────────────
  getEmailSettings: protectedProcedure.query(async ({ ctx }) => {
    await adminOnly(ctx.user.role);
    const row = await getOrCreateEmailSettings();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    // Never return the password to the client. Readiness is Resend, not the saved SMTP row.
    const { smtpPass: _pass, ...safe } = row;
    return { ...safe, hasPassword: !!_pass && _pass.length > 0, resendReady: resendConfigured() };
  }),

  saveEmailSettings: protectedProcedure
    .input(
      z.object({
        smtpHost: z.string().max(255),
        smtpPort: z.number().int().min(1).max(65535),
        smtpUser: z.string().max(255),
        smtpPass: z.string().max(255).optional(), // omit to keep existing
        smtpFrom: z.string().max(255),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const existing = await getOrCreateEmailSettings();
      const values: Record<string, unknown> = {
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpUser: input.smtpUser,
        smtpFrom: input.smtpFrom || input.smtpUser,
        enabled: input.enabled,
      };
      // Only overwrite password when explicitly provided
      if (typeof input.smtpPass === "string" && input.smtpPass.length > 0) {
        values.smtpPass = encryptEmailSettingsPassword(input.smtpPass);
      }
      if (existing) {
        await db.update(emailSettings).set(values).where(eq(emailSettings.id, existing.id));
      } else {
        await db.insert(emailSettings).values(values as typeof emailSettings.$inferInsert);
      }
      return { ok: true };
    }),

  testEmailConnection: protectedProcedure
    .input(z.object({ toEmail: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      await adminOnly(ctx.user.role);
      if (!resendConfigured()) {
        return { ok: false, error: "Email is not configured. Set RESEND_API_KEY and ORDER_EMAIL_FROM." };
      }
      const result = await sendEmail({
        to: input.toEmail,
        subject: "Cabinet Dealz — email test",
        text: "Your Resend connection is working. This is a test email from Cabinet Dealz.",
        html: "<p>Your Resend connection is working.</p><p>This is a test email from <strong>Cabinet Dealz</strong>.</p>",
      });
      if (!result.success) {
        return { ok: false, error: "The test email could not be sent. Check Resend configuration and try again." };
      }
      return { ok: true };
    }),

  // ── Branding Settings ───────────────────────────────────────────────────────
  getBrandingSettings: protectedProcedure.query(async ({ ctx }) => {
    await adminOnly(ctx.user.role);
    const row = await getOrCreateBrandingSettings();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    return row;
  }),

  getPublicBranding: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(brandingSettings).limit(1);
    if (!rows.length) return null;
    const { id: _id, updatedAt: _u, ...pub } = rows[0];
    return pub;
  }),

  saveBrandingSettings: protectedProcedure
    .input(
      z.object({
        siteName: z.string().min(1).max(128),
        logoUrl: z.string().max(512),
        faviconUrl: z.string().max(512),
        primaryColor: z.string().max(16),
        accentColor: z.string().max(16),
        tagline: z.string().max(255),
        supportEmail: z.string().max(255),
        supportPhone: z.string().max(64),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const existing = await getOrCreateBrandingSettings();
      if (existing) {
        await db.update(brandingSettings).set(input).where(eq(brandingSettings.id, existing.id));
      } else {
        await db.insert(brandingSettings).values(input);
      }
      return { ok: true };
    }),

  // ── Notification Settings ───────────────────────────────────────────────────
  getNotificationSettings: protectedProcedure.query(async ({ ctx }) => {
    await adminOnly(ctx.user.role);
    const row = await getOrCreateNotificationSettings();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    return row;
  }),

  saveNotificationSettings: protectedProcedure
    .input(
      z.object({
        onNewOrder: z.string().max(1024),
        onNewDesignLead: z.string().max(1024),
        onNewQuoteRequest: z.string().max(1024),
        onNewProApplication: z.string().max(1024),
        onNewConsultation: z.string().max(1024),
        onNewAffiliate: z.string().max(1024),
        onCrmDesignHelp: z.string().max(1024),
        onCrmShippingHelp: z.string().max(1024),
        notifyOnCrmDesignHelp: z.boolean(),
        notifyOnCrmShippingHelp: z.boolean(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const existing = await getOrCreateNotificationSettings();
      if (existing) {
        await db.update(notificationSettings).set(input).where(eq(notificationSettings.id, existing.id));
      } else {
        await db.insert(notificationSettings).values(input);
      }
      return { ok: true };
    }),

  // ── API Status (all integrations in one call) ───────────────────────────────
  getApiStatus: protectedProcedure.query(async ({ ctx }) => {
    await adminOnly(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const [shippingRows, paymentRows] = await Promise.all([
      db.execute("SELECT liveApiKey, liveProvider, quoteMode, enabled FROM shipping_settings LIMIT 1"),
      db.execute("SELECT apiLoginId, clientKey, hasTransactionKey, enabled, environment FROM payment_settings LIMIT 1"),
    ]);

    const shipping = (shippingRows as unknown as { rows: Record<string, unknown>[] }).rows?.[0] ?? null;
    const payment = (paymentRows as unknown as { rows: Record<string, unknown>[] }).rows?.[0] ?? null;

    return {
      smtp: {
        configured: resendConfigured(),
        enabled: resendConfigured(),
        host: resendConfigured() ? "Resend" : "",
        user: resendConfigured() ? (process.env.ORDER_EMAIL_FROM?.trim() ?? "") : "",
      },
      shipping: {
        configured: !!(shipping?.liveApiKey),
        enabled: !!(shipping?.enabled),
        provider: (shipping?.liveProvider as string) ?? "estimator",
        mode: (shipping?.quoteMode as string) ?? "estimator",
      },
      payment: {
        configured: !!(payment?.apiLoginId && payment?.clientKey),
        enabled: !!(payment?.enabled),
        provider: "authorizenet",
        environment: (payment?.environment as string) ?? "sandbox",
      },
    };
  }),
});
