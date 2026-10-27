import { and, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  distributorSkus,
  orderRequestCommerceSnapshots,
  orderRequestLineCosts,
  vendorProducts,
  type OrderLineItem,
} from "../../drizzle/schema";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { dollarsToCents } from "./orderMoney";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type CatalogCostRow = {
  cabinetId: number | null;
  styleId: number | null;
  distributorId: number | null;
  distributorSku: string | null;
  yourCost: string | number | null;
  isAvailable?: boolean | null;
  isPublished?: boolean | null;
};

export function isMissingSchemaError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const row = current as { code?: string; errno?: number; message?: string; cause?: unknown };
    if (row.code === "ER_NO_SUCH_TABLE" || row.code === "ER_BAD_FIELD_ERROR" || row.errno === 1146 || row.errno === 1054) return true;
    if (typeof row.message === "string" && /doesn't exist|does not exist|unknown column|no such table/i.test(row.message)) return true;
    current = row.cause;
  }
  if (typeof error === "string" && /doesn't exist|unknown column|no such table/i.test(error)) return true;
  return false;
}

function isDuplicateKey(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate|ER_DUP_ENTRY/i.test(message);
}

export function pickCurrentDistributorCost(line: { cabinetId?: number | null; styleId?: number | null; distributorId?: number | null }, rows: CatalogCostRow[]): { cents: number; sku: string | null } | null {
  const styleId = line.styleId ?? null;
  const candidates = rows.filter((row) => row.cabinetId === line.cabinetId && row.styleId === styleId && dollarsToCents(row.yourCost) != null);
  if (candidates.length === 0) return null;
  const ranked = candidates.slice().sort((left, right) => {
    const leftDistributor = line.distributorId != null && left.distributorId === line.distributorId ? 1 : 0;
    const rightDistributor = line.distributorId != null && right.distributorId === line.distributorId ? 1 : 0;
    if (leftDistributor !== rightDistributor) return rightDistributor - leftDistributor;
    const leftLive = left.isAvailable !== false && left.isPublished !== false ? 1 : 0;
    const rightLive = right.isAvailable !== false && right.isPublished !== false ? 1 : 0;
    return rightLive - leftLive;
  });
  const chosen = ranked[0];
  return { cents: dollarsToCents(chosen.yourCost)!, sku: chosen.distributorSku?.trim() || null };
}

function dollarsFromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export async function withDistributorCostSnapshots<T extends OrderLineItem>(db: Database, lines: T[]): Promise<T[]> {
  const cabinetIds = Array.from(new Set(lines.map((line) => line.cabinetId).filter((id): id is number => typeof id === "number" && id > 0)));
  const styleIds = Array.from(new Set(lines.map((line) => line.styleId).filter((id): id is number => typeof id === "number" && id > 0)));
  const vendorIds = Array.from(new Set(lines.map((line) => line.vendorProductId).filter((id): id is number => typeof id === "number" && id > 0)));
  const pelicanIds = Array.from(new Set(lines.map((line) => line.pelicanProductId).filter((id): id is number => typeof id === "number" && id > 0)));

  const skuRows = cabinetIds.length > 0 && styleIds.length > 0
    ? await db.select({
      cabinetId: distributorSkus.cabinetId,
      styleId: distributorSkus.styleId,
      distributorId: distributorSkus.distributorId,
      distributorSku: distributorSkus.distributorSku,
      yourCost: distributorSkus.yourCost,
      isAvailable: distributorSkus.isAvailable,
      isPublished: distributorSkus.isPublished,
    }).from(distributorSkus).where(and(
      inArray(distributorSkus.cabinetId, cabinetIds),
      inArray(distributorSkus.styleId, styleIds),
    ))
    : [];
  const vendorRows = vendorIds.length > 0
    ? await db.select({ id: vendorProducts.id, vendorSku: vendorProducts.vendorSku, yourCost: vendorProducts.yourCost })
      .from(vendorProducts)
      .where(inArray(vendorProducts.id, vendorIds))
    : [];
  const pelicanRows = pelicanIds.length > 0
    ? await db.select({ id: pelicanProducts.id, pelicanCode: pelicanProducts.pelicanCode, yourCost: pelicanProducts.yourCost })
      .from(pelicanProducts)
      .where(inArray(pelicanProducts.id, pelicanIds))
    : [];
  const vendorById = new Map(vendorRows.map((row) => [row.id, row]));
  const pelicanById = new Map(pelicanRows.map((row) => [row.id, row]));

  return lines.map((line) => {
    if (line.unitDistributorCost != null && Number.isFinite(Number(line.unitDistributorCost))) return line;
    if (typeof line.hardwareUnitCostCents === "number" && Number.isFinite(line.hardwareUnitCostCents)) {
      return { ...line, unitDistributorCost: dollarsFromCents(line.hardwareUnitCostCents) };
    }
    if (line.productKind === "hardware" && line.vendorProductId != null) {
      const product = vendorById.get(line.vendorProductId);
      const cents = dollarsToCents(product?.yourCost);
      if (cents == null) return line;
      return { ...line, unitDistributorCost: dollarsFromCents(cents), distributorSku: line.distributorSku ?? product?.vendorSku ?? null };
    }
    if (line.productKind === "surface" && line.pelicanProductId != null) {
      const product = pelicanById.get(line.pelicanProductId);
      const cents = dollarsToCents(product?.yourCost);
      if (cents == null) return line;
      return { ...line, unitDistributorCost: dollarsFromCents(cents), distributorSku: line.distributorSku ?? product?.pelicanCode ?? null };
    }
    const picked = pickCurrentDistributorCost(line, skuRows);
    if (!picked) return line;
    return {
      ...line,
      unitDistributorCost: dollarsFromCents(picked.cents),
      distributorSku: line.distributorSku ?? picked.sku,
    };
  });
}

