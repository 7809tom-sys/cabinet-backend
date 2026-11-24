// Admin customer list import (house CRM) and outreach enrolment.

import { randomBytes } from "crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  crmContactImportRows,
  crmContactImports,
  crmDeals,
  outreachEnrollments,
  outreachEvents,
  outreachSuppressions,
} from "../../../drizzle/schema";
import {
  CONTACT_IMPORT_BATCH_SIZE,
  cleanSourceTag,
  contactLocation,
  importedContactNote,
  isValidContactEmail,
  normalizeContactEmail,
  type ContactImportRow,
} from "@shared/crmContactImport";
import type { OutreachSettings } from "@shared/crmOutreach";
import type { OutreachDb } from "./store";

export type ImportBatchResult = {
  imported: number;
  duplicates: Array<{ rowNumber: number; email: string; reason: "already_in_crm" | "duplicate_in_batch" }>;
  skipped: Array<{ rowNumber: number; email: string; reason: "invalid_email" }>;
};

type BatchRow = ContactImportRow & { rowNumber: number };

function insertIdOf(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { insertId?: number }).insertId);
}

export async function startContactImport(db: OutreachDb, input: { sourceTag: string; fileName: string; totalRows: number; userId: number }) {
  const result = await db.insert(crmContactImports).values({
    sourceTag: cleanSourceTag(input.sourceTag),
    fileName: input.fileName.slice(0, 256),
    totalRows: input.totalRows,
    importedByUserId: input.userId,
  });
  return insertIdOf(result);
}

/**
 * Imports one batch (≤ CONTACT_IMPORT_BATCH_SIZE rows). Re-validates every
 * email server-side and dedupes against every existing CRM contact by email
 * (house and affiliate), so the same person is never imported or emailed twice.
 * Each new contact is a house crm_deals row in stage "new" plus a tag row.
 */
export async function importContactBatch(
  db: OutreachDb,
  input: { importId: number; rows: BatchRow[]; userId: number; now?: Date },
): Promise<ImportBatchResult> {
  const [batchImport] = await db.select().from(crmContactImports).where(eq(crmContactImports.id, input.importId)).limit(1);
  if (!batchImport) throw new Error("Import not found. Start the import again.");
  const sourceTag = batchImport.sourceTag;
  const importedOn = (input.now ?? new Date()).toISOString().slice(0, 10);
  const result: ImportBatchResult = { imported: 0, duplicates: [], skipped: [] };

  const candidates: BatchRow[] = [];
  const seen = new Set<string>();
  for (const raw of input.rows.slice(0, CONTACT_IMPORT_BATCH_SIZE)) {
    const email = normalizeContactEmail(raw.email);
    if (!isValidContactEmail(email)) { result.skipped.push({ rowNumber: raw.rowNumber, email, reason: "invalid_email" }); continue; }
    if (seen.has(email)) { result.duplicates.push({ rowNumber: raw.rowNumber, email, reason: "duplicate_in_batch" }); continue; }
    seen.add(email);
    candidates.push({ ...raw, email });
  }
  if (candidates.length) {
    const emails = candidates.map((row) => row.email);
    const existing = await db.select({ email: sql<string>`LOWER(TRIM(${crmDeals.contactEmail}))` }).from(crmDeals)
      .where(inArray(sql`LOWER(TRIM(${crmDeals.contactEmail}))`, emails));
    const existingSet = new Set(existing.map((row) => String(row.email)));
    const fresh = candidates.filter((row) => {
      if (!existingSet.has(row.email)) return true;
      result.duplicates.push({ rowNumber: row.rowNumber, email: row.email, reason: "already_in_crm" });
      return false;
    });
    if (fresh.length) {
      await db.transaction(async (tx) => {
        await tx.insert(crmDeals).values(fresh.map((row) => ({
          affiliateId: null,
          ownerUserId: input.userId,
          title: row.name.slice(0, 256),
          stage: "new" as const,
          priority: "low" as const,
          contactName: row.name,
          contactEmail: row.email,
          contactPhone: row.phone,
          location: contactLocation(row),
          source: "manual" as const,
          notes: importedContactNote(row, sourceTag, importedOn),
        })));
        const created = await tx.select({ id: crmDeals.id, email: crmDeals.contactEmail }).from(crmDeals)
          .where(and(isNull(crmDeals.affiliateId), inArray(crmDeals.contactEmail, fresh.map((row) => row.email))));
        const idByEmail = new Map(created.map((row) => [String(row.email), row.id]));
        const tagRows = fresh.flatMap((row) => {
          const dealId = idByEmail.get(row.email);
          return dealId == null ? [] : [{
            importId: input.importId,
            dealId,
            email: row.email,
            sourceTag,
            address: row.address,
            city: row.city,
            state: row.state,
            zip: row.zip,
            lastPurchaseDate: row.lastPurchaseDate,
          }];
        });
        if (tagRows.length) await tx.insert(crmContactImportRows).values(tagRows);
      });
      result.imported = fresh.length;
    }
  }
  await db.update(crmContactImports).set({
    importedCount: sql`${crmContactImports.importedCount} + ${result.imported}`,
    duplicateCount: sql`${crmContactImports.duplicateCount} + ${result.duplicates.length}`,
    skippedCount: sql`${crmContactImports.skippedCount} + ${result.skipped.length}`,
  }).where(eq(crmContactImports.id, input.importId));
  return result;
}

