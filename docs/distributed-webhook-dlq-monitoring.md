# Distributed Dead-Letter Queue Monitoring and Alerting

## Purpose

This design monitors webhook consumers across multiple worker instances and services. It detects when a paid distributor sub-invoice is not reaching fulfillment, commission, payout, notification, or audit consumers.

The monitoring model must answer four questions quickly:

1. **Are events accumulating?**
2. **How old is the oldest failed event?**
3. **Which consumer, distributor, or worker is failing?**
4. **Did a payment succeed without the required fulfillment or accounting effect?**

The design assumes:

- Multiple application instances
- At-least-once event delivery
- Per-consumer receipt rows
- An outbox and dead-letter table
- Retries with exponential backoff
- Administrator replay and resolution

No monitoring, alerting, or production configuration is changed by this document.

## 1. Distributed monitoring architecture

```text
Webhook producer / outbox
          |
          v
   MySQL outbox + DLQ tables
          |
          +--> Worker A ──┐
          +--> Worker B ──┼──> Consumer receipt tables
          +--> Worker C ──┘          |
                                    +--> fulfillment
                                    +--> commissions
                                    +--> distributor payout
                                    +--> customer notification

Each worker emits metrics ──> metrics collector ──> dashboards + alert rules
Each worker emits structured logs ──> centralized log store
DLQ state changes ──> alert event table ──> notification router
```

The database remains the source of truth for event state. In-memory worker counters are useful for diagnostics but must not be the only source for queue depth or dead-letter counts.

## 2. Core metrics

### Queue health

```text
webhook_outbox_pending_count{environment}
webhook_outbox_retry_wait_count{environment}
webhook_outbox_processing_count{environment}
webhook_outbox_sent_total{environment,event_type}
webhook_outbox_dead_letter_count{environment,event_type}
webhook_outbox_oldest_pending_age_seconds{environment}
webhook_outbox_oldest_processing_age_seconds{environment}
```

### Dead-letter health

```text
webhook_dlq_open_count{environment,event_type,consumer}
webhook_dlq_oldest_age_seconds{environment,event_type,consumer}
webhook_dlq_created_total{environment,event_type,consumer,reason_code}
webhook_dlq_replay_total{environment,event_type,consumer,result}
webhook_dlq_resolution_total{environment,event_type,consumer,resolution}
```

### Consumer health

```text
webhook_consumer_attempt_total{environment,consumer,event_type}
webhook_consumer_success_total{environment,consumer,event_type}
webhook_consumer_failure_total{environment,consumer,event_type,failure_class}
webhook_consumer_processing_seconds{environment,consumer,event_type}
webhook_consumer_receipt_stuck_count{environment,consumer}
webhook_consumer_duplicate_total{environment,consumer,event_type}
```

### Payment-to-fulfillment safety

```text
paid_sub_invoice_unprocessed_count{environment,consumer}
paid_sub_invoice_to_fulfillment_latency_seconds{environment,distributor}
paid_sub_invoice_to_commission_latency_seconds{environment,affiliate}
paid_sub_invoice_to_payout_latency_seconds{environment,distributor}
financial_event_conflict_total{environment,event_type,reason_code}
```

A paid sub-invoice that lacks a required fulfillment receipt is more important than a generic queue-depth warning and should have a dedicated alert.

## 3. Database queries for monitoring

### Open dead-letter count

```sql
SELECT
  event_type,
  COALESCE(consumer_name, 'outbox') AS consumer_name,
  COUNT(*) AS open_count,
  TIMESTAMPDIFF(SECOND, MIN(created_at), CURRENT_TIMESTAMP) AS oldest_age_seconds
FROM webhook_dead_letters
WHERE status IN ('open', 'replay_requested', 'replaying')
GROUP BY event_type, consumer_name;
```

### Oldest required consumer failure

```sql
SELECT
  dl.event_id,
  dl.event_type,
  dl.consumer_name,
  dl.aggregate_id,
  dl.reason_code,
  dl.created_at,
  TIMESTAMPDIFF(SECOND, dl.created_at, CURRENT_TIMESTAMP) AS age_seconds
FROM webhook_dead_letters dl
WHERE dl.status = 'open'
ORDER BY dl.created_at ASC
LIMIT 1;
```

### Paid sub-invoices without fulfillment processing

