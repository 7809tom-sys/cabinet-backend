// Pure CRM mailbox helpers shared by the server and the client.
// No database, nodemailer, or secret material is handled here except as
// opaque strings the server later encrypts. Passwords are never part of the
// public settings shape.

import type { CrmPriority, CrmStage } from "./crm";
import { isClosedStage, isWonRevenueStage } from "./crm";

export const CRM_EMAIL_PROVIDERS = ["gmail", "outlook", "yahoo", "custom"] as const;
export type CrmEmailProvider = (typeof CRM_EMAIL_PROVIDERS)[number];

export const CRM_SMTP_PRESETS: Record<CrmEmailProvider, { label: string; host: string; port: number; hint: string }> = {
  gmail: {
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: 587,
    hint: "Use a Google app password. Port 587 uses STARTTLS. Turn on 2-Step Verification, then create an app password.",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    host: "smtp.office365.com",
    port: 587,
    hint: "Use an app password or a mailbox with SMTP AUTH enabled. Port 587 uses STARTTLS.",
  },
  yahoo: {
    label: "Yahoo",
    host: "smtp.mail.yahoo.com",
    port: 587,
    hint: "Use a Yahoo app password. Port 587 uses STARTTLS.",
  },
  custom: {
    label: "Custom SMTP",
    host: "",
    port: 587,
    hint: "Enter the host and port from your provider. 465 is SSL. 587 is STARTTLS.",
  },
};

export const CRM_EMAIL_MERGE_FIELDS = [
  "contactName",
  "contactEmail",
  "dealTitle",
  "storeName",
  "estimatedValue",
  "stage",
  "designLink",
  "quoteLink",
  "signature",
] as const;

export type CrmEmailMergeField = (typeof CRM_EMAIL_MERGE_FIELDS)[number];

export const CRM_BUILTIN_EMAIL_TEMPLATES = [
  {
    key: "follow_up",
    name: "Follow-up",
    subject: "Following up on {{dealTitle}}",
    bodyHtml: "<p>Hi {{contactName}},</p><p>I wanted to follow up on <strong>{{dealTitle}}</strong>. Reply to this note and I will pick it up from there.</p><p>{{signature}}</p>",
  },
  {
    key: "quote_ready",
    name: "Quote ready",
    subject: "Your quote is ready — {{dealTitle}}",
    bodyHtml: "<p>Hi {{contactName}},</p><p>Your quote for {{dealTitle}} is ready. Estimated value: {{estimatedValue}}.</p><p>{{quoteLink}}</p><p>{{signature}}</p>",
  },
  {
    key: "design_ready",
    name: "Design ready",
    subject: "Your kitchen design is ready",
    bodyHtml: "<p>Hi {{contactName}},</p><p>Your design for {{dealTitle}} is ready to review.</p><p>{{designLink}}</p><p>{{signature}}</p>",
  },
] as const;

export type StoredAffiliateEmailSettings = {
  affiliateId: number;
  provider: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  fromName: string;
  replyTo: string;
  signatureHtml: string;
  enabled: boolean;
  lastTestedAt?: Date | string | null;
  lastTestOk?: boolean | null;
};

export type PublicAffiliateEmailSettings = {
  affiliateId: number;
  provider: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  fromName: string;
  replyTo: string;
  signatureHtml: string;
  enabled: boolean;
  hasPassword: boolean;
  lastTestedAt: Date | string | null;
  lastTestOk: boolean | null;
  connected: boolean;
};

export function affiliateSmtpReady(settings: Pick<StoredAffiliateEmailSettings, "enabled" | "smtpHost" | "smtpUser" | "smtpPass"> | null | undefined): boolean {
  return !!(settings && settings.enabled && settings.smtpHost.trim() && settings.smtpUser.trim() && settings.smtpPass);
}

/** Client-safe view. The stored password is reduced to a boolean and dropped. */
export function toPublicAffiliateEmailSettings(row: StoredAffiliateEmailSettings): PublicAffiliateEmailSettings {
  return {
    affiliateId: row.affiliateId,
    provider: row.provider,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpUser: row.smtpUser,
    smtpFrom: row.smtpFrom,
    fromName: row.fromName,
    replyTo: row.replyTo,
    signatureHtml: row.signatureHtml,
    enabled: row.enabled,
    hasPassword: row.smtpPass.trim().length > 0,
    lastTestedAt: row.lastTestedAt ?? null,
    lastTestOk: row.lastTestOk ?? null,
    connected: affiliateSmtpReady(row),
  };
}

