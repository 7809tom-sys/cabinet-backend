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
  /** Finished clear span between upright faces; default equals stock SKU width. */
  widthIn: number;
  /** Purchased stock shelf width if cut to a narrower installed bay. */
  stockWidthIn?: number;
  fixedBottomIn: number;
  fixedTopIn: number;
  adjustableHeightsIn: number[];
  /** Optional pictured MasterTrac storage concept; not a fabrication drawing. */
  storage?: TowerStorage;
};
export type TowerStorage =
  | { kind: "drawers"; count: number; drawerSize: "small" | "large"; frontStyle: "slab" | "shaker" }
  | { kind: "shoe"; count: number; fenceFinish: "Chrome" | "Matt Nickel" };
export type MasterTracTowerConfig = {
  finish: string;
  heightIn: 87 | 94;
  depthIn: 14.5 | 23.5;
  bays: TowerBay[];
  /** 2022 SKU outer footprint is sourced; curved edge and join are illustrative. */
  corner?: "start" | "end";
  cornerShelfType?: "fixed" | "adjustable";
  cornerElevationIn?: number;
};
export type TowerPlan = {
  boards: PlacedCabinet[];
  totalWidthIn: number;
  listSubtotal: number;
  /** Actual 2022 SKU references; not a physical-hardware or checkout takeoff. */
  conceptualItems: { sku: string; quantity: number; listEachUsd: number; description: string }[];
  /** No hardware/installation takeoff is implied by this board-level total. */
  count: number;
};
export type TowerResult = { ok: true; plan: TowerPlan } | { ok: false; reason: string };

const STRUCTURAL_FINISHES = ["Glacier White", "Slate Rift", "Spiced Mahogany"] as const;
const SHALLOW_WIDTHS = [12, 18, 24, 30, 36, 42] as const;
const DEEP_WIDTHS = [24, 30] as const;
const EPS = 0.01;
const PANEL_THICKNESS = 0.75;
export const CORNER_FOOTPRINT_IN = 29.5;
export type MasterTracCornerBoard = PlacedCabinet & {
  masterTracCorner: { side: "start" | "end"; type: "fixed" | "adjustable"; illustrative: true; hJointSku: string | null };
};

/** One each, rather than the box-of-100 channel SKUs. No hardware geometry is implied. */
export function masterTracCornerParts(finish: string, type: "fixed" | "adjustable" = "fixed"): { shelf: MasterTracProduct; joint: MasterTracProduct | null } | null {
  const shelf = CLOSET_PARTS.find((part) => part.category === "Shelves" && part.description.trim() === (type === "fixed" ? "Fixed Corner Shelf" : "Adj Corner Shelf")
    && part.finish === finish && part.packQty === 1 && part.lengthIn === CORNER_FOOTPRINT_IN
    && part.depthIn === CORNER_FOOTPRINT_IN && part.thicknessIn === PANEL_THICKNESS);
  // The 2022 sheet lists only White and Brown one-each channels: for Slate Rift,
  // show the real White accessory finish explicitly, not a fabricated Slate SKU.
  const hardwareFinish: Record<string, string> = { "Glacier White": "White", "Slate Rift": "White", "Spiced Mahogany": "Brown" };
  const joint = CLOSET_PARTS.find((part) => part.category === "Hardware" && part.finish === hardwareFinish[finish]
    && part.description.includes('14.5" Corner Shelf H-Joint Channel (1 each)') && part.packQty === 1);
  return shelf && (type === "adjustable" || joint) ? { shelf, joint: type === "fixed" ? joint! : null } : null;
}

export function isMasterTracCornerBoard(board: PlacedCabinet): board is MasterTracCornerBoard {
  const candidate = board as MasterTracCornerBoard;
  return candidate.category === "MasterTrac Closet" && candidate.masterTracCorner?.illustrative === true
    && (candidate.masterTracCorner.side === "start" || candidate.masterTracCorner.side === "end")
    && ["Fixed Corner Shelf", "Adj Corner Shelf"].includes(masterTracProduct(candidate.masterCode)?.description.trim() ?? "");
}

/** Floor-mount manual pp. 5–9, 36–38: 18/24/30 bay matches, 14-in drawer
 * slides, and a fence on the front of the tilted shoe board. No box envelope,
 * slide side clearance, drilled-hole pitch, or fence cross-section is supplied. */
