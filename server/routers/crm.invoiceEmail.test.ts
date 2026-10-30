/**
 * Integration test for crm.sendInvoiceEmail and crm.emailReadiness.
 *
 * Safety: getDb is mocked, DATABASE_URL is forced empty, Resend is a stubbed
 * fetch to https://api.resend.com/emails, Stripe is a fake client, and
 * nodemailer throws if anything tries SMTP. No production database, Railway
 * environment, or customer mailbox is contacted.
 *
 * Recipient precedence used by sendInvoiceEmail:
 * 1. Typed `to`, when it is a usable email. It wins over every stored address
 *    and does not replace a usable lead email.
 * 2. Otherwise loadDealInvoiceRecipient:
 *    a. crm_deals.contactEmail
 *    b. order_requests.originatorEmail on the linked order
 *    c. stripe_payment_records.customerEmail, then receiptEmail
 *    d. users.email for order_requests.userId
 *    e. Live Stripe (receipt_email, billing_details.email, checkout
 *       customer_details.email / customer_email, customer.email). A failed
 *       lookup is logged and does not throw.
 * 3. Otherwise PRECONDITION_FAILED / missing_recipient.
 *
 * The address is copied onto a blank lead only after Resend accepts the
 * message. emailReadiness is transport-only: it does not know the recipient.
 * It is ready only when RESEND_API_KEY and ORDER_EMAIL_FROM are both set.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  affiliateEmailSettings,
  affiliateInstallationEstimates,
  affiliates,
  crmActivities,
  crmDealDesigns,
  crmDeals,
  crmEmailLog,
  emailSettings,
  orderRequests,
  stripePaymentRecords,
  users,
} from "../../drizzle/schema";

const TEST_RESEND_KEY = "re_test_invoice_flow_not_live";
const TEST_FROM = "invoices-test@example.com";

const { getDbMock, sendMail, stripeApi } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  sendMail: vi.fn(async () => {
    throw new Error("SMTP must not be used in the invoice email test");
  }),
  stripeApi: {
    paymentIntents: { retrieve: vi.fn() },
    charges: { retrieve: vi.fn() },
    customers: { retrieve: vi.fn() },
    checkout: { sessions: { retrieve: vi.fn() } },
  },
}));

vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../stripe", () => ({ getStripe: () => stripeApi }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

import { ENV } from "../_core/env";
import { crmRouter } from "./crm";

const originalStripeKey = ENV.stripeSecretKey;
const fetchMock = vi.fn();

type Row = Record<string, unknown>;

const tableNames = new Map<unknown, string>([
  [crmDeals, "crmDeals"],
  [crmActivities, "crmActivities"],
  [crmDealDesigns, "crmDealDesigns"],
  [crmEmailLog, "crmEmailLog"],
  [orderRequests, "orderRequests"],
  [stripePaymentRecords, "stripePaymentRecords"],
  [users, "users"],
  [emailSettings, "emailSettings"],
  [affiliates, "affiliates"],
  [affiliateEmailSettings, "affiliateEmailSettings"],
  [affiliateInstallationEstimates, "affiliateInstallationEstimates"],
]);

function chain(rows: Row[]) {
  const query = {
    where() { return query; },
    orderBy() { return query; },
    limit(count: number) { return Promise.resolve(rows.slice(0, count)); },
    then(resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return query;
}

function memoryDb(seed: {
  deals: Row[];
  orders?: Row[];
  stripe?: Row[];
  users?: Row[];
  emailSettings?: Row[];
}) {
  const tables = new Map<unknown, Row[]>([
    [crmDeals, seed.deals],
    [orderRequests, seed.orders ?? []],
    [stripePaymentRecords, seed.stripe ?? []],
    [users, seed.users ?? []],
    [emailSettings, seed.emailSettings ?? []],
    [crmActivities, []],
    [crmDealDesigns, []],
    [crmEmailLog, []],
    [affiliates, []],
    [affiliateEmailSettings, []],
    [affiliateInstallationEstimates, []],
  ]);
  const rowsFor = (table: unknown) => {
    const rows = tables.get(table);
    if (!rows) throw new Error(`Unexpected query table: ${tableNames.get(table) ?? "unknown"}`);
    return rows;
  };
  const db = {
    select: () => ({
      from: (table: unknown) => chain(rowsFor(table)),
    }),
    insert: (table: unknown) => ({
      values: async (value: Row | Row[]) => {
        const list = rowsFor(table);
        list.push(...(Array.isArray(value) ? value : [value]));
        return [];
      },
    }),
    update: (table: unknown) => ({
      set: (patch: Row) => ({
        where: async () => {
          for (const row of rowsFor(table)) Object.assign(row, patch);
          return [];
        },
      }),
    }),
    execute: async () => {
      throw new Error("Raw SQL is not available in the invoice email test");
    },
  };
  getDbMock.mockResolvedValue(db);
  return { tables, deal: seed.deals[0] };
}

function dealFixture(overrides: Row = {}): Row {
  return {
    id: 501,
    affiliateId: null,
    ownerUserId: 1,
    contractorCustomerId: null,
    title: "Rivera kitchen",
    stage: "quoted",
    priority: "medium",
    contactName: "Ana Rivera",
    contactEmail: "ana.lead@example.com",
    contactPhone: "555-0100",
    company: "Rivera Homes",
    location: null,
    language: "en",
    estimatedValue: "4200.00",
    source: "order_request",
    orderRequestId: 88001,
    laborEstimateId: null,
    proApplicationId: null,
    referralCode: null,
    nextFollowUpAt: null,
    notes: null,
    boardOrder: 0,
    closedAt: null,
    needsHelpClosing: false,
    needsHelpDesigning: false,
    needsHelpShipping: false,
    designValue: null,
    shippingQuote: null,
    shippingAddress: null,
    shippingAddressVerified: false,
    designSyncedAt: null,
    createdAt: new Date("2026-10-30T12:00:00Z"),
    updatedAt: new Date("2026-10-30T12:00:00Z"),
    ...overrides,
  };
}

function orderFixture(overrides: Row = {}): Row {
  return {
    id: 88001,
    userId: 42,
    requestNumber: "CD-88001",
    originatorName: "Ana Rivera",
    originatorEmail: "order@example.com",
    originatorPhone: "555-0100",
    kitchenDesignId: null,
    affiliateId: null,
    status: "confirmed",
    totalAmount: "1840.00",
    deliveryMethod: "ship",
    freightQuoteCents: 0,
    freightQuoteVerified: false,
    stripePaymentIntentId: null,
    stripeSessionId: null,
    updatedAt: new Date("2026-10-29T12:00:00Z"),
    ...overrides,
  };
}

function stripeFixture(overrides: Row = {}): Row {
  return {
    customerEmail: "stripe-row@example.com",
    receiptEmail: "receipt@example.com",
    paymentIntentId: null,
    chargeId: null,
    customerId: null,
    checkoutSessionId: null,
    orderRequestId: 88001,
    orderNumber: "CD-88001",
    occurredAt: new Date("2026-10-29T15:00:00Z"),
    ...overrides,
  };
}

const savedSmtp = {
  id: 1,
  smtpHost: "smtp.example.test",
  smtpPort: 465,
  smtpUser: "smtp-user@example.test",
  smtpPass: "not-a-real-password",
  smtpFrom: "smtp-from@example.test",
  enabled: true,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

function adminCaller() {
  return crmRouter.createCaller({
    user: { id: 1, email: "owner@example.com", role: "admin" },
  } as never);
}

/** Payload the admin "Email PDF to Customer" button sends. It does not pass `to`. */
function buttonPayload(dealId: number) {
  return {
    dealId,
    lines: [{ description: "Cabinet Order", amount: 4200 }],
    linkedDesignId: null as number | null,
    notes: "Balance due before delivery.",
  };
}

