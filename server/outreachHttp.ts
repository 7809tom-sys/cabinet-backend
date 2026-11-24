// Public outreach routes.
//
//   GET  /api/outreach/unsubscribe/:token   link in every email: unsubscribes, shows a confirmation page
//   POST /api/outreach/unsubscribe/:token   RFC 8058 one-click (List-Unsubscribe-Post) from mail apps
//   GET  /api/outreach/c/:token/:messageId/:key   tracked link: logs the click, redirects to a fixed site path
//   POST /api/outreach/inbound              Svix-signed inbound reply webhook (OUTREACH_INBOUND_WEBHOOK_SECRET)
//   POST /api/outreach/events               Svix-signed delivery events: bounce / complaint (OUTREACH_EVENTS_WEBHOOK_SECRET)
//
// Unsubscribe and click work even while outreach is switched off, so a link in
// an email that already went out always works. The webhooks fail closed with
// 503 when their secret is not set. None of these routes ever sends mail to a
// customer; replies are only forwarded to the owner.

import type { Express, Request, Response } from "express";
import express from "express";
import { verifyInboundSignature } from "./lib/inboundMailSignature";
import { parseInboundPayload } from "./lib/vendorEmailMailbox";
import { eventsSecret, inboundSecret, readOutreachEnv } from "./lib/outreach/config";
import { handleClick, handleDeliveryEvent, handleInboundReply, handleUnsubscribe } from "./lib/outreach/engine";
import { buildOutreachDeps, OUTREACH_LOG } from "./lib/outreach/runtime";

function header(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function signatureHeaders(req: Request) {
  return {
    id: header(req, "svix-id") ?? header(req, "webhook-id"),
    timestamp: header(req, "svix-timestamp") ?? header(req, "webhook-timestamp"),
    signature: header(req, "svix-signature") ?? header(req, "webhook-signature"),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function unsubscribePage(businessName: string, ok: boolean): string {
  const name = escapeHtml(businessName);
  const message = ok
    ? `You're unsubscribed. ${name} won't send you any more of these emails.`
    : `This unsubscribe link wasn't recognized. If you keep getting emails, reply to one with "unsubscribe" and we'll remove you.`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe · ${name}</title></head><body style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:64px auto;padding:0 20px;color:#1f2937"><h1 style="font-size:22px">${ok ? "Unsubscribed" : "Link not recognized"}</h1><p style="font-size:16px;line-height:1.5">${message}</p></body></html>`;
}

function htmlToText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").trim();
}

/** Webhooks need the raw body for signature checks, so register these BEFORE express.json(). */
export function registerOutreachWebhooks(app: Express): void {
  app.post("/api/outreach/inbound", express.raw({ type: "*/*", limit: "10mb" }), async (req: Request, res: Response) => {
    const secret = inboundSecret();
    if (!secret) { res.status(503).json({ error: "Reply detection is not configured." }); return; }
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const headers = signatureHeaders(req);
    const verified = verifyInboundSignature({ secret, ...headers, body: raw });
    if (!verified.ok) { res.status(401).json({ error: "Invalid signature." }); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString("utf8")); } catch { res.status(400).json({ error: "Body is not valid JSON." }); return; }
    const payload = parseInboundPayload(parsed, headers.id);
    if (!payload) { res.status(400).json({ error: "The message is missing a sender." }); return; }
    const deps = await buildOutreachDeps();
    if (!deps) { res.status(503).json({ error: "Database not available." }); return; }
    try {
      const result = await handleInboundReply(deps, {
        from: payload.from,
        subject: payload.subject,
        text: payload.text ?? (payload.html ? htmlToText(payload.html) : ""),
      });
      res.json({ received: true, kind: result.kind, matched: result.matched });
    } catch (error) {
      console.error(`${OUTREACH_LOG} inbound reply failed`, error instanceof Error ? error.message : "unknown");
      res.status(500).json({ error: "Reply could not be processed." });
    }
  });

  app.post("/api/outreach/events", express.raw({ type: "*/*", limit: "2mb" }), async (req: Request, res: Response) => {
    const secret = eventsSecret();
    if (!secret) { res.status(503).json({ error: "Delivery events are not configured." }); return; }
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const verified = verifyInboundSignature({ secret, ...signatureHeaders(req), body: raw });
    if (!verified.ok) { res.status(401).json({ error: "Invalid signature." }); return; }
    let body: { type?: unknown; data?: { email_id?: unknown; to?: unknown } };
    try { body = JSON.parse(raw.toString("utf8")); } catch { res.status(400).json({ error: "Body is not valid JSON." }); return; }
    const type = typeof body.type === "string" ? body.type : "";
    const to = Array.isArray(body.data?.to) ? String(body.data?.to[0] ?? "") : typeof body.data?.to === "string" ? body.data.to : "";
    const providerMessageId = typeof body.data?.email_id === "string" ? body.data.email_id : null;
    const deps = await buildOutreachDeps();
    if (!deps) { res.status(503).json({ error: "Database not available." }); return; }
    try {
      await handleDeliveryEvent(deps, { type, providerMessageId, email: to || null });
      res.json({ received: true });
    } catch (error) {
      console.error(`${OUTREACH_LOG} delivery event failed`, error instanceof Error ? error.message : "unknown");
      res.status(500).json({ error: "Event could not be processed." });
    }
  });
}

/** Unsubscribe and click routes. Register after express.json()/urlencoded(). */
export function registerOutreachPublicRoutes(app: Express): void {
  const businessName = () => readOutreachEnv().businessName;

  app.get("/api/outreach/unsubscribe/:token", async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    let ok = false;
    try {
      const deps = await buildOutreachDeps();
      if (deps) ok = (await handleUnsubscribe(deps, String(req.params.token ?? ""), "link")).ok;
    } catch (error) {
      console.error(`${OUTREACH_LOG} unsubscribe failed`, error instanceof Error ? error.message : "unknown");
    }
    res.status(ok ? 200 : 404).type("html").send(unsubscribePage(businessName(), ok));
  });

  app.post("/api/outreach/unsubscribe/:token", async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    let ok = false;
    try {
      const deps = await buildOutreachDeps();
      if (deps) ok = (await handleUnsubscribe(deps, String(req.params.token ?? ""), "one_click")).ok;
    } catch (error) {
      console.error(`${OUTREACH_LOG} one-click unsubscribe failed`, error instanceof Error ? error.message : "unknown");
    }
    res.status(ok ? 200 : 404).type("html").send(unsubscribePage(businessName(), ok));
  });

  app.get("/api/outreach/c/:token/:messageId/:key", async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    const fallback = `${readOutreachEnv().publicBaseUrl}/design`;
    try {
      const deps = await buildOutreachDeps();
      if (!deps) { res.redirect(302, fallback); return; }
      const target = await handleClick(deps, String(req.params.token ?? ""), Number(req.params.messageId), String(req.params.key ?? ""));
      res.redirect(302, target);
    } catch (error) {
      console.error(`${OUTREACH_LOG} click tracking failed`, error instanceof Error ? error.message : "unknown");
      res.redirect(302, fallback);
    }
  });
}
