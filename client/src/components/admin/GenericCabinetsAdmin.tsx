/**
 * Generic Cabinets Admin — Enhanced Inline Editing
 *
 * Layout:
 * - Filterable table/list of all master cabinet codes (left / full width)
 * - Slide-out detail panel (right) that opens when a row is selected
 * - All fields editable in the panel with live save-on-change
 * - Toggle switches for isActive / showInDesigner / showInCatalog
 * - Bulk-select rows → batch activate / deactivate / toggle designer
 * - Catalog photo upload in the panel
 * - Distributor coverage + zip manager dialogs
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Pencil,
  Check,
  X,
  Upload,
  Search,
  MapPin,
  Package,
  ChevronLeft,
  ChevronRight,
  Plus,
  Building2,
  LayoutList,
  LayoutGrid,
  CheckSquare,
  Square,
  Eye,
  EyeOff,
  Wrench,
  Save,
  AlertCircle,
  ChevronRight as ArrowRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type CabinetRow = {
  id: number;
  masterCode: string;
  description: string;
  category: string;
  subCategory: string | null;
  width: string | null;
  height: string | null;
  depth: string | null;
  weight: string | null;
  pkgLength: string | null;
  pkgWidth: string | null;
  pkgHeight: string | null;
  pkgWeight: string | null;
  catalogImageUrl: string | null;
  sku: string | null;
  vendorSku: string | null;
  altSku1: string | null;
  altSku2: string | null;
  altSku3: string | null;
  stainColor: string | null;
  constructionMethod: string | null;
  conflictStatus: string;
  showInDesigner: boolean;
  showInCatalog: boolean;
  isActive: boolean;
};

type DraftState = Omit<CabinetRow, "id" | "masterCode" | "conflictStatus">;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDraft(cab: CabinetRow): DraftState {
  return {
    description: cab.description,
    category: cab.category,
    subCategory: cab.subCategory,
    width: cab.width,
    height: cab.height,
    depth: cab.depth,
    weight: cab.weight,
    pkgLength: cab.pkgLength,
    pkgWidth: cab.pkgWidth,
    pkgHeight: cab.pkgHeight,
    pkgWeight: cab.pkgWeight,
    catalogImageUrl: cab.catalogImageUrl,
    sku: cab.sku,
    vendorSku: cab.vendorSku,
    altSku1: cab.altSku1,
    altSku2: cab.altSku2,
    altSku3: cab.altSku3,
    stainColor: cab.stainColor,
    constructionMethod: cab.constructionMethod,
    showInDesigner: cab.showInDesigner,
    showInCatalog: cab.showInCatalog,
    isActive: cab.isActive,
  };
}

function isDirty(original: CabinetRow, draft: DraftState): boolean {
  return (Object.keys(draft) as (keyof DraftState)[]).some(
    (k) => draft[k] !== (original as unknown as DraftState)[k]
  );
}

// ─── Distributor Coverage Dialog ──────────────────────────────────────────────
function DistributorCoverageDialog({
  cabinet,
  onClose,
}: {
  cabinet: CabinetRow;
  onClose: () => void;
}) {
  const { data: coverage, isLoading } = trpc.genericCabinets.distributorCoverage.useQuery({
    cabinetId: cabinet.id,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {cabinet.masterCode} — Distributor Coverage
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : !coverage?.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No distributors carry this cabinet.
          </p>
        ) : (
          <div className="space-y-3">
            {coverage.map((d) => (
              <div key={d.distributorId} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{d.name}</span>
                  <Badge variant="secondary">{d.skuCount} SKUs</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.warehouseZips.length > 0 ? (
                    d.warehouseZips.map((zip) => (
                      <span key={zip} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5">
                        <MapPin className="h-3 w-3" />{zip}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No zip codes set</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Distributor Zip Manager Dialog ───────────────────────────────────────────
function DistributorZipManagerDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: distributors, isLoading } = trpc.genericCabinets.distributorZips.useQuery();
  const updateZips = trpc.genericCabinets.updateDistributorZips.useMutation({
    onSuccess: () => { utils.genericCabinets.distributorZips.invalidate(); toast.success("Zip codes updated"); },
    onError: () => toast.error("Failed to update zip codes"),
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftZips, setDraftZips] = useState<string[]>([]);
  const [newZip, setNewZip] = useState("");

  const startEdit = (id: number, zips: string[]) => { setEditingId(id); setDraftZips([...zips]); setNewZip(""); };
  const addZip = () => { const z = newZip.trim(); if (!z || draftZips.includes(z)) return; setDraftZips(p => [...p, z]); setNewZip(""); };
  const removeZip = (zip: string) => setDraftZips(p => p.filter(z => z !== zip));
  const saveZips = (id: number) => { updateZips.mutate({ distributorId: id, warehouseZips: draftZips }); setEditingId(null); };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />Distributor Warehouse Zip Codes
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <div className="space-y-4">
            {distributors?.map((d) => (
              <div key={d.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-semibold">{d.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">({d.code})</span>
                  </div>
                  {editingId !== d.id && (
                    <Button variant="outline" size="sm" onClick={() => startEdit(d.id, d.warehouseZips)}>
                      <Pencil className="h-3 w-3 mr-1" />Edit
                    </Button>
                  )}
                </div>
                {editingId === d.id ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {draftZips.map(zip => (
                        <span key={zip} className="inline-flex items-center gap-1 bg-muted rounded-full px-3 py-1 text-sm">
                          <MapPin className="h-3 w-3" />{zip}
                          <button onClick={() => removeZip(zip)} className="text-muted-foreground hover:text-red-500 ml-1"><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                      {draftZips.length === 0 && <span className="text-sm text-muted-foreground italic">No zip codes</span>}
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="Add zip code (e.g. 30301)" value={newZip} onChange={e => setNewZip(e.target.value)} onKeyDown={e => e.key === "Enter" && addZip()} className="max-w-[200px]" />
                      <Button variant="outline" size="sm" onClick={addZip}><Plus className="h-4 w-4" />Add</Button>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveZips(d.id)} disabled={updateZips.isPending}><Check className="h-4 w-4 mr-1" />Save</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {d.warehouseZips.length > 0 ? d.warehouseZips.map(zip => (
                      <span key={zip} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5">
                        <MapPin className="h-3 w-3" />{zip}
                      </span>
                    )) : <span className="text-xs text-muted-foreground italic">No zip codes — click Edit to add</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Edit Panel ────────────────────────────────────────────────────────
function EditPanel({
  cabinet,
  onClose,
  onSaved,
}: {
  cabinet: CabinetRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<DraftState>(() => toDraft(cabinet));
  const [saving, setSaving] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = isDirty(cabinet, draft);

  // Reset draft when cabinet changes
  useEffect(() => { setDraft(toDraft(cabinet)); }, [cabinet.id]);

  const updateMut = trpc.genericCabinets.update.useMutation({
    onSuccess: () => { utils.genericCabinets.list.invalidate(); onSaved(); },
    onError: () => toast.error("Failed to save changes"),
  });
  const uploadImageMut = trpc.genericCabinets.uploadCatalogImage.useMutation({
    onSuccess: (data) => {
      setDraft(d => ({ ...d, catalogImageUrl: data.url }));
      utils.genericCabinets.list.invalidate();
      toast.success("Image updated");
    },
    onError: () => toast.error("Image upload failed"),
  });

  const set = useCallback(<K extends keyof DraftState>(key: K, value: DraftState[K]) => {
    setDraft(d => ({ ...d, [key]: value }));
  }, []);

  const saveAll = async () => {
    setSaving(true);
    try {
      await updateMut.mutateAsync({ id: cabinet.id, ...draft });
      toast.success("Cabinet saved");
    } finally {
      setSaving(false);
    }
  };

  // Auto-save toggles immediately
  const saveToggle = (key: "isActive" | "showInDesigner" | "showInCatalog", value: boolean) => {
    set(key, value);
    updateMut.mutate({ id: cabinet.id, [key]: value });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const toastId = toast.loading("Uploading image…");
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      await uploadImageMut.mutateAsync({ cabinetId: cabinet.id, fileBase64: base64, mimeType: file.type || "image/jpeg" });
      toast.dismiss(toastId);
    };
    reader.onerror = () => toast.error("Upload failed", { id: toastId });
    reader.readAsDataURL(file);
  };

  return (
    <>
      {showCoverage && <DistributorCoverageDialog cabinet={cabinet} onClose={() => setShowCoverage(false)} />}

      <div className="flex flex-col h-full">
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="min-w-0">
            <div className="font-mono font-bold text-lg leading-tight">{cabinet.masterCode}</div>
            <div className="text-xs text-muted-foreground truncate">{cabinet.category}{cabinet.subCategory ? ` › ${cabinet.subCategory}` : ""}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {dirty && (
              <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />Unsaved
              </span>
            )}
            <Button size="sm" onClick={saveAll} disabled={!dirty || saving}>
              {saving ? <Spinner className="h-4 w-4 mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Catalog image */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Catalog Illustration</Label>
            <div
              className="relative bg-muted/30 rounded-lg border flex items-center justify-center h-40 cursor-pointer group overflow-hidden"
              onClick={() => fileRef.current?.click()}
            >
              {draft.catalogImageUrl ? (
                <img src={draft.catalogImageUrl} alt={cabinet.masterCode} className="max-h-full max-w-full object-contain p-2" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Package className="h-10 w-10 opacity-30" />
                  <span className="text-xs">Click to upload illustration</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-sm flex items-center gap-2"><Upload className="h-4 w-4" />Upload image</span>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            {draft.catalogImageUrl && (
              <button
                className="text-xs text-muted-foreground hover:text-red-500 mt-1 flex items-center gap-1"
                onClick={() => set("catalogImageUrl", null)}
              >
                <X className="h-3 w-3" />Remove image
              </button>
            )}
          </div>

          <Separator />

          {/* Visibility toggles */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-3 block">Visibility</Label>
            <div className="space-y-3">
              {([
                ["isActive", "Active", "Cabinet is available for use"],
                ["showInDesigner", "Show in Designer", "Appears in the 2D design tool catalog"],
                ["showInCatalog", "Show in Catalog", "Appears in the public product catalog"],
              ] as [keyof DraftState, string, string][]).map(([key, label, desc]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{desc}</div>
                  </div>
                  <Switch
                    checked={draft[key] as boolean}
                    onCheckedChange={(v) => saveToggle(key as "isActive" | "showInDesigner" | "showInCatalog", v)}
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="desc" className="text-xs uppercase tracking-wide text-muted-foreground">Description</Label>
            <Textarea
              id="desc"
              value={draft.description}
              onChange={e => set("description", e.target.value)}
              rows={3}
              className="resize-none text-sm"
              placeholder="Cabinet description…"
            />
          </div>

          {/* Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Category</Label>
              <Input value={draft.category} onChange={e => set("category", e.target.value)} className="text-sm" placeholder="e.g. Base" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sub-Category</Label>
              <Input value={draft.subCategory ?? ""} onChange={e => set("subCategory", e.target.value || null)} className="text-sm" placeholder="e.g. Corner" />
            </div>
          </div>

          <Separator />

          {/* Cabinet Dimensions */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Cabinet Dimensions & Weight</Label>
            <div className="grid grid-cols-4 gap-2">
              {([
                ["width", 'W"'],
                ["height", 'H"'],
                ["depth", 'D"'],
                ["weight", "Wt lb"],
              ] as [keyof DraftState, string][]).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    value={(draft[key] as string | null) ?? ""}
                    onChange={e => set(key, e.target.value || null)}
                    className="text-sm font-mono px-2"
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Package / Shipping Dimensions */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Package / Shipping Dimensions</Label>
            <div className="grid grid-cols-4 gap-2">
              {([
                ["pkgLength", 'L"'],
                ["pkgWidth", 'W"'],
                ["pkgHeight", 'H"'],
                ["pkgWeight", "Wt lb"],
              ] as [keyof DraftState, string][]).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    value={(draft[key] as string | null) ?? ""}
                    onChange={e => set(key, e.target.value || null)}
                    className="text-sm font-mono px-2"
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Stain + construction */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Stain Color (Sherwin-Williams)</Label>
              <Input value={draft.stainColor ?? ""} onChange={e => set("stainColor", e.target.value || null)} className="text-sm" placeholder="e.g. SW 7015 Repose Gray" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Construction Method</Label>
              <Input value={draft.constructionMethod ?? ""} onChange={e => set("constructionMethod", e.target.value || null)} className="text-sm" placeholder="e.g. Framed, plywood box, dovetail drawer" />
            </div>
          </div>

          <Separator />

          {/* Aliases */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">SKU Aliases</Label>
            <div className="space-y-2">
              {([
                ["sku", "Primary SKU"],
                ["vendorSku", "Vendor SKU"],
                ["altSku1", "Alt SKU 1"],
                ["altSku2", "Alt SKU 2"],
                ["altSku3", "Alt SKU 3"],
              ] as [keyof DraftState, string][]).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
                  <Input
                    value={(draft[key] as string | null) ?? ""}
                    onChange={e => set(key, e.target.value || null)}
                    className="text-xs font-mono h-8"
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Distributor coverage */}
          <div>
            <button
              onClick={() => setShowCoverage(true)}
              className="w-full flex items-center justify-between text-sm border rounded-lg px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <span className="flex items-center gap-2 font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                View Distributor Coverage
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Bottom spacer */}
          <div className="h-4" />
        </div>

        {/* Sticky save footer */}
        {dirty && (
          <div className="border-t px-5 py-3 bg-background shrink-0 flex items-center justify-between gap-3">
            <span className="text-sm text-amber-600 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />You have unsaved changes
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(cabinet))}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />Revert
              </Button>
              <Button size="sm" onClick={saveAll} disabled={saving}>
                {saving ? <Spinner className="h-4 w-4 mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────
function CabinetTableRow({
  cabinet,
  selected,
  active,
  onSelect,
  onClick,
}: {
  cabinet: CabinetRow;
  selected: boolean;
  active: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onClick: (cab: CabinetRow) => void;
}) {
  const aliases = [cabinet.sku, cabinet.vendorSku, cabinet.altSku1, cabinet.altSku2, cabinet.altSku3]
    .filter(Boolean) as string[];

  return (
    <tr
      className={cn(
        "border-b hover:bg-muted/40 cursor-pointer transition-colors",
        active && "bg-primary/5 border-l-2 border-l-primary"
      )}
      onClick={() => onClick(cabinet)}
    >
      <td className="pl-3 pr-1 py-2.5" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onSelect(cabinet.id, !selected)}
          className="text-muted-foreground hover:text-foreground"
        >
          {selected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
        </button>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {cabinet.catalogImageUrl ? (
            <img src={cabinet.catalogImageUrl} alt="" className="h-8 w-8 object-contain rounded border bg-muted/30 shrink-0" />
          ) : (
            <div className="h-8 w-8 rounded border bg-muted/30 flex items-center justify-center shrink-0">
              <Package className="h-4 w-4 text-muted-foreground/40" />
            </div>
          )}
          <span className="font-mono font-semibold text-sm">{cabinet.masterCode}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 max-w-[220px]">
        <span className="text-sm truncate block">{cabinet.description || <span className="text-muted-foreground italic text-xs">No description</span>}</span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <Badge variant="outline" className="text-xs w-fit">{cabinet.category}</Badge>
          {cabinet.subCategory && <span className="text-xs text-muted-foreground">{cabinet.subCategory}</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
        {[cabinet.width, cabinet.height, cabinet.depth].filter(Boolean).join(" × ") || "—"}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1 max-w-[160px]">
          {aliases.slice(0, 2).map(a => (
            <span key={a} className="text-xs font-mono bg-muted rounded px-1.5 py-0.5">{a}</span>
          ))}
          {aliases.length > 2 && <span className="text-xs text-muted-foreground">+{aliases.length - 2}</span>}
          {aliases.length === 0 && <span className="text-xs text-muted-foreground italic">—</span>}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn("h-2 w-2 rounded-full", cabinet.isActive ? "bg-green-500" : "bg-muted-foreground/30")} />
              </TooltipTrigger>
              <TooltipContent>{cabinet.isActive ? "Active" : "Inactive"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn("text-muted-foreground", cabinet.showInDesigner && "text-blue-500")}>
                  <Wrench className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{cabinet.showInDesigner ? "In Designer" : "Hidden from Designer"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn("text-muted-foreground", cabinet.showInCatalog && "text-purple-500")}>
                  <Eye className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{cabinet.showInCatalog ? "In Catalog" : "Hidden from Catalog"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

export default function GenericCabinetsAdmin() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [subCategory, setSubCategory] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showZipManager, setShowZipManager] = useState(false);
  const [selectedCabinet, setSelectedCabinet] = useState<CabinetRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.genericCabinets.list.useQuery({
    search: search || undefined,
    category: category !== "all" ? category : undefined,
    subCategory: subCategory !== "all" ? subCategory : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const updateMut = trpc.genericCabinets.update.useMutation({
    onSuccess: () => utils.genericCabinets.list.invalidate(),
    onError: () => toast.error("Bulk action failed"),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);
  const rows = data?.rows ?? [];
  const allSelected = rows.length > 0 && rows.every(r => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)));
    }
  };

  const toggleSelect = (id: number, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const bulkAction = async (action: "activate" | "deactivate" | "showDesigner" | "hideDesigner") => {
    const ids = Array.from(selectedIds);
    const updates: Record<string, boolean> = {
      activate: { isActive: true },
      deactivate: { isActive: false },
      showDesigner: { showInDesigner: true },
      hideDesigner: { showInDesigner: false },
    }[action] as Record<string, boolean>;

    await Promise.all(ids.map(id => updateMut.mutateAsync({ id, ...updates })));
    toast.success(`Updated ${ids.length} cabinet${ids.length !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
  };

  // When data refreshes, keep selectedCabinet in sync
  useEffect(() => {
    if (selectedCabinet && data) {
      const updated = data.rows.find(r => r.id === selectedCabinet.id);
      if (updated) setSelectedCabinet(updated);
    }
  }, [data]);

  return (
    <div className="flex gap-0 h-full min-h-[600px]">
      {showZipManager && <DistributorZipManagerDialog onClose={() => setShowZipManager(false)} />}

      {/* ── Left: list/table ── */}
      <div className={cn("flex flex-col min-w-0 transition-all duration-200", selectedCabinet ? "w-[55%]" : "w-full")}>

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold">Generic Cabinet Catalog</h2>
            <p className="text-sm text-muted-foreground">
              Master cabinet codes — click any row to edit inline
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowZipManager(true)}>
              <MapPin className="h-4 w-4 mr-1.5" />Distributor Zips
            </Button>
            <div className="flex border rounded-md overflow-hidden">
              <button
                className={cn("px-2.5 py-1.5 text-sm", viewMode === "table" ? "bg-muted" : "hover:bg-muted/50")}
                onClick={() => setViewMode("table")}
                title="Table view"
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                className={cn("px-2.5 py-1.5 text-sm border-l", viewMode === "grid" ? "bg-muted" : "hover:bg-muted/50")}
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search code, description, alias…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 h-9"
            />
          </div>
          <Select value={category} onValueChange={v => { setCategory(v); setSubCategory("all"); setPage(1); }}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {data?.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={subCategory} onValueChange={v => { setSubCategory(v); setPage(1); }}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Sub-category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sub-categories</SelectItem>
              {data?.subCategories.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {data && <span className="text-sm text-muted-foreground ml-auto">{data.total.toLocaleString()} cabinets</span>}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 mb-3 flex-wrap">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Separator orientation="vertical" className="h-4" />
            <Button variant="outline" size="sm" onClick={() => bulkAction("activate")} disabled={updateMut.isPending}>
              <Eye className="h-3.5 w-3.5 mr-1" />Activate
            </Button>
            <Button variant="outline" size="sm" onClick={() => bulkAction("deactivate")} disabled={updateMut.isPending}>
              <EyeOff className="h-3.5 w-3.5 mr-1" />Deactivate
            </Button>
            <Button variant="outline" size="sm" onClick={() => bulkAction("showDesigner")} disabled={updateMut.isPending}>
              <Wrench className="h-3.5 w-3.5 mr-1" />Show in Designer
            </Button>
            <Button variant="outline" size="sm" onClick={() => bulkAction("hideDesigner")} disabled={updateMut.isPending}>
              <Wrench className="h-3.5 w-3.5 mr-1 opacity-40" />Hide from Designer
            </Button>
            <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setSelectedIds(new Set())}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !rows.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No cabinets found</p>
          </div>
        ) : viewMode === "table" ? (
          <div className="border rounded-lg overflow-auto max-h-[calc(100vh-280px)]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b sticky top-0 z-10">
                <tr>
                  <th className="pl-3 pr-1 py-2.5 w-8">
                    <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                      {allSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Code</th>
                  <th className="px-3 py-2.5 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="px-3 py-2.5 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Category</th>
                  <th className="px-3 py-2.5 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Dims</th>
                  <th className="px-3 py-2.5 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Aliases</th>
                  <th className="px-3 py-2.5 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map(cab => (
                  <CabinetTableRow
                    key={cab.id}
                    cabinet={cab}
                    selected={selectedIds.has(cab.id)}
                    active={selectedCabinet?.id === cab.id}
                    onSelect={toggleSelect}
                    onClick={setSelectedCabinet}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid view */
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {rows.map(cab => (
              <div
                key={cab.id}
                onClick={() => setSelectedCabinet(cab)}
                className={cn(
                  "border rounded-xl overflow-hidden bg-card cursor-pointer hover:shadow-md transition-all",
                  selectedCabinet?.id === cab.id && "ring-2 ring-primary"
                )}
              >
                <div className="bg-muted/30 h-28 flex items-center justify-center border-b">
                  {cab.catalogImageUrl ? (
                    <img src={cab.catalogImageUrl} alt={cab.masterCode} className="max-h-full max-w-full object-contain p-2" />
                  ) : (
                    <Package className="h-8 w-8 text-muted-foreground/30" />
                  )}
                </div>
                <div className="p-3">
                  <div className="font-mono font-bold text-sm">{cab.masterCode}</div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{cab.description || "—"}</div>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{cab.category}</Badge>
                    <span className={cn("h-2 w-2 rounded-full mt-1", cab.isActive ? "bg-green-500" : "bg-muted-foreground/30")} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />Prev
            </Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              Next<ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* ── Right: edit panel ── */}
      {selectedCabinet && (
        <div className="w-[45%] border-l flex flex-col ml-0 min-h-0 max-h-[calc(100vh-200px)] sticky top-4">
          <EditPanel
            cabinet={selectedCabinet}
            onClose={() => setSelectedCabinet(null)}
            onSaved={() => utils.genericCabinets.list.invalidate()}
          />
        </div>
      )}
    </div>
  );
}
