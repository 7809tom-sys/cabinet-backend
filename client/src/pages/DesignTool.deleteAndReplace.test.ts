import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Designer delete-and-replace release rule", () => {
  it("synchronously removes the cabinet from the committed placement reference before another cabinet can be added", () => {
    expect(source).toContain("const removeCabinetAndReleaseVoid = useCallback((uid: string) => {");
    expect(source).toContain("const removed = placedRef.current.find((cabinet) => cabinet.uid === uid);");
    expect(source).toContain("const next = removePlacedCabinetWithRequiredBlindCornerFiller(current, uid);");
    expect(source).toContain("placedRef.current = next;");
  });

  it("clears sink, selection, fit, and alternate-placement reservations that can create a phantom occupied void", () => {
    expect(source).toContain("deleteAttachedSinkFixtures(removed);");
    expect(source).toContain("setSelectedUid((current) => current === uid ? null : current);");
    expect(source).toContain("setSelectedSinkUid(null);");
    expect(source).toContain("setFailedWallFit(null);");
    expect(source).toContain("setAlternateWallRecommendation(null);");
    expect(source).toContain("setAlternateIslandFaceRecommendation(null);");
  });

  it("uses the same release helper for toolbar, keyboard, and on-canvas cabinet removal", () => {
    expect(source).toContain("removeCabinetAndReleaseVoid(selectedUid);");
    expect(source).toContain("removeCabinetAndReleaseVoid(uid);");
  });
});
