/**
 * The affiliate design allowance, run against the real gate functions and an
 * in-memory ledger plus grant table.
 *
 * These do not need a live database: the gate takes its db handle as an
 * argument, so the same code the routers call is exercised here with rows.
 *
 * The rule under test: spend the free five first, then the admin grant, then
 * refuse with MEMBERSHIP_REQUIRED. A grant is only spendable by the emails on
 * it, and renewing puts the store back to the stored count.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  affiliateDesignGrants,
  affiliates,
  affiliateFreeUsage,
} from "../../drizzle/schema";
import { memoryStore, type Row } from "./__testDb";

const { accessMock } = vi.hoisted(() => ({ accessMock: vi.fn() }));

vi.mock("./affiliateAccess", () => ({
  resolveAffiliateAccess: accessMock,
}));

const {
  assertFreeUsageAvailable,
  claimFreeUsage,
  loadDesignGrant,
  loadFreeUsageGate,
  loadGrantView,
  releaseFreeUsage,
  renewDesignGrant,
  usagePayload,
  writeDesignGrant,
} = await import("./affiliateFreeUsage");

const FREE_AFFILIATE = {
  id: 53,
  status: "active",
  email: "owner53@example.test",
  publicEmail: "store53@example.test",
  storeName: "Store 53",
};
const PAID_AFFILIATE = {
  id: 62,
  status: "active",
  email: "paid@example.test",
  publicEmail: null,
  storeName: "Paid Store",
};

let tables: Map<unknown, Row[]>;

function store() {
  return memoryStore(tables) as unknown as NonNullable<
    Awaited<ReturnType<typeof import("../db").getDb>>
  >;
}

function seed(
  options: { status?: string; ledgerRows?: Row[]; grants?: Row[] } = {}
) {
  tables = new Map<unknown, Row[]>([
    [
      affiliates,
      [
        { ...FREE_AFFILIATE, membershipStatus: options.status ?? "pending" },
        { ...PAID_AFFILIATE, membershipStatus: options.status ?? "pending" },
      ],
    ],
    [affiliateFreeUsage, options.ledgerRows ?? []],
    [affiliateDesignGrants, options.grants ?? []],
  ]);
}

function ledgerFor(affiliateId: number) {
  return (tables.get(affiliateFreeUsage) ?? []).filter(
    row => row.affiliateId === affiliateId
  );
}

function grantFor(affiliateId: number) {
  return (tables.get(affiliateDesignGrants) ?? []).find(
    row => row.affiliateId === affiliateId
  ) as
    | (Row & { id: number; designCount: number; usedSinceGrant: number })
    | undefined;
}

const UNPAID_USER = { id: 700, email: "owner53@example.test", role: "user" };
const TEAM_USER = { id: 701, email: "designer@example.test", role: "user" };
const PAID_USER = { id: 702, email: "paid@example.test", role: "user" };
const ADMIN = { id: 703, email: "admin@example.test", role: "admin" };
const CUSTOMER = { id: 704, email: "shopper@example.test", role: "user" };

function accessFor(affiliateId: number) {
  return {
    affiliateId,
    isOwner: affiliateId === FREE_AFFILIATE.id,
    accessCrm: true,
    accessDesigner: true,
    accessMarketing: true,
    teamMemberId: null,
  };
}

function fiveSpent(affiliateId: number): Row[] {
  const kinds = [
    "design",
    "auto_design",
    "photo_render",
    "design",
    "auto_design",
  ];
  return kinds.map((kind, index) => ({
    id: 100 + index,
    affiliateId,
    kind,
    refId: null,
    userId: 700,
  }));
}

/** A grant row as the SQL for affiliate 53 writes it. */
function grantRow(overrides: Row = {}): Row {
  return {
    id: 900,
    affiliateId: FREE_AFFILIATE.id,
    designCount: 5,
    usedSinceGrant: 0,
    contactEmails: `${FREE_AFFILIATE.email},${FREE_AFFILIATE.publicEmail}`,
    grantedBy: "tom",
    grantedAt: new Date("2026-11-07T12:00:00Z"),
    renewedAt: null,
    renewedBy: null,
    ...overrides,
  };
}

