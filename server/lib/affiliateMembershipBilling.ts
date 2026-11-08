/**
 * Invoice and membership writes for the two affiliate plans.
 *
 * Everything here is a single SQL statement per call, and every write that
 * touches a hand-run column is retried once without those columns. That is what
 * lets the application deploy before Tom runs
 * docs/sql/0269_membership_plan_options.tidb.sql: until then, invoices are
 * annual and the membership simply has no commitment date.
 */

import { desc, eq } from "drizzle-orm";
import { affiliateInvoices, affiliates } from "../../drizzle/schema";
import {
  MEMBERSHIP_PLAN_OPTIONS,
  computeMembershipTerm,
  membershipPlanOption,
  normalizeMembershipPlan,
  type MembershipPlan,
  type MembershipTerm,
} from "@shared/affiliateMembershipPlans";
import {
  isMissingMembershipColumnError,
  loadMembershipSnapshot,
  type Database,
  type MembershipSnapshot,
} from "./affiliateMembership";

export type PaymentMethod = "stripe" | "external_card" | "manual";

/** An invoice row as this module reads it. Plan fields are null before the SQL runs. */
export interface MembershipInvoice {
  id: number;
  affiliateId: number;
  invoiceNumber: string;
  description: string;
  amountCents: number;
  status: "open" | "paid" | "void";
  paymentMethod: "stripe" | "external_card" | "manual" | "none";
  paymentRef: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  issuedAt: Date;
  paidAt: Date | null;
  paidByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
  membershipPlan: MembershipPlan;
  periodNumber: number;
  committedUntil: Date | null;
  /** False when the row was read from the legacy column set. */
  planColumnsAvailable: boolean;
}

export function invoiceNumber(year: number, id: number): string {
  return `AFF-${year}-${String(id).padStart(4, "0")}`;
}

export function planDescription(plan: MembershipPlan): string {
  return plan === "annual" ? "Annual affiliate membership" : "Monthly affiliate membership";
}

async function writeWithPlanColumns<T>(full: () => Promise<T>, legacy: () => Promise<T>): Promise<T> {
  try {
    return await full();
  } catch (error) {
    if (!isMissingMembershipColumnError(error)) throw error;
    return legacy();
  }
}

const baseInvoiceColumns = {
  id: affiliateInvoices.id,
  affiliateId: affiliateInvoices.affiliateId,
  invoiceNumber: affiliateInvoices.invoiceNumber,
  description: affiliateInvoices.description,
  amountCents: affiliateInvoices.amountCents,
  status: affiliateInvoices.status,
  paymentMethod: affiliateInvoices.paymentMethod,
  paymentRef: affiliateInvoices.paymentRef,
  periodStart: affiliateInvoices.periodStart,
  periodEnd: affiliateInvoices.periodEnd,
  issuedAt: affiliateInvoices.issuedAt,
  paidAt: affiliateInvoices.paidAt,
  paidByUserId: affiliateInvoices.paidByUserId,
  createdAt: affiliateInvoices.createdAt,
  updatedAt: affiliateInvoices.updatedAt,
};

const planAwareInvoiceColumns = {
  ...baseInvoiceColumns,
  membershipPlan: affiliateInvoices.membershipPlan,
  periodNumber: affiliateInvoices.periodNumber,
  committedUntil: affiliateInvoices.committedUntil,
};

