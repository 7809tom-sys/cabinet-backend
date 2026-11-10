import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm/table";

const { getDbMock, easypostQuoteMock, easypostParcelQuoteMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  easypostQuoteMock: vi.fn(),
  easypostParcelQuoteMock: vi.fn(),
}));

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return { ...actual, getDb: getDbMock };
});

vi.mock("../_core/easypost", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_core/easypost")>();
  return {
    ...actual,
    easypostQuote: easypostQuoteMock,
    easypostParcelQuote: easypostParcelQuoteMock,
  };
});

import type { TrpcContext } from "../_core/context";
import { freightRouter } from "./freight";

const source = readFileSync(new URL("./freight.ts", import.meta.url), "utf8");

const LIVE_RATE_UNAVAILABLE =
  "Live shipping rate is unavailable for this address. Retry the quote, or request a quote from the store.";

type ShippingRuleMode = "live" | "fixed" | "threshold";

type StyleRow = {
  id: number;
  distributorId: number;
  distributorName: string;
  ourName: string;
  aliasName: string | null;
  warehouseZip: string | null;
  warehouseZips: string[] | null;
  flatFreightFeeCents: number | null;
  distributorWarehouseZips: string[] | null;
  shippingRuleMode: ShippingRuleMode;
  shippingFlatFreightFeeCents: number | null;
  shippingFreeFreightThresholdCents: number | null;
  shippingZipRates: Array<{ zipPrefix: string; feeCents: number }> | null;
  shippingExceptions: string | null;
};

type Scenario = {
  settings: Record<string, unknown> | null;
  zones: Array<{ zoneName: string; zipPrefixes: string; rateCents: number; sortOrder: number }>;
  style: StyleRow;
  affiliateSlug: string | null;
  carrier: { ok: boolean; amountCents: number; carrier?: string; service?: string; error?: string };
};

const ZIP_FEE_CENTS = 7777;
const FLAT_FEE_CENTS = 12500;
const PLAN_B_CENTS = 9900;
const CARRIER_CENTS = 25000;
const ZONE_CENTS = 6400;

function settingsRow(override: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enabled: true,
    originZip: "75001",
    rateModel: "flat",
    handlingFeeCents: 0,
    minChargeCents: 0,
    liftgateFeeCents: 0,
    residentialFeeCents: 0,
    insideDeliveryFeeCents: 0,
    markupBps: 1000,
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
    ...override,
  };
}

function styleRow(override: Partial<StyleRow> = {}): StyleRow {
  return {
    id: 77,
    distributorId: 9,
    distributorName: "Summit Cabinets",
    ourName: "Shaker White",
    aliasName: null,
    warehouseZip: "75001",
    warehouseZips: ["75001"],
    flatFreightFeeCents: PLAN_B_CENTS,
    distributorWarehouseZips: ["75001"],
    shippingRuleMode: "fixed",
    shippingFlatFreightFeeCents: FLAT_FEE_CENTS,
    shippingFreeFreightThresholdCents: 100_000,
    shippingZipRates: [{ zipPrefix: "303", feeCents: ZIP_FEE_CENTS }],
    shippingExceptions: null,
    ...override,
  };
}

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

