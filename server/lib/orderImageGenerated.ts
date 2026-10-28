import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { isMissingSchemaError, schemaErrorMessage } from "./orderSchemaGuard";

export function bumpImageGenerated(count: number | null | undefined, at: Date): { imageGeneratedCount: number; lastImageGeneratedAt: Date } {
  const current = Number.isFinite(count) ? Number(count) : 0;
  return { imageGeneratedCount: Math.max(0, current) + 1, lastImageGeneratedAt: at };
}

export function orderIdsForDesign(
  designId: number,
  links: Array<{ designId: number; orderRequestId: number | null }>,
  orders: Array<{ id: number; kitchenDesignId: number | null }>,
): number[] {
  const ids = new Set<number>();
  for (const link of links) {
    if (link.designId === designId && link.orderRequestId != null && link.orderRequestId > 0) ids.add(link.orderRequestId);
  }
  for (const order of orders) {
    if (order.kitchenDesignId === designId && order.id > 0) ids.add(order.id);
  }
  return Array.from(ids);
}

type Execute = (query: ReturnType<typeof sql>) => Promise<unknown>;

function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) return first as Array<Record<string, unknown>>;
    if (first && typeof first === "object") return result as Array<Record<string, unknown>>;
  }
  return [];
}

export async function markOrderImageGeneratedWith(execute: Execute, orderId: number, at = new Date()): Promise<{ updated: boolean; schemaMissing: boolean }> {
  if (!Number.isInteger(orderId) || orderId <= 0) return { updated: false, schemaMissing: false };
  try {
    await execute(sql`UPDATE order_requests SET imageGeneratedCount = COALESCE(imageGeneratedCount, 0) + 1, lastImageGeneratedAt = ${at} WHERE id = ${orderId}`);
    return { updated: true, schemaMissing: false };
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn(`[OrderImage] order_requests image columns are missing, so order ${orderId} was not counted. Run the distributor order email SQL.`);
      return { updated: false, schemaMissing: true };
    }
    console.error(`[OrderImage] Could not count an image for order ${orderId}: ${schemaErrorMessage(error)}`);
    return { updated: false, schemaMissing: false };
  }
}

/** Called by the image-generation flow when it knows the order. */
export async function markOrderImageGenerated(orderId: number, at = new Date()): Promise<{ updated: boolean; schemaMissing: boolean }> {
  const db = await getDb();
  if (!db) return { updated: false, schemaMissing: false };
  return markOrderImageGeneratedWith((query) => db.execute(query), orderId, at);
}

/**
 * Counts the image on every order whose CRM deal links this design, and on
 * any order saved directly against the same kitchen design.
 */
export async function markDesignImageGenerated(designId: number, at = new Date()): Promise<{ orderIds: number[] }> {
  const db = await getDb();
  if (!db || !Number.isInteger(designId) || designId <= 0) return { orderIds: [] };
  const links: Array<{ designId: number; orderRequestId: number | null }> = [];
  const direct: Array<{ id: number; kitchenDesignId: number | null }> = [];
  try {
    const linked = await db.execute(sql`
      SELECT link.designId AS designId, deal.orderRequestId AS orderRequestId
      FROM crm_deal_designs AS link
      INNER JOIN crm_deals AS deal ON deal.id = link.dealId
      WHERE link.designId = ${designId}
    `);
    for (const row of rowsFrom(linked)) {
      links.push({ designId: Number(row.designId), orderRequestId: row.orderRequestId == null ? null : Number(row.orderRequestId) });
    }
  } catch (error) {
    if (!isMissingSchemaError(error)) console.error(`[OrderImage] Could not read design links for design ${designId}: ${schemaErrorMessage(error)}`);
  }
  try {
    const orders = await db.execute(sql`SELECT id, kitchenDesignId FROM order_requests WHERE kitchenDesignId = ${designId}`);
    for (const row of rowsFrom(orders)) {
      direct.push({ id: Number(row.id), kitchenDesignId: row.kitchenDesignId == null ? null : Number(row.kitchenDesignId) });
    }
  } catch (error) {
    if (!isMissingSchemaError(error)) console.error(`[OrderImage] Could not read orders for design ${designId}: ${schemaErrorMessage(error)}`);
  }
  const orderIds = orderIdsForDesign(designId, links, direct);
  for (const orderId of orderIds) await markOrderImageGenerated(orderId, at);
  return { orderIds };
}