export function formatMailboxFrom(name: string, email: string): string {
  const cleanEmail = email.trim();
  const cleanName = name.replace(/[\r\n"]/g, "").trim();
  if (!cleanName) return cleanEmail;
  return `"${cleanName}" <${cleanEmail}>`;
}

export type PlatformSmtpRow = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  enabled: boolean;
} | null;

export type CrmOutboundPlan =
  | { ok: false; reason: "not_configured" | "disabled" }
  | {
      ok: true;
      channel: "affiliate" | "platform_fallback" | "platform";
      from: string;
      replyTo?: string;
      signatureHtml: string;
    };

function affiliateReplyAddress(input: {
  publicEmail?: string;
  affiliate: StoredAffiliateEmailSettings | null;
}): string | undefined {
  const mailbox = (input.affiliate?.smtpFrom || input.affiliate?.smtpUser || "").trim();
  return input.affiliate?.replyTo.trim() || input.publicEmail || mailbox || undefined;
}

/**
 * Choose the identity for one CRM send.
 * Delivery is always the shared Resend sender. An affiliate deal puts the
 * affiliate or public address in reply-to. Saved SMTP rows do not make a
 * send ready and are not used as the transport.
 */
export function resolveCrmOutbound(input: {
  dealAffiliateId: number | null;
  storeName: string;
  publicEmail: string | null;
  affiliate: StoredAffiliateEmailSettings | null;
  platform: PlatformSmtpRow;
  resendReady?: boolean;
  resendFrom?: string;
}): CrmOutboundPlan {
  const from = input.resendFrom?.trim() ?? "";
  if (!input.resendReady || !from) return { ok: false, reason: "not_configured" };
  const publicEmail = input.publicEmail?.trim() || undefined;
  if (input.dealAffiliateId != null) {
    return {
      ok: true,
      channel: affiliateSmtpReady(input.affiliate) ? "affiliate" : "platform_fallback",
      from,
      replyTo: affiliateReplyAddress({ publicEmail, affiliate: input.affiliate }),
      signatureHtml: input.affiliate?.signatureHtml ?? "",
    };
  }
  return {
    ok: true,
    channel: "platform",
    from,
    signatureHtml: "",
  };
}

export function applyCrmMergeFields(template: string, fields: Partial<Record<CrmEmailMergeField, string>>): string {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key: string) => {
    if (!CRM_EMAIL_MERGE_FIELDS.includes(key as CrmEmailMergeField)) return match;
    return fields[key as CrmEmailMergeField] ?? "";
  });
}

