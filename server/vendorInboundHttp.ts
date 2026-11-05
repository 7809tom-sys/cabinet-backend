// Inbound vendor mail webhook.
//
// The provider (Resend inbound, Svix-signed) POSTs the message here. The raw
// body is required for signature verification, so this route is registered
// BEFORE express.json(), the same way the Stripe webhook is.
//
// Trust boundary:
//   - no valid signature => 401, nothing is stored
//   - no signing secret configured => fail closed with 503
//   - body is parsed defensively; a message that matches no vendor address is
//     still stored as unassigned rather than dropped
//
// This route never forwards anything. Delivery only happens when an admin
// clicks Forward in the app.

import type { Express, Request, Response } from "express";
import express from "express";
import { getDb } from "./db";
import { verifyInboundSignature } from "./lib/inboundMailSignature";
import {
  VENDOR_MAIL_LOG,
  ingestInboundVendorEmail,
  parseInboundPayload,
} from "./lib/vendorEmailMailbox";

/** The signing secret. Never logged, never returned to a caller. */
export function vendorInboundSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.VENDOR_INBOUND_WEBHOOK_SECRET ?? "").trim();
}

function header(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

export function registerVendorInboundWebhook(app: Express): void {
  app.post(
    "/api/vendor-inbound/webhook",
    express.raw({ type: "*/*", limit: "25mb" }),
    async (req: Request, res: Response) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "");
      const signatureHeaders = {
        id: header(req, "svix-id") ?? header(req, "webhook-id"),
        timestamp: header(req, "svix-timestamp") ?? header(req, "webhook-timestamp"),
        signature: header(req, "svix-signature") ?? header(req, "webhook-signature"),
      };
      const secret = vendorInboundSecret();
      if (!secret) {
        // Fail closed. An endpoint with no secret must accept nothing.
        console.error(`${VENDOR_MAIL_LOG} VENDOR_INBOUND_WEBHOOK_SECRET is not set, so inbound mail is refused.`);
        res.status(503).json({ error: "Inbound mail is not configured." });
        return;
      }
      const verified = verifyInboundSignature({ secret, ...signatureHeaders, body: raw });
      if (!verified.ok) {
        console.error(`${VENDOR_MAIL_LOG} Refused inbound mail: ${verified.reason}.`);
        res.status(401).json({ error: "Invalid signature." });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString("utf8"));
      } catch {
        res.status(400).json({ error: "Body is not valid JSON." });
        return;
      }
      const payload = parseInboundPayload(parsed, signatureHeaders.id);
      if (!payload) {
        res.status(400).json({ error: "The message is missing an id or a sender." });
        return;
      }
      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Database not available." });
        return;
      }
      const result = await ingestInboundVendorEmail(db, payload);
      if (!result.ok) {
        console.error(`${VENDOR_MAIL_LOG} Inbound ${payload.id} was not stored: ${result.message}`);
        res.status(result.schemaMissing ? 503 : 500).json({ error: "The message could not be stored." });
        return;
      }
      // 200 for a duplicate too: the provider must stop retrying a message that
      // is already stored.
      res.json({
        received: true,
        duplicate: result.duplicate,
        vendorAssigned: result.distributorId != null,
        purpose: result.purpose,
      });
    },
  );
}
