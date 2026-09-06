import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Designer deletion placement state", () => {
  it("removes a deleted cabinet from the committed placement reference before an immediate re-add", () => {
    const deleteStart = source.indexOf("const deleteCabinet = useCallback");
    const deleteEnd = source.indexOf("const rotateCabinet", deleteStart);
    const deleteBlock = source.slice(deleteStart, deleteEnd);
    expect(deleteBlock).toContain("const next = removePlacedCabinetWithRequiredBlindCornerFiller(prev, uid);");
    expect(deleteBlock).toContain("placedRef.current = next;");
  });
});