export function sanitizeCrmEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export function crmHtmlToText(html: string): string {
  return sanitizeCrmEmailHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function appendEmailSignature(html: string, signatureHtml: string): string {
  const signature = sanitizeCrmEmailHtml(signatureHtml).trim();
  if (!signature) return sanitizeCrmEmailHtml(html);
  const body = sanitizeCrmEmailHtml(html);
  if (body.includes(signature)) return body;
  return `${body}<div data-crm-signature="true" style="margin-top:16px">${signature}</div>`;
}

export type CrmMailboxScope =
  | { kind: "house" }
  | { kind: "affiliate"; affiliateId: number }
  | { kind: "contractor"; userId: number };

/** Server-enforced visibility for a draft, template, or sent row. */
export function crmMailboxVisible(
  scope: CrmMailboxScope,
  row: { affiliateId: number | null; authorUserId?: number | null },
): boolean {
  if (scope.kind === "house") return true;
  if (scope.kind === "affiliate") return row.affiliateId === scope.affiliateId;
  return row.authorUserId != null && row.authorUserId === scope.userId;
}

export function crmDueState(nextFollowUpAt: Date | string | null | undefined, now = new Date()): "none" | "today" | "overdue" {
  if (nextFollowUpAt == null || nextFollowUpAt === "") return "none";
  const due = new Date(nextFollowUpAt);
  if (Number.isNaN(due.getTime())) return "none";
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (due.getTime() < start.getTime()) return "overdue";
  if (due.getTime() < end.getTime()) return "today";
  return "none";
}

export type MondayDeal = {
  id: number;
  title: string;
  stage: CrmStage;
  priority: CrmPriority;
  contactName: string | null;
  contactEmail: string | null;
  company: string | null;
  estimatedValue: string | number | null;
  nextFollowUpAt: Date | string | null;
  affiliateId?: number | null;
  updatedAt?: Date | string | null;
  ownerUserId?: number | null;
};

export type MondayFilters = {
  search: string;
  stage: "all" | CrmStage;
  priority: "all" | CrmPriority;
  due: "all" | "today" | "overdue";
  affiliate: "all" | "house" | string;
};

export function filterMondayDeals<T extends MondayDeal>(deals: T[], filters: MondayFilters, now = new Date()): T[] {
  const search = filters.search.trim().toLowerCase();
  return deals.filter((deal) => {
    if (filters.stage !== "all" && deal.stage !== filters.stage) return false;
    if (filters.priority !== "all" && deal.priority !== filters.priority) return false;
    if (filters.due !== "all" && crmDueState(deal.nextFollowUpAt, now) !== filters.due) return false;
    if (filters.affiliate === "house" && deal.affiliateId != null) return false;
    if (filters.affiliate !== "all" && filters.affiliate !== "house" && String(deal.affiliateId ?? "") !== filters.affiliate) return false;
    if (!search) return true;
    const haystack = [deal.title, deal.contactName, deal.contactEmail, deal.company].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(search);
  });
}

export type AffiliatePipelineTotal = {
  affiliateId: number | null;
  name: string;
  openCount: number;
  openValue: number;
  wonCount: number;
};

export function summarizeAffiliatePipelines(
  deals: MondayDeal[],
  names: Record<number, string>,
): AffiliatePipelineTotal[] {
  const groups = new Map<number | null, AffiliatePipelineTotal>();
  const ensure = (affiliateId: number | null) => {
    let row = groups.get(affiliateId);
    if (!row) {
      row = {
        affiliateId,
        name: affiliateId == null ? "Cabinet Dealz (house)" : names[affiliateId] ?? `Affiliate #${affiliateId}`,
        openCount: 0,
        openValue: 0,
        wonCount: 0,
      };
      groups.set(affiliateId, row);
    }
    return row;
  };
  for (const deal of deals) {
    const affiliateId = deal.affiliateId ?? null;
    const row = ensure(affiliateId);
    if (isWonRevenueStage(deal.stage)) row.wonCount += 1;
    if (!isClosedStage(deal.stage)) {
      row.openCount += 1;
      const value = Number(deal.estimatedValue ?? 0);
      if (Number.isFinite(value)) row.openValue += value;
    }
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.affiliateId == null) return -1;
    if (b.affiliateId == null) return 1;
    return a.name.localeCompare(b.name);
  });
}

export type PipelineCandidate = {
  id: number;
  affiliateId: number | null;
  contactEmail: string | null;
  orderRequestId: number | null;
  stage: string;
};

export type PipelineNeedle = {
  affiliateId: number | null;
  match: "order" | "email";
  orderRequestId?: number | null;
  contactEmail?: string | null;
};

function sameAffiliate(left: number | null, right: number | null) {
  return (left ?? null) === (right ?? null);
}

/**
 * Pick an existing deal to attach to, or null when a new deal should be created.
 * Order matches are exact on orderRequestId inside the same affiliate scope.
 * Email matches reuse the newest open deal with the same address in that scope.
 */
export function pickPipelineDeal(candidates: PipelineCandidate[], needle: PipelineNeedle): PipelineCandidate | null {
  const scoped = candidates.filter((row) => sameAffiliate(row.affiliateId, needle.affiliateId));
  if (needle.match === "order" && needle.orderRequestId != null) {
    return scoped.find((row) => row.orderRequestId === needle.orderRequestId) ?? null;
  }
  const email = needle.contactEmail?.trim().toLowerCase();
  if (needle.match === "email" && email) {
    return scoped.find((row) => {
      if (row.stage === "won" || row.stage === "lost" || row.stage === "new_sale") return false;
      return (row.contactEmail ?? "").trim().toLowerCase() === email;
    }) ?? null;
  }
  return null;
}

export const CRM_STAGE_COLORS: Record<CrmStage, string> = {
  new: "#1a2b4a",
  contacted: "#2563eb",
  qualified: "#0f766e",
  image_review: "#7c3aed",
  quoted: "#c9a227",
  new_sale: "#047857",
  won: "#15803d",
  lost: "#be123c",
};

export const CRM_SAVED_VIEW_STORAGE_PREFIX = "cabinetdealz.crm.savedViews.";
