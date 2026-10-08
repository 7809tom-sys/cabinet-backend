# Outbox Retry and Dead-Letter Queue Handling

## Purpose

The outbox pattern guarantees that a `distributor_sub_invoice.paid` event is not lost when the payment transaction commits but webhook delivery, notification, fulfillment, or commission processing temporarily fails.

The design separates:

1. **Database commit** — the payment and outbox record commit together.
2. **Dispatch** — a worker claims the outbox record and delivers it.
3. **Consumer processing** — each subscriber processes the event idempotently.
4. **Retry** — transient failures are retried with backoff.
5. **Dead-letter routing** — poison or exhausted messages are isolated for review.
6. **Replay** — an administrator can safely retry a dead-letter event.

No payment is charged again because payment processing is completed before the outbox event is created.

## Event lifecycle

```text
pending
  → processing
  → sent

processing / sent attempt fails
  → retry_wait
  → processing

retry limit or permanent error
  → dead_letter

operator fixes cause
  → replay_pending
  → processing
  → sent
```

A separate consumer receipt exists for every subscriber:

```text
outbox event
  ├── distributor fulfillment consumer
  ├── affiliate commission consumer
  ├── customer notification consumer
  └── admin audit consumer
```

One consumer can be dead-lettered without preventing the others from completing.

## 1. Outbox table

```sql
CREATE TABLE webhook_outbox (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  aggregate_type VARCHAR(128) NOT NULL,
  aggregate_id BIGINT NOT NULL,
  payload_json JSON NOT NULL,
  schema_version VARCHAR(64) NOT NULL,
  status ENUM(
    'pending',
    'processing',
    'retry_wait',
    'sent',
    'dead_letter',
    'cancelled'
  ) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 12,
  next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMP NULL,
  locked_by VARCHAR(128) NULL,
  first_attempted_at TIMESTAMP NULL,
  last_attempted_at TIMESTAMP NULL,
  sent_at TIMESTAMP NULL,
  last_http_status INT NULL,
  last_error_code VARCHAR(128) NULL,
  last_error_message TEXT NULL,
  dead_letter_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY outbox_event_unique (event_id),
  INDEX outbox_ready_idx (status, next_attempt_at),
  INDEX outbox_aggregate_idx (aggregate_type, aggregate_id),
  INDEX outbox_dlq_idx (status, updated_at)
);
```

### Row rules

- `event_id` is immutable and globally unique.
- `payload_json` is an immutable event snapshot.
- `attempts` increases for every dispatch attempt.
- `next_attempt_at` controls when a retry becomes eligible.
- `locked_at` and `locked_by` make worker ownership visible.
- `sent` means the dispatcher accepted the event or the required subscriber processing completed, depending on the delivery mode.
- A dead-letter row is never deleted; it remains an audit record.

## 2. Consumer receipt table

Each consumer needs its own idempotency record.

```sql
CREATE TABLE webhook_event_receipts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  consumer_name VARCHAR(128) NOT NULL,
  status ENUM('processing','processed','failed','dead_letter') NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
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

The unique key ensures that replaying an event cannot create a second commission entry, fulfillment task, notification, or payout ledger row.

## 3. Dead-letter table

The outbox row can show dead-letter status, but a separate table retains failure history and operator actions.

```sql
CREATE TABLE webhook_dead_letters (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  outbox_id BIGINT NOT NULL,
  event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  aggregate_type VARCHAR(128) NOT NULL,
  aggregate_id BIGINT NOT NULL,
  consumer_name VARCHAR(128) NULL,
  payload_json JSON NOT NULL,
  failure_class ENUM('transient_exhausted','permanent','validation','authorization','dependency') NOT NULL,
  reason_code VARCHAR(128) NOT NULL,
  reason_message TEXT NOT NULL,
  attempts INT NOT NULL,
  first_failed_at TIMESTAMP NOT NULL,
  last_failed_at TIMESTAMP NOT NULL,
  status ENUM('open','replay_requested','replaying','resolved','discarded') NOT NULL DEFAULT 'open',
  replay_count INT NOT NULL DEFAULT 0,
  replayed_by BIGINT NULL,
  replayed_at TIMESTAMP NULL,
  resolved_by BIGINT NULL,
  resolved_at TIMESTAMP NULL,
  resolution_note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY dead_letter_event_consumer_unique (event_id, consumer_name),
  INDEX dlq_status_time_idx (status, created_at),
  INDEX dlq_aggregate_idx (aggregate_type, aggregate_id)
);
```

## 4. Worker claiming algorithm

Workers must claim rows atomically so two workers do not dispatch the same event at the same time.

```sql
START TRANSACTION;