export function towerStorageSkuReferences(
  storage: TowerStorage,
  widthIn: number,
  depthIn: number,
  finish: string,
): { ok: true; parts: { product: MasterTracProduct; quantity: number }[] } | { ok: false; reason: string } {
  const reject = (reason: string) => ({ ok: false as const, reason });
  if (depthIn !== 14.5 || ![18, 24, 30].includes(widthIn)) return reject("Conceptual drawers and shoe shelves are available only for the manual's 18/24/30-inch shallow floor bays.");
  const find = (category: string, match: (part: MasterTracProduct) => boolean) =>
    CLOSET_PARTS.find((part) => part.category === category && part.packQty === 1 && match(part));
  if (storage.kind === "drawers") {
    if (!Number.isInteger(storage.count) || storage.count < 1 || storage.count > (storage.drawerSize === "small" ? 3 : 2)) return reject("Choose one to three small or one to two large illustrative drawers per bay.");
    if (storage.drawerSize === "small" && storage.frontStyle !== "slab") return reject("The 2022 assortment has no matching small Shaker drawer-front SKU.");
    const box = find("Drawer Boxes", (p) => p.finish === "Hard Maple" && !/Hutch/i.test(p.description)
      && new RegExp(`^${widthIn}[\"'’]*\\s+${storage.drawerSize}\\s+Drawer`, "i").test(p.description));
    const front = find("Drawer Fronts", (p) => p.finish === finish
      && new RegExp(`^${widthIn}[\"'’]*\\s+${storage.drawerSize}\\s+${storage.frontStyle}\\s+Drawer Front`, "i").test(p.description.replace(/\s+/g, " ")));
    if (!box || !front) return reject(`No matching ${widthIn}-inch ${storage.drawerSize} drawer assembly and ${storage.frontStyle} front for ${finish} in the 2022 source.`);
    return { ok: true, parts: [{ product: box, quantity: storage.count }, { product: front, quantity: storage.count }] };
  }
  if (storage.kind !== "shoe" || !Number.isInteger(storage.count) || storage.count < 1 || storage.count > 4 || !["Chrome", "Matt Nickel"].includes(storage.fenceFinish)) return reject("Choose one to four illustrated shoe shelves and a sourced Chrome or Matt Nickel fence for each.");
  const shelf = find("Shelves", (p) => p.finish === finish && new RegExp(`^${widthIn}[\"'’]*\\s+Shoe Shelf`, "i").test(p.description));
  const fence = find("Accessories", (p) => p.finish === storage.fenceFinish && new RegExp(`^${widthIn}[\"'’”]*\\s+Shoe Fence`, "i").test(p.description));
  if (!shelf || !fence) return reject(`No matching ${widthIn}-inch shoe shelf and ${storage.fenceFinish} fence in the 2022 source.`);
  return { ok: true, parts: [{ product: shelf, quantity: storage.count }, { product: fence, quantity: storage.count }] };
}

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
  return config.bays.reduce((sum, bay) => sum + bay.widthIn, 0) + (config.bays.length + 1) * PANEL_THICKNESS
    + (config.corner ? CORNER_FOOTPRINT_IN : 0);
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
  if (config.corner && config.corner !== "start" && config.corner !== "end") return { ok: false, reason: "Choose a supported left or right corner." };
  if (config.cornerShelfType && config.cornerShelfType !== "fixed" && config.cornerShelfType !== "adjustable") return { ok: false, reason: "Choose the fixed or adjustable sourced corner shelf." };
  if (config.corner && config.depthIn !== 14.5) return { ok: false, reason: "The 2022 one-each H-joint channel is specified for 14.5-inch straight bays only; choose the 14.5-inch boards." };
  const cornerType = config.cornerShelfType ?? "fixed";
  const cornerParts = config.corner ? masterTracCornerParts(config.finish, cornerType) : null;
  if (config.corner && !cornerParts) return { ok: false, reason: "No matching 2022 corner shelf and compatible fixed-shelf H-joint channel are available in this finish." };
  const adjacentTop = config.corner === "start" ? config.bays[0].fixedTopIn : config.bays.at(-1)!.fixedTopIn;
  const cornerElevation = config.cornerElevationIn ?? adjacentTop;
  if (config.corner && (!Number.isFinite(cornerElevation) || cornerElevation < 0 || cornerElevation + PANEL_THICKNESS > config.heightIn + EPS)) {
    return { ok: false, reason: "The corner shelf elevation must fit within the selected floor panel height." };
  }
  if (config.corner && cornerType === "fixed" && Math.abs(cornerElevation - adjacentTop) > EPS) {
    return { ok: false, reason: "The fixed corner and adjacent fixed top shelf must have the same elevation for their H-joint reference." };
  }
  const totalWidthIn = towerTotalWidth(config);
  if (!Number.isFinite(totalWidthIn) || !Number.isFinite(startIn)) return { ok: false, reason: "Enter a valid wall start and bay widths." };
  const run = cabinetWallRunSegment(wall, room);
  if (config.corner && Math.abs(startIn - (config.corner === "start" ? run.start : run.start + run.length - totalWidthIn)) > EPS) {
    return { ok: false, reason: "The illustrated corner shelf must start or end at the selected wall segment's corner." };
  }
  const roomDepthOnWall = wall === "top" || wall === "bottom" ? room.depth : room.width;
  if (config.corner && roomDepthOnWall < CORNER_FOOTPRINT_IN - EPS) return { ok: false, reason: "The corner shelf's 29.5-inch source footprint exceeds the room depth." };
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
  const conceptualItems: TowerPlan["conceptualItems"] = [];
  function addCorner(along: number, side: "start" | "end") {
    const parts = cornerParts!;
    const position = wallPlacementAt(along, CORNER_FOOTPRINT_IN, CORNER_FOOTPRINT_IN, wall, room, undefined, false);
    const cornerBoard: MasterTracCornerBoard = {
      uid: uid(sequence++), cabinetId: 0, masterCode: parts.shelf.sku,
      description: `${parts.shelf.description} · ${parts.shelf.finish} · illustrative curved edge`,
      category: "MasterTrac Closet", subCategory: "Shelves", placement: "wall",
      x: position.x, y: position.y, rotation: position.rotation,
      wallId: position.wallId, wallOffset: position.wallOffset,
      width: CORNER_FOOTPRINT_IN, height: PANEL_THICKNESS, depth: CORNER_FOOTPRINT_IN,
      nominalWidth: CORNER_FOOTPRINT_IN, nominalHeight: PANEL_THICKNESS, nominalDepth: CORNER_FOOTPRINT_IN,
      mountBottom: cornerElevation, mountBottomAdjusted: true,
      numberOfDoors: 0, numberOfDrawers: 0,
      masterTracTowerId: towerId,
      masterTracCorner: { side, type: cornerType, illustrative: true, hJointSku: parts.joint?.sku ?? null },
    };
    boards.push(cornerBoard);
    if (parts.joint) conceptualItems.push({ sku: parts.joint.sku, quantity: 1, listEachUsd: parts.joint.listEachUsd, description: `${parts.joint.description} · ${parts.joint.finish}` });
  }
  function addBoard(part: MasterTracProduct, role: PlacedCabinet["masterTracTowerRole"], bayIndex: number | null, along: number, mountBottom?: number, installedWidthIn = part.widthIn!) {
    const position = wallPlacementAt(along, installedWidthIn, part.depthIn!, wall, room, undefined, false);
    const cut = installedWidthIn < part.widthIn! - EPS ? {
      stockWidthIn: part.widthIn!, installedWidthIn,
      offcutIn: Math.round((part.widthIn! - installedWidthIn) * 1000) / 1000,
    } : null;
    boards.push({
      uid: uid(sequence++), cabinetId: 0, masterCode: part.sku,
      description: `${part.description} · ${part.finish}${cut ? ` · cut to ${installedWidthIn}″` : ""}`,
      category: "MasterTrac Closet", subCategory: part.category,
      placement: part.placement!,
      x: position.x, y: position.y, rotation: position.rotation,
      wallId: position.wallId, wallOffset: position.wallOffset,
      width: installedWidthIn, height: part.heightIn!, depth: part.depthIn!,
      nominalWidth: part.widthIn!, nominalHeight: part.heightIn!, nominalDepth: part.depthIn!,
      numberOfDoors: 0, numberOfDrawers: 0,
      ...(mountBottom == null ? {} : { mountBottom, mountBottomAdjusted: true }),
      masterTracTowerId: towerId, masterTracTowerRole: role, masterTracTowerBayIndex: bayIndex,
      ...(cut ? { masterTracShelfCut: cut } : {}),
    });
  }
  if (config.corner === "start") {
    addCorner(cursor, "start");
    cursor += CORNER_FOOTPRINT_IN;
  }
  for (let index = 0; index < config.bays.length; index++) {
    const bay = config.bays[index];
    const stockWidthIn = bay.stockWidthIn ?? bay.widthIn;
    if (!Number.isFinite(bay.widthIn) || !Number.isFinite(stockWidthIn)
      || bay.widthIn < SHALLOW_WIDTHS[0] || bay.widthIn > stockWidthIn
      || !towerWidths(config.depthIn).includes(stockWidthIn)) {
      return { ok: false, reason: `Bay ${index + 1}: choose a sourced stock shelf with an installed width between 12 inches and its stock width.` };
    }
    if (bay.stockWidthIn != null && bay.storage) return { ok: false, reason: `Bay ${index + 1}: drawer/shoe fit is not verified with cut shelves. Choose open shelves or an uncut bay.` };
    if (bay.storage && bay.adjustableHeightsIn.length) return { ok: false, reason: `Bay ${index + 1}: choose storage or adjustable shelves here, not both.` };
    const storage = bay.storage ? towerStorageSkuReferences(bay.storage, bay.widthIn, config.depthIn, config.finish) : null;
    if (storage && !storage.ok) return { ok: false, reason: `Bay ${index + 1}: ${storage.reason}` };
    const illustrationHeight = bay.storage?.kind === "drawers"
      ? bay.storage.count * (bay.storage.drawerSize === "small" ? 7 : 12)
      : bay.storage?.kind === "shoe" ? bay.storage.count * 12 : 0;
    if (bay.storage && bay.fixedTopIn - bay.fixedBottomIn < illustrationHeight + PANEL_THICKNESS + 1) {
      return { ok: false, reason: `Bay ${index + 1} has too little open height for the selected illustrated storage. Separate the fixed shelves.` };
    }
    const elevations = [bay.fixedBottomIn, ...bay.adjustableHeightsIn, bay.fixedTopIn];
    if (bay.adjustableHeightsIn.length > 5 || elevations.some((v) => !Number.isFinite(v) || v < 0 || v + PANEL_THICKNESS > config.heightIn + EPS)
      || [...elevations].sort((a, b) => a - b).some((v, i, sorted) => i > 0 && v - sorted[i - 1] < PANEL_THICKNESS - EPS)) {
      return { ok: false, reason: `Bay ${index + 1} shelves must be inside the uprights, with at least ¾\" between shelf bottoms and no overlaps.` };
    }
    addBoard(uprights[index]!, index === 0 ? "left" : "center", null, cursor);
    cursor += PANEL_THICKNESS;
    const fixed = exactPart(config, "Shelves", /\bFixed Shelf\b/i, stockWidthIn, PANEL_THICKNESS);
    const adjustable = exactPart(config, "Shelves", /\b(?:Adj|Adjustable) Shelf\b/i, stockWidthIn, PANEL_THICKNESS);
    if (!fixed || (bay.adjustableHeightsIn.length && !adjustable)) return { ok: false, reason: `No matching ${stockWidthIn} inch stock fixed/adjustable shelf SKU for bay ${index + 1}.` };
    addBoard(fixed, "fixed-bottom", index, cursor, bay.fixedBottomIn, bay.widthIn);
    if (storage?.ok && bay.storage) {
      const refs = storage.parts.map(({ product, quantity }) => {
        conceptualItems.push({ sku: product.sku, quantity, listEachUsd: product.listEachUsd, description: product.description });
        return product.sku;
      });
      boards.at(-1)!.masterTracConceptStorage = { ...bay.storage, fixedTopIn: bay.fixedTopIn, skuReferences: refs };
    }
    bay.adjustableHeightsIn.forEach((height) => addBoard(adjustable!, "adjustable", index, cursor, height, bay.widthIn));
    addBoard(fixed, "fixed-top", index, cursor, bay.fixedTopIn, bay.widthIn);
    cursor += bay.widthIn;
  }
  addBoard(uprights.at(-1)!, "right", null, cursor);
  cursor += PANEL_THICKNESS;
  if (config.corner === "end") addCorner(cursor, "end");
  const collision = appendCollisionFreePlacements(placed, boards, room);
  if (collision.rejected.length) return { ok: false, reason: `The connected tower intersects an existing item or another tower at SKU ${collision.rejected[0].masterCode}. Nothing was placed.` };
  const listSubtotal = Math.round((boards.reduce((sum, board) => sum + (masterTracProduct(board.masterCode)?.listEachUsd ?? 0), 0)
    + conceptualItems.reduce((sum, item) => sum + item.listEachUsd * item.quantity, 0)) * 100) / 100;
  return { ok: true, plan: { boards: collision.placed.slice(placed.length), totalWidthIn, listSubtotal, conceptualItems, count: boards.length } };
}

