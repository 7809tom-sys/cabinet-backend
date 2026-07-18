import { useState, useEffect } from "react";
import { Save, FolderOpen, Download, Loader2, Clock, Send, Calculator, Printer, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
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
  // The specific door style / finish this line is in (important for two-tone
  // designs where different cabinets carry different colors). Optional.
  color?: string | null;
  qty: number;
  unitPrice: number | null;
  // Per-item discount (negative) or surcharge (positive) percentage. Null = no adjustment.
  discountPct?: number | null;
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
  // Pelican surface & fixture picks chosen in the Surfaces tab; persisted so a
  // reloaded design restores its exact surfaces.
  selectedSurfaces: unknown[];
  styleId: number | null;
  // Locked supply line (distributor) for this design, or null when unlocked.
  lockedDistributorId: number | null;
  styleName: string | null;
  tier: "Wholesale" | "Contractor" | "Homeowner";
  total: number;
  // Extra non-cabinet lines (fillers, crown, toe kick, countertop) for export.
  extraLines: { label: string; detail: string }[];
  buildRows: BuildSheetRow[];
  // Current room context for Master Project grouping.
  roomType: string;
  // Contact email for the designer (from the email gate / signed-in user). Used
  // to pre-fill a CRM quote request.
  contactEmail?: string | null;
  // Incrementing signals from a parent (e.g. the mobile "More" sheet) to open the
  // Save / My Plans dialogs without the parent needing access to internal state.
  openSaveSignal?: number;
  openLoadSignal?: number;
  /** Called after a design is successfully saved (after the user confirms in the dialog). */
  onSaveSuccess?: (designName: string) => void;
  onLoad: (d: {
    room: RoomData;
    placed: PlacedCabinet[];
    styleId: number | null;
    distributorId?: number | null;
    roomType?: string | null;
    selectedSurfaces?: unknown[] | null;
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
  tier: "Wholesale" | "Contractor" | "Homeowner";
  total: number;
  buildRows: BuildSheetRow[];
  extraLines: { label: string; detail: string }[];
}

// Pure: build the CSV text for a design build sheet. No DOM / side effects so it
// can be unit-tested directly. Returns null if there are no cabinet rows.
export function buildSheetCsv(args: BuildSheetArgs): string | null {
  const { room, styleName, tier, total, buildRows, extraLines } = args;
  if (buildRows.length === 0) return null;
  const header = ["Item Code", "Description", "Color / Finish", "Size (W x H x D)", "W (in)", "H (in)", "D (in)", "Type", "Swing", "Qty", "Unit Price", "Adj %", "Line Total"];
  const lines: string[] = [];
  lines.push(`Cabinet Dealz Build Sheet`);
  lines.push(`Door Style:,${csvEscape(styleName ?? "(not selected)")}`);
  lines.push(`Pricing Tier:,${csvEscape(tier)}`);
  lines.push(`Room:,${csvEscape(`${room.width}in x ${room.depth}in`)}`);
  lines.push("");
  lines.push(header.map(csvEscape).join(","));
  for (const r of buildRows) {
    const disc = r.discountPct ?? 0;
    const rawLine = r.unitPrice != null ? r.unitPrice * r.qty : null;
    const lineTotal = rawLine != null ? (rawLine * (1 + disc / 100)).toFixed(2) : "";
    const adjStr = disc !== 0 ? `${disc > 0 ? "+" : ""}${disc}%` : "";
    lines.push([
      r.code, r.description, r.color ?? "", sizeCell(r),
      fmtIn(r.widthIn), fmtIn(r.heightIn), fmtIn(r.depthIn),
      r.placement, swingCell(r.swing), r.qty,
      r.unitPrice != null ? r.unitPrice.toFixed(2) : "", adjStr, lineTotal,
    ].map(csvEscape).join(","));
  }
  for (const e of extraLines) {
    lines.push([e.label, e.detail, "", "", "", "", "", "", "", "", "", "", "incl."].map(csvEscape).join(","));
  }
  lines.push("");
  lines.push(`Estimated Total,,,,,,,,,,,,${total.toFixed(2)}`);
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
  toast.success("Build sheet exported", { description: `${args.buildRows.length} line items` }); // CSV export stays English (machine-readable)
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
  selectedSurfaces?: unknown;
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

// Build + download a combined project CSV: one block per room + a grand total.
function downloadProjectCsv(
  projectName: string,
  summary: {
    rooms: { name: string; roomLabel: string | null; roomType: string | null; styleName: string | null; cabinetCount: number; subtotal: number }[];
    grandTotal: number;
  },
) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push(`Project:,${esc(projectName)}`);
  lines.push(`Rooms:,${summary.rooms.length}`);
  lines.push("");
  lines.push(["Room", "Type", "Door Style", "Cabinets", "Estimated Subtotal"].map(esc).join(","));
  for (const r of summary.rooms) {
    lines.push([
      r.roomLabel || r.name,
      r.roomType ?? "",
      r.styleName ?? "(not selected)",
      r.cabinetCount,
      r.subtotal.toFixed(2),
    ].map(esc).join(","));
  }
  lines.push("");
  lines.push(["", "", "", "Project Total", summary.grandTotal.toFixed(2)].map(esc).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cabinet-dealz-project-${projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success("Project bill of materials exported", { description: `${summary.rooms.length} rooms` });
}

// Per-project totals expander used inside the My Designs dialog. Lazily queries
// the roll-up only when opened.
function ProjectTotals({ projectName }: { projectName: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const summary = trpc.design.projectSummary.useQuery(
    { projectName },
    { enabled: open },
  );
  return (
    <div className="px-1 pb-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[10px] font-medium text-[#a87f33] hover:underline"
      >
        <Calculator className="h-3 w-3" /> {open ? t("dt_act_hide") : t("dt_act_view")} {t("dt_act_project_total_link")}
      </button>
      {open && (
        <div className="mt-1.5 rounded-md bg-muted/40 p-2 text-[11px]">
          {summary.isLoading ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {t("dt_act_calculating")}
            </div>
          ) : summary.data ? (
            <>
              <div className="space-y-0.5">
                {summary.data.rooms.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">
                      {r.roomLabel || r.name}
                    </span>
                    <span className="tabular-nums">${r.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1.5 font-semibold">
                <span>{t("dt_act_project_total")}</span>
                <span className="tabular-nums">${summary.data.grandTotal.toFixed(2)}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 w-full gap-1.5 text-[11px]"
                onClick={() => downloadProjectCsv(projectName, summary.data!)}
              >
                <Download className="h-3 w-3" /> {t("dt_act_download_project_csv")}
              </Button>
              <p className="mt-1 text-[9px] leading-tight text-muted-foreground">
                {t("dt_act_project_pricing_note")}
              </p>
            </>
          ) : (
            <span className="text-muted-foreground">{t("dt_act_no_totals")}</span>
          )}
        </div>
      )}
    </div>
  );
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
  room, placed, selectedSurfaces, styleId, lockedDistributorId, styleName, tier, total, extraLines, buildRows, roomType, contactEmail, openSaveSignal, openLoadSignal, onSaveSuccess, onLoad,
}: Props) {
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const utils = trpc.useUtils();
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [name, setName] = useState("");
  // Customer/House this plan is for (the CRM contact + grouping key). A homeowner
  // can leave it blank (their own project); a contractor names the customer/house.
  const [customerName, setCustomerName] = useState("");
  // Master Project grouping (optional): a job name + a room label.
  const [projectName, setProjectName] = useState("");
  const [roomLabel, setRoomLabel] = useState("");
  // Open the Save / My Plans dialogs when a parent bumps the signal (mobile menu).
  useEffect(() => { if (openSaveSignal) setSaveOpen(true); }, [openSaveSignal]);
  useEffect(() => { if (openLoadSignal) setLoadOpen(true); }, [openLoadSignal]);
  // When checked, after saving we create a CRM lead (house deal) for the team.
  const [requestQuote, setRequestQuote] = useState(false);

  const quoteMutation = trpc.crm.requestQuoteFromDesign.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.reused ? t("dt_act_quote_reused") : t("dt_act_quote_sent"),
        { description: t("dt_act_quote_desc") },
      );
    },
    onError: (e) =>
      toast.error(t("dt_act_quote_err"), { description: e.message }),
  });

  const saveMutation = trpc.design.save.useMutation({
    onSuccess: (res) => {
      const savedName = name || t("dt_act_saved_untitled");
      toast.success(t("dt_act_saved"), { description: savedName });
      onSaveSuccess?.(savedName);
      setSaveOpen(false);
      setName("");
      utils.design.myDesigns.invalidate();
      // Optionally route this saved design to the sales pipeline.
      if (requestQuote && res?.id) {
        quoteMutation.mutate({
          designId: res.id,
          contactName: customerName.trim() || null,
          contactEmail: contactEmail ?? null,
          estimatedValue: total > 0 ? total : null,
        });
      }
      setRequestQuote(false);
      setCustomerName("");
    },
    onError: (e) => toast.error(t("dt_act_save_err"), { description: e.message }),
  });

  // Only logged-in users can list their saved designs (protected procedure).
  const myDesigns = trpc.design.myDesigns.useQuery(undefined, {
    enabled: isAuthenticated && loadOpen,
    retry: false,
  });

  const handleSave = () => {
    if (placed.length === 0) {
      toast.error(t("dt_act_err_save_empty"));
      return;
    }
    const proj = projectName.trim();
    const rlabel = roomLabel.trim();
    saveMutation.mutate({
      name: name.trim() || rlabel || proj || t("dt_act_untitled_design"),
      roomData: room,
      placedCabinets: placed,
      selectedSurfaces,
      selectedStyleId: styleId ?? undefined,
      selectedDistributorId: lockedDistributorId ?? undefined,
      projectName: proj || undefined,
      roomLabel: rlabel || undefined,
      roomType: roomType || undefined,
    });
  };

  const handleExport = () =>
    exportBuildSheet({ room, styleName, tier, total, buildRows, extraLines });

  return (
    <>
      <Button variant="outline" size="icon" className="h-9 w-9" title={t("dt_act_save_btn")} onClick={() => setSaveOpen(true)}>
        <Save className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="h-9 w-9" title={t("dt_act_my_designs_btn")} onClick={() => setLoadOpen(true)}>
        <FolderOpen className="h-4 w-4" />
      </Button>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dt_act_save_title")}</DialogTitle>
            <DialogDescription>
              {t("dt_act_save_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="design-name" className="text-sm">{t("dt_act_design_name")}</Label>
              <Input
                id="design-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("dt_act_design_name_ph")}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-name" className="text-sm">{t("dt_act_customer_name")}</Label>
              <Input
                id="customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t("dt_act_customer_name_ph")}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
              <p className="text-[11px] text-muted-foreground">{t("dt_act_customer_name_hint")}</p>
            </div>
            <div className="rounded-lg border border-dashed border-border p-3 space-y-2.5 bg-muted/20">
              <p className="text-[11px] font-semibold text-foreground">
                {t("dt_act_master_project")} <span className="font-normal text-muted-foreground">{t("dt_act_optional")}</span>
              </p>
              <p className="text-[11px] text-muted-foreground -mt-1">
                {t("dt_act_master_project_desc")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="project-name" className="text-[11px]">{t("dt_act_customer_house")}</Label>
                  <Input
                    id="project-name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder={t("dt_act_project_job_ph")}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="room-label" className="text-[11px]">{t("dt_act_room_plan")}</Label>
                  <Input
                    id="room-label"
                    value={roomLabel}
                    onChange={(e) => setRoomLabel(e.target.value)}
                    placeholder={t("dt_act_room_in_project_ph")}
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
                    <Send className="h-3 w-3" /> {t("dt_act_send_rep")}
                  </span>
                  <span className="text-muted-foreground">
                    {t("dt_act_send_rep_desc")}
                    {total > 0 ? t("dt_act_send_rep_est", { total: total.toLocaleString() }) : "."}
                  </span>
                </span>
              </label>
            )}
            {!isAuthenticated && (
              <p className="text-[11px] text-muted-foreground">
                {t("dt_act_signin_tip")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>{t("dt_act_cancel")}</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-1.5">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("dt_act_save_design")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* My designs dialog */}
      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dt_act_my_saved_title")}</DialogTitle>
            <DialogDescription>{t("dt_act_my_saved_desc")}</DialogDescription>
          </DialogHeader>

          {!isAuthenticated ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
              {t("dt_act_signin_to_view")}
            </div>
          ) : myDesigns.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" /> {t("dt_act_loading")}
            </div>
          ) : myDesigns.isError ? (
            <div className="py-6 text-center text-sm text-destructive">
              {t("dt_act_load_err")}
              <div className="mt-2">
                <Button variant="outline" size="sm" onClick={() => myDesigns.refetch()}>{t("dt_act_retry")}</Button>
              </div>
            </div>
          ) : !myDesigns.data || myDesigns.data.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t("dt_act_no_saved")}
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
                        {group.rooms.length} {group.rooms.length === 1 ? t("dt_act_room_one") : t("dt_act_room_many")}
                      </span>
                    </div>
                  )}
                  {group.projectName && <ProjectTotals projectName={group.projectName} />}
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
                              distributorId: (d as { selectedDistributorId?: number | null }).selectedDistributorId ?? null,
                              roomType: rType ?? null,
                              selectedSurfaces: Array.isArray(d.selectedSurfaces) ? d.selectedSurfaces : null,
                            });
                            setLoadOpen(false);
                            toast.success(t("dt_act_loaded", { name: d.name }));
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
                              <span>{items} {items === 1 ? t("dt_act_item_one") : t("dt_act_item_many")}</span>
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

      {/* Export build sheet */}
      <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleExport} title={t("dt_act_export_btn")}>
        <Download className="h-3.5 w-3.5" />
      </Button>
      {/* Print Presentation */}
      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => window.open("/design/presentation", "_blank")} title={t("dt_act_presentation_btn")}>
        <Printer className="h-3.5 w-3.5" />
      </Button>
      {/* Fabricator Countertop Sheet */}
      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => window.open("/design/fabricator-sheet", "_blank")} title={t("dt_act_fabricator_btn")}>
        <Ruler className="h-3.5 w-3.5" />
      </Button>
    </>
  );
}
