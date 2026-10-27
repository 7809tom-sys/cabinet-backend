import { describe, expect, it, vi } from "vitest";
import type { FreightSettings, FreightZoneRate } from "./freight";
import {
  NEEDS_PELICAN_PACKAGE_DATA,
  QUARTZ_COMPARISON_RULE_ID,
  ShippingQuoteTimeout,
  assertAuthHeaderName,
  assertPublicHttpsQuoteUrl,
  buildVendorShippingQuoteContract,
  createShippingQuoteCache,
  createShippingQuoteRateLimiter,
  itemsReadyForCarrier,
  liveConnectionEligible,
  parseVendorHttpQuoteResponse,
  pelicanProviderQuote,
  publicVendorQuoteConfig,
  redactVendorLineForClient,
  requestVendorHttpQuote,
  resolveShippingQuotePriority,
  shippingQuoteCacheKey,
  vendorConfigAccess,
  type ShippingQuoteLine,
  type ShippingQuoteLogEntry,
  type VendorLiveConnection,
} from "./shippingQuote";

const settings: FreightSettings = {
  enabled: true,
  originZip: "30301",
  rateModel: "per_cwt",
  handlingFeeCents: 0,
  minChargeCents: 0,
  liftgateFeeCents: 0,
  residentialFeeCents: 0,
  insideDeliveryFeeCents: 0,
  markupBps: 0,
  damageFeeBps: 0,
  freeFreightThresholdCents: 0,
  defaultCabinetWeightLbs: 45,
};

const zones: FreightZoneRate[] = [
  { zoneName: "Southeast", zipPrefixes: "30", rateCents: 2000 },
];

function line(overrides: Partial<ShippingQuoteLine> = {}): ShippingQuoteLine {
  return {
    sku: "SKU-1",
    qty: 1,
    weightLbs: 40,
    lengthIn: 20,
    widthIn: 10,
    heightIn: 8,
    freightClass: "85",
    evidence: "missing",
    shipFromZip: "33760",
    transportMode: "parcel",
    comparisonRuleId: null,
    ...overrides,
  };
}

const idleLive: VendorLiveConnection = { kind: "none", adminEnabled: false, vendorEnabled: false, configured: false };

function harness(overrides: Partial<Parameters<typeof resolveShippingQuotePriority>[0]> = {}) {
  const logs: ShippingQuoteLogEntry[] = [];
  const quoteLive = vi.fn(async () => ({ ok: false as const, code: "not_configured" as const, error: "not used" }));
  const quoteCarrier = vi.fn(async () => ({ ok: false as const, code: "not_configured" as const, error: "carrier off" }));
  const cache = createShippingQuoteCache();
  const run = (more: Partial<Parameters<typeof resolveShippingQuotePriority>[0]> = {}) => resolveShippingQuotePriority({
    vendorScope: "dist:4",
    destinationZip: "30301",
    items: [line()],
    live: idleLive,
    serviceCodes: ["GROUND"],
    freightClass: "85",
    shipFromZip: "30101",
    postedRule: null,
    hardwareStandaloneCents: null,
    merchandiseSubtotalCents: 0,
    site: { settings, zones },
    nowMs: 1_000,
    cache,
    log: (entry) => logs.push(entry),
    quoteLive,
    quoteCarrier,
    ...overrides,
    ...more,
  });
  return { logs, quoteLive, quoteCarrier, cache, run };
}