type LegacyInvoiceRow = {
  id: number;
  affiliateId: number;
  invoiceNumber: string;
  description: string;
  amountCents: number;
  status: "open" | "paid" | "void";
  paymentMethod: "stripe" | "external_card" | "manual" | "none";
  paymentRef: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  issuedAt: Date;
  paidAt: Date | null;
  paidByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

function withPlanDefaults(row: LegacyInvoiceRow): MembershipInvoice {
  return {
    ...row,
    membershipPlan: "annual",
    periodNumber: 1,
    committedUntil: null,
    planColumnsAvailable: false,
  };
}

/**
 * Invoice list for one affiliate, newest first. Falls back to the legacy column
 * set while the hand-run SQL has not been applied, so the member page and the
 * admin list keep rendering.
 */
export async function listAffiliateInvoices(db: Database, affiliateId: number): Promise<MembershipInvoice[]> {
  return writeWithPlanColumns<MembershipInvoice[]>(
    async () => {
      const rows = await db
        .select(planAwareInvoiceColumns)
        .from(affiliateInvoices)
        .where(eq(affiliateInvoices.affiliateId, affiliateId))
        .orderBy(desc(affiliateInvoices.issuedAt));
      return rows.map((row) => ({ ...row, planColumnsAvailable: true }));
    },
    async () => {
      const rows = await db
        .select(baseInvoiceColumns)
        .from(affiliateInvoices)
        .where(eq(affiliateInvoices.affiliateId, affiliateId))
        .orderBy(desc(affiliateInvoices.issuedAt));
      return rows.map(withPlanDefaults);
    },
  );
}

/** Admin-wide list, newest first. */
export async function listAllAffiliateInvoices(db: Database, limit = 1000): Promise<MembershipInvoice[]> {
  return writeWithPlanColumns<MembershipInvoice[]>(
    async () => {
      const rows = await db
        .select(planAwareInvoiceColumns)
        .from(affiliateInvoices)
        .orderBy(desc(affiliateInvoices.issuedAt))
        .limit(limit);
      return rows.map((row) => ({ ...row, planColumnsAvailable: true }));
    },
    async () => {
      const rows = await db
        .select(baseInvoiceColumns)
        .from(affiliateInvoices)
        .orderBy(desc(affiliateInvoices.issuedAt))
        .limit(limit);
      return rows.map(withPlanDefaults);
    },
  );
}

export async function getInvoice(db: Database, invoiceId: number): Promise<MembershipInvoice | null> {
  return writeWithPlanColumns<MembershipInvoice | null>(
    async () => {
      const [row] = await db
        .select(planAwareInvoiceColumns)
        .from(affiliateInvoices)
        .where(eq(affiliateInvoices.id, invoiceId))
        .limit(1);
      return row ? { ...row, planColumnsAvailable: true } : null;
    },
    async () => {
      const [row] = await db
        .select(baseInvoiceColumns)
        .from(affiliateInvoices)
        .where(eq(affiliateInvoices.id, invoiceId))
        .limit(1);
      return row ? withPlanDefaults(row) : null;
    },
  );
}

/**
 * Ensure an affiliate has an OPEN invoice for the plan they asked for.
 *
 * Only one open invoice exists per affiliate. If the open invoice is for a
 * different plan, it is re-pointed at the requested plan and amount rather than
 * leaving two open invoices — an affiliate who opens the page on monthly after
 * an annual invoice was sitting there should see one clean total.
 */
export async function ensureOpenInvoice(
  db: Database,
  affiliateId: number,
  planInput: unknown,
): Promise<MembershipInvoice | null> {
  const plan = normalizeMembershipPlan(planInput);
  const option = membershipPlanOption(plan);
  const invoices = await listAffiliateInvoices(db, affiliateId);
  const open = invoices.find((row) => row.status === "open");
  if (open) {
    if (open.membershipPlan === plan && open.amountCents === option.amountCents) return open;
    await writeWithPlanColumns(
      () =>
        db
          .update(affiliateInvoices)
          .set({ membershipPlan: plan, amountCents: option.amountCents, description: planDescription(plan) })
          .where(eq(affiliateInvoices.id, open.id)),
      () =>
        db
          .update(affiliateInvoices)
          .set({ amountCents: option.amountCents, description: planDescription(plan) })
          .where(eq(affiliateInvoices.id, open.id)),
    );
    return getInvoice(db, open.id);
  }

  // Temporary unique placeholder so the unique constraint is satisfied on
  // insert, then patched with the real number derived from the generated id.
  const placeholder = `AFF-TMP-${affiliateId}-${Date.now()}`;
  const res = await writeWithPlanColumns(
    () =>
      db.insert(affiliateInvoices).values({
        affiliateId,
        invoiceNumber: placeholder,
        description: planDescription(plan),
        amountCents: option.amountCents,
        membershipPlan: plan,
        periodNumber: 1,
        status: "open",
        paymentMethod: "none",
      }),
    () =>
      db.insert(affiliateInvoices).values({
        affiliateId,
        invoiceNumber: placeholder,
        description: planDescription(plan),
        amountCents: option.amountCents,
        status: "open",
        paymentMethod: "none",
      }),
  );
  const id = (res as unknown as [{ insertId: number }])[0].insertId;
  await db
    .update(affiliateInvoices)
    .set({ invoiceNumber: invoiceNumber(new Date().getFullYear(), id) })
    .where(eq(affiliateInvoices.id, id));
  return getInvoice(db, id);
}

/** Next billing period number for a plan, based on how many were paid so far. */
export async function nextPeriodNumber(db: Database, affiliateId: number, plan: MembershipPlan): Promise<number> {
  const rows = await listAffiliateInvoices(db, affiliateId);
  return rows.filter((row) => row.status === "paid" && row.membershipPlan === plan).length + 1;
}

export interface PaymentTermResult {
  term: MembershipTerm;
  plan: MembershipPlan;
  snapshotBefore: MembershipSnapshot | null;
}

/**
 * Work out the term a payment buys without writing anything. The admin preview,
 * the Stripe webhook, and the tests all share this one calculation.
 */
export async function planPaymentTerm(
  db: Database,
  affiliateId: number,
  planInput: unknown,
  paidAtMs: number,
): Promise<PaymentTermResult> {
  const plan = normalizeMembershipPlan(planInput);
  const before = await loadMembershipSnapshot(db, affiliateId);
  const term = computeMembershipTerm({
    plan,
    paidAtMs,
    currentPeriodEndMs: before?.expiresAt?.getTime() ?? null,
    currentCommitmentEndMs: before?.committedUntil?.getTime() ?? null,
  });
  return { term, plan, snapshotBefore: before };
}

export async function activateMembership(
  db: Database,
  input: {
    affiliateId: number;
    plan: MembershipPlan;
    term: MembershipTerm;
    paidAtMs: number;
    stripeSubscriptionId?: string | null;
  },
): Promise<void> {
  const option = MEMBERSHIP_PLAN_OPTIONS[input.plan];
  const paidAt = new Date(input.paidAtMs);
  const expiresAt = new Date(input.term.periodEndMs);
  const committedUntil = new Date(input.term.commitmentEndsAtMs);
  await writeWithPlanColumns(
    () =>
      db
        .update(affiliates)
        .set({
          membershipStatus: "active",
          membershipPlan: input.plan,
          membershipFeeCents: option.amountCents,
          membershipPaidAt: paidAt,
          membershipExpiresAt: expiresAt,
          membershipCommittedUntil: committedUntil,
          membershipCancelledAt: null,
          ...(input.stripeSubscriptionId ? { membershipStripeSubscriptionId: input.stripeSubscriptionId } : {}),
        })
        .where(eq(affiliates.id, input.affiliateId)),
    () =>
      db
        .update(affiliates)
        .set({
          membershipStatus: "active",
          membershipFeeCents: option.amountCents,
          membershipPaidAt: paidAt,
          membershipExpiresAt: expiresAt,
        })
        .where(eq(affiliates.id, input.affiliateId)),
  );
}

/**
 * Mark one invoice paid and activate or extend the membership for its plan.
 * Every caller (admin, self-serve Checkout, subscription renewal) goes through
 * here so the expiry math can never drift between payment paths.
 */
export async function markInvoicePaid(
  db: Database,
  input: {
    invoiceId: number;
    paidAtMs: number;
    paymentMethod: PaymentMethod;
    paymentRef?: string | null;
    paidByUserId?: number | null;
    planOverride?: MembershipPlan | null;
  },
): Promise<{ ok: true; alreadyPaid: boolean; periodEnd?: Date; committedUntil?: Date; plan?: MembershipPlan }> {
  const inv = await getInvoice(db, input.invoiceId);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status === "paid") return { ok: true, alreadyPaid: true };

  const plan = input.planOverride ?? inv.membershipPlan;
  const { term } = await planPaymentTerm(db, inv.affiliateId, plan, input.paidAtMs);
  const paidAt = new Date(input.paidAtMs);
  const periodEnd = new Date(term.periodEndMs);
  const committedUntil = new Date(term.commitmentEndsAtMs);

  await writeWithPlanColumns(
    () =>
      db
        .update(affiliateInvoices)
        .set({
          status: "paid",
          membershipPlan: plan,
          amountCents: membershipPlanOption(plan).amountCents,
          paymentMethod: input.paymentMethod,
          paymentRef: input.paymentRef ?? null,
          paidAt,
          paidByUserId: input.paidByUserId ?? null,
          periodStart: new Date(term.periodStartMs),
          periodEnd,
          committedUntil,
        })
        .where(eq(affiliateInvoices.id, inv.id)),
    () =>
      db
        .update(affiliateInvoices)
        .set({
          status: "paid",
          amountCents: membershipPlanOption(plan).amountCents,
          paymentMethod: input.paymentMethod,
          paymentRef: input.paymentRef ?? null,
          paidAt,
          paidByUserId: input.paidByUserId ?? null,
          periodStart: new Date(term.periodStartMs),
          periodEnd,
        })
        .where(eq(affiliateInvoices.id, inv.id)),
  );

  await activateMembership(db, { affiliateId: inv.affiliateId, plan, term, paidAtMs: input.paidAtMs });

  return { ok: true, alreadyPaid: false, periodEnd, committedUntil, plan };
}

