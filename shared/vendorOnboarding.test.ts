import { describe, expect, it } from "vitest";
import {
  applyFlaggedSubmission,
  isNineInchBase,
  parseOnboardingText,
  planOnboarding,
  summarizeOnboarding,
  type OnboardingMaster,
  type OnboardingStyle,
  type PlannedOnboardingRow,
} from "./vendorOnboarding";

const shaker: OnboardingStyle = {
  id: 7,
  styleCode: "SW",
  ourName: "Shaker",
  aliasName: "White Shaker",
  distributorName: "Aspen White",
  color: "White",
  doorStyle: "Shaker",
};

const b12: OnboardingMaster = {
  id: 12,
  masterCode: "B12",
  description: "12 inch base",
  category: "Base",
  subCategory: "Base",
  width: "12",
  height: "34.5",
  depth: "24",
  numberOfDoors: 1,
  numberOfDrawers: 1,
  placementType: "base",
  conflictStatus: "none",
};

const styles = [shaker];

function plan(rows: Parameters<typeof planOnboarding>[0]["rows"], extra: Partial<Parameters<typeof planOnboarding>[0]> = {}) {
  return planOnboarding({
    rows,
    masters: [b12],
    aliases: [{ alias: "B-12", cabinetId: 12 }, { alias: "BASE-12", cabinetId: 12 }],
    styles,
    lineName: "Acme Cabinets",
    lineId: 4,
    ...extra,
  });
}

function fullException(sku: string) {
  return {
    distributorName: "Acme Cabinets",
    style: "Shaker",
    color: "White",
    price: 88,
    category: "Base",
    width: 18,
    height: 34.5,
    depth: 24,
    description: "Vendor base",
    numberOfDoors: 1,
    numberOfDrawers: 1,
    sku,
  };
}

