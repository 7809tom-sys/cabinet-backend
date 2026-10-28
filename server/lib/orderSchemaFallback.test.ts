import { beforeEach, describe, expect, it, vi } from "vitest";
import { crmDeals, orderRequests } from "../../drizzle/schema";
import { markOrderImageGeneratedWith } from "./orderImageGenerated";
import {
  isEnumValueError,
  isMissingSchemaError,
  ORDER_SCHEMA_MESSAGES,
  orderSchemaProcedureError,
} from "./orderSchemaGuard";
import {
  ORDER_SCHEMA_MISSING_TTL_MS,
  columnPresent,
  newSaleStagePresent,
  orderSchemaSupportFromColumnRows,
  readOrderSchemaSupport,
  resetOrderSchemaSupportCache,
} from "./orderSchemaSupport";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("../db", () => ({ getDb: getDbMock }));

import { attachOrderFulfillmentOverlay, markOrderVerified, onOrderPaid, syncStoredOrderCrm } from "./orderSideEffects";

function queryText(query: unknown): string {
  const chunks = (query as { queryChunks?: Array<{ value?: string[] }> }).queryChunks ?? [];
  return chunks.map((chunk) => (Array.isArray(chunk?.value) ? chunk.value.join("") : "")).join("");
}

function driverError(message: string, fields: Record<string, unknown>) {
  const error = new Error(`Failed query: ${message}`);
  (error as { cause?: unknown }).cause = { sqlMessage: message, ...fields };
  return error;
}

const legacyStage = "enum('new','contacted','qualified','image_review','quoted','won','lost')";
const migratedStage = "enum('new','new_sale','contacted','qualified','image_review','quoted','won','lost')";

function columnRow(tableName: string, columnName: string, columnType = "int") {
  return { tableName, columnName, columnType };
}

const paidOrder = {
  id: 9,
  requestNumber: "CD-9",
  status: "confirmed",
  paidAt: new Date("2026-10-27T12:00:00.000Z"),
  stripePaymentIntentId: "pi_123",
  totalAmount: "520.00",
  affiliateId: null,
  userId: 4,
  originatorName: "Ada",
  originatorEmail: "ada@example.com",
  originatorPhone: null,
  shippingAddressLine1: "1 Main",
  shippingAddressLine2: null,
  shippingCity: "Austin",
  shippingState: "TX",
  zip: "78701",
  notes: null,
  referralCode: null,
  styleId: null,
  styleName: null,
  lineItems: [],
  distributorId: null,
  createdAt: new Date("2026-10-27T11:00:00.000Z"),
  deliveryMethod: "ship",
  distributorInvoiceReference: null,
  sentToDistributorAt: null,
  sentToDistributorEmail: null,
};

const qualifiedDeal = {
  id: 3,
  stage: "qualified",
  orderRequestId: 9,
  estimatedValue: "100.00",
  closedAt: null,
  affiliateId: null,
  contactEmail: "ada@example.com",
  contactName: "Ada",
  contactPhone: null,
};

beforeEach(() => {
  resetOrderSchemaSupportCache();
  getDbMock.mockReset();
});

describe("missing schema detection", () => {
  it("reads a missing column or table through Drizzle's cause wrapper", () => {
    expect(isMissingSchemaError(driverError("Unknown column 'distributorEmailStatus' in 'field list'", { code: "ER_BAD_FIELD_ERROR", errno: 1054 }))).toBe(true);
    expect(isMissingSchemaError(driverError("Table 'cabinet_dealz.order_distributor_emails' doesn't exist", { code: "ER_NO_SUCH_TABLE", errno: 1146, sqlState: "42S02" }))).toBe(true);
    expect(isMissingSchemaError(new Error("Failed query: select `order_requests`.`id`"))).toBe(false);
    expect(isMissingSchemaError(new Error("connection reset"))).toBe(false);
  });

  it("recognizes an enum rejection without treating every failure as a bad stage", () => {
    expect(isEnumValueError(driverError("Data truncated for column 'stage' at row 1", { errno: 1265, code: "WARN_DATA_TRUNCATED" }))).toBe(true);
    expect(isEnumValueError(driverError("Incorrect enum value 'new_sale' for column 'stage'", { errno: 1366 }))).toBe(true);
    expect(isEnumValueError(new Error("Failed query: update `crm_deals` set `stage` = ?"))).toBe(false);
  });

  it("turns a missing-migration result into a precondition error and leaves success alone", () => {
    const failure = orderSchemaProcedureError({ ok: false, schemaMissing: true, message: ORDER_SCHEMA_MESSAGES.trail });
    expect(failure?.code).toBe("PRECONDITION_FAILED");
    expect(failure?.message).toContain("distributor order email SQL");
    expect(orderSchemaProcedureError({ ok: true })).toBeNull();
  });

  it("does not count an image when the counter columns are missing on the driver cause", async () => {
    const execute = vi.fn(async () => {
      throw driverError("Unknown column 'imageGeneratedCount' in 'field list'", { code: "ER_BAD_FIELD_ERROR", errno: 1054 });
    });
    await expect(markOrderImageGeneratedWith(execute, 8)).resolves.toEqual({ updated: false, schemaMissing: true });
  });
});

