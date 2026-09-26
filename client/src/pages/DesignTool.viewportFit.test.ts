import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Designer desktop viewport fit", () => {
  it("keeps the compact desktop toolbar to one scrollable row instead of consuming canvas height", () => {
    expect(source).toContain('lg:flex-nowrap lg:overflow-x-auto lg:overflow-y-visible lg:scrollbar-none');
  });

  it("keeps contextual desktop cabinet controls in one horizontal scroll strip", () => {
    expect(source).toContain('lg:flex-nowrap lg:overflow-x-auto lg:overflow-y-hidden lg:scrollbar-none');
  });

  it("contains the peninsula builder inside the canvas with a scrollable body and persistent creation action", () => {
    expect(source).toContain('data-testid="peninsula-inline-builder"');
    expect(source).toContain('max-h-[calc(100%-1.5rem)]');
    expect(source).toContain('overflow-y-auto overscroll-contain p-3');
    expect(source).toContain('shrink-0 border-t border-[#d4a75a]/45');
    expect(source).toContain('Create straight peninsula');
  });
});