describe("affiliate free-use cap", () => {
  beforeEach(() => {
    seed();
    accessMock.mockReset();
  });

  it("counts the three kinds together against one limit of five", async () => {
    seed({
      ledgerRows: [
        { id: 1, affiliateId: FREE_AFFILIATE.id, kind: "design" },
        { id: 2, affiliateId: FREE_AFFILIATE.id, kind: "auto_design" },
        { id: 3, affiliateId: FREE_AFFILIATE.id, kind: "auto_design" },
        { id: 4, affiliateId: FREE_AFFILIATE.id, kind: "photo_render" },
      ],
    });
    accessMock.mockResolvedValue(accessFor(FREE_AFFILIATE.id));
    const gate = await loadFreeUsageGate(store(), UNPAID_USER);
    expect(gate.enforced).toBe(true);
    expect(gate.snapshot).toMatchObject({
      used: 4,
      limit: 5,
      freeRemaining: 1,
      remaining: 1,
      unlimited: false,
    });
    expect(gate.snapshot.byKind).toEqual({
      design: 1,
      auto_design: 2,
      photo_render: 1,
    });

    assertFreeUsageAvailable(gate, "photo_render");
    const claim = await claimFreeUsage(store(), gate, "photo_render", {
      userId: UNPAID_USER.id,
    });
    expect(claim.snapshot).toMatchObject({
      used: 5,
      freeRemaining: 0,
      remaining: 0,
    });
    expect(claim.bucket).toBe("free");
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(5);
  });

  it("refuses the sixth attempt with FORBIDDEN and MEMBERSHIP_REQUIRED when there is no grant", async () => {
    seed({ ledgerRows: fiveSpent(FREE_AFFILIATE.id) });
    accessMock.mockResolvedValue(accessFor(FREE_AFFILIATE.id));
    const db = store();
    const gate = await loadFreeUsageGate(db, UNPAID_USER);
    expect(gate.snapshot.remaining).toBe(0);

    for (const kind of ["design", "auto_design", "photo_render"] as const) {
      let thrown: unknown;
      try {
        assertFreeUsageAvailable(gate, kind);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const error = thrown as {
        code?: string;
        message?: string;
        cause?: { message?: string };
      };
      expect(error.code).toBe("FORBIDDEN");
      expect(error.cause?.message).toBe("MEMBERSHIP_REQUIRED");
      expect(error.message).toMatch(/buy the affiliate membership/i);
    }
    // The claim itself refuses too, not only the pre-check.
    await expect(
      claimFreeUsage(db, gate, "design", { userId: UNPAID_USER.id })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      cause: { message: "MEMBERSHIP_REQUIRED" },
    });
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(5);
  });

  it("refuses a free claim that would land one over the limit, and takes the row back out", async () => {
    seed({ ledgerRows: fiveSpent(FREE_AFFILIATE.id) });
    accessMock.mockResolvedValue(accessFor(FREE_AFFILIATE.id));
    const db = store();
    const gate = await loadFreeUsageGate(db, UNPAID_USER);
    await expect(
      claimFreeUsage(db, gate, "design", { userId: UNPAID_USER.id })
    ).rejects.toThrow(/buy the affiliate membership/i);
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(5);
  });

  it("is unlimited for an affiliate with an active membership", async () => {
    seed({ status: "active", ledgerRows: fiveSpent(PAID_AFFILIATE.id) });
    accessMock.mockResolvedValue(accessFor(PAID_AFFILIATE.id));
    const db = store();
    const gate = await loadFreeUsageGate(db, PAID_USER);
    expect(gate.enforced).toBe(false);
    expect(gate.snapshot.unlimited).toBe(true);
    expect(gate.snapshot.remaining).toBeNull();
    assertFreeUsageAvailable(gate, "design");
    const claim = await claimFreeUsage(db, gate, "design", {
      userId: PAID_USER.id,
    });
    expect(claim.ledgerId).toBeNull();
    expect(claim.bucket).toBeNull();
    expect(ledgerFor(PAID_AFFILIATE.id)).toHaveLength(5);
  });

  it("does not affect a customer who is not an affiliate", async () => {
    accessMock.mockResolvedValue(null);
    const db = store();
    const gate = await loadFreeUsageGate(db, CUSTOMER);
    expect(gate.enforced).toBe(false);
    expect(gate.snapshot.unlimited).toBe(true);
    assertFreeUsageAvailable(gate, "design");
    const claim = await claimFreeUsage(db, gate, "design", {
      userId: CUSTOMER.id,
    });
    expect(claim.ledgerId).toBeNull();
    expect(tables.get(affiliateFreeUsage)).toEqual([]);
  });

  it("exempts an admin even when the store they own is unpaid", async () => {
    seed({ ledgerRows: fiveSpent(FREE_AFFILIATE.id) });
    accessMock.mockResolvedValue(accessFor(FREE_AFFILIATE.id));
    const gate = await loadFreeUsageGate(store(), ADMIN);
    expect(gate.enforced).toBe(false);
    expect(gate.snapshot.unlimited).toBe(true);
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("caps a past_due or cancelled membership, not just a pending one", async () => {
    for (const status of ["past_due", "cancelled"]) {
      seed({ status });
      accessMock.mockResolvedValue(accessFor(FREE_AFFILIATE.id));
      const gate = await loadFreeUsageGate(store(), UNPAID_USER);
      expect(gate.enforced, status).toBe(true);
      expect(gate.snapshot.membershipStatus).toBe(status);
    }
  });

  it("hands a spent use back when the work it paid for failed", async () => {
    seed();
    accessMock.mockResolvedValue(accessFor(FREE_AFFILIATE.id));
    const db = store();
    const gate = await loadFreeUsageGate(db, UNPAID_USER);
    const claim = await claimFreeUsage(db, gate, "photo_render", {
      userId: UNPAID_USER.id,
    });
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(1);
    await releaseFreeUsage(db, claim);
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(0);
  });

  it("does not let deleting existing designs reset the count", async () => {
    seed({
      ledgerRows: [
        { id: 11, affiliateId: FREE_AFFILIATE.id, kind: "design", refId: 501 },
        { id: 12, affiliateId: FREE_AFFILIATE.id, kind: "design", refId: 502 },
        { id: 13, affiliateId: FREE_AFFILIATE.id, kind: "auto_design" },
        { id: 14, affiliateId: FREE_AFFILIATE.id, kind: "photo_render" },
      ],
    });
    accessMock.mockResolvedValue(accessFor(FREE_AFFILIATE.id));
    const gate = await loadFreeUsageGate(store(), UNPAID_USER);
    expect(gate.snapshot.freeRemaining).toBe(1);
  });
});

describe("admin design grant on top of the free five", () => {
  beforeEach(() => {
    seed();
    accessMock.mockReset();
    accessMock.mockResolvedValue(accessFor(FREE_AFFILIATE.id));
  });

  it("shows the stored count and what is left of it on the usage payload", async () => {
    seed({
      ledgerRows: fiveSpent(FREE_AFFILIATE.id),
      grants: [grantRow({ usedSinceGrant: 2 })],
    });
    const payload = usagePayload(await loadFreeUsageGate(store(), UNPAID_USER));
    expect(payload).toMatchObject({
      enforced: true,
      used: 5,
      freeRemaining: 0,
      remaining: 3,
    });
    expect(payload.grant).toMatchObject({
      designCount: 5,
      used: 2,
      remaining: 3,
      appliesToYou: true,
    });
    // Exactly the wording Tom asked for.
    expect(payload.grantLine).toBe("Extra designs: 5 (3 left)");
    expect(payload.notice).toContain("Extra designs: 5 (3 left)");
  });

  it("spends the free five before the grant", async () => {
    seed({ ledgerRows: fiveSpent(FREE_AFFILIATE.id), grants: [grantRow()] });
    const db = store();
    const gate = await loadFreeUsageGate(db, UNPAID_USER);
    const claim = await claimFreeUsage(db, gate, "design", {
      userId: UNPAID_USER.id,
    });
    expect(claim.bucket).toBe("grant");
    expect(claim.ledgerId).toBeNull();
    expect(claim.grantId).toBe(900);
    // The free ledger is untouched; only the grant's counter moved.
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(5);
    expect(grantFor(FREE_AFFILIATE.id)?.usedSinceGrant).toBe(1);
    expect(claim.snapshot).toMatchObject({ grantRemaining: 4, remaining: 4 });
  });

  it("still spends a free use when the free five are not gone, even with a grant present", async () => {
    seed({
      ledgerRows: [{ id: 1, affiliateId: FREE_AFFILIATE.id, kind: "design" }],
      grants: [grantRow()],
    });
    const db = store();
    const gate = await loadFreeUsageGate(db, UNPAID_USER);
    const claim = await claimFreeUsage(db, gate, "auto_design", {
      userId: UNPAID_USER.id,
    });
    expect(claim.bucket).toBe("free");
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(2);
    expect(grantFor(FREE_AFFILIATE.id)?.usedSinceGrant).toBe(0);
  });

  it("refuses only when both the free five and the grant are gone", async () => {
    seed({
      ledgerRows: fiveSpent(FREE_AFFILIATE.id),
      grants: [grantRow({ usedSinceGrant: 5 })],
    });
    const db = store();
    const gate = await loadFreeUsageGate(db, UNPAID_USER);
    expect(gate.snapshot.remaining).toBe(0);
    await expect(
      claimFreeUsage(db, gate, "photo_render", { userId: UNPAID_USER.id })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      cause: { message: "MEMBERSHIP_REQUIRED" },
    });
    expect(grantFor(FREE_AFFILIATE.id)?.usedSinceGrant).toBe(5);
  });

  it("allows five grant uses for a store that already spent its free five", async () => {
    seed({ ledgerRows: fiveSpent(FREE_AFFILIATE.id), grants: [grantRow()] });
    const db = store();
    for (let index = 0; index < 5; index += 1) {
      const gate = await loadFreeUsageGate(db, UNPAID_USER);
      const claim = await claimFreeUsage(db, gate, "design", {
        userId: UNPAID_USER.id,
      });
      expect(claim.bucket).toBe("grant");
    }
    expect(grantFor(FREE_AFFILIATE.id)?.usedSinceGrant).toBe(5);
    const exhausted = await loadFreeUsageGate(db, UNPAID_USER);
    await expect(claimFreeUsage(db, exhausted, "design")).rejects.toMatchObject(
      { cause: { message: "MEMBERSHIP_REQUIRED" } }
    );
  });

  it("gives the use back to the grant when the work failed", async () => {
    seed({
      ledgerRows: fiveSpent(FREE_AFFILIATE.id),
      grants: [grantRow({ usedSinceGrant: 1 })],
    });
    const db = store();
    const gate = await loadFreeUsageGate(db, UNPAID_USER);
    const claim = await claimFreeUsage(db, gate, "design", {
      userId: UNPAID_USER.id,
    });
    expect(grantFor(FREE_AFFILIATE.id)?.usedSinceGrant).toBe(2);
    await releaseFreeUsage(db, claim);
    expect(grantFor(FREE_AFFILIATE.id)?.usedSinceGrant).toBe(1);
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(5);
  });

  it("is spendable by a listed contact email, not only by the owner", async () => {
    seed({ ledgerRows: fiveSpent(FREE_AFFILIATE.id), grants: [grantRow()] });
    const db = store();
    // A team member signed in with the store's publicEmail, which the grant lists.
    const contact = { ...TEAM_USER, email: "store53@example.test" };
    const gate = await loadFreeUsageGate(db, contact);
    expect(gate.snapshot.grant?.appliesToYou).toBe(true);
    const claim = await claimFreeUsage(db, gate, "design", {
      userId: contact.id,
    });
    expect(claim.bucket).toBe("grant");
    expect(grantFor(FREE_AFFILIATE.id)?.usedSinceGrant).toBe(1);
  });

  it("is not spendable by someone whose email is not on it", async () => {
    seed({ ledgerRows: fiveSpent(FREE_AFFILIATE.id), grants: [grantRow()] });
    const db = store();
    const gate = await loadFreeUsageGate(db, TEAM_USER);
    expect(gate.snapshot.grant?.designCount).toBe(5);
    expect(gate.snapshot.grant?.appliesToYou).toBe(false);
    expect(gate.snapshot.grantRemaining).toBe(0);
    expect(gate.snapshot.remaining).toBe(0);
    await expect(
      claimFreeUsage(db, gate, "design", { userId: TEAM_USER.id })
    ).rejects.toMatchObject({
      cause: { message: "MEMBERSHIP_REQUIRED" },
    });
    expect(grantFor(FREE_AFFILIATE.id)?.usedSinceGrant).toBe(0);
  });

  it("renewing resets the spent counter to the stored count", async () => {
    seed({
      ledgerRows: fiveSpent(FREE_AFFILIATE.id),
      grants: [grantRow({ usedSinceGrant: 5 })],
    });
    const db = store();
    const before = await loadFreeUsageGate(db, UNPAID_USER);
    expect(before.snapshot.remaining).toBe(0);

    const view = await renewDesignGrant(db, {
      affiliateId: FREE_AFFILIATE.id,
      actor: "admin@example.test",
    });
    expect(view.grant).toMatchObject({
      designCount: 5,
      used: 0,
      remaining: 5,
      appliesToYou: false,
    });
    expect(view.grantLine).toBe("Extra designs: 5 (5 left)");
    expect(view.grant?.renewedBy).toBe("admin@example.test");
    expect(view.grant?.renewedAt).toBeTruthy();
    // The original grant details are kept, and the free ledger is not touched.
    expect(view.grant?.grantedBy).toBe("tom");
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(5);

    const after = await loadFreeUsageGate(db, UNPAID_USER);
    expect(after.snapshot.remaining).toBe(5);
    const claim = await claimFreeUsage(db, after, "design", {
      userId: UNPAID_USER.id,
    });
    expect(claim.bucket).toBe("grant");
  });

  it("renewing can change the count", async () => {
    seed({
      ledgerRows: fiveSpent(FREE_AFFILIATE.id),
      grants: [grantRow({ usedSinceGrant: 5 })],
    });
    const db = store();
    const view = await renewDesignGrant(db, {
      affiliateId: FREE_AFFILIATE.id,
      designCount: 2,
      actor: "admin@example.test",
    });
    expect(view.grant).toMatchObject({ designCount: 2, used: 0, remaining: 2 });
    expect(view.grantLine).toBe("Extra designs: 2 (2 left)");
    expect(grantFor(FREE_AFFILIATE.id)?.designCount).toBe(2);
  });

  it("keeps one grant row per store when granted twice", async () => {
    const db = store();
    await writeDesignGrant(db, {
      affiliateId: FREE_AFFILIATE.id,
      designCount: 5,
      actor: "tom",
    });
    await writeDesignGrant(db, {
      affiliateId: FREE_AFFILIATE.id,
      designCount: 8,
      actor: "tom",
    });
    const rows = (tables.get(affiliateDesignGrants) ?? []).filter(
      row => row.affiliateId === FREE_AFFILIATE.id
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.designCount).toBe(8);
  });

  it("reads the grant's contact emails from the affiliate's own row by default", async () => {
    const db = store();
    const view = await writeDesignGrant(db, {
      affiliateId: FREE_AFFILIATE.id,
      designCount: 5,
      actor: "tom",
    });
    expect(view.grant?.contactEmails).toEqual([
      FREE_AFFILIATE.email,
      FREE_AFFILIATE.publicEmail,
    ]);
    // Stored as one comma-separated line, lowercased.
    expect(grantFor(FREE_AFFILIATE.id)?.contactEmails).toBe(
      `${FREE_AFFILIATE.email},${FREE_AFFILIATE.publicEmail}`
    );
    // The owner's own sign-in email therefore matches and can spend it.
    const gate = await loadFreeUsageGate(db, UNPAID_USER);
    expect(gate.snapshot.grant?.appliesToYou).toBe(true);
  });

  it("reports a store with no grant yet without inventing one", async () => {
    const db = store();
    const view = await loadGrantView(
      db,
      FREE_AFFILIATE.id,
      "admin@example.test"
    );
    expect(view.hasGrant).toBe(false);
    expect(view.grant).toBeNull();
    expect(view.grantLine).toBeNull();
    expect(view.storeName).toBe(FREE_AFFILIATE.storeName);
    expect(view.membershipStatus).toBe("pending");
    expect(await loadDesignGrant(db, FREE_AFFILIATE.id)).toBeNull();
  });

  it("reports a paid affiliate as unlimited and ignores the grant", async () => {
    seed({ status: "active", ledgerRows: fiveSpent(PAID_AFFILIATE.id) });
    accessMock.mockResolvedValue(accessFor(PAID_AFFILIATE.id));
    const gate = await loadFreeUsageGate(store(), PAID_USER);
    expect(gate.snapshot.unlimited).toBe(true);
    expect(gate.snapshot.grant).toBeNull();
    expect(gate.snapshot.remaining).toBeNull();
  });
});
