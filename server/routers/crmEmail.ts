import { z } from "zod";
import { desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  affiliateEmailSettings,
  affiliates,
  crmActivities,
  crmDealFiles,
  crmDeals,
  crmEmailDrafts,
  crmEmailLog,
  crmEmailTemplates,
  users,
} from "../../drizzle/schema";
import { encryptEmailSettingsPassword } from "../lib/emailSettingsCrypto";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { platformInvoiceCopyAddress, sendAffiliateTestEmail, isPlatformSenderConfigured } from "../lib/affiliateSender";
import { isUsableSenderEmail, resolveSmtpSecure } from "@shared/affiliateSender";
import { getOwnedDeal, resolveScope, scopeWhere, type CrmScope } from "./crm";import {
  CRM_EMAIL_PROVIDERS,
  crmMailboxVisible,
  toPublicAffiliateEmailSettings,
  type CrmMailboxScope,
} from "@shared/crmMailbox";

function mailboxScope(scope: CrmScope): CrmMailboxScope {
  if (scope.kind === "house") return { kind: "house" };
  if (scope.kind === "affiliate") return { kind: "affiliate", affiliateId: scope.affiliateId };
  return { kind: "contractor", userId: scope.userId };
}

function ownedAffiliateId(scope: CrmScope): number | null {
  return scope.kind === "affiliate" ? scope.affiliateId : null;
}

/**
 * Which affiliate's sender settings this caller may read or write.
 *
 * A platform admin may act on any store but must name it: the caller sends an
 * affiliate id, never a slug, and the row is re-read here. An affiliate owner
 * (or a team member whose invitation grants CRM access) may act only on the
 * store they resolve to. Nobody can act on a store the server did not resolve,
 * so a client-supplied slug or id can never reach another store's mailbox.
 */
async function resolveSenderTargetAffiliateId(
  ctx: { user: { id: number; email: string | null; role: string } },
  requestedAffiliateId?: number,
): Promise<number> {
  if (ctx.user.role === "admin") {
    if (requestedAffiliateId == null) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose which affiliate store's email settings to open.",
      });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const [row] = await db
      .select({ id: affiliates.id })
      .from(affiliates)
      .where(eq(affiliates.id, requestedAffiliateId))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });
    return row.id;
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const access = await resolveAffiliateAccess(db, {
    id: ctx.user.id,
    email: ctx.user.email,
  });
  if (!access) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account is linked to your login." });
  }
  if (!access.isOwner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the affiliate owner or a platform admin can manage outbound email.",
    });
  }
  if (requestedAffiliateId != null && requestedAffiliateId !== access.affiliateId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only manage your own store's outbound email.",
    });
  }
  return access.affiliateId;
}

const senderSettingsInput = z.object({
  affiliateId: z.number().int().positive().optional(),
  provider: z.enum(CRM_EMAIL_PROVIDERS),
  contactEmail: z.string().trim().max(320),
  smtpHost: z.string().trim().max(255),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().trim().max(255),
  smtpPass: z.string().max(2000).optional(),
  smtpFrom: z.string().trim().max(320),
  fromName: z.string().max(256),
  replyTo: z.string().trim().max(320),
  invoiceCopyEmail: z.string().trim().max(320),
  signatureHtml: z.string().max(20000),
  enabled: z.boolean(),
});

function optionalEmail(value: string, field: string): string {
  const email = value.trim();
  if (!email) return "";
  if (!isUsableSenderEmail(email)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${field} is not a valid email address.` });
  }
  return email;
}

function requireEmail(value: string, field: string): string {
  const email = value.trim();
  if (!isUsableSenderEmail(email)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${field} is not a valid email address.` });
  }
  return email;
}

const templateInput = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(128),
  subject: z.string().max(512),
  bodyHtml: z.string().max(50000),
});

