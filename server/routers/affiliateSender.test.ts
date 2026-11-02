/**
 * Per-affiliate outbound email.
 *
 * Safety: getDb is mocked with an in-memory table, nodemailer is a stub that
 * records createTransport options and sendMail payloads, and no real SMTP
 * server, database, or mailbox is contacted. Every host used here is a *.test
 * name. DATABASE_URL is forced empty so the shared sender cannot reach TiDB.
 *
 * What is covered:
 * - the affiliate's own address carries its customer mail;
 * - a disabled or incomplete mailbox falls back to the platform sender;
 * - invoices always copy the Cabinet Dealz address on BCC (default from env);
 * - settings are scoped server-side: an affiliate cannot read or write another
 *   store's row, and a platform admin must name the store;
 * - the SMTP password never leaves the server and is encrypted at rest;
 * - "send test email" verifies the connection and returns the exact error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { affiliateEmailSettings, affiliates } from "../../drizzle/schema";

const { getDbMock, accessMock, createTransport, sendMail, verify } = vi.hoisted(() => {
  process.env.JWT_SECRET ||= "test-only-encryption-key-for-affiliate-sender";
  process.env.CABINETDEALZ_ADMIN_EMAIL ||= "admin@cabinetdealz.test";
  return {
    getDbMock: vi.fn(),
    accessMock: vi.fn(),
    createTransport: vi.fn(),
    sendMail: vi.fn(),
    verify: vi.fn(),
  };
});

vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../lib/affiliateAccess", () => ({ resolveAffiliateAccess: accessMock }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (options: unknown) => {
      createTransport(options);
      return { sendMail, verify, close: () => {} };
    },
  },
}));

import { crmEmailRouter } from "./crmEmail";
import { encryptEmailSettingsPassword } from "../lib/emailSettingsCrypto";
import {
  affiliateSenderFromAddress,
  affiliateSenderReady,
  buildInvoiceCopyBcc,
  formatAffiliateFrom,
  invoiceCopyRecipient,
  resolveSmtpSecure,
} from "@shared/affiliateSender";
import { resolveCrmOutbound } from "@shared/crmMailbox";
import type { AffiliateSmtpSender } from "../email";

const PLATFORM_FROM = "Cabinet Dealz <orders@cabinetdealz.test>";
const ADMIN_COPY = "admin@cabinetdealz.test";
const STORE_PASSWORD = "yahoo-app-password-do-not-leak";

type Row = Record<string, unknown>;

/** Minimal drizzle-like chain over one in-memory table. */
function memoryDb(rows: Row[]) {
  const table = rows;
  const builder = () => {
    let current = [...table];
    const query = {
      where(_predicate: unknown) {
        // The server filters by affiliateId; emulate that one predicate.
        const target = predicateValue(_predicate);
        current = table.filter((row) => target == null || row.affiliateId === target);
        return query;
      },
      limit(count: number) {
        return Promise.resolve(current.slice(0, count));
      },
      orderBy() {
        return Promise.resolve(current);
      },
      then(resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(current).then(resolve, reject);
      },
    };
    return query;
  };
  const db = {
    select: () => ({
      from: (source: unknown) => {
        if (source === affiliateEmailSettings) return builder();
        if (source === affiliates) {
          return {
            where: () => ({
              limit: () => Promise.resolve([{ id: 7, storeName: "Rich's Building Supply" }]),
            }),
            limit: () => Promise.resolve([{ id: 7, storeName: "Rich's Building Supply" }]),
          };
        }
        return { limit: () => Promise.resolve([]), where: () => ({ limit: () => Promise.resolve([]) }) };
      },
    }),
    update: (source: unknown) => ({
      set: (patch: Row) => ({
        where: async (predicate: unknown) => {
          const target = predicateValue(predicate);
          for (const row of table) {
            if (source !== affiliateEmailSettings) continue;
            if (target != null && row.id !== target && row.affiliateId !== target) continue;
            Object.assign(row, patch);
          }
        },
      }),
    }),
    insert: (source: unknown) => ({
      values: async (value: Row) => {
        if (source === affiliateEmailSettings) table.push({ id: table.length + 1, ...value });
      },
    }),
    execute: async () => [],
  };
  getDbMock.mockResolvedValue(db);
  return { rows: table };
}

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

