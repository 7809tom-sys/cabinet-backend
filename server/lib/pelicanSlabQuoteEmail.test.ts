import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The real mailer is never reached: both the provider module and the owner
// notification are mocked, and the tests also inject their own send/notify.
const sendEmailMock = vi.fn(async () => ({ success: true, messageId: "mock" }));
const notifyOwnerMock = vi.fn(async () => true);
vi.mock("../email", () => ({ sendEmail: (...args: unknown[]) => sendEmailMock(...(args as [])) }));
vi.mock("../_core/notification", () => ({ notifyOwner: (...args: unknown[]) => notifyOwnerMock(...(args as [])) }));

import {
  PELICAN_QUOTE_EMAIL_ENV,
  buildPelicanSlabQuote,
  buildPelicanSlabQuoteEmail,
  isPelicanSlabLine,
  pelicanQuoteRecipients,
  queuePelicanSlabQuoteEmails,
  sendPelicanSlabQuoteEmails,
  type PelicanSlabQuoteRequest,
} from "./pelicanSlabQuoteEmail";
import { FLORIDA_COUNTERTOP_CENTS_PER_SLAB } from "../../shared/shippingRules";

const SLAB = {
  masterCode: "PL-CAL-3CM-SJ",
  description: "Calacatta Gold 3cm Super Jumbo",
  qty: 2,
  unitPrice: 899,
  linePrice: 1798,
  productKind: "surface",
  category: "Quartz Slabs (Countertops)",
  pelicanProductId: 41,
};

function request(overrides: Partial<PelicanSlabQuoteRequest> = {}): PelicanSlabQuoteRequest {
  return {
    orderRequestId: 1234,
    requestNumber: "CD-20261123-ABCDE",
    submittedAt: new Date("2026-11-23T23:30:00Z"),
    deliveryMethod: "ship",
    deliveryLocationType: "residential",
    liftgateRequired: true,
    customer: { name: "Jane Buyer", email: "jane@example.com", phone: "555-0100" },
    address: { line1: "100 Main St", line2: "Unit 4", city: "Tampa", state: "FL", zip: "33602" },
    notes: "Gate code 1234.",
    lines: [
      SLAB,
      { masterCode: "PL-WHT-3CM", description: "Pure White 3cm", qty: 1, unitPrice: 650, linePrice: 650, productKind: "surface", category: "Quartz Slabs (Countertops)" },
      { masterCode: "B24", description: "Base cabinet 24", qty: 3, unitPrice: 200, linePrice: 600, productKind: null, category: null },
      { masterCode: "SINK-1", description: "Stainless sink", qty: 1, unitPrice: 300, linePrice: 300, productKind: "surface", category: "Kitchen Sinks" },
    ],
    ...overrides,
  };
}

const env = { [PELICAN_QUOTE_EMAIL_ENV]: "slabs@supplier.example" } as NodeJS.ProcessEnv;

beforeEach(() => {
  sendEmailMock.mockClear();
  notifyOwnerMock.mockClear();
});

describe("Florida slab quote rules", () => {
  it("uses the shared $50/slab Florida constant", () => {
    expect(FLORIDA_COUNTERTOP_CENTS_PER_SLAB).toBe(5000);
  });

  it("counts only supplier quartz slab lines", () => {
    expect(isPelicanSlabLine(SLAB)).toBe(true);
    expect(isPelicanSlabLine({ ...SLAB, productKind: null })).toBe(false);
    expect(isPelicanSlabLine({ ...SLAB, category: "Kitchen Sinks", description: "Sink" })).toBe(false);
  });

  it("quotes slabs, $50 per slab delivery and totals for a Florida address", () => {
    const quote = buildPelicanSlabQuote(request());
    expect(quote).not.toBeNull();
    expect(quote!.slabCount).toBe(3);
    expect(quote!.lines.map((l) => l.sku)).toEqual(["PL-CAL-3CM-SJ", "PL-WHT-3CM"]);
    expect(quote!.deliveryCents).toBe(15000);
    expect(quote!.slabSubtotalCents).toBe(244800);
    expect(quote!.totalCents).toBe(259800);
  });

  it("detects Florida by ZIP when the state is missing", () => {
    expect(buildPelicanSlabQuote(request({ address: { line1: "1 A St", city: "Miami", state: "", zip: "33101" } }))).not.toBeNull();
  });

  it("does not apply outside Florida, to pickup, or without slabs", () => {
    expect(buildPelicanSlabQuote(request({ address: { line1: "1 A St", city: "Atlanta", state: "GA", zip: "30301" } }))).toBeNull();
    expect(buildPelicanSlabQuote(request({ deliveryMethod: "pickup" }))).toBeNull();
    expect(buildPelicanSlabQuote(request({ lines: [request().lines[2]] }))).toBeNull();
  });

  it("marks totals pending when a slab has no price", () => {
    const quote = buildPelicanSlabQuote(request({ lines: [{ ...SLAB, unitPrice: null, linePrice: null }] }));
    expect(quote!.slabSubtotalCents).toBeNull();
    expect(quote!.totalCents).toBeNull();
    expect(quote!.deliveryCents).toBe(10000);
  });

  it("reads recipients only from PELICAN_QUOTE_EMAIL", () => {
    expect(pelicanQuoteRecipients({} as NodeJS.ProcessEnv)).toEqual([]);
    expect(pelicanQuoteRecipients({ [PELICAN_QUOTE_EMAIL_ENV]: " a@x.com, not-an-email ; b@y.com" } as NodeJS.ProcessEnv)).toEqual(["a@x.com", "b@y.com"]);
  });
});

