import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm/table";
import { resetWarehouseTableProbeCache } from "../lib/warehouseRecords";

const { getDbMock, easypostQuoteMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  easypostQuoteMock: vi.fn(),
}));

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return { ...actual, getDb: getDbMock };
});

vi.mock("../_core/easypost", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_core/easypost")>();
  return { ...actual, easypostQuote: easypostQuoteMock, easypostParcelQuote: vi.fn() };
});

import type { TrpcContext } from "../_core/context";
import { freightRouter } from "./freight";

type WarehouseRow = { distributorId: number; zip: string; isOpen: boolean | number };

let warehouses: WarehouseRow[] = [];
let warehousesMissing = false;

function settingsRow() {
  return {
    enabled: true,
    originZip: "75001",
    rateModel: "flat",
    handlingFeeCents: 0,
    minChargeCents: 0,
    liftgateFeeCents: 0,
    residentialFeeCents: 0,
    insideDeliveryFeeCents: 0,
    markupBps: 0,
    damageFeeBps: 0,
    freeFreightThresholdCents: 0,
    defaultCabinetWeightLbs: "45",
    liveProvider: "easypost",
    liveApiKey: "test-key",
    freightClass: "175",
    standardPalletLengthIn: "48",
    palletLengthIn: "96",
    palletWidthIn: "40",
    palletHeightIn: "60",
    palletMaxWeightLbs: "1200",
    palletMaxCubicFt: "100",
    palletTareLbs: "50",
    defaultCabinetCubicFt: "8",
    quoteMode: "live",
  };
}

function styleRow() {
  return {
    id: 77,
    distributorId: 9,
    distributorName: "Skyline",
    ourName: "Shaker White",
    aliasName: null,
    warehouseZip: "75247",
    warehouseZips: ["75247", "98032"],
    flatFreightFeeCents: null,
    distributorWarehouseZips: ["75247", "98032"],
    shippingRuleMode: "live" as const,
    shippingFlatFreightFeeCents: null,
    shippingFreeFreightThresholdCents: null,
    shippingZipRates: [],
    shippingExceptions: null,
    warehouseAddress: null,
    pickupAddress: null,
  };
}

function fakeDb() {
  return {
    select() {
      let tableName = "";
      const builder = {
        from(table: object) {
          tableName = getTableName(table as Parameters<typeof getTableName>[0]);
          return builder;
        },
        innerJoin() { return builder; },
        leftJoin() { return builder; },
        where() { return builder; },
        limit() { return builder; },
        orderBy() { return builder; },
        groupBy() { return builder; },
        offset() { return builder; },
        then(onFulfilled?: (rows: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) {
          const missing = warehousesMissing && tableName === "warehouses";
          const rows = missing
            ? Promise.reject(Object.assign(new Error("Table 'cabinet_dealz.warehouses' doesn't exist"), { code: "ER_NO_SUCH_TABLE", errno: 1146 }))
            : Promise.resolve(rowsFor(tableName));
          return rows.then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

function rowsFor(tableName: string): unknown[] {
  if (tableName === "shipping_settings") return [settingsRow()];
  if (tableName === "door_styles") return [styleRow()];
  if (tableName === "warehouses") return warehouses;
  return [];
}

function estimate() {
  const ctx = {
    user: null,
    req: { protocol: "https", headers: { origin: "https://www.cabinetdealz.com" } },
    res: { clearCookie: () => {}, cookie: () => {} },
  } as unknown as TrpcContext;
  return freightRouter.createCaller(ctx).estimate({
    destinationZip: "75201",
    items: [{ cabinetId: 501, styleId: 77, distributorId: 9, qty: 1, weightLbs: 220 }],
    merchandiseSubtotalCents: 250_000,
  });
}

function quotedOrigin(): string | undefined {
  const request = easypostQuoteMock.mock.calls.at(-1)?.[1] as { fromZip?: string } | undefined;
  return request?.fromZip;
}

describe("freight origin skips closed warehouses", () => {
  beforeEach(() => {
    resetWarehouseTableProbeCache();
    warehouses = [];
    warehousesMissing = false;
    getDbMock.mockReset();
    getDbMock.mockImplementation(async () => fakeDb());
    easypostQuoteMock.mockReset();
    easypostQuoteMock.mockResolvedValue({ ok: true, amountCents: 25000, carrier: "Estes", service: "LTL Standard" });
  });

  it("does not choose a closed warehouse even when it is nearest", async () => {
    warehouses = [{ distributorId: 9, zip: "75247", isOpen: 0 }];
    const quote = await estimate();
    expect(quote.available).toBe(true);
    expect(quotedOrigin()).toBe("98032");
  });

  it("restores the nearest warehouse after it is reopened", async () => {
    warehouses = [{ distributorId: 9, zip: "75247", isOpen: 1 }];
    const quote = await estimate();
    expect(quote.available).toBe(true);
    expect(quotedOrigin()).toBe("75247");
  });

  it("refuses the quote visibly when every style warehouse is closed", async () => {
    warehouses = [
      { distributorId: 9, zip: "75247", isOpen: false },
      { distributorId: 9, zip: "98032", isOpen: 0 },
    ];
    const quote = await estimate();
    expect(easypostQuoteMock).not.toHaveBeenCalled();
    expect(quote.available).toBe(false);
    expect(quote.warehousesClosed).toBe(true);
    expect(quote.reason).toContain("every warehouse for this style is closed");
    expect(quote.reason).toContain("75247");
    expect(quote.reason).toContain("98032");
  });

  it("keeps today's nearest origin when the warehouses table is not installed yet", async () => {
    warehousesMissing = true;
    const quote = await estimate();
    expect(quote.available).toBe(true);
    expect(quotedOrigin()).toBe("75247");
  });
});
