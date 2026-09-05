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
  onDuplicate: (uid: string, bottomIn: number) => void;
  onRemove: (uid: string) => void;
};

const MIN_SHELF_LENGTH_IN = 6;

export function FloatingShelfAttributesDialog({ shelf, open, onOpenChange, ceilingHeight, shelvesOnRun, onApply, onDuplicate, onRemove }: Props) {
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
  const validBottom = Number.isFinite(bottomIn) && bottomIn >= 0 && bottomIn <= maximumBottom;
  const valid = validBottom && Number.isFinite(lengthIn) && lengthIn >= MIN_SHELF_LENGTH_IN && lengthIn <= maximumLength;
  const canDuplicate = validBottom && shelvesOnRun < 4;
  const shelfThickness = Math.max(0.125, Number(shelf.height) || 0.75);
  const originalBottom = Math.max(0, Math.min(maximumBottom, Number(shelf.mountBottom) || 54));
  const verticalPercent = (heightFromFloor: number) => Math.max(2, Math.min(94, 100 - ((heightFromFloor + shelfThickness) / Math.max(1, ceilingHeight)) * 100));

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
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <strong>Duplicate shelf:</strong> uses this shelf’s currently installed length of {formatEighthInches(Number(shelf.width) || maximumLength)} at the bottom height entered above. The original shelf is unchanged.
          </p>
          <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3" aria-label="Duplicate shelf placement preview">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-amber-950 dark:text-amber-100">Live duplicate placement preview</div>
              <span className="text-[11px] text-amber-900 dark:text-amber-200">Same wall span · same {formatEighthInches(Number(shelf.width) || maximumLength)} length</span>
            </div>
            <div className="relative h-44 overflow-hidden rounded border border-slate-300 bg-white" aria-label={`Wall elevation from floor to ${formatEighthInches(ceilingHeight)}`}>
              <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-500" />
              <span className="absolute bottom-1 left-2 text-[10px] font-medium text-slate-500">Floor 0″</span>
              <span className="absolute right-2 top-1 text-[10px] font-medium text-slate-500">Ceiling {formatEighthInches(ceilingHeight)}</span>
              <div className="absolute left-[14%] right-[14%] h-2 rounded bg-slate-700" style={{ top: `${verticalPercent(originalBottom)}%` }} />
              <span className="absolute left-[14%] text-[10px] font-medium text-slate-700" style={{ top: `calc(${verticalPercent(originalBottom)}% - 17px)` }}>Current shelf · bottom {formatEighthInches(originalBottom)}</span>
              {validBottom ? (
                <>
                  <div className="absolute left-[14%] right-[14%] h-2 rounded border-2 border-dashed border-amber-600 bg-amber-200/80" style={{ top: `${verticalPercent(bottomIn)}%` }} />
                  <span className="absolute right-[14%] text-[10px] font-semibold text-amber-800" style={{ top: `calc(${verticalPercent(bottomIn)}% - 17px)` }}>New duplicate · bottom {formatEighthInches(bottomIn)}</span>
                </>
              ) : <span className="absolute left-[14%] top-1/2 text-xs font-medium text-red-700">Enter a valid bottom height to preview the duplicate.</span>}
            </div>
            <p className="mt-2 text-[11px] text-slate-700">The dashed shelf is the new copy. It stays aligned with the current shelf’s wall span and will not be added until you confirm.</p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="destructive" onClick={() => { onRemove(shelf.uid); onOpenChange(false); }}>Remove shelf</Button>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" variant="outline" disabled={!canDuplicate} onClick={() => onDuplicate(shelf.uid, bottomIn)}>Confirm duplicate shelf</Button>
            <Button type="button" disabled={!valid} onClick={() => { onApply(shelf.uid, bottomIn, lengthIn); onOpenChange(false); }}>Apply shelf placement</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
