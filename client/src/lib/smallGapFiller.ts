import {
	STD,
	PENINSULA_INSIDE_CORNER_CLEARANCE_IN,
	appendCollisionFreePlacements,
	cabinetWall,
	isFillerItem,
	peninsulaRunById,
	wallRunOffset,
	wallRunSpan,
	wallCabinetFitMeasure,
  type CabinetWallDragPreview,
  type IslandFace,
  type IslandZone,
  type PlacedCabinet,
  type RoomData,
  type WallOpening,
  type WallSide,
} from "@/lib/design";
import { islandFaceFitMeasure, islandOffsetForPlaced } from "@/lib/islandScene";
import { isWallBlindCornerCabinet } from "@/lib/cabinetGraphics";

const EDGE_EPSILON_IN = 0.001;
export const SMALL_GAP_FILLER_MIN_IN = 0.5;
export const SMALL_GAP_FILLER_MAX_IN = 3;
export const SMALL_GAP_SPLIT_PIECE_MIN_IN = 0.5;

export type SmallGapFillerPlacementMode = "left" | "right" | "split";

export type SmallGapFillerOpportunity = {
  cabinetUid: string;
  wall: WallSide;
  layer: "base" | "wall";
  cabinetStart: number;
  cabinetSpan: number;
  openingStart: number;
  openingLength: number;
  remaining: number;
  /** Island-local run ownership; absent for room-wall filler opportunities. */
  islandFace?: IslandFace;
  /** Existing purchased filler group replaced when an installed filler is edited. */
  replacingFillerGroupId?: string;
  /** Fixed-hand one-click preference; explicit user left/right/split still wins. */
  preferredMode?: SmallGapFillerPlacementMode;
	/** Left/right cabinet owners when the entire remainder is bounded by two cabinets. */
	boundedCabinetUids?: [string, string];
	/** Exact along-run start of a bounded two-cabinet gap. */
	boundedGapStart?: number;
};

export type SmallGapFillerLayout = {
  cabinetStart: number;
  leftWidth: number;
  rightWidth: number;
  pieces: Array<{ side: "left" | "right"; start: number; width: number }>;
};

export type InstalledFillerVerticalSpec = {
  storedHeight: number;
  visibleBottom: number;
  visibleHeight: number;
  visibleTop: number;
};

/**
 * Base filler catalog records may describe taller stock. Once installed beside a
 * standard base cabinet, only the 30-inch cabinet-box panel is visible above the
 * 4½-inch toe kick. The saved height remains the standard inclusive 34½-inch base
 * envelope so the existing 2D/3D toe-kick renderers do not subtract the kick twice.
 */
export function installedFillerVerticalSpec(
  layer: "base" | "wall",
  catalogHeight: number,
): InstalledFillerVerticalSpec {
  if (layer === "base") {
    return {
      storedHeight: STD.BASE_HEIGHT,
      visibleBottom: STD.TOE_KICK,
      visibleHeight: STD.BASE_HEIGHT - STD.TOE_KICK,
      visibleTop: STD.BASE_HEIGHT,
    };
  }
  const storedHeight = Number.isFinite(catalogHeight) && catalogHeight > 0
    ? catalogHeight
    : STD.WALL_HEIGHT;
  return {
    storedHeight,
    visibleBottom: 0,
    visibleHeight: storedHeight,
    visibleTop: storedHeight,
  };
}

function near(left: number, right: number) {
  return Math.abs(left - right) <= EDGE_EPSILON_IN;
}

/** Gap prompts use installable 1/8-inch measurements and never sub-1/2-inch shims. */
export function installableSmallGapRemainder(value: number): number | null {
  if (!Number.isFinite(value) || value < SMALL_GAP_FILLER_MIN_IN - EDGE_EPSILON_IN || value > SMALL_GAP_FILLER_MAX_IN + EDGE_EPSILON_IN) return null;
  const rounded = Math.round(value * 8) / 8;
  return rounded >= SMALL_GAP_FILLER_MIN_IN && rounded <= SMALL_GAP_FILLER_MAX_IN ? rounded : null;
}

