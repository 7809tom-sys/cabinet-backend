// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { WindowAttributesDialog } from "./WindowAttributesDialog";

describe("WindowAttributesDialog", () => {
  afterEach(cleanup);

  it("shows the selected saved window with four-direction movement and exact measurement controls", () => {
    render(createElement(LanguageProvider, null, createElement(WindowAttributesDialog, {
      opening: { uid: "window-1", kind: "window", label: 'Window 36"', side: "top", offset: 54, width: 36, height: 36, sill: 42 },
      room: { width: 144, depth: 120, ceilingHeight: 96 },
      open: true,
      onOpenChange: () => undefined,
      onChange: () => undefined,
      onDelete: () => undefined,
    })));
    expect(screen.getByTestId("window-attributes-dialog").textContent).toContain("Window attributes");
    expect(screen.getByLabelText("Move window down 1 inch")).toBeTruthy();
    expect(screen.getByLabelText("Move window up 1 inch")).toBeTruthy();
    expect(screen.getByLabelText("Move toward start of wall")).toBeTruthy();
    expect(screen.getByLabelText("Move toward end of wall")).toBeTruthy();
    expect(screen.getByLabelText("Window position reference")).toBeTruthy();
    expect(screen.getByLabelText("Window distance from wall start / left in inches")).toBeTruthy();
  });

  it("moves the authoritative window by the selected eighth-inch distance", () => {
    const onChange = vi.fn();
    render(createElement(LanguageProvider, null, createElement(WindowAttributesDialog, {
      opening: { uid: "window-1", kind: "window", label: 'Window 36"', side: "top", offset: 54, width: 36, height: 36, sill: 42 },
      room: { width: 144, depth: 120, ceilingHeight: 96 },
      open: true,
      onOpenChange: () => undefined,
      onChange,
      onDelete: () => undefined,
    })));
    fireEvent.change(screen.getByLabelText("Window movement distance in inches"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByLabelText('Move window up 2½"'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ uid: "window-1", sill: 44.5 }));
    onChange.mockClear();
    fireEvent.click(screen.getByLabelText("Move toward start of wall"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ uid: "window-1", offset: 51.5 }));
  });

  it("commits a typed position from the start of a measured custom wall", () => {
    const onChange = vi.fn();
    render(createElement(LanguageProvider, null, createElement(WindowAttributesDialog, {
      opening: { uid: "window-custom-1", kind: "window", label: 'Window 36"', side: "wall-1" as any, offset: 18, width: 36, height: 36, sill: 42 },
      room: {
        width: 144,
        depth: 120,
        vertices: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 144, y: 0 }],
        customWalls: [{ id: "wall-1", startVertexId: "a", endVertexId: "b", label: "Wall 1", height: 96 }],
      },
      open: true,
      onOpenChange: () => undefined,
      onChange,
      onDelete: () => undefined,
    })));

    const position = screen.getByLabelText("Window distance from wall start / left in inches");
    fireEvent.change(position, { target: { value: "70.125" } });
    fireEvent.blur(position);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ uid: "window-custom-1", side: "wall-1", offset: 70.125 }));
  });

  it("converts a typed wall-end/right measurement into the same authoritative start offset", () => {
    const onChange = vi.fn();
    render(createElement(LanguageProvider, null, createElement(WindowAttributesDialog, {
      opening: { uid: "window-end-1", kind: "window", label: 'Window 36"', side: "top", offset: 18, width: 36, height: 36, sill: 42 },
      room: { width: 144, depth: 120, ceilingHeight: 96 },
      open: true,
      onOpenChange: () => undefined,
      onChange,
      onDelete: () => undefined,
    })));

    fireEvent.change(screen.getByLabelText("Window position reference"), { target: { value: "end" } });
    const position = screen.getByLabelText("Window distance from wall end / right in inches");
    fireEvent.change(position, { target: { value: "20.125" } });
    fireEvent.blur(position);
    // 144-inch wall − 36-inch window = 108-inch usable run; 108 − 20.125 = 87.875.
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ uid: "window-end-1", offset: 87.875 }));
  });
});
