import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("freight package audit", () => {
  it("stores exact pallet/carton measurements on each live API log", () => {
    const logSource = readFileSync(resolve(process.cwd(), "server/_core/freightApiLog.ts"), "utf8");
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers/freight.ts"), "utf8");
    expect(logSource).toContain('kind: "pallet" | "carton"');
    expect(logSource).toContain("lengthIn: number");
    expect(logSource).toContain("weightLbs: number");
    expect(routerSource).toContain("packages: input.request.pallets.map");
    expect(routerSource).toContain('kind: "carton"');
    expect(routerSource).toContain("Supplier-verified carton sent to the parcel carrier.");
    expect(routerSource).toContain("Comparable-package estimate sent to the parcel carrier; not Pelican carton data.");
    expect(routerSource).toContain("parcelCount: resolvedGroup.parcelPackages.length");
    expect(routerSource).toContain("parcels: resolvedGroup.parcelPackages.map");
  });

  it("records why a long pallet was selected without inventing carton dimensions", () => {
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers/freight.ts"), "utf8");
    const packingSource = readFileSync(resolve(process.cwd(), "shared/liveFreight.ts"), "utf8");
    expect(routerSource).toContain('8-foot pallet: at least one verified package required a long pallet.');
    expect(routerSource).toContain('Standard/short pallet: no verified package required 8 feet.');
    expect(packingSource).toContain("const requiresLongPallet = longestRequiredIn >= 84");
    expect(packingSource).toContain("Math.min(standardPalletLengthIn, caps.palletLengthIn)");
  });

  it("keeps unavailable Pelican groups visible while clearly labeling authorized comparison estimates", () => {
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers/freight.ts"), "utf8");
    expect(routerSource).toContain("needsPelicanPackageData");
    expect(routerSource).toContain("Comparable-package estimate sent to the parcel carrier");
    expect(routerSource).toContain("partial: rateGroups.length > 0");
  });
});
