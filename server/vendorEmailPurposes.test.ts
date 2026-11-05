/**
 * Per-vendor contact addresses by purpose, inbound tagging, and manual forward.
 *
 * Safety: no SMTP server, provider, or database is contacted. Delivery is a
 * stub and storage is an in-memory table map.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VENDOR_EMAIL_PURPOSES,
  bareAddress,
  headerValue,
  matchInboundRecipient,
  normalizeEmailAddress,
  purposeFromAddressHint,
  recipientAddresses,
} from "../shared/vendorEmailPurpose";
import { signInboundPayload, verifyInboundSignature } from "./lib/inboundMailSignature";

const SECRET = `whsec_${Buffer.from("test-signing-key-for-vendor-mail").toString("base64")}`;

describe("vendor email purposes", () => {
  it("covers exactly the four purposes", () => {
    expect([...VENDOR_EMAIL_PURPOSES]).toEqual(["claims", "support", "sales", "sales_communication"]);
  });

  it("normalizes addresses and rejects unusable ones", () => {
    expect(normalizeEmailAddress("  Claims@UCD.test ")).toBe("claims@ucd.test");
    expect(normalizeEmailAddress("not-an-email")).toBeNull();
    expect(normalizeEmailAddress("")).toBeNull();
    expect(normalizeEmailAddress(null)).toBeNull();
  });

  it("reads a bare address out of a display-name header", () => {
    expect(bareAddress('"UCD Claims" <Claims@UCD.test>')).toBe("claims@ucd.test");
    expect(bareAddress("claims@ucd.test")).toBe("claims@ucd.test");
    expect(bareAddress(null)).toBeNull();
  });

  it("splits To/Cc headers into unique addresses", () => {
    expect(recipientAddresses("a@x.test, B <b@x.test>; a@x.test")).toEqual(["a@x.test", "b@x.test"]);
    expect(recipientAddresses(["a@x.test", ["c@x.test"]])).toEqual(["a@x.test", "c@x.test"]);
  });

  it("finds headers in both array and object shapes", () => {
    expect(headerValue([{ name: "from", value: "a@x.test" }], "from")).toBe("a@x.test");
    expect(headerValue({ From: "b@x.test" }, "from")).toBe("b@x.test");
    expect(headerValue({ from: ["c@x.test"] }, "from")).toBe("c@x.test");
    expect(headerValue(null, "from")).toBeNull();
  });
});

describe("inbound tagging", () => {
  const rows = [
    { distributorId: 4, purpose: "claims" as const, address: "claims@ucd.test" },
    { distributorId: 4, purpose: "support" as const, address: "support@ucd.test" },
    { distributorId: 9, purpose: "sales" as const, address: "sales@other.test" },
  ];

  it("tags the vendor and purpose from the receiving address", () => {
    expect(matchInboundRecipient(["claims@ucd.test"], rows)).toEqual({ distributorId: 4, purpose: "claims" });
    expect(matchInboundRecipient(["Support <SUPPORT@UCD.TEST>"], rows)).toEqual({ distributorId: 4, purpose: "support" });
  });

  it("is case-insensitive and checks every recipient", () => {
    expect(matchInboundRecipient(["nobody@x.test", "sales@other.test"], rows)).toEqual({ distributorId: 9, purpose: "sales" });
  });

  it("returns nothing for an address it does not know", () => {
    expect(matchInboundRecipient(["random@x.test"], rows)).toBeNull();
    expect(matchInboundRecipient([], rows)).toBeNull();
  });

  it("refuses to guess when one address maps to two vendors", () => {
    const shared = [
      ...rows,
      { distributorId: 11, purpose: "sales" as const, address: "sales@other.test" },
    ];
    expect(matchInboundRecipient(["sales@other.test"], shared)).toBeNull();
  });

  it("reads a purpose from an address local part when nothing is configured", () => {
    expect(purposeFromAddressHint("claims@ucd.test")).toBe("claims");
    expect(purposeFromAddressHint("customer.service@ucd.test")).toBe("support");
    expect(purposeFromAddressHint("salescomm@ucd.test")).toBe("sales_communication");
    expect(purposeFromAddressHint("sales@ucd.test")).toBe("sales");
    expect(purposeFromAddressHint("hello@ucd.test")).toBeNull();
  });
});

describe("inbound webhook signature", () => {
  const body = Buffer.from(JSON.stringify({ id: "msg_1", from: "a@ucd.test", to: ["claims@ucd.test"] }));
  const id = "msg_1";
  const now = 1_800_000_000_000;
  const timestamp = String(Math.floor(now / 1000));

  it("accepts a correctly signed request", () => {
    const signature = signInboundPayload({ secret: SECRET, id, timestamp, body });
    expect(verifyInboundSignature({ secret: SECRET, id, timestamp, signature, body, now })).toEqual({ ok: true });
  });

  it("accepts one good signature among several", () => {
    const good = signInboundPayload({ secret: SECRET, id, timestamp, body });
    expect(verifyInboundSignature({ secret: SECRET, id, timestamp, signature: `v1,bogus ${good}`, body, now }).ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = signInboundPayload({ secret: SECRET, id, timestamp, body });
    const tampered = Buffer.from(JSON.stringify({ id: "msg_1", from: "evil@x.test", to: ["claims@ucd.test"] }));
    expect(verifyInboundSignature({ secret: SECRET, id, timestamp, signature, body: tampered, now })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects the wrong secret, missing headers, and a stale timestamp", () => {
    const signature = signInboundPayload({ secret: SECRET, id, timestamp, body });
    const otherSecret = `whsec_${Buffer.from("a-different-key").toString("base64")}`;
    expect(verifyInboundSignature({ secret: otherSecret, id, timestamp, signature, body, now }).ok).toBe(false);
    expect(verifyInboundSignature({ secret: SECRET, id: "", timestamp, signature, body, now })).toEqual({ ok: false, reason: "missing_headers" });
    expect(verifyInboundSignature({ secret: SECRET, id, timestamp: String(now / 1000 - 7200), signature, body, now })).toEqual({
      ok: false,
      reason: "timestamp_out_of_tolerance",
    });
  });

  it("fails closed when no secret is configured", () => {
    const signature = signInboundPayload({ secret: SECRET, id, timestamp, body });
    expect(verifyInboundSignature({ secret: "", id, timestamp, signature, body, now })).toEqual({ ok: false, reason: "missing_secret" });
    expect(verifyInboundSignature({ secret: null, id, timestamp, signature, body, now })).toEqual({ ok: false, reason: "missing_secret" });
  });
});

describe("webhook safety wiring", () => {
  const http = readFileSync(resolve(process.cwd(), "server/vendorInboundHttp.ts"), "utf8");
  const index = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");
  const mailbox = readFileSync(resolve(process.cwd(), "server/lib/vendorEmailMailbox.ts"), "utf8");

  it("registers before express.json so the raw body survives", () => {
    const registration = index.indexOf("registerVendorInboundWebhook(app);");
    const jsonParser = index.indexOf("app.use(express.json(");
    expect(registration).toBeGreaterThan(-1);
    expect(jsonParser).toBeGreaterThan(-1);
    expect(registration).toBeLessThan(jsonParser);
    expect(http).toContain('express.raw({ type: "*/*"');
  });

  it("verifies the signature before touching the database", () => {
    expect(http.indexOf("verifyInboundSignature(")).toBeLessThan(http.indexOf("ingestInboundVendorEmail("));
    expect(http).toContain("VENDOR_INBOUND_WEBHOOK_SECRET");
    expect(http).toContain('res.status(401)');
  });

  it("never forwards from the ingest path", () => {
    const ingestStart = mailbox.indexOf("export async function ingestInboundVendorEmail");
    const ingestEnd = mailbox.indexOf("export type VendorInboxListItem");
    const ingest = mailbox.slice(ingestStart, ingestEnd);
    expect(ingest).not.toContain("forwardVendorInboundEmail");
    expect(ingest).not.toContain("sendEmail");
    expect(ingest).toContain('status: "received"');
  });

  it("only forwards from the admin-actor function", () => {
    const forwardStart = mailbox.indexOf("export async function forwardVendorInboundEmail");
    const forwardEnd = mailbox.indexOf("/** Messages with no vendor or purpose yet");
    const forward = mailbox.slice(forwardStart, forwardEnd);
    expect(forward.length).toBeGreaterThan(200);
    expect(forward).toContain("input.actor.id");
    expect(forward).toContain("sentByUserId");
    // A forward must be recorded whether it succeeds or fails.
    expect(forward).toContain("vendorEmailForwards");
    expect(forward).toContain("status,");
  });
});

