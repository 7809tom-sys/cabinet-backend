# Distributor Sub-Invoice Paid Webhook

## Purpose

This is the proposed internal event emitted after payment for **one distributor sub-invoice** is verified and recorded. It is intentionally scoped to one distributor. A parent order may remain partially paid if other distributor sub-invoices are unpaid.

The event drives:

- Distributor payout or payable ledger creation
- Affiliate commission accrual
- Distributor fulfillment release
- Customer order-status updates
- Distributor/affiliate notifications
- Audit and reconciliation

This event is not emitted merely because a browser says payment succeeded. It is emitted only after the payment provider webhook or server-side provider confirmation has been verified and the matching payment allocation has been committed.

## Event envelope

```json
{
  "id": "evt_cd_01J9PAID7D2K8T6M4QF9",
  "type": "distributor_sub_invoice.paid",
  "version": "2026-10-08.v1",
  "createdAt": "2026-10-08T21:30:12.482Z",
  "occurredAt": "2026-10-08T21:30:11.917Z",
  "source": "cabinetdealz.payments",
  "environment": "production",
  "idempotencyKey": "payment:9001:allocation:7101:approved",
  "correlationId": "checkout_CD-20261008-7F3KQ",
  "data": {
    "order": {},
    "subInvoice": {},
    "payment": {},
    "allocation": {},
    "distributorPayout": {},
    "affiliateCommission": {},
    "fulfillment": {}
  }
}
```

## Event identity

| Field | Required | Description |
|---|---:|---|
| `id` | Yes | Globally unique internal event ID. |
| `type` | Yes | Stable event name: `distributor_sub_invoice.paid`. |
| `version` | Yes | Versioned payload contract. |
| `createdAt` | Yes | Time the event record was created. |
| `occurredAt` | Yes | Time the payment was approved. |
| `source` | Yes | Service that emitted the event. |
| `environment` | Yes | `sandbox` or `production`. |
| `idempotencyKey` | Yes | Prevents duplicate downstream processing. |
| `correlationId` | Yes | Connects checkout, provider webhook, order, and fulfillment logs. |
| `data` | Yes | Event-specific payload. |

## Complete example payload

```json
{
  "id": "evt_cd_01J9PAID7D2K8T6M4QF9",
  "type": "distributor_sub_invoice.paid",
  "version": "2026-10-08.v1",
  "createdAt": "2026-10-08T21:30:12.482Z",
  "occurredAt": "2026-10-08T21:30:11.917Z",
  "source": "cabinetdealz.payments",
  "environment": "production",
  "idempotencyKey": "payment:9001:allocation:7101:approved",
  "correlationId": "checkout_CD-20261008-7F3KQ",
  "data": {
    "order": {
      "id": 1042,
      "requestNumber": "CD-20261008-7F3KQ",
      "customer": {
        "userId": 1,
        "name": "Tom Austin",
        "email": "tom@example.com"
      },
      "affiliate": {
        "id": 17,
        "slug": "firstclass",
        "name": "First Class Flooring & Cabinet Design"
      },
      "currency": "USD",
      "paymentStatus": "partially_paid",
      "fulfillmentStatus": "partially_released",
      "grandTotalCents": 394237,
      "paidTotalCents": 307450,
      "refundedTotalCents": 0,
      "balanceDueCents": 86787
    },
    "subInvoice": {
      "id": 4201,
      "invoiceNumber": "CD-20261008-7F3KQ-A",
      "orderRequestId": 1042,
      "distributorId": 3,
      "distributor": {
        "id": 3,
        "name": "Cabinet Line",
        "code": "CL",
        "orderEmail": "orders@cabinetline.example",
        "fulfillmentMode": "email_po"
      },
      "statusBefore": "payment_required",
      "statusAfter": "paid",
      "merchandiseSubtotalCents": 205000,
      "shippingCents": 80000,
      "taxCents": 16400,
      "damageFeeCents": 2050,
      "totalCents": 307450,
      "paidCentsBefore": 0,
      "paidCentsAfter": 307450,
      "balanceDueCents": 0,
      "shipping": {
        "quoteId": 771,
        "carrier": "LTL",
        "service": "Standard freight",
        "transportMode": "ltl",
        "originZip": "33010",
        "destinationZip": "34236",
        "quotedAmountCents": 80000
      }
    },
    "payment": {
      "id": 9001,
      "provider": "stripe",
      "providerPaymentIntentId": "pi_3QExample",
      "providerChargeId": "ch_3QExample",
      "status": "approved",
      "amountCents": 307450,
      "currency": "USD",
      "paymentMethodType": "card",
      "cardBrand": "visa",
      "cardLast4": "4242",
      "approvedAt": "2026-10-08T21:30:11.917Z"
    },
    "allocation": {
      "id": 7101,
      "paymentId": 9001,
      "subInvoiceId": 4201,
      "merchandiseCents": 205000,
      "shippingCents": 80000,
      "taxCents": 16400,
      "damageFeeCents": 2050,
      "allocatedTotalCents": 307450,
      "refundedCents": 0
    },
    "distributorPayout": {
      "status": "payable",
      "distributorId": 3,
      "grossCustomerPaymentCents": 307450,
      "merchandiseCents": 205000,
      "shippingCents": 80000,
      "taxCollectedCents": 16400,
      "damageFeeCents": 2050,
      "platformProcessingFeeCents": 0,
      "platformCommissionCents": 0,
      "netDistributorPayableCents": 287050,
      "payoutMethod": "distributor_terms_or_admin_release",
      "payoutReference": null
    },
    "affiliateCommission": {
      "status": "accrued",
      "affiliateId": 17,
      "commissionBasis": "paid_merchandise_margin",
      "commissionRateBasisPoints": 5000,
      "eligibleSalesCents": 205000,
      "sourceCostCents": 165000,
      "eligibleMarginCents": 40000,
      "commissionCents": 20000,
      "shippingExcluded": true,
      "taxExcluded": true,
      "damageFeeExcluded": true,
      "commissionEntryIds": [81001, 81002, 81003]
    },
    "fulfillment": {
      "statusBefore": "payment_required",
      "statusAfter": "inventory_review",
      "releaseAllowed": true,
      "requiresAffiliateApproval": true,
      "requiresInventoryConfirmation": true,
      "purchaseOrderStatus": "not_sent",
      "fulfillmentEventId": 99001
    },
    "lines": [
      {
        "subInvoiceLineId": 50001,
        "masterCode": "B12",
        "distributorSku": "CL-B12-SW",
        "description": "12-inch base cabinet",
        "quantity": 2,
        "unitPriceCents": 36000,
        "lineSubtotalCents": 72000,
        "sourceCostCents": 58000,
        "commissionCents": 14000
      },
      {
        "subInvoiceLineId": 50002,
        "masterCode": "W3030",
        "distributorSku": "CL-W3030-SW",
        "description": "30 x 30 wall cabinet",
        "quantity": 3,
        "unitPriceCents": 41500,
        "lineSubtotalCents": 124500,
        "sourceCostCents": 99000,
        "commissionCents": 12750
      },
      {
        "subInvoiceLineId": 50003,
        "masterCode": "FILLER",
        "distributorSku": "CL-FILLER-SW",
        "description": "3-inch filler",
        "quantity": 1,
        "unitPriceCents": 8500,
        "lineSubtotalCents": 8500,
        "sourceCostCents": 8000,
        "commissionCents": 250
      }
    ]
  }
}
```

