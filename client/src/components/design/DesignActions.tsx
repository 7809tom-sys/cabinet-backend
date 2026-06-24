import { useState } from "react";
import { Save, FolderOpen, Download, Loader2, Clock, Send } from "lucide-react";
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
  // Real height & depth in inches so every line carries a full 3D size.
  heightIn: number;
  depthIn: number;
  placement: string;
  // Door hinge side, e.g. "left" | "right" | "double"; omitted for no-door items.
  swing?: string;
  qty: number;
  unitPrice: number | null;
}

// Human label for the hinge side used on the build sheet.
function swingCell(s: string | undefined): string {
  if (s === "left") return "Left hinge";
  if (s === "right") return "Right hinge";
  if (s === "double") return "Double door";
  return "";
}

// Inch value without trailing zeros (34.5 -> "34.5", 24 -> "24"). Returns ""
// for missing/invalid numbers so the CSV never prints NaN.
function fmtIn(n: number | undefined | null): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// Combined W x H x D size cell for a build-sheet row. Only includes the
// dimensions that are actually known.
function sizeCell(r: BuildSheetRow): string {
  const w = fmtIn(r.widthIn);
  const h = fmtIn(r.heightIn);
  const d = fmtIn(r.depthIn);
  if (!w && !h && !d) return "";
  return `${w || "?"}\"W x ${h || "?"}\"H x ${d || "?"}\"D`;
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
  // Current room context for Master Project grouping.
  roomType: string;
  // Contact email for the designer (from the email gate / signed-in user). Used
  // to pre-fill a CRM quote request.
  contactEmail?: string | null;
  onLoad: (d: {
    room: RoomData;
    placed: PlacedCabinet[];
    styleId: number | null;
    roomType?: string | null;
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
  const header = ["Item Code", "Description", "Size (W x H x D)", "W (in)", "H (in)", "D (in)", "Type", "Swing", "Qty", "Unit Price", "Line Total"];
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
      r.code, r.description, sizeCell(r),
      fmtIn(r.widthIn), fmtIn(r.heightIn), fmtIn(r.depthIn),
      r.placement, swingCell(r.swing), r.qty,
      r.unitPrice != null ? r.unitPrice.toFixed(2) : "", lineTotal,
    ].map(csvEscape).join(","));
  }
  for (const e of extraLines) {
    lines.push([e.label, e.detail, "", "", "", "", "", "", "", "", "incl."].map(csvEscape).join(","));
  }
  lines.push("");
  lines.push(`Estimated Total,,,,,,,,,,${total.toFixed(2)}`);
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

// A saved design row as returned by trpc.design.myDesigns (loosely typed here
// since only a subset of fields is used in the picker).
type SavedDesignRow = {
  id: number;
  name: string;
  updatedAt: string | number | Date;
  placedCabinets?: unknown;
  roomData?: unknown;
  selectedStyleId?: number | null;
  projectName?: string | null;
  roomLabel?: string | null;
  roomType?: string | null;
};

interface ProjectGroup {
  key: string;
  projectName: string | null;
  rooms: SavedDesignRow[];
}