function configureResend() {
  vi.stubEnv("RESEND_API_KEY", TEST_RESEND_KEY);
  vi.stubEnv("ORDER_EMAIL_FROM", TEST_FROM);
}

function resendCalls() {
  return fetchMock.mock.calls.map((call) => {
    const [url, init] = call as [string, RequestInit];
    return { url, init, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> };
  });
}

function expectPdfAttachment(to: string, invoiceNumber: string) {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const sent = resendCalls()[0];
  expect(sent.url).toBe("https://api.resend.com/emails");
  expect(sent.init.method).toBe("POST");
  expect(sent.init.headers).toMatchObject({ Authorization: `Bearer ${TEST_RESEND_KEY}` });
  expect(sent.body.from).toBe(TEST_FROM);
  expect(sent.body.to).toEqual([to]);
  const attachments = sent.body.attachments as { filename: string; content: string; content_type: string }[];
  expect(attachments).toHaveLength(1);
  expect(attachments[0].filename).toBe(`${invoiceNumber}.pdf`);
  expect(attachments[0].content_type).toBe("application/pdf");
  const pdf = Buffer.from(attachments[0].content, "base64");
  expect(pdf.length).toBeGreaterThan(500);
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(JSON.stringify(sent.body)).not.toContain(TEST_RESEND_KEY);
  expect(sendMail).not.toHaveBeenCalled();
  return sent;
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("ORDER_EMAIL_FROM", "");
  vi.stubEnv("SMTP_HOST", "");
  vi.stubEnv("SMTP_PORT", "");
  vi.stubEnv("SMTP_USER", "");
  vi.stubEnv("SMTP_PASS", "");
  vi.stubEnv("SMTP_FROM", "");
  ENV.stripeSecretKey = "";
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url !== "https://api.resend.com/emails") throw new Error(`Blocked outbound request to ${url}`);
    return new Response(JSON.stringify({ id: "email_invoice_test" }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  sendMail.mockClear();
  stripeApi.paymentIntents.retrieve.mockReset();
  stripeApi.charges.retrieve.mockReset();
  stripeApi.customers.retrieve.mockReset();
  stripeApi.checkout.sessions.retrieve.mockReset();
  stripeApi.paymentIntents.retrieve.mockRejectedValue(new Error("live Stripe must not be called"));
  stripeApi.charges.retrieve.mockRejectedValue(new Error("live Stripe must not be called"));
  stripeApi.customers.retrieve.mockRejectedValue(new Error("live Stripe must not be called"));
  stripeApi.checkout.sessions.retrieve.mockRejectedValue(new Error("live Stripe must not be called"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  ENV.stripeSecretKey = originalStripeKey;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("crm invoice email flow", () => {
  it("keeps the test off the production database", () => {
    expect(process.env.DATABASE_URL ?? "").toBe("");
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("loads a lead that already has an email and sends the button payload to that address", async () => {
    const world = memoryDb({
      deals: [dealFixture()],
      orders: [orderFixture({ originatorEmail: "order@example.com" })],
      stripe: [stripeFixture()],
      users: [{ id: 42, email: "account@example.com" }],
      emailSettings: [savedSmtp],
    });
    configureResend();
    const caller = adminCaller();

    const detail = await caller.deal({ id: 501 });
    expect(detail.deal.id).toBe(501);
    expect(detail.deal.orderRequestId).toBe(88001);
    expect(detail.invoicePrefill.cabinetOrderAmount).toBe("1840.00");
    expect(detail.invoiceRecipient).toEqual({
      email: "ana.lead@example.com",
      source: "deal",
      stripeLookup: "not_needed",
    });

    const readiness = await caller.emailReadiness({ dealId: 501 });
    expect(readiness).toMatchObject({ configured: true, enabled: true, from: TEST_FROM, channel: "platform" });

    const sent = await caller.sendInvoiceEmail(buttonPayload(501));
    expect(sent.ok).toBe(true);
    expect(sent.invoiceNumber).toMatch(/^CRM-501-\d{8}$/);
    const message = expectPdfAttachment("ana.lead@example.com", sent.invoiceNumber);
    expect(message.body.subject).toBe(`Cabinet Dealz invoice ${sent.invoiceNumber}`);
    expect(String(message.body.text)).toContain("is attached");
    expect(world.deal.contactEmail).toBe("ana.lead@example.com");
    expect(world.tables.get(crmEmailLog)).toEqual([
      expect.objectContaining({
        dealId: 501,
        toEmail: "ana.lead@example.com",
        fromEmail: TEST_FROM,
        subject: `Cabinet Dealz invoice ${sent.invoiceNumber}`,
      }),
    ]);
    expect(world.tables.get(crmActivities)?.[0]).toEqual(expect.objectContaining({
      kind: "email",
      body: expect.stringContaining("ana.lead@example.com"),
    }));
    expect(stripeApi.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  it("lets a typed address win over the lead email and does not overwrite the lead", async () => {
    const world = memoryDb({
      deals: [dealFixture()],
      orders: [orderFixture()],
      emailSettings: [savedSmtp],
    });
    configureResend();
    const sent = await adminCaller().sendInvoiceEmail({
      ...buttonPayload(501),
      to: "typed@example.com",
    });
    expectPdfAttachment("typed@example.com", sent.invoiceNumber);
    expect(world.deal.contactEmail).toBe("ana.lead@example.com");
  });

  it("uses a typed address when the lead has no email, even if the order has one, and saves it after send", async () => {
    const world = memoryDb({
      deals: [dealFixture({ contactEmail: null })],
      orders: [orderFixture({ originatorEmail: "order@example.com" })],
      stripe: [stripeFixture()],
      users: [{ id: 42, email: "account@example.com" }],
      emailSettings: [savedSmtp],
    });
    configureResend();
    const caller = adminCaller();
    const detail = await caller.deal({ id: 501 });
    expect(detail.deal.contactEmail).toBeNull();
    expect(detail.invoiceRecipient).toEqual({
      email: "order@example.com",
      source: "order",
      stripeLookup: "not_needed",
    });

    const sent = await caller.sendInvoiceEmail({
      ...buttonPayload(501),
      to: "  typed@example.com  ",
    });
    expectPdfAttachment("typed@example.com", sent.invoiceNumber);
    expect(world.deal.contactEmail).toBe("typed@example.com");
    expect(world.tables.get(crmEmailLog)?.[0]).toEqual(expect.objectContaining({ toEmail: "typed@example.com" }));
  });

  it("falls back to the linked order when the lead has no email and the button sends no typed address", async () => {
    const world = memoryDb({
      deals: [dealFixture({ contactEmail: "   " })],
      orders: [orderFixture({ originatorEmail: "order@example.com" })],
      stripe: [stripeFixture({ customerEmail: "stripe-row@example.com" })],
      users: [{ id: 42, email: "account@example.com" }],
      emailSettings: [savedSmtp],
    });
    configureResend();
    const sent = await adminCaller().sendInvoiceEmail(buttonPayload(501));
    expectPdfAttachment("order@example.com", sent.invoiceNumber);
    expect(world.deal.contactEmail).toBe("order@example.com");
    expect(stripeApi.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  it("falls back to the stored Stripe email before the customer account", async () => {
    const world = memoryDb({
      deals: [dealFixture({ contactEmail: null })],
      orders: [orderFixture({ originatorEmail: null })],
      stripe: [stripeFixture({ customerEmail: null, receiptEmail: "receipt@example.com" })],
      users: [{ id: 42, email: "account@example.com" }],
      emailSettings: [savedSmtp],
    });
    configureResend();
    const detail = await adminCaller().deal({ id: 501 });
    expect(detail.invoiceRecipient).toEqual({
      email: "receipt@example.com",
      source: "stripe_record",
      stripeLookup: "not_needed",
    });
    const sent = await adminCaller().sendInvoiceEmail(buttonPayload(501));
    expectPdfAttachment("receipt@example.com", sent.invoiceNumber);
    expect(world.deal.contactEmail).toBe("receipt@example.com");
  });

  it("falls back to the customer account when the lead, order, and Stripe row have no email", async () => {
    const world = memoryDb({
      deals: [dealFixture({ contactEmail: null })],
      orders: [orderFixture({ originatorEmail: "", stripePaymentIntentId: null })],
      stripe: [stripeFixture({ customerEmail: " ", receiptEmail: null, paymentIntentId: null })],
      users: [{ id: 42, email: "account@example.com" }],
      emailSettings: [savedSmtp],
    });
    configureResend();
    const detail = await adminCaller().deal({ id: 501 });
    expect(detail.invoiceRecipient).toEqual({
      email: "account@example.com",
      source: "account",
      stripeLookup: "not_needed",
    });
    const sent = await adminCaller().sendInvoiceEmail(buttonPayload(501));
    expectPdfAttachment("account@example.com", sent.invoiceNumber);
    expect(world.deal.contactEmail).toBe("account@example.com");
    expect(stripeApi.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  it("uses a live Stripe email only after every local source is empty, and a Stripe miss does not throw", async () => {
    ENV.stripeSecretKey = "sk_test_invoice_not_live";
    stripeApi.paymentIntents.retrieve.mockResolvedValue({ receipt_email: "live@example.com" });
    const world = memoryDb({
      deals: [dealFixture({ contactEmail: null })],
      orders: [orderFixture({ originatorEmail: null, userId: 42, stripePaymentIntentId: "pi_test_invoice" })],
      stripe: [],
      users: [{ id: 42, email: null }],
      emailSettings: [savedSmtp],
    });
    configureResend();
    const caller = adminCaller();
    expect((await caller.deal({ id: 501 })).invoiceRecipient).toEqual({
      email: "live@example.com",
      source: "stripe",
      stripeLookup: "found",
    });
    fetchMock.mockClear();
    const sent = await caller.sendInvoiceEmail(buttonPayload(501));
    expectPdfAttachment("live@example.com", sent.invoiceNumber);
    expect(world.deal.contactEmail).toBe("live@example.com");
    expect(stripeApi.paymentIntents.retrieve).toHaveBeenCalledWith("pi_test_invoice", { expand: ["latest_charge"] });

    const missed = memoryDb({
      deals: [dealFixture({ id: 502, contactEmail: null })],
      orders: [orderFixture({ originatorEmail: null, userId: null, stripePaymentIntentId: "pi_missing" })],
      emailSettings: [savedSmtp],
    });
    stripeApi.paymentIntents.retrieve.mockReset();
    stripeApi.paymentIntents.retrieve.mockRejectedValue(new Error("No such payment_intent"));
    fetchMock.mockClear();
    await expect(adminCaller().sendInvoiceEmail(buttonPayload(502))).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "missing_recipient",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(missed.deal.contactEmail).toBeNull();
  });

  it("blocks a lead with no email and no typed address when nothing resolves", async () => {
    const world = memoryDb({
      deals: [dealFixture({ contactEmail: null, orderRequestId: null, source: "manual" })],
      emailSettings: [savedSmtp],
    });
    configureResend();
    const caller = adminCaller();
    const detail = await caller.deal({ id: 501 });
    expect(detail.deal.orderRequestId).toBeNull();
    expect(detail.invoiceRecipient).toEqual({ email: null, source: null, stripeLookup: "skipped" });
    expect(await caller.emailReadiness({ dealId: 501 })).toMatchObject({
      configured: true,
      enabled: true,
      from: TEST_FROM,
    });

    await expect(caller.sendInvoiceEmail(buttonPayload(501))).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "missing_recipient",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(world.deal.contactEmail).toBeNull();
    expect(world.tables.get(crmEmailLog)).toEqual([]);
  });

  it("reports transport readiness separately from a missing recipient and blocks the send", async () => {
    const world = memoryDb({
      deals: [dealFixture({ contactEmail: null })],
      orders: [orderFixture({ originatorEmail: "order@example.com" })],
      emailSettings: [savedSmtp],
    });
    const caller = adminCaller();
    const notReady = {
      configured: false,
      enabled: false,
      from: "",
      channel: "platform",
      replyTo: null,
    };

    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("ORDER_EMAIL_FROM", TEST_FROM);
    expect(await caller.emailReadiness()).toEqual(notReady);
    await expect(caller.sendInvoiceEmail(buttonPayload(501))).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "not_configured",
    });

    vi.stubEnv("RESEND_API_KEY", TEST_RESEND_KEY);
    vi.stubEnv("ORDER_EMAIL_FROM", "   ");
    expect(await caller.emailReadiness({ dealId: 501 })).toEqual(notReady);
    await expect(caller.sendInvoiceEmail({ ...buttonPayload(501), to: "typed@example.com" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "not_configured",
    });

    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("ORDER_EMAIL_FROM", "");
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_USER", "smtp-user@example.test");
    vi.stubEnv("SMTP_PASS", "not-a-real-password");
    vi.stubEnv("SMTP_FROM", "smtp-from@example.test");
    expect(await caller.emailReadiness()).toEqual(notReady);
    await expect(caller.sendInvoiceEmail(buttonPayload(501))).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "not_configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(world.deal.contactEmail).toBeNull();
    expect(world.tables.get(crmEmailLog)).toEqual([]);
  });

  it("does not save a typed address when Resend rejects the message", async () => {
    const world = memoryDb({
      deals: [dealFixture({ contactEmail: null })],
      orders: [orderFixture()],
      emailSettings: [savedSmtp],
    });
    configureResend();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "blocked" }), { status: 422 }));
    await expect(adminCaller().sendInvoiceEmail({
      ...buttonPayload(501),
      to: "typed@example.com",
    })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Send failed: The email service did not accept the message.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(world.deal.contactEmail).toBeNull();
    expect(world.tables.get(crmEmailLog)).toEqual([]);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does not send when the database is unavailable", async () => {
    getDbMock.mockResolvedValue(null);
    configureResend();
    const caller = adminCaller();
    expect(await caller.emailReadiness()).toEqual({
      configured: false,
      enabled: false,
      from: "",
      channel: "platform",
      replyTo: null,
    });
    await expect(caller.sendInvoiceEmail(buttonPayload(501))).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a typed address that is not an email before any send", async () => {
    memoryDb({ deals: [dealFixture({ contactEmail: null })], emailSettings: [savedSmtp] });
    configureResend();
    await expect(adminCaller().sendInvoiceEmail({
      ...buttonPayload(501),
      to: "not-an-email",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("has no automatic invoice send outside the admin mutation", () => {
    const roots = ["server", "client/src", "shared"].map((dir) => path.resolve(dir));
    const hits = roots.flatMap(sourceFiles).filter((file) => readFileSync(file, "utf8").includes("sendInvoiceEmail"));
    expect(hits.map((file) => path.relative(process.cwd(), file)).sort()).toEqual([
      "client/src/components/crm/CrmBoard.invoiceEmail.test.ts",
      "client/src/components/crm/CrmBoard.tsx",
      "server/routers/crm.invoiceEmail.test.ts",
      "server/routers/crm.ts",
    ]);
  });
});