function senderRow(overrides: Row = {}): Row {
  return {
    id: 1,
    affiliateId: 7,
    provider: "yahoo",
    contactEmail: "richnseliena@yahoo.test",
    smtpHost: "smtp.mail.yahoo.test",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: "richnseliena@yahoo.test",
    smtpPass: encryptEmailSettingsPassword(STORE_PASSWORD),
    smtpFrom: "richnseliena@yahoo.test",
    fromName: "Rich's",
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

function storeOwnerCaller() {
  accessMock.mockResolvedValue({
    affiliateId: 7,
    isOwner: true,
    accessCrm: true,
    accessDesigner: true,
    accessMarketing: true,
    teamMemberId: null,
  });
  return crmEmailRouter.createCaller({
    user: { id: 12, email: "owner@richs.test", role: "partner" },
  } as never);
}

function adminCaller() {
  return crmEmailRouter.createCaller({
    user: { id: 1, email: "admin@cabinetdealz.test", role: "admin" },
  } as never);
}

const senderConfig = () => ({
  provider: "yahoo" as const,
  contactEmail: "richnseliena@yahoo.test",
  smtpHost: "smtp.mail.yahoo.test",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "richnseliena@yahoo.test",
  smtpFrom: "richnseliena@yahoo.test",
  fromName: "Rich's Building Supply",
  replyTo: "",
  invoiceCopyEmail: "",
  signatureHtml: "",
  enabled: true,
});

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
  sendMail.mockResolvedValue({ messageId: "smtp-test-1" });
  verify.mockReset();
  verify.mockResolvedValue(true);
  accessMock.mockReset();
  getDbMock.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("affiliate sender helpers", () => {
  it("treats the affiliate's contact address as the From and requires every SMTP field", () => {
    expect(affiliateSenderFromAddress({ contactEmail: "a@shop.test", smtpFrom: "", smtpUser: "" })).toBe("a@shop.test");
    expect(affiliateSenderFromAddress({ contactEmail: "", smtpFrom: "from@shop.test", smtpUser: "" })).toBe("from@shop.test");
    expect(affiliateSenderReady({
      enabled: true,
      smtpHost: "smtp.mail.yahoo.test",
      smtpPort: 465,
      smtpUser: "a@shop.test",
      smtpPass: "ciphertext",
      contactEmail: "a@shop.test",
    })).toBe(true);
    expect(affiliateSenderReady({
      enabled: true,
      smtpHost: "smtp.mail.yahoo.test",
      smtpPort: 465,
      smtpUser: "a@shop.test",
      smtpPass: "",
      contactEmail: "a@shop.test",
    })).toBe(false);
    expect(affiliateSenderReady({
      enabled: false,
      smtpHost: "smtp.mail.yahoo.test",
      smtpPort: 465,
      smtpUser: "a@shop.test",
      smtpPass: "ciphertext",
      contactEmail: "a@shop.test",
    })).toBe(false);
  });

  it("resolves Yahoo's two ports: 465 is SSL and 587 is STARTTLS", () => {
    expect(resolveSmtpSecure(465, undefined)).toBe(true);
    expect(resolveSmtpSecure(587, undefined)).toBe(false);
    expect(resolveSmtpSecure(587, true)).toBe(true);
  });

  it("defaults the invoice copy to the platform admin address and never duplicates the customer", () => {
    expect(invoiceCopyRecipient({ invoiceCopyEmail: "" }, ADMIN_COPY)).toBe(ADMIN_COPY);
    expect(invoiceCopyRecipient({ invoiceCopyEmail: "books@shop.test" }, ADMIN_COPY)).toBe("books@shop.test");
    expect(invoiceCopyRecipient(null, "")).toBeNull();
    expect(buildInvoiceCopyBcc("customer@example.com", ADMIN_COPY)).toEqual([ADMIN_COPY]);
    expect(buildInvoiceCopyBcc(ADMIN_COPY, ADMIN_COPY)).toEqual([]);
    expect(buildInvoiceCopyBcc("customer@example.com", ADMIN_COPY, ["ops@shop.test"])).toEqual(["ops@shop.test", ADMIN_COPY]);
    expect(buildInvoiceCopyBcc("customer@example.com", ADMIN_COPY, [ADMIN_COPY])).toEqual([ADMIN_COPY]);
  });

  it("formats a store display name without breaking the header", () => {
    expect(formatAffiliateFrom("Rich's Supply", "a@shop.test")).toBe(`"Rich's Supply" <a@shop.test>`);
    expect(formatAffiliateFrom('Bad\r\nBcc: evil@example.com', "a@shop.test")).toBe(`"BadBcc: evil@example.com" <a@shop.test>`);
    expect(formatAffiliateFrom("", "a@shop.test")).toBe("a@shop.test");
  });

  it("plans the affiliate's own sender without needing the platform Resend key", () => {
    const plan = resolveCrmOutbound({
      dealAffiliateId: 7,
      storeName: "Rich's",
      publicEmail: null,
      affiliate: {
        affiliateId: 7,
        provider: "yahoo",
        contactEmail: "richnseliena@yahoo.test",
        smtpHost: "smtp.mail.yahoo.test",
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: "richnseliena@yahoo.test",
        smtpPass: "ciphertext",
        smtpFrom: "",
        fromName: "Rich's",
        replyTo: "",
        invoiceCopyEmail: "",
        signatureHtml: "",
        enabled: true,
      },
      platform: null,
      resendReady: false,
    });
    expect(plan).toMatchObject({ ok: true, channel: "affiliate", from: "richnseliena@yahoo.test", affiliateId: 7 });
  });
});

describe("affiliate settings endpoints", () => {
  it("encrypts the password at rest and never returns it to the client", async () => {
    const world = memoryDb([]);
    const caller = storeOwnerCaller();
    const saved = await caller.emailSetup.save({ ...senderConfig(), smtpPass: STORE_PASSWORD });

    expect(saved).toMatchObject({ ok: true, affiliateId: 7, hasPassword: true, configured: true });
    const stored = world.rows[0];
    expect(stored.affiliateId).toBe(7);
    expect(String(stored.smtpPass)).not.toContain(STORE_PASSWORD);
    expect(String(stored.smtpPass)).toMatch(/^cabinetdealz:smtp:v1:/);

    const read = await caller.emailSetup.get();
    expect(read.settings).not.toBeNull();
    expect(JSON.stringify(read)).not.toContain(STORE_PASSWORD);
    expect(JSON.stringify(read)).not.toContain(String(stored.smtpPass));
    expect(read.settings).toMatchObject({
      affiliateId: 7,
      contactEmail: "richnseliena@yahoo.test",
      smtpHost: "smtp.mail.yahoo.test",
      smtpPort: 465,
      smtpSecure: true,
      hasPassword: true,
      configured: true,
      enabled: true,
    });
    expect(read.settings).not.toHaveProperty("smtpPass");
    expect(read.invoiceCopyDefault).toBe(ADMIN_COPY);
  });

  it("keeps the saved password when the form leaves it blank", async () => {
    const world = memoryDb([senderRow({ smtpPort: 587, smtpSecure: false })]);
    const before = String(world.rows[0].smtpPass);
    await storeOwnerCaller().emailSetup.save({
      ...senderConfig(),
      smtpPort: 587,
      smtpSecure: false,
      smtpPass: "",
      fromName: "Rich's Building Supply",
    });
    expect(world.rows[0].smtpPass).toBe(before);
    expect(world.rows[0].smtpPort).toBe(587);
    expect(world.rows[0].smtpSecure).toBe(false);
  });

  it("refuses to enable a sender with no host, user, or password", async () => {
    memoryDb([]);
    const caller = storeOwnerCaller();
    await expect(caller.emailSetup.save({ ...senderConfig(), smtpHost: "" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.emailSetup.save({ ...senderConfig(), smtpUser: "" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.emailSetup.save({ ...senderConfig(), smtpPass: "" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.emailSetup.save({ ...senderConfig(), contactEmail: "not-an-email" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lets a disabled sender save without a password so a store can switch it off", async () => {
    const world = memoryDb([senderRow()]);
    const result = await storeOwnerCaller().emailSetup.save({
      ...senderConfig(),
      enabled: false,
      smtpPass: "",
    });
    expect(result).toMatchObject({ ok: true, configured: false });
    expect(world.rows[0].enabled).toBe(false);
  });
});

describe("affiliate settings isolation", () => {
  it("refuses another store's settings even when the caller sends that store's id", async () => {
    memoryDb([senderRow({ affiliateId: 7 }), senderRow({ id: 2, affiliateId: 9, smtpUser: "other@shop.test" })]);
    const caller = storeOwnerCaller();
    await expect(caller.emailSetup.get({ affiliateId: 9 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.emailSetup.save({ ...senderConfig(), affiliateId: 9 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.emailSetup.sendTest({ affiliateId: 9 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("resolves an owner's own store without trusting any client identifier", async () => {
    const world = memoryDb([senderRow({ affiliateId: 7 }), senderRow({ id: 2, affiliateId: 9, smtpUser: "other@shop.test" })]);
    const read = await storeOwnerCaller().emailSetup.get();
    expect(read.affiliateId).toBe(7);
    expect(read.settings).toMatchObject({ affiliateId: 7, smtpUser: "richnseliena@yahoo.test" });
    expect(world.rows[1].smtpUser).toBe("other@shop.test");
  });

  it("refuses a teammate even when their invitation grants CRM access", async () => {
    memoryDb([senderRow()]);
    accessMock.mockResolvedValue({
      affiliateId: 7,
      isOwner: false,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: false,
      teamMemberId: 3,
    });
    const caller = crmEmailRouter.createCaller({
      user: { id: 40, email: "manager@richs.test", role: "user" },
    } as never);
    await expect(caller.emailSetup.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.emailSetup.save(senderConfig())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.emailSetup.sendTest()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a login with no affiliate link", async () => {
    memoryDb([]);
    accessMock.mockResolvedValue(null);
    const caller = crmEmailRouter.createCaller({
      user: { id: 55, email: "stranger@example.test", role: "user" },
    } as never);
    await expect(caller.emailSetup.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires a platform admin to name the store instead of guessing one", async () => {
    memoryDb([senderRow()]);
    await expect(adminCaller().emailSetup.get()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const read = await adminCaller().emailSetup.get({ affiliateId: 7 });
    expect(read.affiliateId).toBe(7);
    expect(JSON.stringify(read)).not.toContain(STORE_PASSWORD);
  });
});

describe("send test email", () => {
  it("verifies the connection and sends only to the affiliate's own address", async () => {
    const world = memoryDb([senderRow()]);
    const result = await storeOwnerCaller().emailSetup.sendTest();

    expect(result).toMatchObject({ ok: true, from: "richnseliena@yahoo.test", to: "richnseliena@yahoo.test" });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.mail.yahoo.test",
      port: 465,
      secure: true,
      auth: { user: "richnseliena@yahoo.test", pass: STORE_PASSWORD },
    }));
    expect(verify).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: "richnseliena@yahoo.test",
      from: `"Rich's" <richnseliena@yahoo.test>`,
    });
    expect(world.rows[0]).toMatchObject({ lastTestOk: true, lastTestError: null });
    expect(world.rows[0].lastTestedAt).toBeInstanceOf(Date);
  });

  it("returns the exact SMTP error when authentication fails", async () => {
    memoryDb([senderRow()]);
    verify.mockRejectedValue(Object.assign(new Error("Invalid login: 535 5.7.8 Username and Password not accepted"), {
      code: "EAUTH",
      response: "535 5.7.8 Username and Password not accepted",
    }));

    const result = await storeOwnerCaller().emailSetup.sendTest();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("EAUTH");
    expect(result.error).toContain("535 5.7.8 Username and Password not accepted");
  });

  it("records the failure and never prints the password", async () => {
    const world = memoryDb([senderRow()]);
    verify.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { code: "ESOCKET" }));

    const result = await storeOwnerCaller().emailSetup.sendTest();
    expect(result).toMatchObject({ ok: false });
    expect(String(result.error)).toContain("ECONNREFUSED");
    expect(world.rows[0]).toMatchObject({ lastTestOk: false });
    expect(String(world.rows[0].lastTestError)).toContain("ECONNREFUSED");
    const logged = [
      ...(console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat(),
      ...(console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat(),
    ].map(String).join(" ");
    expect(logged).not.toContain(STORE_PASSWORD);
  });

  it("explains that nothing is saved when the store has no mailbox yet", async () => {
    memoryDb([]);
    const caller = storeOwnerCaller();
    await expect(caller.emailSetup.sendTest()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Save a valid contact email for this affiliate before sending a test message.",
    });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("refuses to test a mailbox that is saved but switched off", async () => {
    memoryDb([senderRow({ enabled: false })]);
    const result = await storeOwnerCaller().emailSetup.sendTest();
    expect(result).toMatchObject({ ok: false });
    expect(String(result.error)).toMatch(/not configured and enabled/i);
    expect(createTransport).not.toHaveBeenCalled();
  });
});

describe("customer-facing delivery", () => {
  it("sends an invoice from the affiliate's own mailbox and copies Cabinet Dealz", async () => {
    memoryDb([senderRow()]);
    const { sendAffiliateCustomerEmail } = await import("../lib/affiliateSender");
    const { getDb } = await import("../db");
    const db = (await getDb())!;

    const result = await sendAffiliateCustomerEmail(db, {
      affiliateId: 7,
      to: "customer@example.test",
      subject: "Rich's invoice INV-1",
      text: "Your invoice is attached.",
      html: "<p>Your invoice is attached.</p>",
      attachments: [{ filename: "INV-1.pdf", content: Buffer.from("%PDF"), contentType: "application/pdf" }],
      invoice: true,
    });

    expect(result).toMatchObject({
      success: true,
      transport: "affiliate_smtp",
      viaAffiliate: true,
      invoiceCopyTo: ADMIN_COPY,
    });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.mail.yahoo.test",
      port: 465,
      secure: true,
    }));
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0] as {
      from: string;
      to: string;
      bcc: unknown;
      replyTo: string;
      attachments: unknown[];
    };
    expect(message.from).toBe(`"Rich's" <richnseliena@yahoo.test>`);
    expect(message.to).toBe("customer@example.test");
    expect(message.bcc).toEqual([ADMIN_COPY]);
    expect(message.replyTo).toBe("richnseliena@yahoo.test");
    expect(message.attachments).toHaveLength(1);
  });

  it("uses the affiliate's own invoice-copy address when one is saved", async () => {
    memoryDb([senderRow({ invoiceCopyEmail: "accounting@richs.test" })]);
    const { sendAffiliateCustomerEmail } = await import("../lib/affiliateSender");
    const { getDb } = await import("../db");
    const db = (await getDb())!;

    await sendAffiliateCustomerEmail(db, {
      affiliateId: 7,
      to: "customer@example.test",
      subject: "Invoice",
      text: "Attached.",
      html: "<p>Attached.</p>",
      invoice: true,
    });
    expect((sendMail.mock.calls[0][0] as { bcc: unknown }).bcc).toEqual(["accounting@richs.test"]);
  });

  it("does not copy Cabinet Dealz on a non-invoice customer message", async () => {
    memoryDb([senderRow()]);
    const { sendAffiliateCustomerEmail } = await import("../lib/affiliateSender");
    const { getDb } = await import("../db");
    const db = (await getDb())!;

    await sendAffiliateCustomerEmail(db, {
      affiliateId: 7,
      to: "customer@example.test",
      subject: "Your quote",
      text: "Quote attached.",
      html: "<p>Quote attached.</p>",
    });
    const message = sendMail.mock.calls[0][0] as { bcc: unknown };
    expect(message.bcc).toBeUndefined();
  });

  it("falls back to the platform sender for an affiliate with no mailbox", async () => {
    memoryDb([]);
    vi.stubEnv("RESEND_API_KEY", "re_test_not_live");
    vi.stubEnv("ORDER_EMAIL_FROM", PLATFORM_FROM);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendAffiliateCustomerEmail } = await import("../lib/affiliateSender");
    const { getDb } = await import("../db");
    const db = (await getDb())!;

    const result = await sendAffiliateCustomerEmail(db, {
      affiliateId: 7,
      to: "customer@example.test",
      subject: "Invoice",
      text: "Attached.",
      html: "<p>Attached.</p>",
      invoice: true,
    });

    expect(result).toMatchObject({ success: true, transport: "resend", viaAffiliate: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.from).toBe(PLATFORM_FROM);
    // Cabinet Dealz is still copied on an invoice that the platform delivered.
    expect(body.bcc).toEqual([ADMIN_COPY]);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("falls back to the platform sender when the saved password cannot be decrypted", async () => {
    memoryDb([senderRow({ smtpPass: "cabinetdealz:smtp:v1:broken.broken.broken" })]);
    vi.stubEnv("RESEND_API_KEY", "re_test_not_live");
    vi.stubEnv("ORDER_EMAIL_FROM", PLATFORM_FROM);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email_2" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendAffiliateCustomerEmail } = await import("../lib/affiliateSender");
    const { getDb } = await import("../db");
    const db = (await getDb())!;

    const result = await sendAffiliateCustomerEmail(db, {
      affiliateId: 7,
      to: "customer@example.test",
      subject: "Invoice",
      text: "Attached.",
      html: "<p>Attached.</p>",
      invoice: true,
    });
    expect(result).toMatchObject({ success: true, viaAffiliate: false });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("returns the provider error instead of silently sending as Cabinet Dealz", async () => {
    memoryDb([senderRow()]);
    sendMail.mockRejectedValue(Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" }));
    const { sendAffiliateCustomerEmail } = await import("../lib/affiliateSender");
    const { getDb } = await import("../db");
    const db = (await getDb())!;

    const result = await sendAffiliateCustomerEmail(db, {
      affiliateId: 7,
      to: "customer@example.test",
      subject: "Invoice",
      text: "Attached.",
      html: "<p>Attached.</p>",
      invoice: true,
    });
    expect(result).toMatchObject({ success: false, transport: "affiliate_smtp" });
    expect(String(result.error)).toContain("ETIMEDOUT");
    // No second attempt on the platform path.
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("uses the affiliate SMTP sender type from the shared email service", async () => {
    const { sendViaAffiliateSmtp } = await import("../email");
    const sender: AffiliateSmtpSender = {
      host: "smtp.mail.yahoo.test",
      port: 587,
      secure: false,
      user: "richnseliena@yahoo.test",
      pass: STORE_PASSWORD,
      from: "richnseliena@yahoo.test",
      fromName: "Rich's",
    };
    const result = await sendViaAffiliateSmtp(sender, {
      to: "customer@example.test",
      subject: "Hello",
      text: "Hi",
    });
    expect(result).toMatchObject({ success: true, transport: "affiliate_smtp", from: `"Rich's" <richnseliena@yahoo.test>` });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false }));
  });
});
