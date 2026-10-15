import { describe, expect, it, vi } from "vitest";
// Tests must never call the real UPS API or depend on the saved production keys.
vi.mock("./_core/ups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/ups")>();
  return { ...actual, upsParcelQuote: vi.fn(async () => ({ ok: false, amountCents: 0, packages: [], error: "UPS parcel rate unavailable (test)" })) };
});
import { upsParcelQuote } from "./_core/ups";
import { AUTO_UPS_MAX_SHIPMENT_WEIGHT_LBS, isSmallUpsShipment } from "@shared/parcelEligibility";
import { upsKeysSaved } from "./routers/freight";
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
// tests stay in sync with the extended live-quote/pallet schema. Pass an
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
    liveProvider: (s.liveProvider ?? "estimator") as
      | "estimator"
      | "ups"
      | "easypost"
      | "shippo"
      | "freightquote"
      | "globaltranz"
      | "worldwideexpress",
    standardPalletLengthIn: Number(s.standardPalletLengthIn ?? 48),
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
  it("returns the configured freight estimate when a live carrier account is not connected", async () => {
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const before = await readSettings();
    const s = before!;
    await adminCaller.freight.adminUpdateSettings(
      settingsPayload(s, { enabled: true, quoteMode: "estimator", liveProvider: "estimator", markupBps: 1500 }),
    );
    try {
      const caller = appRouter.createCaller(publicCtx());
      const q = await caller.freight.estimate({
        destinationZip: "30303",
        items: [{ cabinetId: null, qty: 4, weightLbs: 50 }], // 200 lbs, no catalog lookup
        merchandiseSubtotalCents: 200000,
      });
      expect(q.available).toBe(true);
      expect(q.zoneName).toContain("Estimated LTL freight");
      expect(q.reason).toMatch(/live carrier account is not connected/i);
      expect(q.totalCents).toBeGreaterThan(0);
    } finally {
      await adminCaller.freight.adminUpdateSettings(settingsPayload(s));
    }
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
  }, 15_000);

  it("does not offer LTL when a UPS parcel quote is requested but unavailable", async () => {
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const before = await readSettings();
    const s = before!;
    await adminCaller.freight.adminUpdateSettings(
      settingsPayload(s, { enabled: true, quoteMode: "estimator", liveProvider: "estimator" }),
    );
    try {
      const caller = appRouter.createCaller(publicCtx());
      const q = await caller.freight.estimate({
        destinationZip: "30303",
        items: [{ cabinetId: 9360006, masterCode: "B24", styleId: 390001, distributorId: 180001, qty: 1 }],
        merchandiseSubtotalCents: 50000,
        carrierPreference: "ups",
        distributorId: 180001,
      });
      expect(q.available).toBe(false);
      expect(q.reason).toMatch(/retained shipment groups cannot be quoted|UPS parcel rate unavailable|UPS parcel rating requires/i);
      expect(q.zoneName).toBeNull();
      expect(q.totalCents).toBe(0);
      expect(q.shipmentGroups?.[0]?.transportMode).not.toBe("ltl");
    } finally {
      await adminCaller.freight.adminUpdateSettings(settingsPayload(s));
    }
  }, 15_000);
});