// Group saved designs by projectName. Designs without a project fall into a
// single trailing "ungrouped" bucket (projectName = null). Project order follows
// the most-recently-updated room within each project.
export function groupByProject(rows: SavedDesignRow[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  for (const r of rows) {
    const proj = (r.projectName ?? "").trim();
    const key = proj ? `p:${proj}` : "__ungrouped__";
    let g = groups.get(key);
    if (!g) {
      g = { key, projectName: proj || null, rooms: [] };
      groups.set(key, g);
    }
    g.rooms.push(r);
  }
  const ts = (r: SavedDesignRow) => new Date(r.updatedAt).getTime();
  const arr = Array.from(groups.values());
  for (const g of arr) g.rooms.sort((a, b) => ts(b) - ts(a));
  arr.sort((a, b) => {
    // Ungrouped bucket always last; otherwise newest project first.
    if (a.projectName === null) return 1;
    if (b.projectName === null) return -1;
    return ts(b.rooms[0]) - ts(a.rooms[0]);
  });
  return arr;
}

export function DesignActions({
  room, placed, styleId, styleName, tier, total, extraLines, buildRows, roomType, contactEmail, onLoad,
}: Props) {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [name, setName] = useState("");
  // Master Project grouping (optional): a job name + a room label.
  const [projectName, setProjectName] = useState("");
  const [roomLabel, setRoomLabel] = useState("");
  // When checked, after saving we create a CRM lead (house deal) for the team.
  const [requestQuote, setRequestQuote] = useState(false);

  const quoteMutation = trpc.crm.requestQuoteFromDesign.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.reused ? "Already sent to your rep" : "Sent to a Cabinet Dealz rep",
        { description: "A specialist will follow up with your quote." },
      );
    },
    onError: (e) =>
      toast.error("Saved, but could not request a quote", { description: e.message }),
  });

  const saveMutation = trpc.design.save.useMutation({
    onSuccess: (res) => {
      toast.success("Design saved", { description: name || "Untitled kitchen" });
      setSaveOpen(false);
      setName("");
      utils.design.myDesigns.invalidate();
      // Optionally route this saved design to the sales pipeline.
      if (requestQuote && res?.id) {
        quoteMutation.mutate({
          designId: res.id,
          contactEmail: contactEmail ?? null,
          estimatedValue: total > 0 ? total : null,
        });
      }
      setRequestQuote(false);
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
    const proj = projectName.trim();
    const rlabel = roomLabel.trim();
    saveMutation.mutate({
      name: name.trim() || rlabel || proj || "Untitled design",
      roomData: room,
      placedCabinets: placed,
      selectedStyleId: styleId ?? undefined,
      projectName: proj || undefined,
      roomLabel: rlabel || undefined,
      roomType: roomType || undefined,
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
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="design-name" className="text-sm">Design name</Label>
              <Input
                id="design-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maple Street kitchen"
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                autoFocus
              />
            </div>
            <div className="rounded-lg border border-dashed border-border p-3 space-y-2.5 bg-muted/20">
              <p className="text-[11px] font-semibold text-foreground">
                Master Project <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Group several rooms (kitchen, baths, laundry) under one job to get a combined bill of materials.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="project-name" className="text-[11px]">Project / job</Label>
                  <Input
                    id="project-name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="123 Oak St — Whole Home"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="room-label" className="text-[11px]">Room in project</Label>
                  <Input
                    id="room-label"
                    value={roomLabel}
                    onChange={(e) => setRoomLabel(e.target.value)}
                    placeholder="Master Bath"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
            {isAuthenticated && (
              <label
                htmlFor="request-quote"
                className="flex items-start gap-2 rounded-lg border border-border p-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <input
                  id="request-quote"
                  type="checkbox"
                  checked={requestQuote}
                  onChange={(e) => setRequestQuote(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="text-[11px] leading-snug">
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Send className="h-3 w-3" /> Send to a Cabinet Dealz rep for a quote
                  </span>
                  <span className="text-muted-foreground">
                    Creates a follow-up in our sales pipeline with this design attached
                    {total > 0 ? ` (est. $${total.toLocaleString()})` : ""}.
                  </span>
                </span>
              </label>
            )}
            {!isAuthenticated && (
              <p className="text-[11px] text-muted-foreground">
                Tip: sign in to see all your saved designs under “My Designs” on any device, and to request a quote from a rep.
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
            <div className="max-h-80 overflow-y-auto space-y-3">
              {groupByProject(myDesigns.data).map((group) => (
                <div key={group.key}>
                  {group.projectName && (
                    <div className="flex items-center gap-1.5 px-1 pb-1">
                      <FolderOpen className="h-3.5 w-3.5 text-[#a87f33]" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                        {group.projectName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {group.rooms.length} room{group.rooms.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  )}
                  <div className={`space-y-1.5 ${group.projectName ? "pl-2 border-l-2 border-[#a87f33]/30" : ""}`}>
                    {group.rooms.map((d) => {
                      const items = Array.isArray(d.placedCabinets) ? d.placedCabinets.length : 0;
                      const rType = (d as { roomType?: string | null }).roomType;
                      const rLabel = (d as { roomLabel?: string | null }).roomLabel;
                      return (
                        <button
                          key={d.id}
                          className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            onLoad({
                              room: (d.roomData as RoomData) ?? room,
                              placed: (d.placedCabinets as PlacedCabinet[]) ?? [],
                              styleId: d.selectedStyleId ?? null,
                              roomType: rType ?? null,
                            });
                            setLoadOpen(false);
                            toast.success(`Loaded "${d.name}"`);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{rLabel || d.name}</span>
                            {rType && (
                              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
                                {rType}
                              </span>
                            )}
                          </div>
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
                </div>
              ))}
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
