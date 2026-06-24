import { describe, it, expect } from "vitest";
import {
  relevantCategories,
  selectRecommendations,
  type CrossSellCartLine,
  type CrossSellItem,
} from "./crossSell";

const base = (code: string, doors = 2): CrossSellCartLine => ({
  masterCode: code,
  placement: "base",
  numberOfDoors: doors,
});
const wall = (code: string): CrossSellCartLine => ({
  masterCode: code,
  placement: "wall",
  numberOfDoors: 1,
});

describe("relevantCategories", () => {
  it("returns nothing for an empty cart", () => {
    expect(relevantCategories([])).toEqual([]);
  });

  it("recommends trays + end panel + filler + touch-up for a base-only cart", () => {
    const cats = relevantCategories([base("B-24"), base("SB-36")]);
    expect(cats).toContain("rollOutTray");
    expect(cats).toContain("endPanel");
    expect(cats).toContain("filler");
    expect(cats).toContain("touchUpKit");
    expect(cats).not.toContain("crownMolding");
  });

  it("recommends crown molding when wall cabinets are present", () => {
    const cats = relevantCategories([wall("W-3030")]);
    expect(cats).toContain("crownMolding");
  });

  it("does not recommend trays for a base cabinet with no doors (e.g. drawer base only counts doors)", () => {
    const cats = relevantCategories([base("DB-18", 0)]);
    expect(cats).not.toContain("rollOutTray");
  });

  it("keeps touch-up kit last (lowest priority)", () => {
    const cats = relevantCategories([base("B-24"), wall("W-3030")]);
    expect(cats[cats.length - 1]).toBe("touchUpKit");
  });
});

describe("selectRecommendations", () => {
  const candidates: CrossSellItem[] = [
    { category: "rollOutTray", masterCode: "RS-21", name: "Roll-Out 21", unitPrice: 40, reason: "" },
    { category: "rollOutTray", masterCode: "RS-24", name: "Roll-Out 24", unitPrice: 45, reason: "" },
    { category: "rollOutTray", masterCode: "RS-30", name: "Roll-Out 30", unitPrice: 50, reason: "" },
    { category: "endPanel", masterCode: "BDEP", name: "Base End Panel", unitPrice: 60, reason: "" },
    { category: "touchUpKit", masterCode: "TUK", name: "Touch-Up Kit", unitPrice: 25, reason: "" },
    { category: "crownMolding", masterCode: "CM-8", name: "Crown 8ft", unitPrice: 35, reason: "" },
  ];

  it("excludes items already in the cart", () => {
    const out = selectRecommendations(
      candidates,
      ["RS-21"],
      ["rollOutTray", "endPanel", "touchUpKit"]
    );
    expect(out.find((i) => i.masterCode === "RS-21")).toBeUndefined();
    expect(out.find((i) => i.masterCode === "RS-24")).toBeDefined();
  });

  it("excludes categories not deemed relevant", () => {
    const out = selectRecommendations(candidates, [], ["endPanel"]);
    expect(out.every((i) => i.category === "endPanel")).toBe(true);
  });

  it("caps per-category count", () => {
    const out = selectRecommendations(candidates, [], ["rollOutTray"], { perCategory: 2 });
    expect(out.filter((i) => i.category === "rollOutTray")).toHaveLength(2);
  });

  it("caps total recommendations", () => {
    const out = selectRecommendations(
      candidates,
      [],
      ["rollOutTray", "endPanel", "crownMolding", "touchUpKit"],
      { perCategory: 3, max: 3 }
    );
    expect(out).toHaveLength(3);
  });

  it("matches cart codes case-insensitively", () => {
    const out = selectRecommendations(candidates, ["rs-24"], ["rollOutTray"]);
    expect(out.find((i) => i.masterCode === "RS-24")).toBeUndefined();
  });

  it("preserves category priority order", () => {
    const out = selectRecommendations(
      candidates,
      [],
      ["rollOutTray", "endPanel", "touchUpKit"],
      { perCategory: 1, max: 6 }
    );
    expect(out[0].category).toBe("rollOutTray");
    expect(out[out.length - 1].category).toBe("touchUpKit");
  });
});
