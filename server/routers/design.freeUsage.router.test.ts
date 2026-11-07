/**
 * The free-use cap at the router boundary: the sixth new design and the sixth
 * Auto Design run are refused for an affiliate without an active membership, and
 * a paid affiliate or a plain customer is still unlimited.
 *
 * The routers run for real against in-memory rows. Only the affiliate identity
 * lookup is stubbed, because that is the one thing the cap keys off.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  affiliateFreeUsage,
  affiliates,
  kitchenDesigns,
} from "../../drizzle/schema";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { memoryStore, type Row } from "../lib/__testDb";

const { getDbMock, accessMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  accessMock: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: getDbMock,
  notInConflict: () => undefined,
  getPricingSettings: async () => ({}),
  getPlatformPricingSettings: async () => ({}),
}));
vi.mock("../lib/affiliateAccess", () => ({
  resolveAffiliateAccess: accessMock,
  loadAffiliateResolution: async () => ({
    access: null,
    ambiguousAffiliateIds: [],
    link: null,
  }),
}));
// The CRM address check calls Google; in a test it simply does not verify.
vi.mock("../lib/addressVerification", () => ({
  verifyUsAddress: async () => ({
    verified: false,
    status: "unverified",
    formatted: null,
    normalized: null,
    reason: "test",
  }),
  formatEnteredAddress: () => "100 Test Street, Testville, FL 34201",
}));

const UNPAID_AFFILIATE = {
  id: 61,
  slug: "unpaid-store",
  storeName: "Unpaid Store",
  status: "active",
  referralCode: "UNPAID",
  storefrontEnabled: true,
  membershipStatus: "pending",
};
const PAID_AFFILIATE = {
  id: 62,
  slug: "paid-store",
  storeName: "Paid Store",
  status: "active",
  referralCode: "PAID",
  storefrontEnabled: true,
  membershipStatus: "active",
};

const UNPAID_OWNER = {
  id: 8101,
  email: "unpaid-owner@example.test",
  role: "user",
};
const PAID_OWNER = { id: 8102, email: "paid-owner@example.test", role: "user" };
const CUSTOMER = { id: 8103, email: "shopper@example.test", role: "user" };

const CUSTOMER_CONTACT = {
  name: "Cap Customer",
  email: "cap-customer@example.test",
  phone: "555-010-0142",
  address: {
    line1: "100 Test Street",
    city: "Testville",
    state: "FL",
    zip: "34201",
  },
};

let tables: Map<unknown, Row[]>;

function seed() {
  tables = new Map<unknown, Row[]>([
    [affiliates, [UNPAID_AFFILIATE, PAID_AFFILIATE]],
    [kitchenDesigns, []],
    [affiliateFreeUsage, []],
  ]);
  getDbMock.mockResolvedValue(memoryStore(tables));
}

function caller(user: { id: number; email: string; role: string }) {
  return appRouter.createCaller({
    user: {
      id: user.id,
      openId: `free-usage-${user.id}`,
      name: `Free Usage ${user.id}`,
      email: user.email,
      role: user.role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: { host: "www.cabinetdealz.com" },
    } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext);
}

function newDesign(name: string) {
  return {
    customer: CUSTOMER_CONTACT,
    name,
    affiliateSlug: "owner",
    roomData: { width: 120, depth: 120 },
    placedCabinets: [] as unknown[],
  };
}

function ledger() {
  return tables.get(affiliateFreeUsage) ?? [];
}

describe("affiliate free-use cap at the design.save boundary", () => {
  beforeEach(() => {
    seed();
    accessMock.mockReset();
  });

  it("allows five new designs and refuses the sixth with FORBIDDEN / MEMBERSHIP_REQUIRED", async () => {
    accessMock.mockResolvedValue({
      affiliateId: UNPAID_AFFILIATE.id,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: null,
    });
    const design = caller(UNPAID_OWNER);

    for (let index = 1; index <= 5; index += 1) {
      const saved = await design.design.save(newDesign(`Free plan ${index}`));
      expect(saved.id).toBeGreaterThan(0);
      expect(saved.usage).toMatchObject({
        enforced: true,
        used: index,
        remaining: 5 - index,
      });
    }
    expect(ledger()).toHaveLength(5);
    expect(
      ledger().every(
        row => row.kind === "design" && row.affiliateId === UNPAID_AFFILIATE.id
      )
    ).toBe(true);

    let refused: unknown;
    try {
      await design.design.save(newDesign("Sixth plan"));
    } catch (error) {
      refused = error;
    }
    const error = refused as {
      code?: string;
      message?: string;
      cause?: { message?: string };
    };
    expect(error?.code).toBe("FORBIDDEN");
    expect(error?.cause?.message).toBe("MEMBERSHIP_REQUIRED");
    expect(error?.message).toMatch(/buy the affiliate membership/i);
    // Nothing was created and no sixth use was written.
    expect(tables.get(kitchenDesigns)).toHaveLength(5);
    expect(ledger()).toHaveLength(5);
  });

  it("reports used and remaining through design.usage", async () => {
    accessMock.mockResolvedValue({
      affiliateId: UNPAID_AFFILIATE.id,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: null,
    });
    const design = caller(UNPAID_OWNER);
    await design.design.save(newDesign("Counting plan"));
    await design.design.startAutoDesign({
      affiliateSlug: "owner",
      layoutType: "l-shape",
    });

    const usage = await design.design.usage();
    expect(usage).toMatchObject({
      enforced: true,
      unlimited: false,
      limit: 5,
      used: 2,
      remaining: 3,
      membershipStatus: "pending",
    });
    expect(usage.byKind).toEqual({
      design: 1,
      auto_design: 1,
      photo_render: 0,
    });
    expect(usage.notice).toContain("3 of 5 free uses left");
  });

  it("counts Auto Design and saved designs against the same five", async () => {
    accessMock.mockResolvedValue({
      affiliateId: UNPAID_AFFILIATE.id,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: null,
    });
    const design = caller(UNPAID_OWNER);
    for (let index = 0; index < 3; index += 1) {
      await design.design.startAutoDesign({
        affiliateSlug: "owner",
        layoutType: "u-shape",
      });
    }
    await design.design.save(newDesign("Plan A"));
    await design.design.save(newDesign("Plan B"));

    await expect(
      design.design.startAutoDesign({ affiliateSlug: "owner" })
    ).rejects.toThrow(/buy the affiliate membership/i);
    await expect(design.design.save(newDesign("Plan C"))).rejects.toThrow(
      /buy the affiliate membership/i
    );
    expect(ledger()).toHaveLength(5);
  });

  it("hands an Auto Design use back when the run was abandoned", async () => {
    accessMock.mockResolvedValue({
      affiliateId: UNPAID_AFFILIATE.id,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: null,
    });
    const design = caller(UNPAID_OWNER);
    const started = await design.design.startAutoDesign({
      affiliateSlug: "owner",
    });
    expect(started.usage).toMatchObject({ used: 1, remaining: 4 });
    const released = await design.design.releaseAutoDesign({
      claimId: started.claimId,
    });
    expect(released).toMatchObject({ used: 0, remaining: 5 });
    expect(ledger()).toHaveLength(0);
  });

  it("never counts a design edit against the cap", async () => {
    accessMock.mockResolvedValue({
      affiliateId: UNPAID_AFFILIATE.id,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: null,
    });
    const design = caller(UNPAID_OWNER);
    const saved = await design.design.save(newDesign("Editable plan"));
    const edited = await design.design.save({
      ...newDesign("Editable plan"),
      id: saved.id,
    });
    expect(edited.id).toBe(saved.id);
    expect(edited.usage).toMatchObject({ used: 1, remaining: 4 });
    expect(ledger()).toHaveLength(1);
  });

  it("is unlimited for an affiliate whose membership is active", async () => {
    accessMock.mockResolvedValue({
      affiliateId: PAID_AFFILIATE.id,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: null,
    });
    const design = caller(PAID_OWNER);
    for (let index = 1; index <= 8; index += 1) {
      const saved = await design.design.save(newDesign(`Paid plan ${index}`));
      expect(saved.usage).toMatchObject({
        enforced: false,
        unlimited: true,
        limit: null,
        remaining: null,
      });
    }
    await design.design.startAutoDesign({ affiliateSlug: "owner" });
    expect(ledger()).toHaveLength(0);
  });

  it("does not affect a customer who is not an affiliate", async () => {
    accessMock.mockResolvedValue(null);
    const design = caller(CUSTOMER);
    for (let index = 1; index <= 7; index += 1) {
      await design.design.save(newDesign(`Customer plan ${index}`));
    }
    const usage = await design.design.usage();
    expect(usage).toMatchObject({
      enforced: false,
      unlimited: true,
      remaining: null,
    });
    expect(ledger()).toHaveLength(0);
  });

  it("leaves an admin alone", async () => {
    accessMock.mockResolvedValue({
      affiliateId: UNPAID_AFFILIATE.id,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: null,
    });
    const admin = caller({
      id: 8104,
      email: "admin@example.test",
      role: "admin",
    });
    for (let index = 1; index <= 6; index += 1) {
      await admin.design.save(newDesign(`Admin plan ${index}`));
    }
    expect(ledger()).toHaveLength(0);
  });
});
