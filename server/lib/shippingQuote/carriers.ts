/**
 * Named carrier/LTL adapter. It calls the carrier clients the freight router
 * already uses (UPS, FedEx, EasyPost, Freightquote, GlobalTranz, Worldwide
 * Express). It does not store a new carrier key and it does not buy a label.
 */

import { easypostQuote, type LivePallet, type LiveParcel, type LiveQuoteAddress, type LiveQuoteRequest } from "../../_core/easypost";
import { fedexParcelQuote, type FedexCredentials } from "../../_core/fedex";
import { freightquoteQuote } from "../../_core/freightquote";
import { globaltranzQuote } from "../../_core/globaltranz";
import { upsParcelQuote, type UpsCredentials } from "../../_core/ups";
import { worldwideexpressQuote } from "../../_core/worldwideexpress";
import type { ProviderAttempt } from "../../../shared/shippingQuote";

type FreightquoteCreds = Parameters<typeof freightquoteQuote>[0];
type GlobalTranzCreds = Parameters<typeof globaltranzQuote>[0];
type WorldwideExpressCreds = Parameters<typeof worldwideexpressQuote>[0];

export type ExistingCarrierCredentials = {
  liveProvider: string;
  ups: UpsCredentials | null;
  fedex: FedexCredentials | null;
  easypostApiKey: string | null;
  freightquote: FreightquoteCreds | null;
  globaltranz: GlobalTranzCreds | null;
  worldwideexpress: WorldwideExpressCreds | null;
};

export type ExistingCarrierQuoteInput = ExistingCarrierCredentials & {
  fromZip: string;
  toZip: string;
  freightClass: string;
  parcels: LiveParcel[];
  pallets: LivePallet[];
  fromAddress: LiveQuoteAddress | null;
  toAddress: LiveQuoteAddress | null;
};

const defaultDeps = {
  upsParcelQuote,
  fedexParcelQuote,
  easypostQuote,
  freightquoteQuote,
  globaltranzQuote,
  worldwideexpressQuote,
};

function optionFrom(result: { ok: boolean; amountCents: number; carrier?: string; service?: string; transitDays?: number; error?: string }): ProviderAttempt {
  if (!result.ok || result.amountCents < 0) {
    return { ok: false, code: "provider_error", error: result.error || "Carrier did not return a rate." };
  }
  return {
    ok: true,
    options: [{
      carrier: result.carrier ?? null,
      method: result.service || "Carrier rate",
      costCents: result.amountCents,
      transitDays: result.transitDays ?? null,
    }],
  };
}

export async function dispatchExistingCarrierQuote(
  input: ExistingCarrierQuoteInput,
  deps: Partial<typeof defaultDeps> = {},
): Promise<ProviderAttempt> {
  const call = { ...defaultDeps, ...deps };
  const provider = input.liveProvider.trim().toLowerCase();
  const ltlRequest: LiveQuoteRequest = {
    fromZip: input.fromZip,
    toZip: input.toZip,
    pallets: input.pallets,
    freightClass: input.freightClass,
    fromAddress: input.fromAddress ?? undefined,
    toAddress: input.toAddress ?? undefined,
  };

  if (provider === "ups") {
    if (!input.ups) return { ok: false, code: "not_configured", error: "UPS rating credentials are not saved in Operations." };
    if (!input.fromAddress || !input.toAddress) return { ok: false, code: "not_configured", error: "UPS rating needs a city and state for the origin and destination ZIPs." };
    return optionFrom(await call.upsParcelQuote(input.ups, {
      fromZip: input.fromZip,
      toZip: input.toZip,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      parcels: input.parcels,
    }));
  }
  if (provider === "fedex") {
    if (!input.fedex) return { ok: false, code: "not_configured", error: "FedEx rating credentials are not saved in Operations." };
    if (!input.fromAddress || !input.toAddress) return { ok: false, code: "not_configured", error: "FedEx rating needs a city and state for the origin and destination ZIPs." };
    return optionFrom(await call.fedexParcelQuote(input.fedex, {
      fromZip: input.fromZip,
      toZip: input.toZip,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      parcels: input.parcels,
    }));
  }
  if (provider === "easypost") {
    if (!input.easypostApiKey) return { ok: false, code: "not_configured", error: "EasyPost is not configured in Operations." };
    if (input.pallets.length === 0) return { ok: false, code: "no_rate", error: "Verified packages did not produce a pallet." };
    return optionFrom(await call.easypostQuote(input.easypostApiKey, ltlRequest));
  }
  if (provider === "freightquote") {
    if (!input.freightquote) return { ok: false, code: "not_configured", error: "Freightquote is not configured in Operations." };
    return optionFrom(await call.freightquoteQuote(input.freightquote, ltlRequest));
  }
  if (provider === "globaltranz") {
    if (!input.globaltranz) return { ok: false, code: "not_configured", error: "GlobalTranz is not configured in Operations." };
    return optionFrom(await call.globaltranzQuote(input.globaltranz, ltlRequest));
  }
  if (provider === "worldwideexpress") {
    if (!input.worldwideexpress) return { ok: false, code: "not_configured", error: "Worldwide Express is not configured in Operations." };
    return optionFrom(await call.worldwideexpressQuote(input.worldwideexpress, ltlRequest));
  }
  return {
    ok: false,
    code: "not_configured",
    error: "Operations is using estimator zones, not a live carrier. Supplier-verified packages stay on file for checkout.",
  };
}