export const crmEmailRouter = router({
  // Per-affiliate outbound sender. Each affiliate is a separate entity, so its
  // customer mail leaves from its own mailbox when that mailbox is configured
  // and enabled. Settings live on the affiliate's email-settings row and the
  // SMTP password is write-only: the client only ever learns hasPassword.
  emailSetup: router({
    get: protectedProcedure
      .input(z.object({ affiliateId: z.number().int().positive().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        const target = await resolveSenderTargetAffiliateId(ctx, input?.affiliateId);
        const platformCopy = platformInvoiceCopyAddress();
        if (!db) {
          return {
            mode: "affiliate" as const,
            affiliateId: target,
            settings: null,
            invoiceCopyDefault: platformCopy,
            platformFallbackAvailable: isPlatformSenderConfigured(),
          };
        }
        const [row] = await db
          .select()
          .from(affiliateEmailSettings)
          .where(eq(affiliateEmailSettings.affiliateId, target))
          .limit(1);
        return {
          mode: "affiliate" as const,
          affiliateId: target,
          settings: row ? toPublicAffiliateEmailSettings(row) : null,
          invoiceCopyDefault: platformCopy,
          platformFallbackAvailable: isPlatformSenderConfigured(),
        };
      }),

    save: protectedProcedure.input(senderSettingsInput).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const affiliateId = await resolveSenderTargetAffiliateId(ctx, input.affiliateId);
      const [existing] = await db
        .select()
        .from(affiliateEmailSettings)
        .where(eq(affiliateEmailSettings.affiliateId, affiliateId))
        .limit(1);
      const contactEmail = requireEmail(input.contactEmail, "Contact email");
      const invoiceCopyEmail = optionalEmail(input.invoiceCopyEmail, "Invoice copy address");
      // A blank password keeps the saved one so the affiliate can change the
      // host or port without re-typing their app password.
      const smtpPass = input.smtpPass && input.smtpPass.trim()
        ? encryptEmailSettingsPassword(input.smtpPass)
        : existing?.smtpPass ?? "";
      if (input.enabled) {
        if (!input.smtpHost.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "SMTP host is required to enable the affiliate sender." });
        }
        if (!input.smtpUser.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "SMTP username is required to enable the affiliate sender." });
        }
        if (!smtpPass.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "SMTP password is required to enable the affiliate sender." });
        }
      }
      const values = {
        affiliateId,
        provider: input.provider,
        contactEmail,
        smtpHost: input.smtpHost.trim(),
        smtpPort: input.smtpPort,
        smtpSecure: resolveSmtpSecure(input.smtpPort, input.smtpSecure),
        smtpUser: input.smtpUser.trim(),
        smtpPass,
        smtpFrom: input.smtpFrom.trim(),
        fromName: input.fromName.trim(),
        replyTo: optionalEmail(input.replyTo, "Reply-to address"),
        invoiceCopyEmail,
        signatureHtml: input.signatureHtml,
        enabled: input.enabled,
      };
      if (existing) {
        await db.update(affiliateEmailSettings).set(values).where(eq(affiliateEmailSettings.id, existing.id));
      } else {
        await db.insert(affiliateEmailSettings).values(values);
      }
      return {
        ok: true,
        affiliateId,
        hasPassword: smtpPass.trim().length > 0,
        configured: input.enabled
          && Boolean(values.smtpHost && values.smtpUser && smtpPass)
          && isUsableSenderEmail(contactEmail),
      };
    }),

    // Verifies the saved mailbox handshake and sends one test to the
    // affiliate's own contact address. The address is never client-supplied, so
    // this cannot be used to send mail to arbitrary recipients. The exact
    // provider error is returned so a wrong app password or host is visible.
    sendTest: protectedProcedure
      .input(z.object({ affiliateId: z.number().int().positive().optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const affiliateId = await resolveSenderTargetAffiliateId(ctx, input?.affiliateId);
        const [row] = await db
          .select()
          .from(affiliateEmailSettings)
          .where(eq(affiliateEmailSettings.affiliateId, affiliateId))
          .limit(1);
        const to = (row?.contactEmail || row?.smtpFrom || row?.smtpUser || "").trim();
        if (!isUsableSenderEmail(to)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Save a valid contact email for this affiliate before sending a test message.",
          });
        }
        const result = await sendAffiliateTestEmail(db, affiliateId, to);
        if (!row) return result;
        await db
          .update(affiliateEmailSettings)
          .set({
            lastTestedAt: new Date(),
            lastTestOk: result.ok,
            lastTestError: result.ok ? null : result.error.slice(0, 1000),
          })
          .where(eq(affiliateEmailSettings.id, row.id));
        return result;
      }),

    connections: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const [settings, stores] = await Promise.all([
        db.select().from(affiliateEmailSettings),
        db.select({
          id: affiliates.id,
          storeName: affiliates.storeName,
          publicEmail: affiliates.publicEmail,
          email: affiliates.email,
        }).from(affiliates),
      ]);
      const byAffiliate = new Map(settings.map((row) => [row.affiliateId, row]));
      return stores.map((store) => {
        const row = byAffiliate.get(store.id);
        const pub = row ? toPublicAffiliateEmailSettings(row) : null;
        return {
          affiliateId: store.id,
          storeName: store.storeName,
          publicEmail: store.publicEmail || store.email,
          connected: pub?.connected ?? false,
          configured: pub?.configured ?? false,
          provider: pub?.provider ?? null,
          fromName: pub?.fromName ?? "",
          contactEmail: pub?.contactEmail ?? "",
          replyTo: pub?.replyTo || store.publicEmail || "",
          smtpUser: pub?.smtpUser ?? "",
          invoiceCopyEmail: pub?.invoiceCopyEmail || "",
          enabled: pub?.enabled ?? false,
          hasPassword: pub?.hasPassword ?? false,
          lastTestedAt: pub?.lastTestedAt ?? null,
          lastTestOk: pub?.lastTestOk ?? null,
          lastTestError: pub?.lastTestError ?? null,
        };
      });
    }),
  }),

  emailTemplates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const scope = await resolveScope(ctx);
      const q = db.select().from(crmEmailTemplates);
      if (scope.kind === "affiliate") {
        return q.where(eq(crmEmailTemplates.affiliateId, scope.affiliateId)).orderBy(desc(crmEmailTemplates.updatedAt));
      }
      if (scope.kind === "contractor") return [];
      return q.where(isNull(crmEmailTemplates.affiliateId)).orderBy(desc(crmEmailTemplates.updatedAt));
    }),
    save: protectedProcedure.input(templateInput).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = await resolveScope(ctx);
      if (scope.kind === "contractor") throw new TRPCError({ code: "FORBIDDEN" });
      const affiliateId = ownedAffiliateId(scope);
      if (input.id) {
        const [existing] = await db.select().from(crmEmailTemplates).where(eq(crmEmailTemplates.id, input.id)).limit(1);
        if (!existing || !crmMailboxVisible(mailboxScope(scope), existing)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Template not found." });
        }
        if (scope.kind === "house" && existing.affiliateId != null) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Affiliate templates are managed from that affiliate's CRM." });
        }
        await db.update(crmEmailTemplates).set({
          name: input.name.trim(),
          subject: input.subject,
          bodyHtml: input.bodyHtml,
        }).where(eq(crmEmailTemplates.id, existing.id));
        return { id: existing.id };
      }
      const result = await db.insert(crmEmailTemplates).values({
        affiliateId,
        name: input.name.trim(),
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        createdByUserId: ctx.user.id,
      });
      return { id: (result as unknown as [{ insertId: number }])[0].insertId };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = await resolveScope(ctx);
      const [existing] = await db.select().from(crmEmailTemplates).where(eq(crmEmailTemplates.id, input.id)).limit(1);
      if (!existing || !crmMailboxVisible(mailboxScope(scope), existing)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found." });
      }
      if (scope.kind === "house" && existing.affiliateId != null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Affiliate templates are managed from that affiliate's CRM." });
      }
      await db.delete(crmEmailTemplates).where(eq(crmEmailTemplates.id, existing.id));
      return { ok: true };
    }),
  }),

  emailDrafts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const scope = await resolveScope(ctx);
      const q = db.select().from(crmEmailDrafts);
      if (scope.kind === "affiliate") {
        return q.where(eq(crmEmailDrafts.affiliateId, scope.affiliateId)).orderBy(desc(crmEmailDrafts.updatedAt));
      }
      if (scope.kind === "contractor") {
        return q.where(eq(crmEmailDrafts.authorUserId, scope.userId)).orderBy(desc(crmEmailDrafts.updatedAt));
      }
      return q.orderBy(desc(crmEmailDrafts.updatedAt));
    }),
    save: protectedProcedure.input(z.object({
      id: z.number().int().optional(),
      dealId: z.number().int().nullable().optional(),
      toEmail: z.string().max(320),
      subject: z.string().max(512),
      bodyHtml: z.string().max(50000),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = await resolveScope(ctx);
      if (input.dealId != null) await getOwnedDeal(ctx, input.dealId);
      const affiliateId = ownedAffiliateId(scope);
      if (input.id) {
        const [existing] = await db.select().from(crmEmailDrafts).where(eq(crmEmailDrafts.id, input.id)).limit(1);
        if (!existing || !crmMailboxVisible(mailboxScope(scope), existing)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found." });
        }
        await db.update(crmEmailDrafts).set({
          dealId: input.dealId ?? null,
          toEmail: input.toEmail.trim(),
          subject: input.subject,
          bodyHtml: input.bodyHtml,
        }).where(eq(crmEmailDrafts.id, existing.id));
        return { id: existing.id };
      }
      const result = await db.insert(crmEmailDrafts).values({
        affiliateId,
        dealId: input.dealId ?? null,
        authorUserId: ctx.user.id,
        toEmail: input.toEmail.trim(),
        subject: input.subject,
        bodyHtml: input.bodyHtml,
      });
      return { id: (result as unknown as [{ insertId: number }])[0].insertId };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = await resolveScope(ctx);
      const [existing] = await db.select().from(crmEmailDrafts).where(eq(crmEmailDrafts.id, input.id)).limit(1);
      if (!existing || !crmMailboxVisible(mailboxScope(scope), existing)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found." });
      }
      await db.delete(crmEmailDrafts).where(eq(crmEmailDrafts.id, existing.id));
      return { ok: true };
    }),
  }),

  emailMailbox: router({
    list: protectedProcedure.input(z.object({
      dealId: z.number().int().optional(),
      stage: z.string().optional(),
      status: z.enum(["all", "sent", "draft"]).default("all"),
    }).optional()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const scope = await resolveScope(ctx);
      const where = scopeWhere(scope);
      const sentQuery = db.select({
        id: crmEmailLog.id,
        dealId: crmEmailLog.dealId,
        toEmail: crmEmailLog.toEmail,
        fromEmail: crmEmailLog.fromEmail,
        subject: crmEmailLog.subject,
        body: crmEmailLog.body,
        at: crmEmailLog.sentAt,
        actor: crmEmailLog.sentByName,
        title: crmDeals.title,
        stage: crmDeals.stage,
        affiliateId: crmDeals.affiliateId,
        contactName: crmDeals.contactName,
      }).from(crmEmailLog).innerJoin(crmDeals, eq(crmEmailLog.dealId, crmDeals.id));
      const sent = input?.status === "draft"
        ? []
        : await (where ? sentQuery.where(where).orderBy(desc(crmEmailLog.sentAt)).limit(200) : sentQuery.orderBy(desc(crmEmailLog.sentAt)).limit(200));
      const draftQuery = db.select().from(crmEmailDrafts);
      const draftRows = input?.status === "sent"
        ? []
        : scope.kind === "affiliate"
          ? await draftQuery.where(eq(crmEmailDrafts.affiliateId, scope.affiliateId)).orderBy(desc(crmEmailDrafts.updatedAt)).limit(200)
          : scope.kind === "contractor"
            ? await draftQuery.where(eq(crmEmailDrafts.authorUserId, scope.userId)).orderBy(desc(crmEmailDrafts.updatedAt)).limit(200)
            : await draftQuery.orderBy(desc(crmEmailDrafts.updatedAt)).limit(200);
      const drafts = draftRows;
      const dealIds = drafts.map((row) => row.dealId).filter((id): id is number => id != null);
      const draftDeals = dealIds.length === 0
        ? []
        : await db.select({
          id: crmDeals.id,
          title: crmDeals.title,
          stage: crmDeals.stage,
          contactName: crmDeals.contactName,
        }).from(crmDeals).where(inArray(crmDeals.id, dealIds));
      const dealById = new Map(draftDeals.map((deal) => [deal.id, deal]));
      const rows = [
        ...sent.map((row) => ({
          kind: "sent" as const,
          id: row.id,
          dealId: row.dealId,
          toEmail: row.toEmail,
          fromEmail: row.fromEmail,
          subject: row.subject,
          body: row.body,
          at: row.at,
          actor: row.actor,
          title: row.title,
          stage: row.stage,
          affiliateId: row.affiliateId,
          contactName: row.contactName,
        })),
        ...drafts.map((row) => {
          const deal = row.dealId == null ? null : dealById.get(row.dealId);
          return {
            kind: "draft" as const,
            id: row.id,
            dealId: row.dealId,
            toEmail: row.toEmail,
            fromEmail: null as string | null,
            subject: row.subject,
            body: row.bodyHtml,
            at: row.updatedAt,
            actor: null as string | null,
            title: deal?.title ?? "No deal",
            stage: deal?.stage ?? null,
            affiliateId: row.affiliateId,
            contactName: deal?.contactName ?? null,
          };
        }),
      ];
      return rows.filter((row) => {
        if (input?.dealId != null && row.dealId !== input.dealId) return false;
        if (input?.stage && input.stage !== "all" && row.stage !== input.stage) return false;
        return true;
      });
    }),
  }),

  emailContacts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const scope = await resolveScope(ctx);
    const where = scopeWhere(scope);
    const q = db.select({
      id: crmDeals.id,
      title: crmDeals.title,
      contactName: crmDeals.contactName,
      contactEmail: crmDeals.contactEmail,
      stage: crmDeals.stage,
      affiliateId: crmDeals.affiliateId,
      estimatedValue: crmDeals.estimatedValue,
    }).from(crmDeals);
    const rows = await (where ? q.where(where) : q);
    return rows.filter((row) => row.contactEmail);
  }),

  boardDecorations: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { owners: {} as Record<number, { name: string | null; email: string | null }>, lastActivity: {} as Record<number, { at: Date; kind: string }> };
    const scope = await resolveScope(ctx);
    const where = scopeWhere(scope);
    const dealQuery = db.select({ id: crmDeals.id, ownerUserId: crmDeals.ownerUserId }).from(crmDeals);
    const deals = await (where ? dealQuery.where(where) : dealQuery);
    const dealIds = deals.map((deal) => deal.id);
    const ownerIds = Array.from(new Set(deals.map((deal) => deal.ownerUserId).filter((id): id is number => id != null)));
    const owners = ownerIds.length === 0
      ? []
      : await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ownerIds));
    const activities = dealIds.length === 0
      ? []
      : await db.select({
        dealId: crmActivities.dealId,
        createdAt: crmActivities.createdAt,
        kind: crmActivities.kind,
      }).from(crmActivities).where(inArray(crmActivities.dealId, dealIds)).orderBy(desc(crmActivities.createdAt));
    const lastActivity: Record<number, { at: Date; kind: string }> = {};
    for (const activity of activities) {
      if (!lastActivity[activity.dealId]) lastActivity[activity.dealId] = { at: activity.createdAt, kind: activity.kind };
    }
    return {
      owners: Object.fromEntries(owners.map((owner) => [owner.id, { name: owner.name, email: owner.email }])),
      lastActivity,
    };
  }),

  dealFiles: router({
    list: protectedProcedure.input(z.object({ dealId: z.number().int() })).query(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      return db.select().from(crmDealFiles).where(eq(crmDealFiles.dealId, deal.id)).orderBy(desc(crmDealFiles.createdAt));
    }),
    add: protectedProcedure.input(z.object({
      dealId: z.number().int(),
      fileName: z.string().min(1).max(256),
      fileUrl: z.string().url().max(1024),
    })).mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      const result = await db.insert(crmDealFiles).values({
        dealId: deal.id,
        fileName: input.fileName.trim(),
        fileUrl: input.fileUrl.trim(),
        uploadedByUserId: ctx.user.id,
      });
      await db.insert(crmActivities).values({
        dealId: deal.id,
        authorUserId: ctx.user.id,
        kind: "note",
        body: `File added: ${input.fileName.trim()}`,
      });
      return { id: (result as unknown as [{ insertId: number }])[0].insertId };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [file] = await db.select().from(crmDealFiles).where(eq(crmDealFiles.id, input.id)).limit(1);
      if (!file) throw new TRPCError({ code: "NOT_FOUND" });
      await getOwnedDeal(ctx, file.dealId);
      await db.delete(crmDealFiles).where(eq(crmDealFiles.id, file.id));
      return { ok: true };
    }),
  }),
});
