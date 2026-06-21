import { doorPanelKind, type DoorPanelKind } from "@/lib/design";

// ─────────────────────────────────────────────────────────────────────────────
// Door-family hero photos
// Photorealistic, watermark-free door-sample photos for the major panel families.
// Hosted on the project CDN (lifecycle-tied URLs). Each of the 61 styles maps to
// the closest family photo for a rich hero visual; the color-accurate SVG swatch
// (DoorStyleSwatch) remains the universal per-style detail/fallback.
// ─────────────────────────────────────────────────────────────────────────────

export interface DoorFamilyLike {
  doorStyle?: string | null;
}

// Compressed webp URLs (preferred for page loads).
const PHOTOS: Record<Exclude<DoorPanelKind, "double-shaker"> | "shaker", string> = {
  shaker:
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-shaker-6rdTMsADtNgxjohki84YKU.webp",
  raised:
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-raised-oLYqpx7edoxNoN4EWy9xXG.webp",
  slab:
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-slab-EPKZonTXAZzp3JdcxzKMQQ.webp",
  beaded:
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-beaded-nR3rA7Ru7s5RUiFQZghnDo.webp",
  inset:
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-inset-ZhoLPcYFUe6Qtsr2ARk4Jt.webp",
};

/**
 * Returns the CDN photo URL for the door style's panel family, or null when the
 * family has no dedicated photo (caller should fall back to the SVG swatch).
 */
