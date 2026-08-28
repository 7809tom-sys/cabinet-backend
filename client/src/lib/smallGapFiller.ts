import {
  FILLER_MIN_WIDTH_IN,
  cabinetWall,
  isFillerItem,
  placedFootprint,
  wallGaps,
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

function near(left: number, right: number) {
  return Math.abs(left - right) <= EDGE_EPSILON_IN;
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
  const horizontal = wall === "top" || wall === "bottom";
  const footprint = placedFootprint(cabinet);
  const cabinetStart = horizontal ? cabinet.x : cabinet.y;
  const cabinetSpan = horizontal ? footprint.w : footprint.d;
  const cabinetEnd = cabinetStart + cabinetSpan;
  const layer: "base" | "wall" = cabinet.placement === "wall" ? "wall" : "base";
  const adjacent = wallGaps(room, [...placed], [...openings], FILLER_MIN_WIDTH_IN)
    .filter((gap) => gap.side === wall && gap.layer === layer && gap.length <= SMALL_GAP_FILLER_MAX_IN + EDGE_EPSILON_IN);
  const leading = adjacent.find((gap) => near(gap.start + gap.length, cabinetStart));
  const trailing = adjacent.find((gap) => near(gap.start, cabinetEnd));
  const leadingWidth = leading?.length ?? 0;
  const trailingWidth = trailing?.length ?? 0;

  let openingStart = cabinetStart;
  let remaining = 0;
  if (leading && trailing && leadingWidth + trailingWidth <= SMALL_GAP_FILLER_MAX_IN + EDGE_EPSILON_IN) {
    openingStart = leading.start;
    remaining = leadingWidth + trailingWidth;
  } else if (leading) {
    openingStart = leading.start;
    remaining = leadingWidth;
  } else if (trailing) {
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

/** Removing either half removes the complete purchased filler group. */
export function removePlacedCabinetGroup(placed: readonly PlacedCabinet[], uid: string): PlacedCabinet[] {
  const target = placed.find((item) => item.uid === uid);
  if (!target?.fillerPieceGroupId) return placed.filter((item) => item.uid !== uid);
  return placed.filter((item) => item.fillerPieceGroupId !== target.fillerPieceGroupId);
}
