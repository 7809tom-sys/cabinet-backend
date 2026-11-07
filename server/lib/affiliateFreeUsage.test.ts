/**
 * The affiliate free-use cap, run against the real gate functions and an
 * in-memory ledger.
 *
 * These do not need a live database: the gate takes its db handle as an
 * argument, so the same code the routers call is exercised here with rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliates, affiliateFreeUsage } from "../../drizzle/schema";
import { memoryStore, type Row } from "./__testDb";

const { accessMock } = vi.hoisted(() => ({ accessMock: vi.fn() }));

vi.mock("./affiliateAccess", () => ({
  resolveAffiliateAccess: accessMock,
}));

const {
  assertFreeUsageAvailable,
  claimFreeUsage,
  loadFreeUsageGate,
  releaseFreeUsage,
  releaseUsageById,
  usagePayload,
} = await import("./affiliateFreeUsage");

const FREE_AFFILIATE = {
  id: 41,
  status: "active",
  email: "unpaid@example.test",
};
const PAID_AFFILIATE = { id: 42, status: "active", email: "paid@example.test" };

let tables: Map<unknown, Row[]>;

function store() {
  return memoryStore(tables) as unknown as NonNullable<
    Awaited<ReturnType<typeof import("../db").getDb>>
  >;
}

/** Seed one affiliate row with a membership status, plus any existing ledger rows. */
function seed(
  options: { status: string; ledgerRows?: Row[] } = { status: "pending" }
) {
  tables = new Map<unknown, Row[]>([
    [
      affiliates,
      [
        { ...FREE_AFFILIATE, membershipStatus: options.status },
        { ...PAID_AFFILIATE, membershipStatus: options.status },
      ],
    ],
    [affiliateFreeUsage, options.ledgerRows ?? []],
  ]);
}

function ledgerFor(affiliateId: number) {
  return (tables.get(affiliateFreeUsage) ?? []).filter(
    row => row.affiliateId === affiliateId
  );
}

const UNPAID_USER = { id: 700, email: "unpaid@example.test", role: "user" };
const PAID_USER = { id: 701, email: "paid@example.test", role: "user" };
const ADMIN = { id: 702, email: "admin@example.test", role: "admin" };
const CUSTOMER = { id: 703, email: "shopper@example.test", role: "user" };

function signedInAs(user: { id: number; email: string }) {
  accessMock.mockResolvedValue({
    affiliateId:
      user.id === PAID_USER.id ? PAID_AFFILIATE.id : FREE_AFFILIATE.id,
    isOwner: true,
    accessCrm: true,
    accessDesigner: true,
    accessMarketing: true,
    teamMemberId: null,
  });
}

/** Five uses already spent, in a mix of all three kinds. */
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

