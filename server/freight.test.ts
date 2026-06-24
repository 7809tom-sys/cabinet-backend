import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function userCtx(role: "user" | "admin"): TrpcContext {
  return {
    user: { id: 1, openId: "o1", name: "T", email: "t@x.com", role } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// Build a complete adminUpdateSettings payload from the current settings row so
// tests stay in sync with the (extended) live-quote/pallet/floor schema. Pass an
// override object to tweak only the fields a given test cares about.
function settingsPayload(s: NonNullable<Awaited<ReturnType<typeof readSettings>>>, override: Record<string, unknown> = {}) {
  return {
    enabled: s.enabled,
    originZip: s.originZip,
    rateModel: s.rateModel as "per_cwt" | "flat",
    handlingFeeCents: s.handlingFeeCents,
    minChargeCents: s.minChargeCents,
    liftgateFeeCents: s.liftgateFeeCents,
    residentialFeeCents: s.residentialFeeCents,
    insideDeliveryFeeCents: s.insideDeliveryFeeCents,
    markupBps: s.markupBps,
    damageFeeBps: s.damageFeeBps,
    freeFreightThresholdCents: s.freeFreightThresholdCents,
    defaultCabinetWeightLbs: Number(s.defaultCabinetWeightLbs),
    quoteMode: (s.quoteMode ?? "estimator") as "estimator" | "live",
    liveProvider: (s.liveProvider ?? "estimator") as "estimator" | "easypost" | "shippo",
    kitchenFreightFloorCents: s.kitchenFreightFloorCents ?? 80000,
    kitchenMinCabinets: s.kitchenMinCabinets ?? 8,
    palletLengthIn: Number(s.palletLengthIn ?? 96),
    palletWidthIn: Number(s.palletWidthIn ?? 48),
    palletHeightIn: Number(s.palletHeightIn ?? 48),
    palletMaxWeightLbs: Number(s.palletMaxWeightLbs ?? 2000),
    palletMaxCubicFt: Number(s.palletMaxCubicFt ?? 120),
    palletTareLbs: Number(s.palletTareLbs ?? 50),
    freightClass: s.freightClass ?? "175",
    defaultCabinetCubicFt: Number(s.defaultCabinetCubicFt ?? 6),
    ...override,
  };
}

async function readSettings() {
  const adminCaller = appRouter.createCaller(userCtx("admin"));
  const { settings } = await adminCaller.freight.adminGet();
  return settings;
}

describe("freight.estimate", () => {
  it("returns a quote with a 15% markup line for a covered ZIP", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const q = await caller.freight.estimate({
      destinationZip: "30303",
      items: [{ cabinetId: null, qty: 4, weightLbs: 50 }], // 200 lbs, no catalog lookup
      merchandiseSubtotalCents: 200000,
    });
    expect(q.available).toBe(true);
    expect(q.zoneName).toBeTruthy();
    // markup is 15% of pre-markup freight
    expect(q.markupCents).toBe(Math.round((q.freightBeforeMarkupCents * 1500) / 10000));
    expect(q.totalCents).toBeGreaterThan(0);
  });

  it("reports unavailable when freight is disabled, then restores", async () => {
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const before = await readSettings();
    const s = before!;
    // Disable -> estimate should be unavailable.
    await adminCaller.freight.adminUpdateSettings(settingsPayload(s, { enabled: false }));
    const pub = appRouter.createCaller(publicCtx());
    const q = await pub.freight.estimate({
      destinationZip: "30303",
      items: [{ cabinetId: null, qty: 1, weightLbs: 40 }],
      merchandiseSubtotalCents: 10000,
    });
    expect(q.available).toBe(false);
    // Restore enabled state.
    await adminCaller.freight.adminUpdateSettings(settingsPayload(s, { enabled: s.enabled }));
  });
});

describe("freight admin", () => {
  it("adminGet is admin-only", async () => {
    const userCaller = appRouter.createCaller(userCtx("user"));
    await expect(userCaller.freight.adminGet()).rejects.toThrow();
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const data = await adminCaller.freight.adminGet();
    expect(data).toHaveProperty("settings");
    expect(Array.isArray(data.zones)).toBe(true);
  });

  it("adminUpdateSettings persists the markup and round-trips", async () => {
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const base = await readSettings();
    // Flip markup to 20% then back to whatever it was (default 15%).
    await adminCaller.freight.adminUpdateSettings(settingsPayload(base!, { markupBps: 2000 }));
    const mid = await readSettings();
    expect(mid?.markupBps).toBe(2000);

    // restore to 1500
    await adminCaller.freight.adminUpdateSettings(settingsPayload(mid!, { markupBps: 1500 }));
    const after = await readSettings();
    expect(after?.markupBps).toBe(1500);
  });

  it("persists the live-quote / pallet / $800 floor fields", async () => {
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const base = await readSettings();
    await adminCaller.freight.adminUpdateSettings(
      settingsPayload(base!, {
        quoteMode: "live",
        liveProvider: "easypost",
        kitchenFreightFloorCents: 80000,
        freightClass: "200",
        palletMaxWeightLbs: 1800,
      })
    );
    const mid = await readSettings();
    expect(mid?.quoteMode).toBe("live");
    expect(mid?.liveProvider).toBe("easypost");
    expect(mid?.kitchenFreightFloorCents).toBe(80000);
    expect(mid?.freightClass).toBe("200");
    expect(Number(mid?.palletMaxWeightLbs)).toBe(1800);

    // Restore prior values so other tests / runtime see the original settings.
    await adminCaller.freight.adminUpdateSettings(settingsPayload(base!));
    const after = await readSettings();
    expect(after?.quoteMode).toBe(base?.quoteMode ?? "estimator");
  });
});
