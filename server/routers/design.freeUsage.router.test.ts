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
  affiliateDesignGrants,
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
  email: "unpaid-owner@example.test",
  publicEmail: "unpaid-store-contact@example.test",
};
const PAID_AFFILIATE = {
  id: 62,
  slug: "paid-store",
  storeName: "Paid Store",
  status: "active",
  referralCode: "PAID",
  storefrontEnabled: true,
  membershipStatus: "active",
  email: "paid-owner@example.test",
  publicEmail: null,
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
    [affiliateDesignGrants, []],
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

describe("admin design grant through the admin endpoints", () => {
  const ADMIN_USER = {
    id: 8105,
    email: "admin@example.test",
    role: "admin",
  };

  beforeEach(() => {
    seed();
    accessMock.mockReset();
    accessMock.mockResolvedValue({
      affiliateId: UNPAID_AFFILIATE.id,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: null,
    });
  });

  function grants() {
    return tables.get(affiliateDesignGrants) ?? [];
  }

  it("grants five extra designs and reports the count and what is left", async () => {
    const admin = caller(ADMIN_USER);
    const view = await admin.design.adminGrantDesigns({
      affiliateId: UNPAID_AFFILIATE.id,
      designCount: 5,
    });
    expect(view.storeName).toBe(UNPAID_AFFILIATE.storeName);
    expect(view.grant).toMatchObject({
      designCount: 5,
      used: 0,
      remaining: 5,
    });
    expect(view.grantLine).toBe("Extra designs: 5 (5 left)");
    expect(view.grant?.grantedBy).toBe("admin@example.test");
    // Contact emails come from the affiliate's own row, not from the caller.
    expect(view.grant?.contactEmails).toEqual([
      UNPAID_AFFILIATE.email,
      UNPAID_AFFILIATE.publicEmail,
    ]);
    expect(grants()).toHaveLength(1);
  });

  it("shows the grant on the affiliate's own design.usage response", async () => {
    const admin = caller(ADMIN_USER);
    await admin.design.adminGrantDesigns({
      affiliateId: UNPAID_AFFILIATE.id,
      designCount: 5,
    });
    const design = caller(UNPAID_OWNER);
    const usage = await design.design.usage();
    expect(usage.grant).toMatchObject({ designCount: 5, remaining: 5 });
    expect(usage.grantLine).toBe("Extra designs: 5 (5 left)");
    expect(usage).toMatchObject({ used: 0, freeRemaining: 5, remaining: 10 });
  });

  it("lets the affiliate spend the free five first, then the grant", async () => {
    const admin = caller(ADMIN_USER);
    await admin.design.adminGrantDesigns({
      affiliateId: UNPAID_AFFILIATE.id,
      designCount: 5,
    });
    const design = caller(UNPAID_OWNER);

    for (let index = 1; index <= 5; index += 1) {
      const saved = await design.design.save(newDesign(`Free ${index}`));
      expect(saved.usage).toMatchObject({
        used: index,
        freeRemaining: 5 - index,
        grantRemaining: 5,
      });
    }
    expect(ledger()).toHaveLength(5);
    expect(grants()[0]?.usedSinceGrant).toBe(0);

    // The sixth design draws on the grant, not on the free five.
    const bonus = await design.design.save(newDesign("Bonus 1"));
    expect(bonus.usage).toMatchObject({
      used: 5,
      freeRemaining: 0,
      grantRemaining: 4,
      remaining: 4,
    });
    expect(bonus.usage.grantLine).toBe("Extra designs: 5 (4 left)");
    expect(ledger()).toHaveLength(5);
    expect(grants()[0]?.usedSinceGrant).toBe(1);
  });

  it("refuses only once the free five and the grant are both gone", async () => {
    const admin = caller(ADMIN_USER);
    await admin.design.adminGrantDesigns({
      affiliateId: UNPAID_AFFILIATE.id,
      designCount: 2,
    });
    const design = caller(UNPAID_OWNER);
    for (let index = 1; index <= 7; index += 1) {
      await design.design.save(newDesign(`Plan ${index}`));
    }
    expect(ledger()).toHaveLength(5);
    expect(grants()[0]?.usedSinceGrant).toBe(2);

    let refused: unknown;
    try {
      await design.design.save(newDesign("Plan 8"));
    } catch (error) {
      refused = error;
    }
    const error = refused as { code?: string; cause?: { message?: string } };
    expect(error?.code).toBe("FORBIDDEN");
    expect(error?.cause?.message).toBe("MEMBERSHIP_REQUIRED");
    expect(tables.get(kitchenDesigns)).toHaveLength(7);
  });

  it("tops the grant back up and can change the count", async () => {
    const admin = caller(ADMIN_USER);
    await admin.design.adminGrantDesigns({
      affiliateId: UNPAID_AFFILIATE.id,
      designCount: 5,
    });
    const design = caller(UNPAID_OWNER);
    for (let index = 1; index <= 10; index += 1) {
      await design.design.save(newDesign(`Plan ${index}`));
    }
    expect(grants()[0]?.usedSinceGrant).toBe(5);
    await expect(design.design.save(newDesign("Blocked"))).rejects.toThrow(
      /buy the affiliate membership/i
    );

    // Renew to the stored count.
    const renewed = await admin.design.adminRenewDesignGrant({
      affiliateId: UNPAID_AFFILIATE.id,
    });
    expect(renewed.grant).toMatchObject({ designCount: 5, remaining: 5 });
    expect(await design.design.save(newDesign("After renewal"))).toEqual(
      expect.objectContaining({ id: expect.any(Number) })
    );

    // Renew to a bigger count, then a smaller one.
    const bigger = await admin.design.adminRenewDesignGrant({
      affiliateId: UNPAID_AFFILIATE.id,
      designCount: 9,
    });
    expect(bigger.grant).toMatchObject({ designCount: 9, remaining: 9 });
    const smaller = await admin.design.adminRenewDesignGrant({
      affiliateId: UNPAID_AFFILIATE.id,
      designCount: 1,
    });
    expect(smaller.grantLine).toBe("Extra designs: 1 (1 left)");
    // One row per store, never stacked.
    expect(grants()).toHaveLength(1);
  });

  it("lets an admin view a store's grant without creating one", async () => {
    const admin = caller(ADMIN_USER);
    const empty = await admin.design.adminDesignGrant({
      affiliateId: UNPAID_AFFILIATE.id,
    });
    expect(empty).toMatchObject({
      hasGrant: false,
      grant: null,
      grantLine: null,
    });
    expect(grants()).toHaveLength(0);
  });

  it("keeps the admin grant endpoints admin-only", async () => {
    const owner = caller(UNPAID_OWNER);
    // adminProcedure refuses before the body runs.
    await expect(
      owner.design.adminGrantDesigns({
        affiliateId: UNPAID_AFFILIATE.id,
        designCount: 5,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      owner.design.adminRenewDesignGrant({ affiliateId: UNPAID_AFFILIATE.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      owner.design.adminDesignGrant({ affiliateId: UNPAID_AFFILIATE.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(grants()).toHaveLength(0);
  });

  it("does not let one store's grant cover another store's team member", async () => {
    const admin = caller(ADMIN_USER);
    await admin.design.adminGrantDesigns({
      affiliateId: UNPAID_AFFILIATE.id,
      designCount: 5,
    });
    // A team member of the same store whose email is not on the grant.
    const outsider = caller({
      id: 8106,
      email: "not-listed@example.test",
      role: "user",
    });
    const usage = await outsider.design.usage();
    expect(usage.grant).toMatchObject({ designCount: 5 });
    expect(usage.grant?.appliesToYou).toBe(false);
    expect(usage.grantRemaining).toBe(0);
  });
});
