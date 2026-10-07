import { makeFurniture, type PlacedFurniture, type RoomData } from "./design";
import type { VerifiedPelicanBathroomFixtureProfile } from "./pelicanBathroomFixtureProfiles";

export type BathroomPlanningGuidance = {
  title: string;
  text: string;
  sourceUrl: string;
};

/**
 * Advisory planning notes based on NKBA's published bathroom-planning guide.
 * They do not replace locally applicable code, accessibility requirements, or
 * a supplier installation drawing, so the Designer never silently moves or
 * rejects a fixture based on them.
 */
export function bathroomPlanningGuidance(
  profile: Pick<VerifiedPelicanBathroomFixtureProfile, "kind" | "specificationUrl"> | null | undefined,
): BathroomPlanningGuidance | null {
  if (!profile) return null;
  if (profile.kind === "toilet" || profile.kind === "bidet") {
    return {
      title: "Toilet / bidet planning check",
      text: "Advisory: check at least 15 in. from the fixture centerline to each side obstruction and at least 21 in. clear in front; a 30 in. clear front space is NKBA’s recommended target. Confirm local code and accessibility requirements.",
      sourceUrl: "https://media.nkba.org/uploads/2022/05/Bath-Planning-Guidelines.pdf",
    };
  }
  if (profile.kind === "freestanding-tub" || profile.kind === "alcove-tub" || profile.kind === "tub-door") {
    return {
      title: "Tub access planning check",
      text: "Advisory: keep at least 21 in. clear at the access side and keep any door swing out of the fixture zone. Confirm the exact tub, deck, surround, drain, and local-code requirements before installation.",
      sourceUrl: "https://media.nkba.org/uploads/2022/05/Bath-Planning-Guidelines.pdf",
    };
  }
  if (profile.kind === "shower-door" || profile.kind === "shower-wall") {
    return {
      title: "Shower enclosure planning check",
      text: "Nominal visual envelope only. Verify the finished opening, wall condition, curb, hardware clearances, panel overlap, and installation requirements against Pelican’s technical sheet before ordering or installing.",
      sourceUrl: profile.specificationUrl,
    };
  }
  return null;
}

export const BATHROOM_STARTER_TEMPLATE = {
  id: "bathroom-standard-zones-v1",
  label: "Bathroom starter · movable zones",
  description: "10 ft × 8 ft planning room with movable vanity, toilet, and tub zones. Choose actual Pelican products afterward.",
  room: { width: 120, depth: 96, ceilingHeight: 96 } satisfies RoomData,
} as const;

/**
 * Starts with generic, non-cartable zones rather than inventing a vanity, toilet,
 * or tub SKU. Each zone can be moved, rotated, deleted, and replaced with a
 * source-priced Pelican selection from the dedicated Bathroom Fixtures tab.
 */
export function makeBathroomStarterTemplate(): { room: RoomData; furniture: PlacedFurniture[] } {
  return {
    room: { ...BATHROOM_STARTER_TEMPLATE.room },
    furniture: [
      makeFurniture("bathroom-zone-vanity-60", 0, 0),
      makeFurniture("bathroom-zone-toilet", 84, 12),
      makeFurniture("bathroom-zone-tub-60", 0, 64),
    ],
  };
}
