/**
 * Idempotent backfill that encrypts plaintext W-9 tax IDs and stores last4.
 *
 * This script is NOT run by deployment or by tests. Apply migration 0219 first,
 * then run:
 *
 *   pnpm exec tsx server/scripts/backfill-w9-tax-id-encryption.ts
 *
 * Required environment variable names (do not print their values):
 *   DATABASE_URL
 *   W9_TAX_ID_ENCRYPTION_KEY
 *
 * Rows that are already encrypted are left unchanged. If last4 is missing on an
 * encrypted row, it is filled from the decrypted value. Plaintext rows are
 * replaced with the AES-GCM envelope and a separate last-four column.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { affiliates } from "../../drizzle/schema";
import { getDb } from "../db";
import { decryptW9TaxId, encryptW9TaxId, isEncryptedW9TaxId, W9_TAX_ID_ENCRYPTION_KEY_ENV } from "../lib/w9TaxIdCrypto";

async function main() {
  if ((process.env[W9_TAX_ID_ENCRYPTION_KEY_ENV] ?? "").trim().length < 16) {
    throw new Error(`${W9_TAX_ID_ENCRYPTION_KEY_ENV} is not configured`);
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({ id: affiliates.id, w9TaxId: affiliates.w9TaxId, w9TaxIdLast4: affiliates.w9TaxIdLast4 })
    .from(affiliates)
    .where(isNotNull(affiliates.w9TaxId));

  let encrypted = 0;
  let last4Filled = 0;
  let skipped = 0;
  for (const row of rows) {
    const stored = row.w9TaxId;
    if (!stored) continue;
    if (isEncryptedW9TaxId(stored)) {
      if (row.w9TaxIdLast4 && /^\d{4}$/.test(row.w9TaxIdLast4)) {
        skipped += 1;
        continue;
      }
      const digits = decryptW9TaxId(stored).replace(/\D/g, "");
      if (digits.length < 4) {
        skipped += 1;
        console.log(`skip affiliate ${row.id}: encrypted tax id has no recoverable last4`);
        continue;
      }
      await db.update(affiliates).set({ w9TaxIdLast4: digits.slice(-4) }).where(eq(affiliates.id, row.id));
      last4Filled += 1;
      continue;
    }
    const digits = stored.replace(/\D/g, "");
    if (digits.length < 4) {
      skipped += 1;
      console.log(`skip affiliate ${row.id}: legacy tax id is not a digit string`);
      continue;
    }
    const envelope = encryptW9TaxId(digits);
    const updated = await db.update(affiliates).set({
      w9TaxId: envelope,
      w9TaxIdLast4: digits.slice(-4),
    }).where(and(eq(affiliates.id, row.id), eq(affiliates.w9TaxId, stored)));
    void updated;
    encrypted += 1;
  }
  console.log(`W-9 tax ID backfill complete: encrypted=${encrypted} last4Filled=${last4Filled} skipped=${skipped}`);
}

const invokedDirectly = process.argv[1]?.includes("backfill-w9-tax-id-encryption");
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "W-9 tax ID backfill failed");
    process.exitCode = 1;
  });
}
