/**
 * Example integration suite for concurrent webhook delivery.
 *
 * This is an example only and is not wired into the application runtime.
 * Run it against an isolated MySQL 8+ test database, not production.
 *
 * Required test setup:
 *   TEST_DATABASE_URL=mysql://...
 *   The test database contains the proposed outbox, receipt, invoice,
 *   allocation, and commission tables.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";

const {
  webhookEventReceipts,
  affiliateCommissionEntries,
  distributorSubInvoices,
  orderPaymentAllocations,
} = schema;

const CONSUMER = "affiliate-commission";
const EVENT_ID = "evt_test_concurrent_paid_001";
const PAYMENT_ID = 9001;
const ALLOCATION_ID = 7101;
const SUB_INVOICE_ID = 4201;
const AFFILIATE_ID = 17;
const ORDER_ID = 1042;
const COMMISSION_LINE_ID = 50001;

const pool = mysql.createPool(process.env.TEST_DATABASE_URL ?? "");
const db = drizzle(pool, { schema, mode: "default" });

type TestDb = typeof db;

type PaidEvent = {
  id: string;
  type: "distributor_sub_invoice.paid";
  version: string;
  data: {
    order: { id: number };
    subInvoice: { id: number; distributorId: number; totalCents: number };
    payment: { id: number; providerPaymentIntentId: string; amountCents: number };
    allocation: { id: number; subInvoiceId: number; allocatedTotalCents: number };
    affiliateCommission: {
      affiliateId: number;
      commissionEntryIds: number[];
      commissionCents: number;
    };
  };
};

function testEvent(overrides: Partial<PaidEvent> = {}): PaidEvent {
  return {
    id: EVENT_ID,
    type: "distributor_sub_invoice.paid",
    version: "2026-10-08.v1",
    data: {
      order: { id: ORDER_ID },
      subInvoice: {
        id: SUB_INVOICE_ID,
        distributorId: 3,
        totalCents: 307450,
      },
      payment: {
        id: PAYMENT_ID,
        providerPaymentIntentId: "pi_test_001",
        amountCents: 307450,
      },
      allocation: {
        id: ALLOCATION_ID,
        subInvoiceId: SUB_INVOICE_ID,
        allocatedTotalCents: 307450,
      },
      affiliateCommission: {
        affiliateId: AFFILIATE_ID,
        commissionEntryIds: [81001],
        commissionCents: 20000,
      },
    },
    ...overrides,
  };
}

function payloadHash(event: PaidEvent): string {
  return crypto.createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

/**
 * The real application receiver should be imported here. This example keeps
 * the handler in the test so the locking and receipt behavior is visible.
 */
async function receivePaidEvent(
  database: TestDb,
  event: PaidEvent,
  options: { failBeforeCommit?: boolean; barrier?: Barrier } = {},
): Promise<{ status: number; duplicate?: boolean; conflict?: boolean }> {
  const hash = payloadHash(event);

  // The receipt claim is one transaction. SELECT ... FOR UPDATE makes an
  // existing receipt wait while another delivery owns it.
  const claim = await database.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(webhookEventReceipts)
      .where(
        and(
          eq(webhookEventReceipts.eventId, event.id),
          eq(webhookEventReceipts.consumerName, CONSUMER),
        ),
      )
      .limit(1)
      .for("update");

    const receipt = existing[0];
    if (receipt) {
      if (receipt.payloadHash !== hash) return { kind: "conflict" as const };
      if (receipt.status === "processed") return { kind: "duplicate" as const };

      await tx
        .update(webhookEventReceipts)
        .set({
          status: "processing",
          attempts: receipt.attempts + 1,
          processingStartedAt: new Date(),
        })
        .where(eq(webhookEventReceipts.id, receipt.id));

      return { kind: "process" as const, receiptId: receipt.id };
    }

    try {
      const insert = await tx.insert(webhookEventReceipts).values({
        eventId: event.id,
        eventType: event.type,
        consumerName: CONSUMER,
        status: "processing",
        attempts: 1,
        payloadHash: hash,
        processingStartedAt: new Date(),
      });
      return {
        kind: "process" as const,
        receiptId: Number((insert as unknown as [{ insertId: number }])[0].insertId),
      };
    } catch (error) {
      // The unique (event_id, consumer_name) key resolves a simultaneous
      // insert race. The caller retries the claim and then sees the committed
      // receipt as duplicate or processing.
      if (!isDuplicateKey(error)) throw error;
      return { kind: "race_retry" as const };
    }
  });

  if (claim.kind === "conflict") return { status: 409, conflict: true };
  if (claim.kind === "duplicate") return { status: 200, duplicate: true };
  if (claim.kind === "race_retry") {
    await waitForReceiptToSettle(database, event.id, CONSUMER);
    return receivePaidEvent(database, event, options);
  }

  // The receipt transaction has committed. The business effect and receipt
  // completion must now be committed together.
  try {
    await database.transaction(async (tx) => {
      const [allocation] = await tx
        .select()
        .from(orderPaymentAllocations)
        .where(eq(orderPaymentAllocations.id, event.data.allocation.id))
        .limit(1)
        .for("update");
      if (!allocation) throw new Error("allocation_not_found");

      if (
        allocation.subInvoiceId !== event.data.allocation.subInvoiceId
        || Number(allocation.allocatedAmount) * 100 !== event.data.allocation.allocatedTotalCents
      ) {
        throw new Error("payment_allocation_mismatch");
      }

      const [invoice] = await tx
        .select()
        .from(distributorSubInvoices)
        .where(eq(distributorSubInvoices.id, event.data.subInvoice.id))
        .limit(1)
        .for("update");
      if (!invoice || invoice.distributorId !== event.data.subInvoice.distributorId) {
        throw new Error("sub_invoice_mismatch");
      }

      // Makes the two test requests overlap while one transaction owns the
      // invoice/allocation locks.
      await options.barrier?.wait();

      await tx
        .insert(affiliateCommissionEntries)
        .values({
          affiliateId: event.data.affiliateCommission.affiliateId,
          orderRequestId: event.data.order.id,
          subInvoiceId: event.data.subInvoice.id,
          subInvoiceLineId: COMMISSION_LINE_ID,
          commissionNumber: `COM-${event.id}-${COMMISSION_LINE_ID}`,
          commissionSourceEventId: event.id,
          status: "accrued",
          grossCommissionAmount: (event.data.affiliateCommission.commissionCents / 100).toFixed(2),
          payableAmount: (event.data.affiliateCommission.commissionCents / 100).toFixed(2),
        })
        // Business uniqueness is a second line of defense if two event IDs
        // ever represent the same payment action.
        .onDuplicateKeyUpdate({
          set: { commissionSourceEventId: sql`commission_source_event_id` },
        });

      if (options.failBeforeCommit) throw new Error("simulated_crash_before_commit");

      await tx
        .update(webhookEventReceipts)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(webhookEventReceipts.id, claim.receiptId));
    });

    return { status: 200 };
  } catch (error) {
    await database
      .update(webhookEventReceipts)
      .set({
        status: "failed",
        lastErrorCode: error instanceof Error ? error.message : "consumer_failed",
      })
      .where(eq(webhookEventReceipts.id, claim.receiptId));
    return { status: 500 };
  }
}

