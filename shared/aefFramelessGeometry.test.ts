import { describe, expect, it } from "vitest";
import { aefPrintedGeometryForSku } from "./aefFramelessGeometry";

describe("AEF printed frameless geometry", () => {
  it("uses 34-3/4 overall base height from the printed box and legs", () => {
    expect(aefPrintedGeometryForSku("B18FH")).toMatchObject({
      width: 18,
      height: 34.75,
      depth: 24,
      toeKickHeight: 4.5,
      sourcePage: "20",
    });
    expect(aefPrintedGeometryForSku("VSB24S")).toMatchObject({
      width: 24,
      height: 34.75,
      depth: 21,
      toeKickHeight: 4.5,
    });
  });

  it("uses exact printed wall heights and 13-1/2-inch standard depth", () => {
    expect(aefPrintedGeometryForSku("W3012")).toMatchObject({ width: 30, height: 12.625, depth: 13.5, sourcePage: "43" });
    expect(aefPrintedGeometryForSku("W3030")).toMatchObject({ width: 30, height: 30.25, depth: 13.5, sourcePage: "37" });
    expect(aefPrintedGeometryForSku("W361224")).toMatchObject({ width: 36, height: 12.625, depth: 24, sourcePage: "46" });
  });

  it("keeps FH and S identities separate while sharing their physical dimensions", () => {
    expect(aefPrintedGeometryForSku("B24FH")).toMatchObject({ width: 24, height: 34.75, depth: 24 });
    expect(aefPrintedGeometryForSku("B24S")).toMatchObject({ width: 24, height: 34.75, depth: 24 });
    expect(aefPrintedGeometryForSku("SB24FH")).toMatchObject({ width: 24, height: 34.75, depth: 24 });
    expect(aefPrintedGeometryForSku("W2430S")).toMatchObject({ width: 24, height: 30.25, depth: 13.5 });
  });

  it("does not invent geometry for held or unknown rows", () => {
    expect(aefPrintedGeometryForSku("2DB18")).toBeNull();
    expect(aefPrintedGeometryForSku("BPO6FH")).toBeNull();
    expect(aefPrintedGeometryForSku("SCL")).toBeNull();
  });
});