## Important accounting distinction

The distributor payout amount must follow the configured business agreement. The example above shows a **customer payment allocation**, not an automatic bank transfer. A safe default is:

```text
customer payment
− tax collected and owed
− platform-retained fees or commission
= distributor payable ledger amount
```

The actual payout should be released only after the distributor’s inventory and fulfillment workflow allows it. If the business uses direct split payments or connected accounts, the payout reference and provider transfer ID should be added after the transfer succeeds.

## Provider webhook translation

The internal event should be emitted from a verified provider event, for example:

```text
Stripe: payment_intent.succeeded
Authorize.Net: approved transaction notification
```

The provider webhook handler should:

1. Verify the provider signature or authentication.
2. Resolve the original payment using the provider transaction ID or checkout session.
3. Lock the payment and allocation rows.
4. Confirm the provider amount equals the selected allocation total.
5. Reject or quarantine mismatched amounts.
6. Mark the payment approved.
7. Update the sub-invoice paid amount and status.
8. Roll up the parent order payment and fulfillment status.
9. Create distributor payable and affiliate commission ledger rows.
10. Commit the database transaction.
11. Publish `distributor_sub_invoice.paid` through an outbox after commit.

## Example provider event input

```json
{
  "id": "evt_provider_123",
  "type": "payment_intent.succeeded",
  "created": 1791495011,
  "data": {
    "object": {
      "id": "pi_3QExample",
      "amount": 307450,
      "currency": "usd",
      "metadata": {
        "orderRequestId": "1042",
        "subInvoiceId": "4201",
        "paymentId": "9001",
        "allocationId": "7101"
      },
      "charges": {
        "data": [
          {
            "id": "ch_3QExample",
            "payment_method_details": {
              "card": {
                "brand": "visa",
                "last4": "4242"
              }
            }
          }
        ]
      }
    }
  }
}
```

Provider metadata is only a lookup aid. The server must still load the database records and verify the relationships; it must not trust a provider metadata amount or distributor ID without matching the stored payment allocation.

## Transaction flow

