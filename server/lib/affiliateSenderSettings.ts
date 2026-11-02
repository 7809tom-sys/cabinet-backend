// One implementation behind both affiliate email-settings surfaces.
//
// `crm.emailSetup.*` is the backend's own CRM setup screen. The frontend
// dashboard (cabinet-frontend PR 232) calls `affiliateEmailSettings.*` with a
// different field vocabulary. Both routers delegate here, so the two can never
// diverge on authorization, password handling, or what a save writes.
//
// Authorization is identical for both: a platform admin may act on any store but
// must name it; an affiliate owner may act only on the store their login
// resolves to. Team members are refused even with CRM access, because the app
// password controls the store's entire outbound identity.

import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { affiliateEmailSettings, affiliates } from "../../drizzle/schema";
import { isUsableSenderEmail, resolveSmtpSecure } from "@shared/affiliateSender";
import type { AffiliateEmailSettingsUpdateInput, AffiliateEmailSettingsView } from "@shared/affiliateEmailSettingsContract";
import { toAffiliateEmailSettingsView, toNativeSenderColumns } from "@shared/affiliateEmailSettingsContract";
import { getDb } from "../db";
import { encryptEmailSettingsPassword } from "./emailSettingsCrypto";
import { resolveAffiliateAccess } from "./affiliateAccess";
import { platformInvoiceCopyAddress, sendAffiliateTestEmail, isPlatformSenderConfigured } from "./affiliateSender";
import { toPublicAffiliateEmailSettings } from "@shared/crmMailbox";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type SenderCtx = { user: { id: number; email: string | null; role: string } };

/**
 * Which affiliate's sender settings this caller may read or write.
 *
 * A platform admin may act on any store but must name it: the caller sends an
 * affiliate id, never a slug, and the row is re-read here. An affiliate owner
 * may act only on the store they resolve to. Nobody can act on a store the
 * server did not resolve, so a client-supplied slug or id can never reach
 * another store's mailbox.
 */
export async function resolveSenderTargetAffiliateId(
  ctx: SenderCtx,
  requestedAffiliateId?: number,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  if (ctx.user.role === "admin") {
    if (requestedAffiliateId == null) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose which affiliate store's email settings to open.",
      });
    }
    const [row] = await db
      .select({ id: affiliates.id })
      .from(affiliates)
      .where(eq(affiliates.id, requestedAffiliateId))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });
    return row.id;
  }
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

export type SenderRow = typeof affiliateEmailSettings.$inferSelect;

export async function loadSenderRow(db: Database, affiliateId: number): Promise<SenderRow | null> {
  const [row] = await db
    .select()
    .from(affiliateEmailSettings)
    .where(eq(affiliateEmailSettings.affiliateId, affiliateId))
    .limit(1);
  return row ?? null;
}

/** The response shape the CRM setup screen reads. */
export async function loadSenderSetupForCrm(ctx: SenderCtx, requestedAffiliateId?: number) {
  const db = await getDb();
  const target = await resolveSenderTargetAffiliateId(ctx, requestedAffiliateId);
  const platformCopy = platformInvoiceCopyAddress();
  const platformFallbackAvailable = isPlatformSenderConfigured();
  if (!db) {
    return {
      mode: "affiliate" as const,
      affiliateId: target,
      settings: null,
      invoiceCopyDefault: platformCopy,
      platformFallbackAvailable,
    };
  }
  const row = await loadSenderRow(db, target);
  return {
    mode: "affiliate" as const,
    affiliateId: target,
    settings: row ? toPublicAffiliateEmailSettings(row) : null,
    invoiceCopyDefault: platformCopy,
    platformFallbackAvailable,
  };
}

export type SenderSaveValues = {
  provider: string;
  contactEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass?: string;
  smtpFrom: string;
  fromName: string;
  replyTo: string;
  invoiceCopyEmail: string;
  signatureHtml: string;
  enabled: boolean;
};

export type SenderSaveResult = {
  affiliateId: number;
  row: SenderRow | null;
  hasPassword: boolean;
  configured: boolean;
};

/**
 * Write one sender row. A blank password keeps the saved one so the owner can
 * change the host or port without re-typing the app password. Enabling requires
 * host, username, and a stored password.
 *
 * `preserve` lets a contract-shaped save keep the CRM-only fields (from name,
 * signature, reply-to, invoice copy) that the simpler dashboard does not send.
 */
