import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { getDb } from "../db";
import { distributors, orderRequests, orderShipments, vendorLines } from "../../drizzle/schema";
import { pelicanProducts, pelicanShippingProfiles } from "../../drizzle/pelicanSchema";
import { approvedVendorLinkedDistributorIds } from "./approvedVendorAccess";
import { HARDWARE_LINE_CODE } from "../../shared/hardwareCommerce";
import {
  PELICAN_SCOPE,
  distributorScope,
  fulfillmentStage,
  groupLinesByVendorScope,
  parseVendorScope,
  upcomingStageLabel,
  validateShipment,
  type FulfillmentLineInput,
  type VendorFulfillmentItem,
  type VendorScope,
} from "../../shared/vendorFulfillment";

export type FulfillmentDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Newest paid orders scanned per queue load; paid orders are a small set. */
const QUEUE_SCAN_LIMIT = 400;

export type VendorAccessUser = {
  role: string;
  distributorId?: number | null;
  approvedVendorLineId?: number | null;
};

export type AllowedScopes = { all: true } | { all: false; scopes: Set<VendorScope> };

async function scopesForApprovedVendor(db: FulfillmentDb, approvedVendorLineId: number): Promise<VendorScope[]> {
  const [vendor] = await db
    .select({
      sourceKey: vendorLines.sourceKey,
      linkedDistributorIds: vendorLines.linkedDistributorIds,
      isApproved: vendorLines.isApproved,
    })
    .from(vendorLines)
    .where(eq(vendorLines.id, approvedVendorLineId))
    .limit(1);
  if (!vendor?.isApproved) return [];
  const scopes: VendorScope[] = [];
  if (vendor.sourceKey?.trim().toLowerCase() === PELICAN_SCOPE) scopes.push(PELICAN_SCOPE);
  const supplierLines = await db
    .select({ id: distributors.id, code: distributors.code, name: distributors.name, isActive: distributors.isActive })
    .from(distributors);
  for (const id of approvedVendorLinkedDistributorIds(vendor, supplierLines)) scopes.push(distributorScope(id));
  return scopes;
}

/**
 * Which vendor scopes a signed-in account may act on. Admins may act on any
 * scope. A vendor account is limited to its own linked supply line and to the
 * lines/Pelican identity carried by its approved vendor record; identity comes
 * from IDs and the explicit "pelican" source key, never from names.
 */
export async function allowedVendorScopes(db: FulfillmentDb, user: VendorAccessUser): Promise<AllowedScopes> {
  if (user.role === "admin") return { all: true };
  const scopes = new Set<VendorScope>();
  if (user.distributorId != null) scopes.add(distributorScope(user.distributorId));
  if (user.approvedVendorLineId != null) {
    for (const scope of await scopesForApprovedVendor(db, user.approvedVendorLineId)) scopes.add(scope);
  }
  return { all: false, scopes };
}

export type ScopeOption = { scope: VendorScope; label: string };

/**
 * The vendor scopes the portal should offer right now. A vendor account gets
 * exactly the scopes it owns. An administrator "viewing as" a vendor passes the
 * portal's approved-vendor id and/or supply-line id and gets that vendor's scopes.
 */
