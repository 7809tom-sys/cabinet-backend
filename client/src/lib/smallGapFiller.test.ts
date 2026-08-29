import { describe, expect, it } from "vitest";
import { buildDesignCabinetCartLines, buildDesignPreviewPricingLines } from "@/lib/designCartLines";
import { DEFAULT_ROOM, cabinetWallDragPreview, type PlacedCabinet } from "@/lib/design";
import {
  appendSmallGapFillerPlacement,
  findSmallGapFillerOpportunity,
  installedFillerVerticalSpec,
  removePlacedCabinetGroup,
  smallGapFillerOpportunityFromDragPreview,
  smallGapFillerLayout,
} from "@/lib/smallGapFiller";

const cabinet: PlacedCabinet = {
  uid: "cabinet-1", cabinetId: 10, masterCode: "B-18", description: "18 inch base", placement: "base",
  x: 0, y: 0, width: 18, depth: 24, height: 34.5, rotation: 0,
};

describe("small-gap filler placement", () => {
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
