import { describe, expect, it } from "vitest";
import { buildDesignCabinetCartLines, buildDesignPreviewPricingLines } from "@/lib/designCartLines";
import { DEFAULT_ROOM, cabinetWallDragPreview, wallCabinetFitMeasure, type IslandFace, type IslandZone, type PlacedCabinet } from "@/lib/design";
import { islandFacePlacement } from "@/lib/islandScene";
import {
  appendSmallGapFillerPlacement,
  automaticSmallGapFillerMode,
  findSmallGapFillerOpportunity,
  findIslandSmallGapFillerOpportunity,
  installedFillerVerticalSpec,
  installedSmallGapFillerEditOpportunity,
  removePlacedCabinetGroup,
  smallGapFillerOpportunityFromDragPreview,
  smallGapFillerLayout,
  wallBlindCornerPreferredFillerMode,
} from "@/lib/smallGapFiller";

const cabinet: PlacedCabinet = {
  uid: "cabinet-1", cabinetId: 10, masterCode: "B-18", description: "18 inch base", placement: "base",
  x: 0, y: 0, width: 18, depth: 24, height: 34.5, rotation: 0,
};

describe("small-gap filler placement", () => {
	it("selects the correct one-click layout for split and one-sided sub-three-inch gaps", () => {
	  const baseOpportunity = {
	    cabinetUid: "cabinet-1",
	    wall: "top" as const,
	    layer: "base" as const,
	    cabinetStart: 1,
	    cabinetSpan: 18,
	    openingStart: 0,
	    openingLength: 20,
	    remaining: 2,
	  };
	  expect(automaticSmallGapFillerMode(baseOpportunity)).toBe("split");
		expect(automaticSmallGapFillerMode({ ...baseOpportunity, cabinetStart: 0.75, openingLength: 18.75, remaining: 0.75 })).toBe("left");
		expect(automaticSmallGapFillerMode({ ...baseOpportunity, cabinetStart: 0, openingLength: 18.75, remaining: 0.75 })).toBe("right");
	});

	it("places a start-corner WBC-27-42 filler on the blind side, to the left of its door", () => {
		const wbc: PlacedCabinet = {
			...cabinet,
			uid: "wbc-start",
			masterCode: "WBC-27-42",
			description: "27 inch Blind Corner Wall Cabinet",
			placement: "wall",
			x: 0,
			y: 0,
			width: 27,
			depth: 12,
			height: 42,
			mountBottom: 54,
			rotation: 0,
			swing: "right",
			openingWidth: 12,
		};
		const opportunity = findSmallGapFillerOpportunity({ ...DEFAULT_ROOM, width: 30 }, [wbc], [], wbc.uid)!;
		expect(opportunity).toMatchObject({ remaining: 3, cabinetStart: 0, openingStart: 0 });
		expect(automaticSmallGapFillerMode(opportunity)).toBe("left");
	});

	it("mirrors the fixed left-of-door WBC filler into increasing run coordinates on the bottom wall", () => {
		const wbc: PlacedCabinet = {
			...cabinet,
			uid: "wbc-end",
			masterCode: "WBC-27-42",
			description: "27 inch Blind Corner Wall Cabinet",
			placement: "wall",
			x: 0,
			y: DEFAULT_ROOM.depth - 12,
			width: 27,
			depth: 12,
			height: 42,
			mountBottom: 54,
			rotation: 180,
			swing: "left",
			openingWidth: 12,
		};
		const opportunity = findSmallGapFillerOpportunity({ ...DEFAULT_ROOM, width: 30 }, [wbc], [], wbc.uid)!;
		expect(opportunity).toMatchObject({ remaining: 3, cabinetStart: 0, openingStart: 0 });
		expect(automaticSmallGapFillerMode(opportunity)).toBe("right");
	});

	it.each([
		["top", "left"],
		["bottom", "right"],
		["left", "right"],
		["right", "left"],
	] as const)("maps the WBC blind-left filler to the %s wall's %s run side", (wall, expectedMode) => {
		expect(wallBlindCornerPreferredFillerMode({
			masterCode: "WBC-27-42",
			description: "27 inch Blind Corner Wall Cabinet",
		}, wall)).toBe(expectedMode);
	});

  it("installs a base filler as a 30-inch visible panel above the 4½-inch toe kick", () => {
    expect(installedFillerVerticalSpec("base", 96)).toEqual({
      storedHeight: 34.5,
      visibleBottom: 4.5,
      visibleHeight: 30,
      visibleTop: 34.5,
    });
  });

  it("preserves the catalog height for wall fillers", () => {
    expect(installedFillerVerticalSpec("wall", 42)).toEqual({
      storedHeight: 42,
      visibleBottom: 0,
      visibleHeight: 42,
      visibleTop: 42,
    });
  });

  it("detects a three-inch or smaller trailing opening after placement", () => {
    const opportunity = findSmallGapFillerOpportunity({ ...DEFAULT_ROOM, width: 20.5 }, [cabinet], [], cabinet.uid);
    expect(opportunity).toMatchObject({ cabinetUid: cabinet.uid, openingStart: 0, openingLength: 20.5, remaining: 2.5 });
  });

  it("converts a fitted right-drag opening into the same catalog filler choices for cabinets, panels, fillers, and appliances", () => {
    const preview = {
      wall: "top" as const,
      snapped: true,
      candidate: { ...cabinet, x: 30 },
      ghostCandidate: { ...cabinet, x: 30 },
      fit: {
        gap: { side: "top" as const, layer: "base" as const, start: 30, length: 15, center: 37.5, isStandardSize: true, isFillerSize: false },
        containsTarget: true,
        requiredSpan: 12,
        availableSpan: 15,
        shortage: 0,
        snapStart: 30,
        snapEnd: 42,
        before: 0,
        after: 3,
        status: "valid" as const,
      },
    };

    for (const uid of ["cabinet", "panel", "filler", "appliance"]) {
      expect(smallGapFillerOpportunityFromDragPreview(uid, preview)).toEqual({
        cabinetUid: uid,
        wall: "top",
        layer: "base",
        cabinetStart: 30,
        cabinetSpan: 12,
        openingStart: 30,
        openingLength: 15,
        remaining: 3,
      });
    }
  });

  it("does not offer a dragged-object filler when the bounded remainder exceeds three inches", () => {
    const preview = {
      wall: "top" as const,
      snapped: false,
      candidate: { ...cabinet, x: 30 },
      fit: {
        gap: { side: "top" as const, layer: "base" as const, start: 30, length: 16, center: 38, isStandardSize: false, isFillerSize: false },
        containsTarget: true,
        requiredSpan: 12,
        availableSpan: 16,
        shortage: 0,
        snapStart: 30,
        snapEnd: 42,
        before: 0,
        after: 4,
        status: "valid" as const,
      },
    };
    expect(smallGapFillerOpportunityFromDragPreview("cabinet", preview)).toBeNull();
  });

  it("offers the exact two-and-a-half-inch filler remainder between a moved B-12 and a perpendicular corner cabinet", () => {
    const leftRun: PlacedCabinet = { ...cabinet, uid: "left-run", masterCode: "B-105.5", width: 105.5, x: 0 };
    const moving: PlacedCabinet = { ...cabinet, uid: "moving-b12", masterCode: "B-12", width: 12, x: 60 };
    const corner: PlacedCabinet = { ...cabinet, uid: "corner", masterCode: "BER36", description: "36 inch Easy Reach Corner", width: 36, depth: 24, x: 120, y: 0, rotation: 90 };
    const preview = cabinetWallDragPreview(moving, DEFAULT_ROOM, [leftRun, moving, corner], [], 112)!;

    expect(preview.candidate).toMatchObject({ x: 105.5, y: 0 });
    expect(preview.fit).toMatchObject({ gap: { start: 105.5, length: 14.5 }, before: 0, after: 2.5 });
    expect(smallGapFillerOpportunityFromDragPreview(moving.uid, preview)).toMatchObject({
      cabinetUid: moving.uid,
      openingStart: 105.5,
      openingLength: 14.5,
      remaining: 2.5,
    });
  });

  it("detects the measured two-and-a-half-inch opening between B-15 and an LS3612 corner cabinet", () => {
    const b15: PlacedCabinet = { ...cabinet, uid: "b15", masterCode: "B-15", width: 15, x: 0 };
    const lazySusan: PlacedCabinet = {
      ...cabinet,
      uid: "ls3612",
      masterCode: "LS3612",
      description: "Lazy Susan Corner Base",
      x: 17.5,
      width: 36,
      depth: 36,
    };
    expect(findSmallGapFillerOpportunity(DEFAULT_ROOM, [b15, lazySusan], [], b15.uid)).toMatchObject({
      cabinetUid: b15.uid,
      openingStart: 0,
      openingLength: 17.5,
      remaining: 2.5,
    });
  });

  it("detects the reported two-and-a-quarter-inch remainder beside a B-27 when the next run boundary is a tall cabinet", () => {
    const leftBase: PlacedCabinet = { ...cabinet, uid: "left-base", masterCode: "B-24", width: 24, x: 102.25 };
    const b27: PlacedCabinet = { ...cabinet, uid: "reported-b27", masterCode: "B-27", width: 27, x: 126.25 };
    const rightTall: PlacedCabinet = {
      ...cabinet,
      uid: "right-tall",
      masterCode: "T-2496",
      description: "Tall pantry cabinet",
      placement: "tall",
      width: 24,
      x: 155.5,
      height: 96,
    };

    expect(findSmallGapFillerOpportunity(
      { ...DEFAULT_ROOM, width: 204 },
      [leftBase, b27, rightTall],
      [],
      b27.uid,
    )).toMatchObject({
      cabinetUid: b27.uid,
      cabinetStart: 126.25,
      cabinetSpan: 27,
      openingStart: 126.25,
      openingLength: 29.25,
      remaining: 2.25,
    });
  });

  it("detects the same B-27 remainder when a floor appliance forms the next run boundary", () => {
    const leftBase: PlacedCabinet = { ...cabinet, uid: "appliance-left-base", masterCode: "B-24", width: 24, x: 102.25 };
    const b27: PlacedCabinet = { ...cabinet, uid: "appliance-b27", masterCode: "B-27", width: 27, x: 126.25 };
    const range: PlacedCabinet = {
      ...cabinet,
      uid: "right-range",
      masterCode: "RANGE-30",
      description: "30 inch range",
      placement: "appliance",
      width: 30,
      x: 155.5,
      height: 36,
    };

    expect(findSmallGapFillerOpportunity(
      { ...DEFAULT_ROOM, width: 204 },
      [leftBase, b27, range],
      [],
      b27.uid,
    )).toMatchObject({ openingStart: 126.25, openingLength: 29.25, remaining: 2.25 });
  });

  it("does not prompt for an exact-fit W-36-42 beside a refrigerator when its 36-inch bridge is inset one inch", () => {
    const w3642: PlacedCabinet = {
      ...cabinet,
      uid: "w3642",
      masterCode: "W-36-42",
      description: "36 inch Double Door Wall Cabinet",
      placement: "wall",
      x: 0,
      width: 36,
      depth: 12,
      height: 42,
      mountBottom: 54,
    };
    const refrigerator: PlacedCabinet = {
      ...cabinet,
      uid: "refrigerator",
      masterCode: "FRIDGE-36",
      description: "36 inch Refrigerator",
      placement: "appliance",
      x: 36,
      width: 36,
      depth: 30,
      height: 70,
    };
    const refrigeratorBridge: PlacedCabinet = {
      ...w3642,
      uid: "refrigerator-bridge",
      masterCode: "WFR3642",
      description: "36 inch Refrigerator Wall Cabinet",
      x: 37,
      width: 36,
      height: 24,
      mountBottom: 72,
      refrigeratorAssemblyId: refrigerator.uid,
      refrigeratorAssemblyRole: "bridge",
    };

    const room = { ...DEFAULT_ROOM, width: 144 };
    const placed = [w3642, refrigerator, refrigeratorBridge];
    expect(wallCabinetFitMeasure(w3642, room, placed, [], "top")).toMatchObject({
      availableStart: 0,
      availableEnd: 36,
      availableSpan: 36,
      before: 0,
      after: 0,
      afterBoundary: "FRIDGE-36",
    });
    expect(findSmallGapFillerOpportunity(room, placed, [], w3642.uid)).toBeNull();
  });

  it("does not offer an automatic filler for the reported quarter-inch W-36-42 remainder", () => {
    const w3642: PlacedCabinet = {
      ...cabinet,
      uid: "reported-quarter-inch-w3642",
      masterCode: "W-36-42",
      description: "36 inch Double Door Wall Cabinet",
      placement: "wall",
      x: 0,
      width: 36,
      depth: 12,
      height: 42,
      mountBottom: 54,
    };
    const room = { ...DEFAULT_ROOM, width: 36.25 };
    expect(wallCabinetFitMeasure(w3642, room, [w3642], [], "top")).toMatchObject({
      availableSpan: 36.25,
      requiredSpan: 36,
      before: 0,
      after: 0.25,
    });
    expect(findSmallGapFillerOpportunity(room, [w3642], [], w3642.uid)).toBeNull();
  });

  it("does not prompt for W2442 when a three-quarter-inch clearance exists on one side but 59½ inches remains on the other", () => {
    const previousUpper: PlacedCabinet = {
      ...cabinet,
      uid: "previous-upper",
      masterCode: "W-24-42-PREV",
      placement: "wall",
      x: 36.75,
      y: 0,
      width: 24,
      depth: 12,
      height: 42,
      mountBottom: 54,
    };
    const w2442: PlacedCabinet = {
      ...previousUpper,
      uid: "w2442",
      masterCode: "W-24-42",
      x: 61.5,
    };
    expect(findSmallGapFillerOpportunity(
      { ...DEFAULT_ROOM, width: 145 },
      [previousUpper, w2442],
      [],
      w2442.uid,
    )).toBeNull();
  });

  it("does not prompt for an opening larger than three inches", () => {
    expect(findSmallGapFillerOpportunity({ ...DEFAULT_ROOM, width: 21.125 }, [cabinet], [], cabinet.uid)).toBeNull();
  });

  it("places full-left, full-right, and split fillers with exact zero-overlap seams", () => {
    const opportunity = findSmallGapFillerOpportunity({ ...DEFAULT_ROOM, width: 21 }, [cabinet], [], cabinet.uid)!;
    const left = smallGapFillerLayout(opportunity, "left");
    const right = smallGapFillerLayout(opportunity, "right");
    const split = smallGapFillerLayout(opportunity, "split");
    expect(left).toMatchObject({ cabinetStart: 3, leftWidth: 3, rightWidth: 0 });
    expect(right).toMatchObject({ cabinetStart: 0, leftWidth: 0, rightWidth: 3 });
    expect(split).toMatchObject({ cabinetStart: 1.5, leftWidth: 1.5, rightWidth: 1.5 });
    expect(split.pieces[0]!.start + split.pieces[0]!.width).toBe(split.cabinetStart);
    expect(split.cabinetStart + opportunity.cabinetSpan).toBe(split.pieces[1]!.start);
    expect(split.pieces[1]!.start + split.pieces[1]!.width).toBe(opportunity.openingStart + opportunity.openingLength);
  });

  it("removes both physical halves as one purchased filler group", () => {
    const pieces: PlacedCabinet[] = [
      cabinet,
      { ...cabinet, uid: "fill-left", masterCode: "BF3", fillerPieceGroupId: "fill-group", fillerBillingRole: "primary" },
      { ...cabinet, uid: "fill-right", masterCode: "BF3", fillerPieceGroupId: "fill-group", fillerBillingRole: "secondary" },
    ];
    expect(removePlacedCabinetGroup(pieces, "fill-right").map((item) => item.uid)).toEqual([cabinet.uid]);
  });

  it("reopens an installed split filler as one editable purchased group", () => {
    const room = { ...DEFAULT_ROOM, width: 21 };
    const pieces: PlacedCabinet[] = [
      { ...cabinet, x: 1.5 },
      { ...cabinet, uid: "fill-left", masterCode: "BF3", description: "3 inch Base Filler", subCategory: "Filler", x: 0, width: 1.5, fillerPieceGroupId: "fill-group", fillerBillingRole: "primary", fillerTotalWidth: 3, fillerPlacementMode: "split", fillerForCabinetUid: cabinet.uid },
      { ...cabinet, uid: "fill-right", masterCode: "BF3", description: "3 inch Base Filler", subCategory: "Filler", x: 19.5, width: 1.5, fillerPieceGroupId: "fill-group", fillerBillingRole: "secondary", fillerTotalWidth: 3, fillerPlacementMode: "split", fillerForCabinetUid: cabinet.uid },
    ];
    expect(installedSmallGapFillerEditOpportunity(room, pieces, [], "fill-right")).toMatchObject({
      cabinetUid: cabinet.uid,
      openingStart: 0,
      openingLength: 21,
      remaining: 3,
      replacingFillerGroupId: "fill-group",
    });
  });

  it("reconstructs a legacy one-sided filler owner and refuses required BBC filler editing", () => {
    const room = { ...DEFAULT_ROOM, width: 21 };
    const legacy: PlacedCabinet[] = [
      cabinet,
      { ...cabinet, uid: "legacy-fill", masterCode: "BF3", description: "3 inch Base Filler", subCategory: "Filler", x: 18, width: 3, fillerPieceGroupId: "legacy-group", fillerBillingRole: "primary", fillerTotalWidth: 3, fillerPlacementMode: "right" },
    ];
    expect(installedSmallGapFillerEditOpportunity(room, legacy, [], "legacy-fill")).toMatchObject({ cabinetUid: cabinet.uid, replacingFillerGroupId: "legacy-group" });
    const required = [{ ...legacy[1], fillerPieceGroupId: `bbc-required-filler-${cabinet.uid}` }];
    expect(installedSmallGapFillerEditOpportunity(room, required, [], "legacy-fill")).toBeNull();
  });

  it.each(["front", "back", "left", "right"] as const)("measures a 2½-inch manual filler opening on the island %s face", (face: IslandFace) => {
    const island: IslandZone = { x: 36, y: 30, width: 72, depth: 48, activeFace: face };
    const faceLength = face === "front" || face === "back" ? island.width : island.depth;
    const islandCabinet = islandFacePlacement({ ...cabinet, uid: `island-${face}`, width: faceLength - 2.5 }, island, face, 0);
    expect(findIslandSmallGapFillerOpportunity(island, [islandCabinet], islandCabinet.uid)).toMatchObject({
      cabinetUid: islandCabinet.uid,
      islandFace: face,
      openingStart: 0,
      openingLength: faceLength,
      remaining: 2.5,
    });
  });

  it("reopens an installed island filler against its explicit owning cabinet", () => {
    const island: IslandZone = { x: 36, y: 30, width: 48, depth: 48, activeFace: "front" };
    const owner = islandFacePlacement({ ...cabinet, uid: "island-owner", width: 45 }, island, "front", 0);
    const filler = islandFacePlacement({
      ...cabinet,
      uid: "island-filler",
      masterCode: "BF3",
      description: "3 inch Base Filler",
      subCategory: "Filler",
      width: 3,
      fillerPieceGroupId: "island-fill-group",
      fillerBillingRole: "primary",
      fillerTotalWidth: 3,
      fillerPlacementMode: "right",
      fillerForCabinetUid: owner.uid,
    }, island, "front", 45);
    expect(installedSmallGapFillerEditOpportunity(DEFAULT_ROOM, [owner, filler], [], filler.uid, island)).toMatchObject({
      cabinetUid: owner.uid,
      islandFace: "front",
      remaining: 3,
      replacingFillerGroupId: "island-fill-group",
    });
  });

  it("preserves the refrigerator, its upper cabinet, panels, and every unrelated placement when filler pieces are added", () => {
    const b15 = { ...cabinet, uid: "b15", masterCode: "B-15", width: 15 };
    const refrigerator = { ...cabinet, uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance" as const, x: 30, width: 36, height: 70 };
    const refrigeratorUpper = { ...cabinet, uid: "fridge-upper", masterCode: "MW3042", placement: "wall" as const, x: 30, width: 30, height: 42, mountBottom: 72 };
    const panel = { ...cabinet, uid: "fridge-panel", masterCode: "REPV2496", placement: "tall" as const, x: 66, width: 0.75, height: 96 };
    const moved = { ...b15, x: 1.25 };
    const filler = { ...cabinet, uid: "filler", masterCode: "BF3", x: 0, y: 100, width: 1.25, fillerPieceGroupId: "filler-group", fillerTotalWidth: 1.25, fillerPlacementMode: "left" as const };
    const result = appendSmallGapFillerPlacement([b15, refrigerator, refrigeratorUpper, panel], moved, [filler]);

    expect(result.rejected).toEqual([]);
    expect(result.placed.map((item) => item.uid)).toEqual(["b15", "fridge", "fridge-upper", "fridge-panel", "filler"]);
  });

  it("bills and previews a split filler as one catalog quantity", () => {
    const placed: PlacedCabinet[] = [
      { ...cabinet, uid: "fill-left", cabinetId: 88, masterCode: "BF3", fillerPieceGroupId: "fill-group", fillerBillingRole: "primary" },
      { ...cabinet, uid: "fill-right", cabinetId: 88, masterCode: "BF3", fillerPieceGroupId: "fill-group", fillerBillingRole: "secondary" },
    ];
    const common = { placed, styleId: 7, distributorId: 2, tier: "homeowner" as const, styleNameById: new Map([[7, "Selected style"]]), unitPriceFor: () => 42 };
    expect(buildDesignCabinetCartLines(common)).toMatchObject([{ masterCode: "BF3", qty: 1, unitPrice: 42 }]);
    expect(buildDesignPreviewPricingLines(common)).toMatchObject([{ masterCode: "BF3", qty: 1, unitPrice: 42, placementUids: ["fill-left"] }]);
  });
});
