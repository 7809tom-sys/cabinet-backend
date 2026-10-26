import { describe, expect, it } from "vitest";
import {
  CleanupPlanError,
  buildCleanupPlan,
  type BuildPlanInput,
  type PlannerAffiliate,
  type PlannerUser,
} from "./plan";
import { assertSnapshotMatch, canonicalSnapshot, evaluateConfirm, hashSnapshot, SnapshotMismatchError } from "./snapshot";
import { planToCsv } from "./csv";
import { redactRow } from "./redact";
import { deleteSupabaseAuthUsers } from "./supabaseAuth";

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T00:10:00.000Z";
const LATER = "2026-02-15T00:00:00.000Z";

function user(partial: Partial<PlannerUser> & Pick<PlannerUser, "id" | "name" | "email">): PlannerUser {
  return {
    openId: partial.openId ?? `oid-${partial.id}`,
    role: partial.role ?? "user",
    pricingTier: partial.pricingTier ?? "homeowner",
    companyName: partial.companyName ?? null,
    authId: partial.authId ?? null,
    createdAt: partial.createdAt ?? T0,
    updatedAt: partial.updatedAt ?? T1,
    lastSignedIn: partial.lastSignedIn === undefined ? T0 : partial.lastSignedIn,
    authoredActivityCount: partial.authoredActivityCount ?? 0,
    ...partial,
  };
}

const tom = user({ id: 1, name: "Tom", email: "7809tom@gmail.com", role: "admin", openId: "tom-owner", authId: "auth-tom" });
const seliena = user({ id: 2, name: "Seliena Bilodeau", email: "seliena@cabinetdealz.com", openId: "seliena", role: "user" });
const selenaSpelling = user({ id: 3, name: "Selena Bilodeau", email: "selena.bilodeau@cabinetdealz.com", role: "designer" });
const rich = user({ id: 4, name: "Rich", email: "richnseliena@gmail.com", openId: "richnseliena", role: "user" });
const marcus = user({ id: 5, name: "Partner Login", email: "marcus@reeves.example.net", role: "partner", openId: "marcus-login" });
const ron = user({ id: 6, name: "Ron White", email: "ron.white@cabinetdealz.com", role: "user" });
const m2 = user({ id: 7, name: "M 2", email: "someone@cabinetdealz.com", openId: "handle-m", role: "user" });
const m2Handle = user({ id: 8, name: "Shop Account", email: "m2@cabinetdealz.com", openId: "shop", role: "user" });

const marcusAffiliate: PlannerAffiliate = {
  id: 50,
  userId: marcus.id,
  contactName: "Marcus Reeves",
  email: "marcus@reeves.example.net",
  storeName: "Reeves Cabinets",
  status: "active",
  updatedAt: T1,
};

function baseInput(overrides: Partial<BuildPlanInput> = {}): BuildPlanInput {
  return {
    actorUserId: tom.id,
    ownerEmail: tom.email,
    ownerOpenId: tom.openId,
    users: [tom, seliena, selenaSpelling, rich, marcus, ron, m2, m2Handle],
    orderRequests: [],
    deals: [],
    affiliates: [marcusAffiliate],
    children: [],
    ...overrides,
  };
}

