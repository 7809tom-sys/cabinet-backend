/**
 * Concrete MySQL 8 + Drizzle ORM example for an outbox worker.
 *
 * This is an example only. It is not wired into the application runtime.
 * Requirements:
 *   - MySQL 8+ for FOR UPDATE SKIP LOCKED
 *   - webhook_outbox has the columns used below
 *   - db is a Drizzle mysql2 database instance
 */

import { and, eq, lte, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";

const { webhookOutbox } = schema;

type Db = MySql2Database<typeof schema>;

type OutboxRow = typeof webhookOutbox.$inferSelect;

const WORKER_LEASE_MINUTES = 10;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_ATTEMPTS = 12;

/**
 * Exponential backoff with bounded random jitter.
 * attempt=1 waits about 30s, then 60s, 120s, ... up to six hours.
 */
export function retryDelayMs(attempt: number): number {
  const baseMs = 30_000;
  const capMs = 6 * 60 * 60 * 1_000;
  const exponent = Math.max(0, attempt - 1);
  const exponentialMs = Math.min(capMs, baseMs * 2 ** exponent);
  const jitterCapMs = Math.min(30_000, Math.floor(exponentialMs * 0.2));
  const jitterMs = jitterCapMs > 0 ? Math.floor(Math.random() * jitterCapMs) : 0;
  return exponentialMs + jitterMs;
}

function retryDate(attempt: number, now = new Date()): Date {
  return new Date(now.getTime() + retryDelayMs(attempt));
}

function workerId(): string {
  return `${process.env.HOSTNAME ?? "local"}:${process.pid}`;
}

/**
 * Recover rows whose worker lease expired.
 *
 * This is safe because the normal dispatch path must update rows using both
 * the row id and the current worker-owned status. A recovered row is later
 * protected from duplicate business effects by the consumer receipt key.
 */
export async function recoverExpiredLeases(
  db: Db,
  owner = workerId(),
): Promise<number> {
  const result = await db
    .update(webhookOutbox)
    .set({
      status: "retry_wait",
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: "worker_lease_expired",
      lastErrorMessage: `Lease expired for ${owner}`,
    })
    .where(
      and(
        eq(webhookOutbox.status, "processing"),
        lte(
          webhookOutbox.lockedAt,
          sql`CURRENT_TIMESTAMP - INTERVAL ${WORKER_LEASE_MINUTES} MINUTE`,
        ),
      ),
    );

  return Number(result[0]?.affectedRows ?? 0);
}

/**
 * Atomically claims a batch.
 *
 * The SELECT and UPDATE occur inside one transaction. FOR UPDATE locks the
 * selected eligible rows; SKIP LOCKED lets another worker skip rows already
 * claimed by this worker or a peer. The transaction commits only after status
 * and lease fields are written.
 */
export async function claimBatch(
  db: Db,
  options: {
    owner?: string;
    limit?: number;
    now?: Date;
  } = {},
): Promise<OutboxRow[]> {
  const owner = options.owner ?? workerId();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_BATCH_SIZE, 500));
  const now = options.now ?? new Date();

  return db.transaction(async (tx) => {
    // Drizzle's normal select builder does not expose every MySQL locking
    // modifier consistently across versions, so use a parameterized SQL query
    // for the claim SELECT. The values are still bound parameters.
    const selected = await tx.execute(sql`
      SELECT
        id,
        event_id AS eventId,
        event_type AS eventType,
        aggregate_type AS aggregateType,
        aggregate_id AS aggregateId,
        payload_json AS payloadJson,
        schema_version AS schemaVersion,
        status,
        attempts,
        max_attempts AS maxAttempts,
        next_attempt_at AS nextAttemptAt,
        locked_at AS lockedAt,
        locked_by AS lockedBy,
        first_attempted_at AS firstAttemptedAt,
        last_attempted_at AS lastAttemptedAt,
        sent_at AS sentAt,
        last_http_status AS lastHttpStatus,
        last_error_code AS lastErrorCode,
        last_error_message AS lastErrorMessage,
        dead_letter_reason AS deadLetterReason,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM webhook_outbox
      WHERE status IN ('pending', 'retry_wait')
        AND next_attempt_at <= ${now}
      ORDER BY created_at ASC, id ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);

    const rows = (Array.isArray(selected) ? selected : selected[0]) as OutboxRow[];
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const attemptsById = new Map(
      rows.map((row) => [row.id, Number(row.attempts ?? 0) + 1]),
    );

    // The WHERE status clause makes the ownership transition explicit. The
    // selected rows are already locked, but the predicate is still valuable
    // protection if this function is adapted to another SQL driver.
    await tx
      .update(webhookOutbox)
      .set({
        status: "processing",
        lockedAt: now,
        lockedBy: owner,
        firstAttemptedAt: sql`COALESCE(${webhookOutbox.firstAttemptedAt}, ${now})`,
        lastAttemptedAt: now,
        attempts: sql`${webhookOutbox.attempts} + 1`,
      })
      .where(
        and(
          inArray(webhookOutbox.id, ids),
          sql`${webhookOutbox.status} IN ('pending', 'retry_wait')`,
        ),
      );

    // Return the claimed snapshot with the incremented attempt count.
    return rows.map((row) => ({
      ...row,
      status: "processing",
      lockedAt: now,
      lockedBy: owner,
      firstAttemptedAt: row.firstAttemptedAt ?? now,
      lastAttemptedAt: now,
      attempts: attemptsById.get(row.id) ?? Number(row.attempts ?? 0) + 1,
    }));
  });
}

export type DispatchFailure = {
  code: string;
  message: string;
  retryable: boolean;
  httpStatus?: number;
};

/**
 * Marks a claimed row as retry_wait or dead_letter after a failed dispatch.
 * The worker ownership predicate prevents a late worker from overwriting a
 * lease that has already been recovered and claimed by another worker.
 */
export async function recordDispatchFailure(
  db: Db,
  row: Pick<OutboxRow, "id" | "attempts" | "maxAttempts">,
  failure: DispatchFailure,
  owner = workerId(),
  now = new Date(),
): Promise<"retry_wait" | "dead_letter"> {
  const attempts = Number(row.attempts ?? 0);
  const maxAttempts = Number(row.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const deadLetter = !failure.retryable || attempts >= maxAttempts;

  if (deadLetter) {
    const result = await db
      .update(webhookOutbox)
      .set({
        status: "dead_letter",
        lockedAt: null,
        lockedBy: null,
        lastHttpStatus: failure.httpStatus ?? null,
        lastErrorCode: failure.code,
        lastErrorMessage: failure.message,
        deadLetterReason: `${failure.code}: ${failure.message}`,
      })
      .where(
        and(
          eq(webhookOutbox.id, row.id),
          eq(webhookOutbox.status, "processing"),
          eq(webhookOutbox.lockedBy, owner),
        ),
      );

    if (Number(result[0]?.affectedRows ?? 0) !== 1) {
      throw new Error(`Outbox row ${row.id} was no longer owned by ${owner}`);
    }
    return "dead_letter";
  }

  const nextAttemptAt = retryDate(attempts, now);
  const result = await db
    .update(webhookOutbox)
    .set({
      status: "retry_wait",
      nextAttemptAt,
      lockedAt: null,
      lockedBy: null,
      lastHttpStatus: failure.httpStatus ?? null,
      lastErrorCode: failure.code,
      lastErrorMessage: failure.message,
    })
    .where(
      and(
        eq(webhookOutbox.id, row.id),
        eq(webhookOutbox.status, "processing"),
        eq(webhookOutbox.lockedBy, owner),
      ),
    );

  if (Number(result[0]?.affectedRows ?? 0) !== 1) {
    throw new Error(`Outbox row ${row.id} was no longer owned by ${owner}`);
  }
  return "retry_wait";
}

/**
 * Marks a successfully dispatched row as sent. This should only be called
 * after each required consumer has committed its own idempotent receipt.
 */
export async function recordDispatchSuccess(
  db: Db,
  rowId: number,
  owner = workerId(),
  now = new Date(),
): Promise<void> {
  const result = await db
    .update(webhookOutbox)
    .set({
      status: "sent",
      sentAt: now,
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    .where(
      and(
        eq(webhookOutbox.id, rowId),
        eq(webhookOutbox.status, "processing"),
        eq(webhookOutbox.lockedBy, owner),
      ),
    );

  if (Number(result[0]?.affectedRows ?? 0) !== 1) {
    throw new Error(`Cannot complete outbox row ${rowId}; worker lease is not owned`);
  }
}

/**
 * Minimal worker loop. Network dispatch is intentionally represented by
 * dispatchToRequiredConsumers(), which must use consumer receipt idempotency.
 */
export async function runOutboxWorker(
  db: Db,
  dispatchToRequiredConsumers: (row: OutboxRow) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const owner = workerId();

  while (!signal?.aborted) {
    await recoverExpiredLeases(db, owner);
    const batch = await claimBatch(db, { owner });

    if (batch.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }

    for (const row of batch) {
      if (signal?.aborted) break;
      try {
        await dispatchToRequiredConsumers(row);
        await recordDispatchSuccess(db, row.id, owner);
      } catch (error) {
        const failure = classifyFailure(error);
        await recordDispatchFailure(db, row, failure, owner);
      }
    }
  }
}

function classifyFailure(error: unknown): DispatchFailure {
  if (error instanceof Error && error.name === "AbortError") {
    return { code: "dispatch_timeout", message: error.message, retryable: true };
  }

  const candidate = error as { httpStatus?: number; code?: string; message?: string };
  const httpStatus = candidate?.httpStatus;
  const retryable = httpStatus == null || [408, 425, 429, 500, 502, 503, 504].includes(httpStatus);

  return {
    code: candidate?.code ?? "dispatch_failed",
    message: candidate?.message ?? "Unknown outbox dispatch failure",
    retryable,
    httpStatus,
  };
}

/**
 * Important operational note:
 *
 * The schema names above are the proposed split-order/outbox names. Before
 * production use, align them with the generated Drizzle schema and migration,
 * then add tests for:
 *   1. two workers claiming disjoint rows;
 *   2. a recovered expired lease;
 *   3. retry backoff and max-attempt dead-lettering;
 *   4. a late worker failing the lockedBy predicate;
 *   5. idempotent consumer replay.
 */