describe("automatic UPS routing for small shipments", () => {
  it("upsKeysSaved needs the Client ID, Client Secret and account number", () => {
    expect(upsKeysSaved(null)).toBe(false);
    expect(upsKeysSaved({ upsClientId: "id", upsClientSecret: "secret", upsAccountNumber: "" })).toBe(false);
    expect(upsKeysSaved({ upsClientId: "id", upsClientSecret: null, upsAccountNumber: "A1B2C3" })).toBe(false);
    expect(upsKeysSaved({ upsClientId: " id ", upsClientSecret: "secret", upsAccountNumber: "A1B2C3" })).toBe(true);
  });
  it("only a small total packaged weight is routed to UPS without the checkbox", () => {
    const carton = (weightLbs: number) => ({ package: { weightLbs } });
    expect(isSmallUpsShipment([])).toBe(false);
    expect(isSmallUpsShipment([{ package: null }])).toBe(false);
    expect(isSmallUpsShipment([carton(36)])).toBe(true);
    expect(isSmallUpsShipment([carton(36), carton(36), carton(36)])).toBe(true);
    expect(isSmallUpsShipment([carton(AUTO_UPS_MAX_SHIPMENT_WEIGHT_LBS)])).toBe(true);
    expect(isSmallUpsShipment([carton(AUTO_UPS_MAX_SHIPMENT_WEIGHT_LBS), carton(1)])).toBe(false);
    expect(isSmallUpsShipment(Array.from({ length: 12 }, () => carton(36)))).toBe(false);
  });
  it("one B12 with no UPS checkbox is quoted by UPS parcel, never LTL (when the UPS keys are saved)", async () => {
    const row = await readSettings();
    if (!row || !upsKeysSaved(row)) return; // nothing to assert without saved UPS keys
    vi.mocked(upsParcelQuote).mockResolvedValueOnce({ ok: true, amountCents: 1615, carrier: "UPS", service: "03", packages: [{ label: null, amountCents: 1615, carrier: "UPS", service: "03" }] } as never);
    const q = await appRouter.createCaller(publicCtx()).freight.estimate({
      destinationZip: "60601",
      items: [{ cabinetId: 9390002, masterCode: "B12", qty: 1 }],
      merchandiseSubtotalCents: 15000,
    });
    expect(q.shipmentGroups?.[0]?.transportMode).toBe("parcel");
    expect(q.shipmentGroups?.[0]?.status).toBe("quoted");
    expect(q.lines.some((line) => /Live parcel/.test(line.label))).toBe(true);
  }, 20_000);
  it("a small cart whose UPS rate fails shows the failure, not an LTL pallet quote (when the UPS keys are saved)", async () => {
    const row = await readSettings();
    if (!row || !upsKeysSaved(row)) return;
    const q = await appRouter.createCaller(publicCtx()).freight.estimate({
      destinationZip: "60601",
      items: [{ cabinetId: 9390002, masterCode: "B12", qty: 1 }],
      merchandiseSubtotalCents: 15000,
    });
    expect(q.available).toBe(false);
    expect(q.shipmentGroups?.[0]?.transportMode).toBe("parcel");
    expect(q.shipmentGroups?.[0]?.status).toBe("carrier_error");
  }, 20_000);
  it("a large order (12 B12) stays on the LTL pallet path", async () => {
    const q = await appRouter.createCaller(publicCtx()).freight.estimate({
      destinationZip: "60601",
      items: [{ cabinetId: 9390002, masterCode: "B12", qty: 12 }],
      merchandiseSubtotalCents: 150000,
    });
    expect(q.shipmentGroups?.[0]?.transportMode).not.toBe("parcel");
  }, 20_000);
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

  it("persists the live-quote and pallet fields", async () => {
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const base = await readSettings();
    await adminCaller.freight.adminUpdateSettings(
      settingsPayload(base!, {
        quoteMode: "live",
        liveProvider: "easypost",
        freightClass: "200",
        standardPalletLengthIn: 48,
        palletMaxWeightLbs: 1800,
      })
    );
    const mid = await readSettings();
    expect(mid?.quoteMode).toBe("live");
    expect(mid?.liveProvider).toBe("easypost");
    expect(mid?.freightClass).toBe("200");
    expect(Number(mid?.standardPalletLengthIn)).toBe(48);
    expect(Number(mid?.palletMaxWeightLbs)).toBe(1800);

    // Restore prior values so other tests / runtime see the original settings.
    await adminCaller.freight.adminUpdateSettings(settingsPayload(base!));
    const after = await readSettings();
    expect(after?.quoteMode).toBe(base?.quoteMode ?? "estimator");
  });

  it("keeps the dedicated WWEX credential pair intact when the broad shipping form is saved", async () => {
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const base = await readSettings();
    expect(base).not.toBeNull();
    const originalClientId = base?.wwexClientId ?? null;
    const originalSecretPresence = base?.hasWwexClientSecret ?? false;

    await adminCaller.freight.adminUpdateSettings(
      settingsPayload(base!, { handlingFeeCents: base!.handlingFeeCents + 1 }),
    );
    const reloaded = await readSettings();
    expect(reloaded?.wwexClientId ?? null).toBe(originalClientId);
    expect(reloaded?.hasWwexClientSecret ?? false).toBe(originalSecretPresence);

    await adminCaller.freight.adminUpdateSettings(settingsPayload(base!));
  });

});