export async function listVendorScopes(
  db: FulfillmentDb,
  user: VendorAccessUser,
  viewAs: { approvedVendorLineId?: number | null; distributorId?: number | null },
): Promise<ScopeOption[]> {
  let scopes: VendorScope[];
  if (user.role === "admin") {
    const found = new Set<VendorScope>();
    if (viewAs.approvedVendorLineId != null) {
      for (const scope of await scopesForApprovedVendor(db, viewAs.approvedVendorLineId)) found.add(scope);
    }
    if (viewAs.distributorId != null) found.add(distributorScope(viewAs.distributorId));
    scopes = Array.from(found);
  } else {
    const allowed = await allowedVendorScopes(db, user);
    scopes = allowed.all ? [] : Array.from(allowed.scopes);
  }
  const ids = scopes.filter((s) => s !== PELICAN_SCOPE).map((s) => Number(s.slice("dist:".length)));
  const names = ids.length
    ? await db.select({ id: distributors.id, name: distributors.name, code: distributors.code }).from(distributors).where(inArray(distributors.id, ids))
    : [];
  const nameById = new Map(names.map((row) => [row.id, row.name || row.code]));
  return scopes
    .map((scope) => ({
      scope,
      label: scope === PELICAN_SCOPE ? "Pelican Surfaces & Fixtures" : nameById.get(Number(scope.slice("dist:".length))) ?? scope,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function assertVendorScope(db: FulfillmentDb, user: VendorAccessUser, rawScope: string): Promise<VendorScope> {
  const scope = parseVendorScope(rawScope);
  if (!scope) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown vendor." });
  const allowed = await allowedVendorScopes(db, user);
  if (!allowed.all && !allowed.scopes.has(scope)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "That vendor is not linked to your account." });
  }
  return scope;
}

async function hardwareDistributorId(db: FulfillmentDb): Promise<number | null> {
  const [line] = await db
    .select({ id: distributors.id })
    .from(distributors)
    .where(eq(distributors.code, HARDWARE_LINE_CODE))
    .limit(1);
  return line?.id ?? null;
}

type OrderRow = {
  id: number;
  status: string;
  paidAt: Date | null;
  orderRailStatus: string;
  distributorId: number | null;
  affiliateId: number | null;
  lineItems: unknown;
};

function orderLines(row: Pick<OrderRow, "lineItems">): FulfillmentLineInput[] {
  const raw = typeof row.lineItems === "string" ? safeJson(row.lineItems) : row.lineItems;
  return Array.isArray(raw) ? (raw as FulfillmentLineInput[]) : [];
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type VendorQueueShipment = {
  status: "pending" | "shipped";
  carrier: string | null;
  trackingNumber: string | null;
  packageCount: number;
  notes: string | null;
  labelPrintedAt: Date | null;
  shippedAt: Date | null;
};

export type VendorQueueOrder = {
  orderId: number;
  requestNumber: string;
  createdAt: Date;
  paidAt: Date | null;
  stage: "ready" | "upcoming";
  stageLabel: string;
  customerName: string | null;
  customerPhone: string | null;
  shipTo: { line1: string | null; line2: string | null; city: string | null; state: string | null; zip: string | null };
  deliveryMethod: "ship" | "pickup";
  deliveryLocationType: "business" | "residential";
  liftgateRequired: boolean;
  items: VendorFulfillmentItem[];
  shipFrom: string;
  shipment: VendorQueueShipment | null;
};

async function shipFromFor(
  db: FulfillmentDb,
  scope: VendorScope,
  orderItems: VendorFulfillmentItem[][],
): Promise<string> {
  if (scope === PELICAN_SCOPE) {
    const codes = Array.from(new Set(orderItems.flat().map((item) => item.sku).filter((sku) => sku && sku !== "—")));
    if (codes.length === 0) return "";
    const rows = await db
      .select({ originName: pelicanShippingProfiles.originName, originZip: pelicanShippingProfiles.originZip })
      .from(pelicanProducts)
      .innerJoin(pelicanShippingProfiles, eq(pelicanShippingProfiles.pelicanProductId, pelicanProducts.id))
      .where(inArray(pelicanProducts.pelicanCode, codes))
      .limit(1);
    return rows[0] ? `${rows[0].originName}, ${rows[0].originZip}` : "";
  }
  const id = Number(scope.slice("dist:".length));
  const [line] = await db
    .select({
      warehouseName: distributors.warehouseName,
      warehouseAddress: distributors.warehouseAddress,
      pickupAddress: distributors.pickupAddress,
      name: distributors.name,
    })
    .from(distributors)
    .where(eq(distributors.id, id))
    .limit(1);
  if (!line) return "";
  const place = line.warehouseAddress || line.pickupAddress || "";
  return [line.warehouseName || line.name, place].filter(Boolean).join(", ");
}

/**
 * Every paid order that contains this vendor's items, split into "ready" (the
 * official order rail authorized fulfillment) and "upcoming" (paid but still
 * waiting on an earlier review step). Only this vendor's lines are returned;
 * no prices, totals, margins or other vendors' items ever leave this function.
 */
export async function loadVendorQueue(db: FulfillmentDb, scope: VendorScope): Promise<VendorQueueOrder[]> {
  const hardwareId = await hardwareDistributorId(db);
  const rows = await db
    .select({
      id: orderRequests.id,
      requestNumber: orderRequests.requestNumber,
      createdAt: orderRequests.createdAt,
      status: orderRequests.status,
      paidAt: orderRequests.paidAt,
      orderRailStatus: orderRequests.orderRailStatus,
      distributorId: orderRequests.distributorId,
      affiliateId: orderRequests.affiliateId,
      lineItems: orderRequests.lineItems,
      originatorName: orderRequests.originatorName,
      originatorPhone: orderRequests.originatorPhone,
      line1: orderRequests.shippingAddressLine1,
      line2: orderRequests.shippingAddressLine2,
      city: orderRequests.shippingCity,
      state: orderRequests.shippingState,
      zip: orderRequests.zip,
      deliveryMethod: orderRequests.deliveryMethod,
      deliveryLocationType: orderRequests.deliveryLocationType,
      liftgateRequired: orderRequests.liftgateRequired,
    })
    .from(orderRequests)
    .where(and(eq(orderRequests.status, "confirmed"), isNotNull(orderRequests.paidAt)))
    .orderBy(desc(orderRequests.createdAt))
    .limit(QUEUE_SCAN_LIMIT);

  const matched: Array<{ row: (typeof rows)[number]; items: VendorFulfillmentItem[] }> = [];
  for (const row of rows) {
    if (fulfillmentStage(row) === "hidden") continue;
    const items = groupLinesByVendorScope(orderLines(row), {
      orderDistributorId: row.distributorId,
      hardwareDistributorId: hardwareId,
    }).get(scope);
    if (items && items.length > 0) matched.push({ row, items });
  }
  if (matched.length === 0) return [];

  const shipmentRows = await db
    .select()
    .from(orderShipments)
    .where(and(inArray(orderShipments.orderRequestId, matched.map((m) => m.row.id)), eq(orderShipments.vendorScope, scope)));
  const shipmentByOrder = new Map(shipmentRows.map((s) => [s.orderRequestId, s]));
  const shipFrom = await shipFromFor(db, scope, matched.map((m) => m.items));

  return matched.map(({ row, items }) => {
    const stage = fulfillmentStage(row) as "ready" | "upcoming";
    const shipment = shipmentByOrder.get(row.id);
    return {
      orderId: row.id,
      requestNumber: row.requestNumber,
      createdAt: row.createdAt,
      paidAt: row.paidAt,
      stage,
      stageLabel: stage === "ready" ? "Ready to ship" : upcomingStageLabel(row.orderRailStatus, { hasAffiliate: row.affiliateId != null }),
      customerName: row.originatorName,
      customerPhone: row.originatorPhone,
      shipTo: { line1: row.line1, line2: row.line2, city: row.city, state: row.state, zip: row.zip },
      deliveryMethod: row.deliveryMethod,
      deliveryLocationType: row.deliveryLocationType,
      liftgateRequired: row.liftgateRequired,
      items,
      shipFrom,
      shipment: shipment
        ? {
            status: shipment.status,
            carrier: shipment.carrier,
            trackingNumber: shipment.trackingNumber,
            packageCount: shipment.packageCount,
            notes: shipment.notes,
            labelPrintedAt: shipment.labelPrintedAt,
            shippedAt: shipment.shippedAt,
          }
        : null,
    };
  });
}

/** Load one order and require that it has this vendor's items and is ready to ship. */
async function requireReadyOrder(db: FulfillmentDb, scope: VendorScope, orderId: number): Promise<OrderRow> {
  const [order] = await db
    .select({
      id: orderRequests.id,
      status: orderRequests.status,
      paidAt: orderRequests.paidAt,
      orderRailStatus: orderRequests.orderRailStatus,
      distributorId: orderRequests.distributorId,
      affiliateId: orderRequests.affiliateId,
      lineItems: orderRequests.lineItems,
    })
    .from(orderRequests)
    .where(eq(orderRequests.id, orderId))
    .limit(1);
  const hardwareId = order ? await hardwareDistributorId(db) : null;
  const items = order
    ? groupLinesByVendorScope(orderLines(order), { orderDistributorId: order.distributorId, hardwareDistributorId: hardwareId }).get(scope)
    : undefined;
  // One message for "no such order" and "not your order" so ids cannot be probed.
  if (!order || !items || items.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "This order has no items from your catalog." });
  }
  const stage = fulfillmentStage(order);
  if (stage !== "ready") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: stage === "upcoming" ? `Not ready to ship yet: ${upcomingStageLabel(order.orderRailStatus, { hasAffiliate: order.affiliateId != null }).toLowerCase()}.` : "This order is not paid.",
    });
  }
  return order;
}