describe("vendor shipping quote priority", () => {
  it("uses the vendor live API before posted rates", async () => {
    const { run, quoteLive, quoteCarrier } = harness({
      live: { kind: "http", adminEnabled: true, vendorEnabled: true, configured: true },
      postedRule: { mode: "fixed", flatFeeCents: 1500, freeThresholdCents: null, zipRates: [], exceptions: null },
    });
    quoteLive.mockResolvedValue({ ok: true, options: [{ carrier: "Vendor", method: "Ground", costCents: 4200, transitDays: 3 }] });
    const quote = await run();
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.source).toBe("vendor_live");
    expect(quote.estimate).toBe(false);
    expect(quote.sourceLabel).toBe("Vendor live quote");
    expect(quote.options[0]).toMatchObject({ method: "Ground", costCents: 4200, transitDays: 3 });
    expect(quoteCarrier).not.toHaveBeenCalled();
  });

  it("falls back to the vendor's posted zip rate when the live API times out", async () => {
    const { run, quoteLive, logs } = harness({
      live: { kind: "http", adminEnabled: true, vendorEnabled: true, configured: true },
      postedRule: {
        mode: "fixed",
        flatFeeCents: 900,
        freeThresholdCents: null,
        zipRates: [{ zipPrefix: "303", feeCents: 2500 }],
        exceptions: null,
      },
    });
    quoteLive.mockRejectedValue(new ShippingQuoteTimeout());
    const quote = await run();
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.source).toBe("vendor_rates");
    expect(quote.estimate).toBe(false);
    expect(quote.sourceLabel).toBe("Vendor rates");
    expect(quote.options[0].costCents).toBe(2500);
    expect(logs.some((entry) => entry.outcome === "fallback" && entry.source === "vendor_live")).toBe(true);
  });

  it("does not call a live API that the administrator has not enabled", async () => {
    const { run, quoteLive } = harness({
      live: { kind: "http", adminEnabled: false, vendorEnabled: true, configured: true },
      postedRule: { mode: "fixed", flatFeeCents: 800, freeThresholdCents: null, zipRates: [], exceptions: null },
    });
    const quote = await run();
    expect(quoteLive).not.toHaveBeenCalled();
    expect(quote.ok && quote.source).toBe("vendor_rates");
  });

  it("uses a carrier rate from supplier-verified packages as vendor data", async () => {
    const { run, quoteCarrier } = harness({
      items: [line({ evidence: "supplier_verified" })],
    });
    quoteCarrier.mockResolvedValue({ ok: true, options: [{ carrier: "UPS", method: "Ground", costCents: 3100, transitDays: 2 }] });
    const quote = await run();
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.source).toBe("vendor_rates");
    expect(quote.estimate).toBe(false);
    expect(quote.options[0]).toMatchObject({ carrier: "UPS", costCents: 3100 });
    expect(quote.note).toContain("supplier-verified");
  });

  it("labels estimator zones as a site estimate and only uses them when the vendor has no rate", async () => {
    const { run, quoteCarrier } = harness({
      items: [line({ evidence: "comparable_estimate", comparisonRuleId: QUARTZ_COMPARISON_RULE_ID, freightClass: null, weightLbs: 600 })],
      freightClass: null,
    });
    const quote = await run();
    expect(quoteCarrier).not.toHaveBeenCalled();
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.source).toBe("site_estimate");
    expect(quote.estimate).toBe(true);
    expect(quote.sourceLabel).toBe("Site estimate");
    expect(quote.options[0].method).toContain("Southeast");
    expect(quote.note).toContain("Freight class 175");
    expect(quote.note).toContain("600 lb");
    expect(quote.note).toContain("800 lb");
    expect(quote.note).toContain("1080 lb");
  });

  it("says a Pelican SKU needs package data when nothing can price it", async () => {
    const { run } = harness({
      vendorScope: "pelican",
      destinationZip: "99999",
      items: [line({ evidence: "missing", weightLbs: null, shipFromZip: null })],
      site: { settings, zones: [] },
    });
    const quote = await run();
    expect(quote.ok).toBe(false);
    if (quote.ok) return;
    expect(quote.code).toBe("needs_package_data");
    expect(quote.error).toBe(NEEDS_PELICAN_PACKAGE_DATA);
  });

  it("prefers posted rates over a verified carrier call", async () => {
    const { run, quoteCarrier } = harness({
      items: [line({ evidence: "supplier_verified" })],
      postedRule: { mode: "threshold", flatFeeCents: 4000, freeThresholdCents: 10000, zipRates: [], exceptions: null },
      merchandiseSubtotalCents: 15000,
    });
    const quote = await run();
    expect(quoteCarrier).not.toHaveBeenCalled();
    expect(quote.ok && quote.source).toBe("vendor_rates");
    expect(quote.ok && quote.options[0].costCents).toBe(0);
  });
});

describe("shipping quote cache and isolation", () => {
  it("serves the second identical quote from cache and keeps vendors apart", async () => {
    const { run, quoteLive, logs } = harness({
      live: { kind: "http", adminEnabled: true, vendorEnabled: true, configured: true },
    });
    quoteLive.mockResolvedValue({ ok: true, options: [{ carrier: null, method: "API", costCents: 1000, transitDays: 1 }] });
    await run();
    const again = await run();
    expect(quoteLive).toHaveBeenCalledTimes(1);
    expect(again.ok && again.source).toBe("vendor_live");
    expect(logs.at(-1)?.outcome).toBe("cache");

    const other = shippingQuoteCacheKey({
      vendorScope: "dist:9",
      destinationZip: "30301",
      items: [line()],
      live: { kind: "http", adminEnabled: true, vendorEnabled: true, configured: true },
      postedRule: null,
      hardwareStandaloneCents: null,
    });
    const same = shippingQuoteCacheKey({
      vendorScope: "dist:4",
      destinationZip: "30301",
      items: [line()],
      live: { kind: "http", adminEnabled: true, vendorEnabled: true, configured: true },
      postedRule: null,
      hardwareStandaloneCents: null,
    });
    expect(other).not.toBe(same);
  });

  it("refuses another vendor's quote settings", () => {
    const target = { vendorLineId: 7, distributorIds: [4] };
    expect(vendorConfigAccess({ isAdmin: false, vendorLineId: 7, distributorId: null }, target).ok).toBe(true);
    expect(vendorConfigAccess({ isAdmin: false, vendorLineId: null, distributorId: 4 }, target).ok).toBe(true);
    expect(vendorConfigAccess({ isAdmin: true, vendorLineId: null, distributorId: null }, target).ok).toBe(true);
    const denied = vendorConfigAccess({ isAdmin: false, vendorLineId: 8, distributorId: 5 }, target);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toMatch(/another vendor/i);
  });

  it("never returns a saved secret", () => {
    const secret = "vendor-live-secret-value";
    const view = publicVendorQuoteConfig({
      vendorLineId: 1,
      serviceCodes: ["LTL"],
      freightClass: "70",
      shipFromZip: "33760",
      provider: "http",
      quoteUrl: "https://quotes.example.test/v1",
      authHeaderName: "X-Quote-Key",
      hasSecret: true,
      adminEnabled: true,
      vendorEnabled: true,
      secret,
    });
    expect(JSON.stringify(view)).not.toContain(secret);
    expect(view.hasSecret).toBe(true);
    expect("secret" in view).toBe(false);
  });

  it("rate-limits a caller after the window fills", () => {
    const limiter = createShippingQuoteRateLimiter(2, 60_000);
    expect(limiter.allow("1.1.1.1", 0)).toBe(true);
    expect(limiter.allow("1.1.1.1", 10)).toBe(true);
    expect(limiter.allow("1.1.1.1", 20)).toBe(false);
    expect(limiter.allow("2.2.2.2", 20)).toBe(true);
  });
});

