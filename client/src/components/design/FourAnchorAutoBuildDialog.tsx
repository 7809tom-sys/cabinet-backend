import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type {
  DishwasherSide,
  FourAnchorInputs,
  FourAnchorLayoutType,
  FourAnchorOriginCorner,
  FourAnchorRunDirection,
  WallLabel,
} from "@/lib/fourAnchorAutoBuild";

export type FourAnchorSubmitResult = { ok: true } | { ok: false; message: string };
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBuild: (input: FourAnchorInputs) => FourAnchorSubmitResult;
  /** The selected line's source-priced base catalog is still arriving. */
  catalogLoading?: boolean;
};
type PointField = "sink" | "stove" | "dishwasher" | "refrigerator";
type SinkBaseWidth = 30 | 33 | 36 | 42;
type RefrigeratorWidth = 30 | 33 | 36 | 42;
type WallCabinetHeight = 30 | 36 | 42;

const labels: Record<PointField, string> = {
  sink: "Sink base",
  stove: "Range / stove",
  dishwasher: "Dishwasher — Optional exact dishwasher center",
  refrigerator: "Refrigerator",
};
const wallSelectionLabels: Record<PointField, string> = {
  sink: "Sink base — place on wall",
  stove: "Range / stove — place on wall",
  dishwasher: "Dishwasher — place on wall when using an exact center",
  refrigerator: "Refrigerator — place on wall",
};
const wallLabels: WallLabel[] = ["Wall 1", "Wall 2", "Wall 3", "Wall 4"];
type FieldValue = { wallLabel: WallLabel; centerOffsetIn: string };