/**
 * Record a Stripe payment that arrived without a matching open invoice (a
 * self-serve Checkout, or a subscription renewal). The Stripe reference is the
 * idempotency key: a webhook retry finds the paid row and does nothing.
 */
export async function recordStripeMembershipPayment(
  db: Database,
  input: {
    affiliateId: number;
    plan: MembershipPlan;
    paidAtMs: number;
    paymentRef: string;
    amountCents?: number;
    description?: string;
    stripeSubscriptionId?: string | null;
    /** The open invoice the member was looking at, when Checkout carried it. */
    invoiceId?: number | null;
  },
): Promise<{ applied: boolean; periodEnd?: Date; committedUntil?: Date }> {
  const ref = input.paymentRef.trim();
  if (!ref) throw new Error("A Stripe reference is required.");
  const alreadyPaidWithRef = (
    await db
      .select({ id: affiliateInvoices.id, status: affiliateInvoices.status })
      .from(affiliateInvoices)
      .where(eq(affiliateInvoices.paymentRef, ref))
      .limit(1)
  )[0];
  if (alreadyPaidWithRef?.status === "paid") {
    const snapshot = await loadMembershipSnapshot(db, input.affiliateId);
    return {
      applied: false,
      periodEnd: snapshot?.expiresAt ?? undefined,
      committedUntil: snapshot?.committedUntil ?? undefined,
    };
  }

  // Prefer the invoice the member was actually paying: Checkout carries its id.
  // Without one, only the very first payment may adopt a stray open invoice —
  // a later renewal must not be attached to an unrelated open annual invoice.
  const invoicesForAffiliate = await listAffiliateInvoices(db, input.affiliateId);
  const hasPaidHistory = invoicesForAffiliate.some((row) => row.status === "paid");
  const adoptedOpenId = hasPaidHistory ? null : invoicesForAffiliate.find((row) => row.status === "open")?.id ?? null;
  const targetInvoiceId = input.invoiceId ?? adoptedOpenId;
  const targetInvoice = targetInvoiceId != null ? await getInvoice(db, targetInvoiceId) : null;

  const { term } = await planPaymentTerm(db, input.affiliateId, input.plan, input.paidAtMs);
  const periodNumber = await nextPeriodNumber(db, input.affiliateId, input.plan);

  if (targetInvoice?.status === "paid") {
    const snapshot = await loadMembershipSnapshot(db, input.affiliateId);
    return {
      applied: false,
      periodEnd: snapshot?.expiresAt ?? undefined,
      committedUntil: snapshot?.committedUntil ?? undefined,
    };
  }

  if (targetInvoice) {
    await markInvoicePaid(db, {
      invoiceId: targetInvoice.id,
      paidAtMs: input.paidAtMs,
      paymentMethod: "stripe",
      paymentRef: ref,
      planOverride: input.plan,
    });
    return { applied: true, periodEnd: new Date(term.periodEndMs), committedUntil: new Date(term.commitmentEndsAtMs) };
  }

  const placeholder = `AFF-TMP-${input.affiliateId}-${Date.now()}`;
  const res = await writeWithPlanColumns(
    () =>
      db.insert(affiliateInvoices).values({
        affiliateId: input.affiliateId,
        invoiceNumber: placeholder,
        description: input.description ?? planDescription(input.plan),
        amountCents: input.amountCents ?? membershipPlanOption(input.plan).amountCents,
        membershipPlan: input.plan,
        periodNumber,
        status: "paid",
        paymentMethod: "stripe",
        paymentRef: ref,
        paidAt: new Date(input.paidAtMs),
        periodStart: new Date(term.periodStartMs),
        periodEnd: new Date(term.periodEndMs),
        committedUntil: new Date(term.commitmentEndsAtMs),
      }),
    () =>
      db.insert(affiliateInvoices).values({
        affiliateId: input.affiliateId,
        invoiceNumber: placeholder,
        description: input.description ?? planDescription(input.plan),
        amountCents: input.amountCents ?? membershipPlanOption(input.plan).amountCents,
        status: "paid",
        paymentMethod: "stripe",
        paymentRef: ref,
        paidAt: new Date(input.paidAtMs),
        periodStart: new Date(term.periodStartMs),
        periodEnd: new Date(term.periodEndMs),
      }),
  );
  const id = (res as unknown as [{ insertId: number }])[0].insertId;
  await db
    .update(affiliateInvoices)
    .set({ invoiceNumber: invoiceNumber(new Date(input.paidAtMs).getUTCFullYear(), id) })
    .where(eq(affiliateInvoices.id, id));
  await activateMembership(db, {
    affiliateId: input.affiliateId,
    plan: input.plan,
    term,
    paidAtMs: input.paidAtMs,
    stripeSubscriptionId: input.stripeSubscriptionId ?? null,
  });

  return { applied: true, periodEnd: new Date(term.periodEndMs), committedUntil: new Date(term.commitmentEndsAtMs) };
}

