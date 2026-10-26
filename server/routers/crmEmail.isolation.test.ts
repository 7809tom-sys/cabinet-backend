import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliateEmailSettings, affiliates } from "../../drizzle/schema";

const { getDbMock, accessMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  accessMock: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../lib/affiliateAccess", () => ({ resolveAffiliateAccess: accessMock }));

import { crmEmailRouter } from "./crmEmail";
import { decryptEmailSettingsPassword, encryptEmailSettingsPassword } from "../lib/emailSettingsCrypto";
import { toPublicAffiliateEmailSettings } from "@shared/crmMailbox";

const secret = "cabinetdealz:smtp:v1:do-not-return";

function chain(rows: unknown[]) {
  const builder = Promise.resolve(rows) as Promise<unknown[]> & {
    where: () => typeof builder;
    limit: () => typeof builder;
    orderBy: () => typeof builder;
  };
  builder.where = () => builder;
  builder.limit = () => builder;
  builder.orderBy = () => builder;
  return builder;
}

function dbFor(settingsRows: unknown[], storeRows: unknown[]) {
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === affiliateEmailSettings) return chain(settingsRows);
        if (table === affiliates) return chain(storeRows);
        return chain([]);
      },
    }),
  };
}

describe("CRM email connection isolation", () => {
  it("encrypts an affiliate mailbox password before it would be stored", () => {
    const password = "affiliate-app-password";
    const encrypted = encryptEmailSettingsPassword(password);
    expect(encrypted).not.toContain(password);
    expect(decryptEmailSettingsPassword(encrypted)).toBe(password);
    const pub = toPublicAffiliateEmailSettings({
      affiliateId: 7,
      provider: "gmail",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: "store@gmail.com",
      smtpPass: encrypted,
      smtpFrom: "store@gmail.com",
      fromName: "Shop",
      replyTo: "public@shop.test",
      signatureHtml: "",
      enabled: true,
    });
    expect(JSON.stringify(pub)).not.toContain(password);
    expect(JSON.stringify(pub)).not.toContain(encrypted);
  });

  beforeEach(() => {
    accessMock.mockResolvedValue({ affiliateId: 7, accessCrm: true });
    getDbMock.mockResolvedValue(dbFor([{
      affiliateId: 7,
      provider: "gmail",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: "store@gmail.com",
      smtpPass: secret,
      smtpFrom: "store@gmail.com",
      fromName: "Shop",
      replyTo: "public@shop.test",
      signatureHtml: "",
      enabled: true,
      lastTestedAt: null,
      lastTestOk: null,
    }], [{ id: 7, storeName: "Shop", publicEmail: "public@shop.test", email: "owner@shop.test" }]));
  });

  it("does not return the stored password to the affiliate CRM", async () => {
    const caller = crmEmailRouter.createCaller({
      user: { id: 4, email: "owner@shop.test", role: "partner" },
    } as any);
    const result = await caller.emailSetup.get();
    expect(result.settings).not.toHaveProperty("smtpPass");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.settings?.hasPassword).toBe(true);
    expect(result.settings?.connected).toBe(true);
  });

  it("refuses the affiliate connection list to a non-admin", async () => {
    const caller = crmEmailRouter.createCaller({
      user: { id: 4, email: "owner@shop.test", role: "partner" },
    } as any);
    await expect(caller.emailSetup.connections()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets an admin see connection status without the password", async () => {
    const caller = crmEmailRouter.createCaller({
      user: { id: 1, email: "admin@cabinetdealz.com", role: "admin" },
    } as any);
    const rows = await caller.emailSetup.connections();
    expect(rows).toEqual([expect.objectContaining({
      affiliateId: 7,
      storeName: "Shop",
      connected: true,
      hasPassword: true,
      smtpUser: "store@gmail.com",
    })]);
    expect(JSON.stringify(rows)).not.toContain(secret);
    expect(rows[0]).not.toHaveProperty("smtpPass");
  });
});
