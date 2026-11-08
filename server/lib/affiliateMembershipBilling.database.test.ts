import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliateInvoices, affiliates } from "../../drizzle/schema";
import { FakeDb } from "./testing/fakeMembershipDb";
import {
  cancelMembershipAtPeriodEnd,
  ensureOpenInvoice,
  getInvoice,
  listAffiliateInvoices,
  markInvoicePaid,
  recordStripeMembershipPayment,
} from "./affiliateMembershipBilling";
import type { Database } from "./affiliateMembership";

const AFFILIATE_ID = 7;
const NOW = Date.UTC(2026, 2, 10, 9, 0, 0); // March 10, 2026

function freshAffiliate(overrides: Record<string, unknown> = {}) {
  return {
    id: AFFILIATE_ID,
    storeName: "North Shore Cabinets",
    membershipStatus: "pending",
    membershipPlan: "annual",
    membershipFeeCents: 119500,
    membershipPaidAt: null,
    membershipExpiresAt: null,
    membershipCommittedUntil: null,
    membershipCancelledAt: null,
    membershipStripeSubscriptionId: null,
    ...overrides,
  };
}

/** The plan columns all come from one hand-run SQL file, so they go missing together. */
const MISSING_PLAN_COLUMNS = [
  "membershipPlan",
  "membershipCommittedUntil",
  "membershipCancelledAt",
  "membershipStripeSubscriptionId",
];

function db(options: { affiliate?: Record<string, unknown>; invoices?: Record<string, unknown>[]; planColumns?: boolean } = {}) {
  const planColumns = options.planColumns ?? true;
  const fake = new FakeDb([
    {
      table: affiliates,
      rows: [freshAffiliate(options.affiliate)],
      missingColumns: planColumns ? [] : MISSING_PLAN_COLUMNS,
    },
    {
      table: affiliateInvoices,
      rows: options.invoices ?? [],
      missingColumns: planColumns ? [] : ["membershipPlan", "periodNumber", "committedUntil"],
    },
  ]);
  return { fake, db: fake as unknown as Database };
}

async function insertInvoice(fake: FakeDb, values: Record<string, unknown>) {
  const missing = fake.tables.get(affiliateInvoices)?.missingColumns ?? new Set<string>();
  const base: Record<string, unknown> = {
    affiliateId: AFFILIATE_ID,
    invoiceNumber: `AFF-TEST-${Math.random().toString(36).slice(2, 8)}`,
    description: "Annual affiliate membership",
    amountCents: 119500,
    status: "open",
    paymentMethod: "none",
    paymentRef: null,
    periodStart: null,
    periodEnd: null,
    issuedAt: new Date(NOW),
    paidAt: null,
    paidByUserId: null,
  };
  const planExtras: Record<string, unknown> = {
    membershipPlan: "annual",
    periodNumber: 1,
    committedUntil: null,
  };
  // A legacy database has no plan columns, so the row must not contain them.
  const row: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(planExtras)) {
    if (!missing.has(key)) row[key] = value;
  }
  Object.assign(row, values);
  for (const key of missing) delete row[key];
  const id = (await fake.insert(affiliateInvoices).values(row as never)) as unknown as [{ insertId: number }];
  return id[0].insertId;
}

describe("ensureOpenInvoice", () => {
  it("creates a monthly invoice at $169 and reuses it on a second call", async () => {
    const { fake, db: database } = db();
    const first = await ensureOpenInvoice(database, AFFILIATE_ID, "monthly");
    expect(first?.amountCents).toBe(16900);
    expect(first?.membershipPlan).toBe("monthly");
    expect(first?.status).toBe("open");

    const second = await ensureOpenInvoice(database, AFFILIATE_ID, "monthly");
    expect(second?.id).toBe(first?.id);
    expect(fake.rows(affiliateInvoices)).toHaveLength(1);
  });

  it("creates an annual invoice at $1,195 by default", async () => {
    const { db: database } = db();
    const invoice = await ensureOpenInvoice(database, AFFILIATE_ID, undefined);
    expect(invoice?.amountCents).toBe(119500);
    expect(invoice?.membershipPlan).toBe("annual");
  });

  it("re-points the single open invoice when the member switches plan", async () => {
    const { fake, db: database } = db();
    const annual = await ensureOpenInvoice(database, AFFILIATE_ID, "annual");
    const monthly = await ensureOpenInvoice(database, AFFILIATE_ID, "monthly");
    expect(monthly?.id).toBe(annual?.id);
    expect(monthly?.amountCents).toBe(16900);
    expect(fake.rows(affiliateInvoices)).toHaveLength(1);
  });

  it("still issues an annual invoice before the hand-run SQL is applied", async () => {
    const { db: database } = db({ planColumns: false });
    const invoice = await ensureOpenInvoice(database, AFFILIATE_ID, "annual");
    expect(invoice?.amountCents).toBe(119500);
    expect(invoice?.planColumnsAvailable).toBe(false);
  });
});