function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const n = (header as { affectedRows?: number } | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
}

async function ensureShipmentRow(db: FulfillmentDb, scope: VendorScope, orderId: number) {
  await db
    .insert(orderShipments)
    .values({ orderRequestId: orderId, vendorScope: scope })
    .onDuplicateKeyUpdate({ set: { orderRequestId: sql`orderRequestId` } });
}

export async function recordLabelPrinted(db: FulfillmentDb, scope: VendorScope, orderId: number): Promise<void> {
  await requireReadyOrder(db, scope, orderId);
  await ensureShipmentRow(db, scope, orderId);
  await db
    .update(orderShipments)
    .set({ labelPrintedAt: new Date() })
    .where(and(eq(orderShipments.orderRequestId, orderId), eq(orderShipments.vendorScope, scope)));
}

export type RecordShipmentInput = {
  scope: VendorScope;
  orderId: number;
  userId: number | null;
  carrier: string;
  trackingNumber?: string | null;
  packageCount?: number | null;
  notes?: string | null;
};

/**
 * Mark this vendor's part of an order shipped. The first call moves the row from
 * pending to shipped and stamps shippedAt; later calls only correct carrier,
 * tracking, package count or notes and never move shippedAt, so a typo fix is
 * safe and cannot create a second shipment for the same vendor.
 */
