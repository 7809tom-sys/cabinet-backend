import { useMemo } from "react";
import { Minus, Plus, DoorOpen, DoorClosed, Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PlacedCabinet,
  hasDoorSwing,
  resolveSwing,
  placedHeight,
  isCustomWidth,
  isCustomHeight,
  isCustomDepth,
} from "@/lib/design";

// A single dimension stepper (−/value/+) used inside the dialog.
function Dim({
  label,
  value,
  custom,
  min,
  max,
  onSet,
}: {
  label: string;
  value: number;
  custom: boolean;
  min: number;
  max: number;
  onSet: (v: number) => void;
}) {
  const full = label === "W" ? "Width" : label === "H" ? "Height" : "Depth";
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{full} (in)</Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          title={`Decrease ${full} 1 inch`}
          onClick={() => onSet(Math.max(min, Math.round((value - 1) * 10) / 10))}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Input
          type="number"
          step="0.25"
          min={min}
          max={max}
          value={value}
          className={cn(
            "h-8 w-20 text-center text-sm",
            custom && "font-semibold text-[var(--color-gold,#c89b3c)]"
          )}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0) onSet(Math.max(min, Math.min(max, v)));
          }}
          aria-label={`${full} in inches`}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          title={`Increase ${full} 1 inch`}
          onClick={() => onSet(Math.min(max, Math.round((value + 1) * 10) / 10))}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export interface CabinetAttributesDialogProps {
  cabinet: PlacedCabinet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customFee: number;
  onSetWidth: (uid: string, v: number) => void;
  onSetHeight: (uid: string, v: number) => void;
  onSetDepth: (uid: string, v: number) => void;
  onResetSize: (uid: string) => void;
  onSetSwing: (uid: string, swing: "left" | "right" | "double") => void;
  onSetNoDoor: (uid: string, noDoor: boolean) => void;
  onSetHandleSide: (uid: string, side: "left" | "right") => void;
  onSetRollout: (uid: string, qty: number) => void;
  rolloutAvailable: boolean;
}

// Right-click attributes editor for a single placed cabinet (email item 1):
// resize H/D/W, remove the door, change the door swing (L/R), set the handle
// position, and add roll-out trays. Everything here targets the cabinet the
// dialog was opened on (by uid), independent of keyboard selection.
export function CabinetAttributesDialog({
  cabinet,
  open,
  onOpenChange,
  customFee,
  onSetWidth,
  onSetHeight,
  onSetDepth,
  onResetSize,
  onSetSwing,
  onSetNoDoor,
  onSetHandleSide,
  onSetRollout,
  rolloutAvailable,
}: CabinetAttributesDialogProps) {
  const swing = useMemo(() => (cabinet ? resolveSwing(cabinet) : "double"), [cabinet]);
  if (!cabinet) return null;

  const uid = cabinet.uid;
  const canSwing = hasDoorSwing(cabinet) && swing !== "double";
  const isDouble = swing === "double";
  const noDoor = !!cabinet.noDoor;
  const handleSide: "left" | "right" =
    cabinet.handleSide === "left" || cabinet.handleSide === "right"
      ? cabinet.handleSide
      : // Default the handle to the opposite of the hinge (handles sit on the
        // opening edge); double doors default to right.
        swing === "left"
        ? "right"
        : "left";
  const rolloutQty = typeof cabinet.rolloutQty === "number" ? cabinet.rolloutQty : 0;
  const isBase = cabinet.placement === "base";
  const custom =
    isCustomWidth(cabinet) || isCustomHeight(cabinet) || isCustomDepth(cabinet);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{cabinet.masterCode}</DialogTitle>
          <DialogDescription className="truncate">{cabinet.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Dimensions */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Size</h4>
              {custom && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    Custom +${customFee}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-muted-foreground"
                    onClick={() => onResetSize(uid)}
                  >
                    Reset to catalog
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-end gap-3">
              <Dim
                label="W"
                value={Math.round(cabinet.width * 10) / 10}
                custom={isCustomWidth(cabinet)}
                min={6}
                max={48}
                onSet={(v) => onSetWidth(uid, v)}
              />
              <Dim
                label="H"
                value={Math.round(placedHeight(cabinet) * 10) / 10}
                custom={isCustomHeight(cabinet)}
                min={6}
                max={96}
                onSet={(v) => onSetHeight(uid, v)}
              />
              <Dim
                label="D"
                value={Math.round(cabinet.depth * 10) / 10}
                custom={isCustomDepth(cabinet)}
                min={6}
                max={36}
                onSet={(v) => onSetDepth(uid, v)}
              />
            </div>
          </section>

          {/* Door */}
          <section className="space-y-3 border-t border-border pt-4">
            <h4 className="text-sm font-semibold">Door &amp; hardware</h4>

            {/* Remove door */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {noDoor ? (
                  <DoorOpen className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <DoorClosed className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <Label className="text-sm">Remove door</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Order as an open unit (no door/front).
                  </p>
                </div>
              </div>
              <Switch
                checked={noDoor}
                onCheckedChange={(v) => onSetNoDoor(uid, v)}
                aria-label="Remove door"
              />
            </div>

            {/* Door swing */}
            <div className={cn("space-y-1.5", noDoor && "opacity-40 pointer-events-none")}>
              <Label className="text-sm">Door swing (hinge side)</Label>
              {isDouble ? (
                <p className="text-[11px] text-muted-foreground">
                  Double-door cabinet — both doors open from the center.
                </p>
              ) : !hasDoorSwing(cabinet) ? (
                <p className="text-[11px] text-muted-foreground">
                  This item has no hinged door.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={swing === "left" ? "default" : "outline"}
                    size="sm"
                    className="h-8"
                    disabled={!canSwing}
                    onClick={() => onSetSwing(uid, "left")}
                  >
                    Left hinge
                  </Button>
                  <Button
                    type="button"
                    variant={swing === "right" ? "default" : "outline"}
                    size="sm"
                    className="h-8"
                    disabled={!canSwing}
                    onClick={() => onSetSwing(uid, "right")}
                  >
                    Right hinge
                  </Button>
                </div>
              )}
            </div>

            {/* Handle position */}
            <div className={cn("space-y-1.5", noDoor && "opacity-40 pointer-events-none")}>
              <Label className="text-sm">Handle position</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={handleSide === "left" ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={() => onSetHandleSide(uid, "left")}
                >
                  Left
                </Button>
                <Button
                  type="button"
                  variant={handleSide === "right" ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={() => onSetHandleSide(uid, "right")}
                >
                  Right
                </Button>
              </div>
            </div>
          </section>

          {/* Roll-out trays */}
          <section className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold">Roll-out trays</h4>
            </div>
            {isBase ? (
              rolloutAvailable ? (
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={rolloutQty <= 0}
                    onClick={() => onSetRollout(uid, Math.max(0, rolloutQty - 1))}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="min-w-[2ch] text-center text-sm font-semibold tabular-nums">
                    {rolloutQty}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onSetRollout(uid, rolloutQty + 1)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    Pull-out shelves added to the build sheet.
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Roll-out trays aren’t offered for the selected door style.
                </p>
              )
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Roll-out trays are only available on base cabinets.
              </p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
