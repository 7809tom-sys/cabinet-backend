import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");

describe("3D cabinet movement controls on mobile", () => {
  it("keeps every directional action, including Down, in a single mobile row above the bottom navigation", () => {
    const dpadStart = source.indexOf('data-testid="three-d-selected-cabinet-dpad"');
    const dpadEnd = source.indexOf('data-testid="three-d-cabinet-actions"', dpadStart);
    const dpad = source.slice(dpadStart, dpadEnd);

    expect(dpadStart).toBeGreaterThan(-1);
    expect(dpad).toContain('grid-cols-5 gap-0.5 max-md:[&>span]:hidden md:grid-cols-3');
    expect(dpad).toContain('testId="three-d-move-up"');
    expect(dpad).toContain('testId="three-d-move-left"');
    expect(dpad).toContain('testId="three-d-move-right"');
    expect(dpad).toContain('testId="three-d-move-down"');
    expect(dpad).toContain('max-md:rounded-r-md');
  });

  it("moves wall controls and fitted filler feedback into a compact right-side canvas pop-up on mobile", () => {
    expect(source).toContain('data-testid="three-d-mobile-canvas-tools"');
    expect(source).toContain('data-testid="three-d-mobile-canvas-tools-trigger"');
    expect(source).toContain('data-testid="three-d-mobile-canvas-tools-menu"');
    expect(source).toContain('data-testid="three-d-mobile-wall-heights"');
    expect(source).toContain('data-testid="three-d-mobile-toggle-wall-cabinets"');
    expect(source).toContain('data-testid="three-d-mobile-fitted-filler-labels"');
    expect(source).toContain('hidden max-w-[calc(100%-10rem)]');
  });

  it("keeps Room controls inside the viewport as a compact desktop dialog or a scrollable touch sheet", () => {
    expect(source).toContain('data-testid={workspacePanel === "room" ? "three-d-room-controls-sheet" : "three-d-workspace-sheet"}');
    expect(source).toContain('max-h-[calc(100dvh-0.75rem)] overflow-y-auto overscroll-contain');
    expect(source).toContain('sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2');
    expect(source).toContain('sm:max-h-[calc(100dvh-2rem)]');
    expect(source).toContain('Changes apply to the room immediately.');
  });

  it("keeps every base filler board flush to the room-facing cabinet front", () => {
    expect(source).toContain('const isFrontFlushFillerBoard = isBaseFillerPiece;');
    expect(source).toContain('bodyDepth / 2 - installedFillerBoardDepth / 2');
    expect(source).toContain('if (isFrontFlushFillerBoard) body.position.z = installedFillerFrontOffset;');
  });
});
