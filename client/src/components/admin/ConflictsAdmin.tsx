import { useState, useMemo } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Pencil, Link2, X, Plus, Search, DollarSign } from "lucide-react";

function fmtDim(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `${n % 1 === 0 ? n.toFixed(0) : n}"`;
}

function fmtMoney(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

type ConflictSkuRow = {
  skuId: number;
  cabinetId: number;
  styleId: number | null;
  distributorId: number | null;
  distributorName: string | null;
  styleName: string | null;
  styleCode: string | null;
  distributorSku: string;
  platformSku: string;
  listPrice: string | null;
  yourCost: string | null;
  wholesalePrice: string | null;
  contractorPrice: string | null;
  homeownerPrice: string | null;
  isAvailable: boolean;
  isPublished: boolean;
};

type ConflictItem = {
  id: number;
  masterCode: string;
  description: string;
  category: string;
  subCategory: string | null;
  width: string | null;
  height: string | null;
  depth: string | null;
  conflictReason: string | null;
  skuCount: number;
  distributorNames: string[];
  doorStyleNames: string[];
  styleIds: number[];
  skus?: ConflictSkuRow[];
};

type EditForm = {
  description: string;
  category: string;
  subCategory: string;
  width: string;
  height: string;
  depth: string;
  conflictReason: string;
  styleId: string;
};

type NewForm = {
  masterCode: string;
  description: string;
  category: string;
  subCategory: string;
  width: string;
  height: string;
  depth: string;
  conflictReason: string;
};

// Per-SKU price edits keyed by skuId
type SkuPriceEdits = Record<number, {
  listPrice: string;
  yourCost: string;
  wholesalePrice: string;
  contractorPrice: string;
  homeownerPrice: string;
}>;

const CUSTOM_CATEGORY = "__custom__";
const ALL_CATEGORIES = "__all__";

// ─── SKU Pricing Row ──────────────────────────────────────────────────────────
function SkuPricingRow({
  sku,
  edits,
  onChange,
  onToggleAvailable,
  onTogglePublished,
  isSaving,
}: {
  sku: ConflictSkuRow;
  edits: SkuPriceEdits[number] | undefined;
  onChange: (skuId: number, field: keyof SkuPriceEdits[number], value: string) => void;
  onToggleAvailable: (skuId: number, val: boolean) => void;
  onTogglePublished: (skuId: number, val: boolean) => void;
  isSaving: boolean;
}) {
  const e = edits ?? {
    listPrice: sku.listPrice ?? "",
    yourCost: sku.yourCost ?? "",
    wholesalePrice: sku.wholesalePrice ?? "",
    contractorPrice: sku.contractorPrice ?? "",
    homeownerPrice: sku.homeownerPrice ?? "",
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      {/* SKU identity row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-medium text-foreground">
          Platform SKU: <span className="font-mono">{sku.platformSku}</span>
        </span>
        <span className="text-muted-foreground">
          Dist SKU: <span className="font-mono">{sku.distributorSku || "—"}</span>
        </span>
        {sku.distributorName && (
          <Badge variant="outline" className="text-xs">{sku.distributorName}</Badge>
        )}
        {sku.styleName && (
          <Badge variant="secondary" className="text-xs">
            {sku.styleName}{sku.styleCode ? ` (${sku.styleCode})` : ""}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <Switch
              checked={sku.isAvailable}
              onCheckedChange={(v) => onToggleAvailable(sku.skuId, v)}
              disabled={isSaving}
              className="scale-75"
            />
            Available
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <Switch
              checked={sku.isPublished}
              onCheckedChange={(v) => onTogglePublished(sku.skuId, v)}
              disabled={isSaving}
              className="scale-75"
            />
            Published
          </label>
        </div>
      </div>

      {/* Price fields */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(
          [
            { key: "listPrice", label: "List Price" },
            { key: "yourCost", label: "Your Cost" },
            { key: "wholesalePrice", label: "Wholesale" },
            { key: "contractorPrice", label: "Contractor" },
            { key: "homeownerPrice", label: "Homeowner" },
          ] as const
        ).map(({ key, label }) => (
          <div key={key} className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">{label}</Label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
              <Input
                className="pl-5 h-7 text-xs"
                inputMode="decimal"
                placeholder="—"
                value={e[key]}
                onChange={(ev) => onChange(sku.skuId, key, ev.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Edit Dialog ─────────────────────────────────────────────────────────────
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
  const [form, setForm] = useState<EditForm>({
    description: cabinet.description ?? "",
    category: cabinet.category ?? "",
    subCategory: cabinet.subCategory ?? "",
    width: cabinet.width ?? "",
    height: cabinet.height ?? "",
    depth: cabinet.depth ?? "",
    conflictReason: cabinet.conflictReason ?? "",
    styleId: currentStyleId,
  });
  const knownCats = categoryOptions ?? [];
  const [customCat, setCustomCat] = useState(false);
  const categoryIsKnown = form.category === "" || knownCats.includes(form.category);
  const showCustomCat = customCat || (!categoryIsKnown && form.category !== "");

  // Per-SKU price edits
  const [skuPriceEdits, setSkuPriceEdits] = useState<SkuPriceEdits>({});
  // Local availability state (mirrors server until saved)
  const [skuAvailability, setSkuAvailability] = useState<Record<number, { isAvailable: boolean; isPublished: boolean }>>({});

  const skus = cabinet.skus ?? [];

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

  const updateSkuCost = trpc.pricing.adminUpdateSkuCost.useMutation({
    onError: (e: { message: string }) => toast.error(`Price save failed: ${e.message}`),
  });

  const updateSkuAvailability = trpc.doorStyles.adminUpdateSkuAvailability.useMutation({
    onError: (e: { message: string }) => toast.error(`Availability save failed: ${e.message}`),
  });

  const set = (k: keyof EditForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handlePriceChange(skuId: number, field: keyof SkuPriceEdits[number], value: string) {
    setSkuPriceEdits((prev) => {
      const sku = skus.find((s) => s.skuId === skuId);
      const existing = prev[skuId] ?? {
        listPrice: sku?.listPrice ?? "",
        yourCost: sku?.yourCost ?? "",
        wholesalePrice: sku?.wholesalePrice ?? "",
        contractorPrice: sku?.contractorPrice ?? "",
        homeownerPrice: sku?.homeownerPrice ?? "",
      };
      return { ...prev, [skuId]: { ...existing, [field]: value } };
    });
  }

  function handleToggleAvailable(skuId: number, val: boolean) {
    setSkuAvailability((prev) => {
      const sku = skus.find((s) => s.skuId === skuId);
      const existing = prev[skuId] ?? { isAvailable: sku?.isAvailable ?? true, isPublished: sku?.isPublished ?? true };
      return { ...prev, [skuId]: { ...existing, isAvailable: val } };
    });
    updateSkuAvailability.mutate({ skuId, isAvailable: val });
  }

  function handleTogglePublished(skuId: number, val: boolean) {
    setSkuAvailability((prev) => {
      const sku = skus.find((s) => s.skuId === skuId);
      const existing = prev[skuId] ?? { isAvailable: sku?.isAvailable ?? true, isPublished: sku?.isPublished ?? true };
      return { ...prev, [skuId]: { ...existing, isPublished: val } };
    });
    updateSkuAvailability.mutate({ skuId, isPublished: val });
  }

  const payload = (clearAfter: boolean) => ({
    id: cabinet.id,
    description: form.description.trim(),
    category: form.category.trim(),
    subCategory: form.subCategory.trim() === "" ? null : form.subCategory.trim(),
    width: form.width.trim() === "" ? null : form.width.trim(),
    height: form.height.trim() === "" ? null : form.height.trim(),
    depth: form.depth.trim() === "" ? null : form.depth.trim(),
    conflictReason: form.conflictReason.trim() === "" ? null : form.conflictReason.trim(),
    styleId:
      form.styleId !== "" && form.styleId !== currentStyleId ? Number(form.styleId) : undefined,
    clearAfter,
  });

  async function handleSave(clearAfter: boolean) {
    // Save any edited SKU prices first
    const pricePromises = Object.entries(skuPriceEdits).map(([skuIdStr, edits]) => {
      const skuId = Number(skuIdStr);
      const parsePrice = (v: string) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      };
      return updateSkuCost.mutateAsync({
        skuId,
        listPrice: edits.listPrice !== "" ? parsePrice(edits.listPrice) : undefined,
        yourCost: edits.yourCost !== "" ? parsePrice(edits.yourCost) : undefined,
        wholesalePrice: edits.wholesalePrice !== "" ? parsePrice(edits.wholesalePrice) : undefined,
        contractorPrice: edits.contractorPrice !== "" ? parsePrice(edits.contractorPrice) : undefined,
        homeownerPrice: edits.homeownerPrice !== "" ? parsePrice(edits.homeownerPrice) : undefined,
      });
    });
    await Promise.all(pricePromises);
    update.mutate(payload(clearAfter));
  }

  const invalid = form.description.trim() === "" || form.category.trim() === "";
  const isSaving = update.isPending || updateSkuCost.isPending || updateSkuAvailability.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono">Edit {cabinet.masterCode}</DialogTitle>
          <DialogDescription>
            Fix the product data that caused this conflict, then save. You can save and clear the
            conflict in one step once it looks right.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          {/* ── Cabinet info fields ── */}
          <div className="grid gap-1.5">
            <Label htmlFor="ec-desc">Description</Label>
            <Input id="ec-desc" value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ec-cat">Category</Label>
              {showCustomCat ? (
                <div className="flex gap-1.5">
                  <Input
                    id="ec-cat"
                    value={form.category}
                    onChange={(e) => set("category", e.target.value)}
                    placeholder="New category name"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCustomCat(false);
                      if (!knownCats.includes(form.category)) set("category", knownCats[0] ?? "");
                    }}
                  >
                    List
                  </Button>
                </div>
              ) : (
                <Select
                  value={knownCats.includes(form.category) ? form.category : ""}
                  onValueChange={(v) => {
                    if (v === CUSTOM_CATEGORY) {
                      setCustomCat(true);
                      set("category", "");
                    } else {
                      set("category", v);
                    }
                  }}
                >
                  <SelectTrigger id="ec-cat">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {knownCats.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_CATEGORY}>+ New category…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ec-sub">Sub-category</Label>
              <Input id="ec-sub" value={form.subCategory} onChange={(e) => set("subCategory", e.target.value)} placeholder="—" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ec-style">Door style</Label>
            <Select value={form.styleId} onValueChange={(v) => set("styleId", v)}>
              <SelectTrigger id="ec-style">
                <SelectValue placeholder="Select the correct door style" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(styleOptions ?? []).map((opt) => (
                  <SelectItem key={opt.id} value={String(opt.id)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cabinet.styleIds.length > 1 ? (
              <p className="text-xs text-amber-700">
                This item is carried under {cabinet.styleIds.length} door styles. Picking one will
                re-point all of its SKUs to that single style.
              </p>
            ) : form.styleId !== currentStyleId && form.styleId !== "" ? (
              <p className="text-xs text-muted-foreground">
                Saving will move this product to the selected door style.
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ec-w">Width (in)</Label>
              <Input id="ec-w" inputMode="decimal" value={form.width} onChange={(e) => set("width", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ec-h">Height (in)</Label>
              <Input id="ec-h" inputMode="decimal" value={form.height} onChange={(e) => set("height", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ec-d">Depth (in)</Label>
              <Input id="ec-d" inputMode="decimal" value={form.depth} onChange={(e) => set("depth", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ec-reason">Review note</Label>
            <Textarea
              id="ec-reason"
              rows={2}
              value={form.conflictReason}
              onChange={(e) => set("conflictReason", e.target.value)}
              placeholder="Why is this held / what was fixed?"
            />
          </div>

          {/* ── SKU Pricing Section ── */}
          {skus.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold">
                    Captured Pricing &amp; SKU Data
                    <span className="ml-2 text-xs font-normal text-muted-foreground">({skus.length} SKU{skus.length !== 1 ? "s" : ""})</span>
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Edit prices directly here. Changes are saved when you click Save or Save &amp; Clear.
                </p>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {skus.map((sku) => {
                    const avail = skuAvailability[sku.skuId];
                    const mergedSku = avail ? { ...sku, ...avail } : sku;
                    return (
                      <SkuPricingRow
                        key={sku.skuId}
                        sku={mergedSku}
                        edits={skuPriceEdits[sku.skuId]}
                        onChange={handlePriceChange}
                        onToggleAvailable={handleToggleAvailable}
                        onTogglePublished={handleTogglePublished}
                        isSaving={isSaving}
                      />
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={isSaving || invalid}
          >
            {isSaving ? <Spinner className="h-4 w-4 mr-1" /> : null}
            Save changes
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={isSaving || invalid}
            className="gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            Save &amp; clear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add New Dialog ───────────────────────────────────────────────────────────
function AddNewConflictDialog({
  open,
  onOpenChange,
  categoryOptions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryOptions: string[];
}) {
  const utils = trpc.useUtils();
  const empty: NewForm = {
    masterCode: "",
    description: "",
    category: "",
    subCategory: "",
    width: "",
    height: "",
    depth: "",
    conflictReason: "",
  };
  const [form, setForm] = useState<NewForm>(empty);
  const [customCat, setCustomCat] = useState(false);

  const create = trpc.cabinets.createConflict.useMutation({
    onSuccess: () => {
      utils.cabinets.conflicts.invalidate();
      utils.cabinets.allCategories.invalidate();
      onOpenChange(false);
      setForm(empty);
      toast.success("New cabinet added to conflicts for review.");
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof NewForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const invalid =
    form.masterCode.trim() === "" ||
    form.description.trim() === "" ||
    form.category.trim() === "";

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setForm(empty); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Cabinet (Conflict Review)</DialogTitle>
          <DialogDescription>
            Manually add a cabinet to the conflict queue. It will be hidden from the public until
            you review and clear it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="nc-code">Master Code <span className="text-destructive">*</span></Label>
            <Input
              id="nc-code"
              value={form.masterCode}
              onChange={(e) => set("masterCode", e.target.value.toUpperCase())}
              placeholder="e.g. B-24, WF-3, TF-18"
              className="font-mono"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nc-desc">Description <span className="text-destructive">*</span></Label>
            <Input
              id="nc-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. Base Cabinet 24W"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nc-cat">Category <span className="text-destructive">*</span></Label>
              {customCat ? (
                <div className="flex gap-1.5">
                  <Input
                    id="nc-cat"
                    value={form.category}
                    onChange={(e) => set("category", e.target.value)}
                    placeholder="New category name"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setCustomCat(false); set("category", ""); }}
                  >
                    List
                  </Button>
                </div>
              ) : (
                <Select
                  value={categoryOptions.includes(form.category) ? form.category : ""}
                  onValueChange={(v) => {
                    if (v === CUSTOM_CATEGORY) { setCustomCat(true); set("category", ""); }
                    else set("category", v);
                  }}
                >
                  <SelectTrigger id="nc-cat">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_CATEGORY}>+ New category…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nc-sub">Sub-category</Label>
              <Input id="nc-sub" value={form.subCategory} onChange={(e) => set("subCategory", e.target.value)} placeholder="—" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nc-w">Width (in)</Label>
              <Input id="nc-w" inputMode="decimal" value={form.width} onChange={(e) => set("width", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nc-h">Height (in)</Label>
              <Input id="nc-h" inputMode="decimal" value={form.height} onChange={(e) => set("height", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nc-d">Depth (in)</Label>
              <Input id="nc-d" inputMode="decimal" value={form.depth} onChange={(e) => set("depth", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nc-reason">Review note</Label>
            <Textarea
              id="nc-reason"
              rows={2}
              value={form.conflictReason}
              onChange={(e) => set("conflictReason", e.target.value)}
              placeholder="Why is this held / what needs review?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate(form)} disabled={create.isPending || invalid}>
            {create.isPending ? <Spinner className="h-4 w-4 mr-1" /> : null}
            Add to conflicts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pending SKUs Section ─────────────────────────────────────────────────────
type PendingItem = {
  id: number;
  rawCode: string;
  distributorId: number;
  distributorName: string | null;
  pricesJson: string;
  createdAt: Date;
};

function PendingSkusSection() {
  const utils = trpc.useUtils();
  const { data: pending } = trpc.distributorAdmin.listPendingSkus.useQuery({ status: "pending" });
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");

  const resolve = trpc.distributorAdmin.resolvePendingSku.useMutation({
    onSuccess: (_, vars) => {
      utils.distributorAdmin.listPendingSkus.invalidate();
      setInputs((prev) => { const n = { ...prev }; delete n[vars.pendingId]; return n; });
      toast.success("SKU assigned successfully.");
    },
    onError: (e) => toast.error(e.message),
  });

  const ignore = trpc.distributorAdmin.ignorePendingSku.useMutation({
    onSuccess: () => utils.distributorAdmin.listPendingSkus.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!pending) return [];
    if (!search.trim()) return pending as PendingItem[];
    const q = search.toLowerCase();
    return (pending as PendingItem[]).filter(
      (item) =>
        item.rawCode.toLowerCase().includes(q) ||
        (item.distributorName ?? "").toLowerCase().includes(q),
    );
  }, [pending, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by code or distributor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        {search && (
          <span className="text-sm text-muted-foreground">{filtered.length} of {pending?.length ?? 0}</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        These cabinet codes were not found in the master catalog during import. Type the master code or alias they should map to, then click Assign.
      </p>
      {filtered.map((item: PendingItem) => (
        <Card key={item.id} className="border-amber-200 dark:border-amber-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-semibold text-sm">{item.rawCode}</span>
                  <Badge variant="outline" className="text-xs">{item.distributorName ?? `Dist #${item.distributorId}`}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  {Object.keys(JSON.parse(item.pricesJson)).length} style(s) pending · imported {new Date(item.createdAt).toLocaleDateString()}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Master code or alias (e.g. DB12-3)"
                    value={inputs[item.id] ?? ""}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="h-8 text-sm max-w-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && inputs[item.id]?.trim()) {
                        resolve.mutate({ pendingId: item.id, masterCodeOrAlias: inputs[item.id].trim() });
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="gap-1.5 h-8"
                    disabled={!inputs[item.id]?.trim() || resolve.isPending}
                    onClick={() => resolve.mutate({ pendingId: item.id, masterCodeOrAlias: inputs[item.id].trim() })}
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
  const { data: categoryOptions } = trpc.cabinets.allCategories.useQuery();
  const [editing, setEditing] = useState<ConflictItem | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);

  const clear = trpc.cabinets.clearConflict.useMutation({
    onSuccess: () => {
      utils.cabinets.conflicts.invalidate();
      toast.success("Conflict cleared — product is live again.");
    },
    onError: (e) => toast.error(e.message),
  });

  const items = (data ?? []) as ConflictItem[];

  // Derive unique categories from the conflict items for the filter dropdown
  const conflictCategories = useMemo(
    () => Array.from(new Set(items.map((c) => c.category).filter(Boolean))).sort(),
    [items]
  );

  const filtered = useMemo(() => {
    let result = items;
    if (categoryFilter !== ALL_CATEGORIES) {
      result = result.filter((c) => c.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.masterCode.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.distributorNames.some((d) => d.toLowerCase().includes(q)) ||
          c.doorStyleNames.some((s) => s.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, search, categoryFilter]);

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
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

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

      {/* Search + Filter + Add New toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by code, description, distributor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {conflictCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(search || categoryFilter !== ALL_CATEGORIES) && (
          <span className="text-sm text-muted-foreground">
            {filtered.length} of {items.length}
          </span>
        )}
        <div className="ml-auto">
          <Button size="sm" className="gap-1.5 h-9" onClick={() => setAddingNew(true)}>
            <Plus className="h-4 w-4" />
            Add New
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No products in conflict. Everything is live.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No conflicts match your search.
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base font-mono">{c.masterCode}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{c.category}</Badge>
                    <Badge variant="destructive">Conflict</Badge>
                  </div>
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
                  <span>
                    <span className="font-medium text-foreground">Door style:</span>{" "}
                    {c.doorStyleNames.length ? c.doorStyleNames.join(", ") : "—"}
                  </span>
                </div>
                {/* Quick price preview from first SKU */}
                {c.skus && c.skus.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
                    <span><span className="font-medium text-foreground">List:</span> {fmtMoney(c.skus[0].listPrice)}</span>
                    <span><span className="font-medium text-foreground">Cost:</span> {fmtMoney(c.skus[0].yourCost)}</span>
                    <span><span className="font-medium text-foreground">Wholesale:</span> {fmtMoney(c.skus[0].wholesalePrice)}</span>
                    <span><span className="font-medium text-foreground">Contractor:</span> {fmtMoney(c.skus[0].contractorPrice)}</span>
                    <span><span className="font-medium text-foreground">Homeowner:</span> {fmtMoney(c.skus[0].homeownerPrice)}</span>
                    {c.skuCount > 1 && <span className="text-muted-foreground italic">+{c.skuCount - 1} more SKU{c.skuCount > 2 ? "s" : ""}</span>}
                  </div>
                )}
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
                    Edit
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

      <AddNewConflictDialog
        open={addingNew}
        onOpenChange={setAddingNew}
        categoryOptions={categoryOptions ?? []}
      />
    </div>
  );
}
