-- TiDB SQL editor version of the admin order reconciliation columns.
-- Paste each numbered block on its own.
-- One statement per block. Do not paste drizzle breakpoint markers into these blocks.
-- Safe to re-run: IF NOT EXISTS, tables qualified as cabinet_dealz.<table>.
-- receiptSentAt stays null until a paid-order receipt is claimed.

-- 1
ALTER TABLE cabinet_dealz.order_requests ADD COLUMN IF NOT EXISTS receiptSentAt TIMESTAMP NULL;

-- 2
CREATE TABLE IF NOT EXISTS cabinet_dealz.order_request_line_costs (
  id INT NOT NULL AUTO_INCREMENT,
  orderRequestId INT NOT NULL,
  lineIndex INT NOT NULL,
  sku VARCHAR(128) NULL,
  itemCode VARCHAR(128) NULL,
  unitDistributorCost DECIMAL(10, 2) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY order_request_line_costs_order_line_uq (orderRequestId, lineIndex)
);

-- 3
CREATE TABLE IF NOT EXISTS cabinet_dealz.order_request_commerce_snapshots (
  id INT NOT NULL AUTO_INCREMENT,
  orderRequestId INT NOT NULL,
  shippingCarrier VARCHAR(120) NULL,
  shippingService VARCHAR(160) NULL,
  discountAmount DECIMAL(12, 2) NULL,
  stripeFeeCents INT NULL,
  stripeNetCents INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY order_request_commerce_snapshots_order_uq (orderRequestId)
);

-- 4
ALTER TABLE cabinet_dealz.order_request_commerce_snapshots ADD COLUMN IF NOT EXISTS stripeFeeCents INT NULL;

-- 5
ALTER TABLE cabinet_dealz.order_request_commerce_snapshots ADD COLUMN IF NOT EXISTS stripeNetCents INT NULL;