function gapCrossesWallOpening(openings: readonly WallOpening[], wall: WallSide, start: number, length: number) {
  const end = start + length;
  return openings.some((opening) => opening.side === wall
    && opening.offset < end - EDGE_EPSILON_IN
    && opening.offset + opening.width > start + EDGE_EPSILON_IN);
}

/** Convert the WBC's fixed local blind-left side into the wall's run direction. */
export function wallBlindCornerPreferredFillerMode(
  cabinet: Pick<PlacedCabinet, "masterCode" | "description">,
  wall: WallSide,
): SmallGapFillerPlacementMode | null {
  if (!isWallBlindCornerCabinet(cabinet)) return null;
  return wall === "top" || wall === "right" ? "left" : "right";
}

/** Detects only a real post-placement bounded opening with 3 inches or less total remainder. */
export function findSmallGapFillerOpportunity(
  room: RoomData,
  placed: readonly PlacedCabinet[],
  openings: readonly WallOpening[],
  cabinetUid: string,
): SmallGapFillerOpportunity | null {
  const cabinet = placed.find((item) => item.uid === cabinetUid);
  if (!cabinet || isFillerItem(cabinet) || !["base", "wall", "tall"].includes(cabinet.placement)) return null;

  const wall = cabinetWall(cabinet, room);
  // Use the same free-segment measurement that powers the selected-cabinet
  // details panel. Unlike same-placement nearest-neighbor measurement, this
  // recognizes base/tall/appliance boundaries in one floor run as well as true
  // corner footprints, so the filler prompt agrees with the displayed remainder.
  const measurement = wallCabinetFitMeasure(cabinet, room, [...placed], [...openings], wall);
  const cabinetStart = measurement.start;
  const cabinetSpan = measurement.end - measurement.start;
  const cabinetEnd = cabinetStart + cabinetSpan;
	const layer: "base" | "wall" = cabinet.placement === "wall" ? "wall" : "base";
	const leadingStart = measurement.availableStart;
	const peninsula = peninsulaRunById(room, wall);
	if (peninsula && layer === "base") {
		const floorLayerPeer = (item: PlacedCabinet) => item.placement === "base" || item.placement === "appliance" || item.placement === "tall";
		const boundedNeighbor = placed
			.filter((item) => item.uid !== cabinet.uid && !isFillerItem(item) && floorLayerPeer(item) && cabinetWall(item, room) === wall)
			.map((item) => {
				const start = wallRunOffset(item, wall, room);
				const end = start + wallRunSpan(item, wall, room);
				if (end <= cabinetStart + EDGE_EPSILON_IN) return { item, start, end, gapStart: end, gap: cabinetStart - end, before: true };
				if (start >= cabinetEnd - EDGE_EPSILON_IN) return { item, start, end, gapStart: cabinetEnd, gap: start - cabinetEnd, before: false };
				return null;
			})
			.filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null)
			.filter((candidate) => installableSmallGapRemainder(candidate.gap) != null)
			.sort((left, right) => left.gap - right.gap)[0];
		if (boundedNeighbor && !gapCrossesWallOpening(openings, wall, boundedNeighbor.gapStart, boundedNeighbor.gap)) {
			const remaining = installableSmallGapRemainder(boundedNeighbor.gap)!;
			const leftUid = boundedNeighbor.before ? boundedNeighbor.item.uid : cabinet.uid;
			const rightUid = boundedNeighbor.before ? cabinet.uid : boundedNeighbor.item.uid;
			return {
				cabinetUid,
				wall,
				layer,
				cabinetStart,
				cabinetSpan,
				openingStart: boundedNeighbor.gapStart,
				openingLength: remaining,
				remaining,
				preferredMode: "split",
				boundedCabinetUids: [leftUid, rightUid],
				boundedGapStart: boundedNeighbor.gapStart,
			};
		}

		const leadingCornerRemainder = installableSmallGapRemainder(measurement.before);
		const startsAtProtectedCorner = near(measurement.availableStart, Math.min(PENINSULA_INSIDE_CORNER_CLEARANCE_IN, measurement.wallLen));
		if (
			leadingCornerRemainder != null
			&& startsAtProtectedCorner
			&& !gapCrossesWallOpening(openings, wall, measurement.availableStart, measurement.before)
		) {
			return {
				cabinetUid,
				wall,
				layer,
				cabinetStart,
				cabinetSpan,
				openingStart: measurement.availableStart,
				openingLength: cabinetSpan + leadingCornerRemainder,
				remaining: leadingCornerRemainder,
				preferredMode: "left",
			};
		}

		const hasConnectedFarCorner = Boolean(room.peninsulaRuns?.some((run) => run.parentRunId === peninsula.id));
		const trailingCornerRemainder = installableSmallGapRemainder(measurement.after);
		const endsAtProtectedCorner = hasConnectedFarCorner
			&& near(measurement.availableEnd, Math.max(0, measurement.wallLen - PENINSULA_INSIDE_CORNER_CLEARANCE_IN));
		if (
			trailingCornerRemainder != null
			&& endsAtProtectedCorner
			&& !gapCrossesWallOpening(openings, wall, cabinetEnd, measurement.after)
		) {
			return {
				cabinetUid,
				wall,
				layer,
				cabinetStart,
				cabinetSpan,
				openingStart: cabinetStart,
				openingLength: cabinetSpan + trailingCornerRemainder,
				remaining: trailingCornerRemainder,
				preferredMode: "right",
			};
		}
	}
		const before = installableSmallGapRemainder(measurement.before);
		const after = installableSmallGapRemainder(measurement.after);
		const beforeIsClear = before != null && !gapCrossesWallOpening(openings, wall, leadingStart, measurement.before);
		const afterIsClear = after != null && !gapCrossesWallOpening(openings, wall, cabinetEnd, measurement.after);
		const combined = installableSmallGapRemainder(measurement.before + measurement.after);

	  // When both adjoining seams are small, preserve the established single
	  // dialog with left/right/split choices. It is one bounded opening and one
	  // sellable filler line, even when the user elects to install two equal pieces.
	  if (beforeIsClear && afterIsClear && combined != null) {
	    const preferredMode = wallBlindCornerPreferredFillerMode(cabinet, wall);
	    return {
	      cabinetUid,
	      wall,
	      layer,
	      cabinetStart,
	      cabinetSpan,
	      openingStart: leadingStart,
	      openingLength: cabinetSpan + combined,
	      remaining: combined,
	      ...(preferredMode ? { preferredMode } : {}),
	    };
	  }

	  // Do not decide an ERB36 filler at the moment the corner cabinet is seated:
	  // the neighboring runs are not known yet. Once the user places a cabinet
	  // beside either leg, however, a real 1/2–3" seam needs immediate filler
	  // guidance even if the cabinet's other side remains open for more cabinets.
	  // Pick the left seam first for a deterministic prompt; after it is resolved,
	  // the next cabinet placement/recheck can offer the independent right seam.
	  if (beforeIsClear) {
	    return {
	      cabinetUid,
	      wall,
	      layer,
	      cabinetStart,
	      cabinetSpan,
	      openingStart: cabinetStart - before!,
	      openingLength: cabinetSpan + before!,
	      remaining: before!,
	      preferredMode: wallBlindCornerPreferredFillerMode(cabinet, wall) ?? "left",
	    };
	  }
	  if (afterIsClear) {
	    return {
	      cabinetUid,
	      wall,
	      layer,
	      cabinetStart,
	      cabinetSpan,
	      openingStart: cabinetStart,
	      openingLength: cabinetSpan + after!,
	      remaining: after!,
	      preferredMode: wallBlindCornerPreferredFillerMode(cabinet, wall) ?? "right",
	    };
	  }
	  return null;
}

