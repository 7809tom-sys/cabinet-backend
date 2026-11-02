/**
 * The frontend dashboard contract (cabinet-frontend PR 232).
 *
 * `affiliateEmailSettings.get / update / sendTest` must work with the field
 * names that dashboard already sends and reads, using the same authorization
 * and the same stored row as `crm.emailSetup.*`.
 *
 * Safety: getDb is an in-memory table map, nodemailer is a stub, and every host
 * is a *.test name, so no SMTP server, database, or mailbox is contacted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { affiliateEmailSettings, affiliates } from "../../drizzle/schema";

const { getDbMock, accessMock, createTransport, sendMail, verify } = vi.hoisted(() => {
  process.env.JWT_SECRET ||= "test-only-encryption-key-for-affiliate-sender";
  process.env.CABINETDEALZ_ADMIN_EMAIL ||= "admin@cabinetdealz.test";
  return { getDbMock: vi.fn(), accessMock: vi.fn(), createTransport: vi.fn(), sendMail: vi.fn(), verify: vi.fn() };
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

import { affiliateEmailSettingsRouter } from "./affiliateEmailSettings";
import { crmEmailRouter } from "./crmEmail";
import { encryptEmailSettingsPassword } from "../lib/emailSettingsCrypto";
import {
  affiliateEmailSettingsConfigured,
  affiliateEmailSettingsSecure,
  normalizeAppPassword,
  secureForProvider,
  toAffiliateEmailSettingsProvider,
  toAffiliateEmailSettingsView,
  toNativeSenderColumns,
} from "@shared/affiliateEmailSettingsContract";

const STORE_PASSWORD = "rich-yahoo-app-password";
const STORE = "richnseliena@yahoo.test";
const ADMIN_COPY = "admin@cabinetdealz.test";

type Row = Record<string, unknown>;

function predicateValue(predicate: unknown): number | null {
  const chunks = (predicate as { queryChunks?: { value?: unknown }[] } | null)?.queryChunks;
  if (!chunks) return null;
  for (const chunk of chunks) {
    const value = (chunk as { value?: unknown })?.value;
    if (typeof value === "number") return value;
  }
  return null;
}

function memoryDb(rows: Row[], storeExists = true) {
  const table = rows;
  const db = {
    select: (projection?: Record<string, unknown>) => ({
      from: (source: unknown) => {
        if (source === affiliates) {
          const storeRows = storeExists ? [{ id: 7 }] : [];
          return {
            where: () => ({ limit: (count: number) => Promise.resolve(storeRows.slice(0, count)) }),
            limit: (count: number) => Promise.resolve(storeRows.slice(0, count)),
          };
        }
        const build = (predicate?: unknown) => {
          const target = predicateValue(predicate);
          const matched = target == null ? table : table.filter((row) => row.affiliateId === target || row.id === target);
          return {
            limit: (count: number) => Promise.resolve(matched.slice(0, count)),
            orderBy: () => Promise.resolve(matched),
            then: (resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) =>
              Promise.resolve(matched).then(resolve, reject),
          };
        };
        void projection;
        return {
          where: (predicate: unknown) => build(predicate),
          limit: (count: number) => Promise.resolve(table.slice(0, count)),
          orderBy: () => Promise.resolve(table),
          then: (resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve(table).then(resolve, reject),
        };
      },
    }),
    update: (source: unknown) => ({
      set: (patch: Row) => ({
        where: async (predicate: unknown) => {
          if (source !== affiliateEmailSettings) return;
          const target = predicateValue(predicate);
          for (const row of table) {
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
  return table;
}

function senderRow(overrides: Row = {}): Row {
  return {
    id: 1,
    affiliateId: 7,
    provider: "yahoo",
    contactEmail: STORE,
    smtpHost: "smtp.mail.yahoo.test",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: STORE,
    smtpPass: encryptEmailSettingsPassword(STORE_PASSWORD),
    smtpFrom: STORE,
    fromName: "Rich's Building Supply",
    replyTo: "hello@richs.test",
    invoiceCopyEmail: "accounting@richs.test",
    signatureHtml: "<p>Thanks</p>",
    enabled: true,
    lastTestedAt: null,
    lastTestOk: null,
    lastTestError: null,
    ...overrides,
  };
}

function ownerCaller() {
  accessMock.mockResolvedValue({
    affiliateId: 7,
    isOwner: true,
    accessCrm: true,
    accessDesigner: true,
    accessMarketing: true,
    teamMemberId: null,
  });
  return affiliateEmailSettingsRouter.createCaller({
    user: { id: 12, email: "owner@richs.test", role: "partner" },
  } as never);
}

function adminCaller() {
  return affiliateEmailSettingsRouter.createCaller({
    user: { id: 1, email: "admin@cabinetdealz.test", role: "admin" },
  } as never);
}

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
  sendMail.mockResolvedValue({ messageId: "smtp-contract-1" });
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

describe("contract mapping", () => {
  it("projects the stored row onto the dashboard's field names without the password", () => {
    const view = toAffiliateEmailSettingsView(
      {
        affiliateId: 7,
        provider: "yahoo",
        contactEmail: STORE,
        smtpHost: "smtp.mail.yahoo.com",
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: STORE,
        smtpPass: "cabinetdealz:smtp:v1:ciphertext",
        enabled: true,
        lastTestedAt: new Date("2026-11-02T12:00:00Z"),
        lastTestOk: true,
      },
      { affiliateId: 7, canEdit: true },
    );
    expect(view).toEqual({
      affiliateId: 7,
      email: STORE,
      provider: "yahoo",
      smtpHost: "smtp.mail.yahoo.com",
      smtpPort: 465,
      secure: true,
      username: STORE,
      enabled: true,
      hasAppPassword: true,
      configured: true,
      canEdit: true,
      lastTestedAt: "2026-11-02T12:00:00.000Z",
      lastTestOk: true,
    });
    expect(JSON.stringify(view)).not.toContain("ciphertext");
  });

  it("describes an absent row as unconfigured and never as editable-looking", () => {
    const view = toAffiliateEmailSettingsView(null, { affiliateId: 7, canEdit: true });
    expect(view).toMatchObject({
      affiliateId: 7,
      email: "",
      provider: "custom",
      smtpPort: 587,
      secure: false,
      enabled: false,
      hasAppPassword: false,
      configured: false,
      lastTestedAt: null,
      lastTestOk: null,
    });
  });

  it("keeps 465 on SSL and 587 on STARTTLS", () => {
    expect(affiliateEmailSettingsSecure(465, undefined)).toBe(true);
    expect(affiliateEmailSettingsSecure(587, undefined)).toBe(false);
    expect(affiliateEmailSettingsSecure(587, true)).toBe(true);
  });

  it("pins the TLS mode to the preset except for Custom", () => {
    expect(secureForProvider("yahoo", false)).toBe(true);
    expect(secureForProvider("outlook", true)).toBe(false);
    expect(secureForProvider("custom", true)).toBe(true);
  });

  it("strips Google's spaces from an app password", () => {
    expect(normalizeAppPassword("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
    expect(normalizeAppPassword(undefined)).toBe("");
  });

  it("falls back to Custom for an unknown provider", () => {
    expect(toAffiliateEmailSettingsProvider("aol")).toBe("custom");
    expect(toAffiliateEmailSettingsProvider("Yahoo")).toBe("yahoo");
  });

  it("needs an address, a host, a username, and a password to be configured", () => {
    const base = { affiliateId: 7, provider: "yahoo", contactEmail: STORE, smtpHost: "h.test", smtpPort: 465, smtpUser: STORE, smtpPass: "x" };
    expect(affiliateEmailSettingsConfigured(base)).toBe(true);
    expect(affiliateEmailSettingsConfigured({ ...base, smtpPass: "" })).toBe(false);
    expect(affiliateEmailSettingsConfigured({ ...base, smtpHost: " " })).toBe(false);
    expect(affiliateEmailSettingsConfigured(null)).toBe(false);
  });

  it("maps an update input onto the native columns", () => {
    expect(toNativeSenderColumns({
      affiliateId: 7,
      email: `  ${STORE}  `,
      provider: "yahoo",
      smtpHost: " smtp.mail.yahoo.com ",
      smtpPort: 465,
      secure: false,
      username: ` ${STORE} `,
      enabled: true,
    })).toEqual({
      provider: "yahoo",
      contactEmail: STORE,
      smtpHost: "smtp.mail.yahoo.com",
      smtpPort: 465,
      // Yahoo's preset pins SSL even though the caller sent secure: false.
      smtpSecure: true,
      smtpUser: STORE,
      enabled: true,
    });
  });
});

describe("affiliateEmailSettings.get", () => {
  it("returns the dashboard view for the owner's own store", async () => {
    memoryDb([senderRow()]);
    const view = await ownerCaller().get({ affiliateId: 7 });
    expect(view).toMatchObject({
      affiliateId: 7,
      email: STORE,
      provider: "yahoo",
      smtpHost: "smtp.mail.yahoo.test",
      smtpPort: 465,
      secure: true,
      username: STORE,
      enabled: true,
      hasAppPassword: true,
      configured: true,
      canEdit: true,
    });
    expect(view).not.toHaveProperty("appPassword");
    expect(JSON.stringify(view)).not.toContain(STORE_PASSWORD);
  });

  it("returns an unconfigured view instead of null when nothing is saved", async () => {
    memoryDb([]);
    const view = await ownerCaller().get({ affiliateId: 7 });
    expect(view).toMatchObject({ affiliateId: 7, configured: false, hasAppPassword: false, email: "" });
  });

  it("refuses another store even when the caller names it", async () => {
    memoryDb([senderRow(), senderRow({ id: 2, affiliateId: 9, contactEmail: "other@shop.test", smtpUser: "other@shop.test" })]);
    await expect(ownerCaller().get({ affiliateId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets a platform admin read any store", async () => {
    memoryDb([senderRow()]);
    const view = await adminCaller().get({ affiliateId: 7 });
    expect(view.affiliateId).toBe(7);
    expect(JSON.stringify(view)).not.toContain(STORE_PASSWORD);
  });

  it("returns NOT_FOUND when an admin names a store that does not exist", async () => {
    memoryDb([], false);
    await expect(adminCaller().get({ affiliateId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("affiliateEmailSettings.update", () => {
  const payload = {
    affiliateId: 7,
    email: STORE,
    provider: "yahoo" as const,
    smtpHost: "smtp.mail.yahoo.test",
    smtpPort: 465,
    secure: true,
    username: STORE,
    enabled: true,
  };

  it("encrypts a supplied app password and returns only hasAppPassword", async () => {
    const rows = memoryDb([]);
    const view = await ownerCaller().update({ ...payload, appPassword: STORE_PASSWORD });
    expect(view).toMatchObject({ affiliateId: 7, hasAppPassword: true, configured: true, enabled: true });
    expect(String(rows[0].smtpPass)).toMatch(/^cabinetdealz:smtp:v1:/);
    expect(String(rows[0].smtpPass)).not.toContain(STORE_PASSWORD);
    expect(JSON.stringify(view)).not.toContain(STORE_PASSWORD);
  });

  it("keeps the stored password when appPassword is omitted", async () => {
    const rows = memoryDb([senderRow()]);
    const before = String(rows[0].smtpPass);
    const view = await ownerCaller().update({ ...payload, smtpPort: 587, secure: false });
    expect(rows[0].smtpPass).toBe(before);
    expect(view).toMatchObject({ hasAppPassword: true, smtpPort: 587 });
  });

  it("treats a whitespace-only app password as no change", async () => {
    const rows = memoryDb([senderRow()]);
    const before = String(rows[0].smtpPass);
    await ownerCaller().update({ ...payload, appPassword: "   " });
    expect(rows[0].smtpPass).toBe(before);
  });

  it("strips Google's spaces before encrypting", async () => {
    const rows = memoryDb([]);
    await ownerCaller().update({
      ...payload,
      provider: "gmail",
      smtpHost: "smtp.gmail.test",
      appPassword: "abcd efgh ijkl mnop",
    });
    const stored = String(rows[0].smtpPass);
    const { decryptEmailSettingsPassword } = await import("../lib/emailSettingsCrypto");
    expect(decryptEmailSettingsPassword(stored)).toBe("abcdefghijklmnop");
  });

  it("preserves CRM-only fields the dashboard does not send", async () => {
    const rows = memoryDb([senderRow()]);
    await ownerCaller().update({ ...payload, appPassword: "new-app-password" });
    // The signature, reply-to, from name, and invoice copy survive a save from
    // the simpler dashboard form.
    expect(rows[0]).toMatchObject({
      fromName: "Rich's Building Supply",
      replyTo: "hello@richs.test",
      invoiceCopyEmail: "accounting@richs.test",
      signatureHtml: "<p>Thanks</p>",
    });
  });

  it("requires a password on the first save that enables sending", async () => {
    memoryDb([]);
    await expect(ownerCaller().update(payload)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires a valid email address", async () => {
    memoryDb([senderRow()]);
    await expect(ownerCaller().update({ ...payload, email: "not-an-email" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a save against another store", async () => {
    memoryDb([senderRow(), senderRow({ id: 2, affiliateId: 9 })]);
    await expect(ownerCaller().update({ ...payload, affiliateId: 9 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a team member even with CRM access", async () => {
    memoryDb([senderRow()]);
    accessMock.mockResolvedValue({
      affiliateId: 7,
      isOwner: false,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: false,
      teamMemberId: 3,
    });
    const caller = affiliateEmailSettingsRouter.createCaller({
      user: { id: 40, email: "manager@richs.test", role: "user" },
    } as never);
    await expect(caller.update({ ...payload, appPassword: STORE_PASSWORD })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("affiliateEmailSettings.sendTest", () => {
  it("returns the dashboard's { ok, to, error } shape on success", async () => {
    memoryDb([senderRow()]);
    const result = await ownerCaller().sendTest({ affiliateId: 7 });
    expect(result).toEqual({ ok: true, to: STORE, error: null });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect((sendMail.mock.calls[0][0] as { to: string }).to).toBe(STORE);
  });

  it("returns the provider's exact error text when the login fails", async () => {
    memoryDb([senderRow()]);
    verify.mockRejectedValue(Object.assign(
      new Error("Invalid login: 535 5.7.8 [AUTHENTICATIONFAILED] Invalid credentials"),
      { code: "EAUTH" },
    ));
    const result = await ownerCaller().sendTest({ affiliateId: 7 });
    expect(result.ok).toBe(false);
    expect(result.to).toBe("");
    expect(result.error).toContain("535 5.7.8 [AUTHENTICATIONFAILED] Invalid credentials");
  });

  it("never sends to a client-supplied address", async () => {
    memoryDb([senderRow()]);
    // The input schema only accepts affiliateId; an extra `to` is dropped.
    const result = await ownerCaller().sendTest({ affiliateId: 7, to: "attacker@example.test" } as never);
    expect(result).toMatchObject({ ok: true, to: STORE });
    expect((sendMail.mock.calls[0][0] as { to: string }).to).toBe(STORE);
  });

  it("refuses a store the caller does not own", async () => {
    memoryDb([senderRow(), senderRow({ id: 2, affiliateId: 9 })]);
    await expect(ownerCaller().sendTest({ affiliateId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("alias parity with crm.emailSetup", () => {
  it("writes the same row, so either surface sees the other's save", async () => {
    const rows = memoryDb([]);
    const crmCaller = crmEmailRouter.createCaller({
      user: { id: 12, email: "owner@richs.test", role: "partner" },
    } as never);
    accessMock.mockResolvedValue({ affiliateId: 7, isOwner: true, accessCrm: true });

    await crmCaller.emailSetup.save({
      provider: "yahoo",
      contactEmail: STORE,
      smtpHost: "smtp.mail.yahoo.test",
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: STORE,
      smtpPass: STORE_PASSWORD,
      smtpFrom: STORE,
      fromName: "Rich's",
      replyTo: "",
      invoiceCopyEmail: "",
      signatureHtml: "",
      enabled: true,
    });
    expect(rows).toHaveLength(1);

    const contractView = await ownerCaller().get({ affiliateId: 7 });
    expect(contractView).toMatchObject({ affiliateId: 7, email: STORE, hasAppPassword: true, configured: true });

    const crmView = await crmCaller.emailSetup.get();
    expect(crmView.settings).toMatchObject({ affiliateId: 7, contactEmail: STORE, hasPassword: true });
    // Still one row, still no plaintext password anywhere.
    expect(rows).toHaveLength(1);
    expect(JSON.stringify([contractView, crmView])).not.toContain(STORE_PASSWORD);
  });

  it("refuses the same callers on both surfaces", async () => {
    memoryDb([senderRow()]);
    accessMock.mockResolvedValue({
      affiliateId: 7,
      isOwner: false,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: false,
      teamMemberId: 3,
    });
    const contractCaller = affiliateEmailSettingsRouter.createCaller({
      user: { id: 40, email: "manager@richs.test", role: "user" },
    } as never);
    const crmCaller = crmEmailRouter.createCaller({
      user: { id: 40, email: "manager@richs.test", role: "user" },
    } as never);
    await expect(contractCaller.get({ affiliateId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(crmCaller.emailSetup.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
