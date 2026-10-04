import { CLOSET_PARTS, masterTracProduct, type MasterTracProduct } from "./closet";
import {
  appendCollisionFreePlacements,
  cabinetWallRunSegment,
  wallCeilingMin,
  wallPlacementAt,
  type PlacedCabinet,
  type RoomData,
  type WallOpening,
  type WallSide,
} from "./design";

export type TowerBay = {
  /** Clear span: exactly the width of the selected manufacturer's shelf SKU. */
  widthIn: number;
  fixedBottomIn: number;
  fixedTopIn: number;
  adjustableHeightsIn: number[];
};
export type MasterTracTowerConfig = {
  finish: string;
  heightIn: 87 | 94;
  depthIn: 14.5 | 23.5;
  bays: TowerBay[];
};
export type TowerPlan = {
  boards: PlacedCabinet[];
  totalWidthIn: number;
  listSubtotal: number;
  /** No hardware/installation takeoff is implied by this board-level total. */
  count: number;
};
export type TowerResult = { ok: true; plan: TowerPlan } | { ok: false; reason: string };

const STRUCTURAL_FINISHES = ["Glacier White", "Slate Rift", "Spiced Mahogany"] as const;
const SHALLOW_WIDTHS = [12, 18, 24, 30, 36, 42] as const;
const DEEP_WIDTHS = [24, 30] as const;
const EPS = 0.01;
const PANEL_THICKNESS = 0.75;

export function towerWidths(depthIn: 14.5 | 23.5): number[] {
  return [...(depthIn === 14.5 ? SHALLOW_WIDTHS : DEEP_WIDTHS)];
}

export function defaultTowerConfig(finish = "Glacier White"): MasterTracTowerConfig {
  return {
    finish: STRUCTURAL_FINISHES.includes(finish as typeof STRUCTURAL_FINISHES[number]) ? finish : "Glacier White",
    heightIn: 87,
    depthIn: 14.5,
    bays: [24, 24].map((widthIn) => ({
      widthIn,
      fixedBottomIn: 6,
      fixedTopIn: 86.25,
      adjustableHeightsIn: [30, 54],
    })),
  };
}

export function towerTotalWidth(config: MasterTracTowerConfig): number {
  return config.bays.reduce((sum, bay) => sum + bay.widthIn, 0) + (config.bays.length + 1) * PANEL_THICKNESS;
}

function exactPart(config: MasterTracTowerConfig, category: "Panels (Floor)" | "Shelves", name: RegExp, widthIn: number, heightIn: number): MasterTracProduct | undefined {
  return CLOSET_PARTS.find((part) => part.placeable && part.packQty === 1
    && part.category === category && part.finish === config.finish
    && part.depthIn === config.depthIn && part.widthIn === widthIn
    && part.heightIn === heightIn && part.thicknessIn === PANEL_THICKNESS
    && name.test(part.description));
}