/** Uses the selected island face's own run length and neighbors, never a room wall. */
export function findIslandSmallGapFillerOpportunity(
  island: IslandZone,
  placed: readonly PlacedCabinet[],
  cabinetUid: string,
): SmallGapFillerOpportunity | null {
  const cabinet = placed.find((item) => item.uid === cabinetUid);
  const face = cabinet?.islandFace ?? null;
  if (!cabinet || !face || isFillerItem(cabinet) || !["base", "wall", "tall"].includes(cabinet.placement)) return null;
  const measurement = islandFaceFitMeasure(cabinet, island, [...placed]);
  if (!measurement || measurement.status !== "fits") return null;
  const remaining = installableSmallGapRemainder(measurement.before + measurement.after);
  if (remaining == null) return null;
  return {
    cabinetUid,
    wall: measurement.side,
    layer: cabinet.placement === "wall" ? "wall" : "base",
    cabinetStart: islandOffsetForPlaced(cabinet, island, face),
    cabinetSpan: measurement.requiredSpan,
    openingStart: measurement.availableStart,
    openingLength: measurement.availableSpan,
    remaining,
    islandFace: face,
  };
}

/**
 * A right-drag preview already identifies the exact bounded free segment and the
 * accepted zero-overlap object position. Convert that measured result directly
 * into the existing filler workflow so cabinets, panels, fillers, and floor
 * appliances all receive the same left/right/split choices after a valid move.
 */
