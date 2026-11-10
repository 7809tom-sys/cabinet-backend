import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm/table";

const { getDbMock, makeRequestMock, wwexMock, upsMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  makeRequestMock: vi.fn(),
  wwexMock: vi.fn(),
  upsMock: vi.fn(),
}));

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return { ...actual, getDb: getDbMock };
});

vi.mock("../_core/map", () => ({
  makeRequest: makeRequestMock,
}));

vi.mock("../_core/worldwideexpress", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_core/worldwideexpress")>();
  return { ...actual, worldwideexpressQuote: wwexMock };
});

vi.mock("../_core/ups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./../_core/ups")>();
  return { ...actual, upsParcelQuote: upsMock };
});

import type { TrpcContext } from "../_core/context";
import { freightRouter } from "./freight";

type Scenario = {
  warehouseAddress: string | null;
  pickupAddress: string | null;
  originZip: string;
  liveProvider: "worldwideexpress" | "ups";
  upsKeys: boolean;
  cabinet: Record<string, unknown> | null;
};

let scenario: Scenario;

function collectSqlValues(node: unknown, out: unknown[], seen: Set<object>) {
  if (node == null || typeof node === "function") return;
  if (typeof node !== "object") {
    out.push(node);
    return;
  }
  if (seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) collectSqlValues(item, out, seen);
    return;
  }
  const record = node as { value?: unknown; queryChunks?: unknown };
  if ("value" in record) collectSqlValues(record.value, out, seen);
  if ("queryChunks" in record) collectSqlValues(record.queryChunks, out, seen);
}

function rowsFor(tableName: string, whereClause?: unknown): unknown[] {
  if (tableName === "shipping_settings") {
    return [{
      enabled: true,
      originZip: "60448",
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
      liveProvider: scenario.liveProvider,
      liveApiKey: "",
      freightClass: "175",
      standardPalletLengthIn: "48",
      palletLengthIn: "96",
      palletWidthIn: "40",
      palletHeightIn: "60",
      palletMaxWeightLbs: "1200",
      palletMaxCubicFt: "100",
      palletTareLbs: "50",
      defaultCabinetCubicFt: "8",
      upsClientId: scenario.upsKeys ? "client" : null,
      upsClientSecret: scenario.upsKeys ? "secret" : null,
      upsAccountNumber: scenario.upsKeys ? "A1" : null,
      upsEnvironment: "sandbox",
    }];
  }
  if (tableName === "door_styles") {
    return [{
      id: 77,
      distributorId: 9,
      distributorName: "Summit Cabinets",
      ourName: "Shaker White",
      aliasName: null,
      warehouseZip: scenario.originZip,
      warehouseZips: [scenario.originZip],
      flatFreightFeeCents: 9900,
      distributorWarehouseZips: [scenario.originZip],
      shippingRuleMode: "live",
      shippingFlatFreightFeeCents: null,
      shippingFreeFreightThresholdCents: null,
      shippingZipRates: [],
      shippingExceptions: null,
      warehouseAddress: scenario.warehouseAddress,
      pickupAddress: scenario.pickupAddress,
    }];
  }
  if (tableName === "affiliates") {
    const values: unknown[] = [];
    collectSqlValues(whereClause, values, new Set());
    return values.includes("northstar")
      ? [{ id: 44, slug: "northstar", storeName: "Northstar", referralCode: "NORTH", status: "active" }]
      : [];
  }
  if (tableName === "cabinets") return scenario.cabinet ? [scenario.cabinet] : [];
  if (tableName === "freight_zones") return [{ zoneName: "Southeast", zipPrefixes: "752", rateCents: 6400, sortOrder: 0 }];
  return [];
}

