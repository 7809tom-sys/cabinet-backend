import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  distributorSkus,
  orderRequests,
  orderShipments,
  stripePaymentRecords,
  vendorProducts,
  type OrderLineItem,
} from "../../drizzle/schema";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { readOrderCostSnapshots, pickCurrentDistributorCost, type CatalogCostRow } from "./orderCostSnapshot";
import {
  buildAdminOrderDetail,
  chooseStoredStripeCharge,
  dollarsToCents,
  joinUniqueLabels,
  resolveLineDistributorCost,
  summarizeAdminOrder,
  type AdminOrderDetail,
  type AdminOrderListMoney,
  type OrderMoneyInput,
  type StoredStripeCharge,
  type StripeAmountSource,
} from "./orderMoney";
import { readStripeChargeFacts } from "./stripeChargeFacts";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type ListFacts = {
  carrier: string | null;
  shippingMethod: string | null;
  orderLevelDiscountCents: number;
  stripeAmountChargedCents: number | null;
  chargeId: string | null;
  paymentIntentId: string | null;
};

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function loadStoredCharges(db: Database, orders: OrderMoneyInput[]): Promise<StoredStripeCharge[]> {
  const ids = orders.map((order) => order.id);
  const paymentIntentIds = orders.map((order) => order.stripePaymentIntentId).filter((id): id is string => Boolean(id));
  const sessionIds = orders.map((order) => order.stripeSessionId).filter((id): id is string => Boolean(id));
  const filters: SQL[] = [];
  if (ids.length > 0) filters.push(inArray(stripePaymentRecords.orderRequestId, ids));
  if (paymentIntentIds.length > 0) filters.push(inArray(stripePaymentRecords.paymentIntentId, paymentIntentIds));
  if (sessionIds.length > 0) filters.push(inArray(stripePaymentRecords.checkoutSessionId, sessionIds));
  if (filters.length === 0) return [];
  const where = filters.length === 1 ? filters[0] : or(...filters);
  const rows = await db.select({
    orderRequestId: stripePaymentRecords.orderRequestId,
    paymentIntentId: stripePaymentRecords.paymentIntentId,
    checkoutSessionId: stripePaymentRecords.checkoutSessionId,
    chargeId: stripePaymentRecords.chargeId,
    amountCents: stripePaymentRecords.amountCents,
    status: stripePaymentRecords.status,
    occurredAt: stripePaymentRecords.occurredAt,
  }).from(stripePaymentRecords).where(where);
  return rows;
}

async function loadShipmentCarriers(db: Database, orderIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (orderIds.length === 0) return map;
  const rows = await db.select({
    orderRequestId: orderShipments.orderRequestId,
    carrier: orderShipments.carrier,
  }).from(orderShipments).where(inArray(orderShipments.orderRequestId, orderIds));
  for (const row of rows) {
    map.set(row.orderRequestId, joinUniqueLabels(map.get(row.orderRequestId) ?? null, row.carrier) ?? "");
  }
  return map;
}

async function listFacts(db: Database, orders: OrderMoneyInput[]): Promise<Map<number, ListFacts>> {
  const [charges, shipments, snapshots] = await Promise.all([
    loadStoredCharges(db, orders),
    loadShipmentCarriers(db, orders.map((order) => order.id)),
    readOrderCostSnapshots(db, orders.map((order) => order.id)),
  ]);
  const commerceByOrder = new Map(snapshots.commerce.map((row) => [row.orderRequestId, row]));
  const facts = new Map<number, ListFacts>();
  for (const order of orders) {
    const commerce = commerceByOrder.get(order.id);
    const charge = chooseStoredStripeCharge(order, charges);
    const carrier = text(commerce?.shippingCarrier) ?? text(shipments.get(order.id));
    facts.set(order.id, {
      carrier,
      shippingMethod: text(commerce?.shippingService),
      orderLevelDiscountCents: Math.max(0, dollarsToCents(commerce?.discountAmount) ?? 0),
      stripeAmountChargedCents: charge?.amountCents ?? null,
      chargeId: charge?.chargeId ?? null,
      paymentIntentId: charge?.paymentIntentId ?? order.stripePaymentIntentId ?? null,
    });
  }
  return facts;
}

export async function enrichAdminOrderRows<T extends OrderMoneyInput>(db: Database, rows: T[]): Promise<Array<T & AdminOrderListMoney>> {
  if (rows.length === 0) return [];
  const facts = await listFacts(db, rows);
  return rows.map((row) => {
    const extra = facts.get(row.id);
    return {
      ...row,
      ...summarizeAdminOrder(row, extra),
    };
  });
}