SELECT id
FROM webhook_outbox
WHERE status IN ('pending', 'retry_wait')
  AND next_attempt_at <= CURRENT_TIMESTAMP
ORDER BY created_at, id
LIMIT 50
FOR UPDATE SKIP LOCKED;

UPDATE webhook_outbox
SET status = 'processing',
    attempts = attempts + 1,
    locked_at = CURRENT_TIMESTAMP,
    locked_by = 'outbox-worker-03',
    first_attempted_at = COALESCE(first_attempted_at, CURRENT_TIMESTAMP),
    last_attempted_at = CURRENT_TIMESTAMP
WHERE id IN (...claimed ids...);

COMMIT;
```

The worker then loads each claimed payload and dispatches it outside the database transaction. Holding a database lock during network I/O would create unnecessary contention and cannot guarantee provider success.

## 5. Lease recovery

If a worker crashes after claiming an event, another worker must be able to recover it.

```sql
UPDATE webhook_outbox
SET status = 'retry_wait',
    next_attempt_at = CURRENT_TIMESTAMP,
    locked_at = NULL,
    locked_by = NULL,
    last_error_code = 'worker_lease_expired',
    last_error_message = 'The worker lease expired before dispatch completed.'
WHERE status = 'processing'
  AND locked_at < CURRENT_TIMESTAMP - INTERVAL 10 MINUTE;
