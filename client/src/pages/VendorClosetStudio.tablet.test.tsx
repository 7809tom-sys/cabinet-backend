// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import VendorClosetStudio from "./VendorClosetStudio";

vi.mock("@/components/vendor/VendorClosetScene", () => ({
  VendorClosetScene: () => <div data-testid="mock-vendor-scene">3D scene</div>,
}));

describe("Closet Studio tablet workspace", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/closet");
  });

  it("keeps Room and historical List as reversible, mutually exclusive drawers while preserving the selected tower and parts", () => {
    window.history.replaceState(null, "", "/closet?demo=mixed");
    render(<VendorClosetStudio />);

    const room = screen.getByRole("button", { name: "Room and wall settings" });
    const reference = screen.getByRole("button", { name: "Material reference" });
    expect(room.getAttribute("aria-expanded")).toBe("false");
    expect(reference.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("mock-vendor-scene")).toBeTruthy();
    expect(screen.getByTestId("vendor-part-tray")).toBeTruthy();

    fireEvent.click(room);
    expect(room.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("button", { name: "Close room settings" })).toHaveLength(2);
    fireEvent.click(reference);
    expect(room.getAttribute("aria-expanded")).toBe("false");
    expect(reference.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("vendor-controls").className).toContain("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Close material reference" }));
    expect(reference.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("vendor-part-tray")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select Tower 2" })).toBeTruthy();
  });

  it("keeps the three-column layout for wide desktops but uses on-demand panels at tablet CSS widths", () => {
    window.history.replaceState(null, "", "/closet?demo=mixed");
    render(<VendorClosetStudio />);
    expect(screen.getByTestId("vendor-controls").className).toContain("min-[1800px]:static");
    const referencePanel = screen.getByTestId("vendor-reference-panel");
    expect(referencePanel.parentElement?.parentElement?.className).toContain("min-[1800px]:block");
    expect(screen.getByTestId("vendor-part-tray").className).toContain("overflow-hidden");
    const more = screen.getByRole("combobox", { name: "More parts for selected tower" });
    expect(more.className).toContain("h-full");
    expect(more.className).toContain("inset-0");
    const scene = readFileSync(`${process.cwd()}/client/src/components/vendor/VendorClosetScene.tsx`, "utf8");
    expect(scene).toContain('className="h-full min-h-0 w-full touch-none"');
    expect(screen.getByTestId("mock-vendor-scene")).toBeTruthy();
  });
});