function fakeDb() {
  return {
    select() {
      let tableName = "";
      let whereClause: unknown;
      const builder = {
        from(table: object) {
          tableName = getTableName(table as Parameters<typeof getTableName>[0]);
          return builder;
        },
        innerJoin() { return builder; },
        leftJoin() { return builder; },
        where(clause: unknown) {
          whereClause = clause;
          return builder;
        },
        limit() { return builder; },
        orderBy() { return builder; },
        then(onFulfilled?: (rows: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) {
          return Promise.resolve().then(() => rowsFor(tableName, whereClause)).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
    insert() {
      return { values: () => Promise.resolve(undefined) };
    },
  };
}

function ctx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: { origin: "https://www.cabinetdealz.com" } } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const deliveryAddress = {
  line1: "100 Main Street",
  line2: null,
  city: "  Dallas ",
  state: "tx",
  zip: "75201",
};

describe("freight.estimate carrier city and state", () => {
  const previousSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-freight-quote-secret";
    scenario = {
      warehouseAddress: null,
      pickupAddress: null,
      originZip: "60448",
      liveProvider: "worldwideexpress",
      upsKeys: false,
      cabinet: null,
    };
    getDbMock.mockReset();
    getDbMock.mockImplementation(async () => fakeDb());
    makeRequestMock.mockReset();
    makeRequestMock.mockResolvedValue({ results: [] });
    wwexMock.mockReset();
    wwexMock.mockResolvedValue({ ok: true, amountCents: 25000, carrier: "Estes", service: "LTL" });
    upsMock.mockReset();
    upsMock.mockResolvedValue({
      ok: true,
      amountCents: 1800,
      carrier: "UPS",
      service: "03",
      packages: [{ label: null, amountCents: 1800, carrier: "UPS", service: "03" }],
    });
  });

  afterEach(() => {
    if (previousSecret == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  it("sends the shopper city and state and the documented origin to Worldwide Express", async () => {
    const quote = await freightRouter.createCaller(ctx()).estimate({
      deliveryAddress,
      items: [{ cabinetId: 501, styleId: 77, distributorId: 9, qty: 1, weightLbs: 220 }],
      merchandiseSubtotalCents: 200000,
      accessorials: { residential: true },
    });
    expect(makeRequestMock).not.toHaveBeenCalled();
    expect(wwexMock).toHaveBeenCalledTimes(1);
    const request = wwexMock.mock.calls[0]?.[1] as {
      fromAddress: { locality: string; region: string; countryCode: string };
      toAddress: { locality: string; region: string; addressLineList?: string[] };
      fromZip: string;
      toZip: string;
      residential?: boolean;
    };
    expect(request.fromZip).toBe("60448");
    expect(request.toZip).toBe("75201");
    expect(request.fromAddress).toEqual({ locality: "Mokena", region: "IL", countryCode: "US" });
    expect(request.toAddress).toMatchObject({ locality: "Dallas", region: "TX", countryCode: "US" });
    expect(request.toAddress.addressLineList).toEqual(["100 Main Street"]);
    expect(request.residential).toBe(true);
    expect(quote.available).toBe(true);
    expect(quote.rateGroups?.[0]?.source).toBe("live");
  });

  it("uses the same shopper and origin addresses for an affiliate live quote", async () => {
    scenario.warehouseAddress = "100 Warehouse Rd, Joliet, IL 60448";
    const quote = await freightRouter.createCaller(ctx()).estimate({
      deliveryAddress,
      affiliateSlug: "northstar",
      items: [{ cabinetId: 501, styleId: 77, distributorId: 9, qty: 1, weightLbs: 220 }],
      merchandiseSubtotalCents: 200000,
    });
    expect(wwexMock).toHaveBeenCalledTimes(1);
    const request = wwexMock.mock.calls[0]?.[1] as { fromAddress: { locality: string; region: string }; toAddress: { locality: string } };
    expect(request.fromAddress.locality).toBe("Joliet");
    expect(request.fromAddress.region).toBe("IL");
    expect(request.toAddress.locality).toBe("Dallas");
    expect(quote.rateGroups?.[0]?.source).toBe("live");
    expect(quote.lines.some((line) => /Plan B|fixed freight/i.test(line.label))).toBe(false);
  });

  it("quotes Houston and Dallas origins without calling Google", async () => {
    for (const [originZip, locality] of [["77064", "Houston"], ["75234", "Dallas"]] as const) {
      wwexMock.mockClear();
      makeRequestMock.mockClear();
      scenario.originZip = originZip;
      const quote = await freightRouter.createCaller(ctx()).estimate({
        deliveryAddress,
        items: [{ cabinetId: 501, styleId: 77, distributorId: 9, qty: 1, weightLbs: 220 }],
        merchandiseSubtotalCents: 200000,
      });
      expect(makeRequestMock).not.toHaveBeenCalled();
      const request = wwexMock.mock.calls[0]?.[1] as { fromAddress: { locality: string; region: string }; toAddress: { locality: string } };
      expect(request.fromAddress).toMatchObject({ locality, region: "TX" });
      expect(request.toAddress.locality).toBe("Dallas");
      expect(quote.rateGroups?.[0]?.source).toBe("live");
    }
  });

  it("uses the offline dataset for a ZIP-only destination and Google only when the ZIP is unknown", async () => {
    await freightRouter.createCaller(ctx()).estimate({
      destinationZip: "10001",
      items: [{ cabinetId: 501, styleId: 77, distributorId: 9, qty: 1, weightLbs: 220 }],
      merchandiseSubtotalCents: 200000,
    });
    expect(makeRequestMock).not.toHaveBeenCalled();
    const offline = wwexMock.mock.calls[0]?.[1] as { fromAddress: { locality: string }; toAddress: { locality: string; region: string } };
    expect(offline.fromAddress.locality).toBe("Mokena");
    expect(offline.toAddress).toMatchObject({ locality: "New York", region: "NY" });

    makeRequestMock.mockResolvedValue({
      results: [{
        address_components: [
          { long_name: "Nowhere", short_name: "Nowhere", types: ["locality"] },
          { long_name: "Texas", short_name: "TX", types: ["administrative_area_level_1"] },
        ],
      }],
    });
    wwexMock.mockClear();
    await freightRouter.createCaller(ctx()).estimate({
      destinationZip: "99999",
      items: [{ cabinetId: 501, styleId: 77, distributorId: 9, qty: 1, weightLbs: 220 }],
      merchandiseSubtotalCents: 200000,
    });
    const lookedUp = makeRequestMock.mock.calls.map((call) => String((call[1] as { address?: string }).address));
    expect(lookedUp.some((address) => address.startsWith("99999"))).toBe(true);
    expect(lookedUp.some((address) => address.startsWith("60448"))).toBe(false);
    const request = wwexMock.mock.calls[0]?.[1] as { toAddress: { locality: string; region: string } };
    expect(request.toAddress).toMatchObject({ locality: "Nowhere", region: "TX" });
  });

  it("sends the shopper city and state on a direct UPS rate", async () => {
    scenario.liveProvider = "ups";
    scenario.upsKeys = true;
    scenario.cabinet = {
      id: 501,
      code: "B12",
      masterCode: "B12",
      weight: 20,
      fallbackWeight: 20,
      l: 16,
      w: 12,
      h: 10,
      physicalWidth: 12,
      physicalHeight: 30,
      physicalDepth: 12,
      category: "Base",
      description: "Base cabinet",
      subCategory: "Base",
      freeShipping: false,
    };
    const quote = await freightRouter.createCaller(ctx()).estimate({
      deliveryAddress,
      items: [{ cabinetId: 501, masterCode: "B12", styleId: 77, distributorId: 9, qty: 1, weightLbs: 20 }],
      merchandiseSubtotalCents: 15000,
      carrierPreference: "ups",
    });
    expect(upsMock).toHaveBeenCalled();
    const request = upsMock.mock.calls[0]?.[1] as {
      fromAddress: { locality: string; region: string };
      toAddress: { locality: string; region: string };
      fromZip: string;
      toZip: string;
    };
    expect(request.fromZip).toBe("60448");
    expect(request.toZip).toBe("75201");
    expect(request.fromAddress).toMatchObject({ locality: "Mokena", region: "IL" });
    expect(request.toAddress).toMatchObject({ locality: "Dallas", region: "TX" });
    expect(quote.shipmentGroups?.[0]?.transportMode).toBe("parcel");
  });
});
