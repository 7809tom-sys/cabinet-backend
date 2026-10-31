/**
 * Door profile options (inside-edge profile, panel construction, drawer front).
 *
 * Doors have their OWN list; the countertop EDGE_PROFILES in client/src/lib/design.ts
 * is deliberately untouched. The inside-edge id is what is stored in
 * door_styles.insideEdgeProfile and what InteractiveRoom3D renders.
 */

export type DoorProfileOption<Id extends string = string> = {
  id: Id;
  label: string;
  /** Small cross-section drawing, viewBox 0 0 24 16, stroke only. */
  svgPath: string;
};

export const DOOR_EDGE_PROFILE_IDS = ["square", "bevel", "ogee", "cove", "bead", "step"] as const;
export type DoorEdgeProfileId = (typeof DOOR_EDGE_PROFILE_IDS)[number];

export const DOOR_EDGE_PROFILES: DoorProfileOption<DoorEdgeProfileId>[] = [
  { id: "square", label: "90° square shaker", svgPath: "M2 14 L2 3 L22 3 L22 14" },
  { id: "bevel", label: "Bevel shaker", svgPath: "M2 14 L2 8 L8 3 L22 3 L22 14" },
  { id: "ogee", label: "Ogee", svgPath: "M2 14 L2 9 Q2 6 5 6 Q8 6 8 3 L22 3 L22 14" },
  { id: "cove", label: "Cove", svgPath: "M2 14 L2 9 Q8 9 8 3 L22 3 L22 14" },
  { id: "bead", label: "Bead", svgPath: "M2 14 L2 8 A3 3 0 0 1 8 8 L8 3 L22 3 L22 14" },
  { id: "step", label: "Step", svgPath: "M2 14 L2 9 L5 9 L5 6 L8 6 L8 3 L22 3 L22 14" },
];

export const DOOR_PANEL_CONSTRUCTION_IDS = ["raised", "flat", "slab", "glass"] as const;
export type DoorPanelConstructionId = (typeof DOOR_PANEL_CONSTRUCTION_IDS)[number];
export const DOOR_PANEL_CONSTRUCTIONS: DoorProfileOption<DoorPanelConstructionId>[] = [
  { id: "raised", label: "Raised panel", svgPath: "M2 14 L2 3 L22 3 L22 14 M7 14 L7 9 L10 6 L14 6 L17 9 L17 14" },
  { id: "flat", label: "Flat panel", svgPath: "M2 14 L2 3 L22 3 L22 14 M8 14 L8 7 L16 7 L16 14" },
  { id: "slab", label: "Slab", svgPath: "M2 14 L2 3 L22 3 L22 14" },
  { id: "glass", label: "Glass", svgPath: "M2 14 L2 3 L22 3 L22 14 M7 14 L7 7 L17 7 L17 14 M9 12 L12 9" },
];

export const DOOR_DRAWER_FRONT_IDS = ["five-piece-raised", "five-piece-flat", "slab"] as const;
export type DoorDrawerFrontId = (typeof DOOR_DRAWER_FRONT_IDS)[number];
export const DOOR_DRAWER_FRONTS: DoorProfileOption<DoorDrawerFrontId>[] = [
  { id: "five-piece-raised", label: "5-piece raised", svgPath: "M2 14 L2 3 L22 3 L22 14 M6 14 L6 9 L9 6 L15 6 L18 9 L18 14" },
  { id: "five-piece-flat", label: "5-piece flat", svgPath: "M2 14 L2 3 L22 3 L22 14 M7 14 L7 7 L17 7 L17 14" },
  { id: "slab", label: "Slab", svgPath: "M2 14 L2 3 L22 3 L22 14" },
];

export function isDoorEdgeProfileId(value: unknown): value is DoorEdgeProfileId {
  return typeof value === "string" && (DOOR_EDGE_PROFILE_IDS as readonly string[]).includes(value);
}

/**
 * Maps a stored value to a fixed id. Existing free text (for example "beveled
 * ogee", "Beaded inner edge", "90 degree") maps to the nearest id; anything
 * unrecognised (or blank) is null, shown as "unset". Order matters: the more
 * specific moulding names win over "bevel"/"square".
 */
export function normalizeInsideEdgeProfile(raw: string | null | undefined): DoorEdgeProfileId | null {
  const text = (raw ?? "").trim().toLowerCase();
  if (!text) return null;
  if (isDoorEdgeProfileId(text)) return text;
  if (/\bogee\b|\bogee/.test(text)) return "ogee";
  if (/\bcove/.test(text)) return "cove";
  if (/\bbead/.test(text)) return "bead";
  if (/\bstep/.test(text)) return "step";
  if (/\bbevel|\bchamfer/.test(text)) return "bevel";
  if (/\bsquare\b|\b90\b|90\s*°|90\s*deg|\bshaker\b|\bflat\b|\bsharp\b/.test(text)) return "square";
  return null;
}

export function doorEdgeProfileLabel(id: DoorEdgeProfileId | null): string {
  return DOOR_EDGE_PROFILES.find((p) => p.id === id)?.label ?? "Unset";
}

/**
 * Layered approximation of each profile's cross-section for the 3D Designer.
 * Each layer is a strip along the inside edge of the rails/stiles: `insetIn` is
 * how far the strip reaches into the opening and `proudIn` how far it stands off
 * the frame face. `square` has no layers (a plain 90° edge).
 */