export function FourAnchorAutoBuildDialog({ open, onOpenChange, onBuild, catalogLoading = false }: Props) {
  const [layoutType, setLayoutType] = useState<FourAnchorLayoutType>("single-wall");
  const [originCorner, setOriginCorner] = useState<FourAnchorOriginCorner>("left");
  const [runDirection, setRunDirection] = useState<FourAnchorRunDirection>("right");
  const [values, setValues] = useState<Record<PointField, FieldValue>>({
    sink: { wallLabel: "Wall 1", centerOffsetIn: "24" },
    stove: { wallLabel: "Wall 1", centerOffsetIn: "120" },
    dishwasher: { wallLabel: "Wall 1", centerOffsetIn: "" },
    refrigerator: { wallLabel: "Wall 1", centerOffsetIn: "84" },
  });
  const [sinkBaseWidth, setSinkBaseWidth] = useState<SinkBaseWidth>(36);
  const [wallCabinetHeight, setWallCabinetHeight] = useState<WallCabinetHeight>(30);
  const [dishwasherSide, setDishwasherSide] = useState<DishwasherSide>("right");
  const refrigeratorWidth: RefrigeratorWidth = 36;
  const [windowCenter, setWindowCenter] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setValue = (field: PointField, patch: Partial<FieldValue>) => setValues((current) => ({
    ...current,
    [field]: { ...current[field], ...patch },
  }));
  const measurement = (field: PointField) => ({
    wallLabel: values[field].wallLabel,
    centerOffsetIn: Number(values[field].centerOffsetIn),
  });
  const optionalMeasurement = (field: PointField) => values[field].centerOffsetIn.trim() ? measurement(field) : null;

  const submit = () => {
    setSubmitError(null);
    const result = onBuild({
      layoutType,
      originCorner,
      runDirection,
      wallCabinetHeightIn: wallCabinetHeight,
      sink: measurement("sink"),
      sinkBaseWidthIn: sinkBaseWidth,
      stove: measurement("stove"),
      dishwasher: optionalMeasurement("dishwasher"),
      dishwasherSide,
      refrigerator: measurement("refrigerator"),
      refrigeratorWidthIn: refrigeratorWidth,
      refrigeratorPanels: "both",
      refrigeratorEnclosure: "cabinet-above",
      sinkWindowCenter: windowCenter.trim()
        ? { wallLabel: values.sink.wallLabel, centerOffsetIn: Number(windowCenter) }
        : null,
    });
    if (!result.ok) setSubmitError(result.message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] sm:max-w-2xl overflow-y-auto overflow-x-hidden" data-testid="four-anchor-auto-build-dialog">
        <DialogHeader>
          <DialogTitle>Admin · Four-anchor auto-build</DialogTitle>
          <DialogDescription>
            Choose the layout and datum first. Every measured anchor uses its own Wall 1–4 selector and a center measurement from that wall’s starting corner.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Layout type</Label>
              <Select value={layoutType} onValueChange={(value) => setLayoutType(value as FourAnchorLayoutType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single-wall">Single wall</SelectItem>
                  <SelectItem value="galley">Galley</SelectItem>
                  <SelectItem value="l-shape">L-shape</SelectItem>
                  <SelectItem value="u-shape">U-shape</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Starting corner</Label>
              <Select value={originCorner} onValueChange={(value) => setOriginCorner(value as FourAnchorOriginCorner)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="left">Left corner</SelectItem><SelectItem value="right">Right corner</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Run direction</Label>
              <Select value={runDirection} onValueChange={(value) => setRunDirection(value as FourAnchorRunDirection)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="right">To the right</SelectItem><SelectItem value="left">To the left</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            Choose Wall 1–4 for each appliance. The measurement is that item’s center from the selected wall’s labeled starting corner; raw X/Y floor coordinates are never used.
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-sm" data-testid="four-anchor-build-order">
            <p className="font-semibold">Build order</p>
            <p>1. Measured appliances and sink base. 2. Select and place the required corner cabinets. 3. Fill remaining runs with the largest practical regular base cabinets. 4. Place source-sized, aligned wall cabinets above.</p>
            <p className="mt-1 text-xs text-muted-foreground">Specialty bases are not selected automatically. Wall cabinets respect the selected height, windows, doors, refrigerator bay, and ceiling; unavailable or blocked matches are flagged for review.</p>
          </div>
          {catalogLoading && (
            <div role="status" data-testid="four-anchor-catalog-loading" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              Loading the selected line’s source-priced cabinets. Build measured kitchen will be available as soon as the catalog is ready.
            </div>
          )}

          <div className="space-y-1.5 rounded-lg border p-3">
            <Label htmlFor="four-anchor-wall-cabinet-height">Wall-cabinet height</Label>
            <Select value={String(wallCabinetHeight)} onValueChange={(value) => setWallCabinetHeight(Number(value) as WallCabinetHeight)}>
              <SelectTrigger id="four-anchor-wall-cabinet-height" aria-label="Wall cabinet height"><SelectValue /></SelectTrigger>
              <SelectContent>{([30, 36, 42] as const).map((height) => <SelectItem key={height} value={String(height)}>{height}″ wall cabinets</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Choose the source-priced upper-cabinet height for this kitchen: 30″, 36″, or 42″.</p>
          </div>

          <div className="grid gap-2">
            <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,11rem)] items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Appliance / fixture</span><span>Place on wall</span><span>Center from selected wall start (in.)</span>
            </div>
            {(Object.keys(labels) as PointField[]).map((field) => (
              <div key={field} className="grid min-w-0 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,11rem)] items-center gap-2">
                <Label htmlFor={`four-anchor-${field}-center`}>{labels[field]}</Label>
                <Select value={values[field].wallLabel} onValueChange={(value) => setValue(field, { wallLabel: value as WallLabel })}>
                  <SelectTrigger className="w-full min-w-0" aria-label={wallSelectionLabels[field]}><SelectValue /></SelectTrigger>
                  <SelectContent>{wallLabels.map((wall) => <SelectItem key={wall} value={wall}>{wall}</SelectItem>)}</SelectContent>
                </Select>
                <Input
                  className="min-w-0 w-full"
                  id={`four-anchor-${field}-center`}
                  type="number"
                  min="0"
                  step="0.125"
                  placeholder={field === "dishwasher" ? "Leave blank for sink side" : undefined}
                  value={values[field].centerOffsetIn}
                  onChange={(event) => setValue(field, { centerOffsetIn: event.target.value })}
                  aria-label={`${labels[field]} center from selected wall start in inches`}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="four-anchor-sink-base-size">Sink base size</Label>
              <Select value={String(sinkBaseWidth)} onValueChange={(value) => setSinkBaseWidth(Number(value) as SinkBaseWidth)}>
                <SelectTrigger id="four-anchor-sink-base-size" aria-label="Sink base size"><SelectValue /></SelectTrigger>
                <SelectContent>{([30, 33, 36, 42] as const).map((width) => <SelectItem key={width} value={String(width)}>SB{width} · {width}″</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Builds the selected, source-priced sink base—not a generic sink appliance.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="four-anchor-dishwasher-side">Dishwasher position</Label>
              <Select value={dishwasherSide} onValueChange={(value) => setDishwasherSide(value as DishwasherSide)}>
                <SelectTrigger id="four-anchor-dishwasher-side" aria-label="Dishwasher position"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="left">Left of sink</SelectItem><SelectItem value="right">Right of sink</SelectItem></SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Used when the optional exact dishwasher center is blank. An exact center takes precedence.</p>
            </div>
          </div>

          <div className="rounded-lg border p-3" data-testid="four-anchor-refrigerator-options">
            <div className="space-y-1.5">
              <Label>Refrigerator bay</Label>
              <p className="text-sm font-medium">36″ refrigerator · Two source-priced side panels · Matching source-priced 36″ cabinet above</p>
              <p className="text-xs text-muted-foreground">Four-anchor creates this complete refrigerator bay before filling surrounding runs. A refrigerator bay never uses a filler.</p>
            </div>
          </div>

          {layoutType !== "galley" && (
            <div className="space-y-1.5">
              <Label htmlFor="four-anchor-window-center">Optional window center from the selected sink wall’s starting corner (in.)</Label>
              <Input id="four-anchor-window-center" type="number" min="0" step="0.125" placeholder="Leave blank when not applicable" value={windowCenter} onChange={(event) => setWindowCenter(event.target.value)} />
            </div>
          )}
          {submitError && (
            <div role="alert" data-testid="four-anchor-build-error" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {submitError}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={catalogLoading} data-testid="four-anchor-build-submit">Build measured kitchen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