```

The lease timeout must exceed the normal maximum dispatch duration. A recovered event is safe because the consumer receipt idempotency key prevents duplicate side effects.

## 6. Retry policy

### Retryable failures

Retry when the failure is likely temporary:

- Network timeout
- DNS or connection failure
- HTTP `408`, `425`, `429`, `500`, `502`, `503`, or `504`
- Temporary database unavailability
- Distributor email provider unavailable
- Carrier or notification provider rate limit

### Non-retryable failures

Route directly to dead-letter when the event is invalid or cannot succeed without human correction:

- Invalid event schema
- Missing sub-invoice or payment allocation
- Payment amount mismatch
- Unknown distributor
- Unauthorized provider destination
- Unsupported schema version
- HTTP `400`, `401`, `403`, `404`, or `422` from a receiving endpoint
- Duplicate event where the receiver reports a conflicting payload

### Exponential backoff

```ts
function retryDelayMs(attempt: number): number {
  const base = 30_000;       // 30 seconds
  const cap = 6 * 60 * 60_000; // 6 hours
  const exponential = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.min(30_000, exponential * 0.2));
  return exponential + jitter;
}
```

Example schedule with jitter omitted:

| Attempt | Delay | Approximate elapsed time |
|---:|---:|---:|
| 1 | 30 seconds | 30 seconds |
| 2 | 1 minute | 1.5 minutes |
| 3 | 2 minutes | 3.5 minutes |
| 4 | 4 minutes | 7.5 minutes |
| 5 | 8 minutes | 15.5 minutes |
| 6 | 16 minutes | 31.5 minutes |
| 7 | 32 minutes | 63.5 minutes |
| 8 | 1 hour 4 minutes | 2 hours 7.5 minutes |
| 9 | 2 hours 8 minutes | 4 hours 15.5 minutes |
| 10 | 4 hours 16 minutes | 8 hours 31.5 minutes |
| 11–12 | capped at 6 hours | roughly within 20 hours |

A payment-success event should not be silently abandoned after retries. When the final attempt fails, it enters the dead-letter queue and creates an administrator alert.

## 7. Dispatch pseudocode

```ts
async function dispatchOutboxRow(row: OutboxRow) {
  try {
    const event = parseAndValidateEvent(row.payloadJson, row.schemaVersion);
    const consumers = consumersFor(event.type);

    for (const consumer of consumers) {
      await deliverToConsumerIdempotently(consumer, event);
    }

    await db.update(webhookOutbox)
      .set({
        status: "sent",
        sentAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .where(and(
        eq(webhookOutbox.id, row.id),
        eq(webhookOutbox.status, "processing"),
      ));
  } catch (error) {
    const failure = classifyDispatchFailure(error);

    if (failure.permanent || row.attempts >= row.maxAttempts) {
      await moveToDeadLetter(row, failure);
      return;
    }

    const nextAttemptAt = new Date(Date.now() + retryDelayMs(row.attempts));
    await db.update(webhookOutbox)
      .set({
        status: "retry_wait",
        nextAttemptAt,
        lockedAt: null,
        lockedBy: null,
        lastHttpStatus: failure.httpStatus ?? null,
        lastErrorCode: failure.code,
        lastErrorMessage: failure.message,
      })
      .where(and(
        eq(webhookOutbox.id, row.id),
        eq(webhookOutbox.status, "processing"),
      ));
  }
}
```

## 8. Consumer idempotency flow

```ts
async function deliverToConsumerIdempotently(
  consumer: Consumer,
  event: DomainEvent,
) {
  const existing = await db.query.webhookEventReceipts.findFirst({
    where: and(
      eq(webhookEventReceipts.eventId, event.id),
      eq(webhookEventReceipts.consumerName, consumer.name),
    ),
  });

  if (existing?.status === "processed") return;
  if (existing?.status === "dead_letter") {
    throw permanentError("consumer_dead_lettered", "Consumer requires operator replay.");
  }

  await claimOrCreateReceipt(event, consumer.name);

  // All business side effects and the processed receipt are committed together.
  await db.transaction(async (tx) => {
    await consumer.handle(event, tx);
    await tx.update(webhookEventReceipts)
      .set({ status: "processed", processedAt: new Date() })
      .where(and(
        eq(webhookEventReceipts.eventId, event.id),
        eq(webhookEventReceipts.consumerName, consumer.name),
      ));
  });
}
```

For example, the affiliate commission consumer must insert its commission ledger rows and mark the consumer receipt `processed` in the same transaction. A crash before commit causes the complete transaction to roll back and allows a retry. A crash after commit sees the processed receipt and performs no duplicate work.

## 9. Moving an event to the dead-letter queue

```sql
START TRANSACTION;

SELECT *
FROM webhook_outbox
WHERE id = 88001
FOR UPDATE;

UPDATE webhook_outbox
SET status = 'dead_letter',
    locked_at = NULL,
    locked_by = NULL,
    dead_letter_reason = 'Permanent validation error: payment allocation does not match provider amount.'
WHERE id = 88001
  AND status = 'processing';

INSERT INTO webhook_dead_letters (
  outbox_id,
  event_id,
  event_type,
  aggregate_type,
  aggregate_id,
  consumer_name,
  payload_json,
  failure_class,
  reason_code,
  reason_message,
  attempts,
  first_failed_at,
  last_failed_at
)
SELECT
  id,
  event_id,
  event_type,
  aggregate_type,
  aggregate_id,
  NULL,
  payload_json,
  'permanent',
  'payment_allocation_mismatch',
  'Provider amount does not match the stored distributor allocation.',
  attempts,
  COALESCE(first_attempted_at, CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
FROM webhook_outbox
WHERE id = 88001;

COMMIT;
```

The dead-letter operation must be idempotent. The unique `(event_id, consumer_name)` key prevents duplicate DLQ records during worker races.

## 10. Consumer-specific dead letters

A single event can succeed for one subscriber and fail for another.

Example:

| Consumer | Result |
|---|---|
| `customer-order-status` | Processed |
| `affiliate-commission` | Processed |
| `distributor-fulfillment` | Dead-lettered due to invalid distributor email |
| `admin-audit` | Processed |

The parent outbox event should not be marked globally `sent` until the required delivery policy is met. Two valid policies are:

### Required-consumer policy — recommended

- Mark the event `sent` when all mandatory consumers process it.
- Optional notification failures do not block the event.
- A required consumer can remain dead-lettered while the admin fixes the problem.

### Per-consumer outbox policy

- Create one outbox row per `(event, consumer)`.
- Each consumer has independent status, retry count, and DLQ state.
- This is more operationally explicit and is preferable if distributors have different delivery mechanisms.

For distributor-level fulfillment, the per-consumer model is generally safer because email, API, EDI, and internal task delivery may fail independently.

## 11. Admin dead-letter dashboard

The admin dashboard should show:

| Field | Example |
|---|---|
| Event | `distributor_sub_invoice.paid` |
| Event ID | `evt_cd_01J9PAID7D2K8T6M4QF9` |
| Consumer | `distributor-fulfillment` |
| Order | `CD-20261008-7F3KQ` |
| Sub-invoice | `CD-20261008-7F3KQ-A` |
| Distributor | Cabinet Line |
| Attempts | 12 |
| Last failure | `distributor_email_invalid` |
| First failed | October 8, 2026 4:31 PM |
| Last failed | October 9, 2026 12:22 PM |
| Status | Open |

Actions:

- **View payload** — read-only, redacted for sensitive data
- **View failure history**
- **Retry now** — only after validation or configuration is corrected
- **Replay from beginning** — re-runs all consumers idempotently
- **Replay failed consumer only** — recommended for a single consumer failure
- **Mark resolved** — requires an operator note
- **Discard** — restricted, audited, and never deletes the original payload

## 12. Replay flow

When an administrator clicks **Replay failed consumer only**:

```sql
START TRANSACTION;

SELECT *
FROM webhook_dead_letters
WHERE id = 65001
FOR UPDATE;

UPDATE webhook_dead_letters
SET status = 'replaying',
    replay_count = replay_count + 1,
    replayed_by = 7,
    replayed_at = CURRENT_TIMESTAMP
WHERE id = 65001
  AND status IN ('open', 'replay_requested');

UPDATE webhook_event_receipts
SET status = 'failed',
    last_error_code = NULL,
    last_error_message = NULL
WHERE event_id = 'evt_cd_01J9PAID7D2K8T6M4QF9'
  AND consumer_name = 'distributor-fulfillment'
  AND status = 'dead_letter';

UPDATE webhook_outbox
SET status = 'retry_wait',
    attempts = 0,
    next_attempt_at = CURRENT_TIMESTAMP,
    locked_at = NULL,
    locked_by = NULL
WHERE event_id = 'evt_cd_01J9PAID7D2K8T6M4QF9';

COMMIT;
```

The consumer receipt remains the idempotency guard. If the consumer had actually committed its side effect before the worker crashed, the replay sees `processed` and does not create a duplicate.

## 13. Alerting rules

Create an administrator alert when:

- An event enters `dead_letter`.
- A payment-success event is retrying longer than 15 minutes.
- A required consumer has more than three failures.
- A distributor fulfillment event has been dead-lettered for more than one hour.
- A payment is approved but the corresponding fulfillment consumer has not processed within the service-level target.
- Provider amount or currency mismatches occur.
- A worker lease expires repeatedly for the same event.

The alert should include the event ID, order number, sub-invoice number, distributor, consumer, and safe failure reason—never full card data or secrets.

## 14. Monitoring metrics

Recommended metrics:

```text
outbox_pending_count
outbox_retry_wait_count
outbox_processing_count
outbox_dead_letter_count
outbox_dispatch_success_total
outbox_dispatch_failure_total{failure_class,consumer}
outbox_dispatch_latency_seconds
outbox_oldest_pending_age_seconds
webhook_consumer_processed_total{consumer}
webhook_consumer_dead_letter_total{consumer}
webhook_replay_total{consumer}
payment_success_to_fulfillment_latency_seconds
```

Operational targets:

- No unbounded pending queue
- No payment-success event older than the configured delivery SLA without an alert
- Dead-letter items reviewed daily
- Retry storms controlled by backoff and jitter

## 15. Failure examples

### Temporary distributor email outage

```text
Attempt 1: SMTP timeout → retry in 30 seconds
Attempt 2: SMTP timeout → retry in 1 minute
Attempt 3: SMTP recovers → distributor fulfillment task created
Result: sent
```

### Invalid distributor configuration

```text
Attempt 1: missing order email → permanent configuration error
Result: dead_letter
Admin adds valid distributor email
Admin selects “Replay failed consumer only”
Result: fulfillment event delivered once
```

### Worker crash after creating a fulfillment task

```text
Worker creates task and commits task + processed receipt
Worker crashes before marking outbox sent
Retry sees processed receipt
No second task is created
Outbox is marked sent
```

### Provider amount mismatch

```text
Provider says $3,074.50
Stored allocation says $3,014.50
Result: no fulfillment release, no commission, no payout
Event is dead-lettered for financial reconciliation
```

## 16. Security rules

- Verify inbound provider signatures before creating or updating payment state.
- Require authenticated administrator access for replay, resolve, and discard actions.
- Redact card data, secrets, tokens, and unnecessary personal data in dashboard views.
- Do not allow a replay request to modify the event payload or distributor ID.
- Keep the original payload immutable; corrections are recorded as new configuration or reconciliation events.
- Audit every replay, resolution, discard, and manual override with user ID and note.

## Implementation status

This document is a **proposed outbox, retry, and dead-letter design only**. No worker, webhook route, database table, retry schedule, dead-letter queue, or payment behavior has been changed.