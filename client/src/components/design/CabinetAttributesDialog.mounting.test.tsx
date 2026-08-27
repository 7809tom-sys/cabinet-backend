// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CabinetAttributesDialog } from "./CabinetAttributesDialog";

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/design/RollOutTrayPicker", () => ({
  RollOutTrayPicker: () => null,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    masterSku: {
      getAliasesForCabinet: { useQuery: () => ({ data: [] }) },
      similarForCabinet: { useQuery: () => ({ data: [] }) },
      confirmCabinetLink: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    useUtils: () => ({
      masterSku: {
        getAliasesForCabinet: { invalidate: vi.fn() },
        similarForCabinet: { invalidate: vi.fn() },
      },
    }),
  },
}));

const wallCabinet = {
  uid: "w3024",
  cabinetId: 1,
  masterCode: "W3024",
  description: "30 inch by 24 inch wall cabinet",
  placement: "wall",
  x: 0,
  y: 0,
  width: 30,
  height: 24,
  depth: 12,
  numberOfDoors: 2,
  numberOfDrawers: 0,
} as never;

function renderDialog(onSetMountBottom = vi.fn(), onSetHandleSide = vi.fn()) {
  const onMoveInOut = vi.fn();
  render(
    <CabinetAttributesDialog
      cabinet={wallCabinet}
      open
      onOpenChange={vi.fn()}
      customFee={0}
      onSetWidth={vi.fn()}
      onSetHeight={vi.fn()}
      onSetDepth={vi.fn()}
      mountBottom={72}
      maxMountBottom={72}
      onSetMountBottom={onSetMountBottom}
      onMoveInOut={onMoveInOut}
      onResetSize={vi.fn()}
      onSetSwing={vi.fn()}
      onSetNoDoor={vi.fn()}
      onSetHandleSide={onSetHandleSide}
      designStyleId={null}
      distributorId={null}
      onSetRolloutQty={vi.fn()}
      onSetGlassDoor={vi.fn()}
      onSetDecorativeEnd={vi.fn()}
      glassDoorAvailable={false}
      onAddGlassDoorToCart={vi.fn()}
      onSetBlindPull={vi.fn()}
      onSetWaterfall={vi.fn()}
      onSetCategory={vi.fn()}
      onSetCustomProfile={vi.fn()}
      onSetOvenType={vi.fn()}
    />
  );
  return { onSetMountBottom, onMoveInOut, onSetHandleSide };
}

describe("CabinetAttributesDialog wall cabinet elevation controls", () => {
  it("exposes right-click up/down mounting controls and sends the selected height", () => {
    const { onSetMountBottom, onMoveInOut } = renderDialog();
    expect(screen.getByText("End Panel Treatment")).toBeTruthy();
    expect((screen.getByLabelText("Cabinet mounting height from floor") as HTMLInputElement).value).toBe("72");
    fireEvent.click(screen.getByTitle("Move down one inch"));
    expect(onSetMountBottom).toHaveBeenCalledWith("w3024", 71);
    fireEvent.click(screen.getByText("Reset 54″"));
    expect(onSetMountBottom).toHaveBeenCalledWith("w3024", 54);
    fireEvent.change(screen.getByLabelText("Cabinet mounting height from floor"), { target: { value: "65" } });
    expect(onSetMountBottom).toHaveBeenCalledWith("w3024", 65);
    fireEvent.click(screen.getByTitle("Move out one inch toward the wall"));
    fireEvent.click(screen.getByTitle("Move in one inch into the room"));
    expect(onMoveInOut).toHaveBeenNthCalledWith(1, "w3024", "out");
    expect(onMoveInOut).toHaveBeenNthCalledWith(2, "w3024", "in");
  });

  it("mounts safely when a cabinet becomes selected after an initially empty dialog", () => {
    const props = {
      onOpenChange: vi.fn(), customFee: 0, onSetWidth: vi.fn(), onSetHeight: vi.fn(), onSetDepth: vi.fn(),
      mountBottom: 72, maxMountBottom: 72, onSetMountBottom: vi.fn(), onResetSize: vi.fn(), onSetSwing: vi.fn(),
      onMoveInOut: vi.fn(),
      onSetNoDoor: vi.fn(), onSetHandleSide: vi.fn(), designStyleId: null, distributorId: null,
      onSetRolloutQty: vi.fn(), onSetGlassDoor: vi.fn(), onSetDecorativeEnd: vi.fn(), glassDoorAvailable: false,
      onAddGlassDoorToCart: vi.fn(), onSetBlindPull: vi.fn(), onSetWaterfall: vi.fn(), onSetCategory: vi.fn(),
      onSetCustomProfile: vi.fn(), onSetOvenType: vi.fn(),
    };
    const { rerender } = render(<CabinetAttributesDialog cabinet={null} open={false} {...props} />);

    expect(() => rerender(<CabinetAttributesDialog cabinet={wallCabinet} open {...props} />)).not.toThrow();
  });

  it("offers independent automatic, left, center, right, and paired-door hardware choices", () => {
    const { onSetHandleSide } = renderDialog();
    const dialog = screen.getAllByRole("dialog").at(-1)!;
    const attributes = within(dialog);
    expect(attributes.getAllByText("Hardware placement").length).toBeGreaterThan(0);
    fireEvent.click(attributes.getByRole("button", { name: "Center" }));
    fireEvent.click(attributes.getByRole("button", { name: "dt_ca_left" }));
    fireEvent.click(attributes.getByRole("button", { name: "dt_ca_right" }));
    fireEvent.click(attributes.getByRole("button", { name: "Automatic" }));
    fireEvent.click(attributes.getByRole("button", { name: "Paired doors — pulls at the center meeting edge" }));
    expect(onSetHandleSide).toHaveBeenNthCalledWith(1, "w3024", "center");
    expect(onSetHandleSide).toHaveBeenNthCalledWith(2, "w3024", "left");
    expect(onSetHandleSide).toHaveBeenNthCalledWith(3, "w3024", "right");
    expect(onSetHandleSide).toHaveBeenNthCalledWith(4, "w3024", "auto");
    expect(onSetHandleSide).toHaveBeenNthCalledWith(5, "w3024", "paired");
  });
});
