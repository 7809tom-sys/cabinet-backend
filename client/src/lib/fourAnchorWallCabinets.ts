import { autoFillSpan } from "./autofill";
import { buildRequiredBlindCornerFiller, requiresConfiguredBlindCornerFiller } from "./blindCornerRequiredFiller";
import { cabinetDrawingType, isWallBlindCornerCabinet } from "./cabinetGraphics";
import type { CatalogFillerCandidate } from "./catalogFiller";
import {
  COLLISION_EPSILON_IN, WALL_OPENING_CLEARANCE_IN, appendCollisionFreePlacements,
  cabinetPlacementCollisionDetail, cabinetWall, dim, footprintDepth, formatInches, freeSegmentsOnWall,
  isBaseBlindCorner, isCornerCabinet, isPanelItem, isRangeOrOven, isRefrigerator, normalizeBlindCornerDoorSides,
  ordinaryWallMountBottom, wallCeilingMin, wallPlacementAt, wallRunCornerPlacement, wallRunFrame, wallRunOffset,
  wallRunSpan, type DesignCabinet, type PlacedCabinet, type RoomData, type WallOpening,
} from "./design";

export type FourAnchorUpperCorner = {
  base: PlacedCabinet;
  point: { x: number; y: number; firstWallId: string };
};

/** Real catalogs rarely sell exactly 30/36/42: frameless uppers are 30.25/35.25/40.25. */
export const WALL_HEIGHT_MATCH_TOLERANCE_IN = 2;
const SAME_HEIGHT_IN = 0.005;

const NOT_A_STRAIGHT_UPPER = /glass|open shelf|plate rack|wine|microwave|refrigerator|hood|garage|stacker/i;

function isStraightStandardUpper(source: DesignCabinet): boolean {
  return cabinetDrawingType(source) === "standard-door"
    && source.glassDoor !== true && source.isCornerCabinet !== true
    && !isCornerCabinet(source.masterCode, source.description)
    && !NOT_A_STRAIGHT_UPPER.test(`${source.masterCode} ${source.description} ${source.subCategory ?? ""}`);
}

/**
 * The upper height the selected line actually sells for the admin's 30/36/42
 * request: the available standard-door wall height closest to the nominal one,
 * within two inches. Exact heights always win; ties choose the shorter box so
 * it can never collide with the ceiling.
 */
export function resolveWallHeightClass(catalog: readonly DesignCabinet[], nominalIn: number): number | null {
  const heights = Array.from(new Set(catalog
    .filter((source) => source.id > 0 && source.placement === "wall" && dim(source.width, 0) > 0
      && dim(source.depth, 0) > 0 && isStraightStandardUpper(source))
    .map((source) => Math.round(dim(source.height, 0) * 1000) / 1000)))
    .filter((height) => height > 0 && Math.abs(height - nominalIn) <= WALL_HEIGHT_MATCH_TOLERANCE_IN + 1e-9);
  if (!heights.length) return null;
  return heights.sort((a, b) => Math.abs(a - nominalIn) - Math.abs(b - nominalIn) || a - b)[0]!;
}

