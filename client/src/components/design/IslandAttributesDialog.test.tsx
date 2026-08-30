// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IslandAttributesDialog } from "./IslandAttributesDialog";

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
});