/** Creates real catalog boards and rejects the entire group if any part cannot be represented safely. */
export function planMasterTracTower(
  config: MasterTracTowerConfig,
  room: RoomData,
  wall: WallSide,
  startIn: number,
  placed: PlacedCabinet[],
  openings: WallOpening[] = [],
  towerId = "tower-preview",
  uid = (index: number) => `${towerId}-board-${index}`,
): TowerResult {
  if (room.vertices?.length || room.customWalls?.length) return { ok: false, reason: "Connected towers currently require a rectangular room. Place individual boards on measured custom walls." };
  if (!STRUCTURAL_FINISHES.includes(config.finish as typeof STRUCTURAL_FINISHES[number])) return { ok: false, reason: "Select one verified MasterTrac structural finish." };
  if (![87, 94].includes(config.heightIn) || ![14.5, 23.5].includes(config.depthIn)) return { ok: false, reason: "Choose an actual floor-panel height and depth from the 2022 worksheet." };
  if (config.bays.length < 2 || config.bays.length > 4) return { ok: false, reason: "Select two to four connected bays." };
  const totalWidthIn = towerTotalWidth(config);
  if (!Number.isFinite(totalWidthIn) || !Number.isFinite(startIn)) return { ok: false, reason: "Enter a valid wall start and bay widths." };
  const run = cabinetWallRunSegment(wall, room);
  if (startIn < run.start - EPS || startIn + totalWidthIn > run.start + run.length + EPS) {
    return { ok: false, reason: `The ${totalWidthIn}\" tower does not fit the selected wall segment (${run.length}\" available). Move its start or choose narrower bays.` };
  }
  if (config.heightIn > wallCeilingMin(room, wall) + EPS) return { ok: false, reason: `The ${config.heightIn}\" panels exceed the lowest ceiling on this wall.` };
  const blockingOpening = openings.find((opening) => opening.side === wall
    && Math.min(startIn + totalWidthIn, opening.offset + opening.width) - Math.max(startIn, opening.offset) > EPS);
  if (blockingOpening) return { ok: false, reason: `The tower crosses ${blockingOpening.label || "a door or window"}. Choose a clear wall span.` };

  const uprightRoles: ("left" | "center" | "right")[] = ["left", ...Array.from({ length: config.bays.length - 1 }, () => "center" as const), "right"];
  const uprightNames = [/\bLeft End\b/i, /\bCenter Upright\b/i, /\bRight End\b/i];
  const roleIndex = (role: "left" | "center" | "right") => role === "left" ? 0 : role === "center" ? 1 : 2;
  const uprights = uprightRoles.map((role) => exactPart(config, "Panels (Floor)", uprightNames[roleIndex(role)], PANEL_THICKNESS, config.heightIn));
  if (uprights.some((part) => !part)) return { ok: false, reason: "A matching left, center, or right upright SKU is missing for this finish, height, and depth." };

  let cursor = startIn;
  let sequence = 0;
  const boards: PlacedCabinet[] = [];
  function addBoard(part: MasterTracProduct, role: PlacedCabinet["masterTracTowerRole"], bayIndex: number | null, along: number, mountBottom?: number) {
    const position = wallPlacementAt(along, part.widthIn!, part.depthIn!, wall, room, undefined, false);
    boards.push({
      uid: uid(sequence++), cabinetId: 0, masterCode: part.sku,
      description: `${part.description} · ${part.finish}`,
      category: "MasterTrac Closet", subCategory: part.category,
      placement: part.placement!,
      x: position.x, y: position.y, rotation: position.rotation,
      wallId: position.wallId, wallOffset: position.wallOffset,
      width: part.widthIn!, height: part.heightIn!, depth: part.depthIn!,
      nominalWidth: part.widthIn!, nominalHeight: part.heightIn!, nominalDepth: part.depthIn!,
      numberOfDoors: 0, numberOfDrawers: 0,
      ...(mountBottom == null ? {} : { mountBottom, mountBottomAdjusted: true }),
      masterTracTowerId: towerId, masterTracTowerRole: role, masterTracTowerBayIndex: bayIndex,
    });
  }
  for (let index = 0; index < config.bays.length; index++) {
    const bay = config.bays[index];
    if (!towerWidths(config.depthIn).includes(bay.widthIn)) return { ok: false, reason: `Bay ${index + 1} has no exact ${bay.widthIn}\" straight shelf in the selected depth.` };
    const elevations = [bay.fixedBottomIn, ...bay.adjustableHeightsIn, bay.fixedTopIn];
    if (bay.adjustableHeightsIn.length > 5 || elevations.some((v) => !Number.isFinite(v) || v < 0 || v + PANEL_THICKNESS > config.heightIn + EPS)
      || [...elevations].sort((a, b) => a - b).some((v, i, sorted) => i > 0 && v - sorted[i - 1] < PANEL_THICKNESS - EPS)) {
      return { ok: false, reason: `Bay ${index + 1} shelves must be inside the uprights, with at least ¾\" between shelf bottoms and no overlaps.` };
    }
    addBoard(uprights[index]!, index === 0 ? "left" : "center", null, cursor);
    cursor += PANEL_THICKNESS;
    const fixed = exactPart(config, "Shelves", /\bFixed Shelf\b/i, bay.widthIn, PANEL_THICKNESS);
    const adjustable = exactPart(config, "Shelves", /\b(?:Adj|Adjustable) Shelf\b/i, bay.widthIn, PANEL_THICKNESS);
    if (!fixed || (bay.adjustableHeightsIn.length && !adjustable)) return { ok: false, reason: `No matching ${bay.widthIn}\" fixed/adjustable shelf SKU for bay ${index + 1}.` };
    addBoard(fixed, "fixed-bottom", index, cursor, bay.fixedBottomIn);
    bay.adjustableHeightsIn.forEach((height) => addBoard(adjustable!, "adjustable", index, cursor, height));
    addBoard(fixed, "fixed-top", index, cursor, bay.fixedTopIn);
    cursor += bay.widthIn;
  }
  addBoard(uprights.at(-1)!, "right", null, cursor);
  const collision = appendCollisionFreePlacements(placed, boards, room);
  if (collision.rejected.length) return { ok: false, reason: `The connected tower intersects an existing item or another tower at SKU ${collision.rejected[0].masterCode}. Nothing was placed.` };
  const listSubtotal = Math.round(boards.reduce((sum, board) => sum + (masterTracProduct(board.masterCode)?.listEachUsd ?? 0), 0) * 100) / 100;
  return { ok: true, plan: { boards: collision.placed.slice(placed.length), totalWidthIn, listSubtotal, count: boards.length } };
}