describe("markInvoicePaid — plan math", () => {
  it("annual: one year of access, commitment is the same date", async () => {
    const { fake, db: database } = db();
    const invoiceId = await insertInvoice(fake, {});
    const result = await markInvoicePaid(database, {
      invoiceId,
      paidAtMs: NOW,
      paymentMethod: "manual",
      paidByUserId: 1,
    });
    expect(result.periodEnd?.getTime()).toBe(Date.UTC(2027, 2, 10, 9, 0, 0));

    const [affiliate] = fake.rows(affiliates);
    expect(affiliate.membershipStatus).toBe("active");
    expect(affiliate.membershipPlan).toBe("annual");
    expect((affiliate.membershipExpiresAt as Date).getTime()).toBe(Date.UTC(2027, 2, 10, 9, 0, 0));
    expect((affiliate.membershipCommittedUntil as Date).getTime()).toBe(Date.UTC(2027, 2, 10, 9, 0, 0));
  });

  it("monthly: one month of access, three-month commitment", async () => {
    const { fake, db: database } = db();
    const invoiceId = await insertInvoice(fake, { membershipPlan: "monthly", amountCents: 16900 });
    await markInvoicePaid(database, { invoiceId, paidAtMs: NOW, paymentMethod: "external_card" });

    const [affiliate] = fake.rows(affiliates);
    expect(affiliate.membershipPlan).toBe("monthly");
    expect(affiliate.membershipFeeCents).toBe(16900);
    expect((affiliate.membershipExpiresAt as Date).getTime()).toBe(Date.UTC(2026, 3, 10, 9, 0, 0));
    expect((affiliate.membershipCommittedUntil as Date).getTime()).toBe(Date.UTC(2026, 5, 10, 9, 0, 0));

    const invoice = await getInvoice(database, invoiceId);
    expect(invoice?.status).toBe("paid");
    expect(invoice?.paymentMethod).toBe("external_card");
    expect(invoice?.committedUntil?.getTime()).toBe(Date.UTC(2026, 5, 10, 9, 0, 0));
  });

  it("monthly months 2 and 3 extend access but keep the original commitment", async () => {
    const { fake, db: database } = db();
    const month1 = await insertInvoice(fake, { membershipPlan: "monthly", amountCents: 16900 });
    await markInvoicePaid(database, { invoiceId: month1, paidAtMs: NOW, paymentMethod: "manual" });

    const month2 = await insertInvoice(fake, { membershipPlan: "monthly", amountCents: 16900 });
    await markInvoicePaid(database, {
      invoiceId: month2,
      paidAtMs: Date.UTC(2026, 3, 10, 9, 0, 0),
      paymentMethod: "manual",
    });
    const [affiliate] = fake.rows(affiliates);
    expect((affiliate.membershipExpiresAt as Date).getTime()).toBe(Date.UTC(2026, 4, 10, 9, 0, 0));
    expect((affiliate.membershipCommittedUntil as Date).getTime()).toBe(Date.UTC(2026, 5, 10, 9, 0, 0));
  });

  it("does nothing to an invoice that is already paid", async () => {
    const { fake, db: database } = db();
    const invoiceId = await insertInvoice(fake, { status: "paid" });
    const result = await markInvoicePaid(database, { invoiceId, paidAtMs: NOW, paymentMethod: "manual" });
    expect(result.alreadyPaid).toBe(true);
  });

  it("marks paid and activates without the plan columns (deploy-before-SQL)", async () => {
    const { fake, db: database } = db({ planColumns: false });
    const invoiceId = await insertInvoice(fake, {});
    const result = await markInvoicePaid(database, { invoiceId, paidAtMs: NOW, paymentMethod: "manual" });
    expect(result.alreadyPaid).toBe(false);
    const [affiliate] = fake.rows(affiliates);
    expect(affiliate.membershipStatus).toBe("active");
    expect((affiliate.membershipExpiresAt as Date).getTime()).toBe(Date.UTC(2027, 2, 10, 9, 0, 0));
  });
});

