// ─── Cabinet Dealz tiered pricing + fee engine ──────────────────────────────
// Pure, deterministic money math for the platform's price ladder and order fee
// stack. No I/O, no dates — fully unit-testable. All money is whole CENTS to
// avoid float drift; all percentages are stored as BASIS POINTS (bps) so 5% =
// 500 bps and 0.5% is representable.
//
// Price ladder (per cabinet line, derived from internal base cost):
//   base cost (internal)
//     → Wholesale  = base × (1 + wholesaleMarkupBps)
//     → Affiliate  = wholesale × (1 + affiliateMarkupBps)   (~5%)
//     → Suggested Retail = affiliate × (1 + retailMarkupBps) (customer fallback)
//
// Order fee stack (on the cabinet subtotal unless noted):
//   • Damage fee  — damageFeeBps of cabinet subtotal, EVERY order, all tiers
//   • Tech fee    — techFeeBps of cabinet subtotal, CAPPED at techFeeCapCents
//                   *** AFFILIATE ORDERS ONLY — waived for direct contractor/wholesale/homeowner ***
//   • Card fee    — cardFeeBps of the FINAL total (cabinets+freight+damage+tech),
//                   CARD payments only; ACH/bank transfer waives it
//
// Defaults encode the owner's spec: affiliate 5%, damage 1%, tech 10% cap $100,
// card 4%.

export const BPS_DIVISOR = 10000;

/** Round to the nearest whole cent (half-up on .5). */
export function roundCents(n: number): number {
  return Math.round(n);
}

/** Apply a basis-points markup to a cents amount, returning whole cents. */
export function applyBps(amountCents: number, bps: number): number {
  return roundCents((amountCents * bps) / BPS_DIVISOR);
}

// ─── Platform pricing settings ───────────────────────────────────────────────
// One row in the DB drives the whole ladder + fee stack. Defaults below are the
// owner's stated spec and are also used when the row is missing.
export interface PlatformPricingSettings {
  /** Internal base cost → wholesale markup. */
  wholesaleMarkupBps: number;
  /** Wholesale → affiliate markup (default ~5%). */
  affiliateMarkupBps: number;
  /** Affiliate → suggested retail markup (customer-facing fallback). */
  retailMarkupBps: number;
  /** Damage coverage fee on cabinet subtotal — every order, all tiers. */
  damageFeeBps: number;
  /** Technology fee on cabinet subtotal. */
  techFeeBps: number;
  /** Hard cap on the tech fee, in cents. */
  techFeeCapCents: number;
  /** Card processing fee on the final total — card payments only. */
  cardFeeBps: number;
}

export const DEFAULT_PRICING_SETTINGS: PlatformPricingSettings = {
  wholesaleMarkupBps: 1500, // 15% (illustrative; admin-editable)
  affiliateMarkupBps: 500, //  5%
  retailMarkupBps: 2500, // 25% (illustrative; admin-editable)
  damageFeeBps: 100, //  1%
  techFeeBps: 1000, // 10%
  techFeeCapCents: 10000, // $100.00
  cardFeeBps: 400, //  4%
};

/**
 * Clamp/normalize a partial settings object (e.g. a DB row with nullable cols)
 * into a complete settings object, falling back to defaults for any missing or
 * invalid (negative / non-finite) field.
 */
export function normalizePricingSettings(
  partial: Partial<Record<keyof PlatformPricingSettings, number | null | undefined>> | null | undefined,
): PlatformPricingSettings {
  const pick = (v: number | null | undefined, dflt: number): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : dflt;
  const p = partial ?? {};
  return {
    wholesaleMarkupBps: pick(p.wholesaleMarkupBps, DEFAULT_PRICING_SETTINGS.wholesaleMarkupBps),
    affiliateMarkupBps: pick(p.affiliateMarkupBps, DEFAULT_PRICING_SETTINGS.affiliateMarkupBps),
    retailMarkupBps: pick(p.retailMarkupBps, DEFAULT_PRICING_SETTINGS.retailMarkupBps),
    damageFeeBps: pick(p.damageFeeBps, DEFAULT_PRICING_SETTINGS.damageFeeBps),
    techFeeBps: pick(p.techFeeBps, DEFAULT_PRICING_SETTINGS.techFeeBps),
    techFeeCapCents: pick(p.techFeeCapCents, DEFAULT_PRICING_SETTINGS.techFeeCapCents),
    cardFeeBps: pick(p.cardFeeBps, DEFAULT_PRICING_SETTINGS.cardFeeBps),
  };
}

// ─── Price ladder ────────────────────────────────────────────────────────────
export interface PriceLadder {
  /** Internal base cost (what the platform pays). */
  baseCostCents: number;
  /** base × (1 + wholesale%). */
  wholesaleCents: number;
  /** wholesale × (1 + affiliate%) — what an affiliate pays. */
  affiliateCents: number;
  /** affiliate × (1 + retail%) — customer-facing suggested retail. */
  suggestedRetailCents: number;
}

