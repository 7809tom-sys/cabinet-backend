import { describe, expect, it } from "vitest";
import { completeDoorFrameMetrics } from "./doorFrameMetrics";

describe("completeDoorFrameMetrics", () => {
  it("keeps a complete style's own rail and stile dimensions", () => {
    expect(completeDoorFrameMetrics({
      railWidth: "2.00",
      stileWidth: 2,
      sourceSpecification: "Skyline 2026 Slim Shaker catalog — exact style code SS-DW",
    })).toEqual({
      railWidth: 2,
      stileWidth: 2,
    });
  });

  it("accepts an approved measured-from-sample-door citation as a source-bound Designer profile", () => {
    expect(completeDoorFrameMetrics({
      railWidth: 2.25,
      stileWidth: 2.5,
      sourceSpecification: "Measured from sample door: Kitchen Crest KC-101, measured by A. Vendor on 2026-09-27.",
    })).toEqual({ railWidth: 2.25, stileWidth: 2.5 });
  });

  it("uses neutral fallback for a partial, unbound, or missing frame record", () => {
    expect(completeDoorFrameMetrics({ railWidth: "2.00", stileWidth: null, sourceSpecification: "Official catalog" })).toBeNull();
    expect(completeDoorFrameMetrics({ railWidth: 0, stileWidth: 2, sourceSpecification: "Official catalog" })).toBeNull();
    expect(completeDoorFrameMetrics({ railWidth: 2, stileWidth: 2, sourceSpecification: null })).toBeNull();
    expect(completeDoorFrameMetrics(null)).toBeNull();
  });
});
