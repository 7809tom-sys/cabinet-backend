// Outreach environment. Values are read, never logged or returned to a client
// except the non-secret ones the admin status card shows.

export type OutreachEnv = {
  /** Hard master switch. Anything other than "true" keeps every send off. */
  envEnabled: boolean;
  /** CAN-SPAM physical postal address printed in every footer. */
  mailingAddress: string;
  /** Business name shown in the footer. */
  businessName: string;
  /** Public site origin used for unsubscribe / click links. */
  publicBaseUrl: string;
  /** Reply-To for outreach mail. Should be the inbound address when replies are wired. */
  replyTo: string;
  /** Where replies, "are you a bot?" questions and alerts go. */
  ownerEmail: string;
  /** Svix secret for the inbound-reply webhook. Empty = replies are not detected automatically. */
  inboundSecretSet: boolean;
  /** Svix secret for Resend delivery events (bounce / complaint / delivered). */
  eventsSecretSet: boolean;
  /** Optional: names the AI must never write, on top of the built-in list and the distributors table. */
  extraBlockedNames: string[];
};

export function readOutreachEnv(env: NodeJS.ProcessEnv = process.env): OutreachEnv {
  const base = (env.OUTREACH_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return {
    envEnabled: (env.OUTREACH_ENABLED ?? "").trim().toLowerCase() === "true",
    mailingAddress: (env.OUTREACH_MAILING_ADDRESS ?? "").trim(),
    businessName: (env.OUTREACH_BUSINESS_NAME ?? "").trim() || "CabinetDealz",
    publicBaseUrl: /^https:\/\//i.test(base) ? base : "https://www.cabinetdealz.com",
    replyTo: (env.OUTREACH_REPLY_TO ?? "").trim(),
    ownerEmail: (env.OWNER_EMAIL ?? "").trim() || "7809tom@gmail.com",
    inboundSecretSet: Boolean((env.OUTREACH_INBOUND_WEBHOOK_SECRET ?? "").trim()),
    eventsSecretSet: Boolean((env.OUTREACH_EVENTS_WEBHOOK_SECRET ?? "").trim()),
    extraBlockedNames: (env.OUTREACH_BLOCKED_NAMES ?? "")
      .split(/[,;\n]+/)
      .map((name) => name.trim())
      .filter((name) => name.length >= 3),
  };
}

export function inboundSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OUTREACH_INBOUND_WEBHOOK_SECRET ?? "").trim();
}

export function eventsSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OUTREACH_EVENTS_WEBHOOK_SECRET ?? "").trim();
}

export type OutreachBlocker =
  | "env_disabled"
  | "admin_disabled"
  | "preview_mode"
  | "no_mailing_address"
  | "auto_needs_reply_detection";

/**
 * Why the engine may not send real mail right now (empty = it may).
 * Automatic mode also requires reply detection: without it a customer could
 * answer and still get the next step, so the engine falls back to approval.
 */
export function sendBlockers(env: OutreachEnv, settings: { enabled: boolean; mode: string }): OutreachBlocker[] {
  const blockers: OutreachBlocker[] = [];
  if (!env.envEnabled) blockers.push("env_disabled");
  if (!settings.enabled) blockers.push("admin_disabled");
  if (settings.mode === "preview") blockers.push("preview_mode");
  if (!env.mailingAddress) blockers.push("no_mailing_address");
  return blockers;
}

/** Automatic sending needs reply detection; otherwise drafts go to the approval queue. */
export function effectiveMode(env: OutreachEnv, mode: string): "preview" | "approval" | "auto" {
  if (mode === "auto") return env.inboundSecretSet && env.replyTo ? "auto" : "approval";
  return mode === "approval" ? "approval" : "preview";
}

export const OUTREACH_BLOCKER_MESSAGES: Record<OutreachBlocker, string> = {
  env_disabled: "OUTREACH_ENABLED is not \"true\" on the server.",
  admin_disabled: "The outreach switch in the admin CRM is off.",
  preview_mode: "Preview mode: drafts are saved but never sent.",
  no_mailing_address: "OUTREACH_MAILING_ADDRESS is not set. The law requires a postal address in every marketing email.",
  auto_needs_reply_detection: "Automatic mode needs OUTREACH_REPLY_TO and OUTREACH_INBOUND_WEBHOOK_SECRET so replies stop the sequence; until then drafts wait for approval.",
};
