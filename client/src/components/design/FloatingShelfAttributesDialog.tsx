import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatEighthInches, type PlacedCabinet } from "@/lib/design";

type Props = {
  shelf: PlacedCabinet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ceilingHeight: number;
  shelvesOnRun: number;
  onApply: (uid: string, bottomIn: number, lengthIn: number) => void;
  onRemove: (uid: string) => void;
};

const MIN_SHELF_LENGTH_IN = 6;

export function FloatingShelfAttributesDialog({ shelf, open, onOpenChange, ceilingHeight, shelvesOnRun, onApply, onRemove }: Props) {
  const maximumLength = useMemo(() => Math.max(MIN_SHELF_LENGTH_IN, Number(shelf?.nominalWidth ?? shelf?.width) || MIN_SHELF_LENGTH_IN), [shelf?.nominalWidth, shelf?.uid, shelf?.width]);
  const maximumBottom = useMemo(() => Math.max(0, ceilingHeight - Math.max(0.125, Number(shelf?.height) || 0.75)), [ceilingHeight, shelf?.height]);
  const [bottomText, setBottomText] = useState("54");
  const [lengthText, setLengthText] = useState(String(maximumLength));

  useEffect(() => {
    if (!shelf) return;
    setBottomText(String(Math.round((Number(shelf.mountBottom) || 54) * 8) / 8));
    setLengthText(String(Math.round((Number(shelf.width) || maximumLength) * 8) / 8));
  }, [maximumLength, open, shelf?.mountBottom, shelf?.uid, shelf?.width]);

  if (!shelf) return null;
  const bottomIn = Math.round(Number(bottomText) * 8) / 8;
  const lengthIn = Math.round(Number(lengthText) * 8) / 8;
  const valid = Number.isFinite(bottomIn) && bottomIn >= 0 && bottomIn <= maximumBottom
    && Number.isFinite(lengthIn) && lengthIn >= MIN_SHELF_LENGTH_IN && lengthIn <= maximumLength;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86dvh] overflow-y-auto sm:max-w-lg" data-testid="floating-shelf-attributes-dialog">
        <DialogHeader>
          <DialogTitle>Floating shelf placement</DialogTitle>
          <DialogDescription>
            Set the shelf bottom height from the finished floor and its installed length. Up to four shelves may share this wall span when their heights do not overlap.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/25 p-3 text-sm">
            <div><span className="block text-xs text-muted-foreground">Catalog shelf</span><strong>{shelf.masterCode}</strong></div>
            <div><span className="block text-xs text-muted-foreground">Shelves on this span</span><strong>{shelvesOnRun} of 4</strong></div>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Bottom height from floor (inches)
            <Input aria-label="Shelf bottom height from floor" inputMode="decimal" step="0.125" min={0} max={maximumBottom} value={bottomText} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setBottomText(event.target.value)} />
            <span className="text-xs font-normal text-muted-foreground">0 to {formatEighthInches(maximumBottom)} in 1/8-inch steps.</span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Shelf length (inches)
            <Input aria-label="Shelf length in inches" inputMode="decimal" step="0.125" min={MIN_SHELF_LENGTH_IN} max={maximumLength} value={lengthText} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setLengthText(event.target.value)} />
            <span className="text-xs font-normal text-muted-foreground">{formatEighthInches(MIN_SHELF_LENGTH_IN)} to the catalog maximum of {formatEighthInches(maximumLength)}. The shelf is never enlarged beyond its sellable length.</span>
          </label>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="destructive" onClick={() => { onRemove(shelf.uid); onOpenChange(false); }}>Remove shelf</Button>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={!valid} onClick={() => { onApply(shelf.uid, bottomIn, lengthIn); onOpenChange(false); }}>Apply shelf placement</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
