import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function callerContext(role: "user" | "admin"): TrpcContext {
  return {
    user: { id: 1, openId: "freight-test-lab", name: "Freight Tester", email: "test@example.com", role } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Operations Freight Test Lab", () => {
  it("is restricted to administrators", async () => {
    const caller = appRouter.createCaller(callerContext("user"));
    await expect(caller.freight.adminSimulateFreight({
      destinationZip: "30303",
      merchandiseSubtotalCents: 500000,
      mode: "pallet_preview",
      items: [{ cabinetId: null, qty: 1, weightLbs: 50 }],
    })).rejects.toThrow();
  });

  it("builds a test-only pallet preview without a customer quote token", async () => {
    const caller = appRouter.createCaller(callerContext("admin"));
    const result = await caller.freight.adminSimulateFreight({
      destinationZip: "30303",
      merchandiseSubtotalCents: 500000,
      mode: "pallet_preview",
      accessorials: { residential: true, liftgate: true },
      items: [
        { cabinetId: null, qty: 6, weightLbs: 75 },
        { cabinetId: null, qty: 2, weightLbs: 30 },
      ],
    });

    expect(result.testOnly).toBe(true);
    expect(result.mode).toBe("pallet_preview");
    expect(result.deliveryType).toBe("residential");
    expect(result.liftgate).toBe(true);
    expect(result.totalUnits).toBe(8);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.palletCount).toBeGreaterThan(0);
    expect(result.groups[0]?.pallets[0]).toMatchObject({
      lengthIn: expect.any(Number),
      widthIn: expect.any(Number),
      heightIn: expect.any(Number),
      weightLbs: expect.any(Number),
    });
    expect(result.totalBillableWeightLbs).toBeGreaterThan(0);
    expect(result.quote).toBeNull();
    expect(result.note).toContain("No carrier request");
    expect(JSON.stringify(result)).not.toContain("quoteToken");
  });

  it("searches real active catalog/style combinations and reports their origin configuration status", async () => {
    const caller = appRouter.createCaller(callerContext("admin"));
    const matches = await caller.freight.adminSearchSimulationItems({ query: "B" });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]).toMatchObject({
      cabinetId: expect.any(Number),
      masterCode: expect.any(String),
      styleId: expect.any(Number),
      styleName: expect.any(String),
      distributorId: expect.any(Number),
    });
    expect(matches[0]).toHaveProperty("originZip");
    expect(matches[0]).toHaveProperty("planBFeeCents");
  });

  it("reports an unavailable Plan B test when the sample group has no configured fallback fee", async () => {
    const caller = appRouter.createCaller(callerContext("admin"));
    const result = await caller.freight.adminSimulateFreight({
      destinationZip: "30303",
      merchandiseSubtotalCents: 100000,
      mode: "plan_b",
      items: [{ cabinetId: null, qty: 1, weightLbs: 50 }],
    });

    expect(result.testOnly).toBe(true);
    expect(result.groups[0]?.source).toBe("unavailable");
    expect(result.quote?.available).toBe(false);
    expect(result.quote?.reason).toContain("no Plan B fee configured");
    expect(JSON.stringify(result)).not.toContain("quoteToken");
  });

  it("exposes saved-design selection and a configured-carrier-only test to administrators", () => {
    const source = require("node:fs").readFileSync(require("node:path").resolve(process.cwd(), "server/routers/freight.ts"), "utf8");
    expect(source).toContain("adminListSimulationDesigns: adminProcedure");
    expect(source).toContain("adminSimulateSavedDesignFreight: adminProcedure");
    expect(source).toContain("savedDesignFreightInput(input.designId)");
    expect(source).toContain("allowMissingStyleOriginFallback: true");
    expect(source).toContain("forceCarrierQuote: true");
    expect(source).toContain('savedSpeedshipClass ?? "175"');
    expect(source).toContain('settingsRow.liveProvider === "worldwideexpress"');
    expect(source).toContain('const freightClass = settingsRow.liveProvider');
    expect(source).toContain('mode: z.enum(["pallet_preview", "saved_configuration"])');
    expect(source).not.toContain("useWwexStagingConnection");
    expect(source).toContain("customer quotes still require a style ZIP");
    expect(source).toContain("missingOriginStyle");
    expect(source).toContain("distributorName: matchedStyle.distributorName");
    expect(source).toContain("None of this saved design’s cabinet selections are currently available");
    expect(source).not.toContain("orders.create");
  });

  it("keeps a missing live provider rate visible as a configuration error instead of inventing an estimate", () => {
    const source = require("node:fs").readFileSync(require("node:path").resolve(process.cwd(), "server/routers/freight.ts"), "utf8");
    expect(source).toContain('input.mode !== "pallet_preview" && unavailable.length > 0');
    expect(source).toContain("Simulation unavailable for");
    expect(source).not.toContain("usedEstimatorFallback");
  });

  it("does not let a carrier quote silently become a Plan B or estimator amount", () => {
    const source = require("node:fs").readFileSync(require("node:path").resolve(process.cwd(), "server/routers/freight.ts"), "utf8");
    expect(source).toContain("!input.forceCarrierQuote && group.flatFreightFeeCents != null");
    expect(source).toContain("Quote requests never substitute table estimates or Plan B fees for a");
    expect(source).not.toContain("estimateFreight(");
  });

  it("normalizes the legacy Worldwide Freight live-test class through the same safe allow-list", () => {
    const source = require("node:fs").readFileSync(require("node:path").resolve(process.cwd(), "server/routers/freight.ts"), "utf8");
    expect(source).toContain('row.liveProvider === "worldwideexpress"');
    expect(source).toContain('normalizeSpeedshipFreightClass(row.freightClass) ?? "175"');
  });

});
