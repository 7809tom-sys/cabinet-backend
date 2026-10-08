# Distributor-Level Split Invoicing and Independent Returns

## Purpose

This schema supports one customer order containing products from multiple distributors while preserving independent:

- Distributor invoices and line items
- Shipping quotes and shipments
- Payment attempts and payment allocations
- Fulfillment status
- Returns and return-line approvals
- Refunds
- Affiliate commission accruals and reversals
- Audit history

The parent order remains the customer-facing container. Each distributor receives a separate sub-invoice and fulfillment rail.

## Existing structures to preserve

The current application already has:

- `order_requests` as the parent customer order
- `order_requests.lineItems` as a JSON snapshot of submitted lines
- `distributors` as supplier records
- `distributor_skus` as distributor-specific SKU and pricing records
- `payments` as payment-attempt records tied to one `order_request`
- `orderRequests.freightQuoteCents` and `freightQuoteVerified` as one order-level freight model
- `affiliate` and affiliate-pricing tables

The split-order change should **not delete historical JSON line items**. The normalized split tables become the authoritative source for new split orders, while the existing JSON remains a backward-compatible order snapshot.

## Entity relationship overview

```text
order_requests
  ├── distributor_sub_invoices
  │     ├── distributor_sub_invoice_lines
  │     ├── distributor_shipping_quotes
  │     │     └── distributor_shipments
  │     │           └── distributor_shipment_lines
  │     ├── distributor_fulfillment_events
  │     ├── distributor_returns
  │     │     └── distributor_return_lines
  │     ├── distributor_refunds
  │     │     └── distributor_refund_allocations
  │     └── affiliate_commission_entries
  │
  └── order_payment_allocations ── payments
```

## 1. Parent order additions

Keep `order_requests` as the parent order. Add these fields:

| Field | Type | Purpose |
|---|---|---|
| `splitOrder` | boolean, default false | Marks an order containing more than one distributor sub-invoice. |
| `paymentStatus` | enum | `unpaid`, `partially_paid`, `paid`, `partially_refunded`, `refunded`. |
| `fulfillmentStatus` | enum | `awaiting_payment`, `partially_released`, `in_fulfillment`, `partially_shipped`, `shipped`, `partially_returned`, `completed`, `cancelled`. |
| `grandTotal` | decimal(12,2) | Merchandise, allocated shipping, and tax snapshot. |
| `paidTotal` | decimal(12,2) | Sum of approved payment allocations. |
| `refundedTotal` | decimal(12,2) | Sum of issued refunds. |
| `balanceDue` | decimal(12,2) | Remaining amount due after approved payments and credits. |
| `splitSchemaVersion` | int | Version of the normalized split-order model. |

`totalAmount`, `freightQuoteCents`, and `taxAmount` remain for historical compatibility, but new split orders should calculate totals from the sub-invoices.

## 2. Distributor sub-invoices

```sql
CREATE TABLE distributor_sub_invoices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_request_id BIGINT NOT NULL,
  distributor_id BIGINT NOT NULL,
  invoice_number VARCHAR(64) NOT NULL UNIQUE,
  status ENUM(
    'draft',
    'payment_required',
    'partially_paid',
    'paid',
    'inventory_review',
    'released',
    'in_fulfillment',
    'partially_shipped',
    'shipped',
    'partially_returned',
    'returned',
    'partially_refunded',
    'refunded',
    'cancelled'
  ) NOT NULL DEFAULT 'draft',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  merchandise_subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipping_subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  damage_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  refunded_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
  commission_status ENUM('not_eligible','pending_payment','accruing','payable','partially_reversed','reversed','paid')
    NOT NULL DEFAULT 'pending_payment',
  payment_due_at TIMESTAMP NULL,
  paid_at TIMESTAMP NULL,
  released_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT sub_invoice_order_fk FOREIGN KEY (order_request_id) REFERENCES order_requests(id),
  CONSTRAINT sub_invoice_distributor_fk FOREIGN KEY (distributor_id) REFERENCES distributors(id),
  UNIQUE KEY order_distributor_unique (order_request_id, distributor_id),
  INDEX order_status_idx (order_request_id, status),
  INDEX distributor_status_idx (distributor_id, status)
);
```

