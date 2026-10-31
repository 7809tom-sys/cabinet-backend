/**
 * Admin preview for offline suppliers (distributors.isActive = false). Pure rules shared by the server and the client.
 * Applies to EVERY distributor: admins (role "admin") see offline suppliers marked "ADMIN PREVIEW — not live";
 * nobody else does; nothing from an offline supplier can be ordered or quoted.
 */

export const PREVIEW_BADGE_TEXT = "ADMIN PREVIEW — not live";
export const PREVIEW_ORDER_BLOCKED_MESSAGE =
  "Items from a supplier that is in admin preview can't be ordered or quoted yet. Remove them to continue.";
/** Bump when the Go live terms text changes; stored with each acceptance. */
export const GO_LIVE_TERMS_VERSION = "2026-10-31.1";

type Viewer = { role?: string | null } | null | undefined;

export function canSeePreviewSuppliers(user: Viewer): boolean {
  return user?.role === "admin";
}

/** A supplier is in preview exactly when it is offline. */
export function isPreviewSupplier(row: { isActive: boolean | null | undefined }): boolean {
  return row.isActive === false;
}

export type GoLiveTermsInput = {
  code: string;
  name: string;
  costMultiplier: string | number | null;
  baseMultiplier: string | number | null;
  freightMultiplier: string | number | null;
  retailPriceBasis: string | null;
  shippingRuleMode: string | null;
  warehouseZips: string[] | null;
  leadTimeDays: number | null;
  pendingSkuCount: number;
  doorStyleCount: number;
};

export type GoLiveTerms = {
  version: string;
  supplier: { code: string; name: string };
  lines: string[];
  warnings: string[];
  acceptance: string;
  facts: Record<string, unknown>;
};

const num = (value: string | number | null | undefined) => (value == null || value === "" ? null : Number(value));

/** The terms shown before Go live. Built from the supplier's saved configuration so the admin accepts what is actually configured. */
export function buildGoLiveTerms(input: GoLiveTermsInput): GoLiveTerms {
  const base = num(input.baseMultiplier);
  const freight = num(input.freightMultiplier);
  const cost = num(input.costMultiplier);
  const zips = (input.warehouseZips ?? []).filter(Boolean);
  const warnings: string[] = [];
  if (cost === 1 && base === 1 && (freight ?? 0) === 0) {
    warnings.push("Cost multipliers are 1.0000 / 1.0000 / 0.0000, which are the setup placeholders. Confirm they are your real cost terms.");
  }
  if (cost != null && base != null && freight != null && Math.abs(cost - base * (1 + freight)) > 0.0001) {
    warnings.push("Cost multiplier does not equal base multiplier × (1 + freight multiplier).");
  }
  if (zips.length === 0) warnings.push("No freight origin ZIPs are set; live freight quotes cannot pick a ship-from warehouse.");
  if (input.pendingSkuCount === 0) warnings.push("This supplier has no pending SKUs to publish.");
  const lines = [
    `Supplier: ${input.name} (${input.code}).`,
    `Our cost = supplier price × ${cost ?? "?"} (base ${base ?? "?"}, freight ${freight ?? "?"}).`,
    `Retail price basis: ${input.retailPriceBasis ?? "cost_plus_tier"}.`,
    `Freight: ${input.shippingRuleMode ?? "live"}; ship-from ZIPs: ${zips.length > 0 ? zips.join(", ") : "none set"}; nearest origin to the delivery ZIP is used by default.`,
    `Lead time: ${input.leadTimeDays ?? "not set"} days.`,
    `Going live publishes ${input.pendingSkuCount} pending SKU(s) and activates ${input.doorStyleCount} door style(s), and makes the supplier visible to customers.`,
  ];
  return {
    version: GO_LIVE_TERMS_VERSION,
    supplier: { code: input.code, name: input.name },
    lines,
    warnings,
    acceptance: "I accept these supplier terms and want this supplier live for customers.",
    facts: {
      costMultiplier: cost, baseMultiplier: base, freightMultiplier: freight, retailPriceBasis: input.retailPriceBasis,
      shippingRuleMode: input.shippingRuleMode, warehouseZips: zips, leadTimeDays: input.leadTimeDays,
      pendingSkuCount: input.pendingSkuCount, doorStyleCount: input.doorStyleCount,
    },
  };
}
