/**
 * Carrier-backed U.S. parcel eligibility rules.
 *
 * This module only answers whether an item has authoritative package data that
 * fits a carrier's published parcel envelope. It does not invent a shipping
 * price, guarantee carrier acceptance, or replace a live carrier quote.
 *
 * Sources checked 2026-09-23:
 * - UPS: 150 lb, 108 in maximum length, 165 in length + girth.
 * - FedEx Ground/Home Delivery: 150 lb, 108 in maximum length,
 *   165 in length + girth.
 * - USPS Ground Advantage: 70 lb, 130 in maximum length + girth; parcels
 *   above 108 in length + girth are oversized and must be live-rated.
 *
 * Carrier rules can change. The final allowed service and price always come
 * from the carrier response; these checks simply prevent an LTL-only cabinet
 * from being offered as an ordinary parcel shipment.
 */

export type ParcelCarrier = "ups" | "fedex" | "usps";

export interface AuthoritativeParcelPackage {
  /** Source package dimensions, in inches. These must be carton dimensions. */
  lengthIn: number | null | undefined;
  widthIn: number | null | undefined;
  heightIn: number | null | undefined;
  /** Source packaged weight, in pounds. */
  weightLbs: number | null | undefined;
  /** A missing catalog package record must never become a made-up parcel. */
  hasAuthoritativePackage: boolean;
  /** Optional label used only in customer/admin explanations. */
  label?: string | null;
}

export interface NormalizedParcelPackage {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLbs: number;
  lengthPlusGirthIn: number;
  cubicIn: number;
  /** USPS Ground Advantage permits 108–130 in, but classifies it as oversized. */
  uspsOversized: boolean;
}

export interface CarrierParcelEligibility {
  carrier: ParcelCarrier;
  eligible: boolean;
  reasons: string[];
  /** Rating and packing review flags. These never override a live carrier response. */
  operationalWarnings: string[];
  serviceHint: string;
}

export interface ParcelEligibilityResult {
  package: NormalizedParcelPackage | null;
  carriers: CarrierParcelEligibility[];
  eligibleCarriers: ParcelCarrier[];
  requiresFreight: boolean;
  reasons: string[];
  /** Applicable handling and oversize review flags for the verified carton. */
  operationalWarnings: string[];
}

export interface ParcelShipmentModeResult {
  mode: "parcel" | "freight";
  eligibleCarriers: ParcelCarrier[];
  packageResults: ParcelEligibilityResult[];
  reasons: string[];
  operationalWarnings: string[];
}

export const PARCEL_CARRIER_LIMITS: Readonly<Record<ParcelCarrier, {
  maxWeightLbs: number;
  maxLengthIn: number | null;
  maxLengthPlusGirthIn: number;
  serviceHint: string;
}>> = {
  ups: {
    maxWeightLbs: 150,
    maxLengthIn: 108,
    maxLengthPlusGirthIn: 165,
    serviceHint: "UPS parcel service",
  },
  fedex: {
    maxWeightLbs: 150,
    maxLengthIn: 108,
    maxLengthPlusGirthIn: 165,
    serviceHint: "FedEx Ground/Home Delivery",
  },
  usps: {
    maxWeightLbs: 70,
    maxLengthIn: null,
    maxLengthPlusGirthIn: 130,
    serviceHint: "USPS Ground Advantage",
  },
} as const;

function positiveFinite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Carrier dimensions use the longest side as length. Each measurement is
 * conservatively rounded up to a whole inch before an eligibility decision,
 * matching UPS's published measurement convention and avoiding under-rating.
 */
export function normalizeParcelPackage(input: AuthoritativeParcelPackage): {
  package: NormalizedParcelPackage | null;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!input.hasAuthoritativePackage) {
    reasons.push("Authoritative carton dimensions and packaged weight are required for parcel shipping.");
    return { package: null, reasons };
  }

  const raw = [positiveFinite(input.lengthIn), positiveFinite(input.widthIn), positiveFinite(input.heightIn)];
  const weight = positiveFinite(input.weightLbs);
  if (raw.some((value) => value == null)) {
    reasons.push("Complete carton length, width, and height are required for parcel shipping.");
  }
  if (weight == null) {
    reasons.push("A positive packaged weight is required for parcel shipping.");
  }
  if (reasons.length > 0 || weight == null || raw.some((value) => value == null)) {
    return { package: null, reasons };
  }

  const [lengthIn, widthIn, heightIn] = (raw as number[])
    .map((value) => Math.ceil(value))
    .sort((a, b) => b - a);
  const roundedWeight = Math.ceil(weight);
  const lengthPlusGirthIn = lengthIn + (2 * widthIn) + (2 * heightIn);
  return {
    package: {
      lengthIn,
      widthIn,
      heightIn,
      weightLbs: roundedWeight,
      lengthPlusGirthIn,
      cubicIn: lengthIn * widthIn * heightIn,
      uspsOversized: lengthPlusGirthIn > 108,
    },
    reasons,
  };
}

