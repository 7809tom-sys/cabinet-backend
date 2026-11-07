/**
 * Self-serve storefront name claim — deterministic (in-memory database) checks.
 *
 * These exercise the real helpers against in-memory rows, so the claim rules are
 * proven without a database: reserved words, uniqueness, the onboarding gate, and
 * the immutability of a slug after it has been claimed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { affiliates, affiliateStorefrontClaims } from "../../drizzle/schema";
import { memoryStore, type Row } from "./__testDb";
import {
  claimStorefrontName,
  checkStorefrontAvailability,
  gateInputFor,
  loadStorefrontClaim,
  loadStorefrontClaimState,
  type ClaimableAffiliate,
} from "./affiliateStorefrontName";
import {
  DEFAULT_ONBOARDING_GATE_CHECKS,
  evaluateMembership,
  type OnboardingGateChecks,
} from "./affiliateOnboardingGate";

const NOW = new Date("2026-11-07T12:00:00Z");

/** Legal documents signed and onboarding documents uploaded. Membership stays real. */
const documentsReadyChecks: OnboardingGateChecks = {
  membership: (input, now) => Promise.resolve(evaluateMembership(input, now)),
  legalDocuments: async () => ({ ok: true }),
  requiredDocuments: async () => ({ ok: true }),
};

const MINE: ClaimableAffiliate = {
  id: 42,
  slug: "my-store",
  storeName: "My Store",
  status: "active",
  membershipStatus: "active",
  membershipExpiresAt: new Date("2027-06-01T00:00:00Z"),
  storefrontEnabled: false,
};

const OTHER: Row = {
  id: 77,
  slug: "first-class",
  storeName: "First Class",
  status: "active",
  membershipStatus: "active",
  membershipExpiresAt: new Date("2027-06-01T00:00:00Z"),
  storefrontEnabled: true,
};

let tables: Map<unknown, Row[]>;

function db(over: Partial<{ affiliates: Row[]; claims: Row[] }> = {}) {
  tables = new Map<unknown, Row[]>([
    [affiliates, over.affiliates ?? [{ ...MINE }, OTHER]],
    [affiliateStorefrontClaims, over.claims ?? []],
  ]);
  return memoryStore(tables) as unknown as Parameters<typeof loadStorefrontClaim>[0];
}

function rowsOf(table: unknown): Row[] {
  return tables.get(table) ?? [];
}

beforeEach(() => {
  tables = new Map<unknown, Row[]>();
});

describe("checkStorefrontAvailability", () => {
  it("accepts a free name and returns the path it would publish", async () => {
    const database = db();
    const result = await checkStorefrontAvailability(database, "Oak & Iron Cabinets");
    expect(result).toEqual({
      available: true,
      slug: "oak-iron-cabinets",
      path: "/store/oak-iron-cabinets",
      message: null,
    });
  });

  it("refuses a reserved word before reading the database", async () => {
    const database = db();
    const result = await checkStorefrontAvailability(database, "Admin");
    expect(result.available).toBe(false);
    if (result.available) throw new Error("expected refusal");
    expect(result.blocker).toBe("reserved");
    expect(result.message).toMatch(/reserved/i);
  });

  it("refuses a name another storefront already uses", async () => {
    const database = db();
    const result = await checkStorefrontAvailability(database, "First Class");
    expect(result.available).toBe(false);
    if (result.available) throw new Error("expected refusal");
    expect(result.blocker).toBe("taken");
  });

  it("refuses a name another storefront currently uses", async () => {
    const database = db();
    const result = await checkStorefrontAvailability(database, "First Class");
    expect(result.available).toBe(false);
    if (result.available) throw new Error("expected refusal");
    expect(result.blocker).toBe("taken");
  });

  it("releases a claimed name once an admin renames that store away from it", async () => {
    const database = db({
      // The claim row still says "released-name", but other now lives elsewhere,
      // so the name is free for anyone to claim. affiliates.slug is the authority.
      affiliates: [{ ...MINE }, { ...OTHER, slug: "new-home" }],
      claims: [{ id: 1, affiliateId: 77, claimedSlug: "released-name", claimedByName: "Released", claimedAt: NOW }],
    });
    const result = await checkStorefrontAvailability(database, "released name");
    expect(result).toEqual({
      available: true,
      slug: "released-name",
      path: "/store/released-name",
      message: null,
    });
  });

  it("lets an affiliate re-check their own name and their own claim", async () => {
    const database = db({
      claims: [{ id: 1, affiliateId: 42, claimedSlug: "my-store", claimedByName: "My Store", claimedAt: NOW }],
    });
    const result = await checkStorefrontAvailability(database, "my store", { ignoreAffiliateId: 42 });
    expect(result.available).toBe(true);
  });

  it("refuses a name that fails the shared name rules", async () => {
    const database = db();
    const result = await checkStorefrontAvailability(database, "ab");
    expect(result.available).toBe(false);
    if (result.available) throw new Error("expected refusal");
    expect(result.blocker).toBe("too_short");
  });
});