export function smallGapFillerOpportunityFromDragPreview(
  cabinetUid: string,
  preview: CabinetWallDragPreview,
): SmallGapFillerOpportunity | null {
  if (!preview.candidate || preview.fit.status !== "valid") return null;
  const remaining = installableSmallGapRemainder(preview.fit.before + preview.fit.after);
  if (remaining == null) return null;
  const preferredMode = wallBlindCornerPreferredFillerMode(preview.candidate, preview.wall);
  return {
    cabinetUid,
    wall: preview.wall,
    layer: preview.fit.gap.layer,
    cabinetStart: preview.fit.snapStart,
    cabinetSpan: preview.fit.requiredSpan,
    openingStart: preview.fit.gap.start,
    openingLength: preview.fit.gap.length,
    remaining,
    ...(preferredMode ? { preferredMode } : {}),
  };
}

export function canSplitSmallGapFiller(opportunity: Pick<SmallGapFillerOpportunity, "remaining">) {
  return opportunity.remaining + EDGE_EPSILON_IN >= SMALL_GAP_SPLIT_PIECE_MIN_IN * 2;
}

/** Chooses the safest one-click layout while reusing the existing priced filler transaction. */
export function automaticSmallGapFillerMode(opportunity: SmallGapFillerOpportunity): SmallGapFillerPlacementMode {
  if (opportunity.preferredMode) return opportunity.preferredMode;
  if (canSplitSmallGapFiller(opportunity)) return "split";
  const leftOpen = Math.max(0, opportunity.cabinetStart - opportunity.openingStart);
  const openingEnd = opportunity.openingStart + opportunity.openingLength;
  const rightOpen = Math.max(0, openingEnd - (opportunity.cabinetStart + opportunity.cabinetSpan));
  return leftOpen > rightOpen ? "left" : "right";
}