describe("vendor mail storage and routing", () => {
  const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
  void getDbMock;
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("rejects two purposes sharing one address", async () => {
    const { saveVendorEmailAddresses } = await import("./lib/vendorEmailMailbox");
    const db = {
      select: () => ({ from: () => ({ where: async () => [] }) }),
      insert: () => ({ values: () => ({ onDuplicateKeyUpdate: async () => undefined }) }),
      delete: () => ({ where: async () => undefined }),
    };
    const result = await saveVendorEmailAddresses(db as never, 4, {
      claims: "shared@ucd.test",
      support: "SHARED@ucd.test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("cannot share the same address");
  });

  it("rejects an unusable address instead of storing it", async () => {
    const { saveVendorEmailAddresses } = await import("./lib/vendorEmailMailbox");
    const db = {
      select: () => ({ from: () => ({ where: async () => [] }) }),
      insert: () => ({ values: () => ({ onDuplicateKeyUpdate: async () => undefined }) }),
      delete: () => ({ where: async () => undefined }),
    };
    const result = await saveVendorEmailAddresses(db as never, 4, { claims: "nope" });
    expect(result.ok).toBe(false);
  });

  it("stores an unmatched message as unassigned rather than dropping it", async () => {
    const { ingestInboundVendorEmail } = await import("./lib/vendorEmailMailbox");
    const inserted: Array<Record<string, unknown>> = [];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [] }),
          then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
        }),
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          inserted.push(values);
          return Promise.resolve([{ insertId: 12 }]);
        },
      }),
    };
    const result = await ingestInboundVendorEmail(db as never, {
      id: "msg_9",
      from: "someone@unknown.test",
      to: ["nobody@unknown.test"],
      cc: [],
      subject: "Hello",
      receivedAt: new Date("2026-11-05T00:00:00.000Z"),
    });
    expect(result).toMatchObject({ ok: true, id: 12, duplicate: false, distributorId: null, purpose: null });
    expect(inserted[0]).toMatchObject({ providerMessageId: "msg_9", status: "received", distributorId: null });
  });

  it("treats a repeated provider message id as a duplicate, not a second row", async () => {
    const { ingestInboundVendorEmail } = await import("./lib/vendorEmailMailbox");
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ id: 5 }] }),
        }),
      }),
    };
    const result = await ingestInboundVendorEmail(db as never, {
      id: "msg_5",
      from: "a@ucd.test",
      to: ["claims@ucd.test"],
      cc: [],
      subject: "Again",
      receivedAt: new Date(),
    });
    expect(result).toMatchObject({ ok: true, id: 5, duplicate: true });
  });
});