/**
 * Stop the next renewal. Access keeps running to the paid-through date, which
 * is what both plans promise: the annual year is already paid, and a monthly
 * member has already paid the month they are in.
 */
export async function cancelMembershipAtPeriodEnd(
  db: Database,
  affiliateId: number,
  nowMs: number,
): Promise<{ cancelledAt: Date; accessUntil: Date | null }> {
  const snapshot = await loadMembershipSnapshot(db, affiliateId);
  if (!snapshot) throw new Error("Affiliate not found.");
  const cancelledAt = new Date(nowMs);
  await writeWithPlanColumns(
    () => db.update(affiliates).set({ membershipCancelledAt: cancelledAt }).where(eq(affiliates.id, affiliateId)),
    async () => {
      throw new Error(
        "The membership plan columns are missing. Run docs/sql/0269_membership_plan_options.tidb.sql first.",
      );
    },
  );
  return { cancelledAt, accessUntil: snapshot.expiresAt };
}

/** Renewal failed: keep the record but flag it so an admin can chase it. */
export async function markMembershipPastDue(db: Database, affiliateId: number): Promise<void> {
  await db.update(affiliates).set({ membershipStatus: "past_due" }).where(eq(affiliates.id, affiliateId));
}

export async function findAffiliateIdBySubscriptionId(db: Database, subscriptionId: string): Promise<number | null> {
  if (!subscriptionId) return null;
  try {
    const [row] = await db
      .select({ id: affiliates.id })
      .from(affiliates)
      .where(eq(affiliates.membershipStripeSubscriptionId, subscriptionId))
      .limit(1);
    return row?.id ?? null;
  } catch (error) {
    if (isMissingMembershipColumnError(error)) return null;
    throw error;
  }
}
