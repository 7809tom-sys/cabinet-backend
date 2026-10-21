import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  groupPelicanConfigurations,
  pelicanConfigurationStyles,
  pelicanDisplayVariant,
  pelicanSelectedSiblings,
  pelicanUseLabel,
  pelicanVariantMenuLabel,
  type PelicanGroupable,
} from "./pelicanConfigurationGrouping";

// Real rows exported from the live Pelican catalog (designer scope + every
// recommended role). The grouping must never lose or invent a SKU.
const rows = JSON.parse(
  readFileSync(new URL("../client/src/lib/__fixtures__/pelicanCatalogRows.json", import.meta.url), "utf8"),
) as PelicanGroupable[];

const byRole = (predicate: (row: PelicanGroupable) => boolean) => rows.filter(predicate);
const faucets = byRole((row) => row.subCategory === "Faucets");
const sinks = byRole((row) => row.subCategory === "Sinks");
const quartz = byRole((row) => row.category === "Quartz Slabs (Countertops)");

function find<T extends PelicanGroupable>(configs: ReturnType<typeof groupPelicanConfigurations<T>>, code: string) {
  return configs.find((config) => config.variants.some((variant) => variant.item.pelicanCode === code));
}

describe("Pelican configuration grouping (same card-plus-selector pattern as cabinet hardware)", () => {
  it("never drops, duplicates or rewrites an exact SKU", () => {
    const configs = groupPelicanConfigurations(rows);
    const ids = configs.flatMap((config) => config.variants.map((variant) => variant.item.id));
    expect(ids.length).toBe(rows.length);
    expect(new Set(ids).size).toBe(rows.length);
    for (const config of configs) {
      for (const variant of config.variants) {
        const original = rows.find((row) => row.id === variant.item.id)!;
        expect(variant.item).toBe(original);
      }
    }
  });

  it("shows one faucet card per model with one finish choice per exact SKU", () => {
    const configs = groupPelicanConfigurations(faucets);
    const model = find(configs, "PL-8237 BN")!;
    expect(model.variants.map((variant) => variant.item.pelicanCode).sort()).toEqual([
      "PL-8237 BG", "PL-8237 BN", "PL-8237 CHR", "PL-8237 MB",
    ]);
    expect(model.variants.map((variant) => variant.label).sort()).toEqual([
      "Brushed Gold", "Brushed Nickel", "Chrome", "Matte Black",
    ]);
    expect(model.variants.every((variant) => variant.swatch)).toBe(true);
    // 35 faucet SKUs collapse to far fewer cards.
    expect(configs.length).toBeLessThan(faucets.length / 1.5);
  });

  it("titles a faucet card with product copy instead of a bare item code", () => {
    const configs = groupPelicanConfigurations(faucets);
    const generic = find(configs, "PL-8237 BN")!;
    expect(generic.label).not.toMatch(/^PL-/);
    expect(generic.label.toLowerCase()).toContain("single hole kitchen faucet");
    expect(generic.label).not.toMatch(/\d+ of \d+/);
    const named = find(configs, "PL-8231 CHR")!;
    expect(named.label).toBe("StoneCreek Channel Single Hole Pull-Down Kitchen Faucet");
    expect(named.label).not.toMatch(/Brushed|Chrome|Matte|Gold/);
  });

  it("groups sink gauges and corner radii under one model and keeps ADA separate but selectable", () => {
    const configs = groupPelicanConfigurations(sinks);
    const model = find(configs, "PL-HA109 R15 16g")!;
    expect(model.variants.map((variant) => variant.item.pelicanCode).sort()).toEqual([
      "PL-HA109 ADA R0 18g", "PL-HA109 ADA R15 18g", "PL-HA109 R0 16g",
      "PL-HA109 R0 18g", "PL-HA109 R15 16g", "PL-HA109 R15 18g",
    ]);
    expect(model.variants.find((variant) => variant.item.pelicanCode === "PL-HA109 R0 16g")!.label).toBe("16 ga · Zero radius");
    expect(model.variants.find((variant) => variant.item.pelicanCode === "PL-HA109 ADA R15 18g")!.label).toBe("ADA · 18 ga · R15 radius");
    expect(model.label).toMatch(/30 × 18 in/);
    expect(model.style).toBe("Undermount");
    expect(configs.length).toBeLessThan(sinks.length);
  });

  it("classifies farmhouse and apron-front sinks so they can be filtered", () => {
    const configs = groupPelicanConfigurations(sinks);
    const farmhouse = find(configs, "PL-HA130 R0 16g")!;
    expect(farmhouse.style).toBe("Farmhouse / apron front");
    expect(farmhouse.label).toMatch(/36 × 21 in/);
    expect(find(configs, "PL-GMB135 R0 16g")!.style).toBe("Farmhouse / apron front");
    expect(find(configs, "PL-HA148 R10 16g")!.label).toMatch(/Towel-bar apron-front/);
    expect(pelicanConfigurationStyles(configs)).toEqual(expect.arrayContaining(["Farmhouse / apron front", "Undermount"]));
  });

  it("folds standard, super-jumbo and left/right quartz slabs into one colour card", () => {
    const configs = groupPelicanConfigurations(quartz);
    const oro = find(configs, "Calacatta Oro 3cm")!;
    expect(oro.label).toBe("Calacatta Oro");
    expect(oro.variants.map((variant) => variant.item.pelicanCode).sort()).toEqual([
      "Calacatta Oro 3cm", "Calacatta Oro 3cm Super Jumbo",
    ]);
    expect(oro.variants.map((variant) => variant.label)).toEqual(
      expect.arrayContaining([expect.stringContaining("126 × 63"), expect.stringContaining("138 × 79")]),
    );
    const terremotto = find(configs, "Calacatta Terremotto Left")!;
    expect(terremotto.variants.map((variant) => variant.label).join("|")).toMatch(/Left/);
    expect(terremotto.variants.map((variant) => variant.label).join("|")).toMatch(/Right/);
    expect(configs.length).toBeLessThan(quartz.length);
  });

  it("keeps products without a variant pattern as single-variant cards with their own title", () => {
    const flooring = byRole((row) => row.category === "Flooring");
    const configs = groupPelicanConfigurations(flooring);
    expect(configs).toHaveLength(flooring.length);
    expect(configs.every((config) => config.variants.length === 1)).toBe(true);
  });

  it("joins a plain bathroom SKU to its coloured siblings and keeps tub lengths together", () => {
    const configs = groupPelicanConfigurations(rows);
    const toilet = find(configs, "PL-12011")!;
    expect(toilet.variants.map((variant) => variant.item.pelicanCode).sort()).toEqual(["PL-12011", "PL-12011 MB"]);
    const tub = find(configs, 'PL-02138 59"')!;
    expect(tub.variants.map((variant) => variant.label).sort()).toEqual(["59 in", "67 in"]);
    const alcove = find(configs, "PL-02849L")!;
    expect(alcove.variants.map((variant) => variant.label).sort()).toEqual(["Left-hand drain", "Right-hand drain"]);
  });

  it("displays the selected variant, else the one the customer picked, else the first", () => {
    const configs = groupPelicanConfigurations(faucets);
    const model = find(configs, "PL-8237 BN")!;
    const chrome = model.variants.find((variant) => variant.label === "Chrome")!;
    const matte = model.variants.find((variant) => variant.label === "Matte Black")!;
    expect(pelicanDisplayVariant(model, new Set()).item.id).toBe(model.variants[0]!.item.id);
    expect(pelicanDisplayVariant(model, new Set([chrome.item.id])).item.id).toBe(chrome.item.id);
    expect(pelicanDisplayVariant(model, new Set([chrome.item.id]), matte.item.id).item.id).toBe(matte.item.id);
  });

  it("keeps variant labels unique inside every card", () => {
    for (const config of groupPelicanConfigurations(rows)) {
      const labels = config.variants.map((variant) => variant.label);
      expect(new Set(labels).size, `${config.key}: ${labels.join(", ")}`).toBe(labels.length);
    }
  });

  it("never treats a material word in a tile name as a finish", () => {
    const configs = groupPelicanConfigurations(byRole((row) => row.category === "Tile & Mosaic"));
    const cloudline = find(configs, "Cloudline Marble")!;
    expect(cloudline.variants).toHaveLength(1);
    expect(cloudline.variants[0]!.finish).toBeNull();
    expect(cloudline.label).not.toMatch(/^PL-/);
  });

  it("keeps wall-panel finishes on shower surrounds and removes them from the shared title", () => {
    const configs = groupPelicanConfigurations(byRole((row) => row.subCategory === "Shower Surrounds"));
    const surround = find(configs, "PL-483696 Brick")!;
    expect(surround.variants).toHaveLength(4);
    expect(surround.label).toBe('48" x 36" x 96" 3-Piece Glue Up Alcove Shower Surround');
    expect(surround.variants.map((variant) => variant.label).join("|")).toMatch(/White brick/);
    expect(surround.variants.every((variant) => variant.swatch)).toBe(true);
  });

  it("titles shower doors without the finish or catalog page counters", () => {
    const configs = groupPelicanConfigurations(byRole((row) => row.subCategory === "Shower & Tub Doors"));
    const door = find(configs, "PL-03A11TSO BN")!;
    expect(door.label).toBe('60" x 59" Frameless Single Sliding Tub Door');
    expect(door.label).not.toMatch(/Brushed|Chrome|Matte|\d+ of \d+/);
    expect(door.variants.map((variant) => variant.label).sort()).toEqual(["Brushed Nickel", "Chrome", "Matte Black"]);
  });

  it("groups shower bases by drain side without mixing the tile-flange line", () => {
    const configs = groupPelicanConfigurations(rows);
    const flat = find(configs, "PL-016030L")!;
    expect(flat.variants.map((variant) => variant.label).sort()).toEqual(["Center drain", "Left-hand drain", "Right-hand drain"]);
    expect(flat.label).toBe('60" x 30" Rectangular Acrylic Shower Base in Glossy White');
    const flange = find(configs, "PL-014836LSO")!;
    expect(flange).not.toBe(find(configs, "PL-014836C"));
    expect(flange.variants.map((variant) => variant.item.pelicanCode).sort()).toEqual(["PL-014836LSO", "PL-014836RSO"]);
    const smc = find(configs, "PL-SMC6030L")!;
    expect(smc.label).toBe('60" x 30" Rectangular SMC Anti-Slip Shower Base in White');
  });

  it("classifies cultured-marble vanity tops separately from sinks and keeps a source typo from titling a card", () => {
    const configs = groupPelicanConfigurations(sinks);
    const top = find(configs, "PL-R1917W")!;
    expect(top.style).toBe("Vanity top");
    expect(top.label).toMatch(/Cultured marble vanity top · 19 × 17 in/);
    const smc = find(groupPelicanConfigurations(rows), "PL-SMC6036L")!;
    expect(smc.label).not.toMatch(/60" x 60"/);
  });

  it("repairs ligatures from the source copy", () => {
    const toilet = find(groupPelicanConfigurations(rows), "PL-12011")!;
    expect(toilet.label).toBe("Porcelain High Efficiency Toilet with Dual Flush");
  });

  it("leaves the farmhouse sink recommendation as a single card with its own title", () => {
    const configs = groupPelicanConfigurations(sinks);
    const reserve = find(configs, "PL-3099 Bone")!;
    expect(reserve.variants).toHaveLength(1);
    expect(reserve.label).toMatch(/Farmhouse Reserve/);
    expect(reserve.style).toBe("Farmhouse / apron front");
  });

  it("adds a price to the selector only when the variants of a model are priced differently", () => {
    const money = (price: number | null | undefined) => `$${price}`;
    const configs = groupPelicanConfigurations(rows);
    const faucet = find(configs, "PL-8237 BN")!;
    const equalPriced = new Set(faucet.variants.map((variant) => variant.item.sellPrice)).size === 1;
    expect(pelicanVariantMenuLabel(faucet, faucet.variants[0]!, money)).toBe(
      equalPriced ? faucet.variants[0]!.label : `${faucet.variants[0]!.label} · $${faucet.variants[0]!.item.sellPrice}`,
    );
    const mixed = {
      ...faucet,
      variants: [
        { ...faucet.variants[0]!, item: { ...faucet.variants[0]!.item, sellPrice: 100 } },
        { ...faucet.variants[1]!, item: { ...faucet.variants[1]!.item, sellPrice: 120 } },
      ],
    };
    expect(pelicanVariantMenuLabel(mixed, mixed.variants[1]!, money)).toBe(`${mixed.variants[1]!.label} · $120`);
  });

  it("finds selected sibling SKUs of the same model so a new finish swaps instead of duplicating", () => {
    const faucet = find(groupPelicanConfigurations(rows), "PL-8237 BN")!;
    const [first, second] = faucet.variants;
    const siblings = pelicanSelectedSiblings(faucet, second!, new Set([first!.item.id]));
    expect(siblings.map((item) => item.id)).toEqual([first!.item.id]);
    expect(pelicanSelectedSiblings(faucet, first!, new Set([first!.item.id]))).toEqual([]);
    expect(pelicanSelectedSiblings(faucet, first!, new Set())).toEqual([]);
  });

  it("words the action button after what the selector chooses", () => {
    expect(pelicanUseLabel("Finish")).toBe("Use this finish");
    expect(pelicanUseLabel("Gauge & radius")).toBe("Use this sink");
    expect(pelicanUseLabel("Slab")).toBe("Use this slab");
    expect(pelicanUseLabel("Option")).toBe("Select");
  });
});
