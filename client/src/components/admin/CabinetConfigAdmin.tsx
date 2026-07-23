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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, ChevronLeft, ChevronRight, Settings2, CheckCircle2, Upload, ImageIcon, Sparkles, Pencil, Trash2, Plus, AlertTriangle, Globe, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DoorDrawerDiagram } from "@/components/design/DoorDrawerDiagram";

// ─── Constants ────────────────────────────────────────────────────────────────
const STANDARD_DEPTHS = ["9", "12", "15", "18", "21", "24", "27", "30", "33", "36"];
const DOOR_OPTIONS = [null, 0, 1, 2, 3, 4] as const;
const DRAWER_OPTIONS = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
const SHELF_OPTIONS = [null, 0, 1, 2, 3, 4, 5, 6] as const;
const PAGE_SIZE = 50;

// Detect blind corner cabinets by code prefix or description (mirrors design.ts)
function isBlindCornerCode(masterCode: string | null, description?: string | null): boolean {
  const code = (masterCode || "").toUpperCase();
  if (/^(BBC|WBC|BBL|BBR|WBL|WBR)/.test(code)) return true;
  if (/-BLIND|BLIND/.test(code)) return true;
  return /blind\s*corner/.test((description || "").toLowerCase());
}

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
  altSku1: string | null;
  altSku2: string | null;
  altSku3: string | null;
  showInCatalog: boolean | null;
  showInDesigner: boolean | null;
  showIn2020: boolean | null;
  isActive: boolean | null;
  isNotCabinet: boolean | null;
  catalogImageUrl: string | null;
  weight: string | null;
  physicalWidth: string | null;
  pkgLength: string | null;
  pkgWidth: string | null;
  pkgHeight: string | null;
  pkgWeight: string | null;
  // Blind corner pull spec
  minPull: string | null;
  maxPull: string | null;
  openingWidth: string | null;
  // Appliance opening
  openingType: string | null;
  doorHeight: string | null;
  drawerHeight: string | null;
  // Corner cabinet type
  cornerType: string | null;
  // Corner measurement fields
  shelfRadius: string | null;
  shelfCount: number | null;
  cabinetSquare: string | null;
  faceWidth: string | null;
  legWidth: string | null;
  // Timestamps
  configuredAt: Date | null;
  // Verified status
  configVerified: boolean;
  configVerifiedAt: Date | null;
  // Door orientation
  doorOrientation: string | null;
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
  const [newAliasCode, setNewAliasCode] = useState("");
  const [measurementSource, setMeasurementSource] = useState<string | null>(null);
  // Image replacement confirmation dialog state
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [imageConfirmOpen, setImageConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  // Fetch distributors that carry this cabinet (via SKUs)
  const { data: distributorsList } = trpc.distributors.list.useQuery();

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
      setUploading(false);
      // If there's already an image, show the confirmation dialog
      if (merged.catalogImageUrl) {
        setPendingImageUrl(data.url);
        setImageConfirmOpen(true);
      } else {
        // No existing image — just set it globally (first upload)
        set("catalogImageUrl", data.url);
        toast.success("Image uploaded");
      }
    },
    onError: (e) => { setUploading(false); toast.error(`Upload failed: ${e.message}`); },
  });

  // Mutation to save image at a specific scope (global or per-distributor)
  const setImageMutation = trpc.cabinetOverrides.setImage.useMutation({
    onSuccess: (res) => {
      if (res.scope === "global") {
        set("catalogImageUrl", pendingImageUrl);
        toast.success("Image replaced for all distributors");
      } else {
        toast.success("Image saved for this distributor only");
      }
      setPendingImageUrl(null);
      setImageConfirmOpen(false);
      utils.cabinets.adminListCabinetConfig.invalidate();
    },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
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
      const label = data.sourceLabel ?? "Filled in";
      setMeasurementSource(label);
      const sourceType = data.source;
      if (sourceType === "master_sheet" || sourceType === "distributor_override" || sourceType === "alias_sibling") {
        toast.success(label);
      } else {
        toast.info(label);
      }
    },
    onError: (e) => toast.error(`Fill failed: ${e.message}`),
  });

  // Master SKU Aliases for this cabinet
  const masterCode = row.masterCode ?? "";
  const { data: skuAliases, isLoading: aliasesLoading } = trpc.masterSku.getAliasesForCabinet.useQuery(
    { masterCode },
    { enabled: !!masterCode }
  );
  const addAliasMutation = trpc.masterSku.addAliasForCabinet.useMutation({
    onSuccess: (result) => {
      utils.masterSku.getAliasesForCabinet.invalidate({ masterCode });
      setNewAliasCode("");
      if (result.conflict) {
        toast.warning("Alias added but marked as conflict — it was previously mapped to a different master code.");
      } else {
        toast.success("Alias added");
      }
    },
    onError: (e: { message: string }) => toast.error(`Failed: ${e.message}`),
  });
  const deleteAliasMutation = trpc.masterSku.deleteAlias.useMutation({
    onSuccess: () => {
      utils.masterSku.getAliasesForCabinet.invalidate({ masterCode });
      toast.success("Alias removed");
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
    // Helper: convert empty strings to null for decimal DB columns
    const strOrNull = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);
    updateMutation.mutate({
      id: row.id,
      description: merged.description ?? undefined,
      depth: strOrNull(merged.depth),
      width: strOrNull(merged.width),
      height: strOrNull(merged.height),
      weight: strOrNull(merged.weight),
      physicalWidth: strOrNull(merged.physicalWidth),
      pkgLength: strOrNull(merged.pkgLength),
      pkgWidth: strOrNull(merged.pkgWidth),
      pkgHeight: strOrNull(merged.pkgHeight),
      pkgWeight: strOrNull(merged.pkgWeight),
      numberOfDoors: merged.numberOfDoors ?? null,
      numberOfDrawers: merged.numberOfDrawers ?? null,
      numberOfFixedShelves: merged.numberOfFixedShelves ?? null,
      numberOfAdjShelves: merged.numberOfAdjShelves ?? null,
      altSku1: merged.altSku1 ?? null,
      altSku2: merged.altSku2 ?? null,
      altSku3: merged.altSku3 ?? null,
      showInCatalog: merged.showInCatalog ?? undefined,
      showInDesigner: merged.showInDesigner ?? undefined,
      showIn2020: merged.showIn2020 ?? undefined,
      isActive: merged.isActive ?? undefined,
      isNotCabinet: merged.isNotCabinet ?? undefined,
      catalogImageUrl: merged.catalogImageUrl ?? null,
      minPull: merged.minPull != null ? parseFloat(merged.minPull) : null,
      maxPull: merged.maxPull != null ? parseFloat(merged.maxPull) : null,
      openingWidth: merged.openingWidth != null ? parseFloat(merged.openingWidth) : null,
      openingType: (merged.openingType as "top" | "middle" | "bottom" | null | undefined) ?? null,
      doorHeight: merged.doorHeight != null ? parseFloat(merged.doorHeight) : null,
      drawerHeight: merged.drawerHeight != null ? parseFloat(merged.drawerHeight) : null,
      cornerType: (merged.cornerType as "lazy-susan" | "blind-corner" | "diagonal" | "pie-cut" | "l-shape" | null | undefined) ?? null,
      shelfRadius: merged.shelfRadius != null ? parseFloat(merged.shelfRadius) : null,
      shelfCount: merged.shelfCount ?? null,
      cabinetSquare: merged.cabinetSquare != null ? parseFloat(merged.cabinetSquare) : null,
      faceWidth: merged.faceWidth != null ? parseFloat(merged.faceWidth) : null,
      legWidth: merged.legWidth != null ? parseFloat(merged.legWidth) : null,
      category: merged.category ?? undefined,
      subCategory: merged.subCategory ?? null,
      configVerified: merged.configVerified ?? undefined,
      doorOrientation: (merged.doorOrientation as "side-by-side" | "stacked" | null | undefined) ?? null,
    });
  };

  const busy = uploading || generating || updateMutation.isPending || estimateMutation.isPending;
  const depthVal = merged.depth ? String(parseFloat(merged.depth)) : "";
  const isStandardDepth = STANDARD_DEPTHS.includes(depthVal);

  return (<>
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

            {/* Category & Sub-Category */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Category</Label>
                <Select
                  value={merged.category ?? "__none__"}
                  onValueChange={(v) => set("category", v === "__none__" ? null : v)}
                  disabled={busy}
                >
                  <SelectTrigger className={cn("w-full", !merged.category && "text-muted-foreground")}>
                    <SelectValue placeholder="— not set —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— not set —</SelectItem>
                    <SelectItem value="Base">Base</SelectItem>
                    <SelectItem value="Wall">Wall</SelectItem>
                    <SelectItem value="Tall">Tall</SelectItem>
                    <SelectItem value="Vanity">Vanity</SelectItem>
                    <SelectItem value="ADA">ADA</SelectItem>
                    <SelectItem value="Corner">Corner</SelectItem>
                    <SelectItem value="Accessory">Accessory</SelectItem>
                    <SelectItem value="Specialty">Specialty</SelectItem>
                    <SelectItem value="Filler">Filler</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Sub-Category</Label>
                <Select
                  value={merged.subCategory ?? "__none__"}
                  onValueChange={(v) => set("subCategory", v === "__none__" ? null : v)}
                  disabled={busy}
                >
                  <SelectTrigger className={cn("w-full", !merged.subCategory && "text-muted-foreground")}>
                    <SelectValue placeholder="— none —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— none —</SelectItem>
                    <SelectItem value="Sink Base">Sink Base</SelectItem>
                    <SelectItem value="Drawer Base">Drawer Base</SelectItem>
                    <SelectItem value="Corner Base">Corner Base</SelectItem>
                    <SelectItem value="Blind Corner">Blind Corner</SelectItem>
                    <SelectItem value="Lazy Susan">Lazy Susan</SelectItem>
                    <SelectItem value="Oven Base">Oven Base</SelectItem>
                    <SelectItem value="Range Base">Range Base</SelectItem>
                    <SelectItem value="Microwave">Microwave</SelectItem>
                    <SelectItem value="Refrigerator">Refrigerator</SelectItem>
                    <SelectItem value="Pantry">Pantry</SelectItem>
                    <SelectItem value="Utility">Utility</SelectItem>
                    <SelectItem value="Open Shelf">Open Shelf</SelectItem>
                    <SelectItem value="Glass Door">Glass Door</SelectItem>
                    <SelectItem value="Decorative End Panel">Decorative End Panel</SelectItem>
                    <SelectItem value="Roll-Out Tray">Roll-Out Tray</SelectItem>
                    <SelectItem value="Trim &amp; Molding">Trim &amp; Molding</SelectItem>
                    <SelectItem value="Filler Panel">Filler Panel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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

                {/* Door Orientation */}
                {(merged.numberOfDoors ?? 0) >= 2 && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Door Orientation</Label>
                    <Select
                      value={merged.doorOrientation ?? "__none__"}
                      onValueChange={(v) => set("doorOrientation", v === "__none__" ? null : v)}
                      disabled={busy}
                    >
                      <SelectTrigger className={cn("w-full", !merged.doorOrientation && "text-muted-foreground")}>
                        <SelectValue placeholder="— default (side by side) —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— default (side by side) —</SelectItem>
                        <SelectItem value="side-by-side">Side by Side (left/right)</SelectItem>
                        <SelectItem value="stacked">Stacked (top/bottom)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">For pantries or tall cabinets with 2+ doors arranged vertically, choose "Stacked".</p>
                  </div>
                )}

                {/* Corner Type */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Corner Cabinet Type</Label>
                  <Select
                    value={merged.cornerType ?? "__none__"}
                    onValueChange={(v) => set("cornerType", v === "__none__" ? null : v)}
                    disabled={busy}
                  >
                    <SelectTrigger className={cn("w-full", !merged.cornerType && "text-muted-foreground")}>
                      <SelectValue placeholder="— standard (not a corner) —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— standard (not a corner) —</SelectItem>
                      <SelectItem value="lazy-susan">Lazy Susan (LS)</SelectItem>
                      <SelectItem value="blind-corner">Blind Corner (BBC / WBC)</SelectItem>
                      <SelectItem value="diagonal">Diagonal Corner (DC / WDC)</SelectItem>
                      <SelectItem value="pie-cut">Pie-Cut Lazy Susan</SelectItem>
                      <SelectItem value="l-shape">L-Shape Corner</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Controls how this cabinet is rendered in the design tool plan view and elevation.</p>
                </div>

                {/* Appliance Opening */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Appliance Opening</Label>
                  <Select
                    value={merged.openingType ?? "__none__"}
                    onValueChange={(v) => set("openingType", v === "__none__" ? null : v)}
                    disabled={busy}
                  >
                    <SelectTrigger className={cn("w-full", !merged.openingType && "text-muted-foreground")}>
                      <SelectValue placeholder="— none —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— none —</SelectItem>
                      <SelectItem value="top">Top (doors above opening)</SelectItem>
                      <SelectItem value="middle">Middle (doors above, drawers below)</SelectItem>
                      <SelectItem value="bottom">Bottom (opening above drawers)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Set for oven, microwave, or appliance cabinets that have a cutout opening.</p>
                </div>

                {/* Door Height (shown when opening type is set) */}
                {merged.openingType && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Door Height (inches)</Label>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="e.g. 18.5"
                      value={merged.doorHeight ?? ""}
                      onChange={(e) => set("doorHeight", e.target.value || null)}
                      disabled={busy}
                      className="w-full"
                    />
                    <p className="text-[11px] text-muted-foreground">Height of the door panels. The opening size is calculated from total height minus door/drawer heights.</p>
                  </div>
                )}

                {/* Drawer Height (shown when drawers > 0) */}
                {(merged.numberOfDrawers ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Drawer Height (inches)</Label>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="e.g. 6"
                      value={merged.drawerHeight ?? ""}
                      onChange={(e) => set("drawerHeight", e.target.value || null)}
                      disabled={busy}
                      className="w-full"
                    />
                    <p className="text-[11px] text-muted-foreground">Height of each drawer front in inches.</p>
                  </div>
                )}

                {/* Door / Drawer Layout Preview — live preview of the door+drawer arrangement */}
                {(merged.numberOfDoors !== null || merged.numberOfDrawers !== null || merged.openingType) && (
                  <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Layout Preview</p>
                    <div className="flex justify-center">
                      <DoorDrawerDiagram
                        cabinet={{
                          masterCode: merged.masterCode,
                          description: merged.description,
                          category: merged.category,
                          subCategory: merged.subCategory,
                          width: merged.width,
                          height: merged.height,
                          numberOfDoors: merged.numberOfDoors,
                          numberOfDrawers: merged.numberOfDrawers,
                          openingType: merged.openingType,
                          doorHeight: merged.doorHeight,
                          drawerHeight: merged.drawerHeight,
                          doorOrientation: merged.doorOrientation,
                        }}
                        width={160}
                      />
                    </div>
                  </div>
                )}
                {/* Blind Corner Pull Spec — auto-shown for BBC/WBC/BLIND codes */}
                {isBlindCornerCode(merged.masterCode, merged.description) && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-50/10 dark:bg-amber-900/10 px-4 py-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Blind Corner Pull Spec</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The pull range controls how far this cabinet slides out from the corner. The designer enforces these limits when placing the cabinet.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <DimInput
                        label="Min Pull"
                        value={merged.minPull}
                        onChange={(v) => set("minPull", v)}
                        unit='"'
                        disabled={busy}
                      />
                      <DimInput
                        label="Max Pull"
                        value={merged.maxPull}
                        onChange={(v) => set("maxPull", v)}
                        unit='"'
                        disabled={busy}
                      />
                      <DimInput
                        label="Opening Width"
                        value={merged.openingWidth}
                        onChange={(v) => set("openingWidth", v)}
                        unit='"'
                        disabled={busy}
                      />
                    </div>
                    {(!merged.minPull || !merged.maxPull) && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Min and Max Pull are required — the designer defaults to 3–6" until set.
                      </p>
                    )}
                  </div>
                )}

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

            {/* Visibility / Permissions */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Visibility & Permissions</Label>
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {([
                  { field: "showInCatalog" as const, label: "Show in Catalog", desc: "Visible on the public storefront" },
                  { field: "showInDesigner" as const, label: "Show in Designer", desc: "Available in the 2D design tool" },
                  { field: "showIn2020" as const, label: "Show in 2020", desc: "Exported to 2020 Design catalog" },
                  { field: "isActive" as const, label: "Active", desc: "Cabinet is active in the system" },
                ] as const).map(({ field, label, desc }) => (
                  <div key={field} className="flex items-center justify-between px-4 py-3 bg-background">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      checked={merged[field] !== false}
                      onCheckedChange={(v) => set(field, v)}
                      disabled={busy}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Config Verified ── */}
            <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: merged.configVerified ? 'var(--color-green-300)' : 'var(--color-border)', background: merged.configVerified ? 'oklch(0.95 0.02 145)' : 'transparent' }}>
              <div>
                <p className="text-sm font-medium">{merged.configVerified ? "✅ Verified" : "Mark as Verified"}</p>
                <p className="text-xs text-muted-foreground">
                  {merged.configVerified && merged.configVerifiedAt
                    ? `Verified on ${new Date(merged.configVerifiedAt).toLocaleDateString()}`
                    : "Check this when you've reviewed all fields and everything is correct"}
                </p>
              </div>
              <Switch
                checked={merged.configVerified === true}
                onCheckedChange={(v) => set("configVerified", v)}
                disabled={busy}
              />
            </div>

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
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">
                  Assembled cabinet dimensions and package/shipping dimensions. All values in inches unless noted.
                </p>
                {measurementSource && (
                  <p className="text-xs mt-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    <span className="text-green-600 dark:text-green-400">{measurementSource}</span>
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                disabled={busy}
                onClick={() => {
                  setMeasurementSource(null);
                  estimateMutation.mutate({
                    id: row.id,
                    width: merged.width,
                    height: merged.height,
                    depth: merged.depth,
                  });
                }}
              >
                {estimateMutation.isPending ? (
                  <Spinner className="h-3 w-3" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {estimateMutation.isPending ? "Filling…" : "Smart Fill"}
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

            {/* Auto-fill hint when all weight/pkg fields are empty */}
            {!merged.weight && !merged.pkgLength && !merged.pkgWeight && !estimateMutation.isPending && !measurementSource && (
              <p className="text-xs text-muted-foreground italic">
                No weight or package data yet. Click "Smart Fill" to pull from the master sheet or estimate via AI.
              </p>
            )}

            {/* ── Corner Cabinet Measurements (conditional) ── */}
            {merged.cornerType === "lazy-susan" && (
              <div className="rounded-lg border border-blue-500/40 bg-blue-50/10 dark:bg-blue-900/10 px-4 py-3 space-y-3">
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Lazy Susan Measurements</p>
                <p className="text-xs text-muted-foreground">
                  The cabinet square is the overall footprint. Shelf radius controls the rotating shelf size.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <DimInput
                    label="Cabinet Square"
                    value={merged.cabinetSquare}
                    onChange={(v) => set("cabinetSquare", v)}
                    unit='"'
                    disabled={busy}
                  />
                  <DimInput
                    label="Shelf Radius"
                    value={merged.shelfRadius}
                    onChange={(v) => set("shelfRadius", v)}
                    unit='"'
                    disabled={busy}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Shelf Count</Label>
                    <Select
                      value={merged.shelfCount != null ? String(merged.shelfCount) : "__none__"}
                      onValueChange={(v) => set("shelfCount", v === "__none__" ? null : parseInt(v))}
                      disabled={busy}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— not set —</SelectItem>
                        {[1, 2, 3, 4].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {merged.cornerType === "diagonal" && (
              <div className="rounded-lg border border-purple-500/40 bg-purple-50/10 dark:bg-purple-900/10 px-4 py-3 space-y-3">
                <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">Diagonal Corner Measurements</p>
                <p className="text-xs text-muted-foreground">
                  Face width is the angled door opening. Leg width is the depth of each side leg. Cabinet square is the overall footprint.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <DimInput
                    label="Cabinet Square"
                    value={merged.cabinetSquare}
                    onChange={(v) => set("cabinetSquare", v)}
                    unit='"'
                    disabled={busy}
                  />
                  <DimInput
                    label="Face Width"
                    value={merged.faceWidth}
                    onChange={(v) => set("faceWidth", v)}
                    unit='"'
                    disabled={busy}
                  />
                  <DimInput
                    label="Leg Width"
                    value={merged.legWidth}
                    onChange={(v) => set("legWidth", v)}
                    unit='"'
                    disabled={busy}
                  />
                </div>
              </div>
            )}

            {merged.cornerType === "pie-cut" && (
              <div className="rounded-lg border border-green-500/40 bg-green-50/10 dark:bg-green-900/10 px-4 py-3 space-y-3">
                <p className="text-sm font-semibold text-green-600 dark:text-green-400">Pie-Cut Lazy Susan Measurements</p>
                <p className="text-xs text-muted-foreground">
                  Same as Lazy Susan but with pie-cut (kidney-shaped) shelves. Cabinet square is the overall footprint.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <DimInput
                    label="Cabinet Square"
                    value={merged.cabinetSquare}
                    onChange={(v) => set("cabinetSquare", v)}
                    unit='"'
                    disabled={busy}
                  />
                  <DimInput
                    label="Shelf Radius"
                    value={merged.shelfRadius}
                    onChange={(v) => set("shelfRadius", v)}
                    unit='"'
                    disabled={busy}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Shelf Count</Label>
                    <Select
                      value={merged.shelfCount != null ? String(merged.shelfCount) : "__none__"}
                      onValueChange={(v) => set("shelfCount", v === "__none__" ? null : parseInt(v))}
                      disabled={busy}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— not set —</SelectItem>
                        {[1, 2, 3, 4].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Aliases tab ── */}
          <TabsContent value="aliases" className="space-y-4 mt-0">
            <p className="text-xs text-muted-foreground">
              Master SKU alias codes that redirect to{" "}
              <span className="font-mono font-semibold">{row.masterCode}</span>. When any of these codes appear in an order or catalog lookup, they resolve to this cabinet.
            </p>

            {/* Add new alias */}
            <div className="flex gap-2">
              <Input
                className="h-9 text-sm font-mono flex-1"
                placeholder="e.g. VS-24 or DCW2415GD"
                value={newAliasCode}
                onChange={(e) => setNewAliasCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newAliasCode.trim()) {
                    addAliasMutation.mutate({ aliasCode: newAliasCode.trim(), masterCode });
                  }
                }}
                disabled={addAliasMutation.isPending || !masterCode}
              />
              <Button
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => {
                  if (newAliasCode.trim()) {
                    addAliasMutation.mutate({ aliasCode: newAliasCode.trim(), masterCode });
                  }
                }}
                disabled={!newAliasCode.trim() || addAliasMutation.isPending || !masterCode}
              >
                {addAliasMutation.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                Add
              </Button>
            </div>

            {/* Alias list */}
            {aliasesLoading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner className="h-5 w-5 text-muted-foreground" />
              </div>
            ) : !skuAliases || skuAliases.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
                No alias codes yet. Add one above.
              </div>
            ) : (
              <div className="space-y-1.5">
                {skuAliases.map((alias) => (
                  <div
                    key={alias.id}
                    className={cn(
                      "flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm",
                      alias.conflictStatus === "conflict"
                        ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                        : "border-border bg-muted/30"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold truncate">{alias.aliasCode}</span>
                      {alias.conflictStatus === "conflict" && (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 gap-1 shrink-0">
                          <AlertTriangle className="h-3 w-3" />
                          Conflict
                        </Badge>
                      )}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          disabled={deleteAliasMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove alias?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the mapping{" "}
                            <strong className="font-mono">{alias.aliasCode}</strong> →{" "}
                            <strong className="font-mono">{alias.masterCode}</strong>. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteAliasMutation.mutate({ id: alias.id })}
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}

            {!masterCode && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                This cabinet has no master code set. Add a master code in the Details tab before managing aliases.
              </p>
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

    {/* ── Image Replacement Confirmation Dialog ── */}
    <Dialog open={imageConfirmOpen} onOpenChange={(v) => { if (!v) { setPendingImageUrl(null); setImageConfirmOpen(false); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Replace Cabinet Image</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            A catalog image already exists for <span className="font-semibold text-foreground">{row.masterCode}</span>. How should the new image be applied?
          </p>

          {/* Side-by-side: New image + Designer rendering */}
          <div className="grid grid-cols-2 gap-4">
            {/* New uploaded image */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground text-center">New Catalog Image</p>
              <div className="h-32 rounded-lg border border-border bg-muted/20 flex items-center justify-center overflow-hidden">
                {pendingImageUrl ? (
                  <img src={pendingImageUrl} alt="new" className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
            </div>
            {/* Designer rendering */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground text-center">Designer Rendering</p>
              <div className="h-32 rounded-lg border border-border bg-muted/20 flex items-center justify-center overflow-hidden">
                <DoorDrawerDiagram
                  cabinet={{
                    masterCode: merged.masterCode,
                    description: merged.description,
                    category: merged.category,
                    subCategory: merged.subCategory,
                    width: merged.width,
                    height: merged.height,
                    numberOfDoors: merged.numberOfDoors,
                    numberOfDrawers: merged.numberOfDrawers,
                    openingType: merged.openingType,
                    doorHeight: merged.doorHeight,
                    drawerHeight: merged.drawerHeight,
                    doorOrientation: merged.doorOrientation,
                  }}
                  width={120}
                />
              </div>
            </div>
          </div>

          {/* Scope selection buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="rounded-lg border-2 border-primary bg-primary/5 p-3 text-left transition-all hover:bg-primary/10"
              disabled={setImageMutation.isPending}
              onClick={() => {
                if (!pendingImageUrl) return;
                setImageMutation.mutate({
                  cabinetId: row.id,
                  distributorId: 210001, // Ashford as default
                  imageUrl: pendingImageUrl,
                  scope: "global",
                });
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">All distributors</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Replace the master image — applies to {distributorsList?.length ?? 3} distributor lines
              </p>
            </button>
            <button
              type="button"
              className="rounded-lg border-2 border-border p-3 text-left transition-all hover:border-primary/40 hover:bg-muted/30"
              disabled={setImageMutation.isPending}
              onClick={() => {
                if (!pendingImageUrl) return;
                // Save as distributor-specific override (Ashford = 210001 source of truth)
                setImageMutation.mutate({
                  cabinetId: row.id,
                  distributorId: 210001,
                  imageUrl: pendingImageUrl,
                  scope: "line",
                });
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">This line only</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Save as a distributor-specific override (does not change other lines)
              </p>
            </button>
          </div>

          {setImageMutation.isPending && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Saving…
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setPendingImageUrl(null); setImageConfirmOpen(false); }} disabled={setImageMutation.isPending}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>);
}

// ─── Main component ───────────────────────────────────────────────────────────
export function CabinetConfigAdmin() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("");
  const [unconfiguredOnly, setUnconfiguredOnly] = useState(false);
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "verified" | "unverified">("all");
  const [page, setPage] = useState(0);
  const [editRow, setEditRow] = useState<CabinetRow | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.cabinets.adminListCabinetConfig.useQuery({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    category: category || undefined,
    unconfiguredOnly,
    verifiedFilter,
  });

  const { data: dbCatsList } = trpc.cabinetCategories.list.useQuery();
  const categories = dbCatsList && dbCatsList.length > 0
    ? dbCatsList.map((c) => c.name)
    : ["Base","Wall","Tall","Corner","Drawer","Specialty","Vanity","Pantry","Island","Filler","Molding","Accessory"];

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
        <Select value={verifiedFilter} onValueChange={(v) => { setVerifiedFilter(v as "all" | "verified" | "unverified"); setPage(0); }}>
          <SelectTrigger className="h-8 text-sm w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All (verified)</SelectItem>
            <SelectItem value="verified">✅ Verified only</SelectItem>
            <SelectItem value="unverified">❌ Unverified only</SelectItem>
          </SelectContent>
        </Select>
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
                <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs w-24">Preview</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-28">Code</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Description</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-20 hidden sm:table-cell">W×H</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-32 hidden md:table-cell">Config</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-24">Last Saved</th>
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
                      <div className="flex items-center gap-1">
                        {/* Catalog image thumbnail */}
                        <div className="w-10 h-10 rounded border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                          {row.catalogImageUrl ? (
                            <img src={row.catalogImageUrl} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/40" />
                          )}
                        </div>
                        {/* Designer rendering thumbnail */}
                        <div className="w-10 h-10 rounded border border-border bg-white flex items-center justify-center overflow-hidden shrink-0">
                          <DoorDrawerDiagram
                            cabinet={{
                              masterCode: row.masterCode,
                              description: row.description,
                              category: row.category,
                              subCategory: row.subCategory,
                              width: row.width ? parseFloat(row.width) : null,
                              height: row.height ? parseFloat(row.height) : null,
                              depth: row.depth ? parseFloat(row.depth) : null,
                              numberOfDoors: row.numberOfDoors,
                              numberOfDrawers: row.numberOfDrawers,
                              openingType: row.openingType,
                              doorHeight: row.doorHeight ? parseFloat(row.doorHeight) : null,
                              drawerHeight: row.drawerHeight ? parseFloat(row.drawerHeight) : null,
                            }}
                            width={38}
                          />
                        </div>
                      </div>
                    </td>
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
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {row.configVerified ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Verified
                          </span>
                        ) : row.configuredAt ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-medium">
                            ✅ Saved
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">—</span>
                        )}
                      </div>
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
