import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Capital specification door-style references", () => {
  it("shows documented price-pending styles separately from sellable style choices", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const references = await caller.doorStyles.specificationReferences();
    const expected = [
      ["SU", "Shaker Unfinished", "availability_pending"],
      ["OC", "Oxford Cashmere", "availability_pending"],
      ["HS", "Haven Sage", "availability_pending"],
      ["HH", "Haven Harbor", "coming_soon"],
      ["HR", "Haven Ridge", "coming_soon"],
    ] as const;

    for (const [styleCode, ourName, specificationStatus] of expected) {
      expect(references).toEqual(expect.arrayContaining([
        expect.objectContaining({
          styleCode,
          ourName,
          specificationStatus,
          sourceSpecification: expect.stringContaining("Capital Specification Book V8"),
        }),
      ]));
    }

    const sellableStyles = await caller.doorStyles.list();
    const referenceNames = new Set(expected.map(([, name]) => name));
    expect(sellableStyles.some((style) => referenceNames.has(style.ourName))).toBe(false);

    const [edgeline, casselberry, essenceOak] = await Promise.all([
      caller.doorStyles.byId({ id: 330023 }),
      caller.doorStyles.byId({ id: 330027 }),
      caller.doorStyles.byId({ id: 330032 }),
    ]);
    expect(edgeline).toEqual(expect.objectContaining({
      styleCode: "EW", ourName: "Edgeline White", doorStyle: "Edgeline", railWidth: "2.75", stileWidth: "2.75",
    }));
    expect(casselberry).toEqual(expect.objectContaining({
      styleCode: "CS", ourName: "Casselberry Saddle", doorStyle: "Casselberry", railWidth: "3.00", stileWidth: "3.00",
    }));
    expect(essenceOak).toEqual(expect.objectContaining({
      styleCode: "SEO", ourName: "Shaker Essence Oak", woodSpecies: "Solid Rift Oak frame / veneered center panel",
    }));
  });
});
