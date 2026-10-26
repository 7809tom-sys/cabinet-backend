# Webhook Consumer Idempotency and Deduplication

## Purpose

The receiving end must assume webhook delivery is **at least once**. The same event can arrive because of:

- Provider retries
- Outbox retries
- Network timeouts after the receiver committed
- Worker lease recovery
- Administrator replay
- Multiple application instances receiving the same event

The receiver must therefore make repeated delivery safe. For a `distributor_sub_invoice.paid` event, a duplicate must never create:

- A second payment allocation
- A second distributor payout ledger row
- A second affiliate commission
- A second fulfillment task
- A second customer notification
- A second inventory release

## Key design

Use three identities:

```text
eventId       = identity of the immutable domain event
consumerName  = identity of this receiving application/handler
aggregate key = identity of the business object being changed
```

The primary deduplication key is:

```text
(eventId, consumerName)
```

The business safety key is also required:

```text
(subInvoiceId, paymentId, allocationId)
```

Why both are needed:

- `(eventId, consumerName)` prevents the same event from being processed twice.
- Business unique keys prevent two differently identified events from recording the same payment or fulfillment effect.

## 1. Consumer receipt table

```sql
CREATE TABLE webhook_event_receipts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  consumer_name VARCHAR(128) NOT NULL,
  status ENUM('processing','processed','failed','dead_letter') NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  payload_hash CHAR(64) NOT NULL,
  last_error_code VARCHAR(128) NULL,
  last_error_message TEXT NULL,
  processing_started_at TIMESTAMP NULL,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY event_consumer_unique (event_id, consumer_name),
  INDEX consumer_status_idx (consumer_name, status, updated_at)
);
```

`payload_hash` protects against a dangerous replay where the same `eventId` is reused with different contents.

If an existing receipt has the same event ID but a different payload hash, reject it as a security/data-integrity error and send it to the dead-letter workflow.

## 2. Business-effect uniqueness

The receiver should also add unique keys to each effect table.

```sql
ALTER TABLE distributor_payout_ledger
  ADD UNIQUE KEY payout_payment_allocation_unique (
    distributor_id,
    payment_id,
    allocation_id
  );

ALTER TABLE affiliate_commission_entries
  ADD UNIQUE KEY commission_event_line_unique (
    commission_source_event_id,
    sub_invoice_line_id
  );

ALTER TABLE distributor_fulfillment_events
  ADD UNIQUE KEY fulfillment_event_unique (
    sub_invoice_id,
    event_type,
    source_event_id
  );

ALTER TABLE customer_notifications
  ADD UNIQUE KEY notification_event_recipient_unique (
    source_event_id,
    recipient_type,
    recipient_id,
    notification_type
  );
```

The exact table names may differ, but every externally visible side effect needs an idempotency constraint.

## 3. Receiver request contract

The receiver should require these headers:

```http
POST /internal/webhooks/distributor-sub-invoice-paid
Content-Type: application/json
X-CabinetDealz-Event-Id: evt_cd_01J9PAID7D2K8T6M4QF9
X-CabinetDealz-Event-Type: distributor_sub_invoice.paid
X-CabinetDealz-Event-Version: 2026-10-08.v1
X-CabinetDealz-Signature: sha256=...
X-CabinetDealz-Delivery-Attempt: 3
```

The body contains the full event envelope. Headers are routing and verification aids; the receiver must validate that the header values match the signed body.

## 4. Signature verification

Sign the exact raw request body, not a reserialized JSON object.

```ts
import crypto from "node:crypto";

export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const received = signatureHeader.slice("sha256=".length);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const receivedBytes = Buffer.from(received, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return receivedBytes.length === expectedBytes.length
    && crypto.timingSafeEqual(receivedBytes, expectedBytes);
}
```

Security rules:

- Rotate webhook secrets with a short overlap period.
- Reject old timestamps if the envelope includes a signed timestamp.
- Reject malformed signatures before touching the database.
- Never log the secret, full authorization header, card data, or payment tokens.

## 5. Atomic receipt claim

The receiver should create its receipt before performing side effects.

