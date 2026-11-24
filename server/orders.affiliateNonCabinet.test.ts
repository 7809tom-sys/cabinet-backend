import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { DEFAULT_PRICING_SETTINGS } from "../shared/pricing";
import {
  affiliates,
  affiliateStyleBranding,
  cabinets,
  distributors,
  hardwareCategoryAffiliateMarkups,
  pelicanCategoryMarkups,
  vendorProducts,
} from "../drizzle/schema";
import { pelicanProducts } from "../drizzle/pelicanSchema";
import { affiliateStorefrontSale } from "./lib/affiliateTierPricing";

const { getDbMock, state } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  state: {
    inserted: [] as Array<Record<string, unknown>>,
    cabinetRows: [] as unknown[],
    hardwareRows: [] as unknown[],
    pelicanRows: [] as unknown[],
    pelicanMarkups: [] as unknown[],
    hardwareMarkups: [] as unknown[],
  },
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
  hasPositivePublishedCabinetPrice: () => ({}),
  notInConflict: () => ({}),
  getPricingSettings: async () => DEFAULT_PRICING_SETTINGS,
  getPlatformPricingSettings: async () => DEFAULT_PRICING_SETTINGS,
}));

vi.mock("./lib/orderCostSnapshot", () => ({
  withDistributorCostSnapshots: async (_db: unknown, lines: unknown) => lines,
  persistOrderCostSnapshot: async () => {},
}));

vi.mock("./lib/orderSideEffects", () => ({
  onOrderPlaced: async () => {},
  adminMarkOrderPaid: async () => {},
  attachOrderFulfillmentOverlay: async () => {},
  backfillOrderCrm: async () => {},
  markOrderShipped: async () => {},
  markOrderSigned: async () => {},
  markOrderVerified: async () => {},
  notifyOrderDistributors: async () => {},
}));

vi.mock("./lib/crmPipelineAttach", () => ({
  ensureAffiliatePipelineDeal: async () => ({ created: false, id: 1 }),
}));

vi.mock("./_core/crmWebhook", () => ({
  emitCrmEvent: () => {},
}));

import { ordersRouter } from "./routers/orders";

const AFFILIATE = {
  id: 9,
  status: "active",
  storefrontEnabled: true,
  defaultMarkupBps: 4000,
  categoryMarkupJson: null,
  hardwareMarkupBps: 2500,
  pricingTierId: null,
  referralCode: "FIRSTCLASS",
};

function rowsFor(table: unknown): unknown[] {
  if (table === affiliates) return [AFFILIATE];
  if (table === affiliateStyleBranding) return [];
  if (table === distributors) return [];
  if (table === cabinets) return state.cabinetRows;
  if (table === vendorProducts) return state.hardwareRows;
  if (table === pelicanProducts) return state.pelicanRows;
  if (table === pelicanCategoryMarkups) return state.pelicanMarkups;
  if (table === hardwareCategoryAffiliateMarkups) return state.hardwareMarkups;
  return [];
}

function fluent() {
  const current: { table?: unknown } = {};
  const api = {
    from(table: unknown) {
      current.table = table;
      return api;
    },
    innerJoin() { return api; },
    leftJoin() { return api; },
    where() { return api; },
    orderBy() { return api; },
    groupBy() { return api; },
    set() { return api; },
    limit() { return Promise.resolve(rowsFor(current.table)); },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(rowsFor(current.table)).then(resolve, reject);
    },
  };
  return api;
}

function installDb() {
  getDbMock.mockResolvedValue({
    select: () => fluent(),
    insert: () => ({
      values: (value: unknown) => {
        state.inserted.push((Array.isArray(value) ? value[0] : value) as Record<string, unknown>);
        return Promise.resolve([{ insertId: 501 }]);
      },
    }),
    update: () => fluent(),
  });
}

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function cabinetLine() {
  return {
    cabinetId: 10,
    masterCode: "B24",
    description: "Base 24",
    qty: 1,
    unitPrice: 0.01,
    linePrice: 0.01,
    styleId: 330005,
    distributorId: 9,
    matched: true,
  };
}

function surfaceLine(pelicanProductId: number | null = 20) {
  return {
    cabinetId: null,
    masterCode: pelicanProductId == null ? "PEL-20" : `PEL-${pelicanProductId}`,
    description: "Sink",
    qty: 2,
    unitPrice: 0.01,
    linePrice: 0.02,
    styleId: null,
    productKind: "surface" as const,
    pelicanProductId,
    matched: true,
  };
}

function hardwareLine() {
  return {
    cabinetId: null,
    masterCode: "HW-1",
    description: "Pull",
    qty: 3,
    unitPrice: 0.01,
    linePrice: 0.03,
    styleId: null,
    productKind: "hardware" as const,
    vendorProductId: 77,
    matched: true,
  };
}

