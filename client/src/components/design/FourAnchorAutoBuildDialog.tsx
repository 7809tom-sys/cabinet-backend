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
  RefrigeratorEnclosureChoice,
  RefrigeratorPanelChoice,
  WallLabel,
} from "@/lib/fourAnchorAutoBuild";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onBuild: (input: FourAnchorInputs) => void };
type PointField = "sink" | "stove" | "dishwasher" | "refrigerator";
type SinkBaseWidth = 30 | 33 | 36 | 42;
type RefrigeratorWidth = 30 | 33 | 36 | 42;

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

export function FourAnchorAutoBuildDialog({ open, onOpenChange, onBuild }: Props) {
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
  const [dishwasherSide, setDishwasherSide] = useState<DishwasherSide>("right");
  const [refrigeratorWidth, setRefrigeratorWidth] = useState<RefrigeratorWidth>(36);
  const [refrigeratorPanels, setRefrigeratorPanels] = useState<RefrigeratorPanelChoice>("none");
  const [refrigeratorEnclosure, setRefrigeratorEnclosure] = useState<RefrigeratorEnclosureChoice>("none");
  const [windowCenter, setWindowCenter] = useState("");

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
    onBuild({
      layoutType,
      originCorner,
      runDirection,
      sink: measurement("sink"),
      sinkBaseWidthIn: sinkBaseWidth,
      stove: measurement("stove"),
      dishwasher: optionalMeasurement("dishwasher"),
      dishwasherSide,
      refrigerator: measurement("refrigerator"),
      refrigeratorWidthIn: refrigeratorWidth,
      refrigeratorPanels,
      refrigeratorEnclosure,
      sinkWindowCenter: windowCenter.trim()
        ? { wallLabel: values.sink.wallLabel, centerOffsetIn: Number(windowCenter) }
        : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="four-anchor-auto-build-dialog">
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

          <div className="grid gap-2">
            <div className="grid grid-cols-[minmax(8rem,1fr)_9rem_12rem] items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Appliance / fixture</span><span>Place on wall</span><span>Center from selected wall start (in.)</span>
            </div>
            {(Object.keys(labels) as PointField[]).map((field) => (
              <div key={field} className="grid grid-cols-[minmax(8rem,1fr)_9rem_12rem] items-center gap-2">
                <Label htmlFor={`four-anchor-${field}-center`}>{labels[field]}</Label>
                <Select value={values[field].wallLabel} onValueChange={(value) => setValue(field, { wallLabel: value as WallLabel })}>
                  <SelectTrigger aria-label={wallSelectionLabels[field]}><SelectValue /></SelectTrigger>
                  <SelectContent>{wallLabels.map((wall) => <SelectItem key={wall} value={wall}>{wall}</SelectItem>)}</SelectContent>
                </Select>
                <Input
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

          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3" data-testid="four-anchor-refrigerator-options">
            <div className="space-y-1.5">
              <Label htmlFor="four-anchor-fridge-width">Refrigerator width</Label>
              <Select value={String(refrigeratorWidth)} onValueChange={(value) => setRefrigeratorWidth(Number(value) as RefrigeratorWidth)}>
                <SelectTrigger id="four-anchor-fridge-width" aria-label="Refrigerator width"><SelectValue /></SelectTrigger>
                <SelectContent>{([30, 33, 36, 42] as const).map((width) => <SelectItem key={width} value={String(width)}>{width}″ refrigerator</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="four-anchor-fridge-panels">Side panels</Label>
              <Select value={refrigeratorPanels} onValueChange={(value) => setRefrigeratorPanels(value as RefrigeratorPanelChoice)}>
                <SelectTrigger id="four-anchor-fridge-panels" aria-label="Refrigerator side panels"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">No side panels</SelectItem><SelectItem value="left">Left panel</SelectItem><SelectItem value="right">Right panel</SelectItem><SelectItem value="both">Both panels</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="four-anchor-fridge-enclosure">Over-fridge enclosure</Label>
              <Select value={refrigeratorEnclosure} onValueChange={(value) => setRefrigeratorEnclosure(value as RefrigeratorEnclosureChoice)}>
                <SelectTrigger id="four-anchor-fridge-enclosure" aria-label="Over refrigerator enclosure"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">No cabinet above</SelectItem><SelectItem value="cabinet-above">Select cabinet above</SelectItem></SelectContent>
              </Select>
            </div>
            <p className="sm:col-span-3 text-xs text-muted-foreground">After the anchored refrigerator is seated, the existing source-priced refrigerator-options dialog confirms the exact panel and cabinet SKU before any enclosure parts are added.</p>
          </div>

          {layoutType !== "galley" && (
            <div className="space-y-1.5">
              <Label htmlFor="four-anchor-window-center">Optional window center from the selected sink wall’s starting corner (in.)</Label>
              <Input id="four-anchor-window-center" type="number" min="0" step="0.125" placeholder="Leave blank when not applicable" value={windowCenter} onChange={(event) => setWindowCenter(event.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} data-testid="four-anchor-build-submit">Build measured kitchen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