export type DoorEdgeLayer = { insetIn: number; proudIn: number };
export function doorEdgeProfileLayers(id: string | null | undefined): DoorEdgeLayer[] {
  switch (normalizeInsideEdgeProfile(id)) {
    case "bevel": return [{ insetIn: 0.16, proudIn: 0.03 }, { insetIn: 0.08, proudIn: 0.06 }];
    case "ogee": return [{ insetIn: 0.18, proudIn: 0.03 }, { insetIn: 0.12, proudIn: 0.07 }, { insetIn: 0.05, proudIn: 0.09 }];
    case "cove": return [{ insetIn: 0.18, proudIn: 0.09 }, { insetIn: 0.12, proudIn: 0.06 }, { insetIn: 0.05, proudIn: 0.02 }];
    case "bead": return [{ insetIn: 0.12, proudIn: 0.05 }, { insetIn: 0.08, proudIn: 0.08 }, { insetIn: 0.04, proudIn: 0.05 }];
    case "step": return [{ insetIn: 0.18, proudIn: 0.03 }, { insetIn: 0.09, proudIn: 0.07 }];
    case "square":
    default: return [];
  }
}

/** Plain-language spec lines for the public spec view. Blank/unknown values are omitted, never invented. */
export type DoorProfileSpecInput = {
  railWidth?: string | number | null;
  stileWidth?: string | number | null;
  centerRailWidth?: string | number | null;
  panelConstruction?: string | null;
  bevelWidth?: string | number | null;
  bevelDepth?: string | number | null;
  insideEdgeProfile?: string | null;
  drawerFrontType?: string | null;
  finishSheen?: string | null;
  grainDirection?: string | null;
  profileNotes?: string | null;
};

const present = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
const inches = (v: unknown) => `${Number(v)}"`;

export function doorProfileSpecRows(spec: DoorProfileSpecInput): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const edge = normalizeInsideEdgeProfile(spec.insideEdgeProfile);
  if (edge) rows.push({ label: "Inside edge", value: doorEdgeProfileLabel(edge) });
  const panel = DOOR_PANEL_CONSTRUCTIONS.find((p) => p.id === spec.panelConstruction);
  if (panel) rows.push({ label: "Panel", value: panel.label });
  const drawer = DOOR_DRAWER_FRONTS.find((p) => p.id === spec.drawerFrontType);
  if (drawer) rows.push({ label: "Drawer front", value: drawer.label });
  if (present(spec.railWidth) && Number(spec.railWidth) > 0) rows.push({ label: "Rail", value: inches(spec.railWidth) });
  if (present(spec.stileWidth) && Number(spec.stileWidth) > 0) rows.push({ label: "Stile", value: inches(spec.stileWidth) });
  if (present(spec.centerRailWidth) && Number(spec.centerRailWidth) > 0) rows.push({ label: "Center rail", value: inches(spec.centerRailWidth) });
  if (present(spec.bevelWidth) && Number(spec.bevelWidth) > 0) rows.push({ label: "Bevel width", value: inches(spec.bevelWidth) });
  if (present(spec.bevelDepth) && Number(spec.bevelDepth) > 0) rows.push({ label: "Bevel depth", value: inches(spec.bevelDepth) });
  if (present(spec.finishSheen)) rows.push({ label: "Sheen", value: String(spec.finishSheen) });
  if (present(spec.grainDirection) && spec.grainDirection !== "none") rows.push({ label: "Grain", value: String(spec.grainDirection).replace(/-/g, " ") });
  if (present(spec.profileNotes)) rows.push({ label: "Notes", value: String(spec.profileNotes).trim() });
  return rows;
}

/**
 * Edge strips for one door opening, in the same units as the inputs (metres in the
 * Designer). x/y are the strip centre relative to the opening centre; z is the
 * strip centre in front of the frame face. `square` returns no strips.
 */
export type DoorEdgeStrip = { layer: number; side: "top" | "bottom" | "left" | "right"; width: number; height: number; x: number; y: number; z: number };
export function doorEdgeProfileStrips(
  profile: string | null | undefined,
  openingWidth: number,
  openingHeight: number,
  unit: number,
  baseZ = 0.013,
): DoorEdgeStrip[] {
  const strips: DoorEdgeStrip[] = [];
  doorEdgeProfileLayers(profile).forEach((layer, index) => {
    const inset = Math.min(layer.insetIn * unit, openingWidth / 4, openingHeight / 4);
    const proud = layer.proudIn * unit;
    const z = baseZ + proud / 2;
    strips.push(
      { layer: index, side: "top", width: openingWidth, height: inset, x: 0, y: openingHeight / 2 - inset / 2, z },
      { layer: index, side: "bottom", width: openingWidth, height: inset, x: 0, y: -openingHeight / 2 + inset / 2, z },
      { layer: index, side: "left", width: inset, height: Math.max(0.001, openingHeight - inset * 2), x: -openingWidth / 2 + inset / 2, y: 0, z },
      { layer: index, side: "right", width: inset, height: Math.max(0.001, openingHeight - inset * 2), x: openingWidth / 2 - inset / 2, y: 0, z },
    );
  });
  return strips;
}
