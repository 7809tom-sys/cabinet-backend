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
