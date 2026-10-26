import { describe, expect, it, vi } from "vitest";
import { dispatchExistingCarrierQuote, type ExistingCarrierQuoteInput } from "./carriers";

const base: ExistingCarrierQuoteInput = {
  liveProvider: "estimator",
  fromZip: "33760",
  toZip: "30301",
  freightClass: "85",
  parcels: [{ lengthIn: 10, widthIn: 8, heightIn: 6, weightLbs: 12 }],
  pallets: [{ lengthIn: 48, widthIn: 40, heightIn: 40, weightLbs: 120 }],
  fromAddress: { locality: "Clearwater", region: "FL", countryCode: "US" },
  toAddress: { locality: "Atlanta", region: "GA", countryCode: "US" },
  ups: null,
  fedex: null,
  easypostApiKey: null,
  freightquote: null,
  globaltranz: null,
  worldwideexpress: null,
};

describe("existing carrier adapter", () => {
  it("does not invent a rate when Operations is on the estimator", async () => {
    const quote = await dispatchExistingCarrierQuote(base, {});
    expect(quote.ok).toBe(false);
    if (quote.ok) return;
    expect(quote.code).toBe("not_configured");
  });

  it("delegates a verified parcel to the existing UPS client", async () => {
    const upsParcelQuote = vi.fn(async () => ({ ok: true, amountCents: 2222, carrier: "UPS", service: "Ground", transitDays: 2, packages: [] }));
    const quote = await dispatchExistingCarrierQuote({
      ...base,
      liveProvider: "ups",
      ups: { clientId: "id", clientSecret: "secret", accountNumber: "123", environment: "sandbox" },
    }, { upsParcelQuote });
    expect(upsParcelQuote).toHaveBeenCalledTimes(1);
    expect(quote).toMatchObject({ ok: true, options: [{ carrier: "UPS", method: "Ground", costCents: 2222, transitDays: 2 }] });
    expect(JSON.stringify(quote)).not.toContain("secret");
  });

  it("delegates LTL to the existing Freightquote client", async () => {
    const freightquoteQuote = vi.fn(async () => ({ ok: true, amountCents: 8800, carrier: "Estes", service: "LTL", transitDays: 5 }));
    const quote = await dispatchExistingCarrierQuote({
      ...base,
      liveProvider: "freightquote",
      freightquote: { clientId: "id", clientSecret: "secret", accountNumber: "1", environment: "sandbox" },
    }, { freightquoteQuote });
    expect(freightquoteQuote).toHaveBeenCalledTimes(1);
    expect(quote.ok).toBe(true);
  });
});
