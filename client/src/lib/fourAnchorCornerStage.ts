import { wallLabelToEngineWallId, type AutoBuildCatalogCandidate, type FourAnchorLayoutType, type FourAnchorOriginCorner, type FourAnchorRunDirection, type WallLabel } from "./fourAnchorAutoBuild";
import { isBaseEndCornerCabinet, isBlindCorner, isCornerCabinet, type RoomData } from "./design";

/** A real room vertex that the admin may explicitly populate after all anchors are seated. */
export type FourAnchorCornerSlot = {
  id: string;
  label: string;
  firstWall: WallLabel;
  secondWall: WallLabel;
};

/** An explicit source-priced selection: null deliberately preserves an open room corner. */
export type FourAnchorCornerChoice = {
  cabinetId: number | null;
  /** Required only when the chosen SKU is a configured base blind corner. */
  blindPullIn?: number;
};

/** The catalog fields needed for an accurate base-corner choice. */
export type AutoBuildCornerCandidate = AutoBuildCatalogCandidate & {
  id: number;
  width?: string | null;
  height?: string | null;
  depth?: string | null;
  cornerType?: string | null;
  pullMin?: number | null;
  pullMax?: number | null;
};

/**
 * This is deliberately independent from the four fixed anchors. A single-wall
 * or galley request has no shared wall vertex to populate; an L has one and a U
 * has two. Remaining perimeter vertices are left open unless separately placed
 * through the normal catalog workflow.
 */
export function fourAnchorCornerSlots(layoutType: FourAnchorLayoutType): FourAnchorCornerSlot[] {
  if (layoutType === "l-shape") {
    return [{ id: "wall-1-wall-2", label: "Corner between Wall 1 and Wall 2", firstWall: "Wall 1", secondWall: "Wall 2" }];
  }
  if (layoutType === "u-shape") {
    return [
      { id: "wall-1-wall-2", label: "Corner between Wall 1 and Wall 2", firstWall: "Wall 1", secondWall: "Wall 2" },
      { id: "wall-2-wall-3", label: "Corner between Wall 2 and Wall 3", firstWall: "Wall 2", secondWall: "Wall 3" },
    ];
  }
  return [];
}

/** Resolve the exact shared engine vertex for a selected wall-label pair. */
export function fourAnchorCornerSlotPoint(
  slot: FourAnchorCornerSlot,
  room: RoomData,
  originCorner: FourAnchorOriginCorner,
  runDirection: FourAnchorRunDirection,
): { x: number; y: number; firstWallId: string } | null {
  const first = wallLabelToEngineWallId(slot.firstWall, room, originCorner, runDirection);
  const second = wallLabelToEngineWallId(slot.secondWall, room, originCorner, runDirection);
  if (!first || !second) return null;
  const endpoints = [first.frame.start, first.frame.end];
  const shared = endpoints.find((point) => (
    Math.hypot(point.x - second.frame.start.x, point.y - second.frame.start.y) <= 0.01
    || Math.hypot(point.x - second.frame.end.x, point.y - second.frame.end.y) <= 0.01
  ));
  return shared ? { x: shared.x, y: shared.y, firstWallId: first.engineWallId } : null;
}

/**
 * The corner stage uses actual buyable base-corner catalog rows. A straight base,
 * sink base, wall corner, or BEC end-return cannot be offered or substituted.
 */
export function autoBuildCornerCatalog<T extends AutoBuildCornerCandidate>(catalog: readonly T[]): T[] {
  return catalog
    .filter((candidate) => (
      candidate.placement === "base"
      && candidate.isCornerCabinet !== false
      && isCornerCabinet(candidate.masterCode, candidate.description ?? undefined)
      && !isBaseEndCornerCabinet({
        masterCode: candidate.masterCode,
        description: candidate.description ?? "",
        cornerType: candidate.cornerType ?? null,
      })
    ))
    .sort((left, right) => (Number.parseFloat(right.width ?? "0") || 0) - (Number.parseFloat(left.width ?? "0") || 0));
}

export function isFourAnchorBlindCornerOption(candidate: Pick<AutoBuildCornerCandidate, "masterCode" | "description" | "placement" | "cornerType">): boolean {
  return candidate.placement === "base"
    && (candidate.cornerType === "blind-corner" || isBlindCorner(candidate.masterCode, candidate.description ?? undefined));
}