describe("order schema support probe", () => {
  it("treats an empty information_schema result as unknown", () => {
    expect(orderSchemaSupportFromColumnRows([])).toBeNull();
    expect(orderSchemaSupportFromColumnRows([{ TABLE_NAME: "crm_deals", COLUMN_NAME: "stage", COLUMN_TYPE: legacyStage }])).toBeNull();
  });

  it("reports the trail, email table, refund column, and new_sale enum independently", () => {
    const partial = orderSchemaSupportFromColumnRows([
      columnRow("order_requests", "id"),
      columnRow("order_requests", "orderVerifiedAt", "timestamp"),
      columnRow("crm_deals", "stage", legacyStage),
    ]);
    expect(partial).not.toBeNull();
    expect(columnPresent(partial!, "order_requests", "orderVerifiedAt")).toBe(true);
    expect(columnPresent(partial!, "order_requests", "orderShippedAt")).toBe(false);
    expect(columnPresent(partial!, "order_distributor_emails", "orderRequestId")).toBe(false);
    expect(newSaleStagePresent(partial!)).toBe(false);

    const ready = orderSchemaSupportFromColumnRows([
      columnRow("order_requests", "id"),
      columnRow("crm_deals", "stage", migratedStage),
      columnRow("crm_deals", "saleRefundedAt", "timestamp"),
      columnRow("order_distributor_emails", "orderRequestId"),
    ]);
    expect(newSaleStagePresent(ready!)).toBe(true);
    expect(columnPresent(ready!, "crm_deals", "saleRefundedAt")).toBe(true);
  });

  it("caches a missing shape briefly and a complete shape for longer", async () => {
    const execute = vi.fn(async () => [[columnRow("order_requests", "id"), columnRow("crm_deals", "stage", legacyStage)]]);
    const db = { execute };
    await readOrderSchemaSupport(db, 1_000);
    await readOrderSchemaSupport(db, 1_000 + 1_000);
    expect(execute).toHaveBeenCalledTimes(1);
    await readOrderSchemaSupport(db, 1_000 + ORDER_SCHEMA_MISSING_TTL_MS + 1);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

describe("distributor order flows without the SQL", () => {
  function schemaDb(options: { deals: unknown[]; stageType: string }) {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const db = {
      updates,
      inserts,
      select: () => ({
        from: (table: unknown) => {
          if (table === orderRequests) return { where: () => ({ limit: async () => [paidOrder] }) };
          if (table === crmDeals) {
            const chain = {
              where: () => chain,
              orderBy: () => chain,
              limit: async () => options.deals,
            };
            return chain;
          }
          throw new Error("unexpected select");
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updates.push(values);
          return { where: async () => undefined };
        },
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          inserts.push(values);
          return Promise.resolve([{ insertId: 55 }]);
        },
      }),
      execute: async (query: unknown) => {
        const text = queryText(query);
        if (text.includes("information_schema")) {
          return [[
            columnRow("order_requests", "id"),
            columnRow("crm_deals", "stage", options.stageType),
          ]];
        }
        return [[]];
      },
    };
    return db;
  }

  it("keeps a paid order off new_sale and does not throw when the enum value is absent", async () => {
    const db = schemaDb({ deals: [qualifiedDeal], stageType: legacyStage });
    getDbMock.mockResolvedValue(db);
    await expect(syncStoredOrderCrm(9)).resolves.toBeUndefined();
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
  });

  it("keeps the paid order on the board as qualified when no deal exists and new_sale is absent", async () => {
    const db = schemaDb({ deals: [], stageType: legacyStage });
    getDbMock.mockResolvedValue(db);
    await expect(syncStoredOrderCrm(9)).resolves.toBeUndefined();
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([expect.objectContaining({ stage: "qualified", orderRequestId: 9 })]);
  });

  it("writes new_sale once the enum includes it", async () => {
    const db = schemaDb({ deals: [qualifiedDeal], stageType: migratedStage });
    getDbMock.mockResolvedValue(db);
    await expect(syncStoredOrderCrm(9)).resolves.toBeUndefined();
    expect(db.updates).toEqual([expect.objectContaining({ stage: "new_sale", estimatedValue: "520.00" })]);
  });

  it("returns a migration error from mark verified and does not update the order", async () => {
    const executes: string[] = [];
    getDbMock.mockResolvedValue({
      execute: async (query: unknown) => {
        executes.push(queryText(query));
        return [[columnRow("order_requests", "id")]];
      },
    });
    await expect(markOrderVerified(9, "Admin")).resolves.toEqual({
      ok: false,
      schemaMissing: true,
      message: ORDER_SCHEMA_MESSAGES.trail,
    });
    expect(executes.some((text) => text.includes("UPDATE"))).toBe(false);
  });

  it("returns the admin order list row when the trail columns are missing", async () => {
    const missing = driverError("Unknown column 'distributorEmailStatus' in 'field list'", { code: "ER_BAD_FIELD_ERROR", errno: 1054 });
    const db = { execute: async () => { throw missing; } };
    const [row] = await attachOrderFulfillmentOverlay(db as never, [{ id: 4, requestNumber: "CD-4" }]);
    expect(row).toMatchObject({
      id: 4,
      requestNumber: "CD-4",
      distributorEmailStatus: null,
      orderVerifiedAt: null,
      crmSyncStatus: null,
      imageGeneratedCount: 0,
      distributorEmails: [],
    });
  });

  it("does not throw from the paid follow-up when the database read fails", async () => {
    getDbMock.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => { throw new Error("connection reset"); } }) }) }),
      execute: async () => { throw new Error("connection reset"); },
    });
    await expect(onOrderPaid(9)).resolves.toBeUndefined();
  });
});
