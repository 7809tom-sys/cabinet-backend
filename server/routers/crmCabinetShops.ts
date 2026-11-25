// Admin-only: upload a cabinet shop list into the house CRM (Cabinet Shops view).
// Preview first (dryRun), then confirm. Adds rows only; never updates or deletes.

import { TRPCError } from "@trpc/server";
import { and, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import { crmDeals } from "../../drizzle/schema";
import { CABINET_SHOP_FIELDS, CABINET_SHOP_UPLOAD_MAX_ROWS } from "@shared/crmCabinetShopImport";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { CABINET_SHOP_EXISTING_LIKE, importCabinetShops, type CabinetShopImportStore } from "../lib/crm/cabinetShopImport";

const shopRow = z.object(
  Object.fromEntries(CABINET_SHOP_FIELDS.map((field) => [field, z.string().max(1000).optional()])) as Record<(typeof CABINET_SHOP_FIELDS)[number], z.ZodOptional<z.ZodString>>,
);

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function dbStore(db: Db): CabinetShopImportStore {
  return {
    async loadExisting() {
      return db
        .select({ contactName: crmDeals.contactName, notes: crmDeals.notes })
        .from(crmDeals)
        .where(and(
          isNull(crmDeals.affiliateId),
          or(like(crmDeals.company, CABINET_SHOP_EXISTING_LIKE.company), like(crmDeals.notes, CABINET_SHOP_EXISTING_LIKE.notes)),
        ));
    },
    async insert(rows) {
      if (!rows.length) return;
      await db.insert(crmDeals).values(rows.map((row) => ({
        affiliateId: null,
        ownerUserId: null,
        title: row.title,
        stage: "new" as const,
        priority: "medium" as const,
        contactName: row.contactName,
        contactPhone: row.contactPhone,
        contactEmail: row.contactEmail,
        company: row.company,
        location: row.location,
        source: "manual" as const,
        notes: row.notes,
      })));
    },
  };
}

export const crmCabinetShopsRouter = router({
  importShops: adminProcedure
    .input(z.object({
      rows: z.array(shopRow).min(1).max(CABINET_SHOP_UPLOAD_MAX_ROWS),
      sourceDoc: z.string().trim().min(1).max(200),
      defaultState: z.string().trim().max(32).nullish(),
      dryRun: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available." });
      return importCabinetShops(dbStore(db), input);
    }),
});
