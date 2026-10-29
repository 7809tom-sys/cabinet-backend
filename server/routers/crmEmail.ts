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
import { getOwnedDeal, resolveScope, scopeWhere, type CrmScope } from "./crm";
import {
  CRM_EMAIL_PROVIDERS,
  crmMailboxVisible,
  toPublicAffiliateEmailSettings,
  type CrmMailboxScope,
} from "@shared/crmMailbox";
import { deliverCrmMessage } from "../lib/crmOutboundMail";

function mailboxScope(scope: CrmScope): CrmMailboxScope {
  if (scope.kind === "house") return { kind: "house" };
  if (scope.kind === "affiliate") return { kind: "affiliate", affiliateId: scope.affiliateId };
  return { kind: "contractor", userId: scope.userId };
}

function ownedAffiliateId(scope: CrmScope): number | null {
  return scope.kind === "affiliate" ? scope.affiliateId : null;
}

const templateInput = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(128),
  subject: z.string().max(512),
  bodyHtml: z.string().max(50000),
});

export const crmEmailRouter = router({
  emailSetup: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const scope = await resolveScope(ctx);
      if (!db || scope.kind !== "affiliate") {
        return { mode: scope.kind === "affiliate" ? "affiliate" as const : "platform" as const, settings: null };
      }
      const [row] = await db.select().from(affiliateEmailSettings).where(eq(affiliateEmailSettings.affiliateId, scope.affiliateId)).limit(1);
      return {
        mode: "affiliate" as const,
        settings: row ? toPublicAffiliateEmailSettings(row) : null,
      };
    }),

    save: protectedProcedure.input(z.object({
      provider: z.enum(CRM_EMAIL_PROVIDERS),
      smtpHost: z.string().max(255),
      smtpPort: z.number().int().min(1).max(65535),
      smtpUser: z.string().max(255),
      smtpPass: z.string().max(2000).optional(),
      smtpFrom: z.string().max(320),
      fromName: z.string().max(256),
      replyTo: z.string().max(320),
      signatureHtml: z.string().max(20000),
      enabled: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = await resolveScope(ctx);
      if (scope.kind !== "affiliate") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Connect email from your own affiliate CRM." });
      }
      const [existing] = await db.select().from(affiliateEmailSettings).where(eq(affiliateEmailSettings.affiliateId, scope.affiliateId)).limit(1);
      const smtpPass = input.smtpPass && input.smtpPass.trim()
        ? encryptEmailSettingsPassword(input.smtpPass)
        : existing?.smtpPass ?? "";
      const values = {
        affiliateId: scope.affiliateId,
        provider: input.provider,
        smtpHost: input.smtpHost.trim(),
        smtpPort: input.smtpPort,
        smtpUser: input.smtpUser.trim(),
        smtpPass,
        smtpFrom: input.smtpFrom.trim(),
        fromName: input.fromName.trim(),
        replyTo: input.replyTo.trim(),
        signatureHtml: input.signatureHtml,
        enabled: input.enabled,
      };
      if (existing) {
        await db.update(affiliateEmailSettings).set(values).where(eq(affiliateEmailSettings.id, existing.id));
      } else {
        await db.insert(affiliateEmailSettings).values(values);
      }
      return { ok: true, hasPassword: smtpPass.trim().length > 0 };
    }),

    testSend: protectedProcedure.input(z.object({
      to: z.string().email(),
      provider: z.enum(CRM_EMAIL_PROVIDERS),
      smtpHost: z.string().max(255).optional().default(""),
      smtpPort: z.number().int().min(1).max(65535).optional().default(587),
      smtpUser: z.string().max(255).optional().default(""),
      smtpPass: z.string().max(2000).optional(),
      smtpFrom: z.string().max(320).optional(),
      fromName: z.string().max(256).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = await resolveScope(ctx);
      if (scope.kind !== "affiliate") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Test email from your own affiliate CRM." });
      }
      const [existing] = await db.select().from(affiliateEmailSettings).where(eq(affiliateEmailSettings.affiliateId, scope.affiliateId)).limit(1);
      const replyTo = (input.smtpFrom || input.smtpUser).trim();
      try {
        await deliverCrmMessage({
          ok: true,
          channel: "affiliate",
          from: process.env.ORDER_EMAIL_FROM?.trim() || "Cabinet Dealz",
          replyTo,
          signatureHtml: existing?.signatureHtml ?? "",
        }, {
          to: input.to,
          subject: "Cabinet Dealz CRM test",
          text: "This is a test from your CRM email setup. No customer message was sent.",
          html: "<p>This is a test from your CRM email setup. No customer message was sent.</p>",
        });
        if (existing) {
          await db.update(affiliateEmailSettings).set({ lastTestedAt: new Date(), lastTestOk: true, provider: input.provider }).where(eq(affiliateEmailSettings.id, existing.id));
        }
        return { ok: true };
      } catch (error) {
        if (existing) {
          await db.update(affiliateEmailSettings).set({ lastTestedAt: new Date(), lastTestOk: false }).where(eq(affiliateEmailSettings.id, existing.id));
        }
        throw error;
      }
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
          provider: pub?.provider ?? null,
          fromName: pub?.fromName ?? "",
          replyTo: pub?.replyTo || store.publicEmail || "",
          smtpUser: pub?.smtpUser ?? "",
          enabled: pub?.enabled ?? false,
          hasPassword: pub?.hasPassword ?? false,
          lastTestedAt: pub?.lastTestedAt ?? null,
          lastTestOk: pub?.lastTestOk ?? null,
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