export function carrierParcelEligibility(
  carrier: ParcelCarrier,
  parcel: NormalizedParcelPackage | null,
  inputReasons: string[] = [],
): CarrierParcelEligibility {
  const limits = PARCEL_CARRIER_LIMITS[carrier];
  const reasons = [...inputReasons];
  const operationalWarnings: string[] = [];
  if (!parcel) {
    return { carrier, eligible: false, reasons, operationalWarnings, serviceHint: limits.serviceHint };
  }

  if (parcel.weightLbs > limits.maxWeightLbs) {
    reasons.push(`${carrier.toUpperCase()} accepts up to ${limits.maxWeightLbs} lb per parcel; this carton is ${parcel.weightLbs} lb.`);
  }
  if (limits.maxLengthIn != null && parcel.lengthIn > limits.maxLengthIn) {
    reasons.push(`${carrier.toUpperCase()} maximum parcel length is ${limits.maxLengthIn} in; this carton is ${parcel.lengthIn} in long.`);
  }
  if (parcel.lengthPlusGirthIn > limits.maxLengthPlusGirthIn) {
    reasons.push(`${carrier.toUpperCase()} maximum length plus girth is ${limits.maxLengthPlusGirthIn} in; this carton is ${parcel.lengthPlusGirthIn} in.`);
  }

  // The following thresholds can add carrier handling or oversize charges, but
  // are not hard parcel rejections. The carrier's returned rate remains final.
  const carrierLabel = carrier === "fedex" ? "FedEx" : "UPS";
  if (carrier === "ups" || carrier === "fedex") {
    const handlingTriggers: string[] = [];
    if (parcel.weightLbs > 50) handlingTriggers.push(`${parcel.weightLbs} lb packaged weight exceeds 50 lb`);
    if (parcel.lengthIn > 48) handlingTriggers.push(`${parcel.lengthIn} in length exceeds 48 in`);
    if (parcel.widthIn > 30) handlingTriggers.push(`${parcel.widthIn} in second-longest side exceeds 30 in`);
    if (parcel.lengthPlusGirthIn > 105) handlingTriggers.push(`${parcel.lengthPlusGirthIn} in length plus girth exceeds 105 in`);
    if (parcel.cubicIn > 10368) handlingTriggers.push(`${parcel.cubicIn} cubic in exceeds 10,368 cubic in`);
    if (handlingTriggers.length > 0) {
      operationalWarnings.push(`${carrierLabel} Additional Handling may apply: ${handlingTriggers.join("; ")}.`);
    }

    const oversizeTriggers: string[] = [];
    if (parcel.weightLbs > 110) oversizeTriggers.push(`${parcel.weightLbs} lb packaged weight exceeds 110 lb`);
    if (parcel.lengthIn > 96) oversizeTriggers.push(`${parcel.lengthIn} in length exceeds 96 in`);
    if (parcel.lengthPlusGirthIn > 130) oversizeTriggers.push(`${parcel.lengthPlusGirthIn} in length plus girth exceeds 130 in`);
    if (parcel.cubicIn > 17280) oversizeTriggers.push(`${parcel.cubicIn} cubic in exceeds 17,280 cubic in`);
    if (oversizeTriggers.length > 0) {
      operationalWarnings.push(`${carrierLabel} Oversize / Large Package review is required: ${oversizeTriggers.join("; ")}.`);
    }

    if (carrier === "ups" && parcel.weightLbs > 70) {
      operationalWarnings.push("UPS requires a heavy-package label for a carton over 70 lb.");
    }
  }

  return {
    carrier,
    eligible: reasons.length === 0,
    reasons,
    operationalWarnings,
    serviceHint: limits.serviceHint,
  };
}

/** Evaluate one cabinet carton against UPS, FedEx, and USPS parcel envelopes. */
export function evaluateParcelEligibility(input: AuthoritativeParcelPackage): ParcelEligibilityResult {
  const normalized = normalizeParcelPackage(input);
  const carriers = (Object.keys(PARCEL_CARRIER_LIMITS) as ParcelCarrier[])
    .map((carrier) => carrierParcelEligibility(carrier, normalized.package, normalized.reasons));
  const eligibleCarriers = carriers.filter((carrier) => carrier.eligible).map((carrier) => carrier.carrier);
  return {
    package: normalized.package,
    carriers,
    eligibleCarriers,
    requiresFreight: eligibleCarriers.length === 0,
    reasons: normalized.reasons,
    operationalWarnings: Array.from(new Set(carriers.flatMap((carrier) => carrier.operationalWarnings))),
  };
}

/**
 * A shipment group can use a parcel carrier only when every carton has verified
 * package data and at least one carrier can accept every carton. Mixed parcel /
 * freight groups stay freight-only until a split-shipment order flow is added.
 */
export function resolveParcelShipmentMode(
  packages: AuthoritativeParcelPackage[],
): ParcelShipmentModeResult {
  const packageResults = packages.map(evaluateParcelEligibility);
  if (packageResults.length === 0) {
    return {
      mode: "freight",
      eligibleCarriers: [],
      packageResults,
      reasons: ["Add a carton with verified package data to evaluate parcel shipping."],
      operationalWarnings: [],
    };
  }

  const eligibleCarriers = (Object.keys(PARCEL_CARRIER_LIMITS) as ParcelCarrier[]).filter((carrier) =>
    packageResults.every((result) => result.eligibleCarriers.includes(carrier)),
  );
  const reasons = packageResults.flatMap((result) => result.reasons);
  return {
    mode: eligibleCarriers.length > 0 ? "parcel" : "freight",
    eligibleCarriers,
    packageResults,
    reasons: Array.from(new Set(reasons)),
    operationalWarnings: Array.from(new Set(packageResults.flatMap((result) => result.operationalWarnings))),
  };
}
