import {
  FILLER_MIN_WIDTH_IN,
  STD,
  appendCollisionFreePlacements,
  cabinetWall,
  isFillerItem,
  wallSpanMeasure,
  type PlacedCabinet,
  type RoomData,
  type WallOpening,
  type WallSide,
} from "@/lib/design";

const EDGE_EPSILON_IN = 0.001;
export const SMALL_GAP_FILLER_MAX_IN = 3;

export type SmallGapFillerPlacementMode = "left" | "right" | "split";

export type SmallGapFillerOpportunity = {
  cabinetUid: string;
  wall: WallSide;
  layer: "base" | "wall";
  cabinetStart: number;
  cabinetSpan: number;
  openingStart: number;
  openingLength: number;
  remaining: number;
};

export type SmallGapFillerLayout = {
  cabinetStart: number;
  leftWidth: number;
  rightWidth: number;
  pieces: Array<{ side: "left" | "right"; start: number; width: number }>;
};

export type InstalledFillerVerticalSpec = {
  storedHeight: number;
  visibleBottom: number;
  visibleHeight: number;
  visibleTop: number;
};

/**
 * Base filler catalog records may describe taller stock. Once installed beside a
 * standard base cabinet, only the 30-inch cabinet-box panel is visible above the
 * 4½-inch toe kick. The saved height remains the standard inclusive 34½-inch base
 * envelope so the existing 2D/3D toe-kick renderers do not subtract the kick twice.
 */
export function installedFillerVerticalSpec(
  layer: "base" | "wall",
  catalogHeight: number,
): InstalledFillerVerticalSpec {
  if (layer === "base") {
    return {
      storedHeight: STD.BASE_HEIGHT,
      visibleBottom: STD.TOE_KICK,
      visibleHeight: STD.BASE_HEIGHT - STD.TOE_KICK,
      visibleTop: STD.BASE_HEIGHT,
    };
  }
  const storedHeight = Number.isFinite(catalogHeight) && catalogHeight > 0
    ? catalogHeight
    : STD.WALL_HEIGHT;
  return {
    storedHeight,
    visibleBottom: 0,
    visibleHeight: storedHeight,
    visibleTop: storedHeight,
  };
}

function near(left: number, right: number) {
  return Math.abs(left - right) <= EDGE_EPSILON_IN;
}

function gapCrossesWallOpening(openings: readonly WallOpening[], wall: WallSide, start: number, length: number) {
  const end = start + length;
  return openings.some((opening) => opening.side === wall
    && opening.offset < end - EDGE_EPSILON_IN
    && opening.offset + opening.width > start + EDGE_EPSILON_IN);
}

/** Detects only a real post-placement wall opening of 3 inches or less beside the new cabinet. */
export function findSmallGapFillerOpportunity(
  room: RoomData,
  placed: readonly PlacedCabinet[],
  openings: readonly WallOpening[],
  cabinetUid: string,
): SmallGapFillerOpportunity | null {
  const cabinet = placed.find((item) => item.uid === cabinetUid);
  if (!cabinet || isFillerItem(cabinet) || !["base", "wall", "tall"].includes(cabinet.placement)) return null;

  const wall = cabinetWall(cabinet, room);
  // Use the same nearest-neighbor measurement that powers the live 3D details
  // panel. This recognizes corner-cabinet boundaries such as B-15 to LS3612,
  // where generic free-segment classification can assign the corner footprint
  // to its adjoining wall instead of the selected cabinet's run.
  const measurement = wallSpanMeasure(cabinet, room, [...placed], wall);
  const cabinetStart = measurement.start;
  const cabinetSpan = measurement.end - measurement.start;
  const cabinetEnd = cabinetStart + cabinetSpan;
  const layer: "base" | "wall" = cabinet.placement === "wall" ? "wall" : "base";
  const leadingStart = cabinetStart - measurement.before;
  const leadingWidth = measurement.before >= FILLER_MIN_WIDTH_IN - EDGE_EPSILON_IN
    && measurement.before <= SMALL_GAP_FILLER_MAX_IN + EDGE_EPSILON_IN
    && !gapCrossesWallOpening(openings, wall, leadingStart, measurement.before)
      ? measurement.before
      : 0;
  const trailingWidth = measurement.after >= FILLER_MIN_WIDTH_IN - EDGE_EPSILON_IN
    && measurement.after <= SMALL_GAP_FILLER_MAX_IN + EDGE_EPSILON_IN
    && !gapCrossesWallOpening(openings, wall, cabinetEnd, measurement.after)
      ? measurement.after
      : 0;

  let openingStart = cabinetStart;
  let remaining = 0;
  if (leadingWidth > 0 && trailingWidth > 0 && leadingWidth + trailingWidth <= SMALL_GAP_FILLER_MAX_IN + EDGE_EPSILON_IN) {
    openingStart = leadingStart;
    remaining = leadingWidth + trailingWidth;
  } else if (leadingWidth > 0) {
    openingStart = leadingStart;
    remaining = leadingWidth;
  } else if (trailingWidth > 0) {
    remaining = trailingWidth;
  }
  if (remaining < FILLER_MIN_WIDTH_IN - EDGE_EPSILON_IN || remaining > SMALL_GAP_FILLER_MAX_IN + EDGE_EPSILON_IN) return null;
  const roundedRemaining = Math.round(remaining * 1000) / 1000;
  return {
    cabinetUid,
    wall,
    layer,
    cabinetStart,
    cabinetSpan,
    openingStart,
    openingLength: cabinetSpan + roundedRemaining,
    remaining: roundedRemaining,
  };
}

export function canSplitSmallGapFiller(opportunity: Pick<SmallGapFillerOpportunity, "remaining">) {
  return opportunity.remaining + EDGE_EPSILON_IN >= FILLER_MIN_WIDTH_IN * 2;
}

/** Returns exact edge-contact coordinates; every piece and cabinet seam has zero overlap. */
export function smallGapFillerLayout(
  opportunity: SmallGapFillerOpportunity,
  mode: SmallGapFillerPlacementMode,
): SmallGapFillerLayout {
  const leftWidth = mode === "left"
    ? opportunity.remaining
    : mode === "split"
      ? opportunity.remaining / 2
      : 0;
  const rightWidth = opportunity.remaining - leftWidth;
  const cabinetStart = opportunity.openingStart + leftWidth;
  const pieces: SmallGapFillerLayout["pieces"] = [];
  if (leftWidth > EDGE_EPSILON_IN) pieces.push({ side: "left", start: opportunity.openingStart, width: leftWidth });
  if (rightWidth > EDGE_EPSILON_IN) pieces.push({ side: "right", start: cabinetStart + opportunity.cabinetSpan, width: rightWidth });
  return { cabinetStart, leftWidth, rightWidth, pieces };
}

/** Replaces only the cabinet being repositioned, then appends filler pieces without dropping unrelated saved items. */
export function appendSmallGapFillerPlacement(
  placed: readonly PlacedCabinet[],
  movedCabinet: PlacedCabinet,
  pieces: readonly PlacedCabinet[],
) {
  const preserved = placed.map((item) => item.uid === movedCabinet.uid ? movedCabinet : item);
  return appendCollisionFreePlacements(preserved, [...pieces]);
}

/** Removing either half removes the complete purchased filler group. */
export function removePlacedCabinetGroup(placed: readonly PlacedCabinet[], uid: string): PlacedCabinet[] {
  const target = placed.find((item) => item.uid === uid);
  if (!target?.fillerPieceGroupId) return placed.filter((item) => item.uid !== uid);
  return placed.filter((item) => item.fillerPieceGroupId !== target.fillerPieceGroupId);
}
