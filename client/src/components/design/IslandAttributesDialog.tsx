import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { IslandFace, IslandZone } from "@/lib/design";

type NumericKey = "x" | "y" | "width" | "depth" | "countertopWidth" | "countertopDepth" | "countertopOffsetX" | "countertopOffsetY";

export function IslandAttributesDialog({ open, island, onOpenChange, onApply, onRotate, onRemove }: {
  open: boolean;
  island: IslandZone | null;
  onOpenChange: (open: boolean) => void;
  onApply: (next: IslandZone) => void;
  onRotate: () => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState<IslandZone | null>(island);
  useEffect(() => setDraft(island ? { ...island } : null), [island, open]);
	  if (!draft) return null;
	  const setNumber = (key: NumericKey, value: string) => {
	    if (value.trim() === "" && (key === "countertopWidth" || key === "countertopDepth")) {
	      setDraft((current) => current ? { ...current, [key]: null } : current);
	      return;
	    }
	    const number = Number(value);
    if (Number.isFinite(number)) setDraft((current) => current ? { ...current, [key]: number } : current);
  };
	  const fields: Array<{ key: NumericKey; label: string; min?: number }> = [
	    { key: "x", label: "Left position", min: 0 },
    { key: "y", label: "Back position", min: 0 },
    { key: "width", label: "Work-zone width", min: 12 },
    { key: "depth", label: "Work-zone depth", min: 12 },
    { key: "countertopWidth", label: "Slab left-to-right", min: 1 },
    { key: "countertopDepth", label: "Slab front-to-back", min: 1 },
    { key: "countertopOffsetX", label: "Slab left/right offset" },
	    { key: "countertopOffsetY", label: "Slab front/back offset" },
	  ];
	  const applyRearSeatingOverhang = (value: "automatic" | "12") => {
	    if (value === "automatic") {
	      setDraft((current) => current ? { ...current, countertopDepth: null, countertopOffsetY: 0, countertopDepthAnchoredToZone: false } : current);
	      return;
	    }
	    // The work zone remains the authoritative cabinet envelope. A seating
	    // option expands only the continuous countertop 12 inches behind its
	    // back run; it never adds, moves, or changes a cabinet.
	    setDraft((current) => current ? {
	      ...current,
	      countertopDepth: current.depth + 12,
	      countertopOffsetY: -6,
	      countertopDepthAnchoredToZone: true,
	    } : current);
	  };
	  const rearSeatingOverhang = draft.countertopDepth != null
	    && Math.abs(draft.countertopDepth - (draft.depth + 12)) < 0.01
	    && Math.abs(Number(draft.countertopOffsetY ?? 0) + 6) < 0.01
	    && draft.countertopDepthAnchoredToZone === true
	    ? "12"
	    : "automatic";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[min(94vw,720px)] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Island attributes</DialogTitle>
          <DialogDescription>The dashed work zone has no solid base. Real cabinets build four independent runs; one continuous slab is generated automatically and remains editable.</DialogDescription>
        </DialogHeader>
	        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {fields.map(({ key, label, min }) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`island-${key}`} className="text-xs">{label} (in.)</Label>
              <Input id={`island-${key}`} type="number" step="0.125" min={min} value={draft[key] ?? ""} placeholder={key.startsWith("countertop") ? "Automatic" : undefined} onChange={(event) => setNumber(key, event.target.value)} />
            </div>
	          ))}
	        </div>
	        <div data-testid="island-depth-guidance" className="space-y-2 rounded-lg border border-[#d9c196] bg-[#fff9ed] p-3 text-xs text-[#4a3b22]">
	          <p className="font-semibold text-[#1a2744]">Island depth guide</p>
	          <p><strong>24 in.</strong> supports one 24-inch base-cabinet run. <strong>36 in.</strong> supports a 24-inch base run opposite a 12-inch wall-cabinet run. <strong>48 in.</strong> supports two 24-inch base runs, or a 36-inch cabinet work zone plus a 12-inch rear seating overhang. <strong>60 in.</strong> supports two 24-inch-deep cabinet runs plus a 12-inch rear seating overhang.</p>
	          <p className="text-[11px] text-muted-foreground">Cabinets on each face must still add up to that face’s selected width; the designer keeps all cabinet runs edge-to-edge with no overlap.</p>
	        </div>
	        <div className="space-y-1">
	          <Label className="text-xs">Rear seating countertop overhang</Label>
	          <Select value={rearSeatingOverhang} onValueChange={(value) => applyRearSeatingOverhang(value as "automatic" | "12")}>
	            <SelectTrigger data-testid="island-seating-overhang"><SelectValue /></SelectTrigger>
	            <SelectContent>
	              <SelectItem value="automatic">Automatic standard slab</SelectItem>
	              <SelectItem value="12">12 in. behind the back run for seating</SelectItem>
	            </SelectContent>
	          </Select>
	          <p className="text-[11px] text-muted-foreground">For a finished 48-inch seating island, set the cabinet work zone to 36 inches deep, then choose the 12-inch rear overhang. For a finished 60-inch seating island, use a 48-inch cabinet work zone plus this overhang.</p>
	        </div>
        <div className="space-y-1">
          <Label className="text-xs">Active placement face</Label>
          <Select value={draft.activeFace ?? "front"} onValueChange={(value) => setDraft({ ...draft, activeFace: value as IslandFace })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="front">Front</SelectItem><SelectItem value="back">Back</SelectItem><SelectItem value="left">Left end</SelectItem><SelectItem value="right">Right end</SelectItem></SelectContent>
          </Select>
        </div>
		<div data-testid="island-waterfall-prompt" className="space-y-1 rounded-lg border border-[#d9c196] bg-[#fff9ed] p-3">
		  <Label className="text-xs font-semibold text-[#1a2744]">Add a waterfall?</Label>
		  <Select value={draft.waterfallEnd ?? "none"} onValueChange={(value) => setDraft({ ...draft, waterfallEnd: value as "none" | "left" | "right" })}>
		    <SelectTrigger aria-label="Island waterfall end"><SelectValue /></SelectTrigger>
		    <SelectContent>
		      <SelectItem value="none">No waterfall</SelectItem>
		      <SelectItem value="left">Yes — left end</SelectItem>
		      <SelectItem value="right">Yes — right end</SelectItem>
		    </SelectContent>
		  </Select>
		  <p className="text-[11px] text-muted-foreground">A full-height countertop panel is added to this physical island end using the active countertop material.</p>
		</div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="destructive" onClick={onRemove}>Remove island</Button>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={onRotate}>Rotate 90°</Button><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" onClick={() => onApply(draft)}>Apply</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
