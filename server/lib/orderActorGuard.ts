import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { ENV } from "../_core/env";
import { getStripe } from "../stripe";

export type OrderActor = { id: number; role: string; email?: string | null } | null;

export type OrderActorRow = {
  id: number;
  userId: number | null;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  paidAt?: Date | null;
  originatorEmail?: string | null;
};

type Database = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function rowsFromExecute(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) return first as Array<Record<string, unknown>>;
    if (first && typeof first === "object") return result as Array<Record<string, unknown>>;
  }
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  }
  return [];
}

/**
 * PR #10 may add order_requests.accessToken. When that column is absent this
 * returns undefined and callers must not treat a missing column as a match.
 */
export async function readOrderAccessToken(db: Database, orderId: number): Promise<string | null | undefined> {
  try {
    const result = await db.execute(sql`SELECT accessToken FROM order_requests WHERE id = ${orderId} LIMIT 1`);
    const row = rowsFromExecute(result)[0];
    if (!row || !("accessToken" in row)) return null;
    const value = row.accessToken;
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unknown column|ER_BAD_FIELD_ERROR|no such column|does not exist/i.test(message)) return undefined;
    throw error;
  }
}

export async function stripeSessionConfirmsOrder(order: OrderActorRow, stripeSessionId: string | undefined): Promise<boolean> {
  if (!stripeSessionId || !order.stripeSessionId || stripeSessionId !== order.stripeSessionId) return false;
  if (order.paidAt || order.stripePaymentIntentId) return true;
  if (!ENV.stripeSecretKey) return false;
  try {
    const session = await getStripe().checkout.sessions.retrieve(stripeSessionId);
    const metaOrderId = session.metadata?.order_id;
    return session.payment_status === "paid" && metaOrderId === String(order.id);
  } catch {
    return false;
  }
}

function ownerMatches(user: OrderActor, order: OrderActorRow): boolean {
  return Boolean(user && order.userId != null && user.id === order.userId);
}

/**
 * Confirming an order marks commission as earned, so the public cannot do it.
 * Allowed: admin, a paid Stripe session/webhook proof, or the owner presenting
 * the access token when that column exists.
 */
export async function canConfirmOrder(
  user: OrderActor,
  order: OrderActorRow,
  input: { stripeSessionId?: string; accessToken?: string },
  storedAccessToken: string | null | undefined,
): Promise<boolean> {
  if (user?.role === "admin") return true;
  if (await stripeSessionConfirmsOrder(order, input.stripeSessionId)) return true;
  if (storedAccessToken && input.accessToken && ownerMatches(user, order) && secretsEqual(input.accessToken, storedAccessToken)) {
    return true;
  }
  return false;
}

/**
 * Charging and reading an installation share token require the order owner
 * (plus the access token when one is stored) or an admin. Email alone is not
 * proof. A missing access-token column does not block the signed-in owner.
 */
export function canActAsOrderOwner(
  user: OrderActor,
  order: OrderActorRow,
  accessToken: string | undefined,
  storedAccessToken: string | null | undefined,
): boolean {
  if (user?.role === "admin") return true;
  if (!ownerMatches(user, order)) return false;
  if (storedAccessToken === undefined || storedAccessToken === null) return true;
  if (!accessToken) return false;
  return secretsEqual(accessToken, storedAccessToken);
}

export function orderActorError(code: "FORBIDDEN" | "NOT_FOUND", message: string): TRPCError {
  return new TRPCError({ code, message });
}