export async function finishContactImport(db: OutreachDb, importId: number, extraSkipped: number) {
  await db.update(crmContactImports).set({
    status: "finished",
    finishedAt: new Date(),
    skippedCount: sql`${crmContactImports.skippedCount} + ${Math.max(0, extraSkipped)}`,
  }).where(eq(crmContactImports.id, importId));
  const [row] = await db.select().from(crmContactImports).where(eq(crmContactImports.id, importId)).limit(1);
  return row ?? null;
}

export function newUnsubscribeToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Enrols house CRM contacts into the outreach sequence. Skips anyone without
 * a valid email, anyone suppressed, anyone already enrolled, affiliate
 * contacts, and won/lost deals. Enrolling sends nothing by itself.
 */
export async function enrollContacts(
  db: OutreachDb,
  input: { dealIds?: number[]; sourceTag?: string; userId: number; settings: OutreachSettings; now?: Date; limit?: number },
): Promise<{ enrolled: number; skipped: number }> {
  const now = input.now ?? new Date();
  const conditions = [isNull(crmDeals.affiliateId)];
  if (input.dealIds?.length) conditions.push(inArray(crmDeals.id, input.dealIds));
  let dealRows: Array<{ id: number; email: string | null; stage: string }>;
  if (input.sourceTag) {
    dealRows = await db.select({ id: crmDeals.id, email: crmDeals.contactEmail, stage: crmDeals.stage }).from(crmDeals)
      .innerJoin(crmContactImportRows, eq(crmContactImportRows.dealId, crmDeals.id))
      .where(and(...conditions, eq(crmContactImportRows.sourceTag, cleanSourceTag(input.sourceTag))))
      .limit(input.limit ?? 100_000);
  } else if (input.dealIds?.length) {
    dealRows = await db.select({ id: crmDeals.id, email: crmDeals.contactEmail, stage: crmDeals.stage }).from(crmDeals).where(and(...conditions));
  } else {
    return { enrolled: 0, skipped: 0 };
  }
  let enrolled = 0;
  let skipped = 0;
  const firstDelay = input.settings.sequence[0]?.delayDays ?? 0;
  const nextSendAt = new Date(now.getTime() + firstDelay * 24 * 60 * 60 * 1000);
  for (let i = 0; i < dealRows.length; i += CONTACT_IMPORT_BATCH_SIZE) {
    const chunk = dealRows.slice(i, i + CONTACT_IMPORT_BATCH_SIZE);
    const usable = chunk.flatMap((row) => {
      const email = normalizeContactEmail(row.email);
      if (!isValidContactEmail(email) || row.stage === "won" || row.stage === "lost") { skipped += 1; return []; }
      return [{ id: row.id, email }];
    });
    if (!usable.length) continue;
    const [suppressed, already] = await Promise.all([
      db.select({ email: outreachSuppressions.email }).from(outreachSuppressions).where(inArray(outreachSuppressions.email, usable.map((row) => row.email))),
      db.select({ dealId: outreachEnrollments.dealId, email: outreachEnrollments.email }).from(outreachEnrollments)
        .where(inArray(outreachEnrollments.email, usable.map((row) => row.email))),
    ]);
    const blockedEmails = new Set([...suppressed.map((row) => row.email), ...already.map((row) => row.email)]);
    const values = usable.filter((row) => {
      if (blockedEmails.has(row.email)) { skipped += 1; return false; }
      blockedEmails.add(row.email); // one enrolment per address
      return true;
    }).map((row) => ({
      dealId: row.id,
      email: row.email,
      status: "active" as const,
      currentStep: 0,
      nextSendAt,
      unsubscribeToken: newUnsubscribeToken(),
      enrolledByUserId: input.userId,
    }));
    if (values.length) {
      await db.insert(outreachEnrollments).values(values);
      enrolled += values.length;
    }
  }
  await db.insert(outreachEvents).values({ eventType: "enrolled", actorUserId: input.userId, detail: { enrolled, skipped, sourceTag: input.sourceTag ?? null, dealCount: input.dealIds?.length ?? null } });
  return { enrolled, skipped };
}