export async function recordShipment(db: FulfillmentDb, input: RecordShipmentInput): Promise<{ firstShip: boolean }> {
  const checked = validateShipment(input);
  if (!checked.ok) throw new TRPCError({ code: "BAD_REQUEST", message: checked.message });
  await requireReadyOrder(db, input.scope, input.orderId);
  await ensureShipmentRow(db, input.scope, input.orderId);
  const notes = input.notes?.trim() ? input.notes.trim().slice(0, 1000) : null;
  const fields = {
    carrier: checked.carrier,
    trackingNumber: checked.trackingNumber,
    packageCount: checked.packageCount,
    notes,
  };
  const first = await db
    .update(orderShipments)
    .set({ ...fields, status: "shipped", shippedAt: new Date(), shippedByUserId: input.userId })
    .where(and(
      eq(orderShipments.orderRequestId, input.orderId),
      eq(orderShipments.vendorScope, input.scope),
      eq(orderShipments.status, "pending"),
    ));
  if (affectedRows(first) > 0) return { firstShip: true };
  await db
    .update(orderShipments)
    .set(fields)
    .where(and(
      eq(orderShipments.orderRequestId, input.orderId),
      eq(orderShipments.vendorScope, input.scope),
      eq(orderShipments.status, "shipped"),
    ));
  return { firstShip: false };
}
