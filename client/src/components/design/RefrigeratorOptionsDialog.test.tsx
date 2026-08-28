// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RefrigeratorOptionsDialog } from "./RefrigeratorOptionsDialog";

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

const endPanel = {
  id: 9390059,
  masterCode: "REP2496",
  description: "24 inch Deep Refrigerator End Panel",
  width: "0.75",
  height: "96",
  depth: "24",
};

function renderDialog(onApply = vi.fn()) {
  render(
    <RefrigeratorOptionsDialog
      open
      onOpenChange={vi.fn()}
      fridgeWidthInches={36}
      endPanels={[endPanel]}
      onApply={onApply}
      onSkip={vi.fn()}
    />,
  );
  return onApply;
}

describe("RefrigeratorOptionsDialog end-panel defaults", () => {
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
});
