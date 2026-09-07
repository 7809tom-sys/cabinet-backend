import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dialogSource = readFileSync(resolve(process.cwd(), "client/src/components/ui/dialog.tsx"), "utf8");
const alertDialogSource = readFileSync(resolve(process.cwd(), "client/src/components/ui/alert-dialog.tsx"), "utf8");

describe("movable popup headers", () => {
  it("uses an explicit header-only drag handle for standard dialogs", () => {
    expect(dialogSource).toContain('data-dialog-drag-handle="true"');
    expect(dialogSource).toContain("event.currentTarget.setPointerCapture(event.pointerId)");
	    expect(dialogSource).toContain("calc(-50% + ${dragOffset.x}px) calc(-50% + ${dragOffset.y}px)");
	    expect(dialogSource).toContain("Tailwind v4 implements the centering utilities");
  });

  it("gives confirmation dialogs the same header-only drag behavior", () => {
    expect(alertDialogSource).toContain('data-alert-dialog-drag-handle="true"');
    expect(alertDialogSource).toContain("event.currentTarget.setPointerCapture(event.pointerId)");
  });
});