/** Final stage only: the measured appliances, selected corners and base runs are immutable. */
export function buildFourAnchorWallCabinets(input: {
  placed: PlacedCabinet[];
  room: RoomData;
  openings: WallOpening[];
  catalog: DesignCabinet[];
  wallCabinetHeightIn: 30 | 36 | 42;
  styleId: number | null;
  makeUid: () => string;
  corners?: FourAnchorUpperCorner[];
  /** Selected-line fillers; required for a wall blind corner's integrated 3″ face filler. */
  catalogFillers?: readonly CatalogFillerCandidate[];
}): {
  placed: PlacedCabinet[];
  additions: PlacedCabinet[];
  skipped: string[];
  /** The real catalog height used (for example 30.25 for a requested 30). Null when the line has none. */
  heightUsedIn: number | null;
} {
  const { room, openings } = input;
  let working = [...input.placed];
  const additions: PlacedCabinet[] = [];
  const skipped: string[] = [];
  // Only when the line sells no wall cabinet of any kind near the request is the height itself missing.
  // A line with just specialty uppers (glass, wine, open shelf) still has that height; its ordinary
  // uppers are simply absent, which the per-run messages below report accurately.
  const sellsWallCabinetNearHeight = input.catalog.some((source) => source.id > 0 && source.placement === "wall"
    && dim(source.width, 0) > 0 && dim(source.depth, 0) > 0
    && Math.abs(dim(source.height, 0) - input.wallCabinetHeightIn) <= WALL_HEIGHT_MATCH_TOLERANCE_IN + 1e-9);
  const heightUsedIn = resolveWallHeightClass(input.catalog, input.wallCabinetHeightIn)
    ?? (sellsWallCabinetNearHeight ? input.wallCabinetHeightIn : null);
  if (heightUsedIn == null) {
    skipped.push(`No source-priced ${input.wallCabinetHeightIn}″ wall cabinet exists in this cabinet line (nearest sold height is more than ${WALL_HEIGHT_MATCH_TOLERANCE_IN}″ away), so no wall cabinets were added.`);
    return { placed: working, additions, skipped, heightUsedIn };
  }
  const height = heightUsedIn;
  const eligible = input.catalog.filter((source) => source.id > 0
    && source.placement === "wall" && Math.abs(dim(source.height, 0) - height) <= SAME_HEIGHT_IN
    && dim(source.width, 0) > 0 && dim(source.depth, 0) > 0);
  const standard = eligible.filter(isStraightStandardUpper);
  const corners = eligible.filter((source) => ["diagonal-corner", "l-corner", "triangle-corner"].includes(cabinetDrawingType(source)))
    .sort((a, b) => dim(b.width, 0) - dim(a.width, 0));
  const wallBlinds = eligible.filter((source) => isWallBlindCornerCabinet(source))
    .sort((a, b) => dim(b.width, 0) - dim(a.width, 0));
  const makeCandidate = (source: DesignCabinet): PlacedCabinet => ({
    uid: input.makeUid(), cabinetId: source.id, masterCode: source.masterCode, description: source.description,
    category: source.category, subCategory: source.subCategory, placement: "wall",
    x: 0, y: 0, rotation: 0, width: dim(source.width, 0), depth: footprintDepth(source), height,
    mountBottom: ordinaryWallMountBottom({ ...source, height }),
    numberOfDoors: source.numberOfDoors, numberOfDrawers: source.numberOfDrawers,
    cornerType: source.cornerType ?? null, fillerRequired: source.fillerRequired ?? false,
    pullMin: source.pullMin ?? null, pullMax: source.pullMax ?? null,
    catalogImageUrl: source.catalogImageUrl ?? null,
    styleId: input.styleId,
  });
  const commit = (candidate: PlacedCabinet): boolean => {
    const bottom = candidate.mountBottom ?? 54;
    const wall = cabinetWall(candidate, room);
    if (bottom + height > wallCeilingMin(room, wall) + COLLISION_EPSILON_IN) return false;
    const start = wallRunOffset(candidate, wall, room);
    const span = wallRunSpan(candidate, wall, room);
    const fits = freeSegmentsOnWall(wall, room, working, openings, span, WALL_OPENING_CLEARANCE_IN,
      "wall", true, candidate, candidate.depth).some((segment) => start >= segment.start - COLLISION_EPSILON_IN
        && start + span <= segment.start + segment.length + COLLISION_EPSILON_IN);
    if (!fits || cabinetPlacementCollisionDetail(candidate, working, room)) return false;
    const result = appendCollisionFreePlacements(working, [candidate], room);
    if (result.rejected.length) return false;
    working = result.placed;
    additions.push(candidate);
    return true;
  };
  // Seat actual upper corners at the same vertex before the straight uppers.
  // Direct wallRunCornerPlacement cannot silently choose a different free corner.
  for (const { base, point } of input.corners ?? []) {
    const frame = wallRunFrame(point.firstWallId, room);
    let placed = false;
    if (frame) {
      const at = Math.hypot(frame.start.x - point.x, frame.start.y - point.y) <= 0.01 ? "start" : "end";
      if (isBaseBlindCorner(base)) {
        // A base blind corner gets a wall blind corner at the same vertex, the
        // widest one that does not overhang its base, with its integrated 3″ filler.
        for (const source of wallBlinds.filter((row) => dim(row.width, 0) <= base.width + COLLISION_EPSILON_IN)) {
          const candidate = makeCandidate(source);
          const spot = wallRunCornerPlacement(candidate, frame, at, room);
          if (!spot) continue;
          const seated = { ...candidate, ...spot };
          const snapshot = working;
          const addedBefore = additions.length;
          if (!commit(seated)) continue;
          if (requiresConfiguredBlindCornerFiller(seated)) {
            const required = buildRequiredBlindCornerFiller(seated, room, input.catalogFillers ?? [], input.makeUid, input.styleId);
            if (!required.ok) {
              working = snapshot; additions.splice(addedBefore);
              skipped.push(`${seated.masterCode}: its required ${formatInches(3)} wall filler is not sold in this cabinet line.`);
              continue;
            }
            working = [...working, required.filler];
            additions.push(required.filler);
          }
          placed = true;
          break;
        }
      } else {
        for (const source of corners.filter((row) => dim(row.width, 0) <= base.width + COLLISION_EPSILON_IN)) {
          const candidate = makeCandidate(source);
          const spot = wallRunCornerPlacement(candidate, frame, at, room);
          if (spot && commit({ ...candidate, ...spot })) { placed = true; break; }
        }
      }
    }
    if (!placed) skipped.push(`${base.masterCode} corner: no compatible ${height}″ upper corner fits the selected vertex.`);
  }

  for (const lower of input.placed) {
    if (lower.placement !== "base" && lower.placement !== "appliance") continue;
    if (isRefrigerator(lower) || isRangeOrOven(lower.masterCode, lower.description)
      || isCornerCabinet(lower.masterCode, lower.description) || isPanelItem(lower)
      || /filler|scribe/i.test(`${lower.masterCode} ${lower.description} ${lower.subCategory ?? ""}`)) continue;
    if (lower.placement === "appliance" && !/^DW[-_]?/i.test(lower.masterCode)) continue;
    const wall = cabinetWall(lower, room);
    const span = wallRunSpan(lower, wall, room);
    const start = wallRunOffset(lower, wall, room);
    const exact = standard.find((source) => Math.abs(dim(source.width, 0) - span) <= COLLISION_EPSILON_IN);
    // When a single same-width SKU is unavailable, use real smaller upper boxes
    // only if together they span the lower exactly. Never stretch a box or invent a SKU.
    const tiled = exact ? [exact] : autoFillSpan(span, "kitchen",
      standard.map((row) => ({ ...row, placement: "base" as const })), { strategy: "largest-first" });
    const sources = Array.isArray(tiled) ? tiled : tiled.items.filter((item) => !item.isFiller)
      .map((item) => standard.find((row) => row.id === item.cabinet.id)!);
    if (!sources.length || Math.abs(sources.reduce((sum, source) => sum + dim(source.width, 0), 0) - span) > COLLISION_EPSILON_IN) {
      skipped.push(`${lower.masterCode}: no source-sized ${height}″ wall cabinet matches its ${span}″ run.`);
      continue;
    }
    // Each aligned lower projection is atomic: a window/corner/ceiling blocker
    // leaves the whole upper group unplaced rather than creating a partial mismatch.
    const before = working;
    const addedBefore = additions.length;
    let along = start;
    let complete = true;
    for (const source of sources) {
      const candidate = makeCandidate(source);
      const spot = wallPlacementAt(along, candidate.width, candidate.depth, wall, room);
      if (!commit({ ...candidate, ...spot })) { complete = false; break; }
      along += candidate.width;
    }
    if (!complete) {
      working = before;
      additions.splice(addedBefore);
      skipped.push(`${lower.masterCode}: aligned upper needs review for an opening, corner, occupied bay, or ceiling clearance.`);
    }
  }
  // A wall blind corner exposes the door away from its blind side.
  working = normalizeBlindCornerDoorSides(working, room);
  const uids = new Set(additions.map((item) => item.uid));
  return { placed: working, additions: working.filter((item) => uids.has(item.uid)), skipped, heightUsedIn };
}
