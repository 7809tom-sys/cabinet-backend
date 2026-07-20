import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, ChevronLeft, ChevronRight, Settings2, CheckCircle2, Upload, ImageIcon, Sparkles, Pencil, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────
const STANDARD_DEPTHS = ["9", "12", "15", "18", "21", "24", "27", "30", "33", "36"];
const DOOR_OPTIONS = [null, 0, 1, 2, 3, 4] as const;
const DRAWER_OPTIONS = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
const SHELF_OPTIONS = [null, 0, 1, 2, 3, 4, 5, 6] as const;
const PAGE_SIZE = 50;

type CabinetRow = {
  id: number;
  masterCode: string | null;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  width: string | null;
  height: string | null;
  depth: string | null;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
  numberOfFixedShelves: number | null;
  numberOfAdjShelves: number | null;
  isNotCabinet: boolean | null;
  catalogImageUrl: string | null;
  weight: string | null;
  physicalWidth: string | null;
  pkgLength: string | null;
  pkgWidth: string | null;
  pkgHeight: string | null;
  pkgWeight: string | null;
};

// ─── Dim Input ────────────────────────────────────────────────────────────────
function DimInput({
  label,
  value,
  onChange,
  unit = '"',
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          className="pr-6 h-8 text-sm"
          placeholder="—"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
          disabled={disabled}
          inputMode="decimal"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          {unit}
        </span>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({
  row,
  open,
  onClose,
  onSaved,
}: {
  row: CabinetRow;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Partial<CabinetRow>) => void;
}) {
  const [draft, setDraft] = useState<Partial<CabinetRow>>({});
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [newAlias, setNewAlias] = useState({ raw: "", platform: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const merged: CabinetRow = { ...row, ...draft };

  const set = (field: keyof CabinetRow, value: unknown) =>
    setDraft((d) => ({ ...d, [field]: value }));

  const updateMutation = trpc.cabinets.adminUpdateCabinet.useMutation({
    onSuccess: () => {
      utils.cabinets.adminListCabinetConfig.invalidate();
      toast.success("Saved");
      onSaved(draft);
      setDraft({});
      onClose();
    },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });

  const uploadMutation = trpc.cabinets.adminUploadCatalogImage.useMutation({
    onSuccess: (data) => {
      set("catalogImageUrl", data.url);
      setUploading(false);
      toast.success("Image uploaded");
    },
    onError: (e) => { setUploading(false); toast.error(`Upload failed: ${e.message}`); },
  });

  const generateMutation = trpc.cabinets.adminGenerateCatalogImage.useMutation({
    onSuccess: (data) => {
      set("catalogImageUrl", data.url);
      setGenerating(false);
      toast.success("AI image generated");
    },
    onError: (e) => { setGenerating(false); toast.error(`Generation failed: ${e.message}`); },
  });

  const estimateMutation = trpc.cabinets.adminEstimateMeasurements.useMutation({
    onSuccess: (data) => {
      if (data.weight) set("weight", data.weight);
      if (data.pkgLength) set("pkgLength", data.pkgLength);
      if (data.pkgWidth) set("pkgWidth", data.pkgWidth);
      if (data.pkgHeight) set("pkgHeight", data.pkgHeight);
      if (data.pkgWeight) set("pkgWeight", data.pkgWeight);
      toast.success("AI estimates filled in — review and adjust as needed");
    },
    onError: (e) => toast.error(`AI estimate failed: ${e.message}`),
  });

  // Aliases
  const { data: aliases, isLoading: aliasesLoading } = trpc.distributorAdmin.adminListCategoryAliases.useQuery({});
  const saveAliasMutation = trpc.distributorAdmin.adminSaveCategoryAlias.useMutation({
    onSuccess: () => {
      utils.distributorAdmin.adminListCategoryAliases.invalidate();
      setNewAlias({ raw: "", platform: "" });
      toast.success("Alias saved");
    },
    onError: (e: { message: string }) => toast.error(`Failed: ${e.message}`),
  });
  const deleteAliasMutation = trpc.distributorAdmin.adminDeleteCategoryAlias.useMutation({
    onSuccess: () => {
      utils.distributorAdmin.adminListCategoryAliases.invalidate();
      toast.success("Alias deleted");
    },
    onError: (e: { message: string }) => toast.error(`Failed: ${e.message}`),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      uploadMutation.mutate({
        filename: file.name,
        dataBase64: reader.result as string,
        contentType: file.type || "image/jpeg",
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = () => {
    if (Object.keys(draft).length === 0) { onClose(); return; }
    updateMutation.mutate({
      id: row.id,
      description: merged.description ?? undefined,
      depth: merged.depth ?? null,
      width: merged.width ?? null,
      height: merged.height ?? null,
      weight: merged.weight ?? null,
      physicalWidth: merged.physicalWidth ?? null,
      pkgLength: merged.pkgLength ?? null,
      pkgWidth: merged.pkgWidth ?? null,
      pkgHeight: merged.pkgHeight ?? null,
      pkgWeight: merged.pkgWeight ?? null,
      numberOfDoors: merged.numberOfDoors ?? null,
      numberOfDrawers: merged.numberOfDrawers ?? null,
      numberOfFixedShelves: merged.numberOfFixedShelves ?? null,
      numberOfAdjShelves: merged.numberOfAdjShelves ?? null,
      isNotCabinet: merged.isNotCabinet ?? undefined,
      catalogImageUrl: merged.catalogImageUrl ?? null,
    });
  };

  const busy = uploading || generating || updateMutation.isPending || estimateMutation.isPending;
  const depthVal = merged.depth ? String(parseFloat(merged.depth)) : "";
  const isStandardDepth = STANDARD_DEPTHS.includes(depthVal);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) { setDraft({}); onClose(); } }}>
      <DialogContent className="max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-primary shrink-0" />
            <span className="font-mono font-bold text-primary">{row.masterCode}</span>
          </DialogTitle>
          {row.category && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {row.category}{row.subCategory ? ` › ${row.subCategory}` : ""}
            </p>
          )}
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="measurements">Measurements</TabsTrigger>
            <TabsTrigger value="aliases">Aliases</TabsTrigger>
          </TabsList>

          {/* ── Details tab ── */}
          <TabsContent value="details" className="space-y-5 mt-0">
            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Description</Label>
              <Textarea
                className="text-sm resize-none"
                rows={3}
                placeholder="Enter cabinet description…"
                value={merged.description ?? ""}
                onChange={(e) => set("description", e.target.value || null)}
                disabled={busy}
              />
            </div>

            {/* Not a cabinet */}
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 bg-muted/30">
              <div>
                <p className="text-sm font-medium">Not a Cabinet</p>
                <p className="text-xs text-muted-foreground">Trim, panel, moulding, or accessory</p>
              </div>
              <Switch
                checked={merged.isNotCabinet === true}
                onCheckedChange={(v) => set("isNotCabinet", v)}
                disabled={busy}
              />
            </div>

            {!merged.isNotCabinet && (
              <>
                {/* Depth */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Standard Depth</Label>
                  <Select
                    value={depthVal || "__none__"}
                    onValueChange={(v) => set("depth", v === "__none__" ? null : v)}
                    disabled={busy}
                  >
                    <SelectTrigger className={cn("w-full", !depthVal && "text-muted-foreground")}>
                      <SelectValue placeholder="— not set —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— not set —</SelectItem>
                      {STANDARD_DEPTHS.map((d) => (
                        <SelectItem key={d} value={d}>{d}"</SelectItem>
                      ))}
                      {depthVal && !isStandardDepth && (
                        <SelectItem value={depthVal}>{depthVal}" (custom)</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Doors / Drawers */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Number of Doors</Label>
                    <Select
                      value={merged.numberOfDoors === null ? "__none__" : String(merged.numberOfDoors)}
                      onValueChange={(v) => set("numberOfDoors", v === "__none__" ? null : parseInt(v))}
                      disabled={busy}
                    >
                      <SelectTrigger className={cn("w-full", merged.numberOfDoors === null && "text-muted-foreground")}>
                        <SelectValue placeholder="— not set —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— not set —</SelectItem>
                        {(DOOR_OPTIONS as ReadonlyArray<number | null>).filter((o): o is number => o !== null).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Number of Drawers</Label>
                    <Select
                      value={merged.numberOfDrawers === null ? "__none__" : String(merged.numberOfDrawers)}
                      onValueChange={(v) => set("numberOfDrawers", v === "__none__" ? null : parseInt(v))}
                      disabled={busy}
                    >
                      <SelectTrigger className={cn("w-full", merged.numberOfDrawers === null && "text-muted-foreground")}>
                        <SelectValue placeholder="— not set —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— not set —</SelectItem>
                        {(DRAWER_OPTIONS as ReadonlyArray<number | null>).filter((o): o is number => o !== null).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Fixed / Adj Shelves */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Fixed Shelves</Label>
                    <Select
                      value={merged.numberOfFixedShelves === null ? "__none__" : String(merged.numberOfFixedShelves)}
                      onValueChange={(v) => set("numberOfFixedShelves", v === "__none__" ? null : parseInt(v))}
                      disabled={busy}
                    >
                      <SelectTrigger className={cn("w-full", merged.numberOfFixedShelves === null && "text-muted-foreground")}>
                        <SelectValue placeholder="— not set —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— not set —</SelectItem>
                        {(SHELF_OPTIONS as ReadonlyArray<number | null>).filter((o): o is number => o !== null).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Adjustable Shelves</Label>
                    <Select
                      value={merged.numberOfAdjShelves === null ? "__none__" : String(merged.numberOfAdjShelves)}
                      onValueChange={(v) => set("numberOfAdjShelves", v === "__none__" ? null : parseInt(v))}
                      disabled={busy}
                    >
                      <SelectTrigger className={cn("w-full", merged.numberOfAdjShelves === null && "text-muted-foreground")}>
                        <SelectValue placeholder="— not set —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— not set —</SelectItem>
                        {(SHELF_OPTIONS as ReadonlyArray<number | null>).filter((o): o is number => o !== null).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {/* Catalog Image */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Catalog Image</Label>
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "h-20 w-20 rounded-lg border flex items-center justify-center shrink-0 overflow-hidden",
                    merged.catalogImageUrl
                      ? "border-border bg-muted/20"
                      : "border-dashed border-border bg-muted/20 cursor-pointer hover:bg-muted/40"
                  )}
                  onClick={() => !busy && !merged.catalogImageUrl && fileRef.current?.click()}
                >
                  {generating ? (
                    <div className="flex flex-col items-center gap-1">
                      <Spinner className="h-5 w-5 text-amber-500" />
                      <span className="text-[9px] text-amber-600 text-center px-1">Generating…</span>
                    </div>
                  ) : uploading ? (
                    <Spinner className="h-5 w-5 text-primary" />
                  ) : merged.catalogImageUrl ? (
                    <img src={merged.catalogImageUrl} alt="catalog" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 justify-start"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {merged.catalogImageUrl ? "Replace image" : "Upload image"}
                  </Button>
                  <div className="flex gap-2 items-center">
                    <div className="flex rounded border border-border overflow-hidden">
                      {(["3d", "2d"] as const).map((m) => (
                        <button
                          key={m}
                          className={cn(
                            "px-2 py-1 text-xs font-medium transition-colors",
                            m === "2d" && "border-l border-border",
                            viewMode === m
                              ? "bg-amber-500 text-white"
                              : "bg-background text-muted-foreground hover:bg-muted/50"
                          )}
                          onClick={() => setViewMode(m)}
                          disabled={busy}
                        >
                          {m.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 border-amber-400/60 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                      disabled={busy}
                      onClick={() => { setGenerating(true); generateMutation.mutate({ id: row.id, viewMode }); }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      AI Generate
                    </Button>
                  </div>
                  {merged.catalogImageUrl && (
                    <button
                      className="text-xs text-destructive hover:underline text-left"
                      disabled={busy}
                      onClick={() => set("catalogImageUrl", null)}
                    >
                      Remove image
                    </button>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Measurements tab ── */}
          <TabsContent value="measurements" className="space-y-5 mt-0">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Assembled cabinet dimensions and package/shipping dimensions. All values in inches unless noted.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0 ml-2"
                disabled={busy}
                onClick={() =>
                  estimateMutation.mutate({
                    id: row.id,
                    width: merged.width,
                    height: merged.height,
                    depth: merged.depth,
                  })
                }
              >
                {estimateMutation.isPending ? (
                  <Spinner className="h-3 w-3" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                AI Fill
              </Button>
            </div>

            {/* Assembled dims */}
            <div>
              <p className="text-sm font-semibold mb-2">Assembled Dimensions</p>
              <div className="grid grid-cols-3 gap-3">
                <DimInput label="Width" value={merged.width} onChange={(v) => set("width", v)} disabled={busy} />
                <DimInput label="Height" value={merged.height} onChange={(v) => set("height", v)} disabled={busy} />
                <DimInput label="Depth" value={merged.depth} onChange={(v) => set("depth", v)} disabled={busy} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <DimInput label="Physical Width (door open)" value={merged.physicalWidth} onChange={(v) => set("physicalWidth", v)} disabled={busy} />
                <DimInput label="Weight" value={merged.weight} onChange={(v) => set("weight", v)} unit="lbs" disabled={busy} />
              </div>
            </div>

            {/* Package dims */}
            <div>
              <p className="text-sm font-semibold mb-2">Package / Shipping Dimensions</p>
              <div className="grid grid-cols-3 gap-3">
                <DimInput label="Pkg Length" value={merged.pkgLength} onChange={(v) => set("pkgLength", v)} disabled={busy} />
                <DimInput label="Pkg Width" value={merged.pkgWidth} onChange={(v) => set("pkgWidth", v)} disabled={busy} />
                <DimInput label="Pkg Height" value={merged.pkgHeight} onChange={(v) => set("pkgHeight", v)} disabled={busy} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <DimInput label="Pkg Weight" value={merged.pkgWeight} onChange={(v) => set("pkgWeight", v)} unit="lbs" disabled={busy} />
              </div>
            </div>
          </TabsContent>

          {/* ── Aliases tab ── */}
          <TabsContent value="aliases" className="space-y-4 mt-0">
            <p className="text-xs text-muted-foreground">
              Category aliases map raw distributor category names to platform categories. These are global and apply across all cabinets.
            </p>

            {/* Add new alias */}
            <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Alias</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Raw Category (from distributor)</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="e.g. BASE CABINET"
                    value={newAlias.raw}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAlias((a) => ({ ...a, raw: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Platform Category</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="e.g. Base"
                    value={newAlias.platform}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAlias((a) => ({ ...a, platform: e.target.value }))}
                  />
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={!newAlias.raw.trim() || !newAlias.platform.trim() || saveAliasMutation.isPending}
                onClick={() => saveAliasMutation.mutate({ rawCategory: newAlias.raw.trim(), platformCategory: newAlias.platform.trim(), distributorId: null })}
              >
                <Plus className="h-3.5 w-3.5" />
                Save Alias
              </Button>
            </div>

            {/* Alias list */}
            {aliasesLoading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : !aliases?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No aliases defined yet.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Raw Category</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">→ Platform</th>
                      <th className="w-10 px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {aliases.map((a: { id: number; rawCategory: string; platformCategory: string; distributorId: number | null }, i: number) => (
                      <tr key={a.id} className={cn("border-b border-border last:border-0", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                        <td className="px-3 py-2 font-mono">{a.rawCategory}</td>
                        <td className="px-3 py-2 text-primary font-medium">{a.platformCategory}</td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            className="text-destructive hover:text-destructive/70 transition-colors"
                            onClick={() => deleteAliasMutation.mutate({ id: a.id })}
                            disabled={deleteAliasMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 flex-row justify-end mt-2">
          <Button variant="outline" onClick={() => { setDraft({}); onClose(); }} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy} className="min-w-20">
            {updateMutation.isPending ? <Spinner className="h-4 w-4" /> : "Save"}
          </Button>
        </DialogFooter>

        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={handleFile} />
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function CabinetConfigAdmin() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("");
  const [unconfiguredOnly, setUnconfiguredOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [editRow, setEditRow] = useState<CabinetRow | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.cabinets.adminListCabinetConfig.useQuery({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    category: category || undefined,
    unconfiguredOnly,
  });

  const categories = ["Base","Wall","Tall","Corner","Drawer","Specialty","Vanity","Pantry","Island","Filler","Molding","Accessory"];

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const configuredCount = rows.filter(
    (r) =>
      r.depth != null ||
      r.numberOfDoors != null ||
      r.numberOfDrawers != null ||
      r.numberOfFixedShelves != null ||
      r.numberOfAdjShelves != null
  ).length;

  const handleSaved = useCallback(
    (updated: Partial<CabinetRow>) => {
      setEditRow((prev) => prev ? { ...prev, ...updated } : null);
      utils.cabinets.adminListCabinetConfig.invalidate();
    },
    [utils]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Cabinet Configuration</h2>
        <Badge variant="secondary" className="ml-1">{total} cabinets</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Set the standard depth, door count, drawer count, shelf counts, and catalog image for each generic cabinet.
        These values appear in the public Specifications card and drive catalog illustrations.
        <strong className="text-foreground"> Tap any row to edit.</strong>
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search code or description…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setSearch(searchInput); setPage(0); }
            }}
          />
        </div>
        <Select value={category || "__all__"} onValueChange={(v) => { setCategory(v === "__all__" ? "" : v); setPage(0); }}>
          <SelectTrigger className="h-8 text-sm w-44"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Switch
            id="unconfigured-only"
            checked={unconfiguredOnly}
            onCheckedChange={(v) => { setUnconfiguredOnly(v); setPage(0); }}
          />
          <Label htmlFor="unconfigured-only" className="text-sm cursor-pointer">Unconfigured only</Label>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={() => { setSearch(searchInput); setPage(0); }}>
          Search
        </Button>
      </div>

      {/* Progress summary */}
      {!unconfiguredOnly && rows.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          <span>{configuredCount} of {rows.length} shown have at least one field configured</span>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No cabinets found.</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-28">Code</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Description</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-20 hidden sm:table-cell">W×H</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-32 hidden md:table-cell">Config</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs w-12">
                  <Pencil className="h-3.5 w-3.5 mx-auto" />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isConfigured =
                  row.depth != null ||
                  row.numberOfDoors != null ||
                  row.numberOfDrawers != null ||
                  row.numberOfFixedShelves != null ||
                  row.numberOfAdjShelves != null;
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors cursor-pointer group",
                      i % 2 === 0 ? "bg-background" : "bg-muted/20",
                      "hover:bg-primary/5 active:bg-primary/10"
                    )}
                    onClick={() => setEditRow(row as CabinetRow)}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-semibold text-primary">{row.masterCode}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-foreground line-clamp-1">{row.description}</span>
                      {row.category && (
                        <span className="text-[10px] text-muted-foreground block">{row.category}{row.subCategory ? ` › ${row.subCategory}` : ""}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                      {row.width ? `${parseFloat(row.width)}"` : "—"}×{row.height ? `${parseFloat(row.height)}"` : "—"}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      {isConfigured ? (
                        <div className="flex flex-wrap gap-1">
                          {row.depth && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{row.depth}"D</Badge>}
                          {row.numberOfDoors != null && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{row.numberOfDoors}dr</Badge>}
                          {row.numberOfDrawers != null && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{row.numberOfDrawers}dw</Badge>}
                          {(row.numberOfFixedShelves != null || row.numberOfAdjShelves != null) && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {row.numberOfFixedShelves ?? "?"}f/{row.numberOfAdjShelves ?? "?"}a sh
                            </Badge>
                          )}
                          {row.catalogImageUrl && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 border-green-300">img</Badge>}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">not configured</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors mx-auto" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page + 1} of {totalPages} ({total} total)</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editRow && (
        <EditModal
          row={editRow}
          open={!!editRow}
          onClose={() => setEditRow(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

export default CabinetConfigAdmin;