describe("supplier email template", () => {
  it("carries the customer details and the quote", () => {
    const req = request();
    const email = buildPelicanSlabQuoteEmail(req, buildPelicanSlabQuote(req)!);
    expect(email.subject).toBe("Florida Pelican slab quote request CD-20261123-ABCDE — 3 slabs");
    for (const expected of [
      "Reference: CD-20261123-ABCDE",
      "Date: November 23, 2026",
      "Name: Jane Buyer",
      "Email: jane@example.com",
      "Phone: 555-0100",
      "  100 Main St",
      "  Tampa, FL 33602",
      "Location: Florida (FL)",
      "1. 2 × Calacatta Gold 3cm Super Jumbo (SKU PL-CAL-3CM-SJ) — $899.00 each — $1,798.00",
      "Slab count: 3",
      "Slab subtotal: $2,448.00",
      "Florida slab delivery: 3 slabs × $50.00 = $150.00",
      "Slab total (slabs + Florida delivery): $2,598.00",
      "Gate code 1234.",
    ]) {
      expect(email.text).toContain(expected);
    }
  });

  it("escapes customer text in the HTML part", () => {
    const req = request({ notes: "<script>x</script>" });
    const email = buildPelicanSlabQuoteEmail(req, buildPelicanSlabQuote(req)!);
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("sending", () => {
  it("sends to PELICAN_QUOTE_EMAIL and copies the owner", async () => {
    const send = vi.fn(async () => ({ success: true }));
    const notify = vi.fn(async () => true);
    const result = await sendPelicanSlabQuoteEmails(request(), { send, notify, env });
    expect(result).toEqual({ status: "sent", slabCount: 3, ownerCopied: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: "slabs@supplier.example" });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].title).toContain("sent to Pelican");
  });

  it("sends nothing outside Florida", async () => {
    const send = vi.fn(async () => ({ success: true }));
    const notify = vi.fn(async () => true);
    const result = await sendPelicanSlabQuoteEmails(
      request({ address: { line1: "1 A St", city: "Austin", state: "TX", zip: "78701" } }),
      { send, notify, env },
    );
    expect(result).toEqual({ status: "skipped", reason: "not_applicable" });
    expect(send).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("sends nothing when PELICAN_QUOTE_EMAIL is unset", async () => {
    const send = vi.fn(async () => ({ success: true }));
    const notify = vi.fn(async () => true);
    const result = await sendPelicanSlabQuoteEmails(request(), { send, notify, env: {} as NodeJS.ProcessEnv });
    expect(result).toEqual({ status: "not_configured", slabCount: 3 });
    expect(send).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("never throws when the mailer fails, and tells the owner", async () => {
    const send = vi.fn(async () => { throw new Error("SMTP down"); });
    const notify = vi.fn(async () => true);
    const result = await sendPelicanSlabQuoteEmails(request(), { send, notify, env });
    expect(result).toMatchObject({ status: "failed", error: "SMTP down", ownerCopied: true });
    expect(notify.mock.calls[0][0].title).toContain("NOT sent");
  });

  it("never throws when the owner copy fails", async () => {
    const send = vi.fn(async () => ({ success: true }));
    const notify = vi.fn(async () => { throw new Error("boom"); });
    await expect(sendPelicanSlabQuoteEmails(request(), { send, notify, env })).resolves.toMatchObject({ status: "sent", ownerCopied: false });
  });

  it("queue wrapper uses the mocked mailer and does not block", async () => {
    const previous = process.env[PELICAN_QUOTE_EMAIL_ENV];
    process.env[PELICAN_QUOTE_EMAIL_ENV] = "slabs@supplier.example";
    try {
      sendEmailMock.mockImplementationOnce(async () => { throw new Error("down"); });
      expect(() => queuePelicanSlabQuoteEmails(request())).not.toThrow();
      await vi.waitFor(() => expect(notifyOwnerMock).toHaveBeenCalledTimes(1));
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env[PELICAN_QUOTE_EMAIL_ENV];
      else process.env[PELICAN_QUOTE_EMAIL_ENV] = previous;
    }
  });
});

describe("order request wiring", () => {
  it("submitted order requests queue the Florida slab quote email without awaiting it", () => {
    const source = readFileSync(resolve(__dirname, "../routers/orders.ts"), "utf8");
    expect(source).toContain('import { queuePelicanSlabQuoteEmails } from "../lib/pelicanSlabQuoteEmail";');
    expect(source).toMatch(/if \(input\.submit\) \{[\s\S]*?onOrderPlaced\(insertId\)[\s\S]*?queuePelicanSlabQuoteEmails\(\{/);
    expect(source).not.toContain("await queuePelicanSlabQuoteEmails");
  });
});
