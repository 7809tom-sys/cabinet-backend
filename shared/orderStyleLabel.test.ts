import { describe, expect, it } from "vitest";
import {
  checkoutLineDescription,
  composeDoorStyleLabel,
  lineColorFinishLabel,
  orderStyleSummary,
  resolvedLineStyleLabel,
} from "./orderStyleLabel";

const shakerWhite = {
  id: 390001,
  distributorId: 180001,
  ourName: "Shaker White",
  aliasName: null,
  distributorName: "Shaker White",
  doorStyle: "Shaker",
  color: null,
  finish: null,
};

const treasure = {
  id: 390009,
  distributorId: 180001,
  ourName: "Treasure Chest",
  aliasName: "Treasure Chest",
  color: "",
  finish: null,
};

describe("per-line style labels", () => {
  it("uses each style's own name when color and finish are empty", () => {
    expect(lineColorFinishLabel(shakerWhite)).toBe("Shaker White");
    expect(lineColorFinishLabel(treasure)).toBe("Treasure Chest");
    expect(composeDoorStyleLabel(shakerWhite)).toBe("Shaker White");
  });

  it("adds color and finish only when the name does not already say them", () => {
    expect(composeDoorStyleLabel({
      ourName: "Shaker",
      color: "White",
      finish: "Solid Birch",
    })).toBe("Shaker · White · Solid Birch");
    expect(composeDoorStyleLabel({
      ourName: "Shaker White",
      color: "White",
      finish: "Shaker White",
    })).toBe("Shaker White");
  });

  it("prefers the affiliate name for this style and still keeps a distinct color", () => {
    expect(composeDoorStyleLabel(shakerWhite, "Arctic Shaker")).toBe("Arctic Shaker");
    expect(composeDoorStyleLabel({ ourName: "Shaker", color: "White" }, "Arctic")).toBe("Arctic · White");
  });

  it("resolves an older line from its styleId instead of the order-level name", () => {
    const styles = new Map([[390001, shakerWhite], [390009, treasure]]);
    expect(resolvedLineStyleLabel({
      styleId: 390009,
      doorStyle: "Shaker White",
    }, styles)).toBe("Treasure Chest");
    expect(resolvedLineStyleLabel({
      styleId: 390001,
      doorStyle: "Shaker White",
    }, styles)).toBe("Shaker White");
  });

  it("leaves Pelican and hardware lines without a cabinet color", () => {
    const styles = new Map([[390001, shakerWhite]]);
    expect(resolvedLineStyleLabel({
      productKind: "surface",
      styleId: null,
      doorStyle: null,
    }, styles)).toBeNull();
    expect(resolvedLineStyleLabel({
      productKind: "hardware",
      styleId: null,
      doorStyle: "Shaker White",
    }, styles)).toBeNull();
  });

  it("puts the line style on a Stripe description and summarizes mixed orders", () => {
    expect(checkoutLineDescription(
      { masterCode: "B24", description: "24 in Base" },
      "Treasure Chest",
    )).toBe("B24 — 24 in Base — Treasure Chest");
    expect(orderStyleSummary(["Shaker White", "Treasure Chest", "Shaker White"])).toBe("Shaker White, Treasure Chest");
  });

  it("drops product image markup from a style label", () => {
    expect(composeDoorStyleLabel({
      ourName: 'White <img src="https://cdn.example/door.jpg">',
      color: "https://cdn.example/swatch.png",
    })).toBe("White");
  });
});