describe("vendor onboarding matching", () => {
  it("resolves alias B-12 to the standard B12 base", () => {
    const [row] = plan([{ rowNumber: 2, sku: "B-12", style: "Shaker", color: "White", price: 120 }]);
    expect(row).toMatchObject({
      status: "matched",
      flagReason: null,
      cabinetId: 12,
      masterCode: "B12",
      matchedVia: "master",
      needsFullDetails: false,
      price: 120,
      distributorName: "Acme Cabinets",
    });
    expect(row.inherited).toMatchObject({
      description: "12 inch base",
      category: "Base",
      width: "12",
      height: "34.5",
      depth: "24",
      numberOfDoors: 1,
      numberOfDrawers: 1,
    });

    const [spaced] = plan([{ rowNumber: 2, sku: " b 12 ", style: "shaker", price: "99.5" }]);
    expect(spaced).toMatchObject({ status: "matched", cabinetId: 12, masterCode: "B12", color: "White", price: 99.5 });

    const [aliasOnly] = plan([{ rowNumber: 3, sku: "BASE-12", style: "White Shaker", price: 10 }]);
    expect(aliasOnly).toMatchObject({ status: "matched", cabinetId: 12, masterCode: "B12", matchedVia: "alias" });
  });

  it("flags an unknown SKU", () => {
    const [row] = plan([{ rowNumber: 4, sku: "NO-SUCH-9", style: "Shaker", color: "White", price: 40 }]);
    expect(row).toMatchObject({
      status: "flagged",
      flagReason: "unknown_sku",
      cabinetId: null,
      needsFullDetails: true,
    });
  });

  it("flags an ambiguous SKU instead of guessing", () => {
    const other: OnboardingMaster = { ...b12, id: 15, masterCode: "B15", description: "15 inch base", width: "15" };
    const [row] = plan(
      [{ rowNumber: 5, sku: "B-12", style: "Shaker", color: "White", price: 10 }],
      { masters: [b12, other], aliases: [{ alias: "B-12", cabinetId: 12 }, { alias: "B-12", cabinetId: 15 }] },
    );
    expect(row.status).toBe("flagged");
    expect(row.flagReason).toBe("ambiguous");
    expect(row.cabinetId).toBeNull();
    expect(row.candidateMasterCodes).toEqual(["B12", "B15"]);
    expect(row.needsFullDetails).toBe(true);
  });

  it("flags a matched row that is missing a price and only that field", () => {
    const [row] = plan([{ rowNumber: 6, sku: "B12", style: "Shaker", color: "White" }]);
    expect(row).toMatchObject({
      status: "flagged",
      flagReason: "missing_special",
      missingFields: ["price"],
      cabinetId: 12,
      masterCode: "B12",
      needsFullDetails: false,
    });
    expect(row.inherited?.width).toBe("12");

    const parsed = parseOnboardingText("SKU,Style,Color,Price\nB-12,Shaker,White,\n");
    const [fromSheet] = plan(parsed.rows);
    expect(fromSheet).toMatchObject({ status: "flagged", flagReason: "missing_special", missingFields: ["price"], masterCode: "B12" });

    const [noLine] = plan(
      [{ rowNumber: 7, sku: "B12", style: "Shaker", color: "White", price: 10, distributorName: " " }],
      { lineName: "" },
    );
    expect(noLine.flagReason).toBe("missing_special");
    expect(noLine.missingFields).toEqual(["distributorName"]);
  });

  it("keeps a warehouse import focused on a few exceptions", () => {
    const masters: OnboardingMaster[] = Array.from({ length: 200 }, (_, index) => {
      const n = index + 1;
      return {
        ...b12,
        id: 1000 + n,
        masterCode: `U${n}`,
        category: "Wall",
        description: `Wall ${n}`,
        width: String((index % 36) + 12),
        numberOfDrawers: 0,
      };
    });
    masters.push(b12);
    const happy = masters.slice(1, 181).map((master, index) => ({
      rowNumber: index + 2,
      sku: master.masterCode.toLowerCase(),
      style: "Shaker",
      color: "White",
      price: 40 + index,
    }));
    const planned = planOnboarding({
      rows: [
        ...happy,
        { rowNumber: 400, sku: "b-12", style: "Shaker", color: "White", price: 77 },
        { rowNumber: 401, sku: "UNKNOWN-1", style: "Shaker", color: "White", price: 10 },
        { rowNumber: 402, sku: "UNKNOWN-2", style: "Shaker", color: "White", price: 11 },
        { rowNumber: 403, sku: "UNKNOWN-3", style: "Shaker", color: "White", price: 12 },
        { rowNumber: 404, sku: "U2", style: "Shaker", color: "White", price: "" },
        { rowNumber: 405, sku: "U1", style: "Shaker", color: "White", price: 15 },
      ],
      masters: [...masters, { ...b12, id: 4242, masterCode: "U1T", sku: "U1" }],
      aliases: [{ alias: "B-12", cabinetId: 12 }],
      styles,
      lineName: "Acme Cabinets",
      lineId: 4,
    });
    const summary = summarizeOnboarding(planned);
    const flagged = planned.filter((row) => row.status === "flagged");
    expect(summary.total).toBe(186);
    expect(summary.matched).toBe(181);
    expect(summary.flagged).toBe(5);
    expect(summary.flagged).toBeLessThan(20);
    expect(flagged.map((row) => [row.sku, row.flagReason])).toEqual([
      ["UNKNOWN-1", "unknown_sku"],
      ["UNKNOWN-2", "unknown_sku"],
      ["UNKNOWN-3", "unknown_sku"],
      ["U2", "missing_special"],
      ["U1", "ambiguous"],
    ]);
    expect(flagged.find((row) => row.sku === "U2")?.missingFields).toEqual(["price"]);
    expect(planned.find((row) => row.rowNumber === 400)).toMatchObject({ status: "matched", masterCode: "B12" });
    expect(planned.filter((row) => row.status === "matched")).toHaveLength(181);
  });

  it("does not give a 9 inch base drawers, and leaves trim with its supplier", () => {
    expect(isNineInchBase({ masterCode: "BT9", category: "Base", width: 9 })).toBe(true);
    const tray: OnboardingMaster = {
      ...b12,
      id: 9,
      masterCode: "BT9",
      description: "9 inch tray base",
      subCategory: "Tray Base",
      width: "9",
      numberOfDrawers: 2,
    };
    const trim: OnboardingMaster = {
      ...b12,
      id: 90,
      masterCode: "LCM8",
      category: "Trim",
      description: "Crown molding",
      supplierIds: [9],
    };
    const planned = plan(
      [
        { rowNumber: 2, sku: "BT-09", style: "Shaker", color: "White", price: 30 },
        { rowNumber: 3, sku: "LCM8", style: "Shaker", color: "White", price: 12 },
      ],
      { masters: [tray, trim], aliases: [{ alias: "BT-09", cabinetId: 9 }] },
    );
    expect(planned[0]).toMatchObject({ status: "matched", masterCode: "BT9", matchedVia: "alias" });
    expect(planned[0].inherited?.numberOfDrawers).toBe(0);
    expect(planned[1]).toMatchObject({ status: "matched", trimHeld: true, trimSupplierId: 9 });
  });
});

