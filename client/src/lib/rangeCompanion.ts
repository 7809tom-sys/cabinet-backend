import {
  type DesignCabinet,
  type PlacedCabinet,
  type RoomData,
  bridgeHeightForWallHeight,
  cabinetWall,
  elevationBox,
  mountedMicrowaveOverRangeSpot,
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
  /** Clearance from the finished stove top to the microwave bottom. */
  microwaveClearanceIn: number;
  microwaveMountBottom: number;
  bridgeMountBottom: number;
};

/** The allowed finished-stove-top clearance for an over-range microwave. */
export const OVER_RANGE_MICROWAVE_CLEARANCE_MIN_IN = 24;
export const OVER_RANGE_MICROWAVE_CLEARANCE_MAX_IN = 30;
export const DEFAULT_OVER_RANGE_MICROWAVE_CLEARANCE_IN = OVER_RANGE_MICROWAVE_CLEARANCE_MIN_IN;

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
  microwaveClearanceIn = DEFAULT_OVER_RANGE_MICROWAVE_CLEARANCE_IN,
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
  const clearance = Math.max(
    OVER_RANGE_MICROWAVE_CLEARANCE_MIN_IN,
    Math.min(OVER_RANGE_MICROWAVE_CLEARANCE_MAX_IN, Number(microwaveClearanceIn) || DEFAULT_OVER_RANGE_MICROWAVE_CLEARANCE_IN),
  );
  const microwaveBottom = elevationBox(range, room).bottom + elevationBox(range, room).height + clearance;
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

  // This short bridge completes the OTR appliance stack. It must rest directly
  // on the microwave—not top-align to the normal wall-cabinet line—so no empty
  // band appears between the two pieces in elevation or 3D.
  return {
    bridge,
    microwave,
    bridgeSpot,
    microwaveSpot,
    microwaveClearanceIn: clearance,
    microwaveMountBottom: microwaveBottom,
    bridgeMountBottom: microwaveBottom + microwaveHeight,
  };
}

export const rangeCompanionDimensions = numberDimension;
