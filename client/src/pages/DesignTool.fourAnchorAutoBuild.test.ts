import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/DesignTool.tsx"), "utf8");
const dialogSource = readFileSync(resolve(process.cwd(), "client/src/components/design/FourAnchorAutoBuildDialog.tsx"), "utf8");

describe("admin four-anchor Designer wiring", () => {
  it("exposes the action only for admins and disables it on a non-empty plan", () => {
    expect(pageSource).toContain("{isAdmin && (");
    expect(pageSource).toContain('data-testid="admin-four-anchor-auto-build"');
    expect(pageSource).toContain("disabled={placed.length > 0 || layoutLocked}");
    expect(pageSource).toContain("buildFourAnchorAutoLayout");
  });

  it("requires the four measured anchors and explicit layout controls in the popup", () => {
    expect(dialogSource).toContain("layoutType");
    expect(dialogSource).toContain("originCorner");
    expect(dialogSource).toContain("runDirection");
    expect(dialogSource).toContain("sink");
    expect(dialogSource).toContain("stove");
    expect(dialogSource).toContain("dishwasher");
    expect(dialogSource).toContain("refrigerator");
    expect(dialogSource).toContain('data-testid="four-anchor-build-submit"');
  });
});
