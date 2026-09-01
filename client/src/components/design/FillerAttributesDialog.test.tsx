// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FillerAttributesDialog } from "./FillerAttributesDialog";
import type { PlacedCabinet } from "@/lib/design";

const filler: PlacedCabinet = {
  uid: "filler-1",
  cabinetId: 100,
  masterCode: "WF342",
  description: "3 inch Wall Filler",
  subCategory: "Filler",
  placement: "wall",
  x: 0,
  y: 0,
  width: 1,
  nominalWidth: 3,
  depth: 12,
  height: 42,
  rotation: 0,
  fillerPieceGroupId: "filler-group-1",
  fillerTotalWidth: 1,
  fillerPlacementMode: "right",
  fillerForCabinetUid: "cabinet-1",
};

afterEach(cleanup);

describe("FillerAttributesDialog", () => {
  it("edits a linked filler size and placement from the dedicated attributes dialog", () => {
    const onApply = vi.fn();
    render(<FillerAttributesDialog filler={filler} open onOpenChange={vi.fn()} measuredOpening={2.5} onApply={onApply} onResizeStandalone={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Filler size in inches"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Split left / right" }));
    expect(onApply).toHaveBeenCalledWith("split", 2);
  });

  it("removes the complete normal filler group through the host callback", () => {
    const onRemove = vi.fn();
    render(<FillerAttributesDialog filler={filler} open onOpenChange={vi.fn()} measuredOpening={1} onApply={vi.fn()} onResizeStandalone={vi.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove filler" }));
    expect(onRemove).toHaveBeenCalledWith(filler.uid);
  });

  it("protects a required blind-corner filler from separate resizing and removal", () => {
    render(<FillerAttributesDialog filler={{ ...filler, fillerPieceGroupId: "bbc-required-filler-bbc-1" }} open onOpenChange={vi.fn()} measuredOpening={3} onApply={vi.fn()} onResizeStandalone={vi.fn()} onRemove={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Remove filler" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Filler size in inches") as HTMLInputElement).disabled).toBe(true);
  });
});