async function waitForReceiptToSettle(
  database: TestDb,
  eventId: string,
  consumerName: string,
): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    const [receipt] = await database
      .select({ status: webhookEventReceipts.status })
      .from(webhookEventReceipts)
      .where(
        and(
          eq(webhookEventReceipts.eventId, eventId),
          eq(webhookEventReceipts.consumerName, consumerName),
        ),
      )
      .limit(1);
    if (receipt?.status === "processed" || receipt?.status === "failed") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("receipt did not settle in test timeout");
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object"
    && error != null
    && "code" in error
    && (error as { code?: string }).code === "ER_DUP_ENTRY";
}

class Barrier {
  private arrived = 0;
  private release!: () => void;
  private readonly released = new Promise<void>((resolve) => { this.release = resolve; });

  constructor(private readonly parties: number) {}

  async wait(): Promise<void> {
    this.arrived += 1;
    if (this.arrived >= this.parties) this.release();
    await this.released;
  }
}

async function seedFixture(database: TestDb): Promise<void> {
  // Replace with test-fixture helpers that insert:
  // - order_requests id=1042
  // - distributor_sub_invoices id=4201
  // - payments id=9001
  // - order_payment_allocations id=7101
  // - a distributor_sub_invoice_line id=50001
  // The fixture must be isolated per test transaction/database.
  await database.execute(sql`SELECT 1`);
}

async function clearFixture(database: TestDb): Promise<void> {
  // Delete in FK-safe order in the actual project.
  await database.execute(sql`DELETE FROM affiliate_commission_entries WHERE order_request_id = ${ORDER_ID}`);
  await database.execute(sql`DELETE FROM webhook_event_receipts WHERE event_id LIKE 'evt_test_%'`);
  await database.execute(sql`DELETE FROM distributor_sub_invoice_lines WHERE sub_invoice_id = ${SUB_INVOICE_ID}`);
  await database.execute(sql`DELETE FROM order_payment_allocations WHERE id = ${ALLOCATION_ID}`);
  await database.execute(sql`DELETE FROM distributor_sub_invoices WHERE id = ${SUB_INVOICE_ID}`);
  await database.execute(sql`DELETE FROM payments WHERE id = ${PAYMENT_ID}`);
  await database.execute(sql`DELETE FROM order_requests WHERE id = ${ORDER_ID}`);
}

