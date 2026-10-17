import { roundCents } from "./pricing";

export const HARDWARE_LINE_CODE = "HRDW";
export const HARDWARE_COMMISSION_RATE_BPS = 2500;

export type HardwareProfileFacts = {
  enabled: boolean;
  originZip: string | null;
  packageLengthIn: number | string | null;
  packageWidthIn: number | string | null;
  packageHeightIn: number | string | null;
  packageWeightLbs: number | string | null;
  maxUnitsPerPackage: number | null;
  standaloneShippingCents: number | null;
  sourceReference: string | null;
};

function positiveNumber(value: number | string | null | undefined): boolean {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

/** A hardware profile cannot become sellable until Operations has supplied every shipping fact. */
export function hardwareProfileIsComplete(profile: HardwareProfileFacts | null | undefined): boolean {
  if (!profile?.enabled) return false;
  return Boolean(
    /^\d{5}(?:-\d{4})?$/.test(profile.originZip?.trim() ?? "")
    && positiveNumber(profile.packageLengthIn)
    && positiveNumber(profile.packageWidthIn)
    && positiveNumber(profile.packageHeightIn)
    && positiveNumber(profile.packageWeightLbs)
    && Number.isInteger(profile.maxUnitsPerPackage)
    && (profile.maxUnitsPerPackage ?? 0) > 0
    && Number.isInteger(profile.standaloneShippingCents)
    && (profile.standaloneShippingCents ?? -1) >= 0
    && Boolean(profile.sourceReference?.trim()),
  );
}

/** Supplier list is the default retail price. An affiliate may add—not subtract—its own hardware markup. */
export function hardwareRetailCents(listPrice: number | string | null | undefined, affiliateMarkupBps = 0): number | null {
  const listCents = roundCents(Number(listPrice) * 100);
  if (!Number.isFinite(listCents) || listCents <= 0) return null;
  const markupBps = Number.isFinite(affiliateMarkupBps)
    ? Math.max(0, Math.round(affiliateMarkupBps))
    : 0;
  return roundCents(listCents * (1 + markupBps / 10000));
}

/** Hardware affiliate commission is exactly 25% of paid hardware merchandise, never shipping or tax. */
export function hardwareAffiliateCommissionCents(hardwareMerchandiseCents: number): number {
  return roundCents(Math.max(0, hardwareMerchandiseCents) * HARDWARE_COMMISSION_RATE_BPS / 10000);
}

export function hardwareCheckoutEligibility(input: {
  profile: HardwareProfileFacts | null | undefined;
  hardwareUnits: number;
  containsKitchenMerchandise: boolean;
}): {
  eligible: boolean;
  shippingCents: number | null;
  promotionApplied: boolean;
  reason: string | null;
} {
  const units = Math.max(0, Math.round(input.hardwareUnits));
  if (units === 0) return { eligible: false, shippingCents: null, promotionApplied: false, reason: "Add hardware before requesting a hardware shipping quote." };
  if (!hardwareProfileIsComplete(input.profile)) {
    return { eligible: false, shippingCents: null, promotionApplied: false, reason: "Hardware checkout is not available until Operations verifies the Hardware Resources origin, consolidated package, package limit, and standalone shipping rate." };
  }
  if (units > (input.profile!.maxUnitsPerPackage ?? 0)) {
    return { eligible: false, shippingCents: null, promotionApplied: false, reason: `This order has ${units} hardware items and exceeds the verified one-package limit of ${input.profile!.maxUnitsPerPackage}.` };
  }
  if (input.containsKitchenMerchandise) {
    return { eligible: true, shippingCents: 0, promotionApplied: true, reason: "Free hardware shipping is applied because this hardware is ordered with kitchen merchandise." };
  }
  return { eligible: true, shippingCents: input.profile!.standaloneShippingCents ?? null, promotionApplied: false, reason: null };
}