/** Returns exact edge-contact coordinates; every piece and cabinet seam has zero overlap. */
export function smallGapFillerLayout(
  opportunity: SmallGapFillerOpportunity,
  mode: SmallGapFillerPlacementMode,
): SmallGapFillerLayout {
	if (mode === "split" && opportunity.boundedCabinetUids && opportunity.boundedGapStart != null) {
		const leftWidth = opportunity.remaining / 2;
		const rightWidth = opportunity.remaining - leftWidth;
		return {
			cabinetStart: opportunity.cabinetStart,
			leftWidth,
			rightWidth,
			pieces: [
				{ side: "left", start: opportunity.boundedGapStart, width: leftWidth },
				{ side: "right", start: opportunity.boundedGapStart + leftWidth, width: rightWidth },
			],
		};
	}
  const leftWidth = mode === "left"
    ? opportunity.remaining
    : mode === "split"
      ? opportunity.remaining / 2
      : 0;
  const rightWidth = opportunity.remaining - leftWidth;
  const cabinetStart = opportunity.openingStart + leftWidth;
  const pieces: SmallGapFillerLayout["pieces"] = [];
  if (leftWidth > EDGE_EPSILON_IN) pieces.push({ side: "left", start: opportunity.openingStart, width: leftWidth });
  if (rightWidth > EDGE_EPSILON_IN) pieces.push({ side: "right", start: cabinetStart + opportunity.cabinetSpan, width: rightWidth });
  return { cabinetStart, leftWidth, rightWidth, pieces };
}

/** Replaces only the cabinet being repositioned, then appends filler pieces without dropping unrelated saved items. */
export function appendSmallGapFillerPlacement(
  placed: readonly PlacedCabinet[],
  movedCabinet: PlacedCabinet,
  pieces: readonly PlacedCabinet[],
) {
  const preserved = placed.map((item) => item.uid === movedCabinet.uid ? movedCabinet : item);
  return appendCollisionFreePlacements(preserved, [...pieces]);
}

/** Removing either half removes the complete purchased filler group. */
export function removePlacedCabinetGroup(placed: readonly PlacedCabinet[], uid: string): PlacedCabinet[] {
  const target = placed.find((item) => item.uid === uid);
  if (!target?.fillerPieceGroupId) return placed.filter((item) => item.uid !== uid);
  return placed.filter((item) => item.fillerPieceGroupId !== target.fillerPieceGroupId);
}

/**
 * Reconstructs the owning cabinet's measured opening after temporarily removing
 * an installed filler group. New groups carry an explicit owner UID; legacy
 * saved groups fall back to the unique adjacent cabinet whose restored
 * remainder equals the purchased filler's total installed width.
 */
export function installedSmallGapFillerEditOpportunity(
  room: RoomData,
  placed: readonly PlacedCabinet[],
  openings: readonly WallOpening[],
  fillerUid: string,
  island?: IslandZone | null,
): SmallGapFillerOpportunity | null {
  const selected = placed.find((item) => item.uid === fillerUid);
  const groupId = selected?.fillerPieceGroupId ?? null;
  if (!selected || !groupId || !isFillerItem(selected)) return null;
  if (groupId.startsWith("bbc-required-filler-")) return null;
  const group = placed.filter((item) => item.fillerPieceGroupId === groupId);
  const withoutGroup = placed.filter((item) => item.fillerPieceGroupId !== groupId);
  const explicitOwnerUid = group.find((item) => item.fillerForCabinetUid)?.fillerForCabinetUid ?? null;
  const totalWidth = Math.max(
    0,
    Number(selected.fillerTotalWidth) || group.reduce((total, item) => total + Math.max(0, Number(item.width) || 0), 0),
  );
  const candidateUids = explicitOwnerUid
    ? [explicitOwnerUid]
    : withoutGroup
      .filter((item) => !isFillerItem(item) && ["base", "wall", "tall"].includes(item.placement))
      .map((item) => item.uid);
  const matches = candidateUids.flatMap((cabinetUid) => {
    const owner = withoutGroup.find((item) => item.uid === cabinetUid);
    const opportunity = owner?.islandFace && island
      ? findIslandSmallGapFillerOpportunity(island, withoutGroup, cabinetUid)
      : findSmallGapFillerOpportunity(room, withoutGroup, openings, cabinetUid);
    return opportunity && Math.abs(opportunity.remaining - totalWidth) <= 0.01 ? [opportunity] : [];
  });
  if (matches.length !== 1) return null;
  return { ...matches[0], replacingFillerGroupId: groupId };
}
