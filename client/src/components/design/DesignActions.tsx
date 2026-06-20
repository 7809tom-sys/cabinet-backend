import { useState } from "react";
import { Save, FolderOpen, Download, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import type { PlacedCabinet, RoomData } from "@/lib/design";

// ─────────────────────────────────────────────────────────────────────────────
// DesignActions
// Save the current kitchen design, reload a previously saved one, and export an
// itemized build sheet (CSV). No supplier/line identity is included anywhere.
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildSheetRow {
  code: string;
  description: string;
  widthIn: number;
  placement: string;
  qty: number;
  unitPrice: number | null;
}

interface Props {
  room: RoomData;
  placed: PlacedCabinet[];
  styleId: number | null;
  styleName: string | null;
  tier: "Wholesale" | "Contractor";
  total: number;
  // Extra non-cabinet lines (fillers, crown, toe kick, countertop) for export.
  extraLines: { label: string; detail: string }[];
  buildRows: BuildSheetRow[];
  onLoad: (d: {
    room: RoomData;
    placed: PlacedCabinet[];
    styleId: number | null;
  }) => void;
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Build + download the itemized CSV build sheet. Exported so both the toolbar
// action and the pricing-panel button share one implementation.
export interface BuildSheetArgs {
  room: RoomData;
  styleName: string | null;
  tier: "Wholesale" | "Contractor";
  total: number;
  buildRows: BuildSheetRow[];
  extraLines: { label: string; detail: string }[];
}

// Pure: build the CSV text for a design build sheet. No DOM / side effects so it
// can be unit-tested directly. Returns null if there are no cabinet rows.
export function buildSheetCsv(args: BuildSheetArgs): string | null {
  const { room, styleName, tier, total, buildRows, extraLines } = args;
  if (buildRows.length === 0) return null;
  const header = ["Item Code", "Description", "Width (in)", "Type", "Qty", "Unit Price", "Line Total"];
  const lines: string[] = [];
  lines.push(`Cabinet Dealz Build Sheet`);
  lines.push(`Door Style:,${csvEscape(styleName ?? "(not selected)")}`);
  lines.push(`Pricing Tier:,${csvEscape(tier)}`);
  lines.push(`Room:,${csvEscape(`${room.width}in x ${room.depth}in`)}`);
  lines.push("");
  lines.push(header.map(csvEscape).join(","));
  for (const r of buildRows) {
    const lineTotal = r.unitPrice != null ? (r.unitPrice * r.qty).toFixed(2) : "";
    lines.push([
      r.code, r.description, Math.round(r.widthIn), r.placement, r.qty,
      r.unitPrice != null ? r.unitPrice.toFixed(2) : "", lineTotal,
    ].map(csvEscape).join(","));
  }
  for (const e of extraLines) {
    lines.push([e.label, e.detail, "", "", "", "", "incl."].map(csvEscape).join(","));
  }
  lines.push("");
  lines.push(`Estimated Total,,,,,,${total.toFixed(2)}`);
  return lines.join("\n");
}

export function exportBuildSheet(args: BuildSheetArgs): boolean {
  const csv = buildSheetCsv(args);
  if (csv == null) {
    toast.error("Add cabinets before exporting.");
    return false;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cabinet-dealz-build-sheet-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success("Build sheet exported", { description: `${args.buildRows.length} line items` });
  return true;
}

export function DesignActions({
  room, placed, styleId, styleName, tier, total, extraLines, buildRows, onLoad,
}: Props) {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [name, setName] = useState("");

  const saveMutation = trpc.design.save.useMutation({
    onSuccess: () => {
      toast.success("Design saved", { description: name || "Untitled kitchen" });
      setSaveOpen(false);
      setName("");
      utils.design.myDesigns.invalidate();
    },
    onError: (e) => toast.error("Could not save design", { description: e.message }),
  });

  // Only logged-in users can list their saved designs (protected procedure).
  const myDesigns = trpc.design.myDesigns.useQuery(undefined, {
    enabled: isAuthenticated && loadOpen,
    retry: false,
  });

  const handleSave = () => {
    if (placed.length === 0) {
      toast.error("Add cabinets before saving.");
      return;
    }
    saveMutation.mutate({
      name: name.trim() || "Untitled kitchen",
      roomData: room,
      placedCabinets: placed,
      selectedStyleId: styleId ?? undefined,
    });
  };

  const handleExport = () =>
    exportBuildSheet({ room, styleName, tier, total, buildRows, extraLines });

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setSaveOpen(true)}>
        <Save className="h-3.5 w-3.5" /> Save
      </Button>
      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setLoadOpen(true)}>
        <FolderOpen className="h-3.5 w-3.5" /> My Designs
      </Button>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save kitchen design</DialogTitle>
            <DialogDescription>
              Name this layout so you can reopen and re-price it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="design-name" className="text-sm">Design name</Label>
            <Input
              id="design-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maple Street kitchen"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              autoFocus
            />
            {!isAuthenticated && (
              <p className="text-[11px] text-muted-foreground">
                Tip: sign in to see all your saved designs under “My Designs” on any device.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-1.5">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save design
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* My designs dialog */}
      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>My saved designs</DialogTitle>
            <DialogDescription>Open a saved layout to keep editing.</DialogDescription>
          </DialogHeader>

          {!isAuthenticated ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Sign in to view designs saved to your account.
            </div>
          ) : myDesigns.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" /> Loading…
            </div>
          ) : myDesigns.isError ? (
            <div className="py-6 text-center text-sm text-destructive">
              Couldn’t load your designs.
              <div className="mt-2">
                <Button variant="outline" size="sm" onClick={() => myDesigns.refetch()}>Retry</Button>
              </div>
            </div>
          ) : !myDesigns.data || myDesigns.data.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No saved designs yet.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {myDesigns.data.map((d) => {
                const items = Array.isArray(d.placedCabinets) ? d.placedCabinets.length : 0;
                return (
                  <button
                    key={d.id}
                    className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      onLoad({
                        room: (d.roomData as RoomData) ?? room,
                        placed: (d.placedCabinets as PlacedCabinet[]) ?? [],
                        styleId: d.selectedStyleId ?? null,
                      });
                      setLoadOpen(false);
                      toast.success(`Loaded "${d.name}"`);
                    }}
                  >
                    <div className="font-medium text-sm">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span>{items} item{items === 1 ? "" : "s"}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(d.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export build sheet — replaces the placeholder cart action */}
      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleExport}>
        <Download className="h-3.5 w-3.5" /> Export
      </Button>
    </>
  );
}
