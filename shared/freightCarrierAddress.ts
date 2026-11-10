/**
 * City and state for a live carrier rate request.
 *
 * Worldwide Express and direct UPS both refuse a quote when either side is
 * only a ZIP. Checkout already has the shopper's city and state. Origins are
 * stored as a ZIP, sometimes with a warehouse street address, and never as
 * their own city and state columns. Google ZIP geocoding is the last resort
 * because that lookup currently returns no locality.
 */

export type CarrierLocality = {
  locality: string;
  region: string;
  countryCode: "US";
  addressLineList?: string[];
};

const STATE_NAME_TO_CODE: Readonly<Record<string, string>> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

const STATE_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

/**
 * USPS primary city for an origin ZIP that this codebase already names, plus
 * the live Worldwide Express origin that Google did not resolve (60448).
 *
 * A distributor warehouse address that contains the same ZIP is preferred.
 * These rows exist so a missing Google result still sends city and state.
 * They are the postal city for the ZIP, not a guessed street address.
 *
 * - 60448 Monee, IL — production origin on the failed live rate request.
 * - 30071 Norcross, GA — U.S. Cabinet Depot Atlanta warehouse
 *   (`scripts/configure-aef-atlanta-fulfillment.ts`).
 * - 33760 Clearwater, FL — Pelican pickup origin (`PELICAN_COMPARISON_ORIGIN`).
 * - 32256 Jacksonville, FL; 78754 Austin, TX; 37086 La Vergne, TN;
 *   70126 New Orleans, LA; 32822 Orlando, FL; 33634 Tampa, FL —
 *   DL Cabinetry candidate origins (`data/distributors/dl-cabinetry/README.md`).
 */
export const KNOWN_FREIGHT_ORIGIN_LOCALITIES: Readonly<Record<string, { locality: string; region: string }>> = {
  "60448": { locality: "Monee", region: "IL" },
  "30071": { locality: "Norcross", region: "GA" },
  "33760": { locality: "Clearwater", region: "FL" },
  "32256": { locality: "Jacksonville", region: "FL" },
  "78754": { locality: "Austin", region: "TX" },
  "37086": { locality: "La Vergne", region: "TN" },
  "70126": { locality: "New Orleans", region: "LA" },
  "32822": { locality: "Orlando", region: "FL" },
  "33634": { locality: "Tampa", region: "FL" },
};

export function usStateCode(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().replace(/\./g, "").replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const code = trimmed.toUpperCase();
    return STATE_CODES.has(code) ? code : null;
  }
  return STATE_NAME_TO_CODE[trimmed.toLowerCase()] ?? null;
}

export function carrierAddressFromCityState(input: {
  city?: string | null;
  state?: string | null;
  addressLines?: Array<string | null | undefined>;
}): CarrierLocality | null {
  const locality = (input.city ?? "").trim().replace(/\s+/g, " ");
  const region = usStateCode(input.state);
  if (locality.length < 2 || !region) return null;
  const addressLineList = (input.addressLines ?? [])
    .map((line) => (line ?? "").trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0)
    .slice(0, 3);
  return {
    locality,
    region,
    countryCode: "US",
    ...(addressLineList.length > 0 ? { addressLineList } : {}),
  };
}

/** Shopper city and state from checkout. Street lines are included when present. */
export function shopperCarrierAddress(address: {
  city?: string | null;
  state?: string | null;
  line1?: string | null;
  line2?: string | null;
} | null | undefined): CarrierLocality | null {
  if (!address) return null;
  return carrierAddressFromCityState({
    city: address.city,
    state: address.state,
    addressLines: [address.line1, address.line2],
  });
}

function zip5(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, 5);
  return digits.length === 5 ? digits : null;
}

/**
 * Read city and state from a warehouse or pickup address.
 * A ZIP in the text must be this origin. A different warehouse ZIP is ignored.
 */
export function parseStoredOriginAddress(text: string | null | undefined, zip: string): CarrierLocality | null {
  const originZip = zip5(zip);
  if (!originZip) return null;
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const zips = Array.from(cleaned.matchAll(/\b(\d{5})(?:-\d{4})?\b/g), (match) => match[1]);
  if (zips.length > 0 && !zips.includes(originZip)) return null;
  const withoutZip = cleaned
    .replace(/\b\d{5}(?:-\d{4})?\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[,\s]+$/g, "")
    .trim();
  const match = withoutZip.match(/^(?:(.*),\s*)?([^,]+),\s*([A-Za-z][A-Za-z .]*)$/);
  if (!match) return null;
  const street = (match[1] ?? "").replace(/,\s*$/g, "").trim();
  return carrierAddressFromCityState({
    city: match[2],
    state: match[3],
    addressLines: street ? [street] : [],
  });
}

export function knownOriginLocality(zip: string): CarrierLocality | null {
  const code = zip5(zip);
  if (!code) return null;
  const known = KNOWN_FREIGHT_ORIGIN_LOCALITIES[code];
  if (!known) return null;
  return { locality: known.locality, region: known.region, countryCode: "US" };
}

/** Stored warehouse city/state for this ZIP, then the documented origin map. */
export function resolveOriginLocality(input: {
  zip: string;
  warehouseAddress?: string | null;
  pickupAddress?: string | null;
  placeLabel?: string | null;
}): CarrierLocality | null {
  const zip = zip5(input.zip);
  if (!zip) return null;
  for (const text of [input.warehouseAddress, input.pickupAddress, input.placeLabel]) {
    const parsed = parseStoredOriginAddress(text, zip);
    if (parsed) return parsed;
  }
  return knownOriginLocality(zip);
}
