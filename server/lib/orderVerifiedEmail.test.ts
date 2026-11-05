/**
 * The "your order has been verified" customer email.
 *
 * Safety: no SMTP server, provider, or database is contacted. Delivery is a
 * stub, and the wiring tests only read the source files they assert on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HOUSE_CUSTOMER_BRAND,
  claimOrderVerifiedEmail,
  composeOrderVerifiedEmail,
  deliverOrderVerifiedEmail,
  releaseOrderVerifiedEmail,
  verifiedEmailBrand,
  verifiedOrderNumber,
  type VerifiedEmailOrder,
} from "./orderVerifiedEmail";

const order: VerifiedEmailOrder = {
  id: 42,
  requestNumber: "CD-1042",
  originatorName: "Ada Lovelace",
  originatorEmail: "ada@example.com",
  affiliateId: 7,
};

function textLines(text: string): string[] {
  return text.split("\n\n");
}

describe("verified email copy", () => {
  it("uses the approved wording in order, with the store name and phone", () => {
    const message = composeOrderVerifiedEmail({
      order,
      storeName: "Harbor Kitchen Studio",
      storePhone: "(941) 555-0142",
    });
    expect(message).not.toBeNull();
    expect(message!.to).toBe("ada@example.com");
    expect(message!.subject).toBe("Your order #CD-1042 has been verified");
    expect(textLines(message!.text)).toEqual([
      "Hi Ada Lovelace,",
      "Your order #CD-1042 has been verified by Harbor Kitchen Studio. Look for further information soon with your shipping details.",
      "Any questions, feel free to contact Harbor Kitchen Studio at (941) 555-0142.",
      "Thank you for your order.\nHarbor Kitchen Studio",
    ]);
  });

  it("greets without a name when none is on file", () => {
    const message = composeOrderVerifiedEmail({
      order: { ...order, originatorName: null },
      storeName: "Harbor Kitchen Studio",
      storePhone: "555-0142",
    });
    expect(textLines(message!.text)[0]).toBe("Hi,");
    expect(message!.html).toContain("<p>Hi,</p>");
  });

  it("leaves the phone out entirely instead of inventing one", () => {
    const message = composeOrderVerifiedEmail({
      order,
      storeName: "Harbor Kitchen Studio",
      storePhone: "   ",
    });
    expect(message!.text).toContain("Any questions, feel free to contact Harbor Kitchen Studio.");
    expect(message!.text).not.toContain(" at ");
    expect(message!.text).not.toMatch(/contact Harbor Kitchen Studio at/);
  });

  it("signs as CabinetDealz when the order came through no affiliate", () => {
    const message = composeOrderVerifiedEmail({ order: { ...order, affiliateId: null } });
    expect(message!.text).toContain("has been verified by CabinetDealz.");
    expect(message!.text).toContain("contact CabinetDealz.");
    expect(message!.text.endsWith("Thank you for your order.\nCabinetDealz")).toBe(true);
    expect(verifiedEmailBrand(null)).toBe(HOUSE_CUSTOMER_BRAND);
    expect(verifiedEmailBrand("  ")).toBe(HOUSE_CUSTOMER_BRAND);
  });

  it("falls back to the row id when the order has no request number", () => {
    expect(verifiedOrderNumber({ id: 42, requestNumber: "" })).toBe("42");
    expect(verifiedOrderNumber({ id: 42, requestNumber: " CD-1 " })).toBe("CD-1");
    expect(verifiedOrderNumber({ id: 42, requestNumber: "#CD-1" })).toBe("CD-1");
  });

  it("escapes the customer name and store name in the HTML body", () => {
    const message = composeOrderVerifiedEmail({
      order: { ...order, originatorName: "Ada & <b>Co</b>" },
      storeName: "Rich's <Supply>",
      storePhone: "555-0100",
    });
    expect(message!.html).toContain("Hi Ada &amp; &lt;b&gt;Co&lt;/b&gt;,");
    expect(message!.html).toContain("Rich's &lt;Supply&gt;");
    expect(message!.html).not.toContain("<Supply>");
  });

  it("does not compose a message without a usable customer address", () => {
    expect(composeOrderVerifiedEmail({ order: { ...order, originatorEmail: "" } })).toBeNull();
    expect(composeOrderVerifiedEmail({ order: { ...order, originatorEmail: "not-an-email" } })).toBeNull();
  });
});

describe("verified email delivery", () => {
  let send: ReturnType<typeof vi.fn>;
  let release: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    send = vi.fn(async () => ({ success: true }));
    release = vi.fn(async () => undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sends once and skips the second click on an already-claimed order", async () => {
    const first = await deliverOrderVerifiedEmail({
      order,
      storeName: "Harbor Kitchen Studio",
      storePhone: "555-0100",
      claim: async () => "claimed",
      release,
      send,
    });
    const second = await deliverOrderVerifiedEmail({
      order,
      storeName: "Harbor Kitchen Studio",
      storePhone: "555-0100",
      claim: async () => "already_sent",
      release,
      send,
    });
    expect(first).toMatchObject({ sent: true, skipped: false, to: "ada@example.com" });
    expect(second).toMatchObject({ sent: false, skipped: true, skipReason: "already_sent" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      to: "ada@example.com",
      subject: "Your order #CD-1042 has been verified",
    });
    expect(release).not.toHaveBeenCalled();
  });

  it("releases the claim when the provider rejects the message so a retry can happen", async () => {
    const result = await deliverOrderVerifiedEmail({
      order,
      storeName: "Harbor Kitchen Studio",
      claim: async () => "claimed",
      release,
      send: async () => ({ success: false, error: "SMTP connection refused" }),
    });
    expect(result.sent).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.error).toContain("SMTP connection refused");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("reports not-configured as a failure rather than a silent skip", async () => {
    const result = await deliverOrderVerifiedEmail({
      order,
      claim: async () => "claimed",
      release,
      send: async () => ({ success: false, notConfigured: true }),
    });
    expect(result.sent).toBe(false);
    expect(result.error).toContain("not configured");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("treats a thrown send as a failure and still releases the claim", async () => {
    const result = await deliverOrderVerifiedEmail({
      order,
      claim: async () => "claimed",
      release,
      send: async () => { throw new Error("socket hang up"); },
    });
    expect(result.sent).toBe(false);
    expect(result.error).toContain("socket hang up");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("skips, but still marks the order handled, when there is no customer email", async () => {
    const claim = vi.fn(async () => "claimed" as const);
    const result = await deliverOrderVerifiedEmail({
      order: { ...order, originatorEmail: null },
      claim,
      release,
      send,
    });
    expect(result).toMatchObject({ sent: false, skipped: true, skipReason: "no_customer_email" });
    expect(send).not.toHaveBeenCalled();
    // The second click must not warn about the same order again.
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it("does not send when the marker column is missing and says which SQL to run", async () => {
    const result = await deliverOrderVerifiedEmail({
      order,
      claim: async () => "schema_missing",
      release,
      send,
    });
    expect(result).toMatchObject({ sent: false, skipped: true, skipReason: "schema_missing" });
    expect(result.error).toContain("orderVerifiedEmailSentAt");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("verified email claim marker", () => {
  it("claims only a row whose marker is still null", async () => {
    const execute = vi.fn(async () => ({ affectedRows: 1 }));
    await expect(claimOrderVerifiedEmail({ execute }, 42)).resolves.toBe("claimed");
    const sqlText = sourceOf(execute.mock.calls[0][0]);
    expect(sqlText).toContain("orderVerifiedEmailSentAt = CURRENT_TIMESTAMP");
    expect(sqlText).toContain("orderVerifiedEmailSentAt IS NULL");
  });

  it("reports already claimed when the conditional update touches no row", async () => {
    const execute = vi.fn(async () => ({ affectedRows: 0 }));
    await expect(claimOrderVerifiedEmail({ execute }, 42)).resolves.toBe("already_sent");
  });

  it("reports a missing column as schema_missing instead of throwing", async () => {
    const execute = vi.fn(async () => {
      throw new Error("Unknown column 'orderVerifiedEmailSentAt' in 'field list'");
    });
    await expect(claimOrderVerifiedEmail({ execute }, 42)).resolves.toBe("schema_missing");
  });

  it("rethrows a real database failure", async () => {
    const execute = vi.fn(async () => { throw new Error("connection reset"); });
    await expect(claimOrderVerifiedEmail({ execute }, 42)).rejects.toThrow("connection reset");
  });

  it("clears the marker when releasing", async () => {
    const execute = vi.fn(async () => ({ affectedRows: 1 }));
    await releaseOrderVerifiedEmail({ execute }, 42);
    expect(sourceOf(execute.mock.calls[0][0])).toContain("orderVerifiedEmailSentAt = NULL");
  });
});

/** Reads the string chunks out of a drizzle sql`` template. */
function sourceOf(query: unknown): string {
  const chunks = (query as { queryChunks?: Array<{ value?: unknown }> }).queryChunks ?? [];
  return chunks
    .map((chunk) => (Array.isArray(chunk?.value) ? chunk.value.join("") : ""))
    .join("");
}