/**
 * Derive the full price ladder for a single cabinet line from its internal base
 * cost. Each rung compounds on the previous one (markup-on-markup), matching how
 * the supply chain actually stacks margin.
 */
export function priceLadder(
  baseCostCents: number,
  settings: PlatformPricingSettings = DEFAULT_PRICING_SETTINGS,
): PriceLadder {
  const base = Math.max(0, roundCents(baseCostCents));
  const wholesale = base + applyBps(base, settings.wholesaleMarkupBps);
  const affiliate = wholesale + applyBps(wholesale, settings.affiliateMarkupBps);
  const suggestedRetail = affiliate + applyBps(affiliate, settings.retailMarkupBps);
  return {
    baseCostCents: base,
    wholesaleCents: wholesale,
    affiliateCents: affiliate,
    suggestedRetailCents: suggestedRetail,
  };
}

// ─── Order fee stack ─────────────────────────────────────────────────────────
export type PaymentMethod = "card" | "ach";

export interface FeeStackInput {
  /** Cabinet merchandise subtotal in cents (drives damage + tech fees). */
  cabinetSubtotalCents: number;
  /** Freight in cents (part of the final total but not the fee base). */
  freightCents?: number;
  /** "card" adds the card fee; "ach" (bank transfer) waives it. */
  paymentMethod: PaymentMethod;
  /** Only matters for ACH: an unapproved ACH still pays the card fee until the
   *  admin approves the transfer. Defaults to true (approved) for card. */
  achApproved?: boolean;
  /**
   * Tech fee (10%, capped at $100) is charged ONLY on affiliate-referred orders.
   * Direct contractor / wholesale / homeowner orders are exempt.
   * Defaults to false (no tech fee) when omitted.
   */
  isAffiliateOrder?: boolean;
}

export interface FeeStack {
  cabinetSubtotalCents: number;
  freightCents: number;
  /** 1% of cabinet subtotal (all orders). */
  damageFeeCents: number;
  /** 10% of cabinet subtotal, capped at $100. Affiliate orders only — 0 for direct orders. */
  techFeeCents: number;
  /** True when the cap clipped the tech fee. */
  techFeeCapped: boolean;
  /** Subtotal before the card fee: cabinets + freight + damage + tech. */
  preCardTotalCents: number;
  /** 4% of the pre-card total, or 0 for approved ACH. */
  cardFeeCents: number;
  /** Final amount the customer pays. */
  totalCents: number;
}

/**
 * Compute the full deterministic fee stack for an order. The card fee applies to
 * the FINAL pre-card total (cabinets + freight + damage + tech). An ACH transfer
 * that has been approved through the system waives the card fee; an unapproved
 * ACH (or any card payment) still pays it.
 */
export function computeFeeStack(
  input: FeeStackInput,
  settings: PlatformPricingSettings = DEFAULT_PRICING_SETTINGS,
): FeeStack {
  const cabinetSubtotalCents = Math.max(0, roundCents(input.cabinetSubtotalCents));
  const freightCents = Math.max(0, roundCents(input.freightCents ?? 0));

  // Damage fee — every order, all tiers, on the cabinet subtotal.
  const damageFeeCents = applyBps(cabinetSubtotalCents, settings.damageFeeBps);

  // Tech fee — affiliate orders ONLY. Direct contractor/wholesale/homeowner orders are exempt.
  const techFeeRaw = input.isAffiliateOrder
    ? applyBps(cabinetSubtotalCents, settings.techFeeBps)
    : 0;
  const techFeeCapped = !!(input.isAffiliateOrder && settings.techFeeCapCents > 0 && techFeeRaw > settings.techFeeCapCents);
  const techFeeCents = techFeeCapped ? settings.techFeeCapCents : techFeeRaw;

  const preCardTotalCents = cabinetSubtotalCents + freightCents + damageFeeCents + techFeeCents;

  // Card fee — only on card payments (or unapproved ACH). Approved ACH waives it.
  const achWaives = input.paymentMethod === "ach" && (input.achApproved ?? false);
  const cardFeeCents = achWaives ? 0 : applyBps(preCardTotalCents, settings.cardFeeBps);

  return {
    cabinetSubtotalCents,
    freightCents,
    damageFeeCents,
    techFeeCents,
    techFeeCapped,
    preCardTotalCents,
    cardFeeCents,
    totalCents: preCardTotalCents + cardFeeCents,
  };
}

/** Human label for a payment method. */
export function paymentMethodLabel(m: PaymentMethod): string {
  return m === "ach" ? "Bank transfer (ACH)" : "Credit / debit card";
}

/** Format whole cents as a $ string, e.g. 12345 → "$123.45". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(roundCents(cents));
  return `${sign}$${(abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