describe("CRM cleanup planner", () => {
  it("keeps the named authorized accounts and matches handles", () => {
    const plan = buildCleanupPlan(baseInput());
    const kept = new Map(plan.users.map((row) => [row.id, row.reason]));
    expect(kept.get(tom.id)).toBe("named_tom");
    expect(kept.get(seliena.id)).toBe("named_seliena");
    expect(kept.get(selenaSpelling.id)).toBe("named_seliena");
    expect(kept.get(rich.id)).toBe("named_rich");
    expect(kept.get(marcus.id)).toBe("named_marcus");
    expect(kept.get(ron.id)).toBe("named_ron");
    expect(kept.get(m2.id)).toBe("named_m2");
    expect(kept.get(m2Handle.id)).toBe("named_m2");
    expect(plan.preservedAffiliates.map((row) => row.id)).toEqual([marcusAffiliate.id]);
    expect(plan.unlinkedAffiliates).toHaveLength(0);
    expect(plan.keepUserIds.length).toBeLessThan(10);
  });

  it("does not treat a homeowner named Tom, Room 2, or Ron Whitehead as named keeps", () => {
    const homeownerTom = user({ id: 20, name: "Tom Baker", email: "tombaker@gmail.com", role: "user" });
    const room = user({ id: 21, name: "Room 2", email: "room2@gmail.com" });
    const whitehead = user({ id: 22, name: "Ron Whitehead", email: "whitehead@gmail.com" });
    const plan = buildCleanupPlan(baseInput({ users: [...baseInput().users, homeownerTom, room, whitehead] }));
    expect(plan.users.find((row) => row.id === homeownerTom.id)?.namedKey).toBeNull();
    expect(plan.users.find((row) => row.id === room.id)?.reason).not.toBe("named_m2");
    expect(plan.users.find((row) => row.id === whitehead.id)?.reason).not.toBe("named_ron");
  });

  it("classifies delete reasons and still flags real payments without blocking deletion", () => {
    const mike = user({
      id: 30,
      name: "Mike James",
      email: "mikejames.cabinetdealz@yahoo.com",
      authId: "auth-mike",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    const exampleUser = user({ id: 31, name: "Pat Example", email: "pat@example.com" });
    const fake = user({ id: 32, name: "Test Customer", email: "pat.real@gmail.com" });
    const seeded = user({ id: 33, name: "Customer 14", email: "customer14@gmail.com", openId: "seed_014" });
    const quiet = user({ id: 34, name: "Casey Quiet", email: "casey.quiet@gmail.com", lastSignedIn: T0 });
    const plan = buildCleanupPlan(
      baseInput({
        users: [...baseInput().users, mike, exampleUser, fake, seeded, quiet],
        orderRequests: [
          {
            id: 300,
            userId: mike.id,
            requestNumber: "OR-300",
            originatorName: "Mike James",
            originatorEmail: mike.email,
            status: "confirmed",
            notes: null,
            paidAt: "2026-03-02T00:00:00.000Z",
            stripeSessionId: "cs_test_mike",
            stripePaymentIntentId: "pi_mike",
            createdAt: T0,
            updatedAt: T1,
            paymentApproved: true,
            hasStripeRecord: true,
          },
          {
            id: 301,
            userId: null,
            requestNumber: "OR-301",
            originatorName: "Guest",
            originatorEmail: "guest@example.com",
            status: "submitted",
            notes: null,
            paidAt: null,
            stripeSessionId: null,
            stripePaymentIntentId: null,
            createdAt: T0,
            updatedAt: T1,
          },
          {
            id: 302,
            userId: tom.id,
            requestNumber: "OR-TOM",
            originatorName: "Tom",
            originatorEmail: tom.email,
            status: "draft",
            notes: "test order",
            paidAt: null,
            stripeSessionId: null,
            stripePaymentIntentId: null,
            createdAt: T0,
            updatedAt: T1,
          },
        ],
        deals: [
          {
            id: 400,
            title: "Mike James kitchen",
            contactName: "Mike James",
            contactEmail: mike.email,
            ownerUserId: tom.id,
            affiliateId: null,
            orderRequestId: 300,
            notes: null,
            stage: "new",
            createdAt: T0,
            updatedAt: T1,
            activityCount: 2,
          },
          {
            id: 401,
            title: "Seliena remodel",
            contactName: "Seliena Bilodeau",
            contactEmail: seliena.email,
            ownerUserId: tom.id,
            affiliateId: null,
            orderRequestId: null,
            notes: null,
            stage: "qualified",
            createdAt: T0,
            updatedAt: T1,
            activityCount: 3,
          },
        ],
        children: [
          { table: "customer_favorites", id: 1, updatedAt: T1, links: [{ kind: "user", id: mike.id }] },
          { table: "customer_favorites", id: 2, updatedAt: T1, links: [{ kind: "user", id: tom.id }] },
          { table: "crm_activities", id: 9, updatedAt: T1, links: [{ kind: "deal", id: 400 }] },
          { table: "kitchen_designs", id: 70, updatedAt: T1, links: [{ kind: "user", id: mike.id }] },
        ],
        stripeRecords: [
          {
            id: 8,
            orderRequestId: 300,
            customerEmail: mike.email,
            customerName: "Mike James",
            purpose: "order",
            affiliateId: null,
            status: "paid",
            updatedAt: T1,
          },
        ],
      }),
    );

    expect(plan.users.find((row) => row.id === mike.id)).toMatchObject({ action: "delete", reason: "design_example", hasRealPayment: true });
    expect(plan.users.find((row) => row.id === exampleUser.id)?.reason).toBe("example_email");
    expect(plan.users.find((row) => row.id === fake.id)?.reason).toBe("test_fake_name");
    expect(plan.users.find((row) => row.id === seeded.id)?.reason).toBe("bulk_seeded");
    expect(plan.users.find((row) => row.id === quiet.id)?.reason).toBe("no_real_activity");
    expect(plan.orderRequests.find((row) => row.id === 300)).toMatchObject({ action: "delete", hasRealPayment: true });
    expect(plan.orderRequests.find((row) => row.id === 301)).toMatchObject({ action: "delete", reason: "example_email" });
    expect(plan.orderRequests.find((row) => row.id === 302)).toMatchObject({ action: "keep", reason: "kept_with_user" });
    expect(plan.deals.find((row) => row.id === 400)?.action).toBe("delete");
    expect(plan.deals.find((row) => row.id === 401)?.action).toBe("keep");
    expect(plan.children.find((row) => row.id === 1 && row.table === "customer_favorites")?.action).toBe("delete");
    expect(plan.children.find((row) => row.id === 2)?.action).toBe("keep");
    expect(plan.children.find((row) => row.table === "crm_activities")?.action).toBe("delete");
    expect(plan.stripeRecords[0]).toMatchObject({ action: "delete", hasRealPayment: true });
    expect(plan.keepUserIds).not.toContain(mike.id);
  });

  it("suggests other genuine accounts without passing nine keeps", () => {
    const extras = Array.from({ length: 8 }, (_, index) =>
      user({
        id: 100 + index,
        name: `Staff ${index}`,
        email: `staff${index}@cabinetdealz.com`,
        role: index % 2 === 0 ? "designer" : "partner",
        lastSignedIn: LATER,
      }),
    );
    const plan = buildCleanupPlan(baseInput({ users: [...baseInput().users, ...extras] }));
    expect(plan.keepUserIds.length).toBeLessThan(10);
    expect(plan.keepUserIds.length).toBe(9);
    const suggested = plan.users.filter((row) => row.reason === "suggested_authorized");
    expect(suggested.length).toBeGreaterThan(0);
    const authorizedExtras = extras.filter((extra) => plan.keepUserIds.includes(extra.id));
    expect(authorizedExtras.length).toBeGreaterThan(0);
    expect(authorizedExtras.length).toBeLessThan(extras.length);
    expect(plan.users.filter((row) => extras.some((extra) => extra.id === row.id) && row.action === "delete")).toHaveLength(0);
  });

  it("lets the admin add and remove keep-list ids, and refuses a tenth keep", () => {
    const quiet = user({ id: 34, name: "Casey Quiet", email: "casey.quiet@gmail.com" });
    const auto = buildCleanupPlan(baseInput({ users: [...baseInput().users, quiet] }));
    expect(auto.users.find((row) => row.id === ron.id)?.action).toBe("keep");

    const removed = buildCleanupPlan(
      baseInput({
        users: [...baseInput().users, quiet],
        keepUserIds: auto.keepUserIds.filter((id) => id !== ron.id),
      }),
    );
    expect(removed.users.find((row) => row.id === ron.id)).toMatchObject({ action: "delete", reason: "removed_from_keep" });
    expect(removed.users.find((row) => row.id === tom.id)?.action).toBe("keep");

    const added = buildCleanupPlan(
      baseInput({
        users: [...baseInput().users, quiet],
        keepUserIds: [...auto.keepUserIds.filter((id) => id !== selenaSpelling.id), quiet.id],
      }),
    );
    expect(added.users.find((row) => row.id === quiet.id)?.action).toBe("keep");

    expect(() =>
      buildCleanupPlan(
        baseInput({
          keepUserIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          users: [
            ...baseInput().users,
            user({ id: 9, name: "Ninth", email: "ninth@cabinetdealz.com", role: "designer" }),
            user({ id: 10, name: "Tenth", email: "tenth@cabinetdealz.com", role: "designer" }),
          ],
        }),
      ),
    ).toThrow(CleanupPlanError);
  });

  it("never deletes the signed-in admin or the last admin", () => {
    const only = user({ id: 1, name: "Test Admin", email: "admin@example.com", role: "admin", openId: "only-admin" });
    const plan = buildCleanupPlan(
      baseInput({
        actorUserId: only.id,
        ownerEmail: "someone-else@cabinetdealz.com",
        ownerOpenId: "not-this",
        users: [only, user({ id: 2, name: "Gone", email: "gone@example.com" })],
        affiliates: [],
        keepUserIds: [],
        alsoDeleteUserIds: [only.id],
      }),
    );
    expect(plan.users.find((row) => row.id === only.id)?.action).toBe("keep");
    expect(plan.forcedUserIds).toContain(only.id);
    expect(plan.warnings.some((warning) => warning.includes("signed-in admin") || warning.includes("last admin"))).toBe(true);
  });

  it("preserves affiliate rows and only unlinks affiliates whose user is deleted", () => {
    const disposable = user({ id: 40, name: "Seed Affiliate", email: "seed@example.com", role: "partner" });
    const disposableAffiliate: PlannerAffiliate = {
      id: 77,
      userId: disposable.id,
      contactName: "Seed Affiliate",
      email: "seed@example.com",
      storeName: "Seed Store",
      status: "paused",
      updatedAt: T1,
    };
    const plan = buildCleanupPlan(
      baseInput({
        users: [...baseInput().users, disposable],
        affiliates: [marcusAffiliate, disposableAffiliate],
      }),
    );
    expect(plan.preservedAffiliates.map((row) => row.id)).toContain(marcusAffiliate.id);
    expect(plan.unlinkedAffiliates.map((row) => row.id)).toEqual([disposableAffiliate.id]);
    expect(plan.unlinks).toContainEqual({ table: "affiliates", id: disposableAffiliate.id, field: "userId", updatedAt: T1 });
    expect(plan.children.some((row) => row.table === "affiliates")).toBe(false);
    expect(plan.estimates).toHaveLength(0);
  });

  it("keeps a labor estimate attached to a kept deal and deletes one attached only to a fake order", () => {
    const mike = user({ id: 30, name: "Mike James", email: "mikejames@yahoo.com" });
    const plan = buildCleanupPlan(
      baseInput({
        users: [...baseInput().users, mike],
        orderRequests: [
          {
            id: 300,
            userId: mike.id,
            requestNumber: "OR-300",
            originatorName: "Mike James",
            originatorEmail: mike.email,
            status: "draft",
            notes: null,
            paidAt: null,
            stripeSessionId: null,
            stripePaymentIntentId: null,
            createdAt: T0,
            updatedAt: T1,
          },
        ],
        deals: [
          {
            id: 401,
            title: "Seliena remodel",
            contactName: "Seliena Bilodeau",
            contactEmail: seliena.email,
            ownerUserId: tom.id,
            affiliateId: marcusAffiliate.id,
            orderRequestId: null,
            notes: null,
            stage: "quoted",
            createdAt: T0,
            updatedAt: T1,
            activityCount: 1,
            laborEstimateId: 900,
          },
        ],
        estimates: [
          {
            id: 900,
            affiliateId: marcusAffiliate.id,
            orderRequestId: 300,
            kitchenDesignId: null,
            crmDealId: 401,
            customerName: "Seliena Bilodeau",
            customerEmail: seliena.email,
            updatedAt: T1,
          },
          {
            id: 901,
            affiliateId: 77,
            orderRequestId: 300,
            kitchenDesignId: null,
            crmDealId: null,
            customerName: "Mike James",
            customerEmail: mike.email,
            updatedAt: T1,
          },
        ],
      }),
    );
    expect(plan.estimates.find((row) => row.id === 900)?.action).toBe("keep");
    expect(plan.unlinks).toContainEqual({
      table: "affiliate_installation_estimates",
      id: 900,
      field: "orderRequestId",
      updatedAt: T1,
    });
    expect(plan.estimates.find((row) => row.id === 901)?.action).toBe("delete");
  });

  it("rejects a confirm when the snapshot no longer matches", () => {
    const mike = user({ id: 30, name: "Mike James", email: "mikejames@yahoo.com", updatedAt: T1 });
    const input = baseInput({
      users: [...baseInput().users, mike],
      children: [{ table: "password_reset_tokens", id: 5, updatedAt: T1, links: [{ kind: "user", id: mike.id }] }],
    });
    const preview = canonicalSnapshot(buildCleanupPlan(input));
    const same = canonicalSnapshot(buildCleanupPlan(input));
    expect(evaluateConfirm(preview, same)).toEqual({ ok: true });
    expect(hashSnapshot(preview)).toBe(hashSnapshot(same));
    const flipped = {
      supabaseAuthIds: preview.supabaseAuthIds,
      unlinks: preview.unlinks,
      deleteEstimates: preview.deleteEstimates,
      deleteStripe: preview.deleteStripe,
      deleteChildren: preview.deleteChildren,
      deleteDeals: preview.deleteDeals,
      deleteLegacyOrders: preview.deleteLegacyOrders,
      deleteOrders: preview.deleteOrders,
      deleteUsers: preview.deleteUsers,
      deleteSupabaseAuth: preview.deleteSupabaseAuth,
      alsoDeleteUserIds: preview.alsoDeleteUserIds,
      keepUserIds: preview.keepUserIds,
      v: preview.v,
    };
    expect(hashSnapshot(flipped)).toBe(hashSnapshot(preview));

    const changed = buildCleanupPlan(
      baseInput({
        users: [...baseInput().users, { ...mike, updatedAt: "2026-04-01T00:00:00.000Z" }],
        children: input.children,
      }),
    );
    expect(evaluateConfirm(preview, canonicalSnapshot(changed))).toEqual({ ok: false, code: "SNAPSHOT_MISMATCH" });
    expect(() => assertSnapshotMatch(preview, canonicalSnapshot(changed))).toThrow(SnapshotMismatchError);

    const extraChild = buildCleanupPlan(
      baseInput({
        users: input.users,
        children: [
          ...(input.children ?? []),
          { table: "password_reset_tokens", id: 6, updatedAt: T1, links: [{ kind: "user", id: mike.id }] },
        ],
      }),
    );
    expect(evaluateConfirm(preview, canonicalSnapshot(extraChild)).ok).toBe(false);
  });

  it("writes a CSV covering deletes and keeps without credential fields", () => {
    const plan = buildCleanupPlan(
      baseInput({
        users: [...baseInput().users, user({ id: 31, name: "Pat", email: "pat@example.com" })],
      }),
    );
    const csv = planToCsv(plan);
    expect(csv.split("\n")[0]).toContain("hasRealPayment");
    expect(csv).toContain("users,1,named_tom");
    expect(csv).toContain("example_email");
    expect(csv).not.toContain("passwordHash");
    expect(redactRow({ id: 1, passwordHash: "secret-hash", tokenHash: "abc", name: "Pat" })).toEqual({
      id: 1,
      passwordHash: "[redacted]",
      tokenHash: "[redacted]",
      name: "Pat",
    });
  });

  it("does not call the network when checking Supabase delete bookkeeping", async () => {
    const calls: string[] = [];
    const result = await deleteSupabaseAuthUsers(["auth-1", "auth-2"], {
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "test-only",
      fetcher: async (url) => {
        calls.push(url);
        return { ok: url.endsWith("auth-1"), status: url.endsWith("auth-1") ? 200 : 404 };
      },
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("/auth/v1/admin/users/auth-1");
    expect(result.deleted).toEqual(["auth-1", "auth-2"]);
    expect(result.failed).toHaveLength(0);
    expect(JSON.stringify(result)).not.toMatch(/service|Bearer|apikey/i);
  });
});
