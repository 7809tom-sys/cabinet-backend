import {
  type DesignCabinet,
  type PlacedCabinet,
  type RoomData,
  bridgeHeightForWallHeight,
  cabinetWall,
  mountedMicrowaveOverRangeSpot,
	OVER_RANGE_MICROWAVE_BRIDGE_MOUNT_BOTTOM,
  wallPlacementAt,
  wallRunOffset,
} from "@/lib/design";

/**
 * A source-backed proposal for an over-range microwave with its short bridge
 * cabinet. The proposal is deliberately separate from the placement mutation:
 * the caller must ask the user before adding anything and must run the normal
 * room-aware collision gate at commit time.
 */
export type RangeCompanionProposal = {
  bridge: DesignCabinet;
  microwave: DesignCabinet;
  bridgeSpot: { x: number; y: number; rotation: number; wallId?: string; wallOffset?: number };
  microwaveSpot: { x: number; y: number; rotation: number; wallId?: string; wallOffset?: number };
  microwaveMountBottom: number;
  bridgeMountBottom: number;
};

/** Every short wall cabinet above an over-range microwave begins at this datum. */
export const OVER_RANGE_MICROWAVE_BRIDGE_MOUNT_BOTTOM_IN = OVER_RANGE_MICROWAVE_BRIDGE_MOUNT_BOTTOM;

function numberDimension(value: string | number | null | undefined): number {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : 0;
}

function bridgeCandidateForRange(
  range: Pick<PlacedCabinet, "width">,
  wallCabinets: DesignCabinet[],
  wallCabinetHeight: number,
): DesignCabinet | null {
  const rangeWidth = Number(range.width);
  if (!Number.isFinite(rangeWidth) || rangeWidth <= 0) return null;
  const requiredBridgeHeight = bridgeHeightForWallHeight(wallCabinetHeight);

  const eligible = wallCabinets.filter((cabinet) => {
    const width = numberDimension(cabinet.width);
    const height = numberDimension(cabinet.height);
    const identity = `${cabinet.masterCode} ${cabinet.description} ${cabinet.subCategory ?? ""}`.toLowerCase();
    // The bridge is an actual, selected-line, solid W30 wall cabinet: exactly
    // W3012, W3015, W3018, W3021, or W3024. WSC30 is a six-inch spice cabinet
    // and can never be used here; neither can glass, refrigerator, or open-box
    // specialty wall products.
    const isSpiceCabinet = /^wsc[-_]?30$/i.test(cabinet.masterCode) || /\bspice\b/.test(identity);
    const isNonBridgeSpecialty = /\brefrigerator\b|\bglass\b|\bopen\s+box\b/.test(identity);
    const normalizedCode = cabinet.masterCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const isApprovedMicrowaveBridge = /^W30(?:12|15|18|21|24)$/.test(normalizedCode);
    return cabinet.placement === "wall"
      && Math.abs(rangeWidth - 30) <= 0.01
      && Math.abs(width - 30) <= 0.01
      && Math.abs(height - requiredBridgeHeight) <= 0.01
      && !isSpiceCabinet
      && !isNonBridgeSpecialty
      && isApprovedMicrowaveBridge;
  });

  // Keep the catalog identity and authorized price intact. A deterministic code
  // order only resolves duplicate selected-line products with the same real size.
  return eligible.sort((left, right) => {
    return left.masterCode.localeCompare(right.masterCode) || left.id - right.id;
  })[0] ?? null;
}

/**
 * Finds the selected-line short wall cabinet that sits directly on a centered
 * over-range microwave. The wall-height preference drives one of the real
 * W3012/W3015/W3018/W3021/W3024 solid-wall selections; WSC30 is intentionally
 * excluded as a spice box.
 */
export function rangeCompanionProposal(
  range: PlacedCabinet,
  room: RoomData,
  wallCabinets: DesignCabinet[],
  appliancePalette: DesignCabinet[],
  wallCabinetHeight: number = 30,
): RangeCompanionProposal | null {
  const rangeWidth = Number(range.width);
  if (!Number.isFinite(rangeWidth) || rangeWidth <= 0) return null;

  const microwave = appliancePalette.find((item) => (
    item.placement === "appliance"
    && /^MW[-_]?\d/i.test(item.masterCode)
    && Math.abs(numberDimension(item.width) - rangeWidth) <= 0.01
  )) ?? null;
  if (!microwave) return null;

  const microwaveHeight = numberDimension(microwave.height);
  if (!microwaveHeight) return null;
  const microwaveBottom = OVER_RANGE_MICROWAVE_BRIDGE_MOUNT_BOTTOM_IN - microwaveHeight;
  const bridge = bridgeCandidateForRange(
    range,
    wallCabinets,
    wallCabinetHeight,
  );
  if (!bridge) return null;

  const microwaveWidth = numberDimension(microwave.width);
  const microwaveDepth = numberDimension(microwave.depth);
  const bridgeWidth = numberDimension(bridge.width);
  const bridgeDepth = numberDimension(bridge.depth);
  const bridgeHeight = numberDimension(bridge.height);
  if (!microwaveWidth || !microwaveDepth || !bridgeWidth || !bridgeDepth || !bridgeHeight) return null;

  const microwaveSpot = mountedMicrowaveOverRangeSpot({ width: microwaveWidth, depth: microwaveDepth }, range, room);
  const side = cabinetWall(range, room);
  const rangeStart = wallRunOffset(range, side, room);
  const bridgeStart = rangeStart + rangeWidth / 2 - bridgeWidth / 2;
  const bridgeSpot = wallPlacementAt(bridgeStart, bridgeWidth, bridgeDepth, side, room);

  // The bridge starts at the fixed 72-inch microwave datum. The 16-inch MW-30
  // finishes exactly at that line, so the real W30 bridge rests on it without a
  // gap. Its 12/15/18/21/24-inch height then ends at 84/87/90/93/96 inches.
  return {
    bridge,
    microwave,
    bridgeSpot,
    microwaveSpot,
    microwaveMountBottom: microwaveBottom,
    bridgeMountBottom: OVER_RANGE_MICROWAVE_BRIDGE_MOUNT_BOTTOM_IN,
  };
}

export const rangeCompanionDimensions = numberDimension;
