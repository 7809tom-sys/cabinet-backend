// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MasterTracTowerPlanner } from "./MasterTracTowerPlanner";
import { defaultTowerConfig } from "@/lib/masterTracTower";
import type { RoomData } from "@/lib/design";

const room: RoomData = { width: 144, depth: 120, ceilingHeight: 96 };
const renderPlanner = (heights: number[]) => render(
  <MasterTracTowerPlanner
    initialConfig={{ ...defaultTowerConfig(), corner: "start", cornerAdjustableHeightsIn: heights }}
    initialWall="top"
    initialStartIn={0}
    room={room}
    placed={[]}
    openings={[]}
    editGroupId={null}
    onClose={vi.fn()}
    onCommit={vi.fn(() => ({ ok: true }))}
  />,
);

describe("MasterTrac corner shelf elevation controls", () => {
  afterEach(() => cleanup());

  it("gives each additional shelf a labeled, full-width elevation row and a touch-sized Remove action", () => {
    renderPlanner([12, 24, 36, 48]);
    const rows = screen.getAllByTestId("corner-shelf-elevation-row");
    expect(rows).toHaveLength(4);
    rows.forEach((row, index) => {
      expect(within(row).getByText(`Shelf ${index + 1}`)).toBeTruthy();
      expect(within(row).getByRole("spinbutton", { name: `Adjustable corner shelf ${index + 1} elevation` })).toHaveProperty("value", String([12, 24, 36, 48][index]));
      expect(within(row).getByRole("button", { name: `Remove adjustable corner shelf ${index + 1}` }).className).toContain("h-11");
    });
    const field = screen.getByRole("spinbutton", { name: "Adjustable corner shelf 1 elevation" });
    fireEvent.click(screen.getByRole("button", { name: "Raise adjustable corner shelf 1 by one inch" }));
    expect(field).toHaveProperty("value", "13");
    fireEvent.click(screen.getByRole("button", { name: "Remove adjustable corner shelf 2" }));
    expect(screen.getAllByTestId("corner-shelf-elevation-row")).toHaveLength(3);
    const levelList = screen.getByTestId("corner-shelf-elevation-list");
    Object.defineProperty(levelList, "scrollHeight", { configurable: true, value: 420 });
    fireEvent.click(screen.getByTestId("add-adjustable-corner-shelf"));
    expect(screen.getAllByTestId("corner-shelf-elevation-row")).toHaveLength(4);
    expect(levelList.scrollTop).toBe(420);
  });

  it("disables a one-inch tap if it would overlap another shelf or exceed the sourced panel", () => {
    renderPlanner([0, 1, 85.5]);
    expect(screen.getByRole("button", { name: "Raise adjustable corner shelf 1 by one inch" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Lower adjustable corner shelf 2 by one inch" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Raise adjustable corner shelf 3 by one inch" })).toHaveProperty("disabled", true);
    expect(screen.queryByTestId("tower-validation-error")).toBeNull();
  });
});
