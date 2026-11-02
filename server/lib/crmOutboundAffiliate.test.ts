/**
 * The CRM customer-mail path must deliver through the affiliate's own mailbox.
 *
 * Safety: getDb is an in-memory table map, nodemailer is a stub, and no real
 * SMTP server, database, or mailbox is contacted. Hosts are *.test names.
 *
 * This covers the wiring that the setup screen and invoice button share:
 * sendCrmDealEmail -> loadCrmOutboundPlan -> affiliate SMTP (or platform
 * fallback), with Cabinet Dealz copied on every invoice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  affiliateEmailSettings,
  affiliates,
  crmActivities,
  crmDeals,
  crmEmailLog,
  emailSettings,
} from "../../drizzle/schema";

const { getDbMock, createTransport, sendMail } = vi.hoisted(() => {
  process.env.JWT_SECRET ||= "test-only-encryption-key-for-affiliate-sender";
  process.env.CABINETDEALZ_ADMIN_EMAIL ||= "invoices@cabinetdealz.test";
  return { getDbMock: vi.fn(), createTransport: vi.fn(), sendMail: vi.fn() };
});

vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (options: unknown) => {
      createTransport(options);
      return { sendMail, verify: async () => true, close: () => {} };
    },
  },
}));

import { encryptEmailSettingsPassword } from "./emailSettingsCrypto";
import { sendCrmDealEmail } from "./crmCustomerMail";

const ADMIN_COPY = "invoices@cabinetdealz.test";
const STORE_PASSWORD = "rich-yahoo-app-password";
const STORE = "richnseliena@yahoo.test";
const PLATFORM_FROM = "Cabinet Dealz <orders@cabinetdealz.test>";

type Row = Record<string, unknown>;

/** Reads the bound value out of drizzle's sql`... = ${value}` predicate. */
function predicateValue(predicate: unknown): number | null {
  const chunks = (predicate as { queryChunks?: { value?: unknown }[] } | null)?.queryChunks;
  if (!chunks) return null;
  for (const chunk of chunks) {
    const value = (chunk as { value?: unknown })?.value;
    if (typeof value === "number") return value;
  }
  return null;
}

