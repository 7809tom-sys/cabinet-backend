import {
  FURNITURE_CATALOG,
  furnitureFootprint,
  isSinkBaseCabinet,
  makeFurniture,
  type PlacedCabinet,
  type PlacedFurniture,
  type RoomData,
  type SinkFixture,
} from "./design";
import {
  verifiedPelicanBathroomFixtureProfile,
  type PelicanBathroomFixtureKind,
  type VerifiedPelicanBathroomFixtureProfile,
} from "./pelicanBathroomFixtureProfiles";

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

type BathroomZoneKind = "vanity" | "toilet" | "tub";

export type BathroomZoneOverlapWarning = {
  fixtureUid: string;
  fixtureLabel: string;
  zoneKind: BathroomZoneKind;
  zoneLabel: string;
};

/** A valid, centered placement for a measured fixture inside a matching starter zone. */
export type BathroomZonePlacement = {
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  zoneUid: string;
  zoneKind: BathroomZoneKind;
  zoneLabel: string;
};

export type BathroomChecklistStep = {
  id: "vanity-base" | "vanity-basin" | "vanity-faucet" | "toilet" | "tub" | "shower";
  label: string;
  detail: string;
  complete: boolean;
  optional?: boolean;
};

const BATHROOM_ZONE_KIND_BY_DEFINITION: Record<string, BathroomZoneKind | undefined> = {
  "bathroom-zone-vanity-60": "vanity",
  "bathroom-zone-toilet": "toilet",
  "bathroom-zone-tub-60": "tub",
};

const BATHROOM_ZONE_LABEL: Record<BathroomZoneKind, string> = {
  vanity: "vanity zone",
  toilet: "toilet zone",
  tub: "tub zone",
};

function expectedBathroomZone(kind: PelicanBathroomFixtureKind): BathroomZoneKind | null {
  if (kind === "toilet" || kind === "bidet") return "toilet";
  if (kind === "freestanding-tub" || kind === "alcove-tub" || kind === "tub-door") return "tub";
  // A shower door or wall has no dedicated starter-zone footprint. Do not claim
  // that it fits a vanity, toilet, or tub zone merely because its boxes touch.
  return null;
}

/**
 * Centers a source-measured fixture in its matching movable Bathroom starter
 * zone when its actual envelope fits. Rotation is chosen per fixture so a
 * 60-inch tub uses the 60-inch long side of the tub zone rather than being
 * forced into a 32/36-inch-deep footprint. This is visual planning placement,
 * not a clearance or installation validation rule.
 */
export function bathroomFixtureStarterZonePlacement(
  fixture: PlacedFurniture,
  furniture: readonly PlacedFurniture[],
): BathroomZonePlacement | null {
  const fixtureDefinition = FURNITURE_CATALOG.find((item) => item.id === fixture.defId);
  const profile = verifiedPelicanBathroomFixtureProfile(fixture.pelicanCode ?? fixtureDefinition?.pelicanCode);
  const expectedZone = profile ? expectedBathroomZone(profile.kind) : null;
  if (!fixtureDefinition || !expectedZone) return null;

  const zones = furniture.flatMap((item) => {
    const definition = FURNITURE_CATALOG.find((candidate) => candidate.id === item.defId);
    const kind = definition ? BATHROOM_ZONE_KIND_BY_DEFINITION[definition.id] : undefined;
    return definition && kind === expectedZone ? [{ item, definition, kind }] : [];
  });

  for (const zone of zones) {
    const zoneFootprint = furnitureFootprint(zone.item, zone.definition);
    for (const rotation of [0, 90, 180, 270] as const) {
      const candidate = { ...fixture, rotation };
      const fixtureFootprint = furnitureFootprint(candidate, fixtureDefinition);
      if (fixtureFootprint.w > zoneFootprint.w + 0.01 || fixtureFootprint.d > zoneFootprint.d + 0.01) continue;
      return {
        x: zone.item.x + (zoneFootprint.w - fixtureFootprint.w) / 2,
        y: zone.item.y + (zoneFootprint.d - fixtureFootprint.d) / 2,
        rotation,
        zoneUid: zone.item.uid,
        zoneKind: zone.kind,
        zoneLabel: BATHROOM_ZONE_LABEL[zone.kind],
      };
    }
  }
  return null;
}

function rectanglesOverlap(
  a: { x: number; y: number; w: number; d: number },
  b: { x: number; y: number; w: number; d: number },
): boolean {
  const epsilon = 0.01;
  return a.x < b.x + b.w - epsilon
    && a.x + a.w > b.x + epsilon
    && a.y < b.y + b.d - epsilon
    && a.y + a.d > b.y + epsilon;
}