```ts
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";

const { webhookEventReceipts } = schema;
type Db = MySql2Database<typeof schema>;

type ReceiptResult =
  | { action: "process"; receiptId: number }
  | { action: "already_processed" }
  | { action: "retry_existing" }
  | { action: "payload_conflict" };

export async function claimConsumerReceipt(
  db: Db,
  input: {
    eventId: string;
    eventType: string;
    consumerName: string;
    payloadHash: string;
  },
): Promise<ReceiptResult> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(webhookEventReceipts)
      .where(
        and(
          eq(webhookEventReceipts.eventId, input.eventId),
          eq(webhookEventReceipts.consumerName, input.consumerName),
        ),
      )
      .limit(1);

    const receipt = existing[0];
    if (receipt) {
      if (receipt.payloadHash !== input.payloadHash) {
        return { action: "payload_conflict" };
      }
      if (receipt.status === "processed") {
        return { action: "already_processed" };
      }
      if (receipt.status === "dead_letter") {
        return { action: "retry_existing" };
      }

      // The row is locked by the transaction's SELECT in the production
      // implementation. A lease check determines whether an old worker died.
      await tx
        .update(webhookEventReceipts)
        .set({
          status: "processing",
          attempts: receipt.attempts + 1,
          processingStartedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        })
        .where(eq(webhookEventReceipts.id, receipt.id));

      return { action: "process", receiptId: receipt.id };
    }

    const inserted = await tx
      .insert(webhookEventReceipts)
      .values({
        eventId: input.eventId,
        eventType: input.eventType,
        consumerName: input.consumerName,
        status: "processing",
        attempts: 1,
        payloadHash: input.payloadHash,
        processingStartedAt: new Date(),
      });

    return {
      action: "process",
      receiptId: Number((inserted as unknown as [{ insertId: number }])[0].insertId),
    };
  });
}
```

### Concurrency note

Two receivers can both check for a missing row at the same instant. The unique key on `(event_id, consumer_name)` is the final authority. If one insert loses the race with a duplicate-key error, the losing request should load the existing receipt and return `already_processed`, `retry_existing`, or `payload_conflict`.

A production implementation can use an atomic `INSERT ... ON DUPLICATE KEY UPDATE` claim, but it must not overwrite a processed receipt.

## 6. Complete receiving handler

```ts
import crypto from "node:crypto";

const CONSUMER = "affiliate-commission";

export async function receivePaidSubInvoiceWebhook(
  db: Db,
  rawBody: Buffer,
  headers: Record<string, string | undefined>,
): Promise<{ status: number; body: object }> {
  if (!verifyWebhookSignature(rawBody, headers["x-cabinetdealz-signature"], process.env.WEBHOOK_SECRET!)) {
    return { status: 401, body: { error: "invalid_signature" } };
  }

  let event: PaidSubInvoiceEvent;
  try {
    event = parsePaidSubInvoiceEvent(JSON.parse(rawBody.toString("utf8")));
  } catch {
    return { status: 400, body: { error: "invalid_event_schema" } };
  }

  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const claim = await claimConsumerReceipt(db, {
    eventId: event.id,
    eventType: event.type,
    consumerName: CONSUMER,
    payloadHash,
  });

  if (claim.action === "already_processed") {
    // Return 200, not an error. The event was successfully handled earlier.
    return { status: 200, body: { accepted: true, duplicate: true } };
  }
  if (claim.action === "payload_conflict") {
    // Same event ID with different bytes is a data-integrity/security error.
    await routeConflictToDeadLetter(event, payloadHash);
    return { status: 409, body: { error: "event_payload_conflict" } };
  }
  if (claim.action === "retry_existing") {
    // A dead-lettered receipt requires operator replay rather than an
    // unsolicited retry that bypasses the review process.
    return { status: 409, body: { error: "consumer_requires_replay" } };
  }

  try {
    await db.transaction(async (tx) => {
      const invoice = await loadAndLockSubInvoice(tx, event.data.subInvoice.id);
      const allocation = await loadAndLockAllocation(tx, event.data.allocation.id);

      validateEventMatchesDatabase(event, invoice, allocation);

      // Business-effect insert must have its own unique key. If this handler
      // is replayed after a crash, the receipt and this unique key both protect
      // against a second commission entry.
      await tx.insert(affiliateCommissionEntries).values(
        event.data.affiliateCommission.commissionEntryIds.map((entryId) => ({
          id: entryId,
          affiliateId: event.data.affiliateCommission.affiliateId,
          orderRequestId: event.data.order.id,
          subInvoiceId: invoice.id,
          commissionSourceEventId: event.id,
          status: "accrued",
          grossCommissionAmount: cents(event.data.affiliateCommission.commissionCents),
        })),
      ).onDuplicateKeyUpdate({
        set: {
          // A duplicate business effect is treated as already present. Do not
          // recalculate or overwrite historical accounting data here.
          commissionSourceEventId: sql`commission_source_event_id`,
        },
      });

      await tx.update(webhookEventReceipts)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(webhookEventReceipts.id, claim.receiptId));
    });

    return { status: 200, body: { accepted: true, eventId: event.id } };
  } catch (error) {
    await markReceiptFailed(db, claim.receiptId, error);
    // 500 causes the sender to retry. The receipt remains non-processed, so a
    // later delivery can safely resume.
    return { status: 500, body: { error: "consumer_processing_failed" } };
  }
}
```

`loadAndLockSubInvoice`, `loadAndLockAllocation`, `validateEventMatchesDatabase`, `cents`, `markReceiptFailed`, `parsePaidSubInvoiceEvent`, and the table imports are intentionally application-specific helpers.

## 7. Why the receipt and business effect must share a transaction

Correct sequence:

```text
BEGIN
  claim receipt
  lock invoice and payment allocation
  validate event against current database state
  insert commission/payout/fulfillment effect
  mark receipt processed
COMMIT
```