describe("paid sub-invoice receiver: concurrent delivery and idempotency", () => {
  beforeAll(async () => {
    await seedFixture(db);
  });

  beforeEach(async () => {
    await clearFixture(db);
    await seedFixture(db);
  });

  afterAll(async () => {
    await clearFixture(db);
    await pool.end();
  });

  it("processes two concurrent identical deliveries exactly once", async () => {
    const event = testEvent();
    const barrier = new Barrier(2);

    const [first, second] = await Promise.all([
      receivePaidEvent(db, event, { barrier }),
      receivePaidEvent(db, event, { barrier }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 200]);

    const receipts = await db
      .select()
      .from(webhookEventReceipts)
      .where(
        and(
          eq(webhookEventReceipts.eventId, EVENT_ID),
          eq(webhookEventReceipts.consumerName, CONSUMER),
        ),
      );
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.status).toBe("processed");
    expect(receipts[0]?.attempts).toBeGreaterThanOrEqual(1);

    const commissions = await db
      .select()
      .from(affiliateCommissionEntries)
      .where(eq(affiliateCommissionEntries.subInvoiceId, SUB_INVOICE_ID));
    expect(commissions).toHaveLength(1);
    expect(commissions[0]?.commissionSourceEventId).toBe(EVENT_ID);
  });

  it("returns 200 for a later duplicate after the first delivery committed", async () => {
    const event = testEvent();

    await expect(receivePaidEvent(db, event)).resolves.toEqual({ status: 200 });
    await expect(receivePaidEvent(db, event)).resolves.toEqual({
      status: 200,
      duplicate: true,
    });

    const receipts = await db
      .select()
      .from(webhookEventReceipts)
      .where(eq(webhookEventReceipts.eventId, EVENT_ID));
    expect(receipts).toHaveLength(1);

    const commissions = await db
      .select()
      .from(affiliateCommissionEntries)
      .where(eq(affiliateCommissionEntries.subInvoiceId, SUB_INVOICE_ID));
    expect(commissions).toHaveLength(1);
  });

  it("rejects the same event ID when the payload hash changes", async () => {
    const first = testEvent();
    const altered = testEvent({
      data: {
        ...first.data,
        payment: { ...first.data.payment, amountCents: 1 },
      },
    });

    await expect(receivePaidEvent(db, first)).resolves.toEqual({ status: 200 });
    await expect(receivePaidEvent(db, altered)).resolves.toEqual({
      status: 409,
      conflict: true,
    });

    const commissions = await db
      .select()
      .from(affiliateCommissionEntries)
      .where(eq(affiliateCommissionEntries.subInvoiceId, SUB_INVOICE_ID));
    expect(commissions).toHaveLength(1);
  });

  it("allows a retry after a crash before the business transaction commits", async () => {
    const event = testEvent();

    await expect(
      receivePaidEvent(db, event, { failBeforeCommit: true }),
    ).resolves.toEqual({ status: 500 });

    const [failedReceipt] = await db
      .select()
      .from(webhookEventReceipts)
      .where(eq(webhookEventReceipts.eventId, EVENT_ID));
    expect(failedReceipt?.status).toBe("failed");

    const commissionsAfterRollback = await db
      .select()
      .from(affiliateCommissionEntries)
      .where(eq(affiliateCommissionEntries.subInvoiceId, SUB_INVOICE_ID));
    expect(commissionsAfterRollback).toHaveLength(0);

    await expect(receivePaidEvent(db, event)).resolves.toEqual({ status: 200 });

    const commissionsAfterRetry = await db
      .select()
      .from(affiliateCommissionEntries)
      .where(eq(affiliateCommissionEntries.subInvoiceId, SUB_INVOICE_ID));
    expect(commissionsAfterRetry).toHaveLength(1);
  });

  it("uses the business unique key for a second event ID representing the same effect", async () => {
    const first = testEvent();
    const second = testEvent({ id: "evt_test_same_payment_different_id" });

    await expect(receivePaidEvent(db, first)).resolves.toEqual({ status: 200 });
    await expect(receivePaidEvent(db, second)).resolves.toEqual({ status: 200 });

    const commissions = await db
      .select()
      .from(affiliateCommissionEntries)
      .where(eq(affiliateCommissionEntries.subInvoiceId, SUB_INVOICE_ID));
    expect(commissions).toHaveLength(1);
  });

  it("does not allow a different distributor to reuse the allocation", async () => {
    const event = testEvent({
      id: "evt_test_wrong_distributor",
      data: {
        ...testEvent().data,
        subInvoice: { id: SUB_INVOICE_ID, distributorId: 999, totalCents: 307450 },
      },
    });

    await expect(receivePaidEvent(db, event)).resolves.toEqual({ status: 500 });

    const commissions = await db
      .select()
      .from(affiliateCommissionEntries)
      .where(eq(affiliateCommissionEntries.subInvoiceId, SUB_INVOICE_ID));
    expect(commissions).toHaveLength(0);
  });
});

/**
 * Recommended CI command after replacing the fixture and receiver imports:
 *
 *   TEST_DATABASE_URL=mysql://... pnpm vitest run \
 *     docs/webhookConsumer.integration.test.example.ts --pool=forks --single-thread
 *
 * The test database should be reset between workers. Do not run this suite
 * against a shared development or production database.
 */
