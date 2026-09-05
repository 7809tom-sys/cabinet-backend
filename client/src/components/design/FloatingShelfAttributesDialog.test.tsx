// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FloatingShelfAttributesDialog } from "./FloatingShelfAttributesDialog";

const shelf = {
  uid: "floating-1",
  cabinetId: 1,
  masterCode: "FS36",
  description: "Floating Shelf",
  placement: "wall",
  x: 0,
  y: 0,
  width: 36,
  nominalWidth: 36,
  depth: 12,
  height: 0.75,
  rotation: 0,
  mountBottom: 54,
} as any;

describe("FloatingShelfAttributesDialog", () => {
  it("persists a chosen bottom height and a length that does not exceed the catalog shelf", () => {
    const onApply = vi.fn();
    render(
      <FloatingShelfAttributesDialog
        shelf={shelf}
        open
        onOpenChange={vi.fn()}
        ceilingHeight={96}
        shelvesOnRun={2}
        onApply={onApply}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Shelf bottom height from floor"), { target: { value: "66" } });
    fireEvent.change(screen.getByLabelText("Shelf length in inches"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply shelf placement" }));
    expect(onApply).toHaveBeenCalledWith("floating-1", 66, 30);
    expect(screen.getByText(/2 of 4/i)).toBeTruthy();
  });
});
