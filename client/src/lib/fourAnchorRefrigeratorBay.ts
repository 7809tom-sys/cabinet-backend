import {
  dim,
  refrigeratorBayRunMetrics,
  refrigeratorEndPanelThickness,
  refrigeratorSurroundElevation,
  wallPlacementAt,
  wallPlacementAtUnbounded,
  type DesignCabinet,
  type PlacedCabinet,
  type RoomData,
} from "./design";

export type FourAnchorRefrigeratorBayResult =
  | {
      ok: true;
      additions: [PlacedCabinet, PlacedCabinet, PlacedCabinet];
      /** Full physical enclosure span: left panel, 1/2-in clearance, fridge, 1/2-in clearance, right panel. */
      reservation: { wall: string; start: number; end: number };
    }
  | { ok: false; message: string };

type Input = {
  refrigerator: PlacedCabinet;
  room: RoomData;
  caps: readonly DesignCabinet[];
  endPanels: readonly DesignCabinet[];
  styleId: number | null;
  makeUid: () => string;
};

/**
 * Four-anchor always creates a complete refrigerator bay before surrounding
 * straight runs are tiled: a 36-in appliance, both source-priced end panels,
 * and one matching 36-in source-priced refrigerator cabinet above. A filler is
 * never a refrigerator-bay member.
 */
export function buildMandatoryFourAnchorRefrigeratorBay({
  refrigerator,
  room,
  caps,
  endPanels,
  styleId,
  makeUid,
}: Input): FourAnchorRefrigeratorBayResult {
  if (Math.abs(refrigerator.width - 36) > 0.01) {
    return { ok: false, message: "Four-anchor refrigerator bays require the 36-inch refrigerator and matching 36-inch cabinet above." };
  }

  const cap = caps.find((candidate) => Math.abs(dim(candidate.width, 0) - 36) <= 0.01);
  if (!cap) {
    return { ok: false, message: "No source-priced 36-inch refrigerator cabinet above is available for the selected cabinet line." };
  }
  const panel = endPanels.find((candidate) => refrigeratorEndPanelThickness(candidate.width, 0) > 0);
  if (!panel) {
    return { ok: false, message: "No source-priced refrigerator end panel is available for the selected cabinet line." };
  }

  const bay = refrigeratorBayRunMetrics(refrigerator, room);
  const panelThickness = refrigeratorEndPanelThickness(panel.width, 0.75);
  const panelDepth = Math.max(0, dim(panel.depth, 0)) || 24;
  const capDepth = Math.max(0, dim(cap.depth, 0)) || 24;
  const capHeight = Math.max(0, dim(cap.height, 0)) || 24;
  const panelHeight = refrigeratorSurroundElevation(room, refrigerator.height ?? 70, capHeight).top;
  const capSpot = wallPlacementAt(bay.refrigeratorStart, 36, capDepth, bay.side, room);
  const leftPanelSpot = wallPlacementAtUnbounded(bay.openingStart - panelThickness, panelThickness, panelDepth, bay.side, room);
  const rightPanelSpot = wallPlacementAtUnbounded(bay.openingEnd, panelThickness, panelDepth, bay.side, room);
  const shared = { refrigeratorAssemblyId: refrigerator.uid, styleId };

  const bridge: PlacedCabinet = {
    uid: makeUid(),
    cabinetId: cap.id,
    masterCode: cap.masterCode,
    description: cap.description,
    category: cap.category,
    subCategory: cap.subCategory,
    placement: "wall",
    ...capSpot,
    width: 36,
    depth: capDepth,
    height: capHeight,
    rotation: capSpot.rotation,
    wallId: capSpot.wallId,
    wallOffset: capSpot.wallOffset,
    numberOfDoors: cap.numberOfDoors,
    numberOfDrawers: cap.numberOfDrawers,
    catalogImageUrl: cap.catalogImageUrl ?? null,
    refrigeratorAssemblyRole: "bridge",
    mountBottom: refrigeratorSurroundElevation(room, refrigerator.height ?? 70, capHeight).mountBottom,
    ...shared,
  };

  const makePanel = (side: "left-panel" | "right-panel", spot: ReturnType<typeof wallPlacementAtUnbounded>): PlacedCabinet => ({
    uid: makeUid(),
    cabinetId: panel.id,
    masterCode: panel.masterCode,
    description: panel.description,
    category: "Panel",
    subCategory: "Refrigerator End Panel",
    placement: "tall",
    ...spot,
    width: panelThickness,
    depth: panelDepth,
    height: panelHeight,
    rotation: spot.rotation,
    wallId: spot.wallId,
    wallOffset: spot.wallOffset,
    numberOfDoors: 0,
    numberOfDrawers: 0,
    catalogImageUrl: panel.catalogImageUrl ?? null,
    customProfile: "refrigerator-end-panel",
    refrigeratorAssemblyRole: side,
    mountBottom: 0,
    ...shared,
  });

  return {
    ok: true,
    additions: [bridge, makePanel("left-panel", leftPanelSpot), makePanel("right-panel", rightPanelSpot)],
    reservation: {
      wall: bay.side,
      start: bay.openingStart - panelThickness,
      end: bay.openingEnd + panelThickness,
    },
  };
}
