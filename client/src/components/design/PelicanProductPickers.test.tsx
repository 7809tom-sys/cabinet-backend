// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    surfaces: {
      recommended: {
        useQuery: () => ({
          isLoading: false,
          data: [{ id: 11, slug: "pallum", name: "Pallum 3cm Super Jumbo", category: "Countertop", subCategory: "Quartz", size: "138 × 79 in.", imageUrl: null, sellPrice: 2430 }],
        }),
      },
    },
  },
}));

import { PelicanCountertopPicker } from "./PelicanProductPickers";

afterEach(cleanup);

describe("PelicanCountertopPicker", () => {
  it("keeps countertop cards collapsed until the compact chooser is opened", () => {
    render(<PelicanCountertopPicker selectedSurfaces={[]} onSelect={vi.fn()} onBrowseAll={vi.fn()} />);
    const chooser = screen.getByRole("button", { name: /countertop choices/i });
    expect(chooser.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Pallum 3cm Super Jumbo")).toBeNull();
    fireEvent.click(chooser);
    expect(chooser.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Pallum 3cm Super Jumbo")).toBeTruthy();
  });
});