describe("verified email wiring", () => {
  it("fires from the order-verified side effect after the trail is written", () => {
    const sideEffects = readFileSync(resolve(process.cwd(), "server/lib/orderSideEffects.ts"), "utf8");
    const start = sideEffects.indexOf("export async function markOrderVerified");
    const end = sideEffects.indexOf("export async function markOrderShipped");
    const body = sideEffects.slice(start, end);
    expect(body).toContain("await notifyCustomerOrderVerified(orderId)");
    // The email runs only once the trail write succeeded.
    expect(body.indexOf("if (result.ok)")).toBeLessThan(body.indexOf("await notifyCustomerOrderVerified(orderId)"));
  });

  it("keeps the verification intact when the email step throws", () => {
    const sideEffects = readFileSync(resolve(process.cwd(), "server/lib/orderSideEffects.ts"), "utf8");
    const start = sideEffects.indexOf("export async function notifyCustomerOrderVerified");
    const body = sideEffects.slice(start, start + 900);
    expect(body).toContain("try {");
    expect(body).toContain("catch (error)");
    expect(body).toContain("without blocking the verification");
  });

  it("routes through the affiliate mailbox before the platform sender", () => {
    const source = readFileSync(resolve(process.cwd(), "server/lib/orderVerifiedEmail.ts"), "utf8");
    expect(source).toContain("loadCrmOutboundPlan(db, order.affiliateId)");
    expect(source).toContain("deliverCrmMessage(");
    // A CRM log failure must not release the marker and cause a second send.
    expect(source).toContain("was sent, but the CRM record failed");
  });

  it("ships the marker column as a migration file only", () => {
    const sql = readFileSync(resolve(process.cwd(), "drizzle/0232_order_verified_email.sql"), "utf8");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS `orderVerifiedEmailSentAt`");
    const tidb = readFileSync(resolve(process.cwd(), "docs/sql/0246_order_verified_email.tidb.sql"), "utf8");
    expect(tidb).toContain("cabinet_dealz.order_requests");
    expect(tidb).toContain("orderVerifiedEmailSentAt TIMESTAMP NULL");
    expect(tidb).not.toContain("--> statement-breakpoint");
    const journal = readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8");
    expect(journal).toContain("0232_order_verified_email");
  });
});
