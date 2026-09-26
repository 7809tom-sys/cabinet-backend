import {
  type DesignCabinet,
  type PlacedCabinet,
  type RoomData,
  cabinetWall,
  mountedMicrowaveOverRangeSpot,
  wallCabinetTopLine,
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
  bridgeMountBottom: number;
};

function numberDimension(value: string | number | null | undefined): number {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : 0;
}

function bridgeCandidateForRange(
  range: Pick<PlacedCabinet, "width">,
  wallCabinets: DesignCabinet[],
  topLine: number,
  microwaveTop: number,
): DesignCabinet | null {
  const rangeWidth = Number(range.width);
  if (!Number.isFinite(rangeWidth) || rangeWidth <= 0) return null;

  const eligible = wallCabinets.filter((cabinet) => {
    const width = numberDimension(cabinet.width);
    const height = numberDimension(cabinet.height);
    // A marketing/category label is not sufficient evidence of an over-range
    // bridge. In particular, WSC30 is a spice cabinet and must never be
    // selected for a range. Only an explicit catalog profile can authorize an
    // automatic microwave companion.
    const sourceIdentifiesBridge = cabinet.customProfile === "range-companion-bridge";
    return cabinet.placement === "wall"
      && Math.abs(width - rangeWidth) <= 0.01
      && sourceIdentifiesBridge
      // The bridge must sit above the microwave without pushing through the
      // standard wall-cabinet top line. This is a physical clearance rule, not
      // a product-name heuristic.
      && height > 0
      && topLine - height >= microwaveTop + 0.5;
  });

  // If a distributor exposes multiple explicitly verified bridge alternatives,
  // the shortest one gives the largest microwave clearance, with code order
  // making the outcome deterministic.
  return eligible.sort((left, right) => {
    return numberDimension(left.height) - numberDimension(right.height)
      || left.masterCode.localeCompare(right.masterCode);
  })[0] ?? null;
}

/**
 * Finds the exact verified bridge source and the synthetic layout-only MW-* item
 * that can be mounted over a just-placed range. It never guesses a cabinet SKU:
 * without a matching selected-line bridge and a matching appliance palette
 * record, it returns null and no prompt should be shown.
 */
export function rangeCompanionProposal(
  range: PlacedCabinet,
  room: RoomData,
  wallCabinets: DesignCabinet[],
  appliancePalette: DesignCabinet[],
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
  const microwaveBottom = Math.max(0, Number(microwave.mountBottom) || 0);
  const bridge = bridgeCandidateForRange(
    range,
    wallCabinets,
    wallCabinetTopLine(room),
    microwaveBottom + microwaveHeight,
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
    bridgeMountBottom: microwaveBottom + microwaveHeight,
  };
}

export const rangeCompanionDimensions = numberDimension;
