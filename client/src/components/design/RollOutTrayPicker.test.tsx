// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RollOutTrayPicker } from "./RollOutTrayPicker";

const useQuery = vi.fn();

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) => key === "dt_ca_rollout_hint" ? `Fits ${vars?.size}\" cabinets` : key,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: { design: { resolveRollOutTray: { useQuery: (...args: unknown[]) => useQuery(...args) } } },
}));

const tray = {
  cabinetId: 81,
  masterCode: "RS-18",
  description: "18-inch rollout tray",
  width: 18,
  platformSku: "ASH-RS18",
  listPrice: "100.00",
  adjustedListPrice: "95.00",
  homeownerPrice: "90.00",
  contractorPrice: "70.00",
  wholesalePrice: "55.00",
};

const base18 = {
  uid: "base-18",
  cabinetId: 18,
  masterCode: "B18",
  description: "18-inch base cabinet",
  placement: "base",
  category: "Base",
  subCategory: "Single Door Base",
  x: 0,
  y: 0,
  width: 18,
  nominalWidth: 18,
  height: 34.5,
  depth: 24,
  numberOfDoors: 1,
  numberOfDrawers: 1,
};

afterEach(() => {
  useQuery.mockReset();
});

describe("RollOutTrayPicker", () => {
  it("shows selected-tier pricing and enforces the one-to-five quantity range for an 18-inch base", () => {
    useQuery.mockReturnValue({ data: tray, isLoading: false });
    const onSetQty = vi.fn();
    const { rerender } = render(
      <RollOutTrayPicker cabinet={base18 as never} designStyleId={4} distributorId={9} pricingTier="homeowner" qty={4} onSetQty={onSetQty} />,
    );

    expect(screen.getByText(/\$90\.00/)).toBeTruthy();
    expect(screen.getByText(/RS-18/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "dt_ca_rollout_qty +" }));
    expect(onSetQty).toHaveBeenCalledWith(5);

    rerender(<RollOutTrayPicker cabinet={base18 as never} designStyleId={4} distributorId={9} pricingTier="homeowner" qty={5} onSetQty={onSetQty} />);
    expect(screen.getByRole("button", { name: "dt_ca_rollout_qty +" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("spinbutton", { name: "dt_ca_rollout_qty" }), { target: { value: "99" } });
    expect(onSetQty).toHaveBeenLastCalledWith(5);
    fireEvent.change(screen.getByRole("spinbutton", { name: "dt_ca_rollout_qty" }), { target: { value: "0" } });
    expect(onSetQty).toHaveBeenLastCalledWith(0);
  });

  it("renders for an eligible pantry and uses the same distributor/style tray query", () => {
    useQuery.mockReturnValue({ data: { ...tray, masterCode: "RS-24", width: 24 }, isLoading: false });
    const pantry = { ...base18, uid: "pantry-24", masterCode: "P2496", placement: "tall", subCategory: "Pantry / Utility", width: 24, nominalWidth: 24, height: 96, numberOfDoors: 4 } as never;
	    render(<RollOutTrayPicker cabinet={pantry} designStyleId={14} distributorId={6} pricingTier="contractor" qty={1} onSetQty={vi.fn()} />);
	    expect(screen.getByText(/RS-24/)).toBeTruthy();
	    expect(screen.getByText(/\$70\.00/)).toBeTruthy();
    expect(useQuery).toHaveBeenCalledWith(
      { styleId: 14, width: 24, distributorId: 6 },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("renders no controls for a base below 18 inches or an appliance tower", () => {
    useQuery.mockReturnValue({ data: tray, isLoading: false });
    const narrow = { ...base18, uid: "base-15", masterCode: "B15", width: 15, nominalWidth: 15 } as never;
    const { rerender, container } = render(<RollOutTrayPicker cabinet={narrow} designStyleId={4} distributorId={9} pricingTier="homeowner" qty={0} onSetQty={vi.fn()} />);
    expect(container.textContent).toBe("");

    const ovenTower = { ...base18, uid: "oven-tall", masterCode: "UOC3396", placement: "tall", subCategory: "Oven Cabinet", width: 33, nominalWidth: 33, numberOfDoors: 2 } as never;
    rerender(<RollOutTrayPicker cabinet={ovenTower} designStyleId={4} distributorId={9} pricingTier="homeowner" qty={0} onSetQty={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
});