```sql
SELECT
  si.id AS sub_invoice_id,
  si.invoice_number,
  si.distributor_id,
  si.paid_at,
  TIMESTAMPDIFF(SECOND, si.paid_at, CURRENT_TIMESTAMP) AS age_seconds
FROM distributor_sub_invoices si
LEFT JOIN webhook_event_receipts r
  ON r.event_id = CONCAT('sub-invoice-paid:', si.id)
 AND r.consumer_name = 'distributor-fulfillment'
WHERE si.status IN ('paid', 'inventory_review')
  AND si.paid_at IS NOT NULL
  AND (r.id IS NULL OR r.status <> 'processed');
```

The exact event-key lookup should match the implementation’s immutable event ID. If event IDs are stored separately, join through an event aggregate table rather than constructing them.

### Stuck processing receipts

```sql
SELECT
  consumer_name,
  COUNT(*) AS stuck_count,
  TIMESTAMPDIFF(SECOND, MIN(processing_started_at), CURRENT_TIMESTAMP) AS oldest_age_seconds
FROM webhook_event_receipts
WHERE status = 'processing'
  AND processing_started_at < CURRENT_TIMESTAMP - INTERVAL 10 MINUTE
GROUP BY consumer_name;
```

## 4. Alert severity levels

### Critical — immediate response

Trigger when any of the following is true:

- A paid sub-invoice has no successful required fulfillment receipt for more than 15 minutes.
- A payment/allocation mismatch is dead-lettered.
- More than 0 financial events are dead-lettered in production for payment, payout, or refund processing.
- DLQ count exceeds 25 for a required consumer.
- The oldest required DLQ item exceeds 1 hour.
- All workers are unhealthy while pending or retrying events exist.

Suggested message:

```text
CRITICAL webhook fulfillment gap
Environment: production
Order: CD-20261008-7F3KQ
Sub-invoice: CD-20261008-7F3KQ-A
Distributor: Cabinet Line (3)
Event: distributor_sub_invoice.paid
Consumer: distributor-fulfillment
Age: 18m 42s
Reason: distributor_email_invalid
Action: inspect configuration, then replay the failed consumer
```

### High — response during business hours

Trigger when:

- Any consumer has 5 or more open DLQ rows.
- Retry failure rate exceeds 5% over 10 minutes.
- The oldest open DLQ item exceeds 30 minutes.
- A consumer’s processing latency exceeds the service-level target for 3 consecutive intervals.
- A worker lease has expired repeatedly for the same queue.

### Warning — investigate

Trigger when:

- Open DLQ count is greater than 0 for more than 10 minutes for a noncritical notification consumer.
- Queue age exceeds 5 minutes.
- Retry queue grows for 3 consecutive collection intervals.
- Duplicate delivery rate increases sharply, suggesting producer or network instability.

### Informational

- DLQ replay succeeded.
- A resolved DLQ item was closed.
- Queue returned to normal.
- Worker deployment changed.

## 5. Prometheus-style alert rules

```yaml
groups:
  - name: cabinetdealz-webhooks
    rules:
      - alert: PaidSubInvoiceFulfillmentGap
        expr: paid_sub_invoice_unprocessed_count{consumer="distributor-fulfillment"} > 0
        for: 15m
        labels:
          severity: critical
          service: webhook-consumer
        annotations:
          summary: "Paid distributor sub-invoice has no fulfillment receipt"
          description: >-
            A paid sub-invoice has not reached the required fulfillment consumer
            within 15 minutes. Check order, distributor, event ID, and DLQ.

      - alert: FinancialWebhookDeadLetter
        expr: |
          sum(webhook_dlq_open_count{consumer=~"affiliate-commission|distributor-payout|refund-accounting"}) > 0
        for: 1m
        labels:
          severity: critical
          service: webhook-consumer
        annotations:
          summary: "Financial webhook consumer entered the DLQ"
          description: "Payment, payout, commission, or refund accounting requires review."

      - alert: WebhookDlqGrowing
        expr: |
          delta(webhook_dlq_created_total[10m]) > 5
        for: 5m
        labels:
          severity: high
          service: webhook-consumer
        annotations:
          summary: "Webhook DLQ is growing"
          description: "More than five new dead-letter failures occurred in ten minutes."

      - alert: OldWebhookDeadLetter
        expr: webhook_dlq_oldest_age_seconds > 1800
        for: 5m
        labels:
          severity: high
          service: webhook-consumer
        annotations:
          summary: "Webhook dead letter is older than 30 minutes"
          description: "Review the oldest event and replay only after correcting the cause."

      - alert: WebhookWorkersUnavailable
        expr: |
          sum(webhook_worker_heartbeat{environment="production"}) == 0
          and sum(webhook_outbox_pending_count{environment="production"}) > 0
        for: 5m
        labels:
          severity: critical
          service: webhook-worker
        annotations:
          summary: "No healthy webhook workers while events are pending"
          description: "The outbox is accumulating without an active worker."

      - alert: WebhookProcessingLeaseStuck
        expr: webhook_consumer_receipt_stuck_count > 0
        for: 10m
        labels:
          severity: high
          service: webhook-consumer
        annotations:
          summary: "Webhook consumer receipt is stuck in processing"
          description: "Recover the lease and inspect worker health before replaying."
```