/**
 * Flags a source-measured bathroom fixture only when it enters a *different*
 * starter-zone. This remains an advisory visual warning: users can move any
 * item, and the Designer never presents a zone as a code-compliant clearance.
 */
export function bathroomZoneOverlapWarnings(furniture: readonly PlacedFurniture[]): BathroomZoneOverlapWarning[] {
  const entries = furniture.flatMap((item) => {
    const definition = FURNITURE_CATALOG.find((candidate) => candidate.id === item.defId);
    if (!definition) return [];
    const footprint = furnitureFootprint(item, definition);
    return [{ item, definition, footprint }];
  });
  const zones = entries.flatMap(({ item, definition, footprint }) => {
    const kind = BATHROOM_ZONE_KIND_BY_DEFINITION[definition.id];
    return kind ? [{ item, kind, footprint }] : [];
  });

  return entries.flatMap(({ item, definition, footprint }) => {
    const profile = verifiedPelicanBathroomFixtureProfile(item.pelicanCode ?? definition.pelicanCode);
    if (!profile) return [];
    const expectedZone = expectedBathroomZone(profile.kind);
    return zones.flatMap((zone) => {
      if (zone.kind === expectedZone || !rectanglesOverlap(
        { x: item.x, y: item.y, w: footprint.w, d: footprint.d },
        { x: zone.item.x, y: zone.item.y, w: zone.footprint.w, d: zone.footprint.d },
      )) return [];
      return [{
        fixtureUid: item.uid,
        fixtureLabel: profile.pelicanCode,
        zoneKind: zone.kind,
        zoneLabel: BATHROOM_ZONE_LABEL[zone.kind],
      }];
    });
  });
}

/** A compact, non-blocking guide for a Bathroom plan. */
export function bathroomFixtureChecklist(input: {
  cabinets: readonly Pick<PlacedCabinet, "description" | "masterCode" | "subCategory">[];
  sinks: readonly Pick<SinkFixture, "pelicanProfileId" | "pelicanFaucetProfileId">[];
  selectedSurfaceCodes: readonly (string | null | undefined)[];
  furniture: readonly PlacedFurniture[];
}): BathroomChecklistStep[] {
  const placedKinds = input.furniture.flatMap((item) => {
    const definition = FURNITURE_CATALOG.find((candidate) => candidate.id === item.defId);
    const profile = verifiedPelicanBathroomFixtureProfile(item.pelicanCode ?? definition?.pelicanCode);
    return profile ? [profile.kind] : [];
  });
  // Sink fixtures persist their verified profile ID, whereas material rows retain
  // the source code. Match both forms without ever guessing an unverified item.
  const hasVanityBasin = input.sinks.some((sink) => /pelican-pl-(?:3099|3608)-.*-vanity/.test(sink.pelicanProfileId ?? ""));
  const hasVanityFaucet = input.sinks.some((sink) => /pelican-pl-8112-cascade-vanity-/.test(sink.pelicanFaucetProfileId ?? ""))
    || input.selectedSurfaceCodes.some((code) => /^PL-8112\s+(?:BN|CHR|MB)$/i.test(code ?? ""));
  return [
    { id: "vanity-base", label: "Place a vanity sink base", detail: "Choose a bathroom vanity cabinet sized for the wall.", complete: input.cabinets.some(isSinkBaseCabinet) },
    { id: "vanity-basin", label: "Choose a Pelican vanity basin", detail: "Install it through the compatible vanity base.", complete: hasVanityBasin },
    { id: "vanity-faucet", label: "Choose a Pelican vanity faucet", detail: "Confirm the faucet with the selected basin and vanity top.", complete: hasVanityFaucet },
    { id: "toilet", label: "Place a toilet or bidet", detail: "Keep its source-measured footprint in the toilet zone and review the advisory clearance note.", complete: placedKinds.some((kind) => kind === "toilet" || kind === "bidet") },
    { id: "tub", label: "Place a tub", detail: "Use a source-measured Pelican tub envelope for visual planning.", complete: placedKinds.some((kind) => kind === "freestanding-tub" || kind === "alcove-tub") },
    { id: "shower", label: "Add a shower door or wall, if needed", detail: "Pelican enclosure graphics are visual planning envelopes; verify the technical sheet before ordering.", complete: placedKinds.some((kind) => kind === "shower-door" || kind === "tub-door" || kind === "shower-wall"), optional: true },
  ];
}

export const BATHROOM_STARTER_TEMPLATE = {
  id: "bathroom-standard-zones-v1",
  label: "Bathroom starter · movable zones",
  description: "10 ft × 8 ft planning room with movable vanity, toilet, and 60 × 36 in. tub zones. Choose actual Pelican products afterward.",
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
      makeFurniture("bathroom-zone-tub-60", 0, 60),
    ],
  };
}