describe("vendor mail migration files", () => {
  it("ships the four tables as SQL Tom runs himself", () => {
    const tidb = readFileSync(resolve(process.cwd(), "docs/sql/0248_vendor_email_purposes.tidb.sql"), "utf8");
    for (const table of ["vendor_email_addresses", "vendor_email_routes", "vendor_inbound_emails", "vendor_email_forwards"]) {
      expect(tidb).toContain(`CREATE TABLE IF NOT EXISTS cabinet_dealz.${table}`);
    }
    expect(tidb).not.toContain("--> statement-breakpoint");
    // Adds tables only: it never alters existing data. Checked against real
    // statements (line starts), not the comment explaining what it skips.
    expect(tidb).not.toMatch(/^\s*(ALTER TABLE|UPDATE |DELETE FROM|DROP )/m);
    expect(tidb).toContain("CREATE TABLE IF NOT EXISTS cabinet_dealz.vendor_email_addresses");
    const journal = readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8");
    expect(journal).toContain("0234_vendor_email_purposes");
  });

  it("declares the tables once in the schema", () => {
    const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
    expect(schema.match(/mysqlTable\("vendor_email_addresses"/g)).toHaveLength(1);
    expect(schema.match(/mysqlTable\("vendor_inbound_emails"/g)).toHaveLength(1);
    // The unique provider id is what makes a retried webhook idempotent.
    expect(schema).toContain('uniqueIndex("vendor_inbound_emails_provider_msg_uq")');
  });
});
