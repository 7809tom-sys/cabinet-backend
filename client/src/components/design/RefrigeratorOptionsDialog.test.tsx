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
	  expect(screen.getByText(/panel depth:/i).textContent).toContain('24″');
    expect(screen.getByText(/source SKU/i).textContent).toContain("REP2496");
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
      panelHeight: 84,
    }));
  });

  it("opens a new refrigerator on a cabinet-above size the selected style actually has", () => {
    const deepCapOnly = { id: 9390061, masterCode: "W3624-24D", description: "36 inch Wall Cabinet 24 deep", width: "36", height: "24", depth: "24" };
    const onApply = vi.fn();
    render(
      <RefrigeratorOptionsDialog
        open
        onOpenChange={vi.fn()}
        fridgeWidthInches={36}
        endPanels={[endPanel]}
        deepAbove={[deepCapOnly]}
        onApply={onApply}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.queryByText(/no 12″ × 12″ cabinet available/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "dt_fridge_apply" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ bridgeCabinetId: 9390061, bridgeHeight: 24, bridgeDepth: 24, panelHeight: 96 }));
  });

  it("shows the required two-inch appliance clearance in the finished panel height", () => {
    renderDialog();
    fireEvent.click(screen.getByText("More enclosure options"));
    expect(screen.getByText(/panel height will be/i).textContent).toContain('84″');
    expect(screen.getByText(/panel height will be/i).textContent).toContain('70″ fridge + 2″ clearance + 12″ cabinet');
  });

  it("reopens with the placed refrigerator's chosen panel and cabinet dimensions", () => {
    render(
      <RefrigeratorOptionsDialog
        open
        onOpenChange={vi.fn()}
        fridgeWidthInches={36}
        endPanels={[endPanel]}
        deepAbove={[refrigeratorCap]}
        initialChoice={{ fridgeWidth: 36, fridgeHeight: 70, fridgeDepth: 30, above: "bridge", bridgeWidth: 36, bridgeHeight: 12, bridgeDepth: 12, panels: "left", endPanelId: 9390059, panelDepth: 24 }}
        onApply={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("More enclosure options"));
    expect(screen.getByRole("button", { name: "Left" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/panel height will be/i).textContent).toContain('84″');
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

  it("keeps selected attributes visible with the exact panel-fit blocker", () => {
    render(
      <RefrigeratorOptionsDialog
        open
        onOpenChange={vi.fn()}
        fridgeWidthInches={36}
        endPanels={[endPanel]}
        deepAbove={[refrigeratorCap]}
        errorMessage="Both refrigerator end panels need clear run space, but would overlap B27 and extend beyond the drawn wall. No refrigerator parts were changed."
        onApply={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("B27");
    expect(screen.getByRole("button", { name: "Both" }).getAttribute("aria-pressed")).toBe("true");
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