describe("claimStorefrontName", () => {
  it("refuses while the legal-document and document checks are still stubs", async () => {
    const database = db();
    const result = await claimStorefrontName(database, MINE, "Oak & Iron", {
      userId: 900,
      checks: DEFAULT_ONBOARDING_GATE_CHECKS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toBe("gate");
    // Nothing was written: the storefront is still off.
    expect(rowsOf(affiliateStorefrontClaims)).toHaveLength(0);
    expect(rowsOf(affiliates)[0].slug).toBe("my-store");
    expect(rowsOf(affiliates)[0].storefrontEnabled).toBe(false);
  });

  it("refuses an expired or unpaid membership even when documents are ready", async () => {
    const database = db();
    const result = await claimStorefrontName(
      database,
      { ...MINE, membershipStatus: "past_due" },
      "Oak & Iron",
      { userId: 900, checks: documentsReadyChecks, now: NOW },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toBe("gate");
    expect(result.gate?.blockers).toContain("membership_inactive");
    expect(rowsOf(affiliateStorefrontClaims)).toHaveLength(0);
  });

  it("publishes the storefront and records the claim once the gate passes", async () => {
    const database = db();
    const result = await claimStorefrontName(database, MINE, "Oak & Iron Cabinets", {
      userId: 900,
      checks: documentsReadyChecks,
      now: NOW,
    });
    expect(result).toEqual({
      ok: true,
      slug: "oak-iron-cabinets",
      path: "/store/oak-iron-cabinets",
      storefrontEnabled: true,
    });

    const store = rowsOf(affiliates).find((row) => row.id === 42);
    expect(store?.slug).toBe("oak-iron-cabinets");
    expect(store?.storefrontEnabled).toBe(true);

    const claim = rowsOf(affiliateStorefrontClaims)[0];
    expect(claim).toMatchObject({
      affiliateId: 42,
      claimedSlug: "oak-iron-cabinets",
      claimedByName: "Oak & Iron Cabinets",
      claimedByUserId: 900,
    });
  });

  it("refuses a second claim, so the slug is immutable except by an admin", async () => {
    const database = db({
      claims: [{ id: 1, affiliateId: 42, claimedSlug: "my-store", claimedByName: "My Store", claimedAt: NOW }],
    });
    const result = await claimStorefrontName(database, MINE, "Some Other Name", {
      userId: 900,
      checks: documentsReadyChecks,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toBe("already_claimed");
    expect(rowsOf(affiliates).find((row) => row.id === 42)?.slug).toBe("my-store");
    expect(rowsOf(affiliateStorefrontClaims)).toHaveLength(1);
  });

  it("refuses a name another store holds", async () => {
    const database = db();
    const result = await claimStorefrontName(database, MINE, "First Class", {
      userId: 900,
      checks: documentsReadyChecks,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toBe("name");
    expect(result.blocker).toBe("taken");
  });

  it("does not overwrite a slug an admin changed between the read and the write", async () => {
    const database = db();
    // The caller holds a stale row: the store was renamed after it was loaded.
    const renamed = { ...MINE, slug: "admin-renamed-it" };
    tables.set(affiliates, [renamed, OTHER]);
    const result = await claimStorefrontName(database, MINE, "Oak & Iron", {
      userId: 900,
      checks: documentsReadyChecks,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(rowsOf(affiliates).find((row) => row.id === 42)?.slug).toBe("admin-renamed-it");
    // The reservation is released, so the affiliate is not locked out of a name
    // they never actually got.
    expect(rowsOf(affiliateStorefrontClaims)).toHaveLength(0);
  });

  it("lets only one of two racing claims through", async () => {
    // The UNIQUE(affiliateId) key is what rejects the second claim. The in-memory
    // store does not enforce keys, so the driver's duplicate error is simulated
    // for the second insert.
    const base = db();
    let inserts = 0;
    const racy = Object.create(base) as Parameters<typeof claimStorefrontName>[0];
    Object.assign(racy, {
      insert: (table: unknown) => ({
        values: async (values: Row) => {
          inserts += 1;
          if (inserts > 1) {
            throw Object.assign(new Error("Duplicate entry '42' for key 'affiliate_storefront_claims_affiliate_uq'"), {
              code: "ER_DUP_ENTRY",
              errno: 1062,
            });
          }
          return (base as unknown as { insert: (t: unknown) => { values: (v: Row) => Promise<unknown> } })
            .insert(table)
            .values(values);
        },
      }),
    });

    const first = await claimStorefrontName(racy, MINE, "Oak & Iron", {
      userId: 900,
      checks: documentsReadyChecks,
      now: NOW,
    });
    expect(first.ok).toBe(true);

    const second = await claimStorefrontName(racy, MINE, "Second Choice", {
      userId: 900,
      checks: documentsReadyChecks,
      now: NOW,
    });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("expected refusal");
    expect(second.reason).toBe("already_claimed");
    expect(rowsOf(affiliates).find((row) => row.id === 42)?.slug).toBe("oak-iron");
  });

  it("refuses when the claim table has not been created by hand yet", async () => {
    // Drop the table to simulate the SQL not being pasted yet.
    const database = {
      select: () => {
        throw Object.assign(new Error("Table 'affiliate_storefront_claims' doesn't exist"), {
          code: "ER_NO_SUCH_TABLE",
          errno: 1146,
        });
      },
      update: () => {
        throw new Error("the claim must not be written before the gate passes");
      },
      insert: () => {
        throw new Error("the claim must not be written before the gate passes");
      },
    } as unknown as Parameters<typeof claimStorefrontName>[0];
    const result = await claimStorefrontName(database, MINE, "Oak & Iron", {
      userId: 900,
      checks: documentsReadyChecks,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toBe("schema");
    expect(result.message).toMatch(/0269_affiliate_storefront_name_claim/);
  });
});

describe("loadStorefrontClaimState", () => {
  it("reports an unclaimed store with its current slug", async () => {
    const database = db();
    const state = await loadStorefrontClaimState(database, { ...MINE, storefrontEnabled: true }, documentsReadyChecks, NOW);
    expect(state).toMatchObject({
      claimed: false,
      slug: "my-store",
      path: "/store/my-store",
      storeSlug: "my-store",
      claimedSlug: null,
      slugChangedByAdmin: false,
      storefrontEnabled: true,
    });
    expect(state.gate.ok).toBe(true);
  });

  it("flags an admin rename after the claim", async () => {
    const database = db({
      claims: [{ id: 1, affiliateId: 42, claimedSlug: "what-i-claimed", claimedByName: "Oak", claimedAt: NOW }],
    });
    const state = await loadStorefrontClaimState(database, MINE, documentsReadyChecks, NOW);
    expect(state.claimedSlug).toBe("what-i-claimed");
    expect(state.slug).toBe("my-store");
    expect(state.slugChangedByAdmin).toBe(true);
  });

  it("shows what still blocks the last onboarding step", async () => {
    const database = db();
    const state = await loadStorefrontClaimState(database, MINE, DEFAULT_ONBOARDING_GATE_CHECKS, NOW);
    expect(state.gate.ok).toBe(false);
    expect(state.gate.blockers).toEqual(["legal_docs_unsigned", "documents_missing"]);
    expect(state.gate.messages).toHaveLength(2);
  });
});

describe("gateInputFor", () => {
  it("passes the affiliate's own membership and status to the gate", () => {
    expect(gateInputFor(MINE)).toEqual({
      affiliateId: 42,
      status: "active",
      membershipStatus: "active",
      membershipExpiresAt: MINE.membershipExpiresAt,
    });
  });
});
