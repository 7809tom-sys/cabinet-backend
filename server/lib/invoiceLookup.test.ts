/**
 * Invoice lookup guardrails (Tom, Nov 19 2026).
 *
 * The endpoint must not become an invoice-number oracle: a wrong number, a wrong
 * contact and a non-existent order all answer the same thing, and enumeration gets
 * expensive after a handful of attempts.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  INVOICE_LOOKUP_MAX_PER_INVOICE,
  INVOICE_LOOKUP_NOT_FOUND,
  invoiceLookupAllowed,
  lookupInvoice,
  normalizeEmail,
  normalizeZip,
  resetInvoiceLookupRateLimits,
} from "./invoiceLookup";

afterEach(() => resetInvoiceLookupRateLimits());

describe("invoice lookup verification", () => {
  it("takes a 5-digit ZIP with or without a suffix", () => {
    expect(normalizeZip("33013")).toBe("33013");
    expect(normalizeZip("33013-1234")).toBe("33013");
    expect(normalizeZip("3301")).toBeNull();
  });

  it("lower-cases an email and rejects a malformed one", () => {
    expect(normalizeEmail("  Tom@Example.COM ")).toBe("tom@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
  });

  it("answers the same thing for a bad contact as for a missing invoice", async () => {
    const db = { execute: async () => { throw new Error("the database must not be queried"); } };
    const result = await lookupInvoice(db as never, { invoiceNumber: "INV-1", emailOrZip: "nope" });
    expect(result).toEqual({ ok: false, message: INVOICE_LOOKUP_NOT_FOUND });
  });

  it("does not query the database without an invoice number", async () => {
    const db = { execute: async () => { throw new Error("the database must not be queried"); } };
    expect(await lookupInvoice(db as never, { invoiceNumber: "  ", emailOrZip: "33013" }))
      .toEqual({ ok: false, message: INVOICE_LOOKUP_NOT_FOUND });
  });
});

describe("invoice lookup rate limit", () => {
  it("allows a handful of attempts and then refuses that invoice", () => {
    for (let attempt = 0; attempt < INVOICE_LOOKUP_MAX_PER_INVOICE; attempt += 1) {
      expect(invoiceLookupAllowed({ ip: "10.0.0.1", invoiceNumber: "INV-1" })).toBe(true);
    }
    expect(invoiceLookupAllowed({ ip: "10.0.0.1", invoiceNumber: "INV-1" })).toBe(false);
  });

  it("keeps another invoice usable from the same address", () => {
    for (let attempt = 0; attempt < INVOICE_LOOKUP_MAX_PER_INVOICE; attempt += 1) {
      invoiceLookupAllowed({ ip: "10.0.0.2", invoiceNumber: "INV-1" });
    }
    expect(invoiceLookupAllowed({ ip: "10.0.0.2", invoiceNumber: "INV-2" })).toBe(true);
  });

  it("does not burn the address allowance when the invoice bucket is already full", () => {
    for (let attempt = 0; attempt < INVOICE_LOOKUP_MAX_PER_INVOICE; attempt += 1) {
      invoiceLookupAllowed({ ip: "10.0.0.3", invoiceNumber: "INV-1" });
    }
    // A blocked invoice attempt must not count against this address.
    expect(invoiceLookupAllowed({ ip: "10.0.0.3", invoiceNumber: "INV-1" })).toBe(false);
    expect(invoiceLookupAllowed({ ip: "10.0.0.3", invoiceNumber: "INV-2" })).toBe(true);
  });
});