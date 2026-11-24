// Turns an approved draft into the exact email that is sent: body, signature,
// one tracked call-to-action link, and the CAN-SPAM footer (who it is from,
// why they got it, the postal address and a working unsubscribe link), plus
// the List-Unsubscribe headers for one-click unsubscribe in mail apps.

import type { OutreachEnv } from "./config";

/** Destinations a tracked link may redirect to. Fixed list = no open redirect. */
export const OUTREACH_LINK_TARGETS = {
  design: "/design",
  home: "/",
} as const;
export type OutreachLinkKey = keyof typeof OUTREACH_LINK_TARGETS;

export function unsubscribeUrl(env: Pick<OutreachEnv, "publicBaseUrl">, token: string): string {
  return `${env.publicBaseUrl}/api/outreach/unsubscribe/${encodeURIComponent(token)}`;
}

export function trackedLinkUrl(env: Pick<OutreachEnv, "publicBaseUrl">, token: string, messageId: number, key: OutreachLinkKey): string {
  return `${env.publicBaseUrl}/api/outreach/c/${encodeURIComponent(token)}/${messageId}/${key}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type RenderedOutreachEmail = {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  replyTo?: string;
};

export function renderOutreachEmail(input: {
  env: OutreachEnv;
  subject: string;
  bodyText: string;
  senderName: string;
  unsubscribeToken: string;
  messageId: number;
  customerListName: string | null;
}): RenderedOutreachEmail {
  const { env } = input;
  const unsub = unsubscribeUrl(env, input.unsubscribeToken);
  const cta = trackedLinkUrl(env, input.unsubscribeToken, input.messageId, "design");
  const why = input.customerListName
    ? `You're receiving this because you're on the ${env.businessName} customer list (${input.customerListName}).`
    : `You're receiving this because you've been in touch with ${env.businessName}.`;
  const signature = input.senderName;
  const paragraphs = input.bodyText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const text = [
    ...paragraphs,
    `Start or open a design: ${cta}`,
    signature,
    "—",
    why,
    `${env.businessName} · ${env.mailingAddress}`,
    `Unsubscribe: ${unsub}`,
  ].join("\n\n");

  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937;max-width:600px">`,
    ...paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`),
    `<p style="margin:0 0 14px"><a href="${escapeHtml(cta)}" style="color:#1a2b4a;font-weight:bold">Start or open a design</a></p>`,
    `<p style="margin:0 0 24px">${escapeHtml(signature)}</p>`,
    `<hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 12px">`,
    `<p style="margin:0 0 6px;font-size:12px;color:#6b7280">${escapeHtml(why)}</p>`,
    `<p style="margin:0 0 6px;font-size:12px;color:#6b7280">${escapeHtml(env.businessName)} · ${escapeHtml(env.mailingAddress)}</p>`,
    `<p style="margin:0;font-size:12px;color:#6b7280"><a href="${escapeHtml(unsub)}" style="color:#6b7280">Unsubscribe</a> from these emails.</p>`,
    `</div>`,
  ].join("");

  return {
    subject: input.subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    replyTo: env.replyTo || env.ownerEmail || undefined,
  };
}
