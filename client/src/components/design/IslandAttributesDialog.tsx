import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { IslandFace, IslandZone } from "@/lib/design";

type NumericKey = "x" | "y" | "width" | "depth" | "countertopWidth" | "countertopDepth" | "countertopOffsetX" | "countertopOffsetY" | "countertopOverhang";

export type CountertopStructuralLimit = {
  name: string;
  unsupportedOverhangLimitIn: number | null;
} | null;

export type IslandCountertopOption = {
  id: number;
  name: string;
  materialId: string;
  unsupportedOverhangLimitIn: number | null;
};

export function effectiveIslandOverhangIn(island: IslandZone): number {
  const standard = island.countertopOverhang ?? 1.5;
  const widthReveal = island.countertopWidth == null
    ? standard
    : Math.max(0, (island.countertopWidth - island.width) / 2 + Math.abs(Number(island.countertopOffsetX ?? 0)));
  const depthReveal = island.countertopDepth == null
    ? standard
    : Math.max(0, (island.countertopDepth - island.depth) / 2 + Math.abs(Number(island.countertopOffsetY ?? 0)));
  return Math.max(standard, widthReveal, depthReveal);
}

const formatInches = (value: number) => Number(value.toFixed(3)).toString();

export function IslandAttributesDialog({ open, island, countertopMaterial, countertopOptions = [], perimeterCountertopName, cabinetFinishOptions = [], perimeterFinishName, onOpenChange, onApply, onRotate, onRemove }: {
  open: boolean;
  island: IslandZone | null;
  countertopMaterial?: CountertopStructuralLimit;
  countertopOptions?: IslandCountertopOption[];
  perimeterCountertopName?: string | null;
  cabinetFinishOptions?: Array<{ id: number; name: string }>;
  perimeterFinishName?: string | null;
  onOpenChange: (open: boolean) => void;
  onApply: (next: IslandZone) => void;
  onRotate: () => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState<IslandZone | null>(island);
  useEffect(() => setDraft(island ? { ...island } : null), [island, open]);
	  if (!draft) return null;
	  const setNumber = (key: NumericKey, value: string) => {
	    if (value.trim() === "" && (key === "countertopWidth" || key === "countertopDepth" || key === "countertopOverhang")) {
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
		  const effectiveOverhang = effectiveIslandOverhangIn(draft);
		  const selectedCountertopOption = draft.countertopProductId == null
		    ? null
		    : countertopOptions.find((option) => option.id === draft.countertopProductId) ?? null;
		  const effectiveCountertopMaterial = selectedCountertopOption ?? countertopMaterial;
		  const verifiedLimit = effectiveCountertopMaterial?.unsupportedOverhangLimitIn ?? null;
		  const structuralExcess = verifiedLimit == null ? null : Math.max(0, effectiveOverhang - verifiedLimit);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] w-[min(94vw,680px)] gap-3 overflow-y-auto p-4 sm:max-w-[680px] sm:p-5">
        <DialogHeader className="space-y-1">
          <DialogTitle>Island attributes</DialogTitle>
          <DialogDescription>Cabinet runs and countertop coverage update automatically.</DialogDescription>
        </DialogHeader>
	        <details data-testid="island-advanced-dimensions" className="rounded-md border bg-muted/20 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-[#1a2744]">Zone and slab measurements <span className="font-normal text-muted-foreground">— optional</span></summary>
	          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {fields.map(({ key, label, min }) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`island-${key}`} className="text-[11px]">{label} (in.)</Label>
                <Input className="h-8 text-sm" id={`island-${key}`} type="number" step="0.125" min={min} value={draft[key] ?? ""} placeholder={key.startsWith("countertop") ? "Automatic" : undefined} onChange={(event) => setNumber(key, event.target.value)} />
              </div>
            ))}
	          </div>
	        </details>
	        {cabinetFinishOptions.length > 0 && (
          <div data-testid="island-cabinet-finish-control" className="space-y-1.5 rounded-md border border-[#d9c196] bg-[#fff9ed] p-2.5">
            <div className="space-y-1">
              <Label htmlFor="island-cabinet-finish" className="text-xs font-semibold text-[#1a2744]">Island cabinet color</Label>
              <Select
                value={draft.cabinetStyleId == null ? "__match_perimeter__" : String(draft.cabinetStyleId)}
                onValueChange={(value) => setDraft((current) => current ? {
                  ...current,
                  cabinetStyleId: value === "__match_perimeter__" ? null : Number(value),
                } : current)}
              >
                <SelectTrigger id="island-cabinet-finish" data-testid="island-cabinet-finish-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__match_perimeter__">Match non-island cabinets{perimeterFinishName ? ` (${perimeterFinishName})` : ""}</SelectItem>
                  {cabinetFinishOptions.map((finish) => <SelectItem key={finish.id} value={String(finish.id)}>{finish.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-muted-foreground">Island cabinets only.</p>
          </div>
	        )}
	        {countertopOptions.length > 0 && (
          <div data-testid="island-countertop-material-control" className="space-y-1.5 rounded-md border border-[#d9c196] bg-[#fff9ed] p-2.5">
	            <div className="space-y-1">
	              <Label htmlFor="island-countertop-material" className="text-xs font-semibold text-[#1a2744]">Island countertop material</Label>
	              <Select
	                value={draft.countertopProductId == null ? "__match_perimeter__" : String(draft.countertopProductId)}
	                onValueChange={(value) => {
	                  const selected = countertopOptions.find((option) => String(option.id) === value) ?? null;
	                  setDraft((current) => current ? {
	                    ...current,
	                    countertopProductId: selected?.id ?? null,
	                    countertopMaterialId: selected?.materialId ?? null,
	                  } : current);
	                }}
	              >
	                <SelectTrigger id="island-countertop-material" data-testid="island-countertop-material-select"><SelectValue /></SelectTrigger>
	                <SelectContent>
	                  <SelectItem value="__match_perimeter__">Match wall countertops{perimeterCountertopName ? ` (${perimeterCountertopName})` : ""}</SelectItem>
	                  {countertopOptions.map((option) => <SelectItem key={option.id} value={String(option.id)}>{option.name}</SelectItem>)}
	                </SelectContent>
	              </Select>
	            </div>
            <p className="text-[10px] text-muted-foreground">Island slab and waterfall only.</p>
	          </div>
	        )}
	        <div data-testid="island-countertop-overhang-control" className="space-y-1.5 rounded-md border border-[#d9c196] bg-[#fff9ed] p-2.5">
	          <div className="space-y-1">
	            <Label htmlFor="island-countertopOverhang" className="text-xs font-semibold text-[#1a2744]">Standard countertop overhang (in.)</Label>
	            <div className="flex gap-2 sm:items-center">
	              <Input
	                id="island-countertopOverhang"
	                type="number"
	                inputMode="decimal"
	                step="0.125"
	                min="0"
	                max="24"
	                value={draft.countertopOverhang ?? ""}
	                placeholder="Automatic — 1.5"
	                onChange={(event) => setNumber("countertopOverhang", event.target.value)}
	              />
	              <Button className="shrink-0 text-xs" type="button" variant="outline" onClick={() => setDraft((current) => current ? { ...current, countertopOverhang: null } : current)}>Use 1.5 in.</Button>
	            </div>
	          </div>
		          {!effectiveCountertopMaterial ? (
		            <p data-testid="island-overhang-material-unselected" className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">Select a countertop material to check its structural overhang limit.</p>
		          ) : verifiedLimit == null ? (
		            <p data-testid="island-overhang-limit-unverified" className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900"><strong>{effectiveCountertopMaterial.name}</strong> does not yet have a verified unsupported-overhang limit. Confirm support requirements with the supplier or fabricator before approval.</p>
		          ) : structuralExcess != null && structuralExcess > 0.001 ? (
		            <p data-testid="island-overhang-limit-exceeded" role="alert" className="rounded border border-red-400 bg-red-50 px-2 py-1.5 text-[11px] text-red-900">The selected <strong>{formatInches(effectiveOverhang)} in.</strong> overhang exceeds <strong>{effectiveCountertopMaterial.name}</strong>&apos;s verified unsupported limit of <strong>{formatInches(verifiedLimit)} in.</strong> by <strong>{formatInches(structuralExcess)} in.</strong> Reduce the overhang or add fabricator-approved structural support.</p>
		          ) : (
		            <p data-testid="island-overhang-limit-within" className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-900">Selected overhang: <strong>{formatInches(effectiveOverhang)} in.</strong> Verified unsupported limit for <strong>{effectiveCountertopMaterial.name}</strong>: <strong>{formatInches(verifiedLimit)} in.</strong></p>
		          )}
	        </div>
	        <div className="grid gap-2 sm:grid-cols-2">
	          <div className="space-y-1">
	            <Label className="text-xs">Rear seating</Label>
	            <Select value={rearSeatingOverhang} onValueChange={(value) => applyRearSeatingOverhang(value as "automatic" | "12")}>
	            <SelectTrigger data-testid="island-seating-overhang"><SelectValue /></SelectTrigger>
	            <SelectContent>
	              <SelectItem value="automatic">Automatic standard slab</SelectItem>
	              <SelectItem value="12">12 in. behind the back run for seating</SelectItem>
	            </SelectContent>
	            </Select>
	          </div>
          <div className="space-y-1">
            <Label className="text-xs">Active placement face</Label>
            <Select value={draft.activeFace ?? "front"} onValueChange={(value) => setDraft({ ...draft, activeFace: value as IslandFace })}>
	          <SelectTrigger><SelectValue /></SelectTrigger>
	          <SelectContent><SelectItem value="front">Front</SelectItem><SelectItem value="back">Back</SelectItem><SelectItem value="left">Left end</SelectItem><SelectItem value="right">Right end</SelectItem></SelectContent>
	            </Select>
          </div>
        </div>
		<div data-testid="island-waterfall-prompt" className="space-y-1 rounded-md border border-[#d9c196] bg-[#fff9ed] p-2.5">
		  <Label className="text-xs font-semibold text-[#1a2744]">Add a waterfall?</Label>
		  <Select value={draft.waterfallEnd ?? "none"} onValueChange={(value) => setDraft({ ...draft, waterfallEnd: value as "none" | "left" | "right" | "both" })}>
		    <SelectTrigger aria-label="Island waterfall end"><SelectValue /></SelectTrigger>
		    <SelectContent>
		      <SelectItem value="none">No waterfall</SelectItem>
		      <SelectItem value="left">Yes — left end</SelectItem>
		      <SelectItem value="right">Yes — right end</SelectItem>
		      <SelectItem value="both">Yes — both ends</SelectItem>
		    </SelectContent>
		  </Select>
		  <details className="mt-2">
		    <summary className="cursor-pointer text-[10px] text-muted-foreground">Show waterfall preview</summary>
		    <div data-testid="island-waterfall-live-preview" role="status" aria-live="polite" className="mt-2 border border-[#d9c196] bg-white p-2">
		    <div className="mb-2 flex items-center justify-between gap-3">
		      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1a2744]">Live island preview</span>
		      <span className="text-[11px] text-muted-foreground">{draft.waterfallEnd === "left" ? "Waterfall: left end" : draft.waterfallEnd === "right" ? "Waterfall: right end" : draft.waterfallEnd === "both" ? "Waterfall: both ends" : "No waterfall"}</span>
		    </div>
		    <div className="mx-auto flex max-w-[260px] flex-col items-center gap-1">
		      <span className="text-[10px] font-medium text-muted-foreground">Back</span>
		      <div className="relative h-[82px] w-[220px] border-[3px] border-[#d8d1c4] bg-[#f7f4ed]" aria-label="Top-down island preview">
		        <div className="absolute inset-x-2 top-2 h-3 border border-[#d8d1c4] bg-[#e7e0d4]" aria-hidden="true" />
		        <div className="absolute inset-x-2 bottom-2 h-10 border border-[#c9c0b2] bg-[#d7d1c6]" aria-hidden="true" />
		        {(draft.waterfallEnd === "left" || draft.waterfallEnd === "both") && <div aria-label="Left waterfall edge" className="absolute inset-y-[-3px] left-[-3px] w-3 bg-[#a87f33]" />}
		        {(draft.waterfallEnd === "right" || draft.waterfallEnd === "both") && <div aria-label="Right waterfall edge" className="absolute inset-y-[-3px] right-[-3px] w-3 bg-[#a87f33]" />}
		        <span className="absolute -left-10 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground">Left</span>
		        <span className="absolute -right-11 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground">Right</span>
		      </div>
		      <span className="text-[10px] font-medium text-muted-foreground">Front</span>
		    </div>
		    </div>
		  </details>
		</div>
		<div data-testid="island-auto-depth-option" className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-2.5 py-2">
		  <div className="space-y-0.5">
		    <Label htmlFor="island-auto-back-depth" className="text-xs font-semibold">Auto-adjust depth for Back cabinets</Label>
		    <p className="text-[10px] text-muted-foreground">Only grows Back when room clearance allows.</p>
		  </div>
		  <Switch id="island-auto-back-depth" checked={draft.autoAdjustDepthForBackFace === true} onCheckedChange={(enabled) => setDraft((current) => current ? { ...current, autoAdjustDepthForBackFace: enabled } : current)} />
		</div>
		<details data-testid="island-depth-guidance" className="rounded-md border px-3 py-2 text-xs text-[#4a3b22]">
		  <summary className="cursor-pointer font-semibold text-[#1a2744]">Island depth guide</summary>
		  <p className="mt-2"><strong>24 in.</strong> supports one 24-inch base-cabinet run. <strong>36 in.</strong> supports a 24-inch base run opposite a 12-inch wall-cabinet run. <strong>48 in.</strong> supports two 24-inch base runs, or a 36-inch work zone plus a 12-inch rear seating overhang. <strong>60 in.</strong> supports two 24-inch-deep runs plus a 12-inch rear seating overhang.</p>
		</details>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="destructive" onClick={onRemove}>Remove island</Button>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={onRotate}>Rotate 90°</Button><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" onClick={() => onApply(draft)}>Apply</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