function sqlIncludes(clause: unknown, needle: string): boolean {
  const values: unknown[] = [];
  collectSqlValues(clause, values, new Set());
  return values.some((value) => value === needle);
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
        groupBy() { return builder; },
        offset() { return builder; },
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

function rowsFor(tableName: string, whereClause: unknown): unknown[] {
  if (tableName.includes("publish") || tableName.includes("feature")) {
    throw new Error(`freight.estimate consulted a publish table (${tableName})`);
  }
  if (tableName === "shipping_settings") return scenario.settings ? [scenario.settings] : [];
  if (tableName === "freight_zones") return scenario.zones;
  if (tableName === "door_styles") return [scenario.style];
  if (tableName === "affiliates") {
    if (scenario.affiliateSlug && sqlIncludes(whereClause, scenario.affiliateSlug)) {
      return [{
        id: 44,
        slug: scenario.affiliateSlug,
        storeName: "Northstar Kitchens",
        referralCode: "NORTHSTAR",
        status: "active",
      }];
    }
    return [];
  }
  return [];
}

function ctx(headers: Record<string, string> = { origin: "https://www.cabinetdealz.com" }): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const cart = {
  destinationZip: "30303",
  items: [{ cabinetId: 501, styleId: 77, distributorId: 9, qty: 1, weightLbs: 220 }],
  merchandiseSubtotalCents: 250_000,
};

function estimate(input: Record<string, unknown> = {}, headers?: Record<string, string>) {
  return freightRouter.createCaller(ctx(headers)).estimate({ ...cart, ...input });
}

describe("affiliate checkout live freight", () => {
  it("accepts the affiliate store slug and detects a pinned affiliate host", () => {
    expect(source).toContain("affiliateSlug: z.string().trim().min(1).max(64).optional()");
    expect(source).toContain("const affiliateCheckout = await affiliateCheckoutFreight(ctx.req, input.affiliateSlug)");
    expect(source).toContain("if (hostScope.pinned)");
    expect(source).not.toContain("guardAffiliateFeature");
  });

  it("reuses the live carrier call and does not apply posted flat or weight rules", () => {
    expect(source).toContain("ignorePostedFreightRules: affiliateCheckout");
    expect(source).toContain("const distributorRule = input.ignorePostedFreightRules || !matchedStyle");
    expect(source).toContain("flatFreightFeeCents: input.ignorePostedFreightRules ? null : matchedStyle?.flatFreightFeeCents ?? null");
    expect(source).toContain("if (!settings.enabled && !affiliateCheckout)");
    expect(source).toContain("if (affiliateCheckout) {\n            return affiliateLiveRateUnavailable(totalBillableWeightLbs, shipmentGroups);");
    expect(source).toContain("if (affiliateCheckout) {\n        return affiliateLiveRateUnavailable(totalPackagedLoad(packages).weightLbs);");
    expect(source).toContain("const allDistributorRulesFree = !affiliateCheckout && styleGroups.length > 0");
  });

  it("tells the shopper to retry or request a quote instead of substituting a flat rate", () => {
    expect(source).toContain(LIVE_RATE_UNAVAILABLE);
  });

  it("leaves the main store's posted rules, operations switch, and zone table in place", () => {
    expect(source).toContain("Shipping is currently unavailable because Operations has disabled freight quoting.");
    expect(source).toContain("async function configuredFreightEstimate");
    expect(source).toContain("Estimated LTL freight ·");
    expect(source).toContain("Distributor free-freight threshold");
    expect(source).toContain("resolveDistributorShippingRule");
    expect(source).toContain("A configured LTL freight estimate is shown instead");
  });
});

describe("freight.estimate affiliate live carrier", () => {
  beforeEach(() => {
    scenario = {
      settings: settingsRow(),
      zones: [{ zoneName: "Southeast", zipPrefixes: "303", rateCents: ZONE_CENTS, sortOrder: 0 }],
      style: styleRow(),
      affiliateSlug: "northstar",
      carrier: { ok: true, amountCents: CARRIER_CENTS, carrier: "Estes", service: "LTL Standard" },
    };
    getDbMock.mockReset();
    getDbMock.mockImplementation(async () => fakeDb());
    easypostQuoteMock.mockReset();
    easypostQuoteMock.mockImplementation(async () => ({ ...scenario.carrier }));
    easypostParcelQuoteMock.mockReset();
    easypostParcelQuoteMock.mockRejectedValue(new Error("this cart is an LTL shipment"));
  });

  it("prices the main store from the ZIP flat table and does not call the carrier", async () => {
    const quote = await estimate();
    expect(easypostQuoteMock).not.toHaveBeenCalled();
    expect(quote.available).toBe(true);
    expect(quote.freeFreightApplied).toBe(false);
    expect(quote.rateGroups?.[0]?.source).toBe("plan_b");
    expect(quote.rateGroups?.[0]?.baseAmountCents).toBe(ZIP_FEE_CENTS);
    expect(quote.totalCents).toBe(ZIP_FEE_CENTS + Math.round(ZIP_FEE_CENTS * 0.1));
    expect(quote.lines.some((line) => line.amountCents === PLAN_B_CENTS || line.amountCents === FLAT_FEE_CENTS)).toBe(false);
  });

  it("prices an affiliate slug from the live carrier and ignores posted fees", async () => {
    const quote = await estimate({ affiliateSlug: "northstar" });
    expect(easypostQuoteMock).toHaveBeenCalledTimes(1);
    const request = easypostQuoteMock.mock.calls[0]?.[1] as { fromZip: string; toZip: string };
    expect(request.fromZip).toBe("75001");
    expect(request.toZip).toBe("30303");
    expect(quote.available).toBe(true);
    expect(quote.freeFreightApplied).toBe(false);
    expect(quote.rateGroups?.map((group) => group.source)).toEqual(["live"]);
    expect(quote.totalCents).toBe(CARRIER_CENTS + Math.round(CARRIER_CENTS * 0.1));
    expect(quote.zoneName ?? "").not.toMatch(/^Estimated/);
    expect(quote.lines.some((line) => /Plan B|fixed freight|free-freight/i.test(line.label))).toBe(false);
  });

  it("keeps a distributor free-freight threshold on the main store and charges the carrier on the affiliate store", async () => {
    scenario.style = styleRow({
      shippingRuleMode: "threshold",
      shippingFreeFreightThresholdCents: 10_000,
    });
    const main = await estimate();
    expect(easypostQuoteMock).not.toHaveBeenCalled();
    expect(main.available).toBe(true);
    expect(main.totalCents).toBe(0);
    expect(main.freeFreightApplied).toBe(true);
    expect(main.lines[0]?.label).toBe("Distributor free-freight threshold");

    const affiliate = await estimate({ affiliateSlug: "northstar" });
    expect(easypostQuoteMock).toHaveBeenCalledTimes(1);
    expect(affiliate.available).toBe(true);
    expect(affiliate.freeFreightApplied).toBe(false);
    expect(affiliate.totalCents).toBe(CARRIER_CENTS + Math.round(CARRIER_CENTS * 0.1));
    expect(affiliate.rateGroups?.[0]?.source).toBe("live");
  });

  it("still zeroes a main-store live quote at the operations threshold and leaves the affiliate carrier total", async () => {
    scenario.style = styleRow({ shippingRuleMode: "live", shippingZipRates: [], shippingFlatFreightFeeCents: null });
    scenario.settings = settingsRow({ freeFreightThresholdCents: 10_000 });
    const main = await estimate();
    expect(easypostQuoteMock).toHaveBeenCalledTimes(1);
    expect(main.available).toBe(true);
    expect(main.freeFreightApplied).toBe(true);
    expect(main.totalCents).toBe(0);
    expect(main.rateGroups?.[0]?.source).toBe("live");

    easypostQuoteMock.mockClear();
    const affiliate = await estimate({ affiliateSlug: "northstar" });
    expect(easypostQuoteMock).toHaveBeenCalledTimes(1);
    expect(affiliate.freeFreightApplied).toBe(false);
    expect(affiliate.totalCents).toBe(CARRIER_CENTS + Math.round(CARRIER_CENTS * 0.1));
  });

  it("substitutes the zone table on the main store when the carrier fails, and does not on an affiliate store", async () => {
    scenario.style = styleRow({ shippingRuleMode: "live", shippingZipRates: [], shippingFlatFreightFeeCents: null });
    scenario.settings = settingsRow({ markupBps: 0 });
    scenario.carrier = { ok: false, amountCents: 0, error: "carrier down" };
    const main = await estimate();
    expect(main.available).toBe(true);
    expect(main.zoneName).toBe("Estimated LTL freight · Southeast");
    expect(main.totalCents).toBe(ZONE_CENTS);
    expect(main.reason).toMatch(/configured LTL freight estimate is shown instead/);
    expect(main.lines.some((line) => line.amountCents === PLAN_B_CENTS)).toBe(false);

    const affiliate = await estimate({ affiliateSlug: "northstar" });
    expect(affiliate.available).toBe(false);
    expect(affiliate.totalCents).toBe(0);
    expect(affiliate.zoneName).toBeNull();
    expect(affiliate.reason).toBe(LIVE_RATE_UNAVAILABLE);
    expect(affiliate.lines).toEqual([]);
  });

  it("uses the zone table on the main store when no carrier account is connected, and refuses it for an affiliate", async () => {
    scenario.style = styleRow({ shippingRuleMode: "live", shippingZipRates: [], shippingFlatFreightFeeCents: null });
    scenario.settings = settingsRow({ liveProvider: "estimator", markupBps: 0 });
    const main = await estimate();
    expect(easypostQuoteMock).not.toHaveBeenCalled();
    expect(main.available).toBe(true);
    expect(main.zoneName).toBe("Estimated LTL freight · Southeast");
    expect(main.totalCents).toBe(ZONE_CENTS);

    const affiliate = await estimate({ affiliateSlug: "northstar" });
    expect(easypostQuoteMock).not.toHaveBeenCalled();
    expect(affiliate.available).toBe(false);
    expect(affiliate.reason).toBe(LIVE_RATE_UNAVAILABLE);
    expect(affiliate.zoneName).toBeNull();
  });

  it("hides a main-store quote when Operations shipping is off and still returns the affiliate carrier rate", async () => {
    scenario.settings = settingsRow({ enabled: false });
    const main = await estimate();
    expect(easypostQuoteMock).not.toHaveBeenCalled();
    expect(main.available).toBe(false);
    expect(main.reason).toMatch(/Operations has disabled freight quoting/);

    const affiliate = await estimate({ affiliateSlug: "northstar" });
    expect(easypostQuoteMock).toHaveBeenCalledTimes(1);
    expect(affiliate.available).toBe(true);
    expect(affiliate.rateGroups?.[0]?.source).toBe("live");
    expect(affiliate.totalCents).toBeGreaterThan(0);
  });

  it("does not turn a missing carrier account into a posted fee when Operations shipping is off", async () => {
    scenario.settings = settingsRow({ enabled: false, liveProvider: "estimator" });
    const affiliate = await estimate({ affiliateSlug: "northstar" });
    expect(easypostQuoteMock).not.toHaveBeenCalled();
    expect(affiliate.available).toBe(false);
    expect(affiliate.reason).toBe(LIVE_RATE_UNAVAILABLE);
    expect(affiliate.totalCents).toBe(0);
  });

  it("names the style when an affiliate origin ZIP is missing, and still rejects the main store", async () => {
    scenario.style = styleRow({ warehouseZip: null, warehouseZips: [], distributorWarehouseZips: [] });
    const affiliate = await estimate({ affiliateSlug: "northstar" });
    expect(easypostQuoteMock).not.toHaveBeenCalled();
    expect(affiliate.available).toBe(false);
    expect(affiliate.reason).toBe(
      `${LIVE_RATE_UNAVAILABLE} Shaker White does not have a Shipping Origin ZIP in Featured Door Styles.`,
    );

    await expect(estimate()).rejects.toThrow(/Shaker White does not have a Shipping Origin ZIP/);
  });

  it("treats an unknown slug as the main store and a pinned host as affiliate checkout", async () => {
    const unknown = await estimate({ affiliateSlug: "missing-store" });
    expect(easypostQuoteMock).not.toHaveBeenCalled();
    expect(unknown.rateGroups?.[0]?.source).toBe("plan_b");
    expect(unknown.rateGroups?.[0]?.baseAmountCents).toBe(ZIP_FEE_CENTS);

    const pinned = await estimate({}, { origin: "https://northstar.cabinetdealz.com" });
    expect(easypostQuoteMock).toHaveBeenCalledTimes(1);
    expect(pinned.rateGroups?.[0]?.source).toBe("live");
  });

  it("refuses a pinned host that asks for a different store", async () => {
    await expect(estimate(
      { affiliateSlug: "other-store" },
      { origin: "https://northstar.cabinetdealz.com" },
    )).rejects.toThrow(/cannot open the "other-store" store/);
    expect(easypostQuoteMock).not.toHaveBeenCalled();
  });

  it("returns the unavailable result when the affiliate store has no shipping settings row", async () => {
    scenario.settings = null;
    const affiliate = await estimate({ affiliateSlug: "northstar" });
    expect(affiliate.available).toBe(false);
    expect(affiliate.reason).toBe(LIVE_RATE_UNAVAILABLE);
    expect(easypostQuoteMock).not.toHaveBeenCalled();
  });
});
