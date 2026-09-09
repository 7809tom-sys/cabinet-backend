// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { effectiveIslandOverhangIn, IslandAttributesDialog } from "./IslandAttributesDialog";

afterEach(cleanup);

const island = {
  x: 36,
  y: 36,
  width: 72,
  depth: 48,
  activeFace: "front" as const,
  countertopWidth: 78,
  countertopDepth: 54,
  countertopOffsetX: 0,
  countertopOffsetY: 0,
};

describe("IslandAttributesDialog", () => {
  it("keeps every work-zone and slab dimension editable and can return slab width to automatic", () => {
    const onApply = vi.fn();
    render(<IslandAttributesDialog open island={island} onOpenChange={vi.fn()} onApply={onApply} onRotate={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Left position (in.)"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("Slab left-to-right (in.)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ x: 42, countertopWidth: null, countertopDepth: 54 }));
  });

	  it("accepts an exact island countertop overhang and can return it to the 1.5-inch default", () => {
	    const onApply = vi.fn();
	    render(<IslandAttributesDialog open island={island} onOpenChange={vi.fn()} onApply={onApply} onRotate={vi.fn()} onRemove={vi.fn()} />);
	    const overhang = screen.getByLabelText("Standard countertop overhang (in.)");
	    fireEvent.change(overhang, { target: { value: "3.125" } });
	    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
	    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ countertopOverhang: 3.125 }));
	    fireEvent.click(screen.getByRole("button", { name: "Use 1.5 in. default" }));
	    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
	    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ countertopOverhang: null }));
	    expect(screen.getByTestId("island-countertop-overhang-control")).toBeTruthy();
	  });

	  it("warns with the selected material, verified limit, and exact structural excess", () => {
	    render(
	      <IslandAttributesDialog
	        open
	        island={{ ...island, countertopWidth: null, countertopDepth: null, countertopOverhang: 6 }}
	        countertopMaterial={{ name: "Verified Quartz", unsupportedOverhangLimitIn: 4 }}
	        onOpenChange={vi.fn()}
	        onApply={vi.fn()}
	        onRotate={vi.fn()}
	        onRemove={vi.fn()}
	      />,
	    );
	    const warning = screen.getByTestId("island-overhang-limit-exceeded").textContent ?? "";
	    expect(warning).toContain("Verified Quartz");
	    expect(warning).toContain("6 in.");
	    expect(warning).toContain("4 in.");
	    expect(warning).toContain("2 in.");
	    expect(screen.getByRole("alert")).toBeTruthy();
	  });

	  it("shows verified-safe and unverified material guidance without inventing a limit", () => {
	    const props = { open: true, island: { ...island, countertopWidth: null, countertopDepth: null, countertopOverhang: 3 }, onOpenChange: vi.fn(), onApply: vi.fn(), onRotate: vi.fn(), onRemove: vi.fn() };
	    const view = render(<IslandAttributesDialog {...props} countertopMaterial={{ name: "Verified Quartz", unsupportedOverhangLimitIn: 4 }} />);
	    expect(screen.getByTestId("island-overhang-limit-within").textContent).toContain("4 in.");
	    view.rerender(<IslandAttributesDialog {...props} countertopMaterial={{ name: "Pending Quartz", unsupportedOverhangLimitIn: null }} />);
	    const unverified = screen.getByTestId("island-overhang-limit-unverified").textContent ?? "";
	    expect(unverified).toContain("Pending Quartz");
	    expect(unverified).toContain("does not yet have a verified");
	    expect(unverified).not.toMatch(/limit of \d/i);
	  });

	  it("checks the largest unsupported edge when an exact slab is offset for seating", () => {
	    expect(effectiveIslandOverhangIn({ ...island, countertopWidth: 78, countertopDepth: 60, countertopOffsetY: -6 })).toBe(12);
	  });

  it("exposes complete-assembly rotate and remove actions on the responsive dialog", () => {
    const onRotate = vi.fn();
    const onRemove = vi.fn();
    render(<IslandAttributesDialog open island={island} onOpenChange={vi.fn()} onApply={vi.fn()} onRotate={onRotate} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Rotate 90°" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove island" }));
    expect(onRotate).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/four independent runs/i)).toBeTruthy();
  });

	it("explains the 24, 36, 48, and 60 inch depth rules and exposes a 12-inch rear seating overhang", () => {
    render(<IslandAttributesDialog open island={island} onOpenChange={vi.fn()} onApply={vi.fn()} onRotate={vi.fn()} onRemove={vi.fn()} />);
    const guidance = screen.getByTestId("island-depth-guidance").textContent ?? "";
    expect(guidance).toContain("24 in.");
    expect(guidance).toContain("36 in.");
    expect(guidance).toContain("48 in.");
    expect(guidance).toContain("60 in.");
    expect(screen.getByTestId("island-seating-overhang")).toBeTruthy();
	  expect(screen.getByText(/rear seating countertop overhang/i)).toBeTruthy();
	});

	it("lets the user opt into a Back-face-only depth adjustment without changing other island choices", () => {
	  const onApply = vi.fn();
	  render(<IslandAttributesDialog open island={island} onOpenChange={vi.fn()} onApply={onApply} onRotate={vi.fn()} onRemove={vi.fn()} />);
	  fireEvent.click(screen.getByRole("switch", { name: /auto-adjust depth for Back cabinets/i }));
	  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
	  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ autoAdjustDepthForBackFace: true, activeFace: "front", depth: 48 }));
	  expect(screen.getByTestId("island-auto-depth-option")).toBeTruthy();
	});

	it("stores a selected island cabinet color while keeping the perimeter choice separate", () => {
	  const onApply = vi.fn();
	  render(
	    <IslandAttributesDialog
	      open
	      island={{ ...island, cabinetStyleId: null }}
	      cabinetFinishOptions={[{ id: 7, name: "Aero Sage" }, { id: 99, name: "Midnight Navy" }]}
	      perimeterFinishName="Aero Sage"
	      onOpenChange={vi.fn()}
	      onApply={onApply}
	      onRotate={vi.fn()}
	      onRemove={vi.fn()}
	    />,
	  );
	  expect(screen.getByText("Match non-island cabinets (Aero Sage)")).toBeTruthy();
	  fireEvent.click(screen.getByTestId("island-cabinet-finish-select"));
	  fireEvent.click(screen.getByRole("option", { name: "Midnight Navy" }));
	  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
	  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ cabinetStyleId: 99 }));
	  expect(screen.getByText(/leaving the outside wall cabinet runs in their current color/i)).toBeTruthy();
	});
});