/** Reopens a saved group from its actual current boards, including moved adjustable shelves. */
export function towerConfigFromPlacements(placed: PlacedCabinet[], towerId: string): { config: MasterTracTowerConfig; wall: WallSide; startIn: number } | null {
  const group = placed.filter((board) => board.masterTracTowerId === towerId);
  const panels = group.filter((board) => ["left", "center", "right"].includes(board.masterTracTowerRole ?? ""))
    .sort((a, b) => (a.wallOffset ?? 0) - (b.wallOffset ?? 0));
  if (panels.length < 3 || panels.length > 5 || panels[0].masterTracTowerRole !== "left" || panels.at(-1)?.masterTracTowerRole !== "right") return null;
  const first = masterTracProduct(panels[0].masterCode);
  if (!first || (first.heightIn !== 87 && first.heightIn !== 94) || (first.depthIn !== 14.5 && first.depthIn !== 23.5)) return null;
  const wall = panels[0].wallId;
  if (wall !== "top" && wall !== "bottom" && wall !== "left" && wall !== "right") return null;
  const config: MasterTracTowerConfig = {
    finish: first.finish, heightIn: first.heightIn, depthIn: first.depthIn,
    bays: panels.slice(0, -1).map((panel, index) => {
      const widthIn = (panels[index + 1].wallOffset ?? NaN) - (panel.wallOffset ?? NaN) - PANEL_THICKNESS;
      const shelf = (role: string) => group.find((board) => board.masterTracTowerBayIndex === index && board.masterTracTowerRole === role)?.mountBottom;
      return {
        widthIn: Math.round(widthIn * 100) / 100,
        fixedBottomIn: shelf("fixed-bottom") ?? 6,
        fixedTopIn: shelf("fixed-top") ?? first.heightIn! - PANEL_THICKNESS,
        adjustableHeightsIn: group.filter((board) => board.masterTracTowerBayIndex === index && board.masterTracTowerRole === "adjustable")
          .map((board) => board.mountBottom ?? 0).sort((a, b) => a - b),
      };
    }),
  };
  return { config, wall, startIn: panels[0].wallOffset ?? 0 };
}