export async function persistOrderCostSnapshot(
  db: Database,
  orderId: number,
  lines: OrderLineItem[],
  shipping: { carrier?: string | null; service?: string | null; discountAmount?: string | null },
): Promise<void> {
  const costRows = lines.flatMap((line, lineIndex) => {
    if (line.unitDistributorCost == null || !Number.isFinite(Number(line.unitDistributorCost))) return [];
    return [{
      orderRequestId: orderId,
      lineIndex,
      sku: line.distributorSku ?? null,
      itemCode: line.masterCode || line.rawCode || null,
      unitDistributorCost: Number(line.unitDistributorCost).toFixed(2),
    }];
  });
  try {
    if (costRows.length > 0) await db.insert(orderRequestLineCosts).values(costRows);
    if (shipping.carrier || shipping.service || shipping.discountAmount) {
      await db.insert(orderRequestCommerceSnapshots).values({
        orderRequestId: orderId,
        shippingCarrier: shipping.carrier ?? null,
        shippingService: shipping.service ?? null,
        discountAmount: shipping.discountAmount ?? null,
      });
    }
  } catch (error) {
    if (isDuplicateKey(error) || isMissingSchemaError(error)) {
      if (isMissingSchemaError(error)) {
        console.warn("[Order Cost] Snapshot tables are not installed yet. Line costs remain on the order JSON until the owner runs the order reconciliation SQL.");
      }
      return;
    }
    console.error("[Order Cost] Failed to store the order-time cost snapshot:", error instanceof Error ? error.message : "unknown error");
  }
}

export async function readOrderCostSnapshots(db: Database, orderIds: number[]): Promise<{
  lines: Array<typeof orderRequestLineCosts.$inferSelect>;
  commerce: Array<typeof orderRequestCommerceSnapshots.$inferSelect>;
}> {
  if (orderIds.length === 0) return { lines: [], commerce: [] };
  try {
    const [lines, commerce] = await Promise.all([
      db.select().from(orderRequestLineCosts).where(inArray(orderRequestLineCosts.orderRequestId, orderIds)),
      db.select().from(orderRequestCommerceSnapshots).where(inArray(orderRequestCommerceSnapshots.orderRequestId, orderIds)),
    ]);
    return { lines, commerce };
  } catch (error) {
    if (isMissingSchemaError(error)) return { lines: [], commerce: [] };
    throw error;
  }
}