describe("flagged vendor details", () => {
  const stored = (row: PlannedOnboardingRow) => ({
    status: row.status,
    flagReason: row.flagReason,
    missingFields: row.missingFields,
    sku: row.sku,
    cabinetId: row.cabinetId,
    masterCode: row.masterCode,
    matchedVia: row.matchedVia,
    distributorName: row.distributorName,
    style: row.style,
    color: row.color,
    price: row.price,
    styleId: row.styleId,
    inherited: row.inherited,
    draft: row.draft,
    trimHeld: row.trimHeld,
    trimSupplierId: row.trimSupplierId,
  });

  it("turns a missing price into a match without opening a new master", () => {
    const [row] = plan([{ rowNumber: 2, sku: "B12", style: "Shaker", color: "White" }]);
    const outcome = applyFlaggedSubmission(stored(row), { price: 64 }, { styles, lineName: "Acme Cabinets", lineId: 4 });
    expect(outcome).toMatchObject({ ok: true, status: "matched", opensReview: false, price: 64, flagReason: null });
  });

  it("sends a completed unknown SKU to conflict review instead of a verified master", () => {
    const [row] = plan([{ rowNumber: 8, sku: "CUSTOM-1", style: "Shaker", color: "White", price: 70 }]);
    const outcome = applyFlaggedSubmission(stored(row), {
      category: "Base",
      width: 21,
      height: 34.5,
      depth: 24,
      description: "Custom base",
      numberOfDoors: 1,
      numberOfDrawers: 1,
    }, { styles, lineName: "Acme Cabinets", lineId: 4 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.status).toBe("completed");
    expect(outcome.opensReview).toBe(true);
    expect(outcome.review?.conflictReason).toMatch(/unverified/i);
    expect(outcome.review?.conflictReason).toMatch(/Resolved fields:/);
    expect(outcome.review).toMatchObject({ masterCode: "CUSTOM-1", numberOfDrawers: 1, category: "Base" });
  });

  it("rejects drawers on a 9 inch base exception", () => {
    const [row] = plan([{ rowNumber: 9, sku: "BT9", price: 10 }]);
    expect(row.flagReason).toBe("unknown_sku");
    const outcome = applyFlaggedSubmission(stored(row), {
      ...fullException("BT9"),
      category: "Base",
      width: 9,
      description: "9 inch tray base",
      numberOfDrawers: 2,
    }, { styles, lineName: "Acme Cabinets", lineId: 4 });
    expect(outcome).toMatchObject({
      ok: false,
      message: "9-inch base cabinets are tray or full-height and never have drawers.",
    });
    const accepted = applyFlaggedSubmission(stored(row), {
      ...fullException("BT9"),
      category: "Base",
      width: 9,
      description: "9 inch tray base",
      numberOfDrawers: 0,
    }, { styles, lineName: "Acme Cabinets", lineId: 4 });
    expect(accepted).toMatchObject({ ok: true, status: "completed", opensReview: true });
    if (!accepted.ok) return;
    expect(accepted.review?.numberOfDrawers).toBe(0);
  });
});
