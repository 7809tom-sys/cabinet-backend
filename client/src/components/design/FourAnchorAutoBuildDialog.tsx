import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FourAnchorInputs, FourAnchorLayoutType, FourAnchorOriginCorner, FourAnchorRunDirection } from "@/lib/fourAnchorAutoBuild";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onBuild: (input: FourAnchorInputs) => void };
type PointField = "sink" | "stove" | "dishwasher" | "refrigerator";

const labels: Record<PointField, string> = { sink: "Sink", stove: "Stove", dishwasher: "Dishwasher", refrigerator: "Refrigerator" };

export function FourAnchorAutoBuildDialog({ open, onOpenChange, onBuild }: Props) {
  const [layoutType, setLayoutType] = useState<FourAnchorLayoutType>("single-wall");
  const [originCorner, setOriginCorner] = useState<FourAnchorOriginCorner>("left");
  const [runDirection, setRunDirection] = useState<FourAnchorRunDirection>("right");
  const [values, setValues] = useState<Record<PointField, { x: string; y: string }>>({
    sink: { x: "24", y: "0" }, stove: { x: "120", y: "0" }, dishwasher: { x: "60", y: "0" }, refrigerator: { x: "84", y: "0" },
  });
  const [windowCenter, setWindowCenter] = useState("");
  const setValue = (field: PointField, axis: "x" | "y", value: string) => setValues((current) => ({ ...current, [field]: { ...current[field], [axis]: value } }));
  const number = (field: PointField) => ({ x: Number(values[field].x), y: Number(values[field].y) });
  const submit = () => {
    onBuild({
      layoutType,
      originCorner,
      runDirection,
      sink: number("sink"),
      stove: number("stove"),
      dishwasher: number("dishwasher"),
      refrigerator: number("refrigerator"),
      sinkWindowCenter: windowCenter.trim() ? { x: Number(windowCenter), y: 0 } : null,
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="four-anchor-auto-build-dialog">
        <DialogHeader>
          <DialogTitle>Admin · Four-anchor auto-build</DialogTitle>
          <DialogDescription>Choose the layout and datum first. Measurements are inches from the selected origin; no missing measurement is guessed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Layout type</Label><Select value={layoutType} onValueChange={(value) => setLayoutType(value as FourAnchorLayoutType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single-wall">Single wall</SelectItem><SelectItem value="galley">Galley</SelectItem><SelectItem value="l-shape">L-shape</SelectItem><SelectItem value="u-shape">U-shape</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Starting corner</Label><Select value={originCorner} onValueChange={(value) => setOriginCorner(value as FourAnchorOriginCorner)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="left">Left corner</SelectItem><SelectItem value="right">Right corner</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Run direction</Label><Select value={runDirection} onValueChange={(value) => setRunDirection(value as FourAnchorRunDirection)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="right">To the right</SelectItem><SelectItem value="left">To the left</SelectItem></SelectContent></Select></div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">Origin: <strong>{originCorner} corner</strong> · Direction: <strong>{runDirection}</strong>. {layoutType === "galley" ? "Galley mode does not require a window-centered sink." : "A window-centered sink is optional; enter its run measurement below when applicable."}</div>
          <div className="grid gap-2">
            <div className="grid grid-cols-[1fr_6rem_6rem] items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Fixed anchor</span><span>Run / X</span><span>Depth / Y</span></div>
            {(Object.keys(labels) as PointField[]).map((field) => <div key={field} className="grid grid-cols-[1fr_6rem_6rem] items-center gap-2"><Label htmlFor={`four-anchor-${field}-x`}>{labels[field]}</Label><Input id={`four-anchor-${field}-x`} type="number" min="0" step="0.125" value={values[field].x} onChange={(event) => setValue(field, "x", event.target.value)} /><Input aria-label={`${labels[field]} depth measurement`} type="number" min="0" step="0.125" value={values[field].y} onChange={(event) => setValue(field, "y", event.target.value)} /></div>)}
          </div>
          {layoutType !== "galley" && <div className="space-y-1.5"><Label htmlFor="four-anchor-window-center">Optional window-centered sink run measurement</Label><Input id="four-anchor-window-center" type="number" min="0" step="0.125" placeholder="Leave blank when not applicable" value={windowCenter} onChange={(event) => setWindowCenter(event.target.value)} /></div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} data-testid="four-anchor-build-submit">Build measured kitchen</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
