// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WallBuilder } from "./WallBuilder";

afterEach(cleanup);

function openBuilder() {
  fireEvent.click(screen.getByRole("button", { name: /build walls continuously/i }));
}

function setLength(value: string) {
  const input = screen.getByLabelText("Wall length");
  fireEvent.change(input, { target: { value } });
}

function addWall() {
  fireEvent.click(screen.getByTestId("add-continuous-wall"));
}

describe("Continuous Wall Builder", () => {
  it("adds measured walls continuously with an exact 45-degree choice", () => {
    render(<WallBuilder wallHeightIn={96} onApply={() => undefined} />);
    openBuilder();
    setLength("101");
    addWall();
    setLength("78");
    fireEvent.click(screen.getByRole("button", { name: /45° right/i }));
    addWall();

    expect(screen.getByText(/Wall 1/)).toBeTruthy();
    expect(screen.getByText(/Wall 2/)).toBeTruthy();
    expect(screen.getByText(/45° right · down-right/i)).toBeTruthy();
    expect(screen.getByLabelText("Live continuous wall preview")).toBeTruthy();
  });

  it("closes and applies a measured rectangle atomically", () => {
    const onApply = vi.fn();
    render(<WallBuilder wallHeightIn={108} onApply={onApply} />);
    openBuilder();

    setLength("120");
    addWall();
    setLength("96");
    fireEvent.click(screen.getByRole("button", { name: /90° right/i }));
    addWall();
    setLength("120");
    addWall();
    setLength("96");
    addWall();

    expect(screen.getByText("Room closed")).toBeTruthy();
    fireEvent.click(screen.getByTestId("apply-continuous-wall-room"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toMatchObject({ width: 120, depth: 96 });
    expect(onApply.mock.calls[0][0].customWalls).toHaveLength(4);
    expect(onApply.mock.calls[0][0].customWalls[0]).toMatchObject({ label: "Wall 1", height: 108 });
  });

  it("checks closure without adding walls and applies an open measured path", () => {
    const onApply = vi.fn();
    render(<WallBuilder wallHeightIn={96} onApply={onApply} />);
    openBuilder();
    setLength("120");
    addWall();
    setLength("96");
    fireEvent.click(screen.getByRole("button", { name: /90° right/i }));
    addWall();
    setLength("60");
    addWall();

    fireEvent.click(screen.getByRole("button", { name: /check closure/i }));
    expect(screen.getByText(/do not return to the starting point yet/i)).toBeTruthy();
    expect(screen.getAllByText(/Wall [123]/).length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByTestId("apply-continuous-wall-room"));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ openWallPath: true }));
    expect(onApply.mock.calls[0][0].customWalls).toHaveLength(3);
  });

  it("blocks applying a replacement outline when design content already exists", () => {
    const onApply = vi.fn();
    render(<WallBuilder wallHeightIn={96} blockedReason="Clear the current design first." onApply={onApply} />);
    openBuilder();
    setLength("120");
    addWall();
    setLength("96");
    fireEvent.click(screen.getByRole("button", { name: /90° right/i }));
    addWall();
    setLength("120");
    addWall();
    setLength("96");
    addWall();

    expect(screen.getByText("Clear the current design first.")).toBeTruthy();
    expect(screen.getByTestId("apply-continuous-wall-room").hasAttribute("disabled")).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
  });
});