export async function saveSenderSettings(
  ctx: SenderCtx,
  input: SenderSaveValues & { affiliateId?: number },
): Promise<SenderSaveResult> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const affiliateId = await resolveSenderTargetAffiliateId(ctx, input.affiliateId);
  const existing = await loadSenderRow(db, affiliateId);
  const contactEmail = requireEmail(input.contactEmail, "Contact email");
  const invoiceCopyEmail = optionalEmail(input.invoiceCopyEmail, "Invoice copy address");
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
  const row = await loadSenderRow(db, affiliateId);
  return {
    affiliateId,
    row,
    hasPassword: smtpPass.trim().length > 0,
    configured: input.enabled
      && Boolean(values.smtpHost && values.smtpUser && smtpPass)
      && isUsableSenderEmail(contactEmail),
  };
}

/**
 * Verify the saved mailbox handshake and send one test to the affiliate's own
 * contact address. The address is never client-supplied, so this cannot relay
 * mail to arbitrary recipients. The provider's exact error is returned.
 */
export async function runSenderTest(
  ctx: SenderCtx,
  requestedAffiliateId?: number,
): Promise<{ ok: true; from: string; to: string } | { ok: false; error: string; from: string | null }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const affiliateId = await resolveSenderTargetAffiliateId(ctx, requestedAffiliateId);
  const row = await loadSenderRow(db, affiliateId);
  const to = (row?.contactEmail || row?.smtpFrom || row?.smtpUser || "").trim();
  if (!isUsableSenderEmail(to)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Save a valid contact email for this affiliate before sending a test message.",
    });
  }
  const result = await sendAffiliateTestEmail(db, affiliateId, to);
  if (row) {
    await db
      .update(affiliateEmailSettings)
      .set({
        lastTestedAt: new Date(),
        lastTestOk: result.ok,
        lastTestError: result.ok ? null : result.error.slice(0, 1000),
      })
      .where(eq(affiliateEmailSettings.id, row.id));
  }
  return result;
}

/**
 * The contract-shaped view the frontend dashboard reads. `canEdit` is true
 * because the resolver above already threw a FORBIDDEN for anyone who may not
 * manage this store, so reaching here proves edit rights.
 */
export async function loadSenderSettingsView(
  ctx: SenderCtx,
  requestedAffiliateId: number,
): Promise<AffiliateEmailSettingsView> {
  const db = await getDb();
  const affiliateId = await resolveSenderTargetAffiliateId(ctx, requestedAffiliateId);
  const row = db ? await loadSenderRow(db, affiliateId) : null;
  return toAffiliateEmailSettingsView(row, { affiliateId, canEdit: true });
}

/**
 * The contract-shaped update. It only writes sender-identity fields; the CRM
 * extras (signature, reply-to, invoice copy, from name) are preserved from the
 * existing row so a dashboard save cannot silently erase them.
 */
export async function updateSenderSettingsFromContract(
  ctx: SenderCtx,
  input: AffiliateEmailSettingsUpdateInput,
): Promise<AffiliateEmailSettingsView> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const affiliateId = await resolveSenderTargetAffiliateId(ctx, input.affiliateId);
  const existing = await loadSenderRow(db, affiliateId);
  const columns = toNativeSenderColumns(input);
  await saveSenderSettings(ctx, {
    affiliateId,
    provider: columns.provider,
    contactEmail: columns.contactEmail,
    smtpHost: columns.smtpHost,
    smtpPort: columns.smtpPort,
    smtpSecure: columns.smtpSecure,
    smtpUser: columns.smtpUser,
    // Normalized by the contract helper; a blank value falls through to the
    // saved password, which saveSenderSettings already keeps.
    smtpPass: input.appPassword,
    smtpFrom: existing?.smtpFrom ?? "",
    fromName: existing?.fromName ?? "",
    replyTo: existing?.replyTo ?? "",
    invoiceCopyEmail: existing?.invoiceCopyEmail ?? "",
    signatureHtml: existing?.signatureHtml ?? "",
    enabled: columns.enabled,
  });
  const row = await loadSenderRow(db, affiliateId);
  return toAffiliateEmailSettingsView(row, { affiliateId, canEdit: true });
}

/** The contract-shaped test result. A missing address yields `to: ""`. */
export async function runSenderTestFromContract(
  ctx: SenderCtx,
  requestedAffiliateId: number,
): Promise<{ ok: boolean; to: string; error: string | null }> {
  const result = await runSenderTest(ctx, requestedAffiliateId);
  if (result.ok) return { ok: true, to: result.to, error: null };
  return { ok: false, to: "", error: result.error };
}
