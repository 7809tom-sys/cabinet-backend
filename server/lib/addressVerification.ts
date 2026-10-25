import { makeRequest, type GeocodingResult } from "../_core/map";

export type AddressInput = {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
};

export type AddressVerification = {
  verified: boolean;
  /** "verified" = street-level match; "partial" = found but not exact; "unverified" = not found / service down */
  status: "verified" | "partial" | "unverified";
  formatted: string | null;
  normalized: { line1: string; city: string; state: string; zip: string } | null;
  reason: string | null;
};

const comp = (
  components: GeocodingResult["results"][number]["address_components"],
  type: string,
  short = false,
) => {
  const hit = components.find((c) => c.types.includes(type));
  return hit ? (short ? hit.short_name : hit.long_name) : "";
};

/** Format the entered address as one string for display and CRM storage. */
export function formatEnteredAddress(a: AddressInput): string {
  return [a.line1.trim(), a.line2?.trim(), `${a.city.trim()}, ${a.state.trim().toUpperCase()} ${a.zip.trim()}`]
    .filter(Boolean)
    .join(", ");
}

/**
 * Verify a US delivery address against Google geocoding. An address is only
 * "verified" when Google returns a street-level (non-partial) match whose state
 * and ZIP agree with what the customer typed. Never throws.
 */
export async function verifyUsAddress(input: AddressInput): Promise<AddressVerification> {
  const line1 = input.line1.trim();
  const city = input.city.trim();
  const state = input.state.trim().toUpperCase();
  const zip = input.zip.trim().slice(0, 5);
  if (!line1 || !city || state.length !== 2 || zip.length < 5) {
    return { verified: false, status: "unverified", formatted: null, normalized: null, reason: "Street, city, state and ZIP are all required." };
  }
  try {
    const res = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
      address: `${line1}, ${city}, ${state} ${zip}`,
      components: "country:US",
    });
    const top = res.results?.[0];
    if (res.status !== "OK" || !top) {
      return { verified: false, status: "unverified", formatted: null, normalized: null, reason: "We could not find that address. Check the street, city, state and ZIP." };
    }
    const c = top.address_components;
    const foundZip = comp(c, "postal_code");
    const foundState = comp(c, "administrative_area_level_1", true);
    const streetNumber = comp(c, "street_number");
    const route = comp(c, "route");
    const normalized = {
      line1: [streetNumber, route].filter(Boolean).join(" ") || line1,
      city: comp(c, "locality") || comp(c, "sublocality") || comp(c, "postal_town") || city,
      state: foundState || state,
      zip: foundZip || zip,
    };
    const base = { formatted: top.formatted_address, normalized };
    if (foundState && foundState !== state) {
      return { verified: false, status: "partial", ...base, reason: `That address is in ${foundState}, not ${state}.` };
    }
    if (foundZip && foundZip !== zip) {
      return { verified: false, status: "partial", ...base, reason: `The ZIP for that address is ${foundZip}, not ${zip}.` };
    }
    const streetLevel = Boolean(streetNumber && route) && !(top as { partial_match?: boolean }).partial_match;
    if (!streetLevel) {
      return { verified: false, status: "partial", ...base, reason: "We found the area but not that exact street address. Check the house number and street." };
    }
    return { verified: true, status: "verified", ...base, reason: null };
  } catch {
    return { verified: false, status: "unverified", formatted: null, normalized: null, reason: "Address verification is temporarily unavailable. You can still continue; we will confirm it before shipping." };
  }
}