Thresholds are examples. They should be tuned to real order volume and the promised fulfillment response time.

## 6. Worker heartbeat

Every worker instance should publish a heartbeat with a stable instance ID and deployment version.

```ts
type WorkerHeartbeat = {
  workerId: string;
  service: string;
  environment: string;
  version: string;
  lastClaimAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  activeClaims: number;
};

export function heartbeatMetrics(h: WorkerHeartbeat): string {
  return [
    `webhook_worker_heartbeat{worker="${h.workerId}",service="${h.service}",environment="${h.environment}",version="${h.version}"} 1`,
    `webhook_worker_active_claims{worker="${h.workerId}"} ${h.activeClaims}`,
  ].join("\\n");
}
```

Do not use an old heartbeat as proof that the worker is healthy. The monitoring service should expire heartbeats after a short TTL, such as 60 seconds.

## 7. Structured logging

Every log line related to an event should include the same correlation fields.

```json
{
  "level": "error",
  "message": "Webhook consumer moved event to dead letter",
  "service": "affiliate-commission-consumer",
  "environment": "production",
  "workerId": "worker-03",
  "eventId": "evt_cd_01J9PAID7D2K8T6M4QF9",
  "eventType": "distributor_sub_invoice.paid",
  "consumerName": "affiliate-commission",
  "orderRequestId": 1042,
  "requestNumber": "CD-20261008-7F3KQ",
  "subInvoiceId": 4201,
  "distributorId": 3,
  "attempt": 12,
  "failureClass": "permanent",
  "reasonCode": "payment_allocation_mismatch",
  "durationMs": 342,
  "correlationId": "checkout_CD-20261008-7F3KQ"
}
```

Never include full card numbers, CVV, secret keys, raw authorization headers, or provider tokens in logs.

## 8. Alert deduplication and grouping

Distributed systems can produce many alerts for the same root cause. Group alerts by:

```text
environment + consumerName + reasonCode + distributorId
```

Use the event ID only as a detail, not as the alert grouping key. Otherwise ten failed events caused by one invalid distributor email produce ten separate pages.

Example alert key:

```text
production:distributor-fulfillment:distributor_email_invalid:3
```

The alert should include:

- Count of affected events
- Oldest event age
- Most recent event age
- Number of affected sub-invoices
- Distributor and consumer
- Representative event/order IDs
- Replay guidance

## 9. Notification routing

| Condition | Primary channel | Secondary channel | Owner |
|---|---|---|---|
| Payment/allocation mismatch | Pager/on-call | Admin dashboard | Engineering + finance admin |
| Paid invoice fulfillment gap | Pager/on-call | Email/CRM task | Operations |
| Distributor email/API failure | Admin dashboard | Distributor operations email | Operations |
| Commission consumer DLQ | Admin dashboard | Finance email | Finance/admin |
| Customer notification failure | Admin dashboard | Retry queue | Customer operations |
| Queue growth warning | Chat/monitoring channel | Dashboard | Engineering |

A notification failure must not prevent the DLQ row from being recorded. Alert delivery itself should use a separate durable queue or provider retry mechanism.

## 10. Operator workflow

### Step 1 — Identify scope

Open the DLQ dashboard and filter by:

- Environment
- Consumer
- Event type
- Distributor
- Reason code
- Age

### Step 2 — Determine whether the event is financially sensitive