### Rules

- One row per `(parent order, distributor)`.
- A distributor may appear only once in an order; all of its lines belong to that sub-invoice.
- The invoice number is immutable after creation.
- Totals are snapshots. Repricing a catalog item must not rewrite a historical invoice.
- `balance_due = total_amount - paid_amount + refunded_amount` only where the business workflow explicitly treats refunds as a credit; payment and refund ledgers remain authoritative.

## 3. Distributor sub-invoice lines

```sql
CREATE TABLE distributor_sub_invoice_lines (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sub_invoice_id BIGINT NOT NULL,
  source_order_line_key VARCHAR(128) NOT NULL,
  cabinet_id BIGINT NULL,
  distributor_sku_id BIGINT NULL,
  master_code VARCHAR(64) NOT NULL,
  distributor_sku VARCHAR(128) NULL,
  description VARCHAR(512) NOT NULL,
  product_kind ENUM('cabinet','surface','fixture','appliance','accessory','shipping','fee','other') NOT NULL DEFAULT 'cabinet',
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_subtotal DECIMAL(12,2) NOT NULL,
  source_cost DECIMAL(12,2) NULL,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  returnable_quantity INT NOT NULL DEFAULT 0,
  returned_quantity INT NOT NULL DEFAULT 0,
  refunded_quantity INT NOT NULL DEFAULT 0,
  line_status ENUM('open','allocated','released','shipped','partially_returned','returned','cancelled')
    NOT NULL DEFAULT 'open',
  catalog_snapshot_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT sub_line_invoice_fk FOREIGN KEY (sub_invoice_id) REFERENCES distributor_sub_invoices(id),
  CONSTRAINT sub_line_cabinet_fk FOREIGN KEY (cabinet_id) REFERENCES cabinets(id),
  CONSTRAINT sub_line_sku_fk FOREIGN KEY (distributor_sku_id) REFERENCES distributor_skus(id),
  UNIQUE KEY invoice_source_line_unique (sub_invoice_id, source_order_line_key),
  INDEX invoice_code_idx (sub_invoice_id, master_code)
);
```

`catalog_snapshot_json` preserves the description, SKU, selected door style, color, price basis, and other values shown to the customer at purchase time.

## 4. Shipping quotes per distributor

The current single order-level freight quote is insufficient for split fulfillment.

```sql
CREATE TABLE distributor_shipping_quotes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sub_invoice_id BIGINT NOT NULL,
  quote_token_hash CHAR(64) NOT NULL,
  carrier VARCHAR(64) NOT NULL,
  service VARCHAR(128) NULL,
  transport_mode ENUM('parcel','ltl','pickup','manual') NOT NULL,
  destination_zip VARCHAR(16) NOT NULL,
  origin_zip VARCHAR(16) NULL,
  merchandise_subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  quoted_amount DECIMAL(12,2) NOT NULL,
  package_count INT NOT NULL DEFAULT 0,
  quote_payload_json JSON NULL,
  items_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT shipping_quote_invoice_fk FOREIGN KEY (sub_invoice_id) REFERENCES distributor_sub_invoices(id),
  UNIQUE KEY quote_token_hash_unique (quote_token_hash),
  INDEX invoice_expiry_idx (sub_invoice_id, expires_at)
);
```

Rules:

- A quote is accepted only for the exact sub-invoice line set and quantities represented by `items_hash`.
- UPS parcel eligibility is evaluated independently for each distributor.
- A failed UPS quote must not silently become an LTL quote when the customer selected UPS-only behavior.
- The quote amount is copied into the sub-invoice when accepted.

## 5. Shipments and shipment lines

A distributor may produce multiple shipments for one sub-invoice.