describe("affiliate free-use cap", () => {
  beforeEach(() => {
    seed({ status: "pending" });
    accessMock.mockReset();
  });

  it("counts the three kinds together against one limit of five", async () => {
    seed({
      status: "pending",
      ledgerRows: [
        { id: 1, affiliateId: FREE_AFFILIATE.id, kind: "design" },
        { id: 2, affiliateId: FREE_AFFILIATE.id, kind: "auto_design" },
        { id: 3, affiliateId: FREE_AFFILIATE.id, kind: "auto_design" },
        { id: 4, affiliateId: FREE_AFFILIATE.id, kind: "photo_render" },
      ],
    });
    signedInAs(UNPAID_USER);
    const gate = await loadFreeUsageGate(store(), UNPAID_USER);
    expect(gate.enforced).toBe(true);
    expect(gate.snapshot).toMatchObject({
      used: 4,
      limit: 5,
      remaining: 1,
      unlimited: false,
    });
    expect(gate.snapshot.byKind).toEqual({
      design: 1,
      auto_design: 2,
      photo_render: 1,
    });

    // The fifth use of any kind is allowed.
    assertFreeUsageAvailable(gate, "photo_render");
    const claim = await claimFreeUsage(store(), gate, "photo_render", {
      userId: UNPAID_USER.id,
    });
    expect(claim.snapshot).toMatchObject({ used: 5, remaining: 0 });
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(5);
  });

  it("refuses the sixth attempt with FORBIDDEN and MEMBERSHIP_REQUIRED", async () => {
    seed({ status: "pending", ledgerRows: fiveSpent(FREE_AFFILIATE.id) });
    signedInAs(UNPAID_USER);
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
    // Refusing never writes a ledger row.
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(5);
  });

  it("refuses a claim that would land one over the limit, and takes the row back out", async () => {
    // Two requests can pass the same stale check. The second must not win.
    seed({ status: "pending", ledgerRows: fiveSpent(FREE_AFFILIATE.id) });
    signedInAs(UNPAID_USER);
    const db = store();
    const gate = await loadFreeUsageGate(db, UNPAID_USER);
    await expect(
      claimFreeUsage(db, gate, "design", { userId: UNPAID_USER.id })
    ).rejects.toThrow(/buy the affiliate membership/i);
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(5);
  });

  it("is unlimited for an affiliate with an active membership", async () => {
    seed({ status: "active", ledgerRows: fiveSpent(PAID_AFFILIATE.id) });
    signedInAs(PAID_USER);
    const db = store();
    const gate = await loadFreeUsageGate(db, PAID_USER);
    expect(gate.enforced).toBe(false);
    expect(gate.snapshot.unlimited).toBe(true);
    expect(gate.snapshot.remaining).toBeNull();
    // Even a paid store's old rows do not start the cap again.
    assertFreeUsageAvailable(gate, "design");
    const claim = await claimFreeUsage(db, gate, "design", {
      userId: PAID_USER.id,
    });
    expect(claim.ledgerId).toBeNull();
    expect(ledgerFor(PAID_AFFILIATE.id)).toHaveLength(5);
  });

  it("does not affect a customer who is not an affiliate", async () => {
    seed({ status: "pending" });
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
    seed({ status: "pending", ledgerRows: fiveSpent(FREE_AFFILIATE.id) });
    signedInAs(ADMIN);
    const gate = await loadFreeUsageGate(store(), ADMIN);
    expect(gate.enforced).toBe(false);
    expect(gate.snapshot.unlimited).toBe(true);
    // The affiliate lookup is not even consulted for an admin.
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("caps a past_due or cancelled membership, not just a pending one", async () => {
    for (const status of ["past_due", "cancelled"]) {
      seed({ status });
      signedInAs(UNPAID_USER);
      const gate = await loadFreeUsageGate(store(), UNPAID_USER);
      expect(gate.enforced, status).toBe(true);
      expect(gate.snapshot.membershipStatus).toBe(status);
    }
  });

  it("hands a spent use back when the work it paid for failed", async () => {
    seed({ status: "pending" });
    signedInAs(UNPAID_USER);
    const db = store();
    const gate = await loadFreeUsageGate(db, UNPAID_USER);
    const claim = await claimFreeUsage(db, gate, "photo_render", {
      userId: UNPAID_USER.id,
    });
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(1);
    await releaseFreeUsage(db, claim);
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(0);
  });

  it("only releases a use that belongs to the caller", async () => {
    seed({
      status: "pending",
      ledgerRows: [
        {
          id: 900,
          affiliateId: FREE_AFFILIATE.id,
          kind: "auto_design",
          userId: 999,
        },
      ],
    });
    signedInAs(UNPAID_USER);
    const db = store();
    await releaseUsageById(db, {
      ledgerId: 900,
      userId: UNPAID_USER.id,
      kind: "auto_design",
    });
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(1);
    await releaseUsageById(db, {
      ledgerId: 900,
      userId: 999,
      kind: "auto_design",
    });
    expect(ledgerFor(FREE_AFFILIATE.id)).toHaveLength(0);
  });

  it("does not let deleting existing designs reset the count", async () => {
    // Four uses spent; the designs they paid for are gone (no rows anywhere else).
    seed({
      status: "pending",
      ledgerRows: [
        { id: 11, affiliateId: FREE_AFFILIATE.id, kind: "design", refId: 501 },
        { id: 12, affiliateId: FREE_AFFILIATE.id, kind: "design", refId: 502 },
        { id: 13, affiliateId: FREE_AFFILIATE.id, kind: "auto_design" },
        { id: 14, affiliateId: FREE_AFFILIATE.id, kind: "photo_render" },
      ],
    });
    signedInAs(UNPAID_USER);
    const gate = await loadFreeUsageGate(store(), UNPAID_USER);
    expect(gate.snapshot.remaining).toBe(1);
  });

  it("returns the payload the Designer shows, with a notice only while capped", async () => {
    seed({
      status: "pending",
      ledgerRows: [{ id: 21, affiliateId: FREE_AFFILIATE.id, kind: "design" }],
    });
    signedInAs(UNPAID_USER);
    const capped = usagePayload(await loadFreeUsageGate(store(), UNPAID_USER));
    expect(capped).toMatchObject({ enforced: true, used: 1, remaining: 4 });
    expect(capped.notice).toContain("4 of 5 free uses left");

    seed({ status: "active" });
    signedInAs(PAID_USER);
    const paid = usagePayload(await loadFreeUsageGate(store(), PAID_USER));
    expect(paid.notice).toBeNull();
    expect(paid.unlimited).toBe(true);
  });
});
