import { describe, expect, it } from "vitest";
import { buildDesignCabinetCartLines, buildDesignPreviewPricingLines } from "@/lib/designCartLines";
import { DEFAULT_ROOM, type PlacedCabinet } from "@/lib/design";
import {
  findSmallGapFillerOpportunity,
  removePlacedCabinetGroup,
  smallGapFillerLayout,
} from "@/lib/smallGapFiller";

const cabinet: PlacedCabinet = {
  uid: "cabinet-1", cabinetId: 10, masterCode: "B-18", description: "18 inch base", placement: "base",
  x: 0, y: 0, width: 18, depth: 24, height: 34.5, rotation: 0,
};

describe("small-gap filler placement", () => {
  it("detects a three-inch or smaller trailing opening after placement", () => {
    const opportunity = findSmallGapFillerOpportunity({ ...DEFAULT_ROOM, width: 20.5 }, [cabinet], [], cabinet.uid);
    expect(opportunity).toMatchObject({ cabinetUid: cabinet.uid, openingStart: 0, openingLength: 20.5, remaining: 2.5 });
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
