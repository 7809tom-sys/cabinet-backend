// Shared helpers for the customer-facing Pelican "Surfaces & Fixtures" storefront.
// Keep category <-> slug mapping and presentation in one place so the landing
// page, category page, and design-tool panel stay consistent.

export type PelicanCategory =
  | "Sinks & Faucets"
  | "Flooring"
  | "Shower & Bath"
  | "Toilets & Bidets"
  | "Tile & Mosaic"
  | "Quartz Slabs (Countertops)";

// Categories we surface to shoppers, in display order. (Samples / Marketing are
// intentionally excluded from the storefront.)
export const PELICAN_STOREFRONT_CATEGORIES: PelicanCategory[] = [
  "Quartz Slabs (Countertops)",
  "Flooring",
  "Tile & Mosaic",
  "Sinks & Faucets",
  "Shower & Bath",
  "Toilets & Bidets",
];

const SLUGS: Record<string, string> = {
  "Sinks & Faucets": "sinks-faucets",
  Flooring: "flooring",
  "Shower & Bath": "shower-bath",
  "Toilets & Bidets": "toilets-bidets",
  "Tile & Mosaic": "tile-mosaic",
  "Quartz Slabs (Countertops)": "quartz",
};

const SLUG_TO_CATEGORY: Record<string, PelicanCategory> = Object.fromEntries(
  Object.entries(SLUGS).map(([cat, slug]) => [slug, cat as PelicanCategory])
) as Record<string, PelicanCategory>;

export function categorySlug(category: string): string {
  return SLUGS[category] ?? category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function categoryFromSlug(slug: string): PelicanCategory | null {
  return SLUG_TO_CATEGORY[slug] ?? null;
}

// Short marketing blurb per category for the landing hero + cards.
export const CATEGORY_BLURB: Record<string, string> = {
  "Quartz Slabs (Countertops)":
    "Durable, low-maintenance quartz surfaces for countertops and vanities.",
  Flooring: "Waterproof LVP, tile-look, and hardwood-alternative flooring.",
  "Tile & Mosaic": "Backsplash, floor, and accent tile in porcelain, ceramic, and mosaic.",
  "Sinks & Faucets": "Kitchen and bath sinks, faucets, and finishing hardware.",
  "Shower & Bath": "Shower systems, tubs, glass, and bath fixtures.",
  "Toilets & Bidets": "Modern toilets, smart bidets, and water-efficient fixtures.",
};

// A gradient per category used as an image fallback so the grid never shows
// broken/empty tiles when a product has no photo yet.
export const CATEGORY_GRADIENT: Record<string, string> = {
  "Quartz Slabs (Countertops)": "linear-gradient(135deg,#e7e9ee 0%,#c8cdd8 100%)",
  Flooring: "linear-gradient(135deg,#d9c3a5 0%,#b08d63 100%)",
  "Tile & Mosaic": "linear-gradient(135deg,#bcd6d6 0%,#7fa8a8 100%)",
  "Sinks & Faucets": "linear-gradient(135deg,#d5d8dc 0%,#9aa1ab 100%)",
  "Shower & Bath": "linear-gradient(135deg,#cfe0ea 0%,#8fb2c6 100%)",
  "Toilets & Bidets": "linear-gradient(135deg,#e2e6ea 0%,#aab3bd 100%)",
};

export function formatPrice(n: number | null | undefined): string {
  if (n == null) return "Call for pricing";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ─── Surface roles ────────────────────────────────────────────────────────────
// Maps a chosen Surfaces & Fixtures product to the functional role it plays in a
// kitchen design. This is the SINGLE source of truth for "what does this product
// count as" — used by the 3D View readiness gate and the shopping-list role
// assignment. It keys off the real Pelican storefront category (and subCategory
// for the combined "Sinks & Faucets" line) instead of fragile text heuristics.
export type SurfaceRole = "flooring" | "countertop" | "backsplash" | "sink" | "faucet" | "other";

export function surfaceRole(input: {
  category?: string | null;
  subCategory?: string | null;
  name?: string | null;
}): SurfaceRole {
  const cat = (input.category || "").trim();
  const sub = (input.subCategory || "").trim().toLowerCase();
  const name = (input.name || "").toLowerCase();

  switch (cat) {
    case "Flooring":
      return "flooring";
    case "Quartz Slabs (Countertops)":
      return "countertop";
    case "Tile & Mosaic":
      return "backsplash";
    case "Sinks & Faucets": {
      // Split the combined line into sink vs faucet. Accessories and disposals
      // are neither — check those FIRST because their subCategory label
      // ("Sink & Faucet Accessories") contains both words. Then prefer the
      // subCategory, falling back to the product name.
      if (sub.includes("accessor") || sub.includes("disposal")) return "other";
      if (sub.includes("faucet")) return "faucet";
      if (sub.includes("sink")) return "sink";
      if (/faucet|tap|filler/.test(name)) return "faucet";
      if (/\bsink\b/.test(name)) return "sink";
      return "other";
    }
    default:
      return "other";
  }
}
