import {
  BLIND_CORNER_FILLER_WIDTH_IN,
  STD,
  blindCornerAutoFiller,
  isBlindCorner,
  type PlacedCabinet,
  type RoomData,
} from "./design";
import {
  catalogFillerForGap,
  fittedCatalogFillerDescription,
  type CatalogFillerCandidate,
} from "./catalogFiller";
import { installedFillerVerticalSpec, removePlacedCabinetGroup } from "./smallGapFiller";

export type RequiredBlindCornerFillerResult =
  | { ok: true; filler: PlacedCabinet }
  | { ok: false; reason: "not-blind" | "missing-catalog-filler" | "invalid-corner" };

function finite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Builds the required three-inch, catalog-backed filler on the perpendicular
 * run at a BBC's open-side front. The installed footprint reserves the full
 * base depth for countertop support and zero-overlap placement; the active
 * catalog item remains the billing, pricing, finish, and cart identity.
 */
export function buildRequiredBlindCornerFiller(
  blind: PlacedCabinet,
  room: RoomData,
  candidates: readonly CatalogFillerCandidate[],
  makeUid: () => string,
  styleId: number | null,
): RequiredBlindCornerFillerResult {
  if (!isBlindCorner(blind.masterCode, blind.description)) {
    return { ok: false, reason: "not-blind" };
  }
  const catalog = catalogFillerForGap(candidates, BLIND_CORNER_FILLER_WIDTH_IN, "base");
  if (!catalog) return { ok: false, reason: "missing-catalog-filler" };
  const layout = blindCornerAutoFiller(blind, room, makeUid);
  if (!layout.filler) return { ok: false, reason: "invalid-corner" };

  const catalogWidth = finite(catalog.width, BLIND_CORNER_FILLER_WIDTH_IN);
  const height = installedFillerVerticalSpec("base", finite(catalog.height, STD.BASE_HEIGHT)).storedHeight;
  return {
    ok: true,
    filler: {
      ...layout.filler,
      cabinetId: catalog.id,
      masterCode: catalog.masterCode,
	      // Avoid the literal phrase "blind corner" here: that phrase is an
	      // intentional legacy classifier for cabinet records and would inflate
	      // this real 3-by-24 filler into a BBC footprint.
	      description: `${fittedCatalogFillerDescription(catalog, BLIND_CORNER_FILLER_WIDTH_IN)} — required BBC clearance`,
      category: catalog.category ?? "Filler",
      subCategory: catalog.subCategory ?? "Filler",
      width: BLIND_CORNER_FILLER_WIDTH_IN,
      nominalWidth: catalogWidth,
      // Reserve the full base run physically. The renderer already presents
      // fitted fillers as trim/panel geometry and spans their countertop.
      depth: STD.BASE_DEPTH,
      nominalDepth: finite(catalog.depth, STD.BASE_DEPTH),
      height,
      nominalHeight: height,
      numberOfDoors: 0,
      numberOfDrawers: 0,
      catalogImageUrl: catalog.catalogImageUrl ?? null,
      styleId,
      fillerPieceGroupId: `bbc-required-filler-${blind.uid}`,
	      fillerPlacementMode: layout.filler.fillerPlacementMode ?? "right",
      fillerTotalWidth: BLIND_CORNER_FILLER_WIDTH_IN,
    },
  };
}

/**
 * Removes a BBC and its one required catalog filler as a single saved-design
 * assembly. Selecting the filler itself removes the owning BBC too; unrelated
 * small-gap filler groups retain their existing group-removal behavior.
 */
export function removePlacedCabinetWithRequiredBlindCornerFiller(
  placed: PlacedCabinet[],
  uid: string,
): PlacedCabinet[] {
  const selected = placed.find((item) => item.uid === uid);
  if (!selected) return placed;
  const directGroupId = `bbc-required-filler-${uid}`;
  const selectedRequiredGroupId = selected.fillerPieceGroupId?.startsWith("bbc-required-filler-")
    ? selected.fillerPieceGroupId
    : null;
  const groupId = isBlindCorner(selected.masterCode, selected.description)
    ? directGroupId
    : selectedRequiredGroupId;
  if (!groupId) return removePlacedCabinetGroup(placed, uid);
  const blindUid = groupId.slice("bbc-required-filler-".length);
  return placed.filter((item) => item.uid !== blindUid && item.fillerPieceGroupId !== groupId);
}
