// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FourAnchorAutoBuildDialog } from "./FourAnchorAutoBuildDialog";

afterEach(cleanup);

describe("FourAnchorAutoBuildDialog", () => {
  it("submits the selected wall-cabinet height as a real build input", () => {
    const onBuild = vi.fn((): { ok: true } => ({ ok: true }));
    render(<FourAnchorAutoBuildDialog open onOpenChange={vi.fn()} onBuild={onBuild} />);

    expect(screen.getByText("Wall-cabinet height")).toBeTruthy();
    fireEvent.click(screen.getByTestId("four-anchor-build-submit"));

    expect(onBuild).toHaveBeenCalledWith(expect.objectContaining({
      wallCabinetHeightIn: 30,
      sinkBaseWidthIn: 36,
      dishwasherSide: "right",
    }));
  });

  it("keeps a failed submit visible in the dialog with its exact blocker rather than appearing inert", () => {
    const onBuild = vi.fn(() => ({
      ok: false as const,
      message: "The selected cabinet catalog is still loading. Wait for its source-priced items, then try again.",
    }));
    render(<FourAnchorAutoBuildDialog open onOpenChange={vi.fn()} onBuild={onBuild} />);

    fireEvent.click(screen.getByTestId("four-anchor-build-submit"));

    expect(onBuild).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("selected cabinet catalog is still loading");
    expect((screen.getByTestId("four-anchor-build-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows source-priced catalog loading and disables the build action until it is ready", () => {
    const onBuild = vi.fn((): { ok: true } => ({ ok: true }));
    render(<FourAnchorAutoBuildDialog open catalogLoading onOpenChange={vi.fn()} onBuild={onBuild} />);

    expect(screen.getByTestId("four-anchor-catalog-loading").textContent).toContain("Loading the selected line’s source-priced cabinets");
    const build = screen.getByTestId("four-anchor-build-submit") as HTMLButtonElement;
    expect(build.disabled).toBe(true);
    fireEvent.click(build);
    expect(onBuild).not.toHaveBeenCalled();
  });
});