const sellableSink = {
  id: 20,
  category: "Sinks & Faucets",
  listPrice: "20.00",
  yourCost: "10.00",
  retailPrice: null,
  isActive: true,
  showInCatalog: true,
  showInDesigner: true,
  affiliateSalePrice: null as string | null,
};

const sellablePull = {
  id: 77,
  vendorSku: "PULL-1",
  name: "Bar pull",
  description: "Bar pull",
  category: "Pulls",
  listPrice: "10.00",
  yourCost: "4.00",
  affiliateSalePrice: null as string | null,
};

async function submit(lines: Array<ReturnType<typeof cabinetLine> | ReturnType<typeof surfaceLine> | ReturnType<typeof hardwareLine>>) {
  return ordersRouter.createCaller(publicCtx()).createRequest({
    storeScope: "firstclass",
    source: "manual",
    tier: "Homeowner",
    submit: true,
    deliveryMethod: "pickup",
    lineItems: lines,
  });
}

function savedOrder() {
  const order = state.inserted.find((row) => Array.isArray(row.lineItems));
  return order as { status: string; lineItems: Array<{ masterCode: string; unitPrice: number; linePrice: number; productKind?: string | null; qty: number }> } | undefined;
}

describe("affiliate checkout for Pelican and hardware lines", () => {
  beforeEach(() => {
    state.inserted = [];
    state.cabinetRows = [{ masterCode: "B24", category: "Base", styleId: 330005, yourCost: "100.00", listPrice: "200.00" }];
    state.hardwareRows = [{ ...sellablePull }];
    state.pelicanRows = [{ ...sellableSink }];
    state.pelicanMarkups = [];
    state.hardwareMarkups = [];
    installDb();
  });

  it("submits a cabinet, a PEL- surface line, and a hardware line at server prices", async () => {
    const created = await submit([cabinetLine(), surfaceLine(), hardwareLine()]);
    expect(created.id).toBe(501);
    const order = savedOrder();
    expect(order?.status).toBe("submitted");
    const cabinet = order?.lineItems.find((line) => line.masterCode === "B24");
    const surface = order?.lineItems.find((line) => line.masterCode === "PEL-20");
    const hardware = order?.lineItems.find((line) => line.productKind === "hardware");
    const expectedCabinet = affiliateStorefrontSale({
      platformSettings: DEFAULT_PRICING_SETTINGS,
      markup: { globalMarkupBps: 4000, categoryMarkupBps: {}, styleMarkupBps: {} },
      tier: null,
    }, 10000, { styleId: 330005, categoryKey: "Base", listPriceCents: 20000 }).retailCents / 100;
    expect(cabinet?.unitPrice).toBe(expectedCabinet);
    expect(cabinet?.unitPrice).not.toBe(0.01);
    expect(surface?.unitPrice).toBe(13.8);
    expect(surface?.linePrice).toBe(27.6);
    expect(hardware?.masterCode).toBe("PULL-1");
    expect(hardware?.unitPrice).toBe(12.5);
    expect(hardware?.linePrice).toBe(37.5);
  });

  it("rejects a Pelican line when the product record is missing or not orderable", async () => {
    state.pelicanRows = [];
    await expect(submit([cabinetLine(), surfaceLine(20), hardwareLine()])).rejects.toThrow(
      "A current approved Pelican price is unavailable for PEL-20.",
    );
    expect(savedOrder()).toBeUndefined();

    state.inserted = [];
    state.pelicanRows = [{ ...sellableSink, isActive: false }];
    await expect(submit([cabinetLine(), surfaceLine(), hardwareLine()])).rejects.toThrow(
      "A current approved Pelican price is unavailable for PEL-20.",
    );

    state.inserted = [];
    await expect(submit([cabinetLine(), surfaceLine(null), hardwareLine()])).rejects.toBeInstanceOf(TRPCError);
    await expect(submit([cabinetLine(), surfaceLine(null), hardwareLine()])).rejects.toThrow(
      "Every Pelican line must carry its exact catalog product identity.",
    );
  });

  it("uses a fixed item price, then the category percent, ahead of the automatic product price", async () => {
    state.pelicanRows = [{ ...sellableSink, affiliateSalePrice: "49.00" }];
    state.pelicanMarkups = [{ category: "Sinks & Faucets", markupBps: 3800, affiliateMarkupBps: 5000 }];
    state.hardwareMarkups = [{ category: "Pulls", affiliateMarkupBps: 10000 }];
    await submit([cabinetLine(), surfaceLine(), hardwareLine()]);
    const order = savedOrder();
    expect(order?.lineItems.find((line) => line.masterCode === "PEL-20")?.unitPrice).toBe(49);
    expect(order?.lineItems.find((line) => line.productKind === "hardware")?.unitPrice).toBe(8);
  });

  it("still rejects a cabinet line with no source-backed affiliate price", async () => {
    state.cabinetRows = [];
    await expect(submit([cabinetLine()])).rejects.toThrow(
      "A current source-backed affiliate sale price is unavailable for B24.",
    );
    expect(savedOrder()).toBeUndefined();
  });
});
