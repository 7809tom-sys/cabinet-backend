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
});
