import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock, accessMock, notifyOwnerMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  accessMock: vi.fn(),
  notifyOwnerMock: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../lib/affiliateAccess", () => ({ resolveAffiliateAccess: accessMock }));
vi.mock("../_core/notification", () => ({ notifyOwner: notifyOwnerMock }));

import { appRouter } from "../routers";
import { resetVendorReferralRateLimitForTests } from "./vendorReferrals";

const affiliateUser = { id: 9, role: "partner", email: "owner@shop.test", openId: "aff" };
const teamUser = { id: 10, role: "user", email: "rep@shop.test", openId: "team" };
const plainUser = { id: 11, role: "user", email: "guest@example.com", openId: "user" };
const adminUser = { id: 1, role: "admin", email: "admin@example.com", openId: "admin" };

function caller(user: typeof affiliateUser | null) {
  return appRouter.createCaller({ user, req: { headers: {} }, res: {} } as never);
}

function chain(result: unknown) {
  const builder = {
    from: () => builder,
    leftJoin: () => builder,
    where: () => builder,
    orderBy: async () => result,
    limit: async () => result,
  };
  return builder;
}

describe("vendorReferrals", () => {
  let inserted: Record<string, unknown> | null;
  let affectedRows: number;

  beforeEach(() => {
    inserted = null;
    affectedRows = 1;
    resetVendorReferralRateLimitForTests();
    delete process.env.OWNER_EMAIL;
    accessMock.mockReset();
    notifyOwnerMock.mockReset();
    notifyOwnerMock.mockResolvedValue(true);
    accessMock.mockResolvedValue({
      affiliateId: 42,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      teamMemberId: null,
    });
    getDbMock.mockResolvedValue({
      select: () => chain([{ storeName: "North Shore Cabinets" }]),
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          inserted = values;
          return [{ insertId: 77 }];
        },
      }),
      update: () => ({
        set: () => ({
          where: async () => [{ affectedRows }],
        }),
      }),
    });
  });

  it("rejects a signed-out caller", async () => {
    await expect(
      caller(null).vendorReferrals.submit({ vendorName: "Acme", email: "a@acme.test" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a signed-in user who is not an affiliate or team member", async () => {
    accessMock.mockResolvedValue(null);
    await expect(
      caller(plainUser).vendorReferrals.submit({ vendorName: "Acme", email: "a@acme.test" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(inserted).toBeNull();
  });

  it("saves a referral for an affiliate owner and returns the id", async () => {
    process.env.OWNER_EMAIL = "ops@example.com";
    const result = await caller(affiliateUser).vendorReferrals.submit({
      vendorName: "  Acme Millwork  ",
      contactName: " Pat ",
      email: "pat@acme.test",
      notes: "Met at the spring show.",
    });
    expect(result).toEqual({ id: 77 });
    expect(inserted).toMatchObject({
      affiliateId: 42,
      submittedByUserId: 9,
      vendorName: "Acme Millwork",
      contactName: "Pat",
      email: "pat@acme.test",
      phone: null,
      notes: "Met at the spring show.",
    });
    expect(notifyOwnerMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Vendor referral: Acme Millwork",
    }));
    const content = String(notifyOwnerMock.mock.calls[0][0].content);
    expect(content).toContain("North Shore Cabinets");
    expect(content).not.toMatch(/@gmail\.com/);
  });

  it("accepts a team member referral that has a phone and no email", async () => {
    accessMock.mockResolvedValue({
      affiliateId: 42,
      isOwner: false,
      accessCrm: false,
      accessDesigner: false,
      teamMemberId: 5,
    });
    const result = await caller(teamUser).vendorReferrals.submit({
      vendorName: "Harbor Hardware",
      phone: " 555-0100 ",
    });
    expect(result).toEqual({ id: 77 });
    expect(inserted).toMatchObject({
      affiliateId: 42,
      submittedByUserId: 10,
      phone: "555-0100",
      email: null,
    });
  });

  it("requires a vendor name and at least one of email or phone", async () => {
    await expect(
      caller(affiliateUser).vendorReferrals.submit({ vendorName: "   ", email: "a@acme.test" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller(affiliateUser).vendorReferrals.submit({ vendorName: "Acme" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller(affiliateUser).vendorReferrals.submit({ vendorName: "Acme", email: "", phone: "   " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller(affiliateUser).vendorReferrals.submit({ vendorName: "Acme", email: "not-an-email", phone: "555-0100" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller(affiliateUser).vendorReferrals.submit({ vendorName: "A".repeat(201), email: "a@acme.test" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller(affiliateUser).vendorReferrals.submit({
        vendorName: "Acme",
        email: "a@acme.test",
        notes: "n".repeat(2001),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(inserted).toBeNull();
  });

  it("rate-limits repeated referrals from the same affiliate", async () => {
    const submit = () => caller(affiliateUser).vendorReferrals.submit({
      vendorName: "Acme",
      email: "a@acme.test",
    });
    for (let i = 0; i < 10; i += 1) await submit();
    await expect(submit()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("skips the admin email when no recipient is configured", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await caller(affiliateUser).vendorReferrals.submit({ vendorName: "Acme", phone: "555-0100" });
    expect(notifyOwnerMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/no admin recipient is configured/i));
    info.mockRestore();
  });

  it("rejects non-admins from the admin list and status update", async () => {
    await expect(caller(null).vendorReferrals.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(plainUser).vendorReferrals.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(affiliateUser).vendorReferrals.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller(plainUser).vendorReferrals.adminUpdateStatus({ id: 7, status: "contacted" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller(affiliateUser).vendorReferrals.adminUpdateStatus({ id: 7, status: "onboarded" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns referrals for an admin and updates status", async () => {
    const createdAt = new Date("2026-10-01T00:00:00.000Z");
    getDbMock.mockResolvedValue({
      select: () => chain([{
        id: 3,
        affiliateId: 42,
        affiliateName: "North Shore Cabinets",
        vendorName: "Acme",
        contactName: null,
        email: "a@acme.test",
        phone: null,
        notes: null,
        status: "new",
        createdAt,
      }]),
      update: () => ({
        set: () => ({
          where: async () => [{ affectedRows: 1 }],
        }),
      }),
    });
    const rows = await caller(adminUser).vendorReferrals.adminList();
    expect(rows).toEqual([{
      id: 3,
      affiliateId: 42,
      affiliateName: "North Shore Cabinets",
      vendorName: "Acme",
      contactName: null,
      email: "a@acme.test",
      phone: null,
      notes: null,
      status: "new",
      createdAt,
    }]);
    await expect(
      caller(adminUser).vendorReferrals.adminUpdateStatus({ id: 3, status: "declined" }),
    ).resolves.toEqual({ id: 3, status: "declined" });
    await expect(
      caller(adminUser).vendorReferrals.adminUpdateStatus({ id: 3, status: "maybe" as "new" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("reports a missing referral when an admin updates an unknown id", async () => {
    getDbMock.mockResolvedValue({
      select: () => chain([]),
      update: () => ({
        set: () => ({
          where: async () => [{ affectedRows: 0 }],
        }),
      }),
    });
    await expect(
      caller(adminUser).vendorReferrals.adminUpdateStatus({ id: 99, status: "contacted" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("vendor referral migration", () => {
  it("follows 0219 in the journal and snapshot chain", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
      entries: Array<{ idx: number; when: number; tag: string }>;
    };
    const referralIndex = journal.entries.findIndex((entry) => entry.tag === "0220_vendor_referrals");
    expect(referralIndex).toBeGreaterThan(0);
    const previous = journal.entries[referralIndex - 1];
    const referral = journal.entries[referralIndex];
    const onboarding = journal.entries[referralIndex + 1];
    const roomScene = journal.entries[referralIndex + 2];
    expect(previous).toMatchObject({ idx: 218, when: 1794000000000, tag: "0219_w9_tax_id_at_rest" });
    expect(referral).toMatchObject({ idx: 219, when: 1794100000000, tag: "0220_vendor_referrals" });
    expect(onboarding).toMatchObject({
      idx: 220,
      when: 1794200000000,
      tag: "0221_vendor_onboarding_exceptions",
    });
    expect(roomScene).toMatchObject({
      idx: 221,
      when: 1794300000000,
      tag: "0222_door_style_auto_room_scene",
    });
    const previousSnapshot = JSON.parse(readFileSync("drizzle/meta/0219_snapshot.json", "utf8")) as { id: string };
    const snapshot = JSON.parse(readFileSync("drizzle/meta/0220_snapshot.json", "utf8")) as {
      id: string;
      prevId: string;
      tables: Record<string, { indexes: Record<string, { columns: string[] }> }>;
    };
    expect(snapshot.prevId).toBe(previousSnapshot.id);
    expect(snapshot.prevId).toBe("52aac6dc-0a8f-4ed6-a8b4-6dece343dd2c");
    expect(snapshot.tables.vendor_referrals.indexes.vendor_referrals_status_created_idx.columns).toEqual(["status", "createdAt"]);
    expect(snapshot.tables.vendor_referrals.indexes.vendor_referrals_affiliate_idx.columns).toEqual(["affiliateId"]);
    const onboardingSnapshot = JSON.parse(readFileSync("drizzle/meta/0221_snapshot.json", "utf8")) as {
      id: string;
      prevId: string;
    };
    expect(onboardingSnapshot.id).toBe("bc462012-e6f2-46ea-addb-cbfde6ed0879");
    expect(onboardingSnapshot.prevId).toBe(snapshot.id);
    expect(onboardingSnapshot.prevId).toBe("b7b7a418-56a7-4313-b8bd-e770017d1e69");
    const roomSceneSnapshot = JSON.parse(readFileSync("drizzle/meta/0222_snapshot.json", "utf8")) as {
      id: string;
      prevId: string;
    };
    expect(roomSceneSnapshot.id).toBe("22302ac7-6395-4d6d-95ad-0a53f119940d");
    expect(roomSceneSnapshot.prevId).toBe(onboardingSnapshot.id);
  });
});