```text
Provider webhook received
        |
        v
Verify signature and event uniqueness
        |
        v
BEGIN TRANSACTION
        |
        +--> lock payment row
        +--> lock payment allocation row
        +--> lock distributor sub-invoice row
        +--> verify amount, currency, provider reference
        +--> mark payment approved
        +--> update allocation
        +--> update sub-invoice totals/status
        +--> update parent order roll-up
        +--> create distributor payable ledger
        +--> create affiliate commission entries
        +--> create fulfillment event
        +--> insert outbox event
        |
        v
COMMIT
        |
        v
Worker publishes distributor_sub_invoice.paid
        |
        +--> notify distributor
        +--> notify affiliate
        +--> update customer order view
        +--> release inventory review task
        +--> optionally initiate approved distributor payout
```

## Example SQL transaction

```sql
START TRANSACTION;

SELECT *
FROM payments
WHERE id = 9001
FOR UPDATE;

SELECT *
FROM order_payment_allocations
WHERE id = 7101
  AND payment_id = 9001
  AND sub_invoice_id = 4201
FOR UPDATE;

SELECT *
FROM distributor_sub_invoices
WHERE id = 4201
  AND order_request_id = 1042
  AND distributor_id = 3
FOR UPDATE;

-- Application verifies:
-- payment provider reference = pi_3QExample
-- provider amount = 307450 cents
-- allocation amount = 307450 cents
-- allocation has not already been approved

UPDATE payments
SET status = 'succeeded',
    transaction_id = 'pi_3QExample',
    amount_cents = 307450,
    paid_at = CURRENT_TIMESTAMP
WHERE id = 9001
  AND status IN ('pending', 'processing');

UPDATE distributor_sub_invoices
SET paid_amount = paid_amount + 307450,
    balance_due = GREATEST(0, total_amount - paid_amount - 307450),
    status = CASE
      WHEN total_amount <= paid_amount + 307450 THEN 'paid'
      ELSE 'partially_paid'
    END,
    paid_at = CASE
      WHEN total_amount <= paid_amount + 307450 THEN CURRENT_TIMESTAMP
      ELSE paid_at
    END
WHERE id = 4201;

INSERT INTO distributor_payout_ledger (
  sub_invoice_id,
  distributor_id,
  payment_id,
  gross_amount_cents,
  tax_collected_cents,
  retained_fee_cents,
  net_payable_cents,
  status
)
VALUES (
  4201,
  3,
  9001,
  307450,
  16400,
  0,
  291050,
  'payable'
);

INSERT INTO distributor_fulfillment_events (
  sub_invoice_id,
  event_type,
  note,
  metadata_json
)
VALUES (
  4201,
  'payment_received',
  'Sub-invoice paid; inventory review may begin.',
  JSON_OBJECT('paymentId', 9001, 'allocationId', 7101)
);

INSERT INTO webhook_outbox (
  event_id,
  event_type,
  aggregate_type,
  aggregate_id,
  payload_json,
  status
)
VALUES (
  'evt_cd_01J9PAID7D2K8T6M4QF9',
  'distributor_sub_invoice.paid',
  'distributor_sub_invoice',
  4201,
  JSON_OBJECT('orderRequestId', 1042, 'paymentId', 9001),
  'pending'
);

COMMIT;
```

The pseudocode above assumes an outbox worker loads the complete event payload after commit. This avoids publishing an event for a database transaction that later rolls back.

## Subscriber behavior

### Distributor fulfillment subscriber

- Confirms the distributor sub-invoice is paid.
- Creates or opens an inventory-review task.
- Does not send the purchase order until required affiliate and inventory approvals are complete.
- Sends only that distributor’s lines and shipping details.

### Affiliate commission subscriber

- Creates line-level commission entries from the locked sale price, source cost, and commission rate.
- Excludes shipping, tax, and damage fees from the commission base unless configured otherwise.
- Marks commission as `accrued` or `payable` according to the payment and fulfillment policy.

### Customer notification subscriber

- Shows the paid distributor invoice as paid.
- Shows remaining distributor invoices as payment required.
- Displays the parent order as partially paid when applicable.

## Retry and idempotency

Every consumer must store processed event IDs:

```sql
CREATE TABLE webhook_event_receipts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  consumer_name VARCHAR(128) NOT NULL,
  status ENUM('processing','processed','failed') NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY event_consumer_unique (event_id, consumer_name)
);
```

Rules:

- Replaying the same event must not create a second payment allocation, payout ledger row, commission entry, fulfillment event, or notification.
- Failed subscribers retry with exponential backoff.
- Permanent failures move to a dead-letter state for administrator review.
- The source payment state remains authoritative; downstream subscribers can be safely rebuilt from the event and ledger records.

## Security and privacy

Do not include:

- Full card numbers
- CVV or card security data
- Provider client secrets
- Raw payment method tokens
- Unnecessary customer address details

The payload may include card brand and last four digits for display and reconciliation, but the payment provider remains the source of truth for payment details.

## Implementation status

This document is a **proposed webhook contract only**. No webhook route, event table, payout logic, fulfillment trigger, affiliate commission trigger, or payment behavior has been changed.