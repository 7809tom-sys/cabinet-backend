import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type RoomData, type WallOpening } from "@/lib/design";
import { OpeningSizeEditor } from "./OpeningSizeEditor";

export type WindowAttributesDialogProps = {
  opening: WallOpening | null;
  room: RoomData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (opening: WallOpening) => void;
  onDelete: (uid: string) => void;
};

export function WindowAttributesDialog({ opening, room, open, onOpenChange, onChange, onDelete }: WindowAttributesDialogProps) {
  const [movementText, setMovementText] = useState("1");
  const parsedMovement = Number(movementText);
  const movementIncrementIn = Number.isFinite(parsedMovement)
    ? Math.max(0.125, Math.min(48, Math.round(parsedMovement * 8) / 8))
    : 1;
  if (!opening || opening.kind !== "window") return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86dvh] overflow-y-auto sm:max-w-2xl" data-testid="window-attributes-dialog">
        <DialogHeader>
          <DialogTitle>Window attributes</DialogTitle>
          <DialogDescription>
            Move this window along its {opening.side} wall or raise and lower its sill. All measurements are in inches.
          </DialogDescription>
        </DialogHeader>
        <label className="grid max-w-[14rem] gap-1.5 text-sm font-medium">
          Movement distance in inches
          <input
            type="number"
            inputMode="decimal"
            min="0.125"
            max="48"
            step="0.125"
            aria-label="Window movement distance in inches"
            value={movementText}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setMovementText(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <div className="rounded-lg border bg-muted/20 p-3">
          <OpeningSizeEditor opening={opening} room={room} onChange={onChange} onDelete={() => onDelete(opening.uid)} movementIncrementIn={movementIncrementIn} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