```sql
CREATE TABLE distributor_shipments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sub_invoice_id BIGINT NOT NULL,
  shipping_quote_id BIGINT NULL,
  shipment_number VARCHAR(64) NOT NULL UNIQUE,
  carrier VARCHAR(64) NULL,
  service VARCHAR(128) NULL,
  tracking_number VARCHAR(128) NULL,
  status ENUM('pending','label_created','picked_up','in_transit','delivered','exception','cancelled')
    NOT NULL DEFAULT 'pending',
  shipped_at TIMESTAMP NULL,
  delivered_at TIMESTAMP NULL,
  tracking_payload_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT shipment_invoice_fk FOREIGN KEY (sub_invoice_id) REFERENCES distributor_sub_invoices(id),
  CONSTRAINT shipment_quote_fk FOREIGN KEY (shipping_quote_id) REFERENCES distributor_shipping_quotes(id),
  INDEX shipment_invoice_status_idx (sub_invoice_id, status)
);

CREATE TABLE distributor_shipment_lines (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  shipment_id BIGINT NOT NULL,
  sub_invoice_line_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  CONSTRAINT shipment_line_shipment_fk FOREIGN KEY (shipment_id) REFERENCES distributor_shipments(id),
  CONSTRAINT shipment_line_invoice_line_fk FOREIGN KEY (sub_invoice_line_id) REFERENCES distributor_sub_invoice_lines(id),
  UNIQUE KEY shipment_line_unique (shipment_id, sub_invoice_line_id)
);
```

## 6. Payment records and allocations

A single payment may cover one or several sub-invoices, but the allocation table must identify exactly how much belongs to each distributor.

```sql
CREATE TABLE order_payment_allocations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  payment_id BIGINT NOT NULL,
  sub_invoice_id BIGINT NOT NULL,
  merchandise_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipping_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  damage_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  allocated_amount DECIMAL(12,2) NOT NULL,
  refunded_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payment_allocation_payment_fk FOREIGN KEY (payment_id) REFERENCES payments(id),
  CONSTRAINT payment_allocation_invoice_fk FOREIGN KEY (sub_invoice_id) REFERENCES distributor_sub_invoices(id),
  UNIQUE KEY payment_invoice_unique (payment_id, sub_invoice_id),
  INDEX invoice_payment_idx (sub_invoice_id, payment_id)
);
```

Required payment rules:

- `payments` remains the payment-attempt ledger.
- A payment can allocate to one invoice or multiple invoices.
- The sum of allocations must equal the approved payment amount.
- An invoice cannot be marked paid from a client-provided amount; the server derives it from approved allocations.
- Refunds must reference the original payment allocation.

For separate payment buttons, each payment normally has one allocation. For a “Pay selected invoices” action, one payment can have multiple allocations.

## 7. Returns and return lines

```sql
CREATE TABLE distributor_returns (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sub_invoice_id BIGINT NOT NULL,
  return_number VARCHAR(64) NOT NULL UNIQUE,
  requested_by_user_id BIGINT NULL,
  reason_code ENUM('damaged','defective','wrong_item','missing_item','customer_changed_mind','other') NOT NULL,
  customer_note TEXT NULL,
  status ENUM('requested','under_review','authorized','in_transit','received','inspected','approved','rejected','cancelled')
    NOT NULL DEFAULT 'requested',
  carrier VARCHAR(64) NULL,
  tracking_number VARCHAR(128) NULL,
  restocking_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  return_shipping_charge DECIMAL(12,2) NOT NULL DEFAULT 0,
  approved_by_user_id BIGINT NULL,
  approved_at TIMESTAMP NULL,
  received_at TIMESTAMP NULL,
  inspected_at TIMESTAMP NULL,
  inspection_note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT return_invoice_fk FOREIGN KEY (sub_invoice_id) REFERENCES distributor_sub_invoices(id),
  INDEX return_invoice_status_idx (sub_invoice_id, status)
);

CREATE TABLE distributor_return_lines (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  return_id BIGINT NOT NULL,
  sub_invoice_line_id BIGINT NOT NULL,
  quantity_requested INT NOT NULL,
  quantity_authorized INT NOT NULL DEFAULT 0,
  quantity_received INT NOT NULL DEFAULT 0,
  quantity_approved INT NOT NULL DEFAULT 0,
  condition_code ENUM('new','opened','damaged','defective','wrong_item','missing_parts','unusable') NULL,
  refund_eligible_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  refund_tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  refund_shipping_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  refund_damage_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  restocking_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  note TEXT NULL,
  CONSTRAINT return_line_return_fk FOREIGN KEY (return_id) REFERENCES distributor_returns(id),
  CONSTRAINT return_line_invoice_line_fk FOREIGN KEY (sub_invoice_line_id) REFERENCES distributor_sub_invoice_lines(id),
  UNIQUE KEY return_invoice_line_unique (return_id, sub_invoice_line_id)
);
```

