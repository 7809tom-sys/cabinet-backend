// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RefrigeratorOptionsDialog } from "./RefrigeratorOptionsDialog";

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

const endPanel = {
  id: 9390059,
  masterCode: "REP2496",
  description: "24 inch Deep Refrigerator End Panel",
  width: "0.75",
  height: "96",
  depth: "24",
};

const refrigeratorCap = {
  id: 9390060,
  masterCode: "W3612",
  description: "36 inch Wall Cabinet",
  width: "36",
  height: "12",
  depth: "12",
};

function renderDialog(onApply = vi.fn()) {
  render(
    <RefrigeratorOptionsDialog
      open
      onOpenChange={vi.fn()}
      fridgeWidthInches={36}
      endPanels={[endPanel]}
	  deepAbove={[refrigeratorCap]}
      onApply={onApply}
      onSkip={vi.fn()}
    />,
  );
  return onApply;
}

function renderUnpricedDialog(onApply = vi.fn()) {
  render(
    <RefrigeratorOptionsDialog
      open
      onOpenChange={vi.fn()}
      fridgeWidthInches={36}
      endPanels={[]}
      deepAbove={[]}
      onApply={onApply}
      onSkip={vi.fn()}
    />,
  );
  return onApply;
}

describe("RefrigeratorOptionsDialog end-panel defaults", () => {
  it("keeps enclosure choices compact until More enclosure options is opened", () => {
    renderDialog();
    const options = screen.getByTestId("refrigerator-enclosure-options") as HTMLDetailsElement;
    expect(options.open).toBe(false);
		expect(screen.getByLabelText("Open optional refrigerator enclosure settings")).toBeTruthy();

    fireEvent.click(screen.getByText("More enclosure options"));
    expect(options.open).toBe(true);
    expect(screen.getByRole("button", { name: "Add Cabinet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Both" })).toBeTruthy();
  });

  it("recommends a matching cabinet above the refrigerator without removing the No Cabinet choice", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Add Cabinet" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/recommended: add a matching cabinet above the refrigerator/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "No Cabinet" })).toBeTruthy();
  });

  it("submits both structural end panels by default for a new refrigerator enclosure", () => {
    const onApply = renderDialog();
    expect(screen.getByRole("button", { name: "Both" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/both enclosure panels are selected by default/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "dt_fridge_apply" }));

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      panels: "both",
      endPanelId: 9390059,
      panelDepth: 24,
    }));
  });

  it("preserves an explicit one-side or no-panel choice", () => {
    const onApply = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Left" }));
    fireEvent.click(screen.getByRole("button", { name: "dt_fridge_apply" }));
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ panels: "left", endPanelId: 9390059 }));

    fireEvent.click(screen.getByRole("button", { name: "None" }));
    fireEvent.click(screen.getByRole("button", { name: "dt_fridge_apply" }));
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({
      panels: "none",
      endPanelId: null,
      panelDepth: null,
    }));
  });

  it("never offers a generic refrigerator bay when the selected line has no source-priced cap or panels", () => {
    const onApply = renderUnpricedDialog();
    const apply = screen.getByRole("button", { name: "dt_fridge_apply" });
    expect(apply.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add Cabinet" }).getAttribute("disabled")).not.toBeNull();
    fireEvent.click(screen.getByText("More enclosure options"));
    expect(screen.getByText(/no source-priced refrigerator end panel is available/i)).toBeTruthy();
    fireEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });
});
