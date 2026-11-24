import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  listWarehousesForAdmin,
  setWarehouseOpen,
  WarehouseMigrationError,
} from "../lib/warehouseRecords";
import { WAREHOUSES_MIGRATION_FILE } from "@shared/warehouseOpen";

function migrationError(): TRPCError {
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `Warehouse open/closed is not installed yet. Run docs/sql/${WAREHOUSES_MIGRATION_FILE} in the TiDB SQL editor, one block at a time.`,
  });
}

/**
 * Admin open/closed switch for a distributor warehouse. Closing a row never
 * deletes it and never writes the ZIP onto a door style or distributor origin
 * list. Origin selection reads the same rows and skips closed ZIPs.
 */
export const warehousesRouter = router({
  list: adminProcedure
    .input(z.object({ distributorId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { available: false, migration: WAREHOUSES_MIGRATION_FILE, warehouses: [] };
      try {
        return await listWarehousesForAdmin(db, input?.distributorId);
      } catch (error) {
        if (error instanceof WarehouseMigrationError) {
          return { available: false, migration: WAREHOUSES_MIGRATION_FILE, warehouses: [] };
        }
        throw error;
      }
    }),

  setOpen: adminProcedure
    .input(z.object({
      distributorId: z.number().int().positive(),
      zip: z.string().trim().regex(/^\d{5}$/, "Warehouse ZIP must be exactly 5 digits"),
      isOpen: z.boolean(),
      name: z.string().trim().max(128).optional(),
      address: z.string().trim().max(512).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });
      try {
        const saved = await setWarehouseOpen(db, input);
        return { ...saved, migration: WAREHOUSES_MIGRATION_FILE };
      } catch (error) {
        if (error instanceof WarehouseMigrationError) throw migrationError();
        if (error instanceof Error && error.message === "Supply line not found.") {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof Error && /5 digits/.test(error.message)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),
});
