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

  it("keeps the 29.5-inch corner shelf planning envelope, caveat, gap readout, and one-step undo accessible in the Tower dock", () => {
    window.history.replaceState(null, "", "/closet");
    render(<VendorClosetStudio />);
    fireEvent.click(screen.getByRole("button", { name: "Start with one tower" }));

    const dock = screen.getByTestId("vendor-tablet-options-dock");
    const corner = within(dock).getByTestId("vendor-corner-planning-controls");
    expect(within(corner).getByTestId("vendor-corner-planning-caveat").textContent).toMatch(/29\.5.*2026-spec planning envelope.*not a curved profile.*connector.*H-joint/i);
    const frontRight = within(corner).getByRole("button", { name: "Highlight Front-right 90-degree corner" });
    fireEvent.click(frontRight);
    expect(frontRight.getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(within(corner).getByRole("combobox", { name: "Corner shelf room corner" }), { target: { value: "front-right" } });
    fireEvent.change(within(corner).getByRole("combobox", { name: "Corner shelf type" }), { target: { value: "adjustable" } });
    fireEvent.change(within(corner).getByRole("spinbutton", { name: "Corner shelf planning elevation in inches" }), { target: { value: "36" } });
    fireEvent.click(within(corner).getByRole("button", { name: "Add visual plan" }));
    expect(within(corner).getByText(/Adjustable corner.*SKU 432557.*Front-right.*36 in/i)).toBeTruthy();
    expect(within(corner).getByTestId("vendor-corner-plan-elevation").textContent).toMatch(/29\.5.*Elevation: 36.*0\.75.*curve.profile intentionally not drawn/i);
    expect(within(corner).getByText(/tower-envelope gap.*verify assembly fit/i)).toBeTruthy();
    fireEvent.click(within(corner).getByRole("button", { name: "Undo corner" }));
    expect(within(corner).queryByText(/Adjustable corner.*SKU 432557/i)).toBeNull();

    const scene = readFileSync(`${process.cwd()}/client/src/components/vendor/VendorClosetScene.tsx`, "utf8");
    expect(scene).toContain("cornerShelfPlanningEnvelope: true");
    expect(scene).toContain("profileIllustrative: true");
    expect(scene).toContain("installationFitToVerify: true");
    expect(scene).toContain("not a fabricated curved board profile or support assembly");
  });

  it("keeps every historical basket as an editable source reference in Parts, with no physical placement or 2026 substitution", () => {
    window.history.replaceState(null, "", "/closet?demo=mixed");
    render(<VendorClosetStudio />);

    const dock = screen.getByTestId("vendor-tablet-options-dock");
    const basket = within(dock).getByTestId("vendor-basket-reference-controls");
    expect(within(basket).getByTestId("vendor-basket-reference-caveat").textContent).toMatch(/outer envelope.*rails.*mounting offsets.*extension travel.*446807.*446815.*not substituted/i);
    const source = within(basket).getByRole("combobox", { name: "Historical basket source SKU" });
    fireEvent.change(source, { target: { value: "432902" } });
    fireEvent.click(within(basket).getByRole("button", { name: "Save source reference — not placeable" }));
    expect(within(basket).getByText(/17″ × 24″ basket.*SKU 432902.*reference only/i)).toBeTruthy();
    expect(within(basket).queryByRole("button", { name: /place.*basket/i })).toBeNull();
    fireEvent.click(within(basket).getByText(/17″ × 24″ basket.*SKU 432902/i));
    fireEvent.change(within(basket).getByRole("combobox", { name: "Edit selected basket source SKU" }), { target: { value: "432897" } });
    expect(within(basket).getByText(/6″ × 18″ basket.*SKU 432897.*reference only/i)).toBeTruthy();
    fireEvent.click(within(basket).getByRole("button", { name: "Undo basket" }));
    expect(within(basket).getByText(/17″ × 24″ basket.*SKU 432902.*reference only/i)).toBeTruthy();
  });

  it("makes every public MasterTrac source record searchable in the List dock without treating corner shelves or hampers as placeable", () => {
    window.history.replaceState(null, "", "/closet?demo=mixed");
    render(<VendorClosetStudio />);

    const dock = screen.getByTestId("vendor-tablet-options-dock");
    fireEvent.click(within(dock).getByRole("button", { name: "Material reference details" }));
    const catalog = within(dock).getByTestId("vendor-source-catalog");
    expect(catalog.textContent).toMatch(/454 public March 1, 2022 List records/i);
    expect(catalog.textContent).toMatch(/not a checkout quote or installation guide.*restricted.*visual-planning.*never a fit-verified placement/i);

    const search = within(catalog).getByRole("textbox", { name: "Search MasterTrac source catalog" });
    fireEvent.change(search, { target: { value: "432602" } });
    expect(within(catalog).getByTestId("vendor-source-part-432602").textContent).toMatch(/24" Hamper Shaker Door.*Reference only/i);
    expect(within(catalog).queryByRole("button", { name: /hamper/i })).toBeNull();

    fireEvent.change(search, { target: { value: "432556" } });
    expect(within(catalog).getByTestId("vendor-source-part-432556").textContent).toMatch(/Fixed Corner Shelf.*Visual planning only.*not a profile, fit, or installation confirmation/i);
    expect(catalog.textContent).toMatch(/29\.5.*29¼.*no curve.profile, support, connector, or installation geometry.*historical baskets 432897.*outer envelope.*alternate 2026 basket SKUs.*not substituted/i);
  });
});
