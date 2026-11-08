/**
 * Starting markup for every newly created affiliate, in basis points:
 * 4000 bps = 40%, applied to everything, decorative hardware included.
 * An affiliate may still change it from their own pricing panel.
 */
export const DEFAULT_AFFILIATE_MARKUP_BPS = 4000;

export const REAVES_WAY_AFFILIATE_BLUEPRINT = {
  template: "showcase" as const,
  primaryColor: "#1ceb31",
  accentColor: "#0000ff",
  buttonRadius: "9999px",
  defaultMarkupBps: DEFAULT_AFFILIATE_MARKUP_BPS,
  hardwareMarkupBps: DEFAULT_AFFILIATE_MARKUP_BPS,
} as const;

/**
 * Future affiliates inherit Reaves Way's approved storefront structure and
 * commercial defaults. Store-specific identity (name, slug, logo, contact and
 * copy) is intentionally supplied separately rather than copied from Reaves.
 */
export function reavesWayAffiliateDefaults() {
  return { ...REAVES_WAY_AFFILIATE_BLUEPRINT };
}

/**
 * The markup pair every affiliate-creation path must write. Returned as a
 * spreadable object so a new store can never be created with only one of the
 * two markups set: cabinets and decorative hardware both start at 40%, which
 * is what the blueprint's 40% "on everything" rule means in practice.
 */
export function affiliateStartingMarkup() {
  return {
    defaultMarkupBps: DEFAULT_AFFILIATE_MARKUP_BPS,
    hardwareMarkupBps: DEFAULT_AFFILIATE_MARKUP_BPS,
  };
}