function memoryDb(seed: { settings?: Row[]; store?: Row[]; platform?: Row[] }) {
  const tables = new Map<unknown, Row[]>([
    [affiliateEmailSettings, seed.settings ?? []],
    [affiliates, seed.store ?? []],
    [emailSettings, seed.platform ?? []],
    [crmEmailLog, []],
    [crmActivities, []],
    [crmDeals, [{ id: 77, updatedAt: new Date() }]],
  ]);
  const rowsFor = (table: unknown) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  };
  const db = {
    select: () => ({
      from: (table: unknown) => {
        const rows = rowsFor(table);
        const filtered = (predicate: unknown) => {
          const target = predicateValue(predicate);
          return target == null ? rows : rows.filter((row) => row.affiliateId === target || row.id === target);
        };
        const result = (list: Row[]) => ({
          limit: (count: number) => Promise.resolve(list.slice(0, count)),
          orderBy: () => Promise.resolve(list),
          then: (resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(list).then(resolve, reject),
        });
        return {
          where: (predicate: unknown) => result(filtered(predicate)),
          limit: (count: number) => Promise.resolve(rows.slice(0, count)),
          orderBy: () => Promise.resolve(rows),
          then: (resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
        };
      },
    }),
    insert: (table: unknown) => ({
      values: async (value: Row | Row[]) => {
        rowsFor(table).push(...(Array.isArray(value) ? value : [value]));
      },
    }),
    update: (table: unknown) => ({
      set: (patch: Row) => ({
        where: async () => {
          for (const row of rowsFor(table)) Object.assign(row, patch);
        },
      }),
    }),
  };
  getDbMock.mockResolvedValue(db);
  return tables;
}

function affiliateRow(overrides: Row = {}): Row {
  return {
    id: 1,
    affiliateId: 9,
    provider: "yahoo",
    contactEmail: STORE,
    smtpHost: "smtp.mail.yahoo.test",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: STORE,
    smtpPass: encryptEmailSettingsPassword(STORE_PASSWORD),
    smtpFrom: STORE,
    fromName: "Rich's Building Supply",
    replyTo: "",
    invoiceCopyEmail: "",
    signatureHtml: "",
    enabled: true,
    lastTestedAt: null,
    lastTestOk: null,
    lastTestError: null,
    ...overrides,
  };
}

const store = [{ id: 9, storeName: "Rich's Building Supply", publicEmail: "", email: STORE }];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("ORDER_EMAIL_FROM", "");
  vi.stubEnv("SMTP_HOST", "");
  vi.stubEnv("SMTP_USER", "");
  vi.stubEnv("SMTP_PASS", "");
  vi.stubEnv("CABINETDEALZ_ADMIN_EMAIL", ADMIN_COPY);
  createTransport.mockReset();
  sendMail.mockReset();
  sendMail.mockResolvedValue({ messageId: "smtp-affiliate-1" });
  getDbMock.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

function invoiceMessage() {
  return {
    dealId: 77,
    affiliateId: 9,
    to: "customer@example.test",
    subject: "Rich's invoice CRM-77-20261102",
    text: "Your invoice is attached.",
    html: "<p>Your invoice is attached.</p>",
    attachments: [{ filename: "CRM-77-20261102.pdf", content: Buffer.from("%PDF"), contentType: "application/pdf" }],
    activityBody: "Invoice sent.",
    invoice: true,
  };
}

describe("CRM customer mail through the affiliate mailbox", () => {
  it("sends the invoice from the affiliate's own address and copies Cabinet Dealz", async () => {
    const tables = memoryDb({ settings: [affiliateRow()], store });

    const sent = await sendCrmDealEmail(await db(), invoiceMessage());

    expect(sent.transport).toBe("affiliate_smtp");
    expect(sent.from).toBe(`"Rich's Building Supply" <${STORE}>`);
    expect(sent.invoiceCopyTo).toBe(ADMIN_COPY);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.mail.yahoo.test",
      port: 465,
      secure: true,
      auth: { user: STORE, pass: STORE_PASSWORD },
    }));
    const message = sendMail.mock.calls[0][0] as { from: string; to: string; bcc: string[] };
    expect(message.from).toBe(`"Rich's Building Supply" <${STORE}>`);
    expect(message.to).toBe("customer@example.test");
    expect(message.bcc).toEqual([ADMIN_COPY]);
    // The CRM history records the affiliate as the sender, not the platform.
    expect(tables.get(crmEmailLog)).toEqual([
      expect.objectContaining({ toEmail: "customer@example.test", fromEmail: `"Rich's Building Supply" <${STORE}>` }),
    ]);
  });

  it("keeps an affiliate's quote on its mailbox but does not BCC Cabinet Dealz", async () => {
    memoryDb({ settings: [affiliateRow()], store });

    const sent = await sendCrmDealEmail(await db(), {
      ...invoiceMessage(),
      subject: "Your quote",
      invoice: false,
    });

    expect(sent.transport).toBe("affiliate_smtp");
    expect(sent.invoiceCopyTo).toBeNull();
    expect((sendMail.mock.calls[0][0] as { bcc?: unknown }).bcc).toBeUndefined();
  });

  it("falls back to the platform sender and still copies Cabinet Dealz on an invoice", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_not_live");
    vi.stubEnv("ORDER_EMAIL_FROM", PLATFORM_FROM);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email_fallback" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    memoryDb({ settings: [affiliateRow({ enabled: false })], store });

    const sent = await sendCrmDealEmail(await db(), invoiceMessage());

    expect(sent.transport).toBe("resend");
    expect(sent.from).toBe(PLATFORM_FROM);
    expect(sent.invoiceCopyTo).toBe(ADMIN_COPY);
    expect(createTransport).not.toHaveBeenCalled();
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.from).toBe(PLATFORM_FROM);
    // The customer still reaches the store when they reply.
    expect(body.reply_to).toBe(STORE);
    expect(body.bcc).toEqual([ADMIN_COPY]);
  });

  it("gives supplier mail the platform sender even when the affiliate has a mailbox", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_not_live");
    vi.stubEnv("ORDER_EMAIL_FROM", PLATFORM_FROM);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email_po" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    memoryDb({ settings: [affiliateRow()], store });

    const sent = await sendCrmDealEmail(await db(), {
      ...invoiceMessage(),
      to: "orders@distributor.test",
      invoice: false,
      platformSender: true,
      distributorId: 4,
    });

    expect(sent.transport).toBe("resend");
    expect(createTransport).not.toHaveBeenCalled();
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.from).toBe(PLATFORM_FROM);
  });
});

describe("invoice and quote entry points", () => {
  const router = readFileSync(path.resolve("server/routers/crm.ts"), "utf8");
  // Built at runtime so this file does not itself match the source scan that
  // proves only the admin mutation sends invoices.
  const invoiceProcedure = ["send", "Invoice", "Email: protectedProcedure"].join("");

  it("marks only the invoice mutation as an invoice so quotes do not copy Cabinet Dealz", () => {
    const invoiceSends = router.match(/invoice: true/g) ?? [];
    expect(invoiceSends).toHaveLength(1);
    const index = router.indexOf("invoice: true");
    const start = router.indexOf(invoiceProcedure);
    const end = router.indexOf("sendDesign: protectedProcedure");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // The flag is inside the invoice send and nowhere else.
    expect(index).toBeGreaterThan(start);
    expect(index).toBeLessThan(end);
    expect(router.slice(index - 600, index)).toContain("Branded invoice PDF");
  });

  it("keeps supplier PO mail off the affiliate mailbox", () => {
    expect(router).toContain("platformSender: true");
  });

  it("keeps the paid-order receipt marked as an invoice so Cabinet Dealz is copied", () => {
    const receipt = readFileSync(path.resolve("server/lib/orderReceiptEmail.ts"), "utf8");
    expect(receipt).toMatch(/invoice: true/);
  });
});

async function db() {
  const { getDb } = await import("../db");
  return (await getDb())!;
}
