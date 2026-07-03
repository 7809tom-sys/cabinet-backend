import { describe, expect, it, beforeEach } from "vitest";
import {
  computeBoxes,
  saveSurfaceSelection,
  loadSurfaceSelection,
  clearSurfaceSelection,
  guessFlooringMaterialId,
  guessBacksplashMaterialId,
  guessCountertopMaterialId,
  SURFACE_SELECTION_KEY,
  type SurfaceSelection,
  type SurfacePick,
} from "./surfaceSelection";

// The repo runs vitest under the "node" environment (no DOM), so provide a
// minimal in-memory localStorage shim before the module reads/writes it.
if (typeof (globalThis as any).localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe("computeBoxes", () => {
  it("returns null when no area is entered", () => {
    expect(computeBoxes(null, 20, 0.1)).toBeNull();
    expect(computeBoxes(0, 20, 0.1)).toBeNull();
  });

  it("rounds up to whole boxes and applies the waste factor", () => {
    // 180 sqft * 1.1 = 198; /20 = 9.9 -> 10 boxes
    expect(computeBoxes(180, 20, 0.1)).toBe(10);
    // exact fit still rounds correctly: 200 * 1.0 / 20 = 10
    expect(computeBoxes(200, 20, 0)).toBe(10);
    // 201 * 1.0 / 20 = 10.05 -> 11
    expect(computeBoxes(201, 20, 0)).toBe(11);
  });

  it("guards against a zero/invalid per-box coverage", () => {
    expect(computeBoxes(50, 0, 0)).toBe(50); // falls back to 1 sqft/box
    expect(computeBoxes(50, undefined, undefined)).toBe(50);
  });
});

describe("surface selection persistence", () => {
  beforeEach(() => clearSurfaceSelection());

  const sample: SurfaceSelection = {
    v: 1,
    savedAt: 123,
    layout: "l-shape",
    previewUrl: null,
    picks: {
      flooring: {
        id: 51,
        slug: "astoria",
        name: "Astoria 20mil Vinyl Flooring",
        category: "Flooring",
        sellPrice: 74.25,
        boxes: 10,
      } as SurfacePick,
    },
  };

  it("round-trips through localStorage", () => {
    saveSurfaceSelection(sample);
    const raw = localStorage.getItem(SURFACE_SELECTION_KEY);
    expect(raw).toBeTruthy();
    const loaded = loadSurfaceSelection();
    expect(loaded?.picks.flooring?.id).toBe(51);
    expect(loaded?.picks.flooring?.boxes).toBe(10);
  });

  it("returns null after clearing", () => {
    saveSurfaceSelection(sample);
    clearSurfaceSelection();
    expect(loadSurfaceSelection()).toBeNull();
  });

  it("ignores corrupt payloads", () => {
    localStorage.setItem(SURFACE_SELECTION_KEY, "{not json");
    expect(loadSurfaceSelection()).toBeNull();
  });
});

describe("material mapping heuristics", () => {
  const mk = (name: string, category = "Flooring"): SurfacePick => ({
    id: 1,
    slug: "x",
    name,
    category,
    sellPrice: null,
  });

  it("maps flooring names to the closest design material", () => {
    expect(guessFlooringMaterialId(mk("Walnut Wide Plank"))).toBe("walnut-hardwood");
    expect(guessFlooringMaterialId(mk("Astoria 20mil Vinyl Flooring"))).toBe("luxury-vinyl");
    expect(guessFlooringMaterialId(mk("Gray Porcelain"))).toBe("gray-tile");
  });

  it("maps backsplash tile names", () => {
    expect(guessBacksplashMaterialId(mk("Moonstone Hex", "Tile & Mosaic"))).toBe("white-hex");
    expect(guessBacksplashMaterialId(mk("Carrara Subway", "Tile & Mosaic"))).toBe("white-subway");
  });

  it("maps countertop names", () => {
    expect(guessCountertopMaterialId(mk("Calacatta Oro", "Quartz Slabs (Countertops)"))).toBe(
      "carrara-marble"
    );
    expect(guessCountertopMaterialId(mk("Nocturne Black", "Quartz Slabs (Countertops)"))).toBe(
      "black-granite"
    );
    expect(guessCountertopMaterialId(mk("Apollo", "Quartz Slabs (Countertops)"))).toBe(
      "white-quartz"
    );
  });

  it("returns null for undefined picks", () => {
    expect(guessFlooringMaterialId(undefined)).toBeNull();
    expect(guessCountertopMaterialId(undefined)).toBeNull();
  });
});
