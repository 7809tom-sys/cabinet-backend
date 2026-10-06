// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import VendorClosetStudio from "./VendorClosetStudio";

vi.mock("@/components/vendor/VendorClosetScene", () => ({
  VendorClosetScene: () => <div data-testid="mock-vendor-scene">3D scene</div>,
}));

describe("Closet Studio tablet workspace", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/closet");
  });

  it("keeps Room reversible while the tablet Material List stays a compact right-dock disclosure with tower and part controls", () => {
    window.history.replaceState(null, "", "/closet?demo=mixed");
    render(<VendorClosetStudio />);

    const room = screen.getByRole("button", { name: "Room and wall settings" });
    const dock = screen.getByTestId("vendor-tablet-options-dock");
    const reference = within(dock).getByRole("button", { name: "Material reference details" });
    expect(room.getAttribute("aria-expanded")).toBe("false");
    expect(reference.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("mock-vendor-scene")).toBeTruthy();
    expect(within(dock).getByRole("button", { name: "Select Tower 2" })).toBeTruthy();
    expect(within(dock).getByRole("combobox", { name: "More parts for selected tower" })).toBeTruthy();

    fireEvent.click(room);
    expect(room.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("button", { name: "Close room settings" })).toHaveLength(2);
    fireEvent.click(reference);
    expect(reference.getAttribute("aria-expanded")).toBe("true");
    expect(within(dock).getByTestId("vendor-tablet-material-list")).toBeTruthy();
    fireEvent.click(reference);
    expect(reference.getAttribute("aria-expanded")).toBe("false");
    expect(within(dock).getByRole("button", { name: "Select Tower 2" })).toBeTruthy();
  });

  it("keeps the three-column layout for wide desktops but uses on-demand panels at tablet CSS widths", () => {
    window.history.replaceState(null, "", "/closet?demo=mixed");
    render(<VendorClosetStudio />);
    expect(screen.getByTestId("vendor-controls").className).toContain("min-[1800px]:static");
    const referencePanel = screen.getByTestId("vendor-reference-panel");
    expect(referencePanel.parentElement?.parentElement?.className).toContain("min-[1800px]:block");
    expect(screen.getByTestId("vendor-part-tray").className).toContain("overflow-hidden");
    const more = within(screen.getByTestId("vendor-tablet-options-dock")).getByRole("combobox", { name: "More parts for selected tower" });
    expect(more.className).toContain("h-full");
    expect(more.className).toContain("inset-0");
    const scene = readFileSync(`${process.cwd()}/client/src/components/vendor/VendorClosetScene.tsx`, "utf8");
    expect(scene).toContain('className="h-full min-h-0 w-full touch-none"');
    expect(screen.getByTestId("mock-vendor-scene")).toBeTruthy();
  });

  it("moves every tablet design option into the right dock and keeps the dated material list as a compact dropdown", () => {
    window.history.replaceState(null, "", "/closet?demo=mixed");
    render(<VendorClosetStudio />);

    const dock = screen.getByTestId("vendor-tablet-options-dock");
    const material = within(dock).getByTestId("vendor-tablet-material-disclosure");
    const toggle = within(material).getByRole("button", { name: "Material reference details" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("vendor-tower-controls").className).toContain("hidden");
    expect(screen.getByTestId("vendor-tower-controls").className).toContain("min-[1800px]:block");
    expect(screen.getByTestId("vendor-part-tray").className).toContain("hidden");
    expect(screen.getByTestId("vendor-part-tray").className).toContain("min-[1800px]:block");
    expect(within(dock).getByRole("button", { name: "Select Tower 2" })).toBeTruthy();
    expect(within(dock).getByRole("combobox", { name: "More parts for selected tower" })).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(material).getByTestId("vendor-tablet-material-list").textContent).toMatch(/March 1, 2022 customer List/i);
    expect(within(material).getByTestId("vendor-reference-total")).toBeTruthy();
  });

  it("uses the Kitchen-style phone action strip to open focused Room, Tower, Parts, and List sheets instead of bottom editing controls", () => {
    window.history.replaceState(null, "", "/closet?demo=mixed");
    render(<VendorClosetStudio />);

    const strip = screen.getByTestId("vendor-phone-action-strip");
    expect(within(strip).getByRole("button", { name: "Room settings" })).toBeTruthy();
    const tower = within(strip).getByRole("button", { name: "Tower controls" });
    const parts = within(strip).getByRole("button", { name: "Add closet parts" });
    const list = within(strip).getByRole("button", { name: "Material reference" });
    expect(screen.getByTestId("vendor-tower-controls").className).toContain("hidden");
    expect(screen.getByTestId("vendor-tower-controls").className).toContain("min-[1800px]:block");

    fireEvent.click(tower);
    expect(screen.getByTestId("vendor-tablet-options-dock").className).toContain("fixed inset-x-0 bottom-0");
    expect(within(screen.getByTestId("vendor-tablet-options-dock")).getByRole("button", { name: "Select Tower 2" })).toBeTruthy();
    fireEvent.click(parts);
    expect(within(screen.getByTestId("vendor-tablet-options-dock")).getByRole("combobox", { name: "More parts for selected tower" })).toBeTruthy();
    fireEvent.click(within(screen.getByTestId("vendor-tablet-options-dock")).getByRole("button", { name: /Adjustable shelf/ }));
    expect(screen.getByTestId("vendor-tablet-options-dock").className).toContain("hidden");
    const source = readFileSync(`${process.cwd()}/client/src/pages/VendorClosetStudio.tsx`, "utf8");
    expect(source).toContain('partToPlace ? "top-24 sm:top-28" : "bottom-3 sm:bottom-5"');
    fireEvent.click(list);
    expect(within(screen.getByTestId("vendor-tablet-options-dock")).getByTestId("vendor-tablet-material-list")).toBeTruthy();
  });

  it("lets a tablet user plan a sourced straight shelf cut in the right dock without exposing unverified accessory cuts", () => {
    window.history.replaceState(null, "", "/closet?demo=mixed");
    render(<VendorClosetStudio />);

    const dock = screen.getByTestId("vendor-tablet-options-dock");
    fireEvent.click(within(dock).getByRole("button", { name: "Select Tower 1" }));
    const cut = within(dock).getByTestId("vendor-cut-to-fit");
    expect(within(cut).getByRole("combobox", { name: "Cut-to-fit stock shelf width" })).toBeTruthy();
    const measured = within(cut).getByRole("spinbutton", { name: "Installed clear shelf width in inches" });
    fireEvent.change(measured, { target: { value: "22.5" } });
    fireEvent.click(within(cut).getByRole("button", { name: "Apply measured width" }));
    expect(within(dock).getByText("Cut planned")).toBeTruthy();
    const updatedCut = within(dock).getByTestId("vendor-cut-to-fit");
    expect(updatedCut.textContent).toMatch(/planning difference.*1\.5/i);
    expect(within(updatedCut).getByRole("button", { name: "Full stock" })).toBeTruthy();
    const scene = readFileSync(`${process.cwd()}/client/src/components/vendor/VendorClosetScene.tsx`, "utf8");
    expect(scene).toContain("if (!studioBayCut(bay))");
  });

  it("keeps the 45-degree shoe pitch caveat accessible through the tablet and phone Parts controls, with renderer metadata scoped to shoes", () => {
    window.history.replaceState(null, "", "/closet?demo=mixed");
    render(<VendorClosetStudio />);

    const dock = screen.getByTestId("vendor-tablet-options-dock");
    expect(within(dock).getByTestId("vendor-shoe-pitch-caveat").textContent).toMatch(/45° illustrative shoe pitch.*supplier fit and attachment/i);
    fireEvent.click(within(screen.getByTestId("vendor-phone-action-strip")).getByRole("button", { name: "Add closet parts" }));
    expect(within(dock).getByTestId("vendor-shoe-pitch-caveat").textContent).toMatch(/45° illustrative shoe pitch/i);

    const scene = readFileSync(`${process.cwd()}/client/src/components/vendor/VendorClosetScene.tsx`, "utf8");
    expect(scene).toContain("STUDIO_ILLUSTRATIVE_SHOE_PITCH_DEG");
    expect(scene).toContain("shoeGroup.rotation.x = shoePitchRad");
    expect(scene).toContain("sourcedShelfThicknessIn: 0.75");
    const shoeBranch = scene.split('else if (item.kind === "shoe")')[1]?.split('else if (item.kind === "drawer")')[0];
    expect(shoeBranch).toContain("illustrativePitchDeg");
  });

  it("makes every public MasterTrac source record searchable in the List dock without treating corner shelves or hampers as placeable", () => {
    window.history.replaceState(null, "", "/closet?demo=mixed");
    render(<VendorClosetStudio />);

    const dock = screen.getByTestId("vendor-tablet-options-dock");
    fireEvent.click(within(dock).getByRole("button", { name: "Material reference details" }));
    const catalog = within(dock).getByTestId("vendor-source-catalog");
    expect(catalog.textContent).toMatch(/454 public March 1, 2022 List records/i);
    expect(catalog.textContent).toMatch(/not a checkout quote, installation guide, or approval to place a part in 3D/i);

    const search = within(catalog).getByRole("textbox", { name: "Search MasterTrac source catalog" });
    fireEvent.change(search, { target: { value: "432602" } });
    expect(within(catalog).getByTestId("vendor-source-part-432602").textContent).toMatch(/24" Hamper Shaker Door.*Reference only/i);
    expect(within(catalog).queryByRole("button", { name: /hamper/i })).toBeNull();

    fireEvent.change(search, { target: { value: "432556" } });
    expect(within(catalog).getByTestId("vendor-source-part-432556").textContent).toMatch(/Fixed Corner Shelf.*Reference only/i);
    expect(catalog.textContent).toMatch(/29\.5.*29¼.*no corner profile, hamper assembly fit, attachment, or installation geometry is claimed/i);
  });
});