export function doorFamilyPhoto(style: DoorFamilyLike): string | null {
  const kind = doorPanelKind(style.doorStyle);
  if (kind === "double-shaker") return PHOTOS.shaker;
  return PHOTOS[kind] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Full-kitchen lifestyle "room scene" photos
// We sell the dream kitchen, not a door. These are photorealistic full-room
// scenes (island, pendants, styled counters) modeled on leading RTA retailers
// (Lily Ann Cabinets, The RTA Store). Each style resolves to the scene that best
// matches BOTH its door-panel family and its finish/color so the hero feels like
// the finished kitchen a buyer is imagining.
// ─────────────────────────────────────────────────────────────────────────────

const CDN =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M";

export type KitchenSceneKey =
  | "shaker-white"
  | "shaker-gray"
  | "shaker-espresso"
  | "raised-cherry"
  | "slab-natural";

// Compressed webp scenes (preferred for page loads).
export const KITCHEN_SCENES: Record<KitchenSceneKey, string> = {
  "shaker-white": `${CDN}/kitchen-scene-shaker-white-mgJd4qiCHQceFDfcnPxSBB.webp`,
  "shaker-gray": `${CDN}/kitchen-scene-shaker-gray-2efULLS7TtDdQkBp5AHFZK.webp`,
  "shaker-espresso": `${CDN}/kitchen-scene-shaker-espresso-oPGA9oBZCRb9ai3ZyVy7ub.webp`,
  "raised-cherry": `${CDN}/kitchen-scene-raised-cherry-T3vA5stdneXhkTbrScSj4d.webp`,
  "slab-natural": `${CDN}/kitchen-scene-slab-natural-emxM5j6qArSi4VUE44mnqN.webp`,
};

// A coarse finish bucket derived from the style code/name keywords. Mirrors the
// finishColors() keyword groups in design.ts but collapsed to the buckets we
// have photography for.
type FinishBucket = "white" | "gray" | "dark" | "warmwood" | "lightwood";

function finishBucket(doorStyle?: string | null): FinishBucket {
  const s = (doorStyle ?? "").toLowerCase();
  if (/white|snow|arctic|alpine|pearl|dove|cream|almond|biscuit|linen|sand|beige|tan/.test(s))
    return "white";
  if (/grey|gray|stone|pewter|graphite|slate|fog|navy|blue|indigo|ocean/.test(s))
    return "gray";
  if (/black|onyx|carbon|espresso|java|walnut|mocha|coffee|chocolate|brown/.test(s))
    return "dark";
  if (/cherry|mahogany|chestnut|cinnamon|spice/.test(s)) return "warmwood";
  if (/honey|oak|natural|maple|wheat|amber|toffee|gold/.test(s)) return "lightwood";
  return "white"; // most-requested default reads clean & bright
}

/**
 * Resolve the best full-kitchen room scene for a door style, combining its
 * panel family and finish bucket. Always returns a scene URL (never null) so
 * every card/hero gets a lifestyle visual.
 */
export function kitchenSceneFor(style: DoorFamilyLike): string {
  const kind = doorPanelKind(style.doorStyle);
  const finish = finishBucket(style.doorStyle);

  // Slab / contemporary → light natural wood modern scene.
  if (kind === "slab") return KITCHEN_SCENES["slab-natural"];

  // Raised / cathedral → traditional warm cherry scene for warm/wood/dark tones;
  // a raised white/gray kitchen still reads best as the bright shaker rooms.
  if (kind === "raised") {
    if (finish === "white") return KITCHEN_SCENES["shaker-white"];
    if (finish === "gray") return KITCHEN_SCENES["shaker-gray"];
    return KITCHEN_SCENES["raised-cherry"];
  }

  // Shaker / beaded / inset / double-shaker → pick the scene by finish.
  switch (finish) {
    case "gray":
      return KITCHEN_SCENES["shaker-gray"];
    case "dark":
      return KITCHEN_SCENES["shaker-espresso"];
    case "warmwood":
      return KITCHEN_SCENES["raised-cherry"];
    case "lightwood":
      return KITCHEN_SCENES["slab-natural"];
    case "white":
    default:
      return KITCHEN_SCENES["shaker-white"];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimensional 3D product renders (per generic cabinet item)
// Photorealistic three-quarter-angle studio renders with depth + shadow, modeled
// on leading RTA retailers. Each SKU resolves to the render that best matches its
// CATEGORY (base / wall / tall / vanity / accessory) and FINISH bucket, so a
// shopper sees a real product photo instead of a flat to-scale diagram. The
// to-scale CabinetDrawing remains available as the "Dimensions" view, and the
// SVG swatch stays the universal color-accurate fallback.
// ─────────────────────────────────────────────────────────────────────────────

type ProductCategory = "base" | "wall" | "tall" | "vanity" | "accessory";

// Compressed webp renders (preferred for page loads).
const PRODUCT_PHOTOS: Record<string, string> = {
  // Base — full finish coverage
  "base:white": `${CDN}/prod-base-shaker-white-EQqwnS39T7AsY7XCwYDyPW.webp`,
  "base:gray": `${CDN}/prod-base-shaker-gray-bX7qNBMmZ5Abt4dxXHB5uB.webp`,
  "base:warmwood": `${CDN}/prod-base-cherry-bjnCyF9AS5p9oUeeYQNdaG.webp`,
  "base:dark": `${CDN}/prod-base-espresso-aaMH2vASEjTuRTPUt47Nsg.webp`,
  // Wall — full finish coverage
  "wall:white": `${CDN}/prod-wall-shaker-white-8PsrxeydDBdMRNU88ESQfS.webp`,
  "wall:gray": `${CDN}/prod-wall-shaker-gray-fxt8GwDMwtnxrb9iATKxfe.webp`,
  "wall:warmwood": `${CDN}/prod-wall-cherry-QHvngHNKEsCw3ipTKfDpDe.webp`,
  "wall:dark": `${CDN}/prod-wall-espresso-eVUAMmwcs3LAXnjGHuS6RJ.webp`,
  // Tall — full finish coverage
  "tall:white": `${CDN}/prod-tall-shaker-white-oYxHAbKd3y3ZAZZHoJGdiA.webp`,
  "tall:gray": `${CDN}/prod-tall-gray-WuDVv8ZBNTsQURBP5pBp6Z.webp`,
  "tall:warmwood": `${CDN}/prod-tall-cherry-iCGauxVBC9tTJ4iRMdmcsC.webp`,
  "tall:dark": `${CDN}/prod-tall-espresso-Dqth4GR5YPQeTqsjnzEZC9.webp`,
  // Vanity — full finish coverage
  "vanity:white": `${CDN}/prod-vanity-shaker-white-PYq6TQSEeJfuj7XfG3Beov.webp`,
  "vanity:gray": `${CDN}/prod-vanity-gray-WNCEY5BcdKUp8E2GaNWnLe.webp`,
  "vanity:warmwood": `${CDN}/prod-vanity-cherry-3jcRo9a65MCKreEMFQx7oc.webp`,
  "vanity:dark": `${CDN}/prod-vanity-espresso-Enqw8GFJLk6uNXEpCgvtAy.webp`,
  // Accessory — neutral white + warm wood + dark
  "accessory:white": `${CDN}/prod-accessory-crown-BtKLVqnRs9FvTATNhbPLMq.webp`,
  "accessory:warmwood": `${CDN}/prod-accessory-cherry-F6r5JhLTgBeNtHp3BTqk4M.webp`,
  "accessory:dark": `${CDN}/prod-accessory-espresso-iEP6g93WYBisHc3YBgen6S.webp`,
};

// Map any DB category string to one of our render categories.
function productCategory(category?: string | null): ProductCategory {
  const c = (category ?? "").toLowerCase();
  if (c.includes("wall") || c.includes("upper")) return "wall";
  if (c.includes("tall") || c.includes("pantry") || c.includes("utility")) return "tall";
  if (c.includes("vanity") || c.includes("bath")) return "vanity";
  if (
    c.includes("accessor") ||
    c.includes("molding") ||
    c.includes("moulding") ||
    c.includes("filler") ||
    c.includes("panel") ||
    c.includes("trim") ||
    c.includes("toe") ||
    c.includes("crown")
  )
    return "accessory";
  // base, ada, sink base, drawer base, corner, etc. all read as a base render
  return "base";
}

export interface CabinetProductLike {
  category?: string | null;
  doorStyle?: string | null;
}

/**
 * Resolve the best dimensional 3D product render for a cabinet SKU, combining its
 * category and finish bucket. Always returns a render URL (never null) so every
 * card/detail page gets a real product photo. Falls back across finishes within a
 * category, then to the white render, then to the base white render.
 */
export function cabinetProductPhoto(item: CabinetProductLike): string {
  const cat = productCategory(item.category);
  const finish = finishBucket(item.doorStyle);

  // Preferred: exact category + finish.
  const exact = PRODUCT_PHOTOS[`${cat}:${finish}`];
  if (exact) return exact;

  // Finish fallback chain within the same category (dark→warmwood reads closest).
  const order: FinishBucket[] = ["white", "gray", "warmwood", "dark", "lightwood"];
  for (const f of order) {
    const url = PRODUCT_PHOTOS[`${cat}:${f}`];
    if (url) return url;
  }

  // Category fallback: tall/vanity/accessory always have a white render; otherwise base white.
  return PRODUCT_PHOTOS[`${cat}:white`] ?? PRODUCT_PHOTOS["base:white"];
}

// ─────────────────────────────────────────────────────────────────────────────
// Kitchen-scene lead-in copy
// Short, evocative descriptions of the finished kitchen each scene depicts, used
// to lead the buying flow with the "dream kitchen" before the individual item.
// ─────────────────────────────────────────────────────────────────────────────

const SCENE_BLURBS: Record<KitchenSceneKey, { title: string; blurb: string }> = {
  "shaker-white": {
    title: "Bright & Timeless White Shaker Kitchen",
    blurb:
      "Clean white shaker fronts, satin-nickel hardware and an airy, open feel — the most-requested look that brightens any space and never goes out of style.",
  },
  "shaker-gray": {
    title: "Warm Greige Shaker Kitchen",
    blurb:
      "Soft dove-gray shaker cabinetry pairs with natural light for a calm, modern-farmhouse feel that hides everyday wear and complements almost any countertop.",
  },
  "shaker-espresso": {
    title: "Rich Espresso Kitchen",
    blurb:
      "Deep espresso fronts deliver a dramatic, contemporary statement — striking against light counters and stainless appliances.",
  },
  "raised-cherry": {
    title: "Classic Cherry Raised-Panel Kitchen",
    blurb:
      "Warm cherry wood grain and raised-panel doors create a traditional, inviting kitchen with timeless craftsmanship and depth.",
  },
  "slab-natural": {
    title: "Modern Natural-Wood Kitchen",
    blurb:
      "Handle-free natural-wood slab fronts and a minimal profile give a sleek, European-modern look full of warmth.",
  },
};

const SCENE_BY_URL: Record<string, KitchenSceneKey> = Object.fromEntries(
  (Object.keys(KITCHEN_SCENES) as KitchenSceneKey[]).map((k) => [KITCHEN_SCENES[k], k]),
) as Record<string, KitchenSceneKey>;

/**
 * Returns the kitchen-scene image URL plus a short title/blurb describing the
 * finished kitchen, for leading the buying flow. Always returns a value.
 */
export function kitchenSceneWithCopy(style: DoorFamilyLike): {
  image: string;
  title: string;
  blurb: string;
} {
  const image = kitchenSceneFor(style);
  const key = SCENE_BY_URL[image] ?? "shaker-white";
  return { image, ...SCENE_BLURBS[key] };
}
