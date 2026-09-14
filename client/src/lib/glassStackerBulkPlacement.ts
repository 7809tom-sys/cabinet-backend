import {
  glassStackerParentPlacement,
  isGlassDoorCabinet,
  isStacker,
  resolvedDesignCabinetDimensions,
  type DesignCabinet,
  type PlacedCabinet,
  type RoomData,
} from "./design";

export type GlassStackerBulkPlacementCandidate = {
  parentUid: string;
  parentCode: string;
  stacker: PlacedCabinet;
};

function stackerDraft(source: PlacedCabinet, catalog: DesignCabinet, parent: PlacedCabinet): PlacedCabinet {
  const dimensions = resolvedDesignCabinetDimensions(catalog);
  const { mountBottom: _mountBottom, mountBottomAdjusted: _mountBottomAdjusted, stackedOnCabinetUid: _stackedOnCabinetUid, ...base } = source;
  return {
    ...base,
    uid: `glass-stacker-bulk-${parent.uid}`,
    cabinetId: catalog.id,
    masterCode: catalog.masterCode,
    description: catalog.description,
    category: catalog.category ?? null,
    subCategory: catalog.subCategory ?? null,
    x: parent.x,
    y: parent.y,
    width: dimensions.width,
    nominalWidth: dimensions.width,
    depth: dimensions.depth,
    nominalDepth: dimensions.depth,
    height: dimensions.height,
    nominalHeight: dimensions.height,
    rotation: parent.rotation,
    wallId: parent.wallId,
    wallOffset: parent.wallOffset,
    peninsulaSide: parent.peninsulaSide,
    numberOfDoors: catalog.numberOfDoors,
    numberOfDrawers: catalog.numberOfDrawers,
    catalogImageUrl: catalog.catalogImageUrl ?? null,
    fixedShelfCount: (catalog as any).numberOfFixedShelves ?? null,
    adjustableShelfCount: (catalog as any).numberOfAdjShelves ?? null,
    customProfile: (catalog as any).graphicType ?? null,
    genericDrawingUrl: (catalog as any).specImageUrl ?? null,
    glassDoor: true,
    glassDoorAddonCode: catalog.glassDoorAddonCode ?? null,
  };
}

/**
 * The selected stacker is already a purchasable, placed catalog product. It is
 * therefore a safe fallback for another same-width compatible parent while the
 * full wall-cabinet pool is still loading or lacks a separately listed variant.
 */
function sourceStackerDraft(source: PlacedCabinet, parent: PlacedCabinet): PlacedCabinet {
  const { mountBottom: _mountBottom, mountBottomAdjusted: _mountBottomAdjusted, stackedOnCabinetUid: _stackedOnCabinetUid, ...base } = source;
  return {
    ...base,
    uid: `glass-stacker-bulk-${parent.uid}`,
    x: parent.x,
    y: parent.y,
    rotation: parent.rotation,
    wallId: parent.wallId,
    wallOffset: parent.wallOffset,
    peninsulaSide: parent.peninsulaSide,
    glassDoor: true,
  };
}

/**
 * Finds the exact same-height glass stacker catalog item that can sit above
 * every compatible wall cabinet. The original selected stacker remains in the
 * plan; candidates represent only the additional matching upper stacks.
 */
export function glassStackerBulkPlacementCandidates(
  placed: PlacedCabinet[],
  sourceStackerUid: string,
  room: RoomData,
  stackerCatalog: DesignCabinet[],
): GlassStackerBulkPlacementCandidate[] {
  const source = placed.find((cabinet) => cabinet.uid === sourceStackerUid);
  if (!source || !isStacker(source) || !isGlassDoorCabinet(source)) return [];

  const sourceHeight = Number(source.height);
  const occupiedParentUids = new Set(
    placed.flatMap((cabinet) => cabinet.stackedOnCabinetUid ? [cabinet.stackedOnCabinetUid] : []),
  );
  const glassStackerCatalog = stackerCatalog.filter((catalog) => {
    const dimensions = resolvedDesignCabinetDimensions(catalog);
    return catalog.placement === "wall" &&
      isStacker({ ...catalog, height: dimensions.height }) &&
      isGlassDoorCabinet(catalog) &&
      Math.abs(dimensions.height - sourceHeight) <= 0.5;
  });

  return placed.flatMap((parent) => {
    if (
      parent.uid === source.stackedOnCabinetUid ||
      parent.placement !== "wall" ||
      parent.islandFace ||
      parent.noDoor === true ||
      isStacker(parent) ||
      occupiedParentUids.has(parent.uid)
    ) return [];

    const matchingCatalog = glassStackerCatalog.filter((catalog) => {
      const dimensions = resolvedDesignCabinetDimensions(catalog);
      return Math.abs(dimensions.width - Number(parent.width)) <= 0.5;
    });
    const drafts = matchingCatalog.map((catalog) => stackerDraft(source, catalog, parent));
    if (drafts.length === 0 && Math.abs(Number(source.width) - Number(parent.width)) <= 0.5) {
      drafts.push(sourceStackerDraft(source, parent));
    }

    for (const draft of drafts) {
      const placement = glassStackerParentPlacement(draft, placed, room, parent.uid);
      if (placement.ok && placement.parentUid === parent.uid) {
        return [{
          parentUid: parent.uid,
          parentCode: parent.masterCode,
          stacker: {
            ...draft,
            x: placement.x,
            y: placement.y,
            rotation: placement.rotation,
            mountBottom: placement.mountBottom,
            stackedOnCabinetUid: placement.parentUid,
          },
        }];
      }
    }
    return [];
  });
}

export function applyGlassStackerBulkPlacement(
  placed: PlacedCabinet[],
  candidates: GlassStackerBulkPlacementCandidate[],
  makeUid: () => string,
): PlacedCabinet[] {
  const existingParents = new Set(
    placed.flatMap((cabinet) => cabinet.stackedOnCabinetUid ? [cabinet.stackedOnCabinetUid] : []),
  );
  const additional = candidates.flatMap((candidate) => {
    if (existingParents.has(candidate.parentUid)) return [];
    existingParents.add(candidate.parentUid);
    return [{ ...candidate.stacker, uid: makeUid() }];
  });
  return [...placed, ...additional];
}
