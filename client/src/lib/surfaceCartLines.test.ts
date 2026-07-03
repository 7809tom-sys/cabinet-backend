import { describe, it, expect } from "vitest";
import { buildSurfaceCartLines, type SurfacePick } from "./surfaceCartLines";

const faucet: SurfacePick = {
  id: 101,
  name: "Brushed Nickel Pull-Down Faucet",
  category: "Sinks & Faucets",
  size: null,
  sellPrice: 189.0,
};
const floor: SurfacePick = {
  id: 202,
  name: "Natural Oak Luxury Vinyl Plank",
  category: "Flooring",
  size: '7" x 48"',
  sellPrice: 2.49,
};
const tileNoPrice: SurfacePick = {
  id: 303,
  name: "Moonstone Hex Mosaic",
  category: "Tile & Mosaic",
  size: null,
  sellPrice: null, // quote-only
};

describe("buildSurfaceCartLines", () => {
  it("turns each priced surface pick into one cart line", () => {
    const lines = buildSurfaceCartLines([faucet, floor], "contractor");
    expect(lines).toHaveLength(2);
  });

  it("namespaces the code as PEL-<id> so it never collides with a cabinet masterCode", () => {
    const [line] = buildSurfaceCartLines([faucet], "contractor");
    expect(line.masterCode).toBe("PEL-101");
    expect(line.name).toBe("Brushed Nickel Pull-Down Faucet");
  });

  it("carries distributorId null so it never triggers the cabinet distributor-lock", () => {
    const [line] = buildSurfaceCartLines([faucet], "homeowner");
    expect(line.distributorId).toBeNull();
  });

  it("uses a unique negative styleId per pick so two surfaces never collapse", () => {
    const lines = buildSurfaceCartLines([faucet, floor], "contractor");
    const ids = lines.map((l) => l.styleId);
    expect(ids).toEqual([-101, -202]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses the sell price as unit price and quantity 1", () => {
    const [line] = buildSurfaceCartLines([faucet], "wholesale");
    expect(line.unitPrice).toBe(189.0);
    expect(line.qty).toBe(1);
  });

  it("shows the category (with size when present) as the line label", () => {
    const lines = buildSurfaceCartLines([faucet, floor], "contractor");
    expect(lines[0].styleLabel).toBe("Sinks & Faucets");
    expect(lines[1].styleLabel).toBe('Flooring · 7" x 48"');
  });

  it("skips unpriced (quote-only) picks", () => {
    const lines = buildSurfaceCartLines([faucet, tileNoPrice], "contractor");
    expect(lines).toHaveLength(1);
    expect(lines[0].masterCode).toBe("PEL-101");
  });

  it("passes the resolved tier through to each line", () => {
    const [line] = buildSurfaceCartLines([faucet], "homeowner");
    expect(line.tier).toBe("homeowner");
  });
});