If the process crashes before `COMMIT`:

- The business effect rolls back.
- The receipt status rolls back.
- A retry can process the event again.

If the process crashes after `COMMIT`:

- The business effect exists.
- The receipt is `processed`.
- A duplicate delivery returns HTTP 200 without creating another effect.

Do not mark the receipt `processed` before the business effect commits.

## 8. Different event IDs for the same business action

Event deduplication alone is not sufficient. A producer bug or manual replay could create two event IDs for the same payment.

Use business identity validation:

```sql
CREATE UNIQUE INDEX payment_allocation_paid_once
ON distributor_payment_effects (payment_id, allocation_id, effect_type);
```

Then the receiver checks:

```text
payment ID       = stored payment
allocation ID    = stored allocation
sub-invoice ID   = allocation's sub-invoice
amount           = approved allocation amount
currency         = stored currency
provider ref     = stored provider transaction
```

If an event has a different event ID but the same allocation/effect key, return success only if the existing effect has the same amount and provider reference. Otherwise dead-letter it as a financial conflict.

## 9. Handling concurrent duplicates

Example: two identical deliveries arrive at two application instances.

```text
Instance A                         Instance B
-----------                        -----------
INSERT receipt                     INSERT receipt
wins unique key                    duplicate-key conflict
status=processing                  loads existing receipt
processes transaction              waits/retries
COMMIT effect + receipt            sees processed
                                    returns 200 duplicate
```

The database unique key, not application memory, resolves the race. Do not use an in-process `Set<string>` as the only deduplication mechanism; it fails across instances and restarts.

## 10. HTTP response policy

| Receiver result | HTTP response | Sender behavior |
|---|---:|---|
| Processed successfully | `200` | Mark delivered. |
| Already processed duplicate | `200` | Stop retrying. |
| Valid but temporarily unavailable | `500` or `503` | Retry with backoff. |
| Invalid signature | `401` | Do not retry blindly; alert. |
| Invalid schema | `400` | Dead-letter. |
| Event payload conflict | `409` | Dead-letter and investigate. |
| Consumer intentionally paused | `503` | Retry later. |
| Consumer dead-lettered pending operator replay | `409` or `503` | Follow the configured replay policy. |

Returning `200` for a duplicate is important. A duplicate is not a failure; it proves the receiver already completed the work.

## 11. Receipt failure handling

```ts
async function markReceiptFailed(
  db: Db,
  receiptId: number,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown consumer error";
  await db.update(webhookEventReceipts)
    .set({
      status: "failed",
      lastErrorCode: "consumer_processing_failed",
      lastErrorMessage: message.slice(0, 2000),
    })
    .where(eq(webhookEventReceipts.id, receiptId));
}
```

The sender will retry the event. After the configured retry limit, the sender creates a dead-letter entry. The receiver may also dead-letter locally when the failure is permanent, such as a payload conflict or missing distributor configuration.

## 12. Replaying a dead-lettered consumer

An administrator should replay the failed consumer only after correcting the cause.

```sql
START TRANSACTION;

SELECT *
FROM webhook_event_receipts
WHERE event_id = 'evt_cd_01J9PAID7D2K8T6M4QF9'
  AND consumer_name = 'affiliate-commission'
FOR UPDATE;

UPDATE webhook_event_receipts
SET status = 'failed',
    attempts = attempts + 1,
    last_error_code = NULL,
    last_error_message = NULL
WHERE event_id = 'evt_cd_01J9PAID7D2K8T6M4QF9'
  AND consumer_name = 'affiliate-commission'
  AND status = 'dead_letter';

UPDATE webhook_dead_letters
SET status = 'replaying',
    replay_count = replay_count + 1,
    replayed_by = 7,
    replayed_at = CURRENT_TIMESTAMP
WHERE event_id = 'evt_cd_01J9PAID7D2K8T6M4QF9'
  AND consumer_name = 'affiliate-commission'
  AND status IN ('open', 'replay_requested');

COMMIT;
```

The business unique keys remain active during replay. If the commission was already committed before a crash, the replay is a no-op rather than a second commission.

## 13. Validation checklist

The receiver should test:

1. First delivery creates exactly one receipt and one business effect.
2. Identical second delivery returns `200` and creates no new effect.
3. Two concurrent identical deliveries create one effect.
4. Same event ID with different payload hash is rejected and dead-lettered.
5. Different event ID with the same payment allocation is caught by the business unique key.
6. A crash before commit allows a clean retry.
7. A crash after commit returns duplicate success on retry.
8. Temporary database failure returns retryable failure.
9. Invalid distributor configuration dead-letters without infinite retries.
10. Administrator replay processes the failed consumer exactly once.
11. Payment, payout, commission, and fulfillment records cannot cross distributor boundaries.
12. Sensitive payment data is absent from logs and dead-letter dashboard output.

## Implementation status

This document is a **proposed receiving-side idempotency design only**. No webhook receiver, database table, payment behavior, fulfillment behavior, or commission behavior has been changed.