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
