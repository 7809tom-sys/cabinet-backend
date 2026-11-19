/**
 * Public invoice lookup (Tom, Nov 19 2026, PR 2 of 4).
 *
 *   POST /api/invoices/lookup   { invoiceNumber, emailOrZip } -> invoice view
 *
 * No login: the customer either clicks the link in their order email or types the
 * invoice number plus the email/ZIP that is on the order. Both are verified in
 * invoiceLookup.ts, which also owns the two rate-limit counters and the uniform
 * not-found answer, so this file stays a thin HTTP shell.
 *
 * Claim photos come back as short-lived signed URLs. Nothing here is public storage.
 */
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { invoiceLookupAllowed, lookupInvoice } from "./lib/invoiceLookup";

const TOO_MANY =
  "Too many invoice lookups from this device or for this invoice. Wait a few minutes and try again.";

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof first === "string" && first.trim()) return first.split(",")[0].trim();
  return req.ip ?? null;
}

export function registerInvoiceLookup(app: Express): void {
  app.post("/api/invoices/lookup", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { invoiceNumber?: unknown; emailOrZip?: unknown };
    const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
    const emailOrZip = typeof body.emailOrZip === "string" ? body.emailOrZip.trim() : "";
    if (!invoiceNumber || !emailOrZip) {
      res.status(400).json({ ok: false, message: "Enter the invoice number and the email or ZIP on the order." });
      return;
    }

    if (!invoiceLookupAllowed({ ip: clientIp(req), invoiceNumber })) {
      res.status(429).json({ ok: false, message: TOO_MANY });
      return;
    }

    try {
      const result = await lookupInvoice(getDb() as never, { invoiceNumber, emailOrZip });
      res.status(result.ok ? 200 : 404).json(result);
    } catch (error) {
      console.error("[invoiceLookup] failed", error);
      res.status(500).json({ ok: false, message: "The invoice could not be loaded. Try again in a moment." });
    }
  });
}