/** Real SKU List references for conceptual storage and illustrated H-joint; never checkout. */
export function towerConceptReferenceSubtotal(placed: PlacedCabinet[]): number {
  return Math.round(placed.reduce((sum, board) => {
    const storage = board.masterTracConceptStorage;
    const corner = isMasterTracCornerBoard(board) && board.masterTracCorner.hJointSku ? masterTracProduct(board.masterTracCorner.hJointSku)?.listEachUsd ?? 0 : 0;
    return sum + corner + (storage ? storage.skuReferences.reduce((partSum, sku) => partSum + (masterTracProduct(sku)?.listEachUsd ?? 0) * storage.count, 0) : 0);
  }, 0) * 100) / 100;
}

/** Reopens a saved group from its actual current boards, including moved adjustable shelves. */
export function towerConfigFromPlacements(placed: PlacedCabinet[], towerId: string): { config: MasterTracTowerConfig; wall: WallSide; startIn: number } | null {
  const group = placed.filter((board) => board.masterTracTowerId === towerId);
  const corner = group.find(isMasterTracCornerBoard);
  const panels = group.filter((board) => ["left", "center", "right"].includes(board.masterTracTowerRole ?? ""))
    .sort((a, b) => (a.wallOffset ?? 0) - (b.wallOffset ?? 0));
  if (panels.length < 3 || panels.length > 5 || panels[0].masterTracTowerRole !== "left" || panels.at(-1)?.masterTracTowerRole !== "right") return null;
  const first = masterTracProduct(panels[0].masterCode);
  if (!first || (first.heightIn !== 87 && first.heightIn !== 94) || (first.depthIn !== 14.5 && first.depthIn !== 23.5)) return null;
  const wall = panels[0].wallId;
  if (wall !== "top" && wall !== "bottom" && wall !== "left" && wall !== "right") return null;
  const config: MasterTracTowerConfig = {
    finish: first.finish, heightIn: first.heightIn, depthIn: first.depthIn,
    ...(corner ? {
      corner: corner.masterTracCorner.side,
      cornerShelfType: corner.masterTracCorner.type,
      ...(corner.masterTracCorner.type === "adjustable" ? { cornerElevationIn: corner.mountBottom ?? 42 } : {}),
    } : {}),
    bays: panels.slice(0, -1).map((panel, index) => {
      const widthIn = (panels[index + 1].wallOffset ?? NaN) - (panel.wallOffset ?? NaN) - PANEL_THICKNESS;
      const shelf = (role: string) => group.find((board) => board.masterTracTowerBayIndex === index && board.masterTracTowerRole === role)?.mountBottom;
      const cut = group.find((board) => board.masterTracTowerBayIndex === index && board.masterTracTowerRole === "fixed-bottom")?.masterTracShelfCut;
      return {
        widthIn: Math.round(widthIn * 100) / 100,
        ...(cut ? { stockWidthIn: cut.stockWidthIn } : {}),
        fixedBottomIn: shelf("fixed-bottom") ?? 6,
        fixedTopIn: shelf("fixed-top") ?? first.heightIn! - PANEL_THICKNESS,
        adjustableHeightsIn: group.filter((board) => board.masterTracTowerBayIndex === index && board.masterTracTowerRole === "adjustable")
          .map((board) => board.mountBottom ?? 0).sort((a, b) => a - b),
        storage: (() => {
          const saved = group.find((board) => board.masterTracTowerBayIndex === index && board.masterTracTowerRole === "fixed-bottom")?.masterTracConceptStorage;
          if (saved?.kind === "shoe") return { kind: "shoe" as const, count: saved.count, fenceFinish: saved.fenceFinish ?? "Chrome" };
          if (saved?.kind === "drawers") return { kind: "drawers" as const, count: saved.count, drawerSize: saved.drawerSize ?? "small", frontStyle: saved.frontStyle ?? "slab" };
          return undefined;
        })(),
      };
    }),
  };
  return { config, wall, startIn: (panels[0].wallOffset ?? 0) - (corner?.masterTracCorner.side === "start" ? CORNER_FOOTPRINT_IN : 0) };
}