async function currentCosts(db: Database, lines: OrderLineItem[]): Promise<{
  cabinets: CatalogCostRow[];
  vendors: Map<number, { sku: string | null; cents: number | null }>;
  pelican: Map<number, { sku: string | null; cents: number | null }>;
}> {
  const cabinetIds = Array.from(new Set(lines.map((line) => line.cabinetId).filter((id): id is number => typeof id === "number" && id > 0)));
  const styleIds = Array.from(new Set(lines.map((line) => line.styleId).filter((id): id is number => typeof id === "number" && id > 0)));
  const vendorIds = Array.from(new Set(lines.map((line) => line.vendorProductId).filter((id): id is number => typeof id === "number" && id > 0)));
  const pelicanIds = Array.from(new Set(lines.map((line) => line.pelicanProductId).filter((id): id is number => typeof id === "number" && id > 0)));
  const cabinets = cabinetIds.length > 0 && styleIds.length > 0
    ? await db.select({
      cabinetId: distributorSkus.cabinetId,
      styleId: distributorSkus.styleId,
      distributorId: distributorSkus.distributorId,
      distributorSku: distributorSkus.distributorSku,
      yourCost: distributorSkus.yourCost,
      isAvailable: distributorSkus.isAvailable,
      isPublished: distributorSkus.isPublished,
    }).from(distributorSkus).where(and(inArray(distributorSkus.cabinetId, cabinetIds), inArray(distributorSkus.styleId, styleIds)))
    : [];
  const vendorRows = vendorIds.length > 0
    ? await db.select({ id: vendorProducts.id, vendorSku: vendorProducts.vendorSku, yourCost: vendorProducts.yourCost }).from(vendorProducts).where(inArray(vendorProducts.id, vendorIds))
    : [];
  const pelicanRows = pelicanIds.length > 0
    ? await db.select({ id: pelicanProducts.id, pelicanCode: pelicanProducts.pelicanCode, yourCost: pelicanProducts.yourCost }).from(pelicanProducts).where(inArray(pelicanProducts.id, pelicanIds))
    : [];
  return {
    cabinets,
    vendors: new Map(vendorRows.map((row) => [row.id, { sku: row.vendorSku, cents: dollarsToCents(row.yourCost) }])),
    pelican: new Map(pelicanRows.map((row) => [row.id, { sku: row.pelicanCode, cents: dollarsToCents(row.yourCost) }])),
  };
}

export async function loadAdminOrderDetail(
  db: Database,
  orderId: number,
  options?: { fetchStripe?: (ids: { paymentIntentId?: string | null; chargeId?: string | null }) => Promise<Awaited<ReturnType<typeof readStripeChargeFacts>> | null> },
): Promise<AdminOrderDetail> {
  const [order] = await db.select().from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
  const lines = (order.lineItems ?? []) as OrderLineItem[];
  const moneyOrder: OrderMoneyInput = { ...order, lineItems: lines };
  const facts = await listFacts(db, [moneyOrder]);
  const extra = facts.get(order.id);
  const snapshots = await readOrderCostSnapshots(db, [order.id]);
  const tableByIndex = new Map(snapshots.lines.filter((row) => row.orderRequestId === order.id).map((row) => [row.lineIndex, row]));
  const needsCurrent = lines.some((line, index) => {
    const table = tableByIndex.get(index);
    return line.unitDistributorCost == null && line.hardwareUnitCostCents == null && dollarsToCents(table?.unitDistributorCost) == null;
  });
  const catalog = needsCurrent ? await currentCosts(db, lines) : { cabinets: [], vendors: new Map(), pelican: new Map() };
  const lineCosts = lines.map((line, index) => {
    const table = tableByIndex.get(index);
    let currentUnitCostCents: number | null = null;
    let currentSku: string | null = null;
    if (line.productKind === "hardware" && line.vendorProductId != null) {
      const product = catalog.vendors.get(line.vendorProductId);
      currentUnitCostCents = product?.cents ?? null;
      currentSku = product?.sku ?? null;
    } else if (line.productKind === "surface" && line.pelicanProductId != null) {
      const product = catalog.pelican.get(line.pelicanProductId);
      currentUnitCostCents = product?.cents ?? null;
      currentSku = product?.sku ?? null;
    } else {
      const picked = pickCurrentDistributorCost(line, catalog.cabinets);
      currentUnitCostCents = picked?.cents ?? null;
      currentSku = picked?.sku ?? null;
    }
    return resolveLineDistributorCost({
      line,
      tableUnitCostCents: dollarsToCents(table?.unitDistributorCost),
      tableSku: text(table?.sku),
      currentUnitCostCents,
      currentSku,
    });
  });

  let amountSource: StripeAmountSource = extra?.stripeAmountChargedCents != null ? "stored_charge" : "unavailable";
  let stripeAmount = extra?.stripeAmountChargedCents ?? null;
  let feeCents: number | null = null;
  let netCents: number | null = null;
  let chargeId = extra?.chargeId ?? null;
  let paymentIntentId = extra?.paymentIntentId ?? order.stripePaymentIntentId ?? null;
  const shouldFetch = options?.fetchStripe != null && (stripeAmount == null || paymentIntentId != null || chargeId != null);
  if (shouldFetch && options?.fetchStripe && (paymentIntentId || chargeId)) {
    try {
      const live = await options.fetchStripe({ paymentIntentId, chargeId });
      if (live) {
        if (stripeAmount == null && live.amountReceivedCents != null) {
          stripeAmount = live.amountReceivedCents;
          amountSource = "stripe_payment_intent";
        }
        feeCents = live.feeCents;
        netCents = live.netCents;
        chargeId = chargeId ?? live.chargeId;
        paymentIntentId = paymentIntentId ?? live.paymentIntentId;
      }
    } catch (error) {
      console.error(`[Admin Order] Stripe reconciliation lookup failed for order ${orderId}:`, error instanceof Error ? error.message : "unknown error");
    }
  }

  return buildAdminOrderDetail({
    order: moneyOrder,
    carrier: extra?.carrier,
    shippingMethod: extra?.shippingMethod,
    orderLevelDiscountCents: extra?.orderLevelDiscountCents,
    stripeAmountChargedCents: stripeAmount,
    stripeFeeCents: feeCents,
    stripeNetCents: netCents,
    paymentIntentId,
    chargeId,
    amountSource,
    lineCosts,
  });
}
