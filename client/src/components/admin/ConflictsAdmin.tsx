import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Link2,
  X,
  PlusCircle,
  ArrowRightCircle,
  Package,
  DollarSign,
} from "lucide-react";

function fmtDim(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `${n % 1 === 0 ? n.toFixed(0) : n}"`;
}

function fmtPrice(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `$${n.toFixed(2)}`;
}

type ConflictItem = {
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
  conflictReason: string | null;
  skuCount: number;
  distributorNames: string[];
  doorStyleNames: string[];
  styleIds: number[];
  aliases?: string[];
  skus?: Array<{
    id: number;
    distributorSku: string | null;
    platformSku: string | null;
    yourCost: string | null;
    listPrice: string | null;
    wholesalePrice: string | null;
    contractorPrice: string | null;
    homeownerPrice: string | null;
    isAvailable: boolean;
    isPublished: boolean;
    styleName: string | null;
    distributorName: string | null;
    conflictStatus: string | null;
    conflictReason: string | null;
  }>;
};

type EditForm = {
  description: string;
  category: string;
  subCategory: string;
  width: string;
  height: string;
  depth: string;
  weight: string;
  pkgLength: string;
  pkgWidth: string;
  pkgHeight: string;
  pkgWeight: string;
  catalogImageUrl: string;
  conflictReason: string;
  styleId: string;
};

type NewMasterForm = {
  masterCode: string;
  description: string;
  category: string;
  subCategory: string;
  width: string;
  height: string;
  depth: string;
  weight: string;
  pkgLength: string;
  pkgWidth: string;
  pkgHeight: string;
  pkgWeight: string;
  catalogImageUrl: string;
};

const CUSTOM_CATEGORY = "__custom__";

