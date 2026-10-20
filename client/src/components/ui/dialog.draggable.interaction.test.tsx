// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "./alert-dialog";
import { FillerAttributesDialog } from "@/components/design/FillerAttributesDialog";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

function TitleOnlyDialog() {
  return (
    <Dialog open>
      <DialogContent showCloseButton={false} data-testid="title-only-dialog">
        <DialogTitle>Title-only popup</DialogTitle>
        <DialogDescription>Its visible title still needs to move the popup.</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

function HeaderDialog() {
  return (
    <Dialog open>
      <DialogContent showCloseButton={false} data-testid="header-dialog">
        <DialogHeader>
          <DialogTitle>Header popup</DialogTitle>
          <DialogDescription>Drag the header to move me.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

function TitleOnlyConfirmationDialog() {
  return (
    <AlertDialog open>
      <AlertDialogContent data-testid="title-only-confirmation-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmation popup</AlertDialogTitle>
          <AlertDialogDescription>Its header remains draggable while centered.</AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function drag(handle: HTMLElement, pointerId = 7) {
  const content = handle.closest("[data-slot='dialog-content']") as HTMLElement;
  if (content && typeof content.setPointerCapture !== "function") {
    Object.defineProperty(content, "setPointerCapture", { configurable: true, value: () => undefined });
  }
  fireEvent.pointerDown(handle, { pointerId, button: 0, clientX: 400, clientY: 450 });
  fireEvent.pointerMove(handle, { pointerId, clientX: 400, clientY: 180 });
  fireEvent.pointerUp(handle, { pointerId, clientX: 400, clientY: 180 });
}

describe("Dialog popup dragging", () => {
  it("moves a title-only popup upward when the visible title is clicked and held", () => {
    render(<TitleOnlyDialog />);
    const dialog = screen.getByTestId("title-only-dialog");
    const title = screen.getByText("Title-only popup");

    expect(title.getAttribute("data-dialog-drag-handle")).toBe("true");
    expect(title.querySelector("[data-popup-drag-grip='true']")?.getAttribute("title")).toBe("Drag to move");
    drag(title);
    expect(dialog.style.translate).toContain("-270px");
  });

  it("restores a standard popup to its last dragged position when it is reopened in the same Designer session", async () => {
    const first = render(<HeaderDialog />);
    const movedDialog = screen.getByTestId("header-dialog");
    drag(screen.getByText("Header popup"), 70);
    const savedTranslate = movedDialog.style.translate;
    expect(savedTranslate).toContain("-270px");
    expect(window.sessionStorage.length).toBeGreaterThan(0);
    expect([...Array(window.sessionStorage.length)].map((_, index) => window.sessionStorage.key(index))).toContain("cabinet-dealz:popup-position:v1:dialog:header-dialog");

    first.unmount();
    render(<HeaderDialog />);

    await waitFor(() => expect(screen.getByTestId("header-dialog").style.translate).toBe(savedTranslate));
  });

  it("moves a standard header popup upward without turning its close or form controls into drag handles", () => {
    render(<HeaderDialog />);
    const dialog = screen.getByTestId("header-dialog");
    drag(screen.getByText("Header popup"));
    expect(dialog.style.translate).toContain("-270px");
  });

  it("gives the actual Filler attributes popup the same movable header", () => {
    render(
      <FillerAttributesDialog
        open
        onOpenChange={() => undefined}
        measuredOpening={2}
        onApply={() => undefined}
        onResizeStandalone={() => undefined}
        onRemove={() => undefined}
        filler={{
          uid: "qa-filler",
          cabinetId: 1,
          masterCode: "F342",
          description: "3 inch filler",
          placement: "base",
          x: 0,
          y: 0,
          width: 1,
          depth: 24,
          height: 34.5,
          rotation: 0,
          fillerPieceGroupId: "qa-filler-group",
          fillerTotalWidth: 1,
          fillerPlacementMode: "right",
        } as any}
      />,
    );

    const dialog = screen.getByTestId("filler-attributes-dialog");
    const title = screen.getByText("Filler attributes");
    expect(title.closest("[data-dialog-drag-handle]")).toBeTruthy();
    drag(title, 8);
    expect(dialog.style.translate).toContain("-270px");
  });

  it("moves a confirmation popup by its title without replacing its centered translate", () => {
    render(<TitleOnlyConfirmationDialog />);
    const dialog = screen.getByTestId("title-only-confirmation-dialog");
    const title = screen.getByText("Confirmation popup");

    expect(title.getAttribute("data-alert-dialog-drag-handle")).toBe("true");
    expect(title.querySelector("[data-popup-drag-grip='true']")?.getAttribute("title")).toBe("Drag to move");
    drag(title, 9);
    expect(dialog.style.translate).toContain("calc(-50% + 0px) calc(-50% + -270px)");
  });

  it("restores a confirmation popup to its last dragged position when reopened in the same Designer session", async () => {
    const first = render(<TitleOnlyConfirmationDialog />);
    const movedDialog = screen.getByTestId("title-only-confirmation-dialog");
    drag(screen.getByText("Confirmation popup"), 90);
    const savedTranslate = movedDialog.style.translate;
    expect(savedTranslate).toContain("-270px");

    first.unmount();
    render(<TitleOnlyConfirmationDialog />);

    await waitFor(() => expect(screen.getByTestId("title-only-confirmation-dialog").style.translate).toBe(savedTranslate));
  });
});
