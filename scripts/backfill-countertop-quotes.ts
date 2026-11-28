/**
 * Backfills Countertop Quotes for orders that already contain a countertop.
 *
 * Dry run (default): prints what would be created, writes nothing.
 *   pnpm exec tsx --env-file=.env scripts/backfill-countertop-quotes.ts
 *
 * Live: creates the missing quotes with both plans attached. Idempotent on the
 * order request id, so running it again after a partial run is safe.
 *   pnpm exec tsx --env-file=.env scripts/backfill-countertop-quotes.ts --apply
 */
import dotenv from "dotenv";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { countertopQuotes, orderRequests } from "../drizzle/schema";
import { countertopOrderLines, ensureCountertopQuoteForOrder } from "../server/lib/countertopQuoteIntake";

dotenv.config();

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(orderRequests)
    .where(eq(orderRequests.status, "submitted"))
    .orderBy(desc(orderRequests.id));
  const existing = new Set(
    (await db.select({ orderRequestId: countertopQuotes.orderRequestId }).from(countertopQuotes))
      .map((row) => row.orderRequestId)
      .filter((id): id is number => id != null),
  );

  let scanned = 0;
  let matched = 0;
  let created = 0;
  let refreshed = 0;
  let missingEmail = 0;
  let failed = 0;

  for (const row of rows) {
    scanned += 1;
    const lines = Array.isArray(row.lineItems) ? row.lineItems : [];
    if (countertopOrderLines(lines).length === 0) continue;
    matched += 1;

    // No email is fine: the quote is created anyway and the fabricator's email
    // is recorded when a deal with the shop is negotiated.
    const contactEmail = row.originatorEmail ?? null;
    if (!contactEmail) missingEmail += 1;
    if (existing.has(row.id)) {
      refreshed += 1;
      console.log(`ok   ${row.requestNumber}: already in Countertop Quotes`);
      continue;
    }
    if (!apply) {
      created += 1;
      console.log(`new  ${row.requestNumber}: would create with countertop plan + designer plan`);
      continue;
    }
    try {
      const result = await ensureCountertopQuoteForOrder(db, {
        orderRequestId: row.id,
        requestNumber: row.requestNumber,
        userId: row.userId,
        affiliateId: row.affiliateId,
        contactName: row.originatorName,
        contactEmail,
        contactPhone: row.originatorPhone,
        zip: row.zip,
        lines,
        notes: row.notes,
        kitchenDesignId: row.kitchenDesignId,
      });
      if (result?.created) created += 1;
      else if (result) refreshed += 1;
      console.log(`${result?.created ? "created" : "refreshed"} ${row.requestNumber} -> quote ${result?.quoteId ?? "-"}`);
    } catch (error) {
      failed += 1;
      console.error(`failed ${row.requestNumber}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(JSON.stringify({ apply, scanned, matched, created, refreshed, missingEmail, failed }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

