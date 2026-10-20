// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DraggableOverlayDialog } from "./DraggableOverlayDialog";

afterEach(cleanup);

function drag(handle: Element, pointerId = 41) {
  fireEvent.pointerDown(handle, { pointerId, clientX: 460, clientY: 390, button: 0 });
  fireEvent.pointerMove(handle, { pointerId, clientX: 460, clientY: 110, buttons: 1 });
  fireEvent.pointerUp(handle, { pointerId, clientX: 460, clientY: 110 });
}

describe("DraggableOverlayDialog", () => {
  it("moves a manually composed popup only when its named header is dragged", () => {
    render(
      <DraggableOverlayDialog data-testid="manual-popup" aria-label="Choose a sink option">
        <div data-popup-drag-handle="true">Choose a sink option</div>
        <button type="button">Keep current option</button>
      </DraggableOverlayDialog>
    );

    const popup = screen.getByTestId("manual-popup");
    const heading = screen.getByText("Choose a sink option");
    drag(heading);

    expect(popup.style.translate).toContain("-280px");
  });

  it("does not move when a button inside a draggable header is clicked", () => {
    render(
      <DraggableOverlayDialog data-testid="manual-popup" aria-label="Choose placement">
        <div data-popup-drag-handle="true"><button type="button">Back</button>Choose placement</div>
      </DraggableOverlayDialog>
    );

    const popup = screen.getByTestId("manual-popup");
    drag(screen.getByRole("button", { name: "Back" }));

    expect(popup.style.translate).toBe("calc(-50% + 0px) calc(-50% + 0px)");
  });
});