Rules:

- A return cannot contain a line from another distributor sub-invoice.
- Approved return quantity cannot exceed shipped quantity minus previously returned quantity.
- The original invoice line remains immutable; return quantities are additive ledger values.
- Customer-change-of-mind, damage, defect, and wrong-item policies can produce different shipping and fee treatment.

## 8. Refunds and refund allocations

```sql
CREATE TABLE distributor_refunds (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sub_invoice_id BIGINT NOT NULL,
  return_id BIGINT NULL,
  original_payment_id BIGINT NOT NULL,
  refund_number VARCHAR(64) NOT NULL UNIQUE,
  provider VARCHAR(64) NOT NULL,
  provider_refund_id VARCHAR(255) NULL,
  status ENUM('pending','submitted','issued','failed','voided') NOT NULL DEFAULT 'pending',
  merchandise_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipping_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  damage_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  restocking_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  reason TEXT NOT NULL,
  requested_by_user_id BIGINT NULL,
  approved_by_user_id BIGINT NULL,
  issued_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT refund_invoice_fk FOREIGN KEY (sub_invoice_id) REFERENCES distributor_sub_invoices(id),
  CONSTRAINT refund_return_fk FOREIGN KEY (return_id) REFERENCES distributor_returns(id),
  CONSTRAINT refund_payment_fk FOREIGN KEY (original_payment_id) REFERENCES payments(id),
  INDEX refund_invoice_status_idx (sub_invoice_id, status)
);

CREATE TABLE distributor_refund_allocations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  refund_id BIGINT NOT NULL,
  payment_allocation_id BIGINT NOT NULL,
  allocated_amount DECIMAL(12,2) NOT NULL,
  CONSTRAINT refund_allocation_refund_fk FOREIGN KEY (refund_id) REFERENCES distributor_refunds(id),
  CONSTRAINT refund_allocation_payment_fk FOREIGN KEY (payment_allocation_id) REFERENCES order_payment_allocations(id),
  UNIQUE KEY refund_payment_allocation_unique (refund_id, payment_allocation_id)
);
```

Refund protections:

- A refund must point to the original payment and its distributor allocation.
- Refunds cannot exceed the remaining refundable amount of that allocation.
- A Pelican refund cannot touch a Cabinet Line allocation.
- The payment provider's refund identifier is stored for reconciliation and idempotency.

## 9. Affiliate commissions

Commissions must be tied to a specific distributor sub-invoice line, not only to the parent order.

```sql
CREATE TABLE affiliate_commission_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  affiliate_id BIGINT NOT NULL,
  order_request_id BIGINT NOT NULL,
  sub_invoice_id BIGINT NOT NULL,
  sub_invoice_line_id BIGINT NULL,
  commission_number VARCHAR(64) NOT NULL UNIQUE,
  status ENUM('pending_payment','accrued','payable','partially_reversed','reversed','paid','voided')
    NOT NULL DEFAULT 'pending_payment',
  sale_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  source_cost_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  eligible_margin_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  commission_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
  gross_commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  reversed_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payable_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT commission_affiliate_fk FOREIGN KEY (affiliate_id) REFERENCES affiliates(id),
  CONSTRAINT commission_order_fk FOREIGN KEY (order_request_id) REFERENCES order_requests(id),
  CONSTRAINT commission_invoice_fk FOREIGN KEY (sub_invoice_id) REFERENCES distributor_sub_invoices(id),
  CONSTRAINT commission_line_fk FOREIGN KEY (sub_invoice_line_id) REFERENCES distributor_sub_invoice_lines(id),
  INDEX commission_affiliate_status_idx (affiliate_id, status),
  INDEX commission_invoice_idx (sub_invoice_id)
);
```

Recommended calculation:

```text
eligible margin = max(0, paid merchandise sale - source cost)
commission = eligible margin × locked commission rate
```

Shipping, sales tax, payment fees, and non-commissionable charges are excluded unless an explicit business rule says otherwise. When a line is returned, a linked commission adjustment is created rather than rewriting the original commission record.