If the event involves payment, refund, payout, or commission:

- Do not manually create a second payment or refund.
- Confirm the original provider transaction and allocation.
- Check whether the business effect already exists.
- Resolve the underlying data/configuration problem.

### Step 3 — Replay safely

Use **Replay failed consumer only** when other consumers already succeeded. Use **Replay entire event** only when the event did not process for any consumer.

### Step 4 — Confirm recovery

Verify:

- Receipt is `processed`.
- Business-effect unique key exists exactly once.
- Sub-invoice and parent-order statuses are correct.
- Distributor/affiliate task was created or updated.
- No new duplicate payment or commission was created.

### Step 5 — Resolve with an audit note

```text
Resolved by: user 7
Cause: Distributor order email was missing.
Fix: Added and verified orders@cabinetline.example.
Replay: Affiliate commission consumer only.
Result: Receipt processed; one commission entry retained; no duplicate payment.
```

## 11. Safe replay endpoint

A protected admin endpoint can expose replay as a controlled operation:

```ts
const replayInput = z.object({
  deadLetterId: z.number().int().positive(),
  mode: z.enum(["failed_consumer_only", "entire_event"]),
  note: z.string().min(10).max(2000),
});

// Required checks:
// - authenticated admin role
// - dead letter is open or replay_requested
// - no active replay for the same event/consumer
// - business records are reconciled before replay
// - actor, mode, note, and timestamp are audited
```

The endpoint should enqueue a replay request rather than performing the business action inside the HTTP request. The worker performs the same idempotent consumer flow used for normal delivery.

## 12. Dashboard layout

### Overview cards

```text
Open DLQ items:                 4
Oldest DLQ age:                 18m 42s
Paid invoice fulfillment gaps:  1
Retrying events:                12
Healthy workers:                3 / 3
Financial conflicts:            0
```

### Consumer table

| Consumer | Pending | Retrying | Open DLQ | Oldest age | Last success | Health |
|---|---:|---:|---:|---:|---|---|
| Distributor fulfillment | 2 | 4 | 1 | 18m | 30s ago | Warning |
| Affiliate commission | 0 | 0 | 0 | — | 12s ago | Healthy |
| Distributor payout | 0 | 0 | 0 | — | 18s ago | Healthy |
| Customer notification | 4 | 8 | 3 | 6m | 5s ago | Warning |

### DLQ detail

Show:

- Event ID and event type
- Consumer and worker history
- Order and sub-invoice
- Distributor and affiliate
- Failure code and last message
- Attempt timeline
- Redacted payload
- Existing business effects
- Replay and resolution controls

## 13. SLO examples

Recommended initial service objectives:

```text
99.9% of paid sub-invoices reach required fulfillment review within 15 minutes.
99.9% of paid sub-invoice commission entries are recorded within 15 minutes.
100% of payment/allocation conflicts are alerted within 1 minute.
100% of duplicate deliveries create zero duplicate financial effects.
100% of open financial DLQ items receive operator review within 1 business hour.
```

Measure the first two from the payment approval timestamp to the consumer receipt `processed_at` timestamp—not from worker log timestamps.

## 14. Failure scenarios

### One distributor is misconfigured

- Only that distributor’s fulfillment consumer dead-letters.
- Other distributor sub-invoices continue normally.
- Alert groups by distributor and reason code.
- Fix the configuration, then replay the failed consumer only.

### All workers stop

- Heartbeats expire.
- Pending/retry queue age increases.
- Critical alert fires because events exist with zero healthy workers.
- Starting a new worker safely claims eligible rows.

### Database is unavailable

- Workers fail to claim or update rows.
- No event is marked sent without a database commit.
- Worker logs transient database errors and retries.
- Queue-depth alert remains based on the last successful metrics scrape/database read.

### Duplicate provider webhook

- Signature validates.
- Receipt/business unique key detects duplicate.
- Receiver returns `200`.
- No second payment allocation, payout, commission, or fulfillment task is created.

### Payment succeeds but commission consumer fails

- Fulfillment can proceed if policy permits.
- Commission remains absent or pending and generates a finance alert.
- Replaying the commission consumer creates exactly one commission entry.

## Implementation status

This document is a **proposed distributed monitoring and alerting design only**. No metrics, dashboard, alert rule, worker heartbeat, DLQ route, or production configuration has been changed.