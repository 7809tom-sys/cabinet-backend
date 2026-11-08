// Shared, DB-free rules for the affiliate's self-serve storefront name: the
// website name an affiliate types in the last onboarding step, which becomes
// the public path /store/<slug>.
//
// The slug is produced with the same slugify() the admin create form uses, so a
// self-serve claim and an admin-created store can never disagree about what a
// given name turns into. The reserved list below is the one protection both
// paths share: a slug that already means a platform route (or a platform host)
// would produce a storefront nobody can reach, so it is refused everywhere.
import { slugify } from "./affiliate";

/** Shortest usable storefront name. Two letters leaves no room for a real brand. */
export const STOREFRONT_NAME_MIN_LENGTH = 3;

/** Longest name. Matches affiliates.slug varchar(64). */
export const STOREFRONT_NAME_MAX_LENGTH = 64;

/**
 * Slugs that already belong to the platform. These are the first path segment of
 * every top-level client route plus the platform hostnames, so a store at one of
 * them would be shadowed by the real page (or the reverse). Every entry is what
 * slugify() would produce, so "Sign In" and "signin" are both covered.
 */
export const RESERVED_STOREFRONT_SLUGS: ReadonlySet<string> = new Set([
  // Platform hosts and infrastructure.
  "www",
  "api",
  "app",
  "assets",
  "static",
  "cdn",
  "mail",
  "smtp",
  "status",
  "health",
  "owner",
  "support",
  "help",
  "docs",
  "blog",
  // Account and access routes.
  "admin",
  "affiliate",
  "affiliates",
  "contractor",
  "vendor",
  "vendors",
  "distributor",
  "distributors",
  "portal",
  "login",
  "log-in",
  "logout",
  "log-out",
  "signin",
  "sign-in",
  "signup",
  "sign-up",
  "register",
  "account",
  "my-account",
  "password",
  "reset",
  "reset-password",
  // Shopping and storefront routes.
  "store",
  "store-preview",
  "catalog",
  "cart",
  "checkout",
  "order",
  "orders",
  "bulk-order",
  "hardware",
  "styles",
  "family",
  "design",
  "designer",
  "designer-guide",
  "design-surfaces",
  "closet",
  "kitchens",
  "bundles",
  "surfaces",
  "countertops",
  "measure",
  "room-layouts",
  "installation-estimate",
  "kitchen-planning",
  "plan-sheet",
  "photo-to-cart",
  "fixture-photo",
  "price-shop",
  "3d",
  "3-d",
  "pro-network",
  "become-a-vendor",
  "dev",
  "preview",
  // House brands and internal demo stores.
  "cabinetdealz",
  "cabinet-dealz",
  "stonecreek",
  "plumbers-choice",
  "sales-demo",
  "demo",
  "test",
  // Informational and legal pages.
  "about",
  "contact",
  "privacy",
  "privacy-policy",
  "terms",
  "return-policy",
  "shipping-policy",
  "legal",
]);

export type StorefrontNameProblem = "empty" | "too_short" | "too_long" | "reserved" | "invalid";

export type StorefrontNameCheck =
  | { ok: true; slug: string; message: null }
  | { ok: false; slug: string; problem: StorefrontNameProblem; message: string };

/** Normalize any candidate to the exact slug shape affiliates.slug stores. */
export function storefrontSlugFromName(raw: string): string {
  // slugify() caps at 64. A cut in the middle of a hyphen run can leave a
  // trailing hyphen, which is not a valid slug end, so strip it once more.
  return slugify(raw).replace(/-+$/, "");
}

/**
 * The slug without slugify()'s 64-character cap. slugify() truncates silently,
 * which would let two long names collide on one claimed slug, so the length
 * rule below is applied to this value and the truncation never decides.
 */
function untruncatedSlug(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isReservedStorefrontSlug(slug: string): boolean {
  return RESERVED_STOREFRONT_SLUGS.has((slug || "").trim().toLowerCase());
}

/** The public path a claimed name publishes, e.g. "/store/oak-and-iron". */
export function storefrontPath(slug: string): string {
  return `/store/${slug}`;
}

function nameProblemMessage(problem: StorefrontNameProblem, slug: string): string {
  switch (problem) {
    case "empty":
      return "Enter a website name.";
    case "too_short":
      return `Use at least ${STOREFRONT_NAME_MIN_LENGTH} letters or numbers, like "oak-and-iron".`;
    case "too_long":
      return `Keep the website name to ${STOREFRONT_NAME_MAX_LENGTH} characters or fewer.`;
    case "reserved":
      return `"${slug}" is reserved by Cabinet Dealz. Choose a different website name.`;
    case "invalid":
      return "Use letters and numbers only, with hyphens between words.";
  }
}

/**
 * Validate a typed website name and return the slug it would claim.
 *
 * A failure is not an exception: the check endpoint and the claim endpoint both
 * need the same message, so the rule lives here once.
 */
export function checkStorefrontName(raw: string): StorefrontNameCheck {
  const full = untruncatedSlug(raw);
  if (!full) return { ok: false, slug: "", problem: "empty", message: nameProblemMessage("empty", "") };
  if (isReservedStorefrontSlug(full)) {
    return { ok: false, slug: full, problem: "reserved", message: nameProblemMessage("reserved", full) };
  }
  if (full.length < STOREFRONT_NAME_MIN_LENGTH) {
    return { ok: false, slug: full, problem: "too_short", message: nameProblemMessage("too_short", full) };
  }
  // Length is decided BEFORE slugify() runs. slugify() caps at 64, so checking
  // the capped value would accept a longer name and then silently claim the
  // truncated slug it happens to share with another store.
  if (full.length > STOREFRONT_NAME_MAX_LENGTH) {
    return { ok: false, slug: full.slice(0, STOREFRONT_NAME_MAX_LENGTH), problem: "too_long", message: nameProblemMessage("too_long", full) };
  }
  const slug = storefrontSlugFromName(full);
  // The hyphen rules above already guarantee the shape; this stays as a guard in
  // case slugify()'s normalization ever changes.
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return { ok: false, slug, problem: "invalid", message: nameProblemMessage("invalid", slug) };
  }
  return { ok: true, slug, message: null };
}