describe("vendor HTTP contract and Pelican stub", () => {
  it("posts the documented contract and drops any echoed secret", async () => {
    const secret = "super-secret-header-value";
    let seenHeader = "";
    let seenBody = "";
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seenHeader = new Headers(init?.headers).get("X-Quote-Key") ?? "";
      seenBody = String(init?.body);
      return new Response(JSON.stringify({
        options: [{ carrier: "ACME", method: "LTL", costCents: 5000, transitDays: 4, expiresAt: "2026-11-01T00:00:00.000Z", secret }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const contract = buildVendorShippingQuoteContract({
      vendorScope: "pelican",
      destinationZip: "30301",
      shipFromZip: "33760",
      freightClass: "70",
      serviceCodes: ["ltl"],
      items: [line({ sku: "PL-FLOOR" })],
    });
    const attempt = await requestVendorHttpQuote({
      url: "https://quotes.example.test/rate",
      authHeaderName: "X-Quote-Key",
      secret,
      contract,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      signal: new AbortController().signal,
    });
    expect(seenHeader).toBe(secret);
    expect(JSON.parse(seenBody)).toMatchObject({ contractVersion: "2026-10-26", serviceCodes: ["LTL"], destinationZip: "30301" });
    expect(JSON.parse(seenBody).items[0].sku).toBe("PL-FLOOR");
    expect(attempt.ok).toBe(true);
    expect(JSON.stringify(attempt)).not.toContain(secret);
    expect(assertPublicHttpsQuoteUrl("https://quotes.example.test/rate").protocol).toBe("https:");
    expect(() => assertPublicHttpsQuoteUrl("http://quotes.example.test/rate")).toThrow(/https/);
    expect(() => assertAuthHeaderName("Bad Header")).toThrow(/header/i);
  });

  it("hides vendor response bodies that might repeat a credential", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope secret-in-body", { status: 500 }));
    const attempt = await requestVendorHttpQuote({
      url: "https://quotes.example.test/rate",
      authHeaderName: "Authorization",
      secret: "secret-in-body",
      contract: buildVendorShippingQuoteContract({
        vendorScope: "dist:1",
        destinationZip: "10001",
        shipFromZip: null,
        freightClass: null,
        serviceCodes: [],
        items: [line()],
      }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      signal: new AbortController().signal,
    });
    expect(attempt.ok).toBe(false);
    if (attempt.ok) return;
    expect(attempt.error).toBe("Vendor quote endpoint returned HTTP 500.");
    expect(attempt.error).not.toContain("secret-in-body");
  });

  it("keeps the Pelican adapter unconfigured", () => {
    expect(pelicanProviderQuote({ enabled: false, apiKey: "", apiUrl: "" }).code).toBe("not_configured");
    expect(pelicanProviderQuote({ enabled: true, apiKey: "test-key", apiUrl: "https://example.test" }).ok).toBe(false);
    expect(JSON.stringify(pelicanProviderQuote({ enabled: true, apiKey: "test-key", apiUrl: "" }))).not.toContain("test-key");
    expect(liveConnectionEligible({ kind: "pelican", adminEnabled: true, vendorEnabled: true, configured: true })).toBe(true);
    expect(itemsReadyForCarrier([line({ evidence: "supplier_verified" })])).toBe(true);
    expect(itemsReadyForCarrier([line({ evidence: "comparable_estimate" })])).toBe(false);
  });

  it("removes the encrypted secret from an approved-vendor row", () => {
    const row = redactVendorLineForClient({ id: 3, shippingQuoteSecretEncrypted: "stored-secret" });
    expect(row.hasShippingQuoteSecret).toBe(true);
    expect(JSON.stringify(row)).not.toContain("stored-secret");
  });

  it("rejects a quote payload that is not the documented shape", () => {
    expect(parseVendorHttpQuoteResponse({ error: "closed" }).ok).toBe(false);
    expect(parseVendorHttpQuoteResponse({ options: [{ method: "Ground", costCents: 10 }] }).ok).toBe(true);
  });
});
