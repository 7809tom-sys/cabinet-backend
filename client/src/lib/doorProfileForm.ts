import { DOOR_DRAWER_FRONT_IDS, DOOR_PANEL_CONSTRUCTION_IDS, normalizeInsideEdgeProfile } from "@shared/doorProfiles";

/** Form values for the shared door profile editor. Blank string = unset (never a guessed default). */
export type DoorProfileValues = {
  railWidth: string;
  stileWidth: string;
  centerRailWidth: string;
  panelConstruction: string;
  bevelWidth: string;
  bevelDepth: string;
  /** A fixed edge id, or "" when unset. */
  insideEdgeProfile: string;
  drawerFrontType: string;
  grainDirection: string;
  finishSheen: string;
  profileNotes: string;
  sourceSpecification: string;
};

export type DoorProfileSource = {
  railWidth?: string | number | null;
  stileWidth?: string | number | null;
  centerRailWidth?: string | number | null;
  panelConstruction?: string | null;
  bevelWidth?: string | number | null;
  bevelDepth?: string | number | null;
  insideEdgeProfile?: string | null;
  drawerFrontType?: string | null;
  grainDirection?: string | null;
  finishSheen?: string | null;
  profileNotes?: string | null;
  sourceSpecification?: string | null;
};

const text = (v: string | number | null | undefined) => (v == null ? "" : String(v));
const oneOf = (v: string | null | undefined, ids: readonly string[]) => (v && ids.includes(v) ? v : "");

/** Loads a style into the form; legacy free-text edge profiles map to the nearest id or "" (unset). */
export function doorProfileValuesFromStyle(style: DoorProfileSource): DoorProfileValues {
  return {
    railWidth: text(style.railWidth),
    stileWidth: text(style.stileWidth),
    centerRailWidth: text(style.centerRailWidth),
    panelConstruction: oneOf(style.panelConstruction, DOOR_PANEL_CONSTRUCTION_IDS),
    bevelWidth: text(style.bevelWidth),
    bevelDepth: text(style.bevelDepth),
    insideEdgeProfile: normalizeInsideEdgeProfile(style.insideEdgeProfile) ?? "",
    drawerFrontType: oneOf(style.drawerFrontType, DOOR_DRAWER_FRONT_IDS),
    grainDirection: oneOf(style.grainDirection, ["vertical-stiles-horizontal-rails", "vertical", "horizontal", "none"]),
    finishSheen: oneOf(style.finishSheen, ["satin", "matte", "gloss"]),
    profileNotes: text(style.profileNotes),
    sourceSpecification: text(style.sourceSpecification),
  };
}

const num = (v: string) => {
  const parsed = Number.parseFloat(v.trim());
  return v.trim() && Number.isFinite(parsed) ? parsed : null;
};

/** Server payload: blank becomes null so unset values stay unset. */
export function doorProfileValuesToPayload(v: DoorProfileValues) {
  return {
    railWidth: num(v.railWidth),
    stileWidth: num(v.stileWidth),
    centerRailWidth: num(v.centerRailWidth),
    panelConstruction: (v.panelConstruction || null) as "raised" | "flat" | "slab" | "glass" | null,
    bevelWidth: num(v.bevelWidth),
    bevelDepth: num(v.bevelDepth),
    insideEdgeProfile: v.insideEdgeProfile || null,
    drawerFrontType: (v.drawerFrontType || null) as "five-piece-raised" | "five-piece-flat" | "slab" | null,
    grainDirection: (v.grainDirection || null) as "vertical-stiles-horizontal-rails" | "vertical" | "horizontal" | "none" | null,
    finishSheen: (v.finishSheen || null) as "satin" | "matte" | "gloss" | null,
    profileNotes: v.profileNotes.trim() || null,
    sourceSpecification: v.sourceSpecification.trim() || null,
  };
}