describe("recordStripeMembershipPayment", () => {
  it("records the first monthly payment and keeps the subscription id", async () => {
    const { fake, db: database } = db();
    const result = await recordStripeMembershipPayment(database, {
      affiliateId: AFFILIATE_ID,
      plan: "monthly",
      paidAtMs: NOW,
      paymentRef: "sub_123:first",
      stripeSubscriptionId: "sub_123",
    });
    expect(result.applied).toBe(true);
    const [affiliate] = fake.rows(affiliates);
    expect(affiliate.membershipStatus).toBe("active");
    expect(affiliate.membershipPlan).toBe("monthly");
    expect(affiliate.membershipStripeSubscriptionId).toBe("sub_123");
    expect((affiliate.membershipCommittedUntil as Date).getTime()).toBe(Date.UTC(2026, 5, 10, 9, 0, 0));

    const invoices = await listAffiliateInvoices(database, AFFILIATE_ID);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].paymentRef).toBe("sub_123:first");
    expect(invoices[0].periodNumber).toBe(1);
  });

  it("is idempotent for a retried webhook (same reference)", async () => {
    const { fake, db: database } = db();
    const first = await recordStripeMembershipPayment(database, {
      affiliateId: AFFILIATE_ID,
      plan: "monthly",
      paidAtMs: NOW,
      paymentRef: "sub_123:first",
      stripeSubscriptionId: "sub_123",
    });
    const retried = await recordStripeMembershipPayment(database, {
      affiliateId: AFFILIATE_ID,
      plan: "monthly",
      paidAtMs: NOW,
      paymentRef: "sub_123:first",
      stripeSubscriptionId: "sub_123",
    });
    expect(first.applied).toBe(true);
    expect(retried.applied).toBe(false);
    expect(fake.rows(affiliateInvoices)).toHaveLength(1);
    expect((fake.rows(affiliates)[0].membershipExpiresAt as Date).getTime()).toBe(Date.UTC(2026, 3, 10, 9, 0, 0));
  });

  it("counts month 2 as period 2 and extends by one month from the paid-through date", async () => {
    const { fake, db: database } = db();
    await recordStripeMembershipPayment(database, {
      affiliateId: AFFILIATE_ID,
      plan: "monthly",
      paidAtMs: NOW,
      paymentRef: "sub_123:first",
      stripeSubscriptionId: "sub_123",
    });
    await recordStripeMembershipPayment(database, {
      affiliateId: AFFILIATE_ID,
      plan: "monthly",
      paidAtMs: Date.UTC(2026, 3, 8, 9, 0, 0), // billed 2 days early
      paymentRef: "sub_123:in_2",
      stripeSubscriptionId: "sub_123",
    });
    const invoices = await listAffiliateInvoices(database, AFFILIATE_ID);
    const renewal = invoices.find((row) => row.paymentRef === "sub_123:in_2");
    expect(renewal?.periodNumber).toBe(2);
    // Stacks from the previous paid-through date, so paying early loses no days.
    expect(renewal?.periodEnd?.getTime()).toBe(Date.UTC(2026, 4, 10, 9, 0, 0));
    expect((fake.rows(affiliates)[0].membershipCommittedUntil as Date).getTime()).toBe(Date.UTC(2026, 5, 10, 9, 0, 0));
  });

  it("marks an existing open invoice paid instead of creating a second one", async () => {
    const { fake, db: database } = db();
    const open = await insertInvoice(fake, { membershipPlan: "monthly", amountCents: 16900 });
    await recordStripeMembershipPayment(database, {
      affiliateId: AFFILIATE_ID,
      plan: "monthly",
      paidAtMs: NOW,
      paymentRef: "cs_test_1",
    });
    expect(fake.rows(affiliateInvoices)).toHaveLength(1);
    const invoice = await getInvoice(database, open);
    expect(invoice?.status).toBe("paid");
    expect(invoice?.paymentRef).toBe("cs_test_1");
  });
});

describe("cancelMembershipAtPeriodEnd", () => {
  it("stamps the cancel date and leaves the paid-through date alone", async () => {
    const { fake, db: database } = db({
      affiliate: {
        membershipStatus: "active",
        membershipPlan: "monthly",
        membershipExpiresAt: new Date(Date.UTC(2026, 5, 1)),
        membershipCommittedUntil: new Date(Date.UTC(2026, 4, 10)),
      },
    });
    const result = await cancelMembershipAtPeriodEnd(database, AFFILIATE_ID, NOW);
    expect(result.accessUntil?.getTime()).toBe(Date.UTC(2026, 5, 1));
    const [affiliate] = fake.rows(affiliates);
    expect((affiliate.membershipCancelledAt as Date).getTime()).toBe(NOW);
    expect((affiliate.membershipExpiresAt as Date).getTime()).toBe(Date.UTC(2026, 5, 1));
    expect(affiliate.membershipStatus).toBe("active");
  });

  it("refuses to pretend a cancel happened while the plan columns are missing", async () => {
    const { db: database } = db({ planColumns: false });
    await expect(cancelMembershipAtPeriodEnd(database, AFFILIATE_ID, NOW)).rejects.toThrow(/membership plan columns/i);
  });
});

describe("listAffiliateInvoices", () => {
  it("returns legacy rows as annual when the plan columns are missing", async () => {
    const { fake, db: database } = db({ planColumns: false });
    await insertInvoice(fake, {});
    const rows = await listAffiliateInvoices(database, AFFILIATE_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].membershipPlan).toBe("annual");
    expect(rows[0].planColumnsAvailable).toBe(false);
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
});
