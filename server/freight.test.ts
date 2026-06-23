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
    const before = await adminCaller.freight.adminGet();
    const s = before.settings!;
    const payload = {
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
    };
    // Disable -> estimate should be unavailable.
    await adminCaller.freight.adminUpdateSettings({ ...payload, enabled: false });
    const pub = appRouter.createCaller(publicCtx());
    const q = await pub.freight.estimate({
      destinationZip: "30303",
      items: [{ cabinetId: null, qty: 1, weightLbs: 40 }],
      merchandiseSubtotalCents: 10000,
    });
    expect(q.available).toBe(false);
    // Restore enabled state.
    await adminCaller.freight.adminUpdateSettings({ ...payload, enabled: s.enabled });
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
    const before = await adminCaller.freight.adminGet();
    const base = before.settings;
    // Flip markup to 20% then back to whatever it was (default 15%).
    await adminCaller.freight.adminUpdateSettings({
      enabled: base?.enabled ?? true,
      originZip: base?.originZip ?? "30303",
      rateModel: (base?.rateModel ?? "per_cwt") as "per_cwt" | "flat",
      handlingFeeCents: base?.handlingFeeCents ?? 0,
      minChargeCents: base?.minChargeCents ?? 8900,
      liftgateFeeCents: base?.liftgateFeeCents ?? 7500,
      residentialFeeCents: base?.residentialFeeCents ?? 6500,
      insideDeliveryFeeCents: base?.insideDeliveryFeeCents ?? 5000,
      markupBps: 2000,
      damageFeeBps: base?.damageFeeBps ?? 0,
      freeFreightThresholdCents: base?.freeFreightThresholdCents ?? 0,
      defaultCabinetWeightLbs: Number(base?.defaultCabinetWeightLbs ?? 45),
    });
    const mid = await adminCaller.freight.adminGet();
    expect(mid.settings?.markupBps).toBe(2000);

    // restore to 1500
    await adminCaller.freight.adminUpdateSettings({
      enabled: mid.settings!.enabled,
      originZip: mid.settings!.originZip,
      rateModel: mid.settings!.rateModel as "per_cwt" | "flat",
      handlingFeeCents: mid.settings!.handlingFeeCents,
      minChargeCents: mid.settings!.minChargeCents,
      liftgateFeeCents: mid.settings!.liftgateFeeCents,
      residentialFeeCents: mid.settings!.residentialFeeCents,
      insideDeliveryFeeCents: mid.settings!.insideDeliveryFeeCents,
      markupBps: 1500,
      damageFeeBps: mid.settings!.damageFeeBps,
      freeFreightThresholdCents: mid.settings!.freeFreightThresholdCents,
      defaultCabinetWeightLbs: Number(mid.settings!.defaultCabinetWeightLbs),
    });
    const after = await adminCaller.freight.adminGet();
    expect(after.settings?.markupBps).toBe(1500);
  });
});