function EditConflictDialog({
  cabinet,
  open,
  onOpenChange,
}: {
  cabinet: ConflictItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: categoryOptions } = trpc.cabinets.allCategories.useQuery();
  const { data: styleOptions } = trpc.cabinets.doorStyleOptions.useQuery();
  const currentStyleId = cabinet.styleIds.length === 1 ? String(cabinet.styleIds[0]) : "";

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"edit" | "new-master" | "map-existing">("edit");

  // ── Edit & Keep in Review form ─────────────────────────────────────────────
  const [form, setForm] = useState<EditForm>({
    description: cabinet.description ?? "",
    category: cabinet.category ?? "",
    subCategory: cabinet.subCategory ?? "",
    width: cabinet.width ?? "",
    height: cabinet.height ?? "",
    depth: cabinet.depth ?? "",
    weight: cabinet.weight ?? "",
    pkgLength: cabinet.pkgLength ?? "",
    pkgWidth: cabinet.pkgWidth ?? "",
    pkgHeight: cabinet.pkgHeight ?? "",
    pkgWeight: cabinet.pkgWeight ?? "",
    catalogImageUrl: cabinet.catalogImageUrl ?? "",
    conflictReason: cabinet.conflictReason ?? "",
    styleId: currentStyleId,
  });
  const knownCats = categoryOptions ?? [];
  const [customCat, setCustomCat] = useState(false);
  const categoryIsKnown = form.category === "" || knownCats.includes(form.category);
  const showCustomCat = customCat || (!categoryIsKnown && form.category !== "");

  const update = trpc.cabinets.updateConflictCabinet.useMutation({
    onSuccess: (_d, vars) => {
      utils.cabinets.conflicts.invalidate();
      onOpenChange(false);
      toast.success(
        vars.clearAfter
          ? "Saved — conflict cleared and product is live again."
          : "Conflict product updated.",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const setF = (k: keyof EditForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const editPayload = (clearAfter: boolean) => ({
    id: cabinet.id,
    description: form.description.trim(),
    category: form.category.trim(),
    subCategory: form.subCategory.trim() === "" ? null : form.subCategory.trim(),
    width: form.width.trim() === "" ? null : form.width.trim(),
    height: form.height.trim() === "" ? null : form.height.trim(),
    depth: form.depth.trim() === "" ? null : form.depth.trim(),
    weight: form.weight.trim() === "" ? null : form.weight.trim(),
    pkgLength: form.pkgLength.trim() === "" ? null : form.pkgLength.trim(),
    pkgWidth: form.pkgWidth.trim() === "" ? null : form.pkgWidth.trim(),
    pkgHeight: form.pkgHeight.trim() === "" ? null : form.pkgHeight.trim(),
    pkgWeight: form.pkgWeight.trim() === "" ? null : form.pkgWeight.trim(),
    catalogImageUrl: form.catalogImageUrl.trim() === "" ? null : form.catalogImageUrl.trim(),
    conflictReason: form.conflictReason.trim() === "" ? null : form.conflictReason.trim(),
    styleId:
      form.styleId !== "" && form.styleId !== currentStyleId ? Number(form.styleId) : undefined,
    clearAfter,
  });
  const editInvalid = form.description.trim() === "" || form.category.trim() === "";

  // ── Assign as New Master form ──────────────────────────────────────────────
  const [nm, setNm] = useState<NewMasterForm>({
    masterCode: cabinet.masterCode ?? "",
    description: cabinet.description ?? "",
    category: cabinet.category ?? "",
    subCategory: cabinet.subCategory ?? "",
    width: cabinet.width ?? "",
    height: cabinet.height ?? "",
    depth: cabinet.depth ?? "",
    weight: cabinet.weight ?? "",
    pkgLength: cabinet.pkgLength ?? "",
    pkgWidth: cabinet.pkgWidth ?? "",
    pkgHeight: cabinet.pkgHeight ?? "",
    pkgWeight: cabinet.pkgWeight ?? "",
    catalogImageUrl: cabinet.catalogImageUrl ?? "",
  });
  const setNmF = (k: keyof NewMasterForm, v: string) => setNm((f) => ({ ...f, [k]: v }));
  const promote = trpc.cabinets.adminPromoteToNewMaster.useMutation({
    onSuccess: (d: { ok: boolean; masterCode: string }) => {
      utils.cabinets.conflicts.invalidate();
      onOpenChange(false);
      toast.success(`Assigned as new master "${d.masterCode}" — conflict cleared.`);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const nmInvalid =
    nm.masterCode.trim() === "" ||
    nm.description.trim() === "" ||
    nm.category.trim() === "";

  // ── Map to Existing Master form ────────────────────────────────────────────
  const [targetCode, setTargetCode] = useState("");
  const [pickerCategory, setPickerCategory] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedMaster, setSelectedMaster] = useState<{ id: number; masterCode: string; description: string | null; category: string | null; width: string | null; height: string | null; depth: string | null } | null>(null);
  const pickerQuery = trpc.cabinets.list.useQuery(
    { category: pickerCategory || undefined, search: pickerSearch || undefined, limit: 50 },
    { enabled: pickerCategory !== "" || pickerSearch.trim().length >= 2 }
  );
  const mapMutation = trpc.cabinets.adminMapConflictToExisting.useMutation({
    onSuccess: (d) => {
      utils.cabinets.conflicts.invalidate();
      onOpenChange(false);
      toast.success(`All SKUs moved to "${d.targetMasterCode}" — conflict cabinet deactivated.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const isPending = update.isPending || promote.isPending || mapMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono">{cabinet.masterCode}</span>
            <Badge variant="destructive" className="text-xs">Conflict</Badge>
          </DialogTitle>
          <DialogDescription>
            Choose how to resolve this conflict. You can edit the product data, assign it as a brand-new master cabinet, or map its SKUs to an existing master.
          </DialogDescription>
        </DialogHeader>

        {/* SKU pricing summary */}
        {cabinet.skus && cabinet.skus.length > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <DollarSign className="h-4 w-4 text-green-600" />
              Captured Pricing ({cabinet.skus.length} SKU{cabinet.skus.length !== 1 ? "s" : ""})
            </div>
            <div className="grid gap-1.5">
              {cabinet.skus.map((sku) => (
                <div key={sku.id} className="grid grid-cols-6 gap-2 text-xs items-center">
                  <span className="font-mono text-muted-foreground col-span-2 truncate">
                    {sku.platformSku || sku.distributorSku || `SKU #${sku.id}`}
                  </span>
                  <span className="text-green-700 font-semibold">Cost: {fmtPrice(sku.yourCost)}</span>
                  <span className="text-muted-foreground">List: {fmtPrice(sku.listPrice)}</span>
                  <span className="text-muted-foreground">Whsl: {fmtPrice(sku.wholesalePrice)}</span>
                  <span className="text-muted-foreground">HO: {fmtPrice(sku.homeownerPrice)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="edit" className="flex-1 gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Edit & Review
            </TabsTrigger>
            <TabsTrigger value="new-master" className="flex-1 gap-1.5">
              <PlusCircle className="h-3.5 w-3.5" />
              Assign New Master
            </TabsTrigger>
            <TabsTrigger value="map-existing" className="flex-1 gap-1.5">
              <ArrowRightCircle className="h-3.5 w-3.5" />
              Map to Existing
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Edit & Keep in Review ────────────────────────────── */}
          <TabsContent value="edit" className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Fix the product data. Save & clear to put it live, or just save to keep it in review.
            </p>
            <div className="grid gap-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setF("description", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Category</Label>
                {showCustomCat ? (
                  <div className="flex gap-1.5">
                    <Input
                      value={form.category}
                      onChange={(e) => setF("category", e.target.value)}
                      placeholder="New category name"
                      autoFocus
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCustomCat(false);
                        if (!knownCats.includes(form.category)) setF("category", knownCats[0] ?? "");
                      }}
                    >
                      List
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={knownCats.includes(form.category) ? form.category : ""}
                    onValueChange={(v) => {
                      if (v === CUSTOM_CATEGORY) { setCustomCat(true); setF("category", ""); }
                      else setF("category", v);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {knownCats.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                      <SelectItem value={CUSTOM_CATEGORY}>+ New category…</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label>Sub-category</Label>
                <Input value={form.subCategory} onChange={(e) => setF("subCategory", e.target.value)} placeholder="—" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Door style</Label>
              <Select value={form.styleId} onValueChange={(v) => setF("styleId", v)}>
                <SelectTrigger><SelectValue placeholder="Select the correct door style" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {(styleOptions ?? []).map((opt) => (
                    <SelectItem key={opt.id} value={String(opt.id)}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cabinet.styleIds.length > 1 && (
                <p className="text-xs text-amber-700">
                  This item is under {cabinet.styleIds.length} door styles. Picking one re-points all SKUs.
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Width (in)</Label>
                <Input inputMode="decimal" value={form.width} onChange={(e) => setF("width", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Height (in)</Label>
                <Input inputMode="decimal" value={form.height} onChange={(e) => setF("height", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Depth (in)</Label>
                <Input inputMode="decimal" value={form.depth} onChange={(e) => setF("depth", e.target.value)} />
              </div>
            </div>
            {/* Aliases */}
            {cabinet.aliases && cabinet.aliases.length > 0 && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Known aliases (distributor codes)</Label>
                <div className="flex flex-wrap gap-1">
                  {cabinet.aliases.map((a) => (
                    <span key={a} className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{a}</span>
                  ))}
                </div>
              </div>
            )}
            {/* Weight & Shipping */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Item weight (lbs)</Label>
                <Input inputMode="decimal" value={form.weight} onChange={(e) => setF("weight", e.target.value)} placeholder="—" />
              </div>
              <div className="grid gap-1.5">
                <Label>Pkg weight (lbs)</Label>
                <Input inputMode="decimal" value={form.pkgWeight} onChange={(e) => setF("pkgWeight", e.target.value)} placeholder="—" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Pkg length (in)</Label>
                <Input inputMode="decimal" value={form.pkgLength} onChange={(e) => setF("pkgLength", e.target.value)} placeholder="—" />
              </div>
              <div className="grid gap-1.5">
                <Label>Pkg width (in)</Label>
                <Input inputMode="decimal" value={form.pkgWidth} onChange={(e) => setF("pkgWidth", e.target.value)} placeholder="—" />
              </div>
              <div className="grid gap-1.5">
                <Label>Pkg height (in)</Label>
                <Input inputMode="decimal" value={form.pkgHeight} onChange={(e) => setF("pkgHeight", e.target.value)} placeholder="—" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Catalog image URL</Label>
              <Input value={form.catalogImageUrl} onChange={(e) => setF("catalogImageUrl", e.target.value)} placeholder="https://…" />
              {form.catalogImageUrl && (
                <img src={form.catalogImageUrl} alt="preview" className="mt-1 h-20 w-20 rounded border object-contain" />
              )}
            </div>
            {/* SKU Pricing Rows */}
            {cabinet.skus && cabinet.skus.length > 0 && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Captured SKU pricing</Label>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-2 py-1 text-left font-medium">SKU</th>
                        <th className="px-2 py-1 text-left font-medium">Style</th>
                        <th className="px-2 py-1 text-right font-medium">Cost</th>
                        <th className="px-2 py-1 text-right font-medium">List</th>
                        <th className="px-2 py-1 text-right font-medium">Wholesale</th>
                        <th className="px-2 py-1 text-right font-medium">Contractor</th>
                        <th className="px-2 py-1 text-right font-medium">Homeowner</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cabinet.skus.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/30">
                          <td className="px-2 py-1 font-mono">{s.platformSku ?? s.distributorSku ?? "—"}</td>
                          <td className="px-2 py-1">{s.styleName ?? "—"}</td>
                          <td className="px-2 py-1 text-right font-semibold text-green-700">{fmtPrice(s.yourCost)}</td>
                          <td className="px-2 py-1 text-right">{fmtPrice(s.listPrice)}</td>
                          <td className="px-2 py-1 text-right">{fmtPrice(s.wholesalePrice)}</td>
                          <td className="px-2 py-1 text-right">{fmtPrice(s.contractorPrice)}</td>
                          <td className="px-2 py-1 text-right">{fmtPrice(s.homeownerPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label>Review note</Label>
              <Textarea
                rows={2}
                value={form.conflictReason}
                onChange={(e) => setF("conflictReason", e.target.value)}
                placeholder="Why is this held / what was fixed?"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button variant="outline" onClick={() => update.mutate(editPayload(false))} disabled={isPending || editInvalid}>
                Save changes
              </Button>
              <Button onClick={() => update.mutate(editPayload(true))} disabled={isPending || editInvalid} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Save &amp; clear
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ── Tab 2: Assign as Brand-New Master ───────────────────────── */}
          <TabsContent value="new-master" className="space-y-3 pt-2">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
              <strong>Assign as New Master</strong> — this cabinet code was not found in the catalog. Fill in all required fields to create a new master record and clear the conflict in one step.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Master Code <span className="text-destructive">*</span></Label>
                <Input
                  value={nm.masterCode}
                  onChange={(e) => setNmF("masterCode", e.target.value.toUpperCase())}
                  placeholder="e.g. WR2412"
                  className="font-mono"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Category <span className="text-destructive">*</span></Label>
                <Select value={nm.category} onValueChange={(v) => setNmF("category", v)}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {knownCats.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Description <span className="text-destructive">*</span></Label>
              <Input value={nm.description} onChange={(e) => setNmF("description", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Sub-category</Label>
                <Input value={nm.subCategory} onChange={(e) => setNmF("subCategory", e.target.value)} placeholder="—" />
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Package className="h-4 w-4" /> Dimensions
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Width (in)</Label>
                <Input inputMode="decimal" value={nm.width} onChange={(e) => setNmF("width", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Height (in)</Label>
                <Input inputMode="decimal" value={nm.height} onChange={(e) => setNmF("height", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Depth (in)</Label>
                <Input inputMode="decimal" value={nm.depth} onChange={(e) => setNmF("depth", e.target.value)} />
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Package className="h-4 w-4" /> Shipping / Packaging
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Item weight (lbs)</Label>
                <Input inputMode="decimal" value={nm.weight} onChange={(e) => setNmF("weight", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Pkg weight (lbs)</Label>
                <Input inputMode="decimal" value={nm.pkgWeight} onChange={(e) => setNmF("pkgWeight", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Pkg length (in)</Label>
                <Input inputMode="decimal" value={nm.pkgLength} onChange={(e) => setNmF("pkgLength", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Pkg width (in)</Label>
                <Input inputMode="decimal" value={nm.pkgWidth} onChange={(e) => setNmF("pkgWidth", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Pkg height (in)</Label>
                <Input inputMode="decimal" value={nm.pkgHeight} onChange={(e) => setNmF("pkgHeight", e.target.value)} />
              </div>
            </div>
            <Separator />
            <div className="grid gap-1.5">
              <Label>Catalog image URL</Label>
              <Input
                value={nm.catalogImageUrl}
                onChange={(e) => setNmF("catalogImageUrl", e.target.value)}
                placeholder="https://…"
              />
              {nm.catalogImageUrl && (
                <img
                  src={nm.catalogImageUrl}
                  alt="preview"
                  className="h-20 w-20 object-contain rounded border"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button
                onClick={() =>
                  promote.mutate({
                    id: cabinet.id,
                    masterCode: nm.masterCode.trim(),
                    description: nm.description.trim(),
                    category: nm.category.trim(),
                    subCategory: nm.subCategory.trim() || null,
                    width: nm.width.trim() || null,
                    height: nm.height.trim() || null,
                    depth: nm.depth.trim() || null,
                    weight: nm.weight.trim() || null,
                    pkgLength: nm.pkgLength.trim() || null,
                    pkgWidth: nm.pkgWidth.trim() || null,
                    pkgHeight: nm.pkgHeight.trim() || null,
                    pkgWeight: nm.pkgWeight.trim() || null,
                    catalogImageUrl: nm.catalogImageUrl.trim() || null,
                  })
                }
                disabled={isPending || nmInvalid}
                className="gap-1.5"
              >
                <PlusCircle className="h-4 w-4" />
                Create master &amp; clear conflict
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ── Tab 3: Map to Existing Master ───────────────────────────── */}
          <TabsContent value="map-existing" className="space-y-3 pt-2">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <strong>Map to Existing Master</strong> — all {cabinet.skuCount} SKU{cabinet.skuCount !== 1 ? "s" : ""} will be moved to the target cabinet, and this conflict record will be deactivated. Use this when the import code is an alias or variant of an existing master.
            </div>

            {/* Category filter */}
            <div className="grid gap-1.5">
              <Label>Filter by category</Label>
              <Select value={pickerCategory} onValueChange={(v) => { setPickerCategory(v === "__all__" ? "" : v); setSelectedMaster(null); setTargetCode(""); }}>
                <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All categories</SelectItem>
                  {knownCats.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Search box */}
            <div className="grid gap-1.5">
              <Label>Search by code or description</Label>
              <Input
                placeholder="e.g. W30, Base Cabinet, WR2412…"
                value={pickerSearch}
                onChange={(e) => { setPickerSearch(e.target.value); setSelectedMaster(null); setTargetCode(""); }}
              />
            </div>

            {/* Results list */}
            {(pickerCategory !== "" || pickerSearch.trim().length >= 2) && (
              <div className="rounded-md border bg-popover shadow-sm max-h-52 overflow-y-auto">
                {pickerQuery.isLoading && (
                  <div className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Spinner className="h-3 w-3" /> Searching…</div>
                )}
                {!pickerQuery.isLoading && (pickerQuery.data?.items ?? []).length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">No cabinets found — try a different category or search term.</div>
                )}
                {(pickerQuery.data?.items ?? []).map((cab) => (
                  <button
                    key={cab.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-3 ${
                      selectedMaster?.id === cab.id ? "bg-accent" : ""
                    }`}
                    onClick={() => { setSelectedMaster(cab as typeof selectedMaster); setTargetCode(cab.masterCode); }}
                  >
                    <span className="font-mono font-semibold shrink-0 w-24 truncate">{cab.masterCode}</span>
                    <span className="text-muted-foreground flex-1 truncate">{cab.description}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {[cab.width && `${cab.width}"W`, cab.height && `${cab.height}"H`, cab.depth && `${cab.depth}"D`].filter(Boolean).join(" × ")}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">{cab.category}</Badge>
                  </button>
                ))}
              </div>
            )}

            {/* Selected cabinet summary */}
            {selectedMaster && (
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">Selected target:</span>
                  <span className="font-mono font-semibold">{selectedMaster.masterCode}</span>
                  <Badge variant="outline" className="text-xs">{selectedMaster.category}</Badge>
                </div>
                <div className="text-muted-foreground">{selectedMaster.description}</div>
                {selectedMaster.width && (
                  <div className="text-xs text-muted-foreground">
                    {selectedMaster.width}"W × {selectedMaster.height}"H × {selectedMaster.depth}"D
                  </div>
                )}
              </div>
            )}

            {/* Manual override */}
            {!selectedMaster && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Or type master code directly</Label>
                <Input
                  value={targetCode}
                  onChange={(e) => setTargetCode(e.target.value.toUpperCase())}
                  placeholder="e.g. W3012"
                  className="font-mono"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              All {cabinet.skuCount} SKU{cabinet.skuCount !== 1 ? "s" : ""} from <strong>{cabinet.masterCode}</strong> will move to the selected master. The conflict cabinet will be deactivated.
            </p>
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={isPending || targetCode.trim() === ""}
                    className="gap-1.5"
                  >
                    <ArrowRightCircle className="h-4 w-4" />
                    Map &amp; deactivate conflict
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Map {cabinet.masterCode} → {targetCode}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      All {cabinet.skuCount} SKU{cabinet.skuCount !== 1 ? "s" : ""} from <strong>{cabinet.masterCode}</strong> will be moved to <strong>{targetCode}</strong>. The conflict cabinet will be deactivated and will no longer appear anywhere. This cannot be undone easily.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => mapMutation.mutate({ conflictId: cabinet.id, targetMasterCode: targetCode.trim() })}
                      disabled={isPending}
                    >
                      Confirm mapping
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pending Import SKUs Section ────────────────────────────────────────────────────────────────────────────────
const CABINET_CATEGORIES_PENDING = ["Base", "Wall", "Tall", "ADA", "Vanity", "Accessory"];

function PendingCabinetPicker({ onSelect }: { onSelect: (masterCode: string) => void }) {
  const [category, setCategory] = useState("Base");
  const [search, setSearch] = useState("");
  const { data: cabinets, isLoading } = trpc.distributorAdmin.listCabinetsByCategory.useQuery(
    { category },
    { refetchOnWindowFocus: false }
  );
  const filtered = (cabinets ?? []).filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      c.masterCode.toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q) ||
      (c.subCategory ?? "").toLowerCase().includes(q)
    );
  });
  return (
    <div className="border border-border rounded-md bg-background overflow-hidden mt-2">
      <div className="flex flex-wrap gap-0.5 p-1.5 border-b border-border bg-muted/40">
        {CABINET_CATEGORIES_PENDING.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => { setCategory(cat); setSearch(""); }}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
              category === cat
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="px-2 py-1.5 border-b border-border">
        <input
          type="text"
          className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground font-mono"
          placeholder={`Filter ${category} cabinets…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Spinner className="h-3 w-3" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">No cabinets found.</div>
        ) : (
          filtered.map((cab: { id: number; masterCode: string; description: string | null; subCategory: string | null }) => (
            <button
              key={cab.id}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left transition-colors"
              onClick={() => onSelect(cab.masterCode)}
            >
              <span className="font-mono font-semibold shrink-0 min-w-[80px]">{cab.masterCode}</span>
              <span className="text-muted-foreground truncate flex-1">{cab.description}</span>
              {cab.subCategory && (
                <span className="shrink-0 text-[10px] bg-muted px-1.5 py-0.5 rounded">{cab.subCategory}</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function PendingSkusSection() {
  const { data: pending, isLoading, refetch } = trpc.distributorAdmin.listPendingSkus.useQuery({ status: "pending" });
  const resolve = trpc.distributorAdmin.resolvePendingSku.useMutation({
    onSuccess: (result: { masterCode: string; skusInserted: number }) => {
      toast.success(`Assigned to ${result.masterCode} — ${result.skusInserted} SKU rows imported`);
      refetch();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });
  const ignore = trpc.distributorAdmin.ignorePendingSku.useMutation({
    onSuccess: () => { toast.success("Ignored"); refetch(); },
  });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<Record<number, string>>({});

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground"><Spinner className="h-4 w-4" /> Loading pending codes…</div>;
  if (!pending || pending.length === 0) return (
    <div className="text-sm text-muted-foreground py-4">No unmatched import codes — all codes resolved.</div>
  );
  type PendingItem = typeof pending[number];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        These cabinet codes were not found in the master catalog during import. Pick the matching cabinet from the list, then click Assign.
      </p>
      {pending.map((item: PendingItem) => (
        <Card key={item.id} className="border-amber-200 dark:border-amber-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-semibold text-sm">{item.rawCode}</span>
                <Badge variant="outline" className="text-xs">{item.distributorName ?? `Dist #${item.distributorId}`}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {Object.keys(JSON.parse(item.pricesJson)).length} style(s) · {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
              {selectedCodes[item.id] ? (
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-400">{selectedCodes[item.id]}</span>
                  <button
                    type="button"
                    className="text-xs underline text-muted-foreground ml-1"
                    onClick={() => { setSelectedCodes((p) => ({ ...p, [item.id]: "" })); setActiveId(item.id); }}
                  >
                    Change
                  </button>
                </div>
              ) : null}
              {activeId === item.id ? (
                <div className="mb-2">
                  <PendingCabinetPicker
                    onSelect={(masterCode) => {
                      setSelectedCodes((p) => ({ ...p, [item.id]: masterCode }));
                      setActiveId(null);
                    }}
                  />
                </div>
              ) : !selectedCodes[item.id] ? (
                <button
                  type="button"
                  className="text-xs underline text-amber-700 dark:text-amber-300 mb-2"
                  onClick={() => setActiveId(item.id)}
                >
                  Pick cabinet →
                </button>
              ) : null}
              <div className="flex gap-2 mt-1">
                <Button
                  size="sm"
                  className="gap-1.5 h-8"
                  disabled={!selectedCodes[item.id]?.trim() || resolve.isPending}
                  onClick={() => resolve.mutate({ pendingId: item.id, masterCodeOrAlias: selectedCodes[item.id].trim() })}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Assign
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 h-8 text-muted-foreground"
                  onClick={() => ignore.mutate({ pendingId: item.id })}
                >
                  <X className="h-3.5 w-3.5" />
                  Ignore
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function PendingSkusTab() {
  const { data: pending } = trpc.distributorAdmin.listPendingSkus.useQuery({ status: "pending" });
  const count = pending?.length ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Unmatched Import Codes</h2>
        {count > 0 && <Badge variant="destructive">{count}</Badge>}
      </div>
      <PendingSkusSection />
    </div>
  );
}

export default function ConflictsAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.cabinets.conflicts.useQuery();
  const [editing, setEditing] = useState<ConflictItem | null>(null);
  const [styleFilter, setStyleFilter] = useState<string>("all");
  const { data: styleOptions } = trpc.cabinets.doorStyleOptions.useQuery();

  const clear = trpc.cabinets.clearConflict.useMutation({
    onSuccess: () => {
      utils.cabinets.conflicts.invalidate();
      toast.success("Conflict cleared — product is live again.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-destructive">Couldn't load conflicts: {error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const allItems = ((data ?? []) as unknown) as ConflictItem[];
  const items =
    styleFilter === "all"
      ? allItems
      : allItems.filter((c) => c.styleIds.includes(Number(styleFilter)));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium">Conflicts / Needs Review</p>
          <p className="text-amber-800">
            Products held here are hidden from the public catalog, storefront and the Design Tool
            until reviewed. Prices are preserved. Edit a product to fix what caused the conflict, or
            clear it to put the product back live.
          </p>
        </div>
      </div>

      {/* Door style filter */}
      {allItems.length > 0 && (
        <div className="flex items-center gap-3">
          <Label className="text-sm shrink-0">Filter by door style:</Label>
          <Select value={styleFilter} onValueChange={setStyleFilter}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All styles ({allItems.length})</SelectItem>
              {(styleOptions ?? []).map((opt) => {
                const count = allItems.filter((c) => c.styleIds.includes(opt.id)).length;
                if (count === 0) return null;
                return (
                  <SelectItem key={opt.id} value={String(opt.id)}>
                    {opt.label} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {styleFilter !== "all" && (
            <Button variant="ghost" size="sm" onClick={() => setStyleFilter("all")}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {allItems.length === 0 ? "No products in conflict. Everything is live." : "No conflicts for the selected door style."}
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base font-mono">{c.masterCode}</CardTitle>
                  <Badge variant="destructive">Conflict</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-foreground">{c.description}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">Category:</span> {c.category}
                    {c.subCategory ? ` / ${c.subCategory}` : ""}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Size:</span> {fmtDim(c.width)}W ×{" "}
                    {fmtDim(c.height)}H × {fmtDim(c.depth)}D
                  </span>
                  <span>
                    <span className="font-medium text-foreground">SKUs:</span> {c.skuCount}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">Distributor:</span>{" "}
                    {c.distributorNames.length ? c.distributorNames.join(", ") : "—"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">Door style:</span>{" "}
                    {c.doorStyleNames.length
                      ? c.doorStyleNames.map((n) => (
                          <Badge key={n} variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {n}
                          </Badge>
                        ))
                      : "—"}
                  </span>
                </div>
                {c.conflictReason && (
                  <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {c.conflictReason}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setEditing(c)}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit &amp; Resolve
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        Clear conflict
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear conflict for {c.masterCode}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This returns the product to live status — it will appear in the public
                          catalog, storefront and Design Tool again. Only do this after you've
                          verified the product against the catalog book.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => clear.mutate({ id: c.id })}
                          disabled={clear.isPending}
                        >
                          Clear conflict
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <EditConflictDialog
          cabinet={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}
