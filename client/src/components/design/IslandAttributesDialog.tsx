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
        <div className="space-y-1">
          <Label className="text-xs">Active placement face</Label>
          <Select value={draft.activeFace ?? "front"} onValueChange={(value) => setDraft({ ...draft, activeFace: value as IslandFace })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="front">Front</SelectItem><SelectItem value="back">Back</SelectItem><SelectItem value="left">Left end</SelectItem><SelectItem value="right">Right end</SelectItem></SelectContent>
          </Select>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="destructive" onClick={onRemove}>Remove island</Button>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={onRotate}>Rotate 90°</Button><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" onClick={() => onApply(draft)}>Apply</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