## 10. Fulfillment events and audit trail

```sql
CREATE TABLE distributor_fulfillment_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sub_invoice_id BIGINT NOT NULL,
  event_type ENUM(
    'invoice_created',
    'payment_received',
    'inventory_review_started',
    'inventory_confirmed',
    'fulfillment_released',
    'po_sent',
    'shipment_created',
    'shipment_picked_up',
    'shipment_delivered',
    'return_requested',
    'return_received',
    'refund_issued',
    'fulfillment_blocked',
    'cancelled'
  ) NOT NULL,
  actor_user_id BIGINT NULL,
  note TEXT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fulfillment_event_invoice_fk FOREIGN KEY (sub_invoice_id) REFERENCES distributor_sub_invoices(id),
  INDEX fulfillment_event_invoice_time_idx (sub_invoice_id, created_at)
);
```

This gives administrators a complete timeline without relying on mutable status fields alone.

## 11. Recommended state rules

### Sub-invoice payment

```text
payment_required
  → partially_paid
  → paid
```

A paid sub-invoice may enter inventory review. It must not be released to a distributor before its required payment is complete unless an administrator explicitly records an approved credit or payment exception.

### Returns

```text
paid / fulfilled
  → return_requested
  → authorized
  → received
  → inspected
  → approved
  → refund_issued
```

### Parent order roll-up

The parent order is derived from all sub-invoices:

- `paymentStatus = paid` only when every payable sub-invoice is fully paid.
- `paymentStatus = partially_paid` when at least one sub-invoice is paid and another remains unpaid.
- `fulfillmentStatus = partially_shipped` when at least one distributor shipment has shipped and another has not.
- `fulfillmentStatus = partially_returned` when an approved return exists but not all distributor lines are returned.
- `refunded` only when the total refunded amount equals the refundable parent-order amount.

## 12. Data integrity constraints

The server must enforce these rules transactionally:

1. Every new order line resolves to exactly one distributor or is explicitly marked non-distributor merchandise.
2. Every distributor line belongs to exactly one sub-invoice.
3. A sub-invoice has one immutable distributor and parent order.
4. Payment allocations cannot exceed the sub-invoice total.
5. Refund allocations cannot exceed the original payment allocation minus prior refunds.
6. Return quantities cannot exceed shipped quantities minus previous returns.
7. Commission entries cannot produce negative payable commission.
8. A returned line can reverse only the commission generated by that line or its sub-invoice.
9. Shipping quotes are scoped to the exact distributor line set and destination.
10. All money calculations use integer cents or decimal-safe server calculations; never trust browser totals.
11. Payment and refund mutations use idempotency keys/provider references.
12. Historical invoice, price, cost, tax, and shipping snapshots are never rewritten by later catalog changes.

## 13. Suggested Drizzle implementation order

1. Add parent-order split status and roll-up fields.
2. Add `distributor_sub_invoices` and `distributor_sub_invoice_lines`.
3. Backfill existing single-distributor orders into one sub-invoice each.
4. Add per-distributor shipping quotes.
5. Add payment allocations and update payment authorization to charge selected sub-invoices.
6. Add return and refund tables with server-side amount validation.
7. Add affiliate commission entries and reversal records.
8. Add fulfillment events and admin/affiliate views.
9. Keep the old single-invoice payment path for historical orders until migration is verified.
10. Add a feature flag so split checkout can be enabled only after end-to-end payment and refund tests pass.

## 14. Example split order

For parent order `CD-2026-1042`:

| Record | Distributor | Total | Paid | Balance |
|---|---|---:|---:|---:|
| Sub-invoice A | Cabinet Line | $3,014.00 | $3,014.00 | $0.00 |
| Sub-invoice B | Pelican | $854.28 | $0.00 | $854.28 |
| Parent order | Combined | $3,868.28 | $3,014.00 | $854.28 |

If the Pelican faucet is returned later, only:

- Pelican sub-invoice lines
- Pelican return and refund records
- Pelican payment allocation
- Pelican fulfillment status
- The related Pelican affiliate commission entry

are changed. Cabinet Line records remain unchanged.

## Implementation status

This document is a **proposed schema only**. No database migration, checkout behavior, payment behavior, refund behavior, or commission behavior has been changed